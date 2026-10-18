import "server-only";
import { z } from "zod";
import { FilePayloadSchema } from "@/lib/schemas";
import { getTool, type Tool } from "@/lib/tools";
import { FileError, MAX_FILES, filesToBlocks } from "./files";
import { jsonError } from "./guard";
import { sanitizeOptions, type Options } from "./prompts";
import type Anthropic from "@anthropic-ai/sdk";

export const MAX_INPUT_CHARS = 120_000;

const ToolBody = z.object({
  slug: z.string(),
  text: z.string().max(MAX_INPUT_CHARS, "That text is too long. Shorten it or split it up.").default(""),
  options: z.record(z.string(), z.unknown()).optional(),
  files: z.array(FilePayloadSchema).max(MAX_FILES).optional(),
});

export interface ToolRequest {
  tool: Tool;
  opts: Options;
  text: string;
  fileBlocks: Anthropic.Beta.BetaContentBlockParam[];
}

/** Parses and validates a single-shot tool request. Returns a Response on failure. */
export async function readToolRequest(req: Request, accepts: (tool: Tool) => boolean): Promise<ToolRequest | Response> {
  let body: z.infer<typeof ToolBody>;
  try {
    body = ToolBody.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : undefined;
    return jsonError(400, msg || "Invalid request.");
  }
  const tool = getTool(body.slug);
  if (!tool || !accepts(tool)) return jsonError(404, "Unknown tool.");

  const opts = sanitizeOptions(tool, body.options);
  let fileBlocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  try {
    fileBlocks = await filesToBlocks(tool.acceptFiles ? body.files : undefined);
  } catch (err) {
    if (err instanceof FileError) return jsonError(400, err.message);
    throw err;
  }

  const text = body.text.trim();
  if (!text && !fileBlocks.length && !(typeof opts.topic === "string" && opts.topic)) {
    return jsonError(400, tool.acceptFiles ? "Add some text or upload a file first." : "Add some text first.");
  }
  return { tool, opts, text, fileBlocks };
}

/** The user turn: attached documents first, then instructions and the pasted material. */
export function userContent(r: ToolRequest, instructions: string): Anthropic.Beta.BetaContentBlockParam[] {
  return [
    ...r.fileBlocks,
    { type: "text", text: `${instructions}\n\n<material>\n${r.text || "(none)"}\n</material>` },
  ];
}
