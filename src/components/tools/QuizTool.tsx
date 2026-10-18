"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useJson } from "@/lib/client/useJson";
import type { Quiz } from "@/lib/schemas";
import type { Tool } from "@/lib/tools";
import { Markdown } from "../Markdown";
import { Button, Card, CopyButton, ErrorBox, Spinner, cx, inputClass } from "../ui";
import { ToolInput, useScrollOnMount } from "./ToolInput";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

function quizAsText(q: Quiz): string {
  return [
    q.title,
    "",
    ...q.questions.flatMap((x, i) => [
      `${i + 1}. ${x.question}`,
      ...x.options.map((o, j) => `   ${String.fromCharCode(65 + j)}. ${o}`),
      "",
    ]),
    "Answer key",
    ...q.questions.map((x, i) => `${i + 1}. ${x.answer}`),
  ].join("\n");
}

function Inline({ children }: { children: string }) {
  return <Markdown className="prose-p:my-0 [&_.katex-display]:my-1">{children}</Markdown>;
}

export function QuizTool({ tool }: { tool: Tool }) {
  const job = useJson<Quiz>();
  return (
    <div className="space-y-6">
      <ToolInput tool={tool} loading={job.loading} onSubmit={(s) => job.run("/api/json", s)} onStop={job.stop} />
      {job.loading && (
        <Card>
          <Spinner label="Writing your quiz…" />
        </Card>
      )}
      <ErrorBox message={job.error} />
      {job.data && <QuizPlayer key={job.data.title + job.data.questions.length} quiz={job.data} />}
    </div>
  );
}

function QuizPlayer({ quiz }: { quiz: Quiz }) {
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [written, setWritten] = useState<Record<number, string>>({});
  const [selfMark, setSelfMark] = useState<Record<number, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const top = useScrollOnMount<HTMLDivElement>();

  const isCorrect = (i: number): boolean | null => {
    const q = quiz.questions[i];
    if (!q.options.length) {
      if (i in selfMark) return selfMark[i];
      const given = norm(written[i] ?? "");
      if (given && given === norm(q.answer)) return true;
      return null;
    }
    return choices[i] === q.correct_index;
  };

  const graded = quiz.questions.map((_, i) => isCorrect(i));
  const score = graded.filter((g) => g === true).length;
  const pending = graded.filter((g) => g === null).length;

  return (
    <Card className="space-y-6">
      <div ref={top} className="flex scroll-mt-20 flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{quiz.title}</h2>
          <p className="text-sm text-slate-500">{quiz.questions.length} questions</p>
        </div>
        <CopyButton text={quizAsText(quiz)} label="Copy quiz + key" />
      </div>

      {submitted && (
        <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:ring-brand-900">
          <p className="text-lg font-semibold">
            Score: {score} / {quiz.questions.length} ({Math.round((score / quiz.questions.length) * 100)}%)
          </p>
          {pending > 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Mark your {pending} short answer{pending > 1 ? "s" : ""} below to finish scoring.
            </p>
          )}
        </div>
      )}

      <ol className="space-y-6">
        {quiz.questions.map((q, i) => {
          const result = submitted ? graded[i] : null;
          return (
            <li key={i} className="space-y-3 border-b border-slate-200 pb-6 last:border-0 dark:border-slate-800">
              <div className="flex items-baseline gap-2 font-medium">
                <span className="shrink-0">{i + 1}.</span>
                <Inline>{q.question}</Inline>
              </div>

              {!q.options.length ? (
                <input
                  className={inputClass}
                  value={written[i] ?? ""}
                  onChange={(e) => setWritten({ ...written, [i]: e.target.value })}
                  disabled={submitted}
                  placeholder="Your answer"
                  aria-label={`Answer to question ${i + 1}`}
                />
              ) : (
                <div className="grid gap-2" role="radiogroup" aria-label={`Question ${i + 1}`}>
                  {q.options.map((opt, j) => {
                    const picked = choices[i] === j;
                    const right = submitted && j === q.correct_index;
                    const wrong = submitted && picked && j !== q.correct_index;
                    return (
                      <label
                        key={j}
                        className={cx(
                          "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 ring-1 transition-colors",
                          right
                            ? "bg-emerald-50 ring-emerald-400 dark:bg-emerald-950/40"
                            : wrong
                              ? "bg-red-50 ring-red-400 dark:bg-red-950/40"
                              : picked
                                ? "bg-brand-50 ring-brand-500 dark:bg-brand-900/30"
                                : "ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800",
                          submitted && "cursor-default",
                        )}
                      >
                        <input
                          type="radio"
                          name={`q${i}`}
                          checked={picked}
                          disabled={submitted}
                          onChange={() => setChoices({ ...choices, [i]: j })}
                          className="mt-1 accent-brand-600"
                        />
                        <span className="flex-1">
                          <Inline>{opt}</Inline>
                        </span>
                        {right && <Check className="mt-0.5 size-4 text-emerald-600" aria-label="Correct answer" />}
                        {wrong && <X className="mt-0.5 size-4 text-red-600" aria-label="Your answer" />}
                      </label>
                    );
                  })}
                </div>
              )}

              {submitted && (
                <div
                  className={cx(
                    "space-y-2 rounded-lg p-3 text-sm",
                    result === true
                      ? "bg-emerald-50 dark:bg-emerald-950/30"
                      : result === false
                        ? "bg-red-50 dark:bg-red-950/30"
                        : "bg-slate-100 dark:bg-slate-800",
                  )}
                >
                  <div className="flex items-baseline gap-1 font-medium">
                    <span className="shrink-0">Answer:</span>
                    <Inline>{q.answer}</Inline>
                  </div>
                  <Inline>{q.explanation}</Inline>
                  {!q.options.length && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-slate-600 dark:text-slate-300">Did you get it?</span>
                      <Button size="sm" variant={selfMark[i] === true ? "primary" : "secondary"} onClick={() => setSelfMark({ ...selfMark, [i]: true })}>
                        Yes
                      </Button>
                      <Button size="sm" variant={selfMark[i] === false ? "primary" : "secondary"} onClick={() => setSelfMark({ ...selfMark, [i]: false })}>
                        No
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        {!submitted ? (
          <Button size="lg" onClick={() => setSubmitted(true)}>
            Check answers
          </Button>
        ) : (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              setChoices({});
              setWritten({});
              setSelfMark({});
              setSubmitted(false);
              top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            Retake
          </Button>
        )}
      </div>
    </Card>
  );
}
