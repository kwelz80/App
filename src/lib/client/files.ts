import type { FilePayload } from "@/lib/schemas";

// Most hosts cap request bodies (Vercel: 4.5 MB). Base64 adds about a third.
export const MAX_UPLOAD_BYTES = (Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 4) * 1024 * 1024;

export const ACCEPT = "image/*,.pdf,.docx,.txt,.md,.csv";

const MAX_IMAGE_EDGE = 1600;

const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
};

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
}

/** Scales photos down and re-encodes as JPEG so uploads stay small. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Couldn't open "${file.name}". Try a JPG or PNG.`));
      el.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function toPayload(file: File): Promise<FilePayload & { preview?: string }> {
  if (file.type.startsWith("image/")) {
    const dataUrl = await shrinkImage(file);
    return { name: file.name, type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = EXT_TYPES[ext] || file.type;
  if (!Object.values(EXT_TYPES).includes(type)) {
    throw new Error(`"${file.name}" isn't supported. Use PDF, Word (.docx), images, or text files.`);
  }
  const dataUrl = await readDataUrl(file);
  return { name: file.name, type, data: dataUrl.split(",")[1] };
}

export function payloadSize(files: FilePayload[]): number {
  return files.reduce((n, f) => n + f.data.length, 0);
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
