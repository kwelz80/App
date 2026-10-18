// Client-safe tool registry. Server-only prompts live in src/lib/server/prompts.ts.

export type Category = "homework" | "subjects" | "math" | "study" | "writing";

export type ToolKind =
  | "chat"
  | "generate"
  | "quiz"
  | "flashcards"
  | "grammar"
  | "detector"
  | "plagiarism"
  | "notes"
  | "word-counter"
  | "scientific-calculator"
  | "fraction-calculator"
  | "citation";

export type IconName =
  | "sparkles"
  | "calculator"
  | "sigma"
  | "function"
  | "chart"
  | "triangle"
  | "infinity"
  | "flask"
  | "atom"
  | "leaf"
  | "landmark"
  | "coins"
  | "book"
  | "scroll"
  | "list-checks"
  | "layers"
  | "file-text"
  | "mic"
  | "target"
  | "pen"
  | "repeat"
  | "user"
  | "scan"
  | "search"
  | "spell-check"
  | "hash"
  | "quote"
  | "divide"
  | "x"
  | "camera";

export interface FieldOption {
  value: string;
  label: string;
}

export interface ToolField {
  id: string;
  label: string;
  type: "select" | "toggle" | "text";
  options?: FieldOption[];
  default: string | boolean;
  placeholder?: string;
  help?: string;
}

export interface ChatPreset {
  /** Subject or focus the tutor is told to specialize in. */
  focus: string;
  greeting: string;
  suggestions: string[];
}

export interface Tool {
  slug: string;
  name: string;
  /** One-line text for tool cards. */
  short: string;
  /** Subtitle on the tool page. */
  description: string;
  category: Category;
  kind: ToolKind;
  icon: IconName;
  /** Uses the Claude API (needs the server key). */
  ai: boolean;
  featured?: boolean;
  fields?: ToolField[];
  inputLabel?: string;
  inputPlaceholder?: string;
  acceptFiles?: boolean;
  /** Input text is optional when a file is attached or a topic field is filled. */
  inputOptional?: boolean;
  submitLabel?: string;
  sample?: string;
  chat?: ChatPreset;
}

export const CATEGORIES: { id: Category; name: string; blurb: string }[] = [
  {
    id: "homework",
    name: "Homework Help",
    blurb: "Snap a photo or type a question. Get a worked solution you can follow.",
  },
  {
    id: "math",
    name: "Math Solvers & Calculators",
    blurb: "Step-by-step math for every level, plus calculators that run in your browser.",
  },
  {
    id: "subjects",
    name: "Subject Tutors",
    blurb: "Tutors tuned for a single subject.",
  },
  {
    id: "study",
    name: "Study Tools",
    blurb: "Turn notes, PDFs, and slides into guides, quizzes, and flashcards.",
  },
  {
    id: "writing",
    name: "Writing Tools",
    blurb: "Draft, rewrite, check, and cite.",
  },
];

const tutorMode: ToolField = {
  id: "mode",
  label: "Help style",
  type: "select",
  default: "solve",
  options: [
    { value: "solve", label: "Full step-by-step solution" },
    { value: "tutor", label: "Tutor me with hints (no final answer)" },
    { value: "check", label: "Check my work" },
  ],
};

const level: ToolField = {
  id: "level",
  label: "Level",
  type: "select",
  default: "high-school",
  options: [
    { value: "elementary", label: "Elementary school" },
    { value: "middle-school", label: "Middle school" },
    { value: "high-school", label: "High school" },
    { value: "college", label: "College" },
    { value: "graduate", label: "Graduate" },
  ],
};

function chatTool(
  t: Omit<Tool, "kind" | "ai" | "acceptFiles" | "fields"> & { fields?: ToolField[] },
): Tool {
  return {
    kind: "chat",
    ai: true,
    acceptFiles: true,
    fields: t.fields ?? [tutorMode],
    ...t,
  };
}

