# StudyDesk

A free, self-hosted set of AI study tools modeled on [Solvely's tool lineup](https://solvely.ai/tools): homework help from photos, math solvers, study guides, quizzes, flashcards, an essay writer, a paraphraser, a grammar checker, an AI detector, a plagiarism checker, and a citation generator. It runs on Claude through the Anthropic API.

You deploy it once with your own API key, then share the link. Anyone with the link (and the access code, if you set one) can use it. No sign-up for your users.

## Tools

| Category | Tools |
|---|---|
| Homework help | AI Homework Helper (any subject, photo upload, follow-ups), Photo Homework Solver |
| Math | AI Math Solver, Word Problem Solver, Equation Solver, Algebra Calculator, Statistics Solver, Geometry Solver, Calculus Solver, Trigonometry Solver, Scientific Calculator*, Fraction Calculator* |
| Subject tutors | Chemistry, Physics, Biology, Economics, English & Literature, History |
| Study | Study Guide Maker, Quiz Generator (interactive, graded), Flashcard Maker (flip, track, export to Anki/Quizlet), Cheat Sheet Maker, Note Taker (live lecture recording + Q&A), Exam Predictor |
| Writing | Essay Writer (optional real web sources), Paraphraser (8 modes), Humanizer, AI Detector, Plagiarism Checker (web search), Grammar Checker, Word Counter*, Citation Generator* (APA, MLA, Chicago, Harvard, IEEE, AMA, ASA, with URL/DOI/ISBN lookup) |

\* Runs in the browser. No AI, no API cost.

Every homework tutor has three modes: full step-by-step solution, hints only (no final answer), and check my work. Teachers can point students at the hints-only mode.

Study tools accept PDFs, Word files, images, and text files.

## Deploy it (about 10 minutes)

You need a GitHub account (you have one), a free [Vercel](https://vercel.com) account, and an [Anthropic API key](https://console.anthropic.com/settings/keys) with billing set up.

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import the `kwelz80/App` repository.
2. Before you click Deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY`: your key.
   - `ACCESS_CODE`: a code you'll give to the people you share with. Strongly recommended. Without it, anyone who finds the link spends your money.
3. Click **Deploy**. Vercel gives you a URL like `your-app.vercel.app`. Share that.
4. In the [Anthropic Console](https://console.anthropic.com/settings/limits), set a monthly spend limit.

Changing an environment variable later requires a redeploy (Vercel → Deployments → ⋯ → Redeploy).

The Plagiarism Checker and the essay writer's "real sources" option use Claude's web search tool. If those fail, turn on web search for your organization in the Anthropic Console.

### Settings

All optional except the API key. See `.env.example`.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Required. |
| `ACCESS_CODE` | none | Users enter it once per browser before using AI tools. |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Set `claude-sonnet-5-5` to cut cost in half. |
| `RATE_LIMIT_REQUESTS` | `60` | Requests per visitor per window. `0` disables. |
| `RATE_LIMIT_WINDOW_MINUTES` | `60` | Rate limit window. |
| `NEXT_PUBLIC_APP_NAME` | `StudyDesk` | Name in the header and page titles. |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | `4` | Upload cap per request. Vercel's hard limit is 4.5 MB. |

## What it costs

You pay Anthropic per use. Rough numbers on the default model (Claude Opus 5.5, $4 per million input tokens, $20 per million output tokens):

- Homework question with a photo: about 3 to 8 cents
- Study guide or quiz from a 20-page PDF: about 20 to 35 cents
- Plagiarism check: about 20 to 40 cents (includes web searches)
- Calculators, word counter, citation formatting: free

Switching to Sonnet 5.5 halves these. Hosting on Vercel's free tier costs nothing for classroom-scale traffic.

## How it differs from Solvely

Solvely's site couldn't be inspected directly, so this matches its public tool list and descriptions, not its internals. Known gaps:

- **No accounts or saved history.** Results live on the page until you leave. Saved citations stay in the browser.
- **No YouTube or audio-file import.** The note taker records live in the browser (Chrome, Edge, Safari). Paste a transcript for anything else.
- **No PowerPoint upload.** Export slides to PDF first.
- **The plagiarism checker searches the public web for a sample of phrases.** It can't see paywalled journals or other students' papers like Turnitin does.
- **The AI detector is an estimate.** All AI detectors, including Solvely's, produce false positives, especially on writing by English learners. The tool says so on the page. Don't treat a score as proof.
- **No mobile app or browser extension.** The site works on phones.

## Before sharing with students

- Student inputs (questions, photos, essays) go to Anthropic's API. Anthropic doesn't train on API data by default, but check your district's data privacy rules before students use it.
- Anthropic's usage policies have extra requirements for apps used by minors. Read them before giving K-12 students access.
- The Humanizer and Essay Writer can be used to dodge assignments. Hints-only mode on the tutors is the safer default for students.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Checks: `npm run lint`, `npx tsc --noEmit`, `npm run build`.

## How it's built

- Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript
- `@anthropic-ai/sdk` with streaming, structured outputs (Zod schemas), the web search tool, PDF and image input, and server-side refusal fallbacks
- KaTeX for math, mathjs for the scientific calculator

```
src/
  app/
    [slug]/page.tsx        one page per tool, generated from the registry
    api/chat               homework tutors (streaming, multi-turn, attachments)
    api/generate           study guide, cheat sheet, exam predictor, essay, paraphrase, humanize, notes
    api/json               quiz, flashcards, grammar, AI detector (structured output)
    api/plagiarism         web search, then structured results
    api/cite               DOI (Crossref), ISBN (Open Library), and web page metadata lookup
  lib/
    tools.ts               tool registry: names, categories, options
    server/prompts.ts      system prompts for every tool
    server/guard.ts        access code and rate limiting
    citation.ts            citation formatting for 7 styles
  components/tools/        one UI component per tool type
```

To add a tutor, add an entry to `TOOLS` in `src/lib/tools.ts` with `chatTool({...})`. The page, card, and API wiring follow from the registry.
