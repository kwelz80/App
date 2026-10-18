import { Camera, Sigma, Sparkles } from "lucide-react";
import Link from "next/link";
import { ToolCard, ToolDirectory } from "@/components/ToolDirectory";
import { APP_NAME, TOOLS } from "@/lib/tools";

export default function Home() {
  const featured = TOOLS.filter((t) => t.featured);
  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-brand-50 to-slate-50 dark:border-slate-800 dark:from-brand-900/30 dark:to-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-brand-700 ring-1 ring-brand-200 dark:bg-slate-900 dark:text-brand-200 dark:ring-brand-900">
            <Sparkles className="size-4" aria-hidden />
            {TOOLS.length} free AI study tools
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Homework help and study tools that explain every step
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            Snap a photo of a problem, turn your notes into flashcards and quizzes, or get help with an essay. {APP_NAME} works
            for math, science, writing, and every subject in between.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/homework-help"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-600 px-6 font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Camera className="size-5" aria-hidden />
              Get homework help
            </Link>
            <Link
              href="/math-solver"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-6 font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
            >
              <Sigma className="size-5" aria-hidden />
              Solve a math problem
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 py-12">
        <section>
          <h2 className="text-2xl font-semibold">Most popular</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((t) => (
              <ToolCard key={t.slug} tool={t} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-5 text-2xl font-semibold">All tools</h2>
          <ToolDirectory />
        </section>
      </div>
    </>
  );
}
