import { baseParams, ndjsonResponse, streamMessage, webSearchTool } from "@/lib/server/anthropic";
import { guard, requireApiKey } from "@/lib/server/guard";
import { generateSpec } from "@/lib/server/prompts";
import { readToolRequest, userContent } from "@/lib/server/request";

export const maxDuration = 300;

export async function POST(req: Request) {
  const blocked = guard(req) ?? requireApiKey();
  if (blocked) return blocked;

  const r = await readToolRequest(req, (t) => t.kind === "generate" || t.kind === "notes");
  if (r instanceof Response) return r;

  const spec = generateSpec(r.tool, r.opts);
  return ndjsonResponse((emit, signal) =>
    streamMessage(
      {
        ...baseParams(spec.effort),
        max_tokens: 32000,
        system: spec.system,
        messages: [{ role: "user", content: userContent(r, spec.instructions) }],
        ...(spec.webSearch ? { tools: [webSearchTool(6)] } : {}),
      },
      emit,
      signal,
    ),
  );
}
