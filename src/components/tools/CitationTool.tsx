"use client";

import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { errorMessage, postJson } from "@/lib/client/api";
import {
  STYLES,
  emptySource,
  htmlToText,
  inText,
  numbered,
  reference,
  sortKey,
  type Source,
  type SourceType,
  type Style,
} from "@/lib/citation";
import { Button, Card, CopyButton, ErrorBox, Label, cx, inputClass } from "../ui";

const STORE = "studydesk-bibliography";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Saved {
  id: string;
  source: Source;
}

// Saved citations live in localStorage, exposed as a tiny external store.
const listeners = new Set<() => void>();
const EMPTY: Saved[] = [];
let cache: Saved[] | null = null;

function readSaved(): Saved[] {
  if (cache === null) {
    try {
      cache = JSON.parse(localStorage.getItem(STORE) || "[]");
    } catch {
      cache = [];
    }
  }
  return cache ?? EMPTY;
}

function persist(next: Saved[]) {
  cache = next;
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // storage unavailable; the list lasts for this visit
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} type={type} className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function CitationTool() {
  const [style, setStyle] = useState<Style>("apa");
  const [src, setSrc] = useState<Source>(() => emptySource());
  const [editing, setEditing] = useState<string | null>(null);
  const saved = useSyncExternalStore(subscribe, readSaved, () => EMPTY);
  const [query, setQuery] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const set = <K extends keyof Source>(k: K, v: Source[K]) => setSrc((s) => ({ ...s, [k]: v }));

  async function lookup() {
    if (!query.trim()) return;
    setLooking(true);
    setLookupError("");
    try {
      const { source } = await postJson<{ source: Partial<Source> }>("/api/cite", { query });
      const base = emptySource(source.type ?? src.type);
      setSrc({ ...base, ...Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined)) } as Source);
      setEditing(null);
    } catch (err) {
      setLookupError(errorMessage(err));
    } finally {
      setLooking(false);
    }
  }

  function save() {
    if (!src.title.trim()) return;
    if (editing) persist(saved.map((s) => (s.id === editing ? { ...s, source: src } : s)));
    else persist([...saved, { id: crypto.randomUUID(), source: src }]);
    setEditing(null);
    setSrc(emptySource(src.type));
    setQuery("");
  }

  const ref = reference(src, style);
  const cite = inText(src, style, editing ? saved.findIndex((s) => s.id === editing) + 1 : saved.length + 1);

  const ordered = numbered(style) ? saved : [...saved].sort((a, b) => sortKey(a.source).localeCompare(sortKey(b.source)));
  const bibHtml = ordered
    .map((s, i) => `<p style="padding-left:2em;text-indent:-2em">${numbered(style) ? (style === "ieee" ? `[${i + 1}] ` : `${i + 1}. `) : ""}${reference(s.source, style)}</p>`)
    .join("");
  const bibText = ordered
    .map((s, i) => `${numbered(style) ? (style === "ieee" ? `[${i + 1}] ` : `${i + 1}. `) : ""}${htmlToText(reference(s.source, style))}`)
    .join("\n\n");

  const containerLabel = src.type === "journal" ? "Journal name" : src.type === "website" ? "Website name" : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Citation style">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={style === s.id}
            onClick={() => setStyle(s.id)}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition-colors",
              style === s.id
                ? "bg-brand-600 text-white ring-brand-600"
                : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card className="space-y-5">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              lookup();
            }}
          >
            <label htmlFor="cite-q" className="sr-only">
              URL, DOI, or ISBN
            </label>
            <input
              id="cite-q"
              className={inputClass}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Paste a URL, DOI, or ISBN to fill in the details"
            />
            <Button type="submit" loading={looking}>
              <Search className="size-4" aria-hidden />
              Look up
            </Button>
          </form>
          <ErrorBox message={lookupError} />

          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Source type">
            {(["website", "book", "journal"] as SourceType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={src.type === t}
                onClick={() => set("type", t)}
                className={cx(
                  "flex-1 rounded-md py-1.5 text-sm font-medium capitalize",
                  src.type === t ? "bg-white shadow-sm dark:bg-slate-950" : "text-slate-600 dark:text-slate-400",
                )}
              >
                {t === "journal" ? "Journal article" : t}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Authors</span>
            {src.authors.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Author ${i + 1} first and middle names`}
                  className={inputClass}
                  placeholder="First & middle"
                  value={a.first}
                  onChange={(e) => set("authors", src.authors.map((x, j) => (j === i ? { ...x, first: e.target.value } : x)))}
                />
                <input
                  aria-label={`Author ${i + 1} last name or organization`}
                  className={inputClass}
                  placeholder="Last name or organization"
                  value={a.last}
                  onChange={(e) => set("authors", src.authors.map((x, j) => (j === i ? { ...x, last: e.target.value } : x)))}
                />
                <button
                  type="button"
                  onClick={() => set("authors", src.authors.length > 1 ? src.authors.filter((_, j) => j !== i) : [{ first: "", last: "" }])}
                  className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label={`Remove author ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => set("authors", [...src.authors, { first: "", last: "" }])}>
              <Plus className="size-4" aria-hidden />
              Add author
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="c-title"
              className="sm:col-span-2"
              label={src.type === "website" ? "Page title" : src.type === "book" ? "Book title" : "Article title"}
              value={src.title}
              onChange={(v) => set("title", v)}
            />
            {containerLabel && (
              <Field id="c-container" className="sm:col-span-2" label={containerLabel} value={src.container} onChange={(v) => set("container", v)} />
            )}
            {src.type === "book" && (
              <>
                <Field id="c-publisher" label="Publisher" value={src.publisher} onChange={(v) => set("publisher", v)} />
                <Field id="c-place" label="City (Chicago, Harvard, IEEE, ASA)" value={src.place} onChange={(v) => set("place", v)} />
                <Field id="c-edition" label="Edition" placeholder="e.g. 3" value={src.edition} onChange={(v) => set("edition", v)} />
              </>
            )}
            {src.type === "journal" && (
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field id="c-vol" label="Volume" value={src.volume} onChange={(v) => set("volume", v)} />
                <Field id="c-issue" label="Issue" value={src.issue} onChange={(v) => set("issue", v)} />
                <Field id="c-pages" label="Pages" placeholder="12-34" value={src.pages} onChange={(v) => set("pages", v)} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <Field id="c-year" label="Year" value={src.year} onChange={(v) => set("year", v)} />
              <div>
                <Label htmlFor="c-month">Month</Label>
                <select id="c-month" className={inputClass} value={src.month} onChange={(e) => set("month", e.target.value)}>
                  <option value="">—</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1)}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <Field id="c-day" label="Day" value={src.day} onChange={(v) => set("day", v)} />
            </div>
            {src.type !== "book" && <Field id="c-url" className="sm:col-span-2" label="URL" value={src.url} onChange={(v) => set("url", v)} />}
            {src.type !== "website" && <Field id="c-doi" label="DOI" placeholder="10.xxxx/xxxxx" value={src.doi} onChange={(v) => set("doi", v)} />}
            {src.type === "website" && (
              <Field id="c-accessed" type="date" label="Date accessed" value={src.accessed} onChange={(v) => set("accessed", v)} />
            )}
          </div>
          {style === "apa" && <p className="text-xs text-slate-500">APA uses sentence case for titles: capitalize only the first word and proper nouns.</p>}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 lg:sticky lg:top-20">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-500">Reference entry</h2>
              {src.title.trim() ? (
                <p className="pl-8 -indent-8 leading-relaxed" dangerouslySetInnerHTML={{ __html: ref }} />
              ) : (
                <p className="text-sm text-slate-400">Fill in a title to see the citation.</p>
              )}
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-500">
                {style === "chicago" ? "Short footnote" : "In-text citation"}
              </h2>
              {src.title.trim() && <p dangerouslySetInnerHTML={{ __html: cite }} />}
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={htmlToText(ref)} html={ref} label="Copy reference" />
              <CopyButton text={htmlToText(cite)} html={cite} label="Copy in-text" />
              <Button size="sm" onClick={save} disabled={!src.title.trim()}>
                <Plus className="size-4" aria-hidden />
                {editing ? "Save changes" : "Add to list"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {saved.length > 0 && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {style === "mla" ? "Works Cited" : style === "chicago" ? "Bibliography" : "References"} ({saved.length})
            </h2>
            <div className="flex gap-2">
              <CopyButton text={bibText} html={bibHtml} label="Copy all" />
              <Button variant="danger" size="sm" onClick={() => confirm("Remove every saved citation?") && persist([])}>
                Clear
              </Button>
            </div>
          </div>
          <ol className="space-y-3">
            {ordered.map((s, i) => (
              <li key={s.id} className="group flex gap-3">
                <div className="flex-1 pl-8 -indent-8 leading-relaxed">
                  {numbered(style) && <span>{style === "ieee" ? `[${i + 1}] ` : `${i + 1}. `}</span>}
                  <span dangerouslySetInnerHTML={{ __html: reference(s.source, style) }} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSrc(s.source);
                      setEditing(s.id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    aria-label="Edit citation"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => persist(saved.filter((x) => x.id !== s.id))}
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    aria-label="Delete citation"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500">Saved in this browser only.</p>
        </Card>
      )}
    </div>
  );
}
