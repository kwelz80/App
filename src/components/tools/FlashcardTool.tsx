"use client";

import { ChevronLeft, ChevronRight, Download, RotateCcw, Shuffle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useJson } from "@/lib/client/useJson";
import type { Flashcards } from "@/lib/schemas";
import type { Tool } from "@/lib/tools";
import { Markdown } from "../Markdown";
import { Button, Card, CopyButton, ErrorBox, Spinner, cx } from "../ui";
import { ToolInput, useScrollOnMount } from "./ToolInput";

export function FlashcardTool({ tool }: { tool: Tool }) {
  const job = useJson<Flashcards>();
  return (
    <div className="space-y-6">
      <ToolInput tool={tool} loading={job.loading} onSubmit={(s) => job.run("/api/json", s)} onStop={job.stop} />
      {job.loading && (
        <Card>
          <Spinner label="Making your flashcards…" />
        </Card>
      )}
      <ErrorBox message={job.error} />
      {job.data && <Deck key={job.data.title + job.data.cards.length} deck={job.data} />}
    </div>
  );
}

function csvCell(s: string) {
  return `"${s.replace(/"/g, '""')}"`;
}

function Deck({ deck }: { deck: Flashcards }) {
  const [order, setOrder] = useState(() => deck.cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [onlyLearning, setOnlyLearning] = useState(false);
  const top = useScrollOnMount<HTMLDivElement>();

  const visible = useMemo(() => (onlyLearning ? order.filter((i) => !known.has(i)) : order), [order, known, onlyLearning]);
  const current = visible[Math.min(pos, visible.length - 1)];
  const card = current !== undefined ? deck.cards[current] : undefined;

  const go = useCallback(
    (d: number) => {
      setFlipped(false);
      setPos((p) => Math.max(0, Math.min(visible.length - 1, p + d)));
    },
    [visible.length],
  );

  function mark(isKnown: boolean) {
    if (current === undefined) return;
    const next = new Set(known);
    if (isKnown) next.add(current);
    else next.delete(current);
    setKnown(next);
    setFlipped(false);
    if (!onlyLearning || !isKnown) setPos((p) => Math.min(visible.length - 1, p + 1));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " " || e.key === "Enter") {
        if ((e.target as HTMLElement)?.closest("button")) return;
        e.preventDefault();
        setFlipped((f) => !f);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const tsv = deck.cards.map((c) => `${c.front.replace(/\t|\n/g, " ")}\t${c.back.replace(/\t|\n/g, " ")}`).join("\n");

  function downloadCsv() {
    const csv = deck.cards.map((c) => `${csvCell(c.front)},${csvCell(c.back)}`).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "flashcards.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="space-y-6">
      <div ref={top} className="flex scroll-mt-20 flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{deck.title}</h2>
          <p className="text-sm text-slate-500">
            {known.size} of {deck.cards.length} known
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={tsv} label="Copy for Quizlet" />
          <Button variant="secondary" size="sm" onClick={downloadCsv}>
            <Download className="size-4" aria-hidden />
            CSV for Anki
          </Button>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(known.size / deck.cards.length) * 100}%` }} />
      </div>

      {card ? (
        <>
          <button
            type="button"
            className="flip-card block w-full text-left"
            data-flipped={flipped}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Show front" : "Show answer"}
          >
            <div className="flip-inner relative h-72">
              <div className="flip-face absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-2xl bg-gradient-to-br from-brand-50 to-white p-6 text-center ring-1 ring-brand-200 dark:from-brand-900/40 dark:to-slate-900 dark:ring-brand-900">
                <span className="mb-3 text-xs font-medium tracking-wide text-brand-600 uppercase dark:text-brand-200">Front</span>
                <div className="text-lg sm:text-xl">
                  <Markdown className="prose-lg">{card.front}</Markdown>
                </div>
                {card.hint && !flipped && <p className="mt-4 text-sm text-slate-500">Hint: {card.hint}</p>}
              </div>
              <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-2xl bg-white p-6 text-center ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                <span className="mb-3 text-xs font-medium tracking-wide text-emerald-600 uppercase">Back</span>
                <Markdown>{card.back}</Markdown>
              </div>
            </div>
          </button>
          <p className="text-center text-xs text-slate-400">Click the card or press Space to flip. Arrow keys move between cards.</p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => go(-1)} disabled={pos === 0} aria-label="Previous card">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => mark(false)}>
                Still learning
              </Button>
              <Button onClick={() => mark(true)} className="bg-emerald-600 hover:bg-emerald-700">
                Know it
              </Button>
            </div>
            <Button variant="secondary" onClick={() => go(1)} disabled={pos >= visible.length - 1} aria-label="Next card">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <p className="text-center text-sm text-slate-500">
            Card {Math.min(pos, visible.length - 1) + 1} of {visible.length}
          </p>
        </>
      ) : (
        <div className="rounded-xl bg-emerald-50 p-6 text-center dark:bg-emerald-950/30">
          <p className="font-semibold">You know every card in this deck.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOrder((o) => [...o].sort(() => Math.random() - 0.5));
            setPos(0);
            setFlipped(false);
          }}
        >
          <Shuffle className="size-4" aria-hidden />
          Shuffle
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOnlyLearning((v) => !v);
            setPos(0);
            setFlipped(false);
          }}
        >
          {onlyLearning ? "Show all cards" : "Study only cards I'm learning"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setKnown(new Set());
            setPos(0);
            setFlipped(false);
          }}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset progress
        </Button>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">View all {deck.cards.length} cards</summary>
        <div className="mt-3 divide-y divide-slate-200 rounded-lg ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
          {deck.cards.map((c, i) => (
            <div key={i} className={cx("grid gap-2 p-3 text-sm sm:grid-cols-2", known.has(i) && "bg-emerald-50/50 dark:bg-emerald-950/20")}>
              <Markdown className="prose-sm font-medium">{c.front}</Markdown>
              <Markdown className="prose-sm">{c.back}</Markdown>
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}
