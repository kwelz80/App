import "server-only";
import type { Tool } from "@/lib/tools";
import type { Effort } from "./anthropic";

export type Options = Record<string, string | boolean>;

const FORMAT = `Format the answer in Markdown. Write math in LaTeX: inline as $...$ and display equations as $$...$$ on their own lines. Never use \\( \\) or \\[ \\] delimiters. Write currency dollar signs as \\$ (for example \\$5) so they aren't read as math.`;

const VOICE = `Write plainly. Avoid filler and stock AI phrases such as "delve", "tapestry", "in today's fast-paced world", "it is important to note", and "in conclusion".`;

/** Keeps only known option ids and allowed values, falling back to defaults. */
export function sanitizeOptions(tool: Tool, raw: unknown): Options {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Options = {};
  for (const f of tool.fields ?? []) {
    const v = input[f.id];
    if (f.type === "toggle") {
      out[f.id] = typeof v === "boolean" ? v : Boolean(f.default);
    } else if (f.type === "select") {
      out[f.id] = typeof v === "string" && f.options?.some((o) => o.value === v) ? v : String(f.default);
    } else {
      out[f.id] = typeof v === "string" ? v.trim().slice(0, 300) : String(f.default);
    }
  }
  return out;
}

function label(tool: Tool, fieldId: string, value: string | boolean): string {
  const f = tool.fields?.find((x) => x.id === fieldId);
  return f?.options?.find((o) => o.value === value)?.label ?? String(value);
}

// ---------- Homework chat ----------

const MODE_RULES: Record<string, string> = {
  solve: `Give a complete, step-by-step solution.
- Number the steps. For each step, say what you do and why in plain words.
- End with a line that starts with "**Final answer:**".
- When it applies, check the answer (substitute it back, estimate, or check units) and say so in one line.`,
  tutor: `Tutor the student. Do NOT give the final answer.
- Give one hint or one guiding question at a time, then stop and let the student try.
- When the student replies, tell them whether they're on track and give the next hint.
- If they're still stuck after several tries, show one more worked step, not the whole solution.`,
  check: `The student wants their work checked.
- Find the first mistake, quote it, and explain what went wrong.
- Let the student fix it. Don't rewrite their full solution unless they ask.
- If everything is correct, say so and point out anything that could be clearer.`,
};

export function chatSystem(tool: Tool, opts: Options, context?: string): string {
  const subject =
    tool.slug === "homework-help" && opts.subject && opts.subject !== "auto"
      ? `The student picked the subject: ${label(tool, "subject", opts.subject)}.`
      : "";
  const mode = MODE_RULES[String(opts.mode)] ?? MODE_RULES.solve;
  const notes = context
    ? `\n\nThe student is asking about their own lecture notes, given below. Answer from the notes first. If the notes don't cover something, say so, then answer from general knowledge.\n\n<notes>\n${context}\n</notes>`
    : "";

  return `You are an accurate, patient tutor for students. You specialize in ${tool.chat?.focus ?? "any school subject"}. ${subject}

When an image or file is attached, start by restating the problem you see in one short line so the student can confirm you read it correctly. If part of it is unreadable, say which part.

${context ? "Answer the student's question clearly and concisely." : mode}

Match the explanation to the student's level. Be concise. For non-math questions, give a direct explanation with a concrete example.

Accuracy matters more than speed. Work carefully and double-check arithmetic.

${FORMAT}${notes}`;
}

// ---------- Streaming generators ----------

interface GenSpec {
  system: string;
  instructions: string;
  effort: Effort;
  webSearch?: boolean;
}

const MATERIAL_NOTE =
  "The student's material is in the attached files and/or the <material> tags. If it's only a topic name, use your own knowledge of that topic.";

