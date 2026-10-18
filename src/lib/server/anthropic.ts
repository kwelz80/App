import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Models that accept server-side refusal fallbacks with the "default" routing.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let client: Anthropic | undefined;
export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Model, effort, and refusal fallback settings shared by every request. */
export function baseParams(effort: Effort) {
  const fallback = FALLBACK_MODELS.has(MODEL)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
  return { model: MODEL, ...fallback, output_config: { effort } };
}

export const webSearchTool = (maxUses: number): Anthropic.Beta.BetaWebSearchTool20260209 => ({
  type: "web_search_20260209",
  name: "web_search",
  max_uses: maxUses,
});

// ---------- NDJSON streaming to the browser ----------

export type StreamEvent =
  | { t: "text"; v: string }
  | { t: "status"; v: string }
  | { t: "error"; v: string }
  | { t: "done"; stop: string | null };

type Emit = (e: StreamEvent) => void;

export function ndjsonResponse(run: (emit: Emit, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit = (e) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await run(emit, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) emit({ t: "error", v: friendlyError(err) });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by a disconnect
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Streams a message's text to the browser. Resumes server-tool turns that pause
 * (`pause_turn`) and reports refusals and truncation.
 */
export async function streamMessage(
  params: Anthropic.Beta.MessageCreateParamsStreaming | Omit<Anthropic.Beta.MessageCreateParamsStreaming, "stream">,
  emit: Emit,
  signal: AbortSignal,
): Promise<void> {
  let messages = params.messages;
  for (let turn = 0; turn < 5; turn++) {
    const stream = anthropic().beta.messages.stream({ ...params, messages }, { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        emit({ t: "text", v: event.delta.text });
      } else if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        emit({ t: "status", v: "Searching the web for sources…" });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: final.content }];
      continue;
    }
    if (final.stop_reason === "refusal") {
      emit({ t: "error", v: "The AI declined this request. Try rephrasing it." });
    } else if (final.stop_reason === "max_tokens") {
      emit({ t: "status", v: "The answer hit the length limit and was cut off. Ask it to continue." });
    }
    emit({ t: "done", stop: final.stop_reason });
    return;
  }
  emit({ t: "done", stop: "pause_turn" });
}

export function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "The server's Anthropic API key was rejected. The site owner needs to update ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "The server's API key doesn't have access to this model or feature.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI service is busy right now. Wait a minute and try again.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    const msg = err.message || "";
    if (/credit balance/i.test(msg)) return "The site's Anthropic account is out of credits.";
    if (/too long|too large|exceed/i.test(msg)) return "That input is too large. Use a shorter text or a smaller file.";
    return `The request was rejected: ${msg}`;
  }
  if (err instanceof Anthropic.InternalServerError) {
    return "The AI service had an error. Try again in a moment.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return `AI service error (${err.status ?? "unknown"}). Try again.`;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
