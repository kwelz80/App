import type { Metadata } from "next";
import { ToolDirectory } from "@/components/ToolDirectory";

export const metadata: Metadata = {
  title: "All Tools",
  description: "Free AI tools for studying, writing, and math.",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Free AI tools for studying, writing &amp; math</h1>
      <p className="mt-2 mb-8 text-slate-600 dark:text-slate-300">Pick a tool to get started. No sign-up needed.</p>
      <ToolDirectory />
    </div>
  );
}
