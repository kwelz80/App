"use client";

import { FileText, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import type { FilePayload } from "@/lib/schemas";
import { ACCEPT, MAX_UPLOAD_BYTES, formatMb, payloadSize, toPayload } from "@/lib/client/files";
import { cx } from "./ui";

export type Attachment = FilePayload & { preview?: string };

/** Attach button + drop zone + chips. Keeps total upload size under the host limit. */
export function FileInput({
  files,
  onChange,
  onError,
  compact,
  disabled,
}: {
  files: Attachment[];
  onChange: (files: Attachment[]) => void;
  onError: (msg: string) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add(list: FileList | File[]) {
    setBusy(true);
    onError("");
    try {
      const next = [...files];
      for (const f of Array.from(list)) {
        if (next.length >= 6) throw new Error("You can attach up to 6 files.");
        next.push(await toPayload(f));
      }
      if (payloadSize(next) > MAX_UPLOAD_BYTES) {
        throw new Error(
          `Files are too large (limit about ${formatMb(MAX_UPLOAD_BYTES * 0.75)} total). Paste the text instead or use a smaller file.`,
        );
      }
      onChange(next);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't add that file.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      multiple
      className="sr-only"
      onChange={(e) => e.target.files && add(e.target.files)}
      aria-label="Attach files"
      disabled={disabled}
    />
  );

  if (compact) {
    return (
      <>
        {input}
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={disabled || busy}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Attach a photo or file"
          title="Attach a photo or file"
        >
          <Paperclip className={cx("size-5", busy && "animate-pulse")} />
        </button>
      </>
    );
  }

  return (
    <div className="space-y-2">
      {input}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) add(e.dataTransfer.files);
        }}
        className={cx(
          "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition-colors",
          dragging
            ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
            : "border-slate-300 dark:border-slate-700",
        )}
      >
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={disabled || busy}
          className="inline-flex items-center gap-2 font-medium text-brand-600 hover:underline dark:text-brand-200"
        >
          <Paperclip className="size-4" aria-hidden />
          {busy ? "Reading file…" : "Upload files"}
        </button>
        <span className="text-slate-500 dark:text-slate-400">or drag them here · PDF, Word, images, text</span>
      </div>
      <AttachmentChips files={files} onRemove={(i) => onChange(files.filter((_, j) => j !== i))} />
    </div>
  );
}

export function AttachmentChips({ files, onRemove }: { files: Attachment[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-slate-100 py-1 pr-1 pl-1 text-sm dark:bg-slate-800">
          {f.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.preview} alt="" className="size-8 rounded object-cover" />
          ) : (
            <FileText className="ml-1 size-4 text-slate-500" aria-hidden />
          )}
          <span className="max-w-40 truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            aria-label={`Remove ${f.name}`}
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
