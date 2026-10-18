"use client";

import { ArrowUp, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { MAX_UPLOAD_BYTES, payloadSize, toPayload } from "@/lib/client/files";
import { useStream } from "@/lib/client/useStream";
import type { Tool } from "@/lib/tools";
import { AttachmentChips, FileInput, type Attachment } from "../FileInput";
import { Markdown } from "../Markdown";
import { Button, CopyButton, ErrorBox, OptionFields, Spinner, cx, defaultOptions, type OptionValues } from "../ui";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  files?: Attachment[];
}

/** Sends recent attachments in full and older ones as a note, to stay under upload limits. */
function toRequestMessages(messages: ChatMessage[]) {
  let budget = MAX_UPLOAD_BYTES;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const files = m.files ?? [];
    const size = payloadSize(files);
    if (files.length && size <= budget) {
      budget -= size;
      out.unshift({ role: m.role, content: m.content, files: files.map(({ name, type, data }) => ({ name, type, data })) });
    } else if (files.length) {
      const note = `[Earlier attachment not resent: ${files.map((f) => f.name).join(", ")}]`;
      out.unshift({ role: m.role, content: `${m.content}\n\n${note}`.trim() });
    } else {
      out.unshift({ role: m.role, content: m.content });
    }
  }
  return out;
}

export function ChatTool({
  tool,
  context,
  placeholder,
  bare,
}: {
  tool: Tool;
  /** Extra material for the tutor (used by the note taker's Q&A). */
  context?: string;
  placeholder?: string;
  bare?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [options, setOptions] = useState<OptionValues>(() => defaultOptions(tool.fields));
  const [fileError, setFileError] = useState("");
  const stream = useStream();
  const endRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length || stream.loading) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, stream.loading]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  async function send(text: string) {
    if (stream.loading) return;
    const content = text.trim();
    if (!content && !files.length) return;
    const next: ChatMessage[] = [...messages, { role: "user", content, files: files.length ? files : undefined }];
    setMessages(next);
    setInput("");
    setFiles([]);
    setFileError("");
    const answer = await stream.run("/api/chat", {
      slug: tool.slug,
      options,
      context,
      messages: toRequestMessages(next),
    });
    if (answer.trim()) setMessages((m) => [...m, { role: "assistant", content: answer }]);
  }

  function retry() {
    const lastUser = messages.at(-1);
    if (!lastUser || lastUser.role !== "user") return;
    setMessages(messages.slice(0, -1));
    setInput(lastUser.content);
    setFiles(lastUser.files ?? []);
    stream.reset();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  async function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    e.preventDefault();
    try {
      const added = await Promise.all(images.map(toPayload));
      setFiles((f) => [...f, ...added].slice(0, 6));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't paste that image.");
    }
  }

  const empty = messages.length === 0 && !stream.loading;
  const lastIsUser = messages.at(-1)?.role === "user";

  return (
    <div className={cx("flex flex-col", !bare && "min-h-[60vh]")}>
      {!context && tool.fields && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <OptionFields fields={tool.fields} values={options} onChange={setOptions} />
          </div>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                stream.stop();
                stream.reset();
                setMessages([]);
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              New chat
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-5" aria-live="polite">
        {empty && tool.chat && !context && (
          <div className="py-6 text-center">
            <p className="text-slate-600 dark:text-slate-300">{tool.chat.greeting}</p>
            {tool.chat.suggestions.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {tool.chat.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full bg-brand-50 px-3 py-1.5 text-left text-sm text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-200 dark:ring-brand-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-white">
                {m.files && m.files.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.files.map((f, j) =>
                      f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={j} src={f.preview} alt={f.name} className="max-h-48 rounded-lg" />
                      ) : (
                        <span key={j} className="rounded bg-white/20 px-2 py-0.5 text-xs">
                          {f.name}
                        </span>
                      ),
                    )}
                  </div>
                )}
                {m.content && <p className="text-sm whitespace-pre-wrap">{m.content}</p>}
              </div>
            </div>
          ) : (
            <div key={i} className="group">
              <Markdown>{m.content}</Markdown>
              <div className="mt-2 opacity-70 transition-opacity group-hover:opacity-100">
                <CopyButton text={m.content} />
              </div>
            </div>
          ),
        )}

        {stream.loading && (
          <div>
            {stream.text ? <Markdown>{stream.text}</Markdown> : <Spinner label={stream.status || "Thinking…"} />}
            {stream.text && stream.status && <p className="mt-2 text-sm text-slate-500">{stream.status}</p>}
          </div>
        )}

        {!stream.loading && stream.error && (
          <div className="space-y-2">
            <ErrorBox message={stream.error} />
            {lastIsUser && (
              <Button variant="secondary" size="sm" onClick={retry}>
                Edit and retry
              </Button>
            )}
          </div>
        )}
        {!stream.loading && !stream.error && stream.status && <p className="text-sm text-slate-500">{stream.status}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 mt-6 bg-white pt-2 pb-1 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <ErrorBox message={fileError} />
        <div className="mt-2 rounded-2xl bg-white p-2 ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-brand-500 dark:bg-slate-950 dark:ring-slate-700">
          <AttachmentChips files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
          <div className="flex items-end gap-1">
            <FileInput files={files} onChange={setFiles} onError={setFileError} compact disabled={stream.loading} />
            <textarea
              ref={textRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder={placeholder ?? (messages.length ? "Ask a follow-up…" : "Type your question, or attach a photo…")}
              aria-label="Your question"
              className="max-h-56 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none"
            />
            {stream.loading ? (
              <Button type="button" variant="secondary" size="sm" onClick={stream.stop} className="h-9 w-9 px-0" aria-label="Stop">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                className="h-9 w-9 px-0"
                disabled={!input.trim() && !files.length}
                aria-label="Send"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-400">AI can make mistakes. Check important answers.</p>
      </form>
    </div>
  );
}
