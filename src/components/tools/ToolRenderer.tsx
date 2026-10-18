"use client";

import dynamic from "next/dynamic";
import { getTool } from "@/lib/tools";
import { Spinner } from "../ui";

const loading = () => <Spinner label="Loading…" />;

const ChatTool = dynamic(() => import("./ChatTool").then((m) => m.ChatTool), { loading });
const GenerateTool = dynamic(() => import("./GenerateTool").then((m) => m.GenerateTool), { loading });
const QuizTool = dynamic(() => import("./QuizTool").then((m) => m.QuizTool), { loading });
const FlashcardTool = dynamic(() => import("./FlashcardTool").then((m) => m.FlashcardTool), { loading });
const GrammarTool = dynamic(() => import("./GrammarTool").then((m) => m.GrammarTool), { loading });
const DetectorTool = dynamic(() => import("./DetectorTool").then((m) => m.DetectorTool), { loading });
const PlagiarismTool = dynamic(() => import("./PlagiarismTool").then((m) => m.PlagiarismTool), { loading });
const NoteTakerTool = dynamic(() => import("./NoteTakerTool").then((m) => m.NoteTakerTool), { loading });
const WordCounterTool = dynamic(() => import("./WordCounterTool").then((m) => m.WordCounterTool), { loading });
const ScientificCalculatorTool = dynamic(() => import("./ScientificCalculatorTool").then((m) => m.ScientificCalculatorTool), { loading });
const FractionCalculatorTool = dynamic(() => import("./FractionCalculatorTool").then((m) => m.FractionCalculatorTool), { loading });
const CitationTool = dynamic(() => import("./CitationTool").then((m) => m.CitationTool), { loading });

export function ToolRenderer({ slug }: { slug: string }) {
  const tool = getTool(slug);
  if (!tool) return null;
  switch (tool.kind) {
    case "chat":
      return (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6 dark:bg-slate-900 dark:ring-slate-800">
          <ChatTool tool={tool} />
        </div>
      );
    case "generate":
      return <GenerateTool tool={tool} />;
    case "quiz":
      return <QuizTool tool={tool} />;
    case "flashcards":
      return <FlashcardTool tool={tool} />;
    case "grammar":
      return <GrammarTool tool={tool} />;
    case "detector":
      return <DetectorTool tool={tool} />;
    case "plagiarism":
      return <PlagiarismTool tool={tool} />;
    case "notes":
      return <NoteTakerTool tool={tool} />;
    case "word-counter":
      return <WordCounterTool />;
    case "scientific-calculator":
      return <ScientificCalculatorTool />;
    case "fraction-calculator":
      return <FractionCalculatorTool />;
    case "citation":
      return <CitationTool />;
  }
}
