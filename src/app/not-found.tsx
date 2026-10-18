import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300">That tool doesn&apos;t exist. Browse the full list instead.</p>
      <Link href="/tools" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 font-medium text-white hover:bg-brand-700">
        See all tools
      </Link>
    </div>
  );
}
