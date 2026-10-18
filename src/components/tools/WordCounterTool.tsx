"use client";

import { useMemo, useState } from "react";
import { Card, inputClass } from "../ui";

const STOP = new Set(
  "a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your his our their not no do does did have has had will would can could should may might must there here what which who whom when where why how all any each more most other some such than too very just also into over about up out".split(
    " ",
  ),
);

function stats(text: string) {
  const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => /[\p{L}\p{N}]/u.test(s));
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const letters = words.reduce((n, w) => n + w.length, 0);
  const freq = new Map<string, number>();
  for (const w of words) {
    const k = w.toLowerCase();
    if (k.length < 3 || STOP.has(k) || /^\d+$/.test(k)) continue;
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    words: words.length,
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, "").length,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    avgWord: words.length ? letters / words.length : 0,
    avgSentence: sentences.length ? words.length / sentences.length : 0,
    readMin: words.length / 238,
    speakMin: words.length / 150,
    pages: words.length / 500,
    top,
  };
}

function minutes(m: number) {
  if (m === 0) return "0 sec";
  if (m < 1) return `${Math.max(1, Math.round(m * 60))} sec`;
  const whole = Math.floor(m);
  const sec = Math.round((m - whole) * 60);
  return sec ? `${whole} min ${sec} sec` : `${whole} min`;
}

export function WordCounterTool() {
  const [text, setText] = useState("");
  const s = useMemo(() => stats(text), [text]);

  const tiles: [string, string][] = [
    ["Words", s.words.toLocaleString()],
    ["Characters", s.chars.toLocaleString()],
    ["Characters (no spaces)", s.charsNoSpaces.toLocaleString()],
    ["Sentences", s.sentences.toLocaleString()],
    ["Paragraphs", s.paragraphs.toLocaleString()],
    ["Reading time", minutes(s.readMin)],
    ["Speaking time", minutes(s.speakMin)],
    ["Pages (single-spaced)", s.pages.toFixed(1)],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <label htmlFor="wc" className="sr-only">
          Your text
        </label>
        <textarea
          id="wc"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={18}
          placeholder="Start typing or paste your text here."
          className={`${inputClass} resize-y text-base leading-relaxed`}
        />
        {text && (
          <button type="button" onClick={() => setText("")} className="mt-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            Clear text
          </button>
        )}
      </Card>
      <div className="space-y-4">
        <Card className="grid grid-cols-2 gap-4">
          {tiles.map(([label, value], i) => (
            <div key={label} className={i === 0 ? "col-span-2" : undefined}>
              <p className={i === 0 ? "text-4xl font-bold text-brand-600 dark:text-brand-200" : "text-xl font-semibold"}>{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
          <div className="col-span-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
            Avg word length {s.avgWord.toFixed(1)} letters · Avg sentence {s.avgSentence.toFixed(1)} words
          </div>
        </Card>
        {s.top.length > 0 && (
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Top keywords</h2>
            <ul className="space-y-1 text-sm">
              {s.top.map(([w, n]) => (
                <li key={w} className="flex justify-between">
                  <span>{w}</span>
                  <span className="text-slate-500">
                    {n} · {((n / s.words) * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