export function generateSpec(tool: Tool, opts: Options): GenSpec {
  switch (tool.slug) {
    case "ai-study-guide-maker": {
      const words = { brief: "about 400 words", standard: "about 900 words", detailed: "about 1,800 words" }[
        String(opts.depth)
      ];
      return {
        effort: "medium",
        system: `You turn class material into clear study guides. ${VOICE}\n\n${FORMAT}`,
        instructions: `Create a study guide from the material. ${MATERIAL_NOTE}

Level: ${label(tool, "level", opts.level)}. Length: ${words}.

Use this structure, skipping sections that don't apply:
# <Title>
## Overview
## Key Concepts (short explanation of each)
## Key Terms (a Markdown table: Term | Definition)
## Formulas, Dates, or Facts to Know
## Worked Examples
## Common Mistakes
${opts.practice ? "## Practice Questions (5-8 numbered questions)\n## Answer Key" : ""}

Stick to the material. If you add something the material doesn't cover, mark it "(beyond your notes)".`,
      };
    }
    case "ai-cheat-sheet-maker": {
      const words = { "half-page": "about 250 words", "one-page": "about 500 words", "two-page": "about 1,000 words" }[
        String(opts.length)
      ];
      return {
        effort: "medium",
        system: `You make dense, exam-ready cheat sheets. ${FORMAT}`,
        instructions: `Make a cheat sheet from the material. ${MATERIAL_NOTE}

Target size: ${words}. Maximize information per line.
- No introduction or conclusion. Start with a # title, then ## topic headings.
- Use terse bullets, tables, and formulas. Fragments are fine.
- Put every formula in LaTeX with what each variable means.
${opts.examples ? "- Add a one-line mini example where it helps." : "- No examples."}
- End with a "## Watch out" list of common traps.`,
      };
    }
    case "ai-exam-predictor":
      return {
        effort: "high",
        system: `You are an experienced teacher who predicts exam content from course material. ${VOICE}\n\n${FORMAT}`,
        instructions: `Predict the ${opts.count} questions most likely to appear on the exam. ${MATERIAL_NOTE}

Exam style: ${label(tool, "examType", opts.examType)}.

Base predictions on what the material emphasizes: repeated topics, learning objectives, bolded terms, worked examples, and past questions.

Group questions by topic under ## headings. For each question:
**Q<n>. <question>**
- **Likelihood:** High / Medium
- **Why it's likely:** one sentence pointing to the material
- **Model answer:** a complete answer or worked solution

End with "## Review these first": a short ranked list of topics.`,
      };
    case "essay-writer": {
      const cite = String(opts.citationStyle);
      const web = Boolean(opts.webSources);
      const sourcing =
        cite === "none"
          ? "Don't include citations."
          : web
            ? `Use the web_search tool to find 3-6 credible sources (academic, government, established news, or reference sites). Cite them in ${cite} style in the text and list them at the end under the heading the style uses (References, Works Cited, or Bibliography), including URLs. Only cite sources you actually found in search results.`
            : `Cite in ${cite} style. Never invent sources. Only cite well-known works whose details you are certain of. Where a claim needs support you can't verify, insert [citation needed]. End with the reference list for sources you did cite.`;
      const output = {
        outline: `Write a detailed outline: working title, thesis statement, and for each body section the topic sentence, 2-3 supporting points, and the evidence to look for. End with a conclusion plan.`,
        draft: `Write a complete essay of about ${opts.length} words: a # title, an introduction ending in a clear thesis, body paragraphs that each make one point with evidence and analysis, and a conclusion that does more than repeat the thesis.`,
        thesis: `Write 5 different thesis statements, each taking a different angle. Under each, add one line on how the essay would argue it.`,
      }[String(opts.output)];
      return {
        effort: "medium",
        webSearch: web && cite !== "none",
        system: `You are a skilled writing coach who drafts ${label(tool, "essayType", opts.essayType)} essays. Write at a ${label(tool, "level", opts.level)} level in a natural voice. ${VOICE}\n\nFormat in Markdown.`,
        instructions: `Topic: ${opts.topic || "(see the instructions below)"}
Essay type: ${label(tool, "essayType", opts.essayType)}

${output}

${sourcing}

Follow any assignment instructions, rubric points, or ideas the student gave in the files or <material> tags.`,
      };
    }
    case "ai-paraphraser": {
      const modes: Record<string, string> = {
        standard: "Reword it with new phrasing and sentence structure. Keep the length and tone similar.",
        fluent: "Make it read smoothly and naturally. Fix awkward phrasing.",
        formal: "Make it formal and polished. No contractions or slang.",
        academic: "Make it suitable for academic writing: precise vocabulary and an objective tone.",
        simple: "Make it easy to read. Use short sentences and everyday words, around a 6th-grade reading level.",
        creative: "Reword it with vivid, original phrasing while keeping the meaning.",
        shorten: "Make it about 40% shorter. Keep every key point.",
        expand: "Make it about 50% longer by adding detail and explanation, without inventing facts.",
      };
      return {
        effort: "low",
        system: `You paraphrase text. ${modes[String(opts.mode)] ?? modes.standard}
Rules:
- Keep the original meaning, facts, names, numbers, and quotes.
- Keep the paragraph breaks and the original language.
- Output only the rewritten text. No preamble, no notes.`,
        instructions: "Paraphrase the text in the <material> tags.",
      };
    }
    case "ai-humanizer": {
      const tones: Record<string, string> = {
        natural: "a natural, clear voice",
        casual: "a relaxed, conversational voice with contractions",
        student: "the voice of a thoughtful student writing a class essay",
        professional: "a direct professional voice",
      };
      return {
        effort: "medium",
        system: `You rewrite stiff or robotic text so it reads as if a person wrote it, in ${tones[String(opts.tone)] ?? tones.natural}.
How:
- Vary sentence length and structure. Mix short sentences with longer ones.
- Use plain, specific words. Cut filler, hedging, and throat-clearing.
- Remove stock phrases like "delve", "tapestry", "pivotal", "crucial", "furthermore", "moreover", "in today's world", "it is important to note", "plays a vital role", "landscape".
- Avoid formulaic patterns: rule-of-three lists everywhere, "not only X but also Y", and summary sentences that repeat the paragraph.
- Keep every fact, claim, name, and number. Don't add new facts.
- Keep paragraph breaks.
- Output only the rewritten text.`,
        instructions: "Rewrite the text in the <material> tags.",
      };
    }
    case "ai-note-taker": {
      const formats: Record<string, string> = {
        outline: `Organize as a hierarchical outline: # title, ## main topics, bullets and sub-bullets for details. Bold key terms.`,
        cornell: `Use the Cornell format: # title, then a Markdown table with columns "Cues & Questions" and "Notes" (one row per idea), then a "## Summary" of 3-5 sentences.`,
        summary: `Write # title, a "## Summary" paragraph, "## Key Points" bullets, and "## Key Terms" with short definitions.`,
      };
      return {
        effort: "medium",
        system: `You turn lecture transcripts into clean study notes. ${FORMAT}`,
        instructions: `Turn the lecture transcript in the <material> tags into notes.

${formats[String(opts.format)] ?? formats.outline}

- The transcript comes from speech recognition, so fix obvious mis-heard words from context. Mark anything you can't make sense of as [unclear].
- Drop filler and off-topic chatter.
- If the speaker mentioned homework, deadlines, or exam topics, list them at the end under "## Action Items".`,
      };
    }
    default:
      throw new Error(`No generator for ${tool.slug}`);
  }
}

