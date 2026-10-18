import type { ReactNode } from "react";

export interface Span {
  start: number;
  end: number;
  key: string;
}

/** Finds each needle in the text (in order, no overlaps) and returns character spans. */
export function locate(text: string, needles: { key: string; text: string }[]): Span[] {
  const spans: Span[] = [];
  for (const n of needles) {
    const t = n.text.trim();
    if (!t) continue;
    let from = 0;
    let idx = text.indexOf(t, from);
    while (idx >= 0 && spans.some((s) => idx < s.end && idx + t.length > s.start)) {
      from = idx + 1;
      idx = text.indexOf(t, from);
    }
    if (idx >= 0) spans.push({ start: idx, end: idx + t.length, key: n.key });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Renders text with the given spans wrapped by `wrap`. */
export function Highlighted({
  text,
  spans,
  wrap,
}: {
  text: string;
  spans: Span[];
  wrap: (content: string, span: Span) => ReactNode;
}) {
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue;
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(wrap(text.slice(s.start, s.end), s));
    cursor = s.end;
  }
  out.push(text.slice(cursor));
  return <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{out}</div>;
}
