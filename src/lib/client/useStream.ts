"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, postStream } from "./api";

/**
 * Runs a streaming request and exposes the growing text. Re-renders are batched
 * so long Markdown/LaTeX answers don't re-parse on every token.
 */
export function useStream() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const buffer = useRef("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const flush = useCallback(() => setText(buffer.current), []);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => {
    stopTimer();
    abort.current?.abort();
  }, [stopTimer]);

  const run = useCallback(
    async (url: string, body: unknown): Promise<string> => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      buffer.current = "";
      setText("");
      setError("");
      setStatus("");
      setLoading(true);
      stopTimer();
      timer.current = setInterval(flush, 60);
      try {
        await postStream(
          url,
          body,
          {
            onText: (t) => {
              buffer.current += t;
              setStatus("");
            },
            onStatus: setStatus,
          },
          ctrl.signal,
        );
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        stopTimer();
        flush();
        if (abort.current === ctrl) {
          setLoading(false);
          abort.current = null;
        }
      }
      return buffer.current;
    },
    [flush, stopTimer],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const reset = useCallback(() => {
    buffer.current = "";
    setText("");
    setError("");
    setStatus("");
  }, []);

  return { text, status, error, loading, run, stop, reset, setError };
}
