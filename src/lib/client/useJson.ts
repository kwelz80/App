"use client";

import { useCallback, useRef, useState } from "react";
import { errorMessage, postJson } from "./api";

/** Runs a JSON request and tracks loading and error state. */
export function useJson<T>() {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async (url: string, body: unknown) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    setError("");
    setData(null);
    try {
      setData(await postJson<T>(url, body, ctrl.signal));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      if (abort.current === ctrl) setLoading(false);
    }
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    setLoading(false);
  }, []);

  return { data, setData, error, loading, run, stop };
}
