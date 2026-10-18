import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { FilePayloadSchema } from "@/lib/schemas";
import { baseParams, ndjsonResponse, streamMessage } from "@/lib/server/anthropic";
import { FileError, filesToBlocks } from "@/lib/server/files";
import { guard, jsonError, requireApiKey } from "@/lib/server/guard";
import { chatSystem, sanitizeOptions } from "@/lib/server/prompts";
import { getTool } from "@/lib/tools";

export const maxDuration = 300;

const Body = z.object({
  slug: z.string(),
  options: z.record(z.string(), z.unknown()).optional(),
  context: z.string().max(200_000, "Those notes are too long to chat about.").optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(60_000, "That message is too long."),
        files: z.array(FilePayloadSchema).max(6).optional(),
      }),
    )
    .min(1)
    .max(60, "This conversation is very long. Start a new one."),
});

export async function POST(req: Request) {
  const blocked = guard(req) ?? requireApiKey();
  if (blocked) return blocked;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : undefined;
    return jsonError(400, msg || "Invalid request.");
  }
  const tool = getTool(body.slug);
  if (!tool || (tool.kind !== "chat" && tool.kind !== "notes")) return jsonError(404, "Unknown tool.");
  if (body.messages[0].role !== "user" || body.messages.at(-1)?.role !== "user") {
    return jsonError(400, "Invalid conversation.");
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  try {
    for (const m of body.messages) {
      if (m.role === "assistant") {
        messages.push({ role: "assistant", content: m.content || "(no answer)" });
        continue;
      }
      const files = await filesToBlocks(m.files);
      const text = m.content.trim() || (files.length ? "Please solve this." : "");
      if (!text) return jsonError(400, "Type a question or attach a file.");
      messages.push({ role: "user", content: [...files, { type: "text", text }] });
    }
  } catch (err) {
    if (err instanceof FileError) return jsonError(400, err.message);
    throw err;
  }

  const opts = sanitizeOptions(tool, body.options);
  const tutorMode = opts.mode === "tutor";
  return ndjsonResponse((emit, signal) =>
    streamMessage(
      {
        ...baseParams(tutorMode ? "medium" : "high"),
        max_tokens: 32000,
        cache_control: { type: "ephemeral" },
        system: chatSystem(tool, opts, body.context),
        messages,
      },
      emit,
      signal,
    ),
  );
}
