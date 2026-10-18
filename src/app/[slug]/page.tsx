import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToolCard } from "@/components/ToolDirectory";
import { ToolIcon } from "@/components/ToolIcon";
import { ToolRenderer } from "@/components/tools/ToolRenderer";
import { CATEGORIES, TOOLS, getTool } from "@/lib/tools";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  return tool ? { title: tool.name, description: tool.description } : {};
}

export default async function ToolPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const category = CATEGORIES.find((c) => c.id === tool.category)!;
  const related = TOOLS.filter((t) => t.category === tool.category && t.slug !== tool.slug).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="no-print mb-4 flex items-center gap-1 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/tools" className="hover:text-slate-800 dark:hover:text-slate-200">
          Tools
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link href={`/tools#${category.id}`} className="hover:text-slate-800 dark:hover:text-slate-200">
          {category.name}
        </Link>
      </nav>
      <header className="no-print mb-6 flex items-start gap-4">
        <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white sm:flex">
          <ToolIcon name={tool.icon} className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tool.name}</h1>
          <p className="mt-1 max-w-3xl text-slate-600 dark:text-slate-300">{tool.description}</p>
        </div>
      </header>

      <ToolRenderer slug={tool.slug} />

      {related.length > 0 && (
        <section className="no-print mt-14">
          <h2 className="mb-4 text-lg font-semibold">More {category.name.toLowerCase()}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => (
              <ToolCard key={t.slug} tool={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
