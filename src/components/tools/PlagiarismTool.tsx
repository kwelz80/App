"use client";

import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import { useJson } from "@/lib/client/useJson";
import type { Plagiarism } from "@/lib/schemas";
import type { Tool } from "@/lib/tools";
import { Card, ErrorBox, Notice, Spinner, cx } from "../ui";
import { Highlighted, locate } from "./highlight";
import { ToolInput, useScrollOnMount } from "./ToolInput";

const MATCH_LABEL: Record<Plagiarism["matches"][number]["match_type"], string> = {
  exact: "Exact match",
  near_exact: "Near-exact",
  paraphrase: "Close paraphrase",
};

function safeUrl(u: string): string | undefined {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function PlagiarismTool({ tool }: { tool: Tool }) {
  const job = useJson<Plagiarism>();
  const [original, setOriginal] = useState("");
  return (
    <div className="space-y-6">
      <ToolInput
        tool={tool}
        loading={job.loading}
        onSubmit={(s) => {
          setOriginal(s.text);
          job.run("/api/plagiarism", s);
        }}
        onStop={job.stop}
      />
      {job.loading && (
        <Card>
          <Spinner label="Searching the web for matching passages. This takes up to a minute…" />
        </Card>
      )}
      <ErrorBox message={job.error} />
      {job.data && <PlagiarismResult result={job.data} text={original} />}
    </div>
  );
}

function PlagiarismResult({ result, text }: { result: Plagiarism; text: string }) {
  const top = useScrollOnMount<HTMLDivElement>();
  const spans = useMemo(
    () => locate(text, result.matches.map((m, i) => ({ key: String(i), text: m.excerpt }))),
    [text, result.matches],
  );
  const pct = Math.max(0, Math.min(100, Math.round(result.similarity_percent)));
  const color = pct >= 30 ? "text-red-600" : pct >= 10 ? "text-amber-600" : "text-emerald-600";

  return (
    <div ref={top} className="scroll-mt-20 space-y-6">
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="space-y-3">
          <p className="text-sm text-slate-500">Estimated matching text</p>
          <p className={cx("text-5xl font-bold", color)}>{pct}%</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{result.summary}</p>
          <p className="text-xs text-slate-500">
            {Math.round(result.phrases_checked)} phrase{result.phrases_checked === 1 ? "" : "s"} searched · {result.matches.length} match
            {result.matches.length === 1 ? "" : "es"}
          </p>
        </Card>
        <Card className="min-w-0">
          <h2 className="mb-3 font-semibold">Your text</h2>
          <Highlighted
            text={text}
            spans={spans}
            wrap={(content, span) => (
              <mark key={span.key} className="rounded-sm bg-red-200 px-0.5 dark:bg-red-900/60 dark:text-inherit">
                {content}
                <sup className="ml-0.5 text-xs font-semibold text-red-700 dark:text-red-300">{Number(span.key) + 1}</sup>
              </mark>
            )}
          />
        </Card>
      </div>

      {result.matches.length > 0 && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Sources found</h2>
          <ol className="space-y-4">
            {result.matches.map((m, i) => {
              const href = safeUrl(m.source_url);
              return (
                <li key={i} className="space-y-1 border-b border-slate-200 pb-4 last:border-0 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                      {i + 1}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">{MATCH_LABEL[m.match_type]}</span>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-200">
                        {m.source_title || href}
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-medium">{m.source_title}</span>
                    )}
                  </div>
                  <blockquote className="border-l-2 border-red-300 pl-3 text-sm text-slate-700 italic dark:text-slate-300">“{m.excerpt}”</blockquote>
                  {m.note && <p className="text-sm text-slate-500">{m.note}</p>}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Notice>
        This checker searches the public web for a sample of distinctive phrases. It can&apos;t see paywalled journals, other
        students&apos; papers, or private databases the way Turnitin can. A low score is a good sign, not a guarantee.
      </Notice>
    </div>
  );
}
