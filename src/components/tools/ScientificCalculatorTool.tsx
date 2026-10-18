"use client";

import { all, create } from "mathjs";
import { useMemo, useRef, useState } from "react";
import { Card, cx } from "../ui";

const math = create(all);

type Key = { label: string; insert?: string; action?: "clear" | "back" | "equals" | "ans" | "mode"; kind?: "fn" | "op" | "num" | "eq" };

const KEYS: Key[] = [
  { label: "mode", action: "mode", kind: "fn" },
  { label: "(", insert: "(", kind: "fn" },
  { label: ")", insert: ")", kind: "fn" },
  { label: "%", insert: "%", kind: "fn" },
  { label: "AC", action: "clear", kind: "op" },
  { label: "sin", insert: "sin(", kind: "fn" },
  { label: "cos", insert: "cos(", kind: "fn" },
  { label: "tan", insert: "tan(", kind: "fn" },
  { label: "π", insert: "π", kind: "fn" },
  { label: "⌫", action: "back", kind: "op" },
  { label: "sin⁻¹", insert: "asin(", kind: "fn" },
  { label: "cos⁻¹", insert: "acos(", kind: "fn" },
  { label: "tan⁻¹", insert: "atan(", kind: "fn" },
  { label: "e", insert: "e", kind: "fn" },
  { label: "÷", insert: "÷", kind: "op" },
  { label: "ln", insert: "ln(", kind: "fn" },
  { label: "log", insert: "log(", kind: "fn" },
  { label: "√", insert: "√(", kind: "fn" },
  { label: "xʸ", insert: "^", kind: "fn" },
  { label: "×", insert: "×", kind: "op" },
  { label: "x²", insert: "^2", kind: "fn" },
  { label: "7", insert: "7", kind: "num" },
  { label: "8", insert: "8", kind: "num" },
  { label: "9", insert: "9", kind: "num" },
  { label: "−", insert: "−", kind: "op" },
  { label: "x!", insert: "!", kind: "fn" },
  { label: "4", insert: "4", kind: "num" },
  { label: "5", insert: "5", kind: "num" },
  { label: "6", insert: "6", kind: "num" },
  { label: "+", insert: "+", kind: "op" },
  { label: "1/x", insert: "^(-1)", kind: "fn" },
  { label: "1", insert: "1", kind: "num" },
  { label: "2", insert: "2", kind: "num" },
  { label: "3", insert: "3", kind: "num" },
  { label: "=", action: "equals", kind: "eq" },
  { label: "Ans", action: "ans", kind: "fn" },
  { label: "EXP", insert: "×10^", kind: "fn" },
  { label: "0", insert: "0", kind: "num" },
  { label: ".", insert: ".", kind: "num" },
];

function toMathjs(expr: string): string {
  return expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/√/g, "sqrt")
    .replace(/π/g, "pi");
}

function evaluate(expr: string, degrees: boolean, ans: string): string {
  const r = (x: number) => (degrees ? (x * Math.PI) / 180 : x);
  const d = (x: number) => (degrees ? (x * 180) / Math.PI : x);
  const scope = {
    sin: (x: number) => Math.sin(r(x)),
    cos: (x: number) => Math.cos(r(x)),
    tan: (x: number) => Math.tan(r(x)),
    asin: (x: number) => d(Math.asin(x)),
    acos: (x: number) => d(Math.acos(x)),
    atan: (x: number) => d(Math.atan(x)),
    ln: (x: number) => Math.log(x),
    log: (x: number) => Math.log10(x),
    Ans: Number(ans) || 0,
  };
  const value = math.evaluate(toMathjs(expr), scope);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(Number.isNaN(value) ? "Undefined" : "Infinity");
    return math.format(value, { precision: 12, lowerExp: -9, upperExp: 15 });
  }
  return math.format(value, { precision: 12 });
}

export function ScientificCalculatorTool() {
  const [expr, setExpr] = useState("");
  const [error, setError] = useState("");
  const [degrees, setDegrees] = useState(true);
  const [ans, setAns] = useState("0");
  const [history, setHistory] = useState<{ expr: string; result: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => {
    if (!expr.trim()) return "";
    try {
      return evaluate(expr, degrees, ans);
    } catch {
      return "";
    }
  }, [expr, degrees, ans]);

  function equals() {
    if (!expr.trim()) return;
    try {
      const value = evaluate(expr, degrees, ans);
      setHistory((h) => [{ expr, result: value }, ...h].slice(0, 20));
      setAns(value);
      setExpr(value);
      setError("");
    } catch (err) {
      setError(err instanceof Error && /Undefined|Infinity/.test(err.message) ? err.message : "Check the expression");
    }
  }

  function press(k: Key) {
    setError("");
    if (k.action === "clear") setExpr("");
    else if (k.action === "back") setExpr((e) => e.slice(0, -1));
    else if (k.action === "equals") equals();
    else if (k.action === "ans") setExpr((e) => e + "Ans");
    else if (k.action === "mode") setDegrees((v) => !v);
    else if (k.insert) setExpr((e) => e + k.insert);
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
      <Card className="space-y-4">
        <div className="rounded-xl bg-slate-900 p-4 text-right text-white dark:bg-black">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{degrees ? "DEG" : "RAD"}</span>
            <span>Ans = {ans}</span>
          </div>
          <input
            ref={inputRef}
            value={expr}
            onChange={(e) => {
              setExpr(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                equals();
              } else if (e.key === "Escape") setExpr("");
            }}
            aria-label="Expression"
            placeholder="0"
            inputMode="decimal"
            className="mt-1 w-full bg-transparent text-right font-mono text-2xl placeholder:text-slate-500 focus:outline-none"
          />
          <div className="mt-1 min-h-7 font-mono text-lg text-slate-300" aria-live="polite">
            {error ? <span className="text-red-400">{error}</span> : result && result !== expr ? `= ${result}` : ""}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => press(k)}
              className={cx(
                "h-12 rounded-lg text-sm font-medium transition-colors active:scale-95",
                k.kind === "num" && "bg-slate-100 text-lg hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
                k.kind === "fn" && "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800",
                k.kind === "op" && "bg-brand-50 text-lg text-brand-700 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200",
                k.kind === "eq" && "row-span-2 h-auto bg-brand-600 text-xl text-white hover:bg-brand-700",
              )}
            >
              {k.action === "mode" ? (degrees ? "DEG" : "RAD") : k.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Type with your keyboard too. Press Enter for =, Esc to clear. Tap DEG/RAD to switch angle units.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Your calculations will appear here.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {history.map((h, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setExpr(h.expr)}
                  className="w-full py-2 text-right font-mono hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span className="block text-sm text-slate-500">{h.expr}</span>
                  <span className="block text-lg">= {h.result}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