// ---------- Structured (JSON) tools ----------

export function jsonSpec(tool: Tool, opts: Options): { system: string; instructions: string; effort: Effort } {
  switch (tool.slug) {
    case "ai-quiz-generator": {
      const types =
        opts.types === "mixed"
          ? "a mix of multiple_choice (about 60%), true_false (about 20%), and short_answer (about 20%)"
          : `only ${opts.types}`;
      return {
        effort: "medium",
        system: "You write accurate, fair practice quizzes for students.",
        instructions: `Write a quiz of exactly ${opts.count} questions from the material. ${MATERIAL_NOTE}

Question types: ${types}. Difficulty: ${opts.difficulty}.

Rules:
- Test understanding, not trivia. Cover the most important ideas.
- multiple_choice: exactly 4 options, one correct, with plausible wrong answers. Vary where the correct option appears.
- true_false: options must be exactly ["True", "False"].
- short_answer: options must be [] and correct_index must be -1. Answers should be a word, phrase, or one sentence.
- "answer" always holds the full correct answer text.
- Keep math in LaTeX with $...$.`,
      };
    }
    case "ai-flashcard-maker": {
      const styles: Record<string, string> = {
        term: "front is a term or concept; back is a concise definition or explanation",
        question: "front is a question; back is the answer",
        cloze: "front is a sentence with a key word replaced by _____; back is the missing word plus a short note",
      };
      return {
        effort: "medium",
        system: "You make effective flashcards for active recall.",
        instructions: `Make exactly ${opts.count} flashcards from the material. ${MATERIAL_NOTE}

Style: ${styles[String(opts.style)] ?? styles.term}.
- Keep fronts short. Keep backs under 40 words.
- One idea per card. No duplicates.
- Cover the most important ideas first.
- Keep math in LaTeX with $...$.`,
      };
    }
    case "grammar-checker":
      return {
        effort: "low",
        system: `You are a careful copy editor for ${label(tool, "dialect", opts.dialect)} English.`,
        instructions: `Check the text in the <material> tags.

- Flag ${opts.style ? "grammar, spelling, punctuation, word choice, style, and clarity issues" : "only grammar, spelling, punctuation, and word choice errors (no style or clarity suggestions)"}.
- "original" must be copied exactly from the text, including case and punctuation. Keep it short (a few words) but long enough to be unique.
- Don't flag text that is already correct. Don't change the writer's meaning or voice.
- "corrected_text" is the full text with every fix applied.
- "score" rates the original writing from 0 to 100.`,
      };
    case "ai-detector":
      return {
        effort: "medium",
        system: `You estimate whether a text was written by an AI language model. AI detection is unreliable, so be calibrated and honest about uncertainty.`,
        instructions: `Analyze the text in the <material> tags.

- If it has fewer than about 80 words, set verdict "too_short" and confidence "low".
- Weigh signals for AI: uniform sentence length and rhythm, generic or hedged claims, stock AI vocabulary, symmetrical list-like structure, no specific personal detail, flawless but bland prose.
- Weigh signals for a human: specific personal detail, uneven rhythm, idiosyncratic word choice, typos, strong opinions, digressions.
- Formulaic genres (lab reports, summaries) and writing by English learners often look AI-like. Lower your confidence for these.
- Keep ai_probability between 10 and 90 unless the evidence is overwhelming.
- Give 3-6 signals.
- In "sentences", list every sentence (up to 60) copied exactly from the text, each with its likelihood.`,
      };
    default:
      throw new Error(`No JSON spec for ${tool.slug}`);
  }
}

export const PLAGIARISM_SEARCH_SYSTEM = `You check student writing for plagiarism by searching the web. Report only what you actually find in search results.`;

export const PLAGIARISM_SEARCH_INSTRUCTIONS = `Check the submission in the <material> tags for text copied from published sources.

1. Pick up to 6 of its most distinctive sentences or phrases: specific wording, not common expressions or general facts.
2. Search for each one with web_search. Put exact phrases in quotes.
3. For every real match, report: the excerpt from the submission (copied exactly), the source title, the source URL, and whether it is an exact match, a near-exact match, or a close paraphrase.
4. Generic phrases and common knowledge are not plagiarism.
5. Finish with your estimate of what percentage of the submission matches published sources, and how many phrases you checked.`;

export const PLAGIARISM_FORMAT_INSTRUCTIONS = `Convert the plagiarism report into JSON.
- Include only matches that appear in the report, with their real URLs.
- Each "excerpt" must be copied exactly from the submission.
- If the report found no matches, return an empty matches array and similarity_percent 0.`;
