"use client";

import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { registerCodePrompt } from "@/lib/client/api";
import { Button, inputClass } from "./ui";

/** Asks for the site's access code the first time an API call needs it. */
export function AccessCodeDialog() {
  const [request, setRequest] = useState<{ resolve: (code: string | null) => void; error?: string } | null>(null);
  const [code, setCode] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => registerCodePrompt((resolve, error) => setRequest({ resolve, error })), []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (request && !d.open) d.showModal();
    if (!request && d.open) d.close();
  }, [request]);

  function finish(value: string | null) {
    request?.resolve(value);
    setRequest(null);
    if (value === null) setCode("");
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        finish(null);
      }}
      className="m-auto w-[min(92vw,420px)] rounded-2xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50 dark:bg-slate-900 dark:text-slate-100"
    >
      <form
        method="dialog"
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) finish(code.trim());
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">Enter access code</h2>
            <p className="text-sm text-slate-500">Ask the person who shared this site for the code.</p>
          </div>
        </div>
        {request?.error && <p className="text-sm text-red-600">{request.error}</p>}
        <input
          autoFocus
          type="password"
          autoComplete="off"
          className={inputClass}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Access code"
          placeholder="Access code"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => finish(null)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!code.trim()}>
            Continue
          </Button>
        </div>
      </form>
    </dialog>
  );
}
