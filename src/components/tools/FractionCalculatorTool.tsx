"use client";

import { useState } from "react";
import { Markdown } from "../Markdown";
import { Button, Card, ErrorBox, cx, inputClass } from "../ui";

interface Mixed {
  whole: string;
  num: string;
  den: string;
}
type Op = "+" | "−" | "×" | "÷";

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number) => Math.abs(a * b) / gcd(a, b);

function toImproper(m: Mixed): { n: number; d: number } {
  const whole = m.whole.trim() ? parseInt(m.whole, 10) : 0;
  const num = m.num.trim() ? parseInt(m.num, 10) : 0;
  const den = m.den.trim() ? parseInt(m.den, 10) : 1;
  if ([whole, num, den].some((x) => Number.isNaN(x))) throw new Error("Use whole numbers in every box.");
  if (den === 0) throw new Error("A denominator can't be zero.");
  if (den < 0) throw new Error("Put the minus sign on the whole number or the numerator.");
  if (!m.whole.trim()) return { n: num, d: den };
  if (num < 0) throw new Error("For a negative mixed number, put the minus sign on the whole number only.");
  const sign = m.whole.trim().startsWith("-") ? -1 : 1;
  return { n: sign * (Math.abs(whole) * den + num), d: den };
}

const frac = (n: number, d: number) => (d === 1 ? `${n}` : `${n < 0 ? "-" : ""}\\frac{${Math.abs(n)}}{${d}}`);

function mixedTex(n: number, d: number): string {
  const w = Math.trunc(n / d);
  const r = Math.abs(n % d);
  if (r === 0) return `${w}`;
  if (w === 0) return frac(n, d);
  return `${w}\\tfrac{${r}}{${d}}`;
}

function solve(a: Mixed, b: Mixed, op: Op) {
  const x = toImproper(a);
  const y = toImproper(b);
  const steps: string[] = [];
  const show = (m: Mixed, f: { n: number; d: number }) =>
    m.whole.trim() && m.num.trim() ? `$${m.whole}\\tfrac{${m.num}}{${m.den || 1}} = ${frac(f.n, f.d)}$` : "";
  const conv = [show(a, x), show(b, y)].filter(Boolean);
  if (conv.length) steps.push(`**Convert mixed numbers to improper fractions:** ${conv.join(", ")}`);

  let n: number;
  let d: number;
  if (op === "+" || op === "−") {
    const L = lcm(x.d, y.d);
    const xn = x.n * (L / x.d);
    const yn = y.n * (L / y.d);
    if (x.d !== y.d) {
      steps.push(`**Find a common denominator.** The least common denominator of ${x.d} and ${y.d} is ${L}.`);
      steps.push(`$$${frac(x.n, x.d)} = ${frac(xn, L)}, \\quad ${frac(y.n, y.d)} = ${frac(yn, L)}$$`);
    }
    n = op === "+" ? xn + yn : xn - yn;
    d = L;
    steps.push(`**${op === "+" ? "Add" : "Subtract"} the numerators:** $$${frac(xn, L)} ${op === "+" ? "+" : "-"} ${frac(yn, L)} = ${frac(n, d)}$$`);
  } else if (op === "×") {
    n = x.n * y.n;
    d = x.d * y.d;
    steps.push(`**Multiply numerators and denominators:** $$${frac(x.n, x.d)} \\times ${frac(y.n, y.d)} = \\frac{${x.n} \\times ${y.n}}{${x.d} \\times ${y.d}} = ${frac(n, d)}$$`);
  } else {
    if (y.n === 0) throw new Error("You can't divide by zero.");
    const rn = y.n < 0 ? -y.d : y.d;
    const rd = Math.abs(y.n);
    steps.push(`**Multiply by the reciprocal of the second fraction:** $$${frac(x.n, x.d)} \\div ${frac(y.n, y.d)} = ${frac(x.n, x.d)} \\times ${frac(rn, rd)}$$`);
    n = x.n * rn;
    d = x.d * rd;
    steps.push(`$$= ${frac(n, d)}$$`);
  }

  const g = gcd(n, d) || 1;
  const sn = n / g;
  const sd = d / g;
  if (g > 1) steps.push(`**Simplify.** Divide top and bottom by ${g}: $$${frac(n, d)} = ${frac(sn, sd)}$$`);
  if (Math.abs(sn) > sd && sd !== 1) steps.push(`**As a mixed number:** $${mixedTex(sn, sd)}$`);

  return { n: sn, d: sd, steps };
}

function FractionInput({ value, onChange, label }: { value: Mixed; onChange: (m: Mixed) => void; label: string }) {
  const box = cx(inputClass, "text-center text-lg");
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">{label}</legend>
      <input
        aria-label={`${label} whole number`}
        placeholder="whole"
        inputMode="numeric"
        className={cx(box, "w-20")}
        value={value.whole}
        onChange={(e) => onChange({ ...value, whole: e.target.value })}
      />
      <div className="flex w-20 flex-col gap-1">
        <input
          aria-label={`${label} numerator`}
          placeholder="num"
          inputMode="numeric"
          className={box}
          value={value.num}
          onChange={(e) => onChange({ ...value, num: e.target.value })}
        />
        <div className="h-0.5 bg-slate-400" />
        <input
          aria-label={`${label} denominator`}
          placeholder="den"
          inputMode="numeric"
          className={box}
          value={value.den}
          onChange={(e) => onChange({ ...value, den: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

export function FractionCalculatorTool() {
  const [a, setA] = useState<Mixed>({ whole: "", num: "1", den: "2" });
  const [b, setB] = useState<Mixed>({ whole: "", num: "3", den: "4" });
  const [op, setOp] = useState<Op>("+");
  const [out, setOut] = useState<ReturnType<typeof solve> | null>(null);
  const [error, setError] = useState("");

  function calculate() {
    try {
      setOut(solve(a, b, op));
      setError("");
    } catch (err) {
      setOut(null);
      setError(err instanceof Error ? err.message : "Check your numbers.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-6">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <FractionInput value={a} onChange={setA} label="First fraction" />
          <div className="flex flex-col gap-1" role="radiogroup" aria-label="Operation">
            {(["+", "−", "×", "÷"] as Op[]).map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={op === o}
                onClick={() => setOp(o)}
                className={cx(
                  "size-9 rounded-lg text-lg font-semibold",
                  op === o ? "bg-brand-600 text-white" : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
                )}
              >
                {o}
              </button>
            ))}
          </div>
          <FractionInput value={b} onChange={setB} label="Second fraction" />
        </div>
        <ErrorBox message={error} />
        <Button size="lg" className="w-full" onClick={calculate}>
          Calculate
        </Button>
        <p className="text-xs text-slate-500">Leave the whole-number box empty for a simple fraction. Use a minus sign for negatives.</p>
      </Card>

      <Card>
        {out ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-brand-50 p-4 text-center dark:bg-brand-900/30">
              <Markdown className="prose-xl">{`$$${frac(out.n, out.d)}${Math.abs(out.n) > out.d && out.d !== 1 ? ` = ${mixedTex(out.n, out.d)}` : ""} \\approx ${parseFloat((out.n / out.d).toFixed(6))}$$`}</Markdown>
            </div>
            <h2 className="font-semibold">Steps</h2>
            <ol className="list-decimal space-y-2 pl-5">
              {out.steps.map((s, i) => (
                <li key={i}>
                  <Markdown className="prose-p:my-0">{s}</Markdown>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Enter two fractions and pick an operation.</p>
        )}
      </Card>
    </div>
  );
}
