import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { FilePayload } from "@/lib/schemas";

type Block = Anthropic.Beta.BetaContentBlockParam;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "text/html", "application/json"]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const MAX_FILES = 6;
const MAX_TEXT_CHARS = 400_000;

export class FileError extends Error {}

function isTextLike(f: FilePayload) {
  return TEXT_TYPES.has(f.type) || /\.(txt|md|csv|tsv|json|html?)$/i.test(f.name);
}

/** Turns browser uploads into Claude content blocks. Documents go first, as the API recommends. */
export async function filesToBlocks(files: FilePayload[] | undefined): Promise<Block[]> {
  if (!files?.length) return [];
  if (files.length > MAX_FILES) throw new FileError(`Attach at most ${MAX_FILES} files.`);

  const blocks: Block[] = [];
  for (const f of files) {
    const data = f.data.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
    if (IMAGE_TYPES.has(f.type)) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: f.type as "image/jpeg", data },
      });
    } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
        title: f.name,
      });
    } else if (f.type === DOCX || /\.docx$/i.test(f.name)) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data, "base64") });
      blocks.push(textDoc(f.name, value));
    } else if (isTextLike(f)) {
      blocks.push(textDoc(f.name, Buffer.from(data, "base64").toString("utf8")));
    } else {
      throw new FileError(
        `"${f.name}" isn't supported. Use PDF, Word (.docx), images, or text files. Export slides to PDF first.`,
      );
    }
  }
  return blocks;
}

function textDoc(name: string, text: string): Block {
  const trimmed = text.trim();
  if (!trimmed) throw new FileError(`"${name}" has no readable text.`);
  if (trimmed.length > MAX_TEXT_CHARS) throw new FileError(`"${name}" is too long. Split it into smaller files.`);
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: trimmed },
    title: name,
  };
}
