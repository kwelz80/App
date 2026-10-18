"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ToolField } from "@/lib/tools";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-600/50",
    secondary:
      "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
    danger: "text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
  };
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed",
        styles[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6 dark:bg-slate-900 dark:ring-slate-800",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900"
    >
      {message}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ?? "Working…"}
    </div>
  );
}

export function CopyButton({ text, html, label = "Copy" }: { text: string; html?: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      if (html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // clipboard blocked; nothing useful to do
    }
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy} type="button">
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? "Copied" : label}
    </Button>
  );
}

export const inputClass =
  "w-full rounded-lg bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-700";

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
      {children}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  help,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-1">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500 dark:bg-slate-700" />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span className="text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
        {help && <span className="block text-slate-500 dark:text-slate-400">{help}</span>}
      </span>
    </label>
  );
}

export type OptionValues = Record<string, string | boolean>;

export function defaultOptions(fields: ToolField[] | undefined): OptionValues {
  return Object.fromEntries((fields ?? []).map((f) => [f.id, f.default]));
}

/** Renders a tool's option fields (selects, toggles, short text). */
export function OptionFields({
  fields,
  values,
  onChange,
  only,
}: {
  fields: ToolField[] | undefined;
  values: OptionValues;
  onChange: (v: OptionValues) => void;
  only?: ToolField["type"][];
}) {
  const list = (fields ?? []).filter((f) => !only || only.includes(f.type));
  if (!list.length) return null;
  const set = (id: string, v: string | boolean) => onChange({ ...values, [id]: v });
  const selects = list.filter((f) => f.type !== "toggle");
  const toggles = list.filter((f) => f.type === "toggle");
  return (
    <div className="space-y-3">
      {selects.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {selects.map((f) =>
            f.type === "select" ? (
              <div key={f.id}>
                <Label htmlFor={`opt-${f.id}`}>{f.label}</Label>
                <select
                  id={`opt-${f.id}`}
                  className={inputClass}
                  value={String(values[f.id])}
                  onChange={(e) => set(f.id, e.target.value)}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div key={f.id} className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor={`opt-${f.id}`}>{f.label}</Label>
                <input
                  id={`opt-${f.id}`}
                  className={inputClass}
                  value={String(values[f.id] ?? "")}
                  placeholder={f.placeholder}
                  maxLength={300}
                  onChange={(e) => set(f.id, e.target.value)}
                />
              </div>
            ),
          )}
        </div>
      )}
      {toggles.map((f) => (
        <Toggle
          key={f.id}
          id={`opt-${f.id}`}
          label={f.label}
          help={f.help}
          checked={Boolean(values[f.id])}
          onChange={(v) => set(f.id, v)}
        />
      ))}
    </div>
  );
}
