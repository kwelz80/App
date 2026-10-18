import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { APP_NAME, CATEGORIES } from "@/lib/tools";

export function Header() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap className="size-5" aria-hidden />
          </span>
          {APP_NAME}
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm" aria-label="Main">
          <Link href="/homework-help" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 md:block dark:text-slate-300 dark:hover:bg-slate-800">
            Homework Help
          </Link>
          <Link href="/math-solver" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 md:block dark:text-slate-300 dark:hover:bg-slate-800">
            Math Solver
          </Link>
          <Link href="/essay-writer" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 lg:block dark:text-slate-300 dark:hover:bg-slate-800">
            Essay Writer
          </Link>
          <Link href="/tools" className="rounded-lg bg-brand-50 px-3 py-2 font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200">
            All tools
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="no-print mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="font-semibold">{APP_NAME}</p>
          <p className="mt-2 text-slate-500">AI study tools powered by Claude.</p>
        </div>
        {CATEGORIES.map((c) => (
          <div key={c.id}>
            <Link href={`/tools#${c.id}`} className="font-medium hover:underline">
              {c.name}
            </Link>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
        AI can make mistakes, so check important answers. Use these tools to learn, and follow your school&apos;s academic
        integrity policy.
      </div>
    </footer>
  );
}
