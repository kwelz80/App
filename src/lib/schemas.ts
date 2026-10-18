import { z } from "zod";

// Shared between the API routes (structured outputs) and the tool UIs (types).
// The SDK sends enums to the API as hints only, so each enum has a .catch()
// fallback: an unexpected value degrades gracefully instead of failing the parse.

export const QuizSchema = z.object({
  title: z.string(),
  questions: z.array(
    z.object({
      type: z.enum(["multiple_choice", "true_false", "short_answer"]).catch("multiple_choice"),
      question: z.string(),
      options: z.array(z.string()).describe("Answer choices. Empty array for short_answer. ['True','False'] for true_false."),
      correct_index: z.number().describe("Index into options of the correct choice. -1 for short_answer."),
      answer: z.string().describe("The correct answer written out in full."),
      explanation: z.string().describe("One to three sentences on why the answer is correct."),
    }),
  ),
});
export type Quiz = z.infer<typeof QuizSchema>;

export const FlashcardsSchema = z.object({
  title: z.string(),
  cards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      hint: z.string().describe("A short hint, or an empty string."),
    }),
  ),
});
export type Flashcards = z.infer<typeof FlashcardsSchema>;

export const GrammarSchema = z.object({
  score: z.number().describe("Writing quality score from 0 to 100."),
  summary: z.string(),
  corrected_text: z.string().describe("The full text with every fix applied."),
  issues: z.array(
    z.object({
      original: z.string().describe("Exact substring copied from the input that has the problem. Keep it short but unique."),
      replacement: z.string(),
      type: z.enum(["grammar", "spelling", "punctuation", "word_choice", "style", "clarity"]).catch("grammar"),
      explanation: z.string(),
    }),
  ),
});
export type Grammar = z.infer<typeof GrammarSchema>;

export const DetectorSchema = z.object({
  ai_probability: z.number().describe("Estimated probability from 0 to 100 that the text is mostly AI-generated."),
  verdict: z.enum(["likely_human", "mixed", "likely_ai", "too_short"]).catch("mixed"),
  confidence: z.enum(["low", "medium", "high"]).catch("low"),
  summary: z.string(),
  signals: z.array(
    z.object({
      label: z.string(),
      direction: z.enum(["ai", "human"]).catch("ai"),
      detail: z.string(),
    }),
  ),
  sentences: z.array(
    z.object({
      text: z.string().describe("A sentence copied exactly from the input."),
      likelihood: z.enum(["low", "medium", "high"]).catch("low"),
    }),
  ),
});
export type Detector = z.infer<typeof DetectorSchema>;

export const PlagiarismSchema = z.object({
  similarity_percent: z.number().describe("Estimated share of the submission (0-100) that matches published sources."),
  summary: z.string(),
  matches: z.array(
    z.object({
      excerpt: z.string().describe("Exact passage copied from the submission."),
      source_title: z.string(),
      source_url: z.string(),
      match_type: z.enum(["exact", "near_exact", "paraphrase"]).catch("near_exact"),
      note: z.string(),
    }),
  ),
  phrases_checked: z.number(),
});
export type Plagiarism = z.infer<typeof PlagiarismSchema>;

/** Files sent from the browser as base64. */
export const FilePayloadSchema = z.object({
  name: z.string().max(300),
  type: z.string().max(200),
  data: z.string(),
});
export type FilePayload = z.infer<typeof FilePayloadSchema>;
