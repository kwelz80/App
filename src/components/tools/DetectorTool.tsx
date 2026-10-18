"use client";

import { useMemo, useState } from "react";
import { useJson } from "@/lib/client/useJson";
import type { Detector } from "@/lib/schemas";
import type { Tool } from "@/lib/tools";
import { Card, ErrorBox, Notice, Spinner, cx } from "../ui";
import { Highlighted, locate } from "./highlight";
import { ToolInput, useScrollOnMount } from "./ToolInput";

const VERDICT: Record<Detector["verdict"], { label: string; color: string }> = {
  likely_human: { label: "Likely human-written", color: "text-emerald-600" },
  mixed: { label: "Mixed or unclear", color: "text-amber-600" },
  likely_ai: { label: "Likely AI-generated", color: "text-red-600" },
  too_short: { label: "Too short to judge", color: "text-slate-500" },
};

const SENTENCE_BG: Record<Detector["sentences"][number]["likelihood"], string> = {
  low: "",
  medium: "bg-amber-100 dark:bg-amber-900/40",
  high: "bg-red-200 dark:bg-red-900/50",
};

export function DetectorTool({ tool }: { tool: Tool }) {
  const job = useJson<Detector>();
  const [original, setOriginal] = useState("");
  return (
    <div className="space-y-6">
      <Notice>
        No AI detector is reliable, including this one. It can flag human writing, especially from English learners or in
        formulaic assignments. Don&apos;t use a score as proof of cheating. Use it to start a conversation.
      </Notice>
      <ToolInput
        tool={tool}
        loading={job.loading}
        onSubmit={(s) => {
          setOriginal(s.text);
          job.run("/api/json", s);
        }}
        onStop={job.stop}
      />
      {job.loading && (
        <Card>
          <Spinner label="Analyzing…" />
        </Card>
      )}
      <ErrorBox message={job.error} />
      {job.data && <DetectorResult result={job.data} text={original} />}
    </div>
  );
}

function DetectorResult({ result, text }: { result: Detector; text: string }) {
  const top = useScrollOnMount<HTMLDivElement>();
  const v = VERDICT[result.verdict];
  const pct = Math.max(0, Math.min(100, Math.round(result.ai_probability)));
  const flagged = result.sentences.filter((s) => s.likelihood !== "low");
  const spans = useMemo(
    () => locate(text, result.sentences.map((s, i) => ({ key: String(i), text: s.text }))),
    [text, result.sentences],
  );

  return (
    <div ref={top} className="grid scroll-mt-20 gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">Estimated AI likelihood</p>
          <p className={cx("text-5xl font-bold", v.color)}>{result.verdict === "too_short" ? "—" : `${pct}%`}</p>
          <p className={cx("mt-1 font-semibold", v.color)}>{v.label}</p>
          <p className="text-sm text-slate-500">Confidence: {result.confidence}</p>
        </div>
        {result.verdict !== "too_short" && (
          <div className="h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500">
            <div className="relative h-full" style={{ marginLeft: `calc(${pct}% - 6px)` }}>
              <div className="h-full w-3 rounded-full bg-white ring-2 ring-slate-800" />
            </div>
          </div>
        )}
        <p className="text-sm text-slate-600 dark:text-slate-300">{result.summary}</p>
        <ul className="space-y-2">
          {result.signals.map((s, i) => (
            <li key={i} className="text-sm">
              <span
                className={cx(
                  "mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium",
                  s.direction === "ai"
                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                )}
              >
                {s.direction === "ai" ? "AI-like" : "Human-like"}
              </span>
              <span className="font-medium">{s.label}.</span>{" "}
              <span className="text-slate-600 dark:text-slate-400">{s.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Sentence view</h2>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="size-3 rounded bg-red-200 dark:bg-red-900/50" /> More AI-like
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 rounded bg-amber-100 dark:bg-amber-900/40" /> Somewhat
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {flagged.length} of {result.sentences.length} sentences flagged.
        </p>
        <Highlighted
          text={text}
          spans={spans}
          wrap={(content, span) => {
            const s = result.sentences[Number(span.key)];
            return (
              <span key={span.key} className={cx("rounded-sm", SENTENCE_BG[s.likelihood])}>
                {content}
              </span>
            );
          }}
        />
      </Card>
    </div>
  );
}