export const TOOLS: Tool[] = [
  // ---------- Homework help ----------
  chatTool({
    slug: "homework-help",
    name: "AI Homework Helper",
    short: "A 24/7 tutor for any subject. Ask, upload a photo, and ask follow-ups.",
    description:
      "Type a question or upload a photo of your homework. You get a clear, step-by-step explanation, and you can keep asking follow-up questions.",
    category: "homework",
    icon: "sparkles",
    featured: true,
    fields: [
      {
        id: "subject",
        label: "Subject",
        type: "select",
        default: "auto",
        options: [
          { value: "auto", label: "Detect automatically" },
          { value: "math", label: "Math" },
          { value: "physics", label: "Physics" },
          { value: "chemistry", label: "Chemistry" },
          { value: "biology", label: "Biology" },
          { value: "economics", label: "Economics" },
          { value: "accounting", label: "Accounting & Finance" },
          { value: "computer-science", label: "Computer Science" },
          { value: "engineering", label: "Engineering" },
          { value: "english", label: "English & Literature" },
          { value: "history", label: "History & Social Studies" },
          { value: "languages", label: "World Languages" },
          { value: "nursing", label: "Nursing & Health" },
        ],
      },
      tutorMode,
    ],
    chat: {
      focus: "any school subject",
      greeting: "What are you working on? Type the question or upload a photo of it.",
      suggestions: [
        "Explain photosynthesis like I'm in 9th grade",
        "Solve 2x^2 - 7x + 3 = 0",
        "What caused the fall of the Roman Empire?",
      ],
    },
  }),
  chatTool({
    slug: "photo-solver",
    name: "Photo Homework Solver",
    short: "Upload a picture of a problem and get the worked solution.",
    description:
      "Take a picture of a worksheet, textbook page, or handwritten problem. The solver reads it and walks through the answer.",
    category: "homework",
    icon: "camera",
    featured: true,
    chat: {
      focus: "reading problems from photos (worksheets, textbooks, handwriting) and solving them",
      greeting: "Upload a photo of the problem. Add a note if you only need help with one part.",
      suggestions: [],
    },
  }),

  // ---------- Math ----------
  chatTool({
    slug: "math-solver",
    name: "AI Math Solver",
    short: "Step-by-step solutions from arithmetic to calculus.",
    description:
      "Type a math problem or upload a photo. Every step is shown and explained, with the final answer called out.",
    category: "math",
    icon: "sigma",
    featured: true,
    chat: {
      focus: "mathematics at every level, from arithmetic through calculus and linear algebra",
      greeting: "Type a math problem or upload a photo of it.",
      suggestions: [
        "Integrate x*e^x dx",
        "Simplify (3x^2 y)^3 / (9x y^4)",
        "Find the vertex of y = 2x^2 - 8x + 3",
      ],
    },
  }),
  chatTool({
    slug: "word-problem-solver",
    name: "Word Problem Solver",
    short: "Turns word problems into equations and solves them.",
    description:
      "Paste a word problem. The solver pulls out the facts, sets up the equations, solves them, and checks that the answer makes sense.",
    category: "math",
    icon: "file-text",
    chat: {
      focus:
        "math word problems: identify the knowns and unknowns, translate to equations, solve, and check the answer in context",
      greeting: "Paste the word problem.",
      suggestions: [
        "A train leaves at 3 PM going 60 mph. Another leaves at 4 PM going 80 mph on the same track. When does the second catch up?",
        "A rectangle's length is 3 more than twice its width. The perimeter is 36. Find the dimensions.",
      ],
    },
  }),
  chatTool({
    slug: "equation-solver",
    name: "Equation Solver",
    short: "Solve for x: linear, quadratic, systems, and more.",
    description:
      "Enter any equation or system of equations. You get every algebra step and a check of the solution.",
    category: "math",
    icon: "function",
    chat: {
      focus:
        "solving equations and systems of equations (linear, quadratic, polynomial, rational, radical, exponential, logarithmic). Always verify solutions by substitution and flag extraneous roots",
      greeting: "Enter an equation or a system of equations.",
      suggestions: ["3(x - 4) + 2 = 5x - 6", "x^2 + 6x + 5 = 0", "2x + y = 7 and x - y = 2"],
    },
  }),
  chatTool({
    slug: "algebra-calculator",
    name: "Algebra Calculator",
    short: "Simplify, factor, expand, and solve algebra expressions.",
    description:
      "Simplify expressions, factor polynomials, expand products, and solve inequalities with each step explained.",
    category: "math",
    icon: "x",
    chat: {
      focus:
        "algebra: simplifying, factoring, expanding, rational expressions, exponents, radicals, and inequalities",
      greeting: "Enter an expression to simplify, factor, or solve.",
      suggestions: ["Factor 6x^2 + 11x - 10", "Expand (2x - 3)^3", "Solve |2x - 5| < 9"],
    },
  }),
  chatTool({
    slug: "statistics-solver",
    name: "AI Statistics Solver",
    short: "Probability, distributions, hypothesis tests, and regression.",
    description:
      "Statistics and probability problems solved step by step, including which test to use and why.",
    category: "math",
    icon: "chart",
    chat: {
      focus:
        "statistics and probability: descriptive stats, probability rules, distributions, confidence intervals, hypothesis tests, and regression. State assumptions and interpret results in plain words",
      greeting: "Paste a statistics problem or upload a photo.",
      suggestions: [
        "Find the mean, median, and standard deviation of 4, 8, 15, 16, 23, 42",
        "P(A)=0.3, P(B)=0.5, independent. Find P(A or B).",
      ],
    },
  }),
  chatTool({
    slug: "geometry-solver",
    name: "AI Geometry Solver",
    short: "Angles, areas, proofs, and coordinate geometry.",
    description:
      "Upload a diagram or describe the figure. Get the solution with the theorems used at each step.",
    category: "math",
    icon: "triangle",
    chat: {
      focus:
        "geometry: angles, triangles, circles, area, volume, similarity, proofs, and coordinate geometry. Name the theorem or property behind each step",
      greeting: "Describe the figure or upload a photo of the diagram.",
      suggestions: [
        "Find the area of a triangle with sides 7, 8, and 9",
        "Prove that the base angles of an isosceles triangle are equal",
      ],
    },
  }),
  chatTool({
    slug: "calculus-solver",
    name: "Calculus Solver",
    short: "Limits, derivatives, integrals, and series.",
    description: "Limits, derivatives, integrals, and series with every rule named as it is applied.",
    category: "math",
    icon: "infinity",
    chat: {
      focus:
        "calculus: limits, derivatives, integrals, applications, differential equations, and series. Name each rule as you apply it",
      greeting: "Enter a calculus problem.",
      suggestions: ["d/dx of sin(x^2) * ln(x)", "Limit of (1 - cos x)/x^2 as x -> 0", "Integrate 1/(x^2 + 4x + 5) dx"],
    },
  }),
  chatTool({
    slug: "trigonometry-solver",
    name: "Trigonometry Solver",
    short: "Identities, triangles, unit circle, and trig equations.",
    description: "Trig identities, right and oblique triangles, and trig equations solved step by step.",
    category: "math",
    icon: "triangle",
    chat: {
      focus: "trigonometry: unit circle, identities, right and oblique triangles, graphs, and trig equations",
      greeting: "Enter a trig problem.",
      suggestions: ["Prove sin^2(x)/(1 - cos x) = 1 + cos x", "Solve 2sin(x) - 1 = 0 on [0, 2π)"],
    },
  }),
  {
    slug: "scientific-calculator",
    name: "Scientific Calculator",
    short: "A full scientific calculator. Runs in your browser, no AI.",
    description: "Trig, logs, powers, roots, constants, and memory. Works offline in your browser.",
    category: "math",
    kind: "scientific-calculator",
    icon: "calculator",
    ai: false,
  },
  {
    slug: "fraction-calculator",
    name: "Fraction Calculator",
    short: "Add, subtract, multiply, and divide fractions with steps.",
    description: "Works with fractions and mixed numbers. Shows the steps and simplifies the result.",
    category: "math",
    kind: "fraction-calculator",
    icon: "divide",
    ai: false,
  },

  // ---------- Subject tutors ----------
  chatTool({
    slug: "chemistry-solver",
    name: "Chemistry Solver",
    short: "Stoichiometry, balancing equations, gas laws, and more.",
    description: "Balance equations, run stoichiometry, and work through chemistry concepts step by step.",
    category: "subjects",
    icon: "flask",
    chat: {
      focus:
        "chemistry: balancing equations, stoichiometry, gas laws, thermochemistry, equilibrium, acids and bases, and organic basics. Track units and significant figures",
      greeting: "Paste a chemistry problem or upload a photo.",
      suggestions: ["Balance: C3H8 + O2 -> CO2 + H2O", "How many grams of NaCl are in 250 mL of 0.40 M solution?"],
    },
  }),
  chatTool({
    slug: "physics-solver",
    name: "Physics Solver",
    short: "Mechanics, electricity, waves, and energy problems.",
    description: "Physics problems solved with a diagram description, the right formulas, and units tracked throughout.",
    category: "subjects",
    icon: "atom",
    chat: {
      focus:
        "physics: kinematics, forces, energy, momentum, rotation, waves, electricity, magnetism, and thermodynamics. List knowns, pick formulas, track units",
      greeting: "Paste a physics problem or upload a photo.",
      suggestions: ["A ball is thrown up at 15 m/s. How high does it go?", "Find the current through a 12 Ω resistor on a 9 V battery."],
    },
  }),
  chatTool({
    slug: "biology-helper",
    name: "Biology Helper",
    short: "Cells, genetics, evolution, ecology, and anatomy.",
    description: "Clear biology explanations, Punnett squares, and process walkthroughs.",
    category: "subjects",
    icon: "leaf",
    chat: {
      focus: "biology: cells, genetics, evolution, ecology, anatomy, and physiology",
      greeting: "What biology topic or question do you have?",
      suggestions: ["Explain mitosis vs. meiosis", "Cross Aa x Aa. What are the genotype ratios?"],
    },
  }),
  chatTool({
    slug: "economics-helper",
    name: "Economics Helper",
    short: "Micro, macro, supply and demand, and graphs.",
    description: "Economics problems and concepts explained with worked numbers and graph descriptions.",
    category: "subjects",
    icon: "coins",
    chat: {
      focus: "economics: micro and macro, supply and demand, elasticity, market structures, GDP, inflation, and policy",
      greeting: "Ask an economics question or paste a problem.",
      suggestions: ["What happens to equilibrium price if demand rises and supply falls?", "Calculate price elasticity from P: 10→12, Q: 100→80"],
    },
  }),
  chatTool({
    slug: "english-helper",
    name: "English & Literature Helper",
    short: "Reading analysis, themes, grammar, and essay feedback.",
    description: "Analyze texts, find themes and evidence, and get feedback on your writing.",
    category: "subjects",
    icon: "book",
    chat: {
      focus: "English language arts and literature: close reading, themes, literary devices, grammar, and writing feedback",
      greeting: "What are you reading or writing?",
      suggestions: ["What are the main themes of To Kill a Mockingbird?", "Explain the difference between a metaphor and a simile"],
    },
  }),
  chatTool({
    slug: "history-helper",
    name: "History Helper",
    short: "Causes, effects, timelines, and document analysis.",
    description: "History and social studies explained with context, causes, effects, and primary-source analysis.",
    category: "subjects",
    icon: "landmark",
    chat: {
      focus: "history and social studies: causes and effects, timelines, civics, geography, and primary-source analysis",
      greeting: "What history question do you have?",
      suggestions: ["What were the main causes of World War I?", "Summarize the significance of the Bill of Rights"],
    },
  }),

  // ---------- Study ----------
  {
    slug: "ai-study-guide-maker",
    name: "AI Study Guide Maker",
    short: "Turn notes, PDFs, and slides into an organized study guide.",
    description:
      "Upload class notes, a PDF, or paste text. You get a study guide with key concepts, definitions, examples, and practice questions.",
    category: "study",
    kind: "generate",
    icon: "book",
    ai: true,
    featured: true,
    acceptFiles: true,
    inputOptional: true,
    inputLabel: "Your material",
    inputPlaceholder: "Paste notes, a chapter, or a lecture transcript. Or upload a file. Or type a topic like \"The French Revolution\".",
    submitLabel: "Create study guide",
    fields: [
      level,
      {
        id: "depth",
        label: "Length",
        type: "select",
        default: "standard",
        options: [
          { value: "brief", label: "Brief" },
          { value: "standard", label: "Standard" },
          { value: "detailed", label: "Detailed" },
        ],
      },
      { id: "practice", label: "Include practice questions", type: "toggle", default: true },
    ],
  },
  {
    slug: "ai-quiz-generator",
    name: "AI Quiz Generator",
    short: "Make a practice quiz from any notes or file, then take it here.",
    description:
      "Upload notes or paste text. Get an interactive quiz with multiple choice, true/false, and short answer questions, with explanations.",
    category: "study",
    kind: "quiz",
    icon: "list-checks",
    ai: true,
    featured: true,
    acceptFiles: true,
    inputOptional: true,
    inputLabel: "Your material",
    inputPlaceholder: "Paste notes or text, upload a file, or type a topic.",
    submitLabel: "Generate quiz",
    fields: [
      {
        id: "count",
        label: "Questions",
        type: "select",
        default: "10",
        options: ["5", "10", "15", "20", "30"].map((v) => ({ value: v, label: v })),
      },
      {
        id: "types",
        label: "Question types",
        type: "select",
        default: "mixed",
        options: [
          { value: "mixed", label: "Mixed" },
          { value: "multiple_choice", label: "Multiple choice only" },
          { value: "true_false", label: "True / false only" },
          { value: "short_answer", label: "Short answer only" },
        ],
      },
      {
        id: "difficulty",
        label: "Difficulty",
        type: "select",
        default: "medium",
        options: [
          { value: "easy", label: "Easy" },
          { value: "medium", label: "Medium" },
          { value: "hard", label: "Hard" },
        ],
      },
    ],
  },
  {
    slug: "ai-flashcard-maker",
    name: "AI Flashcard Maker",
    short: "Turn notes and PDFs into flashcards. Study them or export to Anki/Quizlet.",
    description:
      "Upload notes or paste text and get a deck of flashcards. Flip, shuffle, track what you know, and export to CSV.",
    category: "study",
    kind: "flashcards",
    icon: "layers",
    ai: true,
    featured: true,
    acceptFiles: true,
    inputOptional: true,
    inputLabel: "Your material",
    inputPlaceholder: "Paste notes, a vocab list, or text. Or upload a file. Or type a topic.",
    submitLabel: "Make flashcards",
    fields: [
      {
        id: "count",
        label: "Cards",
        type: "select",
        default: "20",
        options: ["10", "20", "30", "40", "60"].map((v) => ({ value: v, label: v })),
      },
      {
        id: "style",
        label: "Card style",
        type: "select",
        default: "term",
        options: [
          { value: "term", label: "Term → definition" },
          { value: "question", label: "Question → answer" },
          { value: "cloze", label: "Fill in the blank" },
        ],
      },
    ],
  },
  {
    slug: "ai-cheat-sheet-maker",
    name: "AI Cheat Sheet Maker",
    short: "A dense one-page review sheet of formulas and key facts.",
    description:
      "Condense a unit into a printable one-page sheet of formulas, definitions, and must-know facts.",
    category: "study",
    kind: "generate",
    icon: "scroll",
    ai: true,
    acceptFiles: true,
    inputOptional: true,
    inputLabel: "Your material",
    inputPlaceholder: "Paste notes or upload a file. Or type a topic like \"AP Chemistry Unit 4\".",
    submitLabel: "Create cheat sheet",
    fields: [
      {
        id: "length",
        label: "Size",
        type: "select",
        default: "one-page",
        options: [
          { value: "half-page", label: "Half page" },
          { value: "one-page", label: "One page" },
          { value: "two-page", label: "Two pages" },
        ],
      },
      { id: "examples", label: "Include mini examples", type: "toggle", default: true },
    ],
  },
  {
    slug: "ai-note-taker",
    name: "AI Note Taker",
    short: "Record a class live or paste a transcript. Get organized notes and ask questions.",
    description:
      "Record a lecture in your browser or paste a transcript. You get clean, organized notes, then you can ask questions about them.",
    category: "study",
    kind: "notes",
    icon: "mic",
    ai: true,
    featured: true,
    fields: [
      {
        id: "format",
        label: "Note format",
        type: "select",
        default: "outline",
        options: [
          { value: "outline", label: "Outline" },
          { value: "cornell", label: "Cornell notes" },
          { value: "summary", label: "Summary + key points" },
        ],
      },
    ],
  },
  {
    slug: "ai-exam-predictor",
    name: "AI Exam Predictor",
    short: "Predict likely exam questions from your course material.",
    description:
      "Upload your syllabus, notes, or past quizzes. Get the questions most likely to show up, why they're likely, and model answers.",
    category: "study",
    kind: "generate",
    icon: "target",
    ai: true,
    acceptFiles: true,
    inputOptional: true,
    inputLabel: "Course material",
    inputPlaceholder: "Paste a syllabus, study guide, notes, or past questions. Or upload files.",
    submitLabel: "Predict exam questions",
    fields: [
      {
        id: "count",
        label: "Questions",
        type: "select",
        default: "10",
        options: ["5", "10", "15", "20"].map((v) => ({ value: v, label: v })),
      },
      {
        id: "examType",
        label: "Exam type",
        type: "select",
        default: "mixed",
        options: [
          { value: "mixed", label: "Mixed" },
          { value: "multiple-choice", label: "Multiple choice" },
          { value: "free-response", label: "Free response / essay" },
          { value: "problem-solving", label: "Problem solving" },
        ],
      },
    ],
  },

  // ---------- Writing ----------
  {
    slug: "essay-writer",
    name: "AI Essay Writer",
    short: "Outline or draft an essay, with real sources if you want them.",
    description:
      "Give a topic and requirements. Get an outline or a full draft, with citations pulled from real web sources when you turn that on.",
    category: "writing",
    kind: "generate",
    icon: "pen",
    ai: true,
    featured: true,
    acceptFiles: true,
    inputOptional: true,
    inputLabel: "Instructions or prompt",
    inputPlaceholder: "Paste the assignment prompt, rubric notes, or points you want to make (optional).",
    submitLabel: "Write",
    fields: [
      {
        id: "topic",
        label: "Topic",
        type: "text",
        default: "",
        placeholder: "e.g. Should schools start later in the morning?",
      },
      {
        id: "output",
        label: "Output",
        type: "select",
        default: "draft",
        options: [
          { value: "outline", label: "Outline only" },
          { value: "draft", label: "Full draft" },
          { value: "thesis", label: "Thesis statements" },
        ],
      },
      {
        id: "essayType",
        label: "Essay type",
        type: "select",
        default: "argumentative",
        options: [
          { value: "argumentative", label: "Argumentative" },
          { value: "persuasive", label: "Persuasive" },
          { value: "expository", label: "Expository" },
          { value: "analytical", label: "Literary / analytical" },
          { value: "compare-contrast", label: "Compare & contrast" },
          { value: "narrative", label: "Narrative" },
          { value: "research", label: "Research paper" },
        ],
      },
      {
        id: "length",
        label: "Length",
        type: "select",
        default: "500",
        options: [
          { value: "300", label: "~300 words" },
          { value: "500", label: "~500 words" },
          { value: "800", label: "~800 words" },
          { value: "1200", label: "~1,200 words" },
          { value: "2000", label: "~2,000 words" },
        ],
      },
      level,
      {
        id: "citationStyle",
        label: "Citation style",
        type: "select",
        default: "none",
        options: [
          { value: "none", label: "No citations" },
          { value: "APA 7", label: "APA" },
          { value: "MLA 9", label: "MLA" },
          { value: "Chicago 17", label: "Chicago" },
          { value: "Harvard", label: "Harvard" },
          { value: "IEEE", label: "IEEE" },
        ],
      },
      {
        id: "webSources",
        label: "Find real sources on the web",
        type: "toggle",
        default: false,
        help: "Searches the web so citations point to real pages. Slower.",
      },
    ],
  },
  {
    slug: "ai-paraphraser",
    name: "AI Paraphraser",
    short: "Reword any text in the tone you choose.",
    description: "Rewrite text in a new way while keeping the meaning. Pick a mode to change tone or length.",
    category: "writing",
    kind: "generate",
    icon: "repeat",
    ai: true,
    featured: true,
    inputLabel: "Text to paraphrase",
    inputPlaceholder: "Paste the text you want to reword.",
    submitLabel: "Paraphrase",
    sample:
      "Climate change is a significant and lasting change in the statistical distribution of weather patterns over periods ranging from decades to millions of years. It may be a change in average weather conditions, or in the distribution of weather around the average conditions.",
    fields: [
      {
        id: "mode",
        label: "Mode",
        type: "select",
        default: "standard",
        options: [
          { value: "standard", label: "Standard" },
          { value: "fluent", label: "Fluent" },
          { value: "formal", label: "Formal" },
          { value: "academic", label: "Academic" },
          { value: "simple", label: "Simple" },
          { value: "creative", label: "Creative" },
          { value: "shorten", label: "Shorten" },
          { value: "expand", label: "Expand" },
        ],
      },
    ],
  },
  {
    slug: "ai-humanizer",
    name: "AI Humanizer",
    short: "Rewrite stiff, robotic text so it reads like a person wrote it.",
    description:
      "Rewrite flat or robotic text in a natural voice with varied sentences and plain wording. Meaning stays the same.",
    category: "writing",
    kind: "generate",
    icon: "user",
    ai: true,
    inputLabel: "Text to humanize",
    inputPlaceholder: "Paste the text you want to sound more natural.",
    submitLabel: "Humanize",
    sample:
      "In today's fast-paced world, it is crucial to recognize that technology plays a pivotal role in shaping our daily lives. Furthermore, it is important to note that the integration of digital tools has fundamentally transformed the educational landscape, fostering unprecedented opportunities for learners.",
    fields: [
      {
        id: "tone",
        label: "Voice",
        type: "select",
        default: "natural",
        options: [
          { value: "natural", label: "Natural" },
          { value: "casual", label: "Casual" },
          { value: "student", label: "Student essay" },
          { value: "professional", label: "Professional" },
        ],
      },
    ],
  },
  {
    slug: "ai-detector",
    name: "AI Detector",
    short: "Estimate how likely a text is AI-generated, sentence by sentence.",
    description:
      "Paste text to get an estimate of AI involvement with the sentences and patterns that drove the score. Treat it as a conversation starter, not proof.",
    category: "writing",
    kind: "detector",
    icon: "scan",
    ai: true,
    inputLabel: "Text to analyze",
    inputPlaceholder: "Paste at least a paragraph. Longer samples give more useful results.",
    submitLabel: "Analyze text",
  },
  {
    slug: "plagiarism-checker",
    name: "Plagiarism Checker",
    short: "Search the web for passages that match your text.",
    description:
      "Searches the web for distinctive phrases in your text and lists matching sources. It checks a sample of phrases, so treat a clean result as a good sign, not a guarantee.",
    category: "writing",
    kind: "plagiarism",
    icon: "search",
    ai: true,
    inputLabel: "Text to check",
    inputPlaceholder: "Paste the text to check (up to about 1,500 words).",
    submitLabel: "Check for plagiarism",
  },
  {
    slug: "grammar-checker",
    name: "Grammar Checker",
    short: "Fix grammar, spelling, and punctuation with explanations.",
    description:
      "Find and fix grammar, spelling, punctuation, and clarity issues. Accept fixes one by one or all at once.",
    category: "writing",
    kind: "grammar",
    icon: "spell-check",
    ai: true,
    inputLabel: "Text to check",
    inputPlaceholder: "Paste your writing.",
    submitLabel: "Check grammar",
    sample:
      "Their going to the libary tomorow, but me and him wasnt sure if it's open. The book have alot of informations that we needs for are project.",
    fields: [
      {
        id: "dialect",
        label: "English",
        type: "select",
        default: "US",
        options: [
          { value: "US", label: "American" },
          { value: "UK", label: "British" },
          { value: "CA", label: "Canadian" },
          { value: "AU", label: "Australian" },
        ],
      },
      { id: "style", label: "Include style and clarity tips", type: "toggle", default: true },
    ],
  },
  {
    slug: "word-counter",
    name: "Word Counter",
    short: "Count words, characters, sentences, and reading time.",
    description: "Live counts of words, characters, sentences, paragraphs, and reading time. Runs in your browser.",
    category: "writing",
    kind: "word-counter",
    icon: "hash",
    ai: false,
  },
  {
    slug: "citation-generator",
    name: "Citation Generator",
    short: "APA, MLA, Chicago, Harvard, IEEE, AMA, and ASA citations.",
    description:
      "Look up a source by URL, DOI, or ISBN, or enter it by hand. Get the reference entry and in-text citation in seven styles.",
    category: "writing",
    kind: "citation",
    icon: "quote",
    ai: false,
  },
];

export function getTool(slug: string): Tool | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolsIn(category: Category): Tool[] {
  return TOOLS.filter((t) => t.category === category);
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "StudyDesk";
