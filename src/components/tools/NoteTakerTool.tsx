"use client";

import { Download, Mic, Pause, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStream } from "@/lib/client/useStream";
import type { Tool } from "@/lib/tools";
import { Markdown } from "../Markdown";
import { Button, Card, CopyButton, ErrorBox, Notice, OptionFields, Spinner, cx, defaultOptions, inputClass, type OptionValues } from "../ui";
import { ChatTool } from "./ChatTool";
import { wordsLabel } from "./ToolInput";

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib everywhere).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const LANGS = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "zh-CN", label: "Chinese (Mandarin)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "ar-SA", label: "Arabic" },
  { value: "hi-IN", label: "Hindi" },
];

const noop = () => () => {};

function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

export function NoteTakerTool({ tool }: { tool: Tool }) {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [recording, setRecording] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState("");
  const supported = useSyncExternalStore(
    noop,
    () => !!getRecognition(),
    () => true,
  );
  const [options, setOptions] = useState<OptionValues>(() => defaultOptions(tool.fields));
  const recRef = useRef<Recognition | null>(null);
  const wantRecording = useRef(false);
  const notes = useStream();

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => {
    wantRecording.current = false;
    recRef.current?.stop();
  }, []);

  function start() {
    const Ctor = getRecognition();
    if (!Ctor) return;
    setMicError("");
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalText = "";
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else pending += r[0].transcript;
      }
      if (finalText) setTranscript((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${finalText.trim()}`);
      setInterim(pending);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRecording.current = false;
        setMicError("Microphone access was blocked. Allow it in your browser's site settings.");
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setMicError(`Transcription error: ${e.error}`);
      }
    };
    // Browsers end recognition after pauses; restart until the user stops.
    rec.onend = () => {
      setInterim("");
      if (wantRecording.current) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to stopped state
        }
      }
      setRecording(false);
    };
    recRef.current = rec;
    wantRecording.current = true;
    try {
      rec.start();
      setRecording(true);
    } catch {
      setMicError("Couldn't start the microphone.");
    }
  }

  function stop() {
    wantRecording.current = false;
    recRef.current?.stop();
    setRecording(false);
  }

  function generate() {
    if (recording) stop();
    if (!transcript.trim()) {
      notes.setError("Record or paste a transcript first.");
      return;
    }
    notes.run("/api/generate", { slug: tool.slug, text: transcript, options });
  }

  function download() {
    const url = URL.createObjectURL(new Blob([notes.text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lecture-notes.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  const notesReady = !!notes.text && !notes.loading;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {supported ? (
            <>
              {recording ? (
                <Button variant="danger" size="lg" onClick={stop} className="ring-1 ring-red-300">
                  <Pause className="size-4" aria-hidden />
                  Pause recording
                </Button>
              ) : (
                <Button size="lg" onClick={start}>
                  <Mic className="size-4" aria-hidden />
                  {transcript ? "Resume recording" : "Start recording"}
                </Button>
              )}
              <div className="flex items-center gap-2 text-sm text-slate-500" aria-live="polite">
                <span className={cx("size-2.5 rounded-full", recording ? "animate-pulse bg-red-500" : "bg-slate-300")} />
                {recording ? "Listening" : "Not recording"} · {clock(seconds)}
              </div>
              <div className="ml-auto">
                <label htmlFor="lang" className="sr-only">
                  Language
                </label>
                <select id="lang" className={inputClass} value={lang} onChange={(e) => setLang(e.target.value)} disabled={recording}>
                  {LANGS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <Notice>
              Live transcription needs Chrome, Edge, or Safari. You can still paste a transcript below, for example from your
              phone&apos;s voice recorder app or a video&apos;s transcript.
            </Notice>
          )}
        </div>
        <ErrorBox message={micError} />

        <div>
          <label htmlFor="transcript" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Transcript
          </label>
          <textarea
            id="transcript"
            value={transcript + (interim ? `${transcript ? " " : ""}${interim}` : "")}
            onChange={(e) => !recording && setTranscript(e.target.value)}
            readOnly={recording}
            rows={10}
            placeholder="Press Start recording during class, or paste a lecture transcript here."
            className={cx(inputClass, "resize-y leading-relaxed")}
          />
          <p className="mt-1 text-right text-xs text-slate-400">{wordsLabel(transcript)}</p>
        </div>

        <OptionFields fields={tool.fields} values={options} onChange={setOptions} />
        <ErrorBox message={!notes.loading && !notes.text ? notes.error : ""} />
        <div className="flex gap-2">
          <Button size="lg" onClick={generate} loading={notes.loading}>
            Generate notes
          </Button>
          {notes.loading && (
            <Button variant="secondary" size="lg" onClick={notes.stop}>
              <Square className="size-4" aria-hidden />
              Stop
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Recording uses your browser&apos;s speech recognition. In Chrome, audio is sent to Google for transcription. Get
          permission before recording other people.
        </p>
      </Card>

      {(notes.text || notes.loading) && (
        <Card className="print-area">
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Your notes</h2>
            {notesReady && (
              <div className="flex gap-2">
                <CopyButton text={notes.text} />
                <Button variant="secondary" size="sm" onClick={download}>
                  <Download className="size-4" aria-hidden />
                  Download
                </Button>
              </div>
            )}
          </div>
          {notes.text ? <Markdown>{notes.text}</Markdown> : <Spinner label="Organizing your notes…" />}
          {notes.error && notes.text && (
            <div className="mt-3">
              <ErrorBox message={notes.error} />
            </div>
          )}
        </Card>
      )}

      {notesReady && (
        <Card>
          <h2 className="mb-1 font-semibold">Ask about your notes</h2>
          <p className="mb-4 text-sm text-slate-500">Questions are answered from your notes and transcript.</p>
          <ChatTool
            tool={tool}
            context={`${notes.text}\n\n--- Original transcript ---\n${transcript}`.slice(0, 190_000)}
            placeholder="e.g. What did the professor say would be on the test?"
            bare
          />
        </Card>
      )}
    </div>
  );
}
