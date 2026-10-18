"use client";

import { Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FilePayload } from "@/lib/schemas";
import type { Tool } from "@/lib/tools";
import { FileInput, type Attachment } from "../FileInput";
import { Button, Card, ErrorBox, OptionFields, cx, defaultOptions, inputClass, type OptionValues } from "../ui";

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
export const wordsLabel = (s: string) => {
  const n = wordCount(s);
  return `${n.toLocaleString()} word${n === 1 ? "" : "s"}`;
};

/** Scrolls an element into view once, when it first renders. */
export function useScrollOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  return ref;
}

export interface ToolSubmission {
  slug: string;
  text: string;
  options: OptionValues;
  files: FilePayload[];
}

/** The standard input panel: optional topic, text, files, options, and submit. */
export function ToolInput({
  tool,
  loading,
  onSubmit,
  onStop,
  rows = 8,
  className,
}: {
  tool: Tool;
  loading: boolean;
  onSubmit: (s: ToolSubmission) => void;
  onStop?: () => void;
  rows?: number;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [options, setOptions] = useState<OptionValues>(() => defaultOptions(tool.fields));
  const [error, setError] = useState("");

  const hasTopic = typeof options.topic === "string" && options.topic.trim() !== "";

  function submit() {
    if (!text.trim() && !files.length && !hasTopic) {
      setError(tool.acceptFiles ? "Add some text or upload a file first." : "Add some text first.");
      return;
    }
    setError("");
    onSubmit({ slug: tool.slug, text, options, files: files.map(({ name, type, data }) => ({ name, type, data })) });
  }

  return (
    <Card className={cx("no-print space-y-4", className)}>
      <OptionFields fields={tool.fields} values={options} onChange={setOptions} only={["text"]} />
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor="tool-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {tool.inputLabel ?? "Input"}
            {tool.inputOptional && <span className="font-normal text-slate-400"> (or upload a file)</span>}
          </label>
          {tool.sample && !text && (
            <button
              type="button"
              onClick={() => setText(tool.sample!)}
              className="text-sm text-brand-600 hover:underline dark:text-brand-200"
            >
              Try a sample
            </button>
          )}
        </div>
        <textarea
          id="tool-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tool.inputPlaceholder}
          rows={rows}
          className={cx(inputClass, "resize-y leading-relaxed")}
        />
        <p className="mt-1 text-right text-xs text-slate-400">{wordsLabel(text)}</p>
      </div>
      {tool.acceptFiles && <FileInput files={files} onChange={setFiles} onError={setError} />}
      <OptionFields fields={tool.fields} values={options} onChange={setOptions} only={["select", "toggle"]} />
      <ErrorBox message={error} />
      <div className="flex gap-2">
        <Button onClick={submit} loading={loading} size="lg" className="flex-1 sm:flex-none">
          {tool.submitLabel ?? "Generate"}
        </Button>
        {loading && onStop && (
          <Button variant="secondary" size="lg" onClick={onStop}>
            <Square className="size-4" aria-hidden />
            Stop
          </Button>
        )}
      </div>
    </Card>
  );
}
