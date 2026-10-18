"use client";

import { Download, Printer } from "lucide-react";
import { useEffect, useRef } from "react";
import { useStream } from "@/lib/client/useStream";
import type { Tool } from "@/lib/tools";
import { Markdown } from "../Markdown";
import { Button, Card, CopyButton, ErrorBox, Spinner, cx } from "../ui";
import { ToolInput, wordsLabel } from "./ToolInput";

const PLAIN_OUTPUT = new Set(["ai-paraphraser", "ai-humanizer"]);
const PRINTABLE = new Set(["ai-study-guide-maker", "ai-cheat-sheet-maker", "ai-exam-predictor", "essay-writer"]);

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function GenerateTool({ tool }: { tool: Tool }) {
  const stream = useStream();
  const plain = PLAIN_OUTPUT.has(tool.slug);
  const dense = tool.slug === "ai-cheat-sheet-maker";
  const output = stream.text;
  const resultRef = useRef<HTMLDivElement>(null);

  // On phones the result card sits below the form, so bring it into view.
  useEffect(() => {
    if (stream.loading && !plain && window.innerWidth < 1024) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stream.loading, plain]);

  return (
    <div className={cx("grid gap-6", plain && "lg:grid-cols-2")}>
      <ToolInput
        tool={tool}
        loading={stream.loading}
        onSubmit={(s) => stream.run("/api/generate", s)}
        onStop={stream.stop}
        rows={plain ? 14 : 8}
      />

      {(output || stream.loading || stream.error || plain) && (
        <div ref={resultRef} className="min-w-0 scroll-mt-20">
          <Card className="print-area min-w-0">
            <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Result</h2>
              {output && !stream.loading && (
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={output} />
                  {!plain && (
                    <Button variant="secondary" size="sm" onClick={() => download(`${tool.slug}.md`, output)}>
                      <Download className="size-4" aria-hidden />
                      Download
                    </Button>
                  )}
                  {PRINTABLE.has(tool.slug) && (
                    <Button variant="secondary" size="sm" onClick={() => window.print()}>
                      <Printer className="size-4" aria-hidden />
                      Print / PDF
                    </Button>
                  )}
                </div>
              )}
            </div>
            {stream.status && <p className="no-print mb-3 text-sm text-slate-500">{stream.status}</p>}
            {stream.loading && !output && !stream.status && <Spinner label="Writing…" />}
            {output &&
              (plain ? (
                <>
                  <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{output}</div>
                  <p className="mt-2 text-right text-xs text-slate-400">{wordsLabel(output)}</p>
                </>
              ) : (
                <div className={dense ? "print-dense" : undefined}>
                  <Markdown className={dense ? "prose-sm" : undefined}>{output}</Markdown>
                </div>
              ))}
            {!output && !stream.loading && !stream.error && <p className="text-sm text-slate-400">Your result will appear here.</p>}
            {stream.error && (
              <div className="mt-3">
                <ErrorBox message={stream.error} />
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
