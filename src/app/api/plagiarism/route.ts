import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { PlagiarismSchema } from "@/lib/schemas";
import { anthropic, baseParams, friendlyError, webSearchTool } from "@/lib/server/anthropic";
import { guard, jsonError, requireApiKey } from "@/lib/server/guard";
import {
  PLAGIARISM_FORMAT_INSTRUCTIONS,
  PLAGIARISM_SEARCH_INSTRUCTIONS,
  PLAGIARISM_SEARCH_SYSTEM,
} from "@/lib/server/prompts";
import { readToolRequest, userContent } from "@/lib/server/request";

export const maxDuration = 300;

const MAX_CHARS = 12_000;

export async function POST(req: Request) {
  const blocked = guard(req, { cost: 3 }) ?? requireApiKey();
  if (blocked) return blocked;

  const r = await readToolRequest(req, (t) => t.kind === "plagiarism");
  if (r instanceof Response) return r;
  if (r.text.length > MAX_CHARS) return jsonError(400, "Check up to about 1,500 words at a time.");

  try {
    // Step 1: search the web for distinctive phrases and write up what matched.
    const base = baseParams("medium");
    let messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: userContent(r, PLAGIARISM_SEARCH_INSTRUCTIONS) },
    ];
    let report = "";
    for (let turn = 0; turn < 5; turn++) {
      const res = await anthropic().beta.messages.create({
        ...base,
        max_tokens: 12000,
        system: PLAGIARISM_SEARCH_SYSTEM,
        tools: [webSearchTool(6)],
        messages,
      });
      report += res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      if (res.stop_reason === "refusal") return jsonError(422, "The AI declined to check this text.");
      if (res.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: res.content }];
    }

    // Step 2: turn the report into structured results.
    const fmt = baseParams("low");
    const parsed = await anthropic().beta.messages.parse({
      ...fmt,
      output_config: { ...fmt.output_config, format: betaZodOutputFormat(PlagiarismSchema) },
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: `${PLAGIARISM_FORMAT_INSTRUCTIONS}\n\n<submission>\n${r.text}\n</submission>\n\n<report>\n${report || "No report was produced."}\n</report>`,
        },
      ],
    });
    if (!parsed.parsed_output) return jsonError(502, "The checker returned an unexpected result. Try again.");
    return Response.json(parsed.parsed_output);
  } catch (err) {
    console.error(err);
    return jsonError(502, friendlyError(err));
  }
}
