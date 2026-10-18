"use client";

import "katex/dist/katex.min.css";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cx } from "./ui";

/** Converts \( \) and \[ \] delimiters to the $ forms remark-math understands. */
function normalizeMath(src: string): string {
  return src
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m: string) => `\n$$\n${m.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m: string) => `$${m.trim()}$`);
}

function MarkdownImpl({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cx(
        "prose prose-slate max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-pre:overflow-x-auto prose-table:text-sm prose-th:text-left",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }]]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
