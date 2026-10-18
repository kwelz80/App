import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { DetectorSchema, FlashcardsSchema, GrammarSchema, QuizSchema } from "@/lib/schemas";
import { anthropic, baseParams, friendlyError } from "@/lib/server/anthropic";
import { guard, jsonError, requireApiKey } from "@/lib/server/guard";
import { jsonSpec } from "@/lib/server/prompts";
import { readToolRequest, userContent } from "@/lib/server/request";

export const maxDuration = 300;

const SCHEMAS: Record<string, z.ZodType> = {
  "ai-quiz-generator": QuizSchema,
  "ai-flashcard-maker": FlashcardsSchema,
  "grammar-checker": GrammarSchema,
  "ai-detector": DetectorSchema,
};

export async function POST(req: Request) {
  const blocked = guard(req) ?? requireApiKey();
  if (blocked) return blocked;

  const r = await readToolRequest(req, (t) => t.slug in SCHEMAS);
  if (r instanceof Response) return r;

  const spec = jsonSpec(r.tool, r.opts);
  const base = baseParams(spec.effort);
  try {
    const res = await anthropic().beta.messages.parse({
      ...base,
      output_config: { ...base.output_config, format: betaZodOutputFormat(SCHEMAS[r.tool.slug]) },
      max_tokens: 16000,
      system: spec.system,
      messages: [{ role: "user", content: userContent(r, spec.instructions) }],
    });
    if (res.stop_reason === "refusal") return jsonError(422, "The AI declined this request. Try different text.");
    if (res.stop_reason === "max_tokens") return jsonError(422, "The result was too long. Ask for fewer items or use shorter input.");
    if (!res.parsed_output) return jsonError(502, "The AI returned an unexpected result. Try again.");
    return Response.json(res.parsed_output);
  } catch (err) {
    console.error(err);
    return jsonError(502, friendlyError(err));
  }
}
