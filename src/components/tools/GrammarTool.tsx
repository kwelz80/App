"use client";

import { ArrowRight, Check, X } from "lucide-react";
import { useState } from "react";
import { useJson } from "@/lib/client/useJson";
import type { Grammar } from "@/lib/schemas";
import type { Tool } from "@/lib/tools";
import { Button, Card, CopyButton, ErrorBox, Spinner, cx } from "../ui";
import { Highlighted, locate } from "./highlight";
import { ToolInput, useScrollOnMount } from "./ToolInput";

const TYPE_STYLE: Record<Grammar["issues"][number]["type"], string> = {
  grammar: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  spelling: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  punctuation: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  word_choice: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  style: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  clarity: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

export function GrammarTool({ tool }: { tool: Tool }) {
  const job = useJson<Grammar>();
  const [original, setOriginal] = useState("");
  return (
    <div className="space-y-6">
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
          <Spinner label="Checking your writing…" />
        </Card>
      )}
      <ErrorBox message={job.error} />
      {job.data && <GrammarResult key={original + job.data.issues.length} result={job.data} original={original} />}
    </div>
  );
}

type IssueState = "open" | "accepted" | "dismissed";

function GrammarResult({ result, original }: { result: Grammar; original: string }) {
  const top = useScrollOnMount<HTMLDivElement>();
  const [text, setText] = useState(original);
  const [state, setState] = useState<IssueState[]>(() => result.issues.map(() => "open"));

  const open = result.issues.map((iss, i) => ({ iss, i })).filter(({ i }) => state[i] === "open");
  const spans = locate(text, open.map(({ iss, i }) => ({ key: String(i), text: iss.original })));

  function accept(i: number) {
    const iss = result.issues[i];
    const idx = text.indexOf(iss.original);
    if (idx >= 0) setText(text.slice(0, idx) + iss.replacement + text.slice(idx + iss.original.length));
    setState((s) => s.map((v, j) => (j === i ? "accepted" : v)));
  }

  function acceptAll() {
    const untouched = state.every((s) => s === "open");
    if (untouched) {
      setText(result.corrected_text);
    } else {
      let t = text;
      for (const { iss } of open) {
        const idx = t.indexOf(iss.original);
        if (idx >= 0) t = t.slice(0, idx) + iss.replacement + t.slice(idx + iss.original.length);
      }
      setText(t);
    }
    setState((s) => s.map((v) => (v === "open" ? "accepted" : v)));
  }

  const score = Math.round(result.score);
  const scoreColor = score >= 85 ? "text-emerald-600" : score >= 65 ? "text-amber-600" : "text-red-600";

  return (
    <div ref={top} className="grid scroll-mt-20 gap-6 lg:grid-cols-[1fr_380px]">
      <Card className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Your text</h2>
          <div className="flex gap-2">
            {open.length > 0 && (
              <Button size="sm" onClick={acceptAll}>
                Accept all ({open.length})
              </Button>
            )}
            <CopyButton text={text} label="Copy text" />
          </div>
        </div>
        <Highlighted
          text={text}
          spans={spans}
          wrap={(content, span) => {
            const iss = result.issues[Number(span.key)];
            return (
              <mark
                key={span.key}
                title={`${iss.replacement ? `→ ${iss.replacement}` : "Remove"} · ${iss.explanation}`}
                className="rounded bg-transparent underline decoration-red-500 decoration-wavy decoration-2 underline-offset-4 dark:text-inherit"
              >
                {content}
              </mark>
            );
          }}
        />
      </Card>

      <div className="space-y-4">
        <Card>
          <div className="flex items-baseline gap-3">
            <span className={cx("text-4xl font-bold", scoreColor)}>{score}</span>
            <span className="text-sm text-slate-500">/ 100 writing score</span>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{result.summary}</p>
          <p className="mt-2 text-sm text-slate-500">
            {result.issues.length === 0 ? "No issues found." : `${open.length} of ${result.issues.length} suggestions left`}
          </p>
        </Card>

        {result.issues.map((iss, i) =>
          state[i] !== "open" ? null : (
            <Card key={i} className="space-y-2 p-4!">
              <span className={cx("inline-block rounded px-2 py-0.5 text-xs font-medium capitalize", TYPE_STYLE[iss.type])}>
                {iss.type.replace("_", " ")}
              </span>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-red-600 line-through decoration-red-400">{iss.original}</span>
                <ArrowRight className="size-3.5 text-slate-400" aria-hidden />
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{iss.replacement || "(remove)"}</span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400">{iss.explanation}</p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={() => accept(i)}>
                  <Check className="size-3.5" aria-hidden />
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setState((s) => s.map((v, j) => (j === i ? "dismissed" : v)))}>
                  <X className="size-3.5" aria-hidden />
                  Dismiss
                </Button>
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
