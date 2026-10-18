// Browser helpers for calling the API routes. Handles the optional access code
// and the NDJSON stream format sent by the server.

const CODE_KEY = "studydesk-access-code";

type CodePrompt = (resolve: (code: string | null) => void, error?: string) => void;
let codePrompt: CodePrompt | null = null;

/** The AccessCodeDialog registers itself here so any request can ask for a code. */
export function registerCodePrompt(fn: CodePrompt) {
  codePrompt = fn;
  return () => {
    if (codePrompt === fn) codePrompt = null;
  };
}

function askForCode(error?: string): Promise<string | null> {
  if (!codePrompt) return Promise.resolve(window.prompt(error ?? "Enter the access code") || null);
  return new Promise((resolve) => codePrompt!(resolve, error));
}

function storedCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) || "";
  } catch {
    return "";
  }
}

function storeCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    // private mode: the code lasts until the page reloads
  }
  memoryCode = code;
}
let memoryCode = "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function apiFetch(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": storedCode() || memoryCode },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) return res;

    let data: { error?: string; code?: string } = {};
    try {
      data = await res.json();
    } catch {
      // non-JSON error page (for example a host's upload limit)
    }
    if (res.status === 401 && data.code === "access_code_required") {
      const code = await askForCode(lastError);
      if (!code) throw new ApiError("An access code is required to use this tool.", 401, data.code);
      storeCode(code.trim());
      lastError = "That code didn't work. Try again.";
      continue;
    }
    if (res.status === 413) throw new ApiError("That upload is too large. Try smaller or fewer files.", 413);
    throw new ApiError(data.error || `Something went wrong (error ${res.status}).`, res.status, data.code);
  }
  throw new ApiError("The access code wasn't accepted.", 401);
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await apiFetch(url, body, signal);
  return (await res.json()) as T;
}

export interface StreamHandlers {
  onText: (chunk: string) => void;
  onStatus?: (status: string) => void;
}

/** POSTs and reads the server's NDJSON event stream. Throws ApiError on a streamed error. */
export async function postStream(url: string, body: unknown, handlers: StreamHandlers, signal?: AbortSignal) {
  const res = await apiFetch(url, body, signal);
  if (!res.body) throw new ApiError("No response from the server.", 500);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError: string | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const ev = JSON.parse(line) as { t: string; v?: string };
    if (ev.t === "text" && ev.v) handlers.onText(ev.v);
    else if (ev.t === "status" && ev.v) handlers.onStatus?.(ev.v);
    else if (ev.t === "error") streamError = ev.v ?? "Something went wrong.";
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer);
  if (streamError) throw new ApiError(streamError, 200);
}

export function errorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "";
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
