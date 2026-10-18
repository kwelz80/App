"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, TOOLS, type Tool } from "@/lib/tools";
import { ToolIcon } from "./ToolIcon";
import { inputClass } from "./ui";

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={`/${tool.slug}`}
      className="group flex gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200 dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-brand-900"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-900/40 dark:text-brand-200">
        <ToolIcon name={tool.icon} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{tool.name}</span>
        <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{tool.short}</span>
      </span>
    </Link>
  );
}

export function ToolDirectory() {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return TOOLS.filter((t) => `${t.name} ${t.short} ${t.description}`.toLowerCase().includes(term));
  }, [q]);

  return (
    <div className="space-y-10">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tools, e.g. flashcards, chemistry, citation"
          aria-label="Search tools"
          className={`${inputClass} h-11 pl-9`}
        />
      </div>

      {matches ? (
        matches.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((t) => (
              <ToolCard key={t.slug} tool={t} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500">No tools match &ldquo;{q}&rdquo;.</p>
        )
      ) : (
        CATEGORIES.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-20">
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{c.blurb}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.filter((t) => t.category === c.id).map((t) => (
                <ToolCard key={t.slug} tool={t} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
