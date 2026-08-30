import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PioSessionState } from "../../runtime/session-state";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";

/** Store variable carrying the array of pending research questions. */
const QUESTIONS_VAR = "questions";

/** Store variable carrying the question text currently being answered. */
const NEXT_QUESTION_VAR = "nextQuestion";

/** Store variable carrying whether the current answer was judged satisfactory. */
const QUESTION_ANSWERED_VAR = "questionAnswered";

/** Store variable carrying newly-generated questions awaiting a merge. */
const NEW_QUESTIONS_VAR = "new_questions";

/** Store variable carrying the absolute path of this session's notes file. */
const NOTES_VAR = "notes_path";

/** Store variable carrying the absolute path of this session's answers directory. */
const ANSWERS_DIR_VAR = "answers_dir";

/** Store variable carrying the absolute path of the current question's answer file. */
const ANSWER_PATH_VAR = "answer_path";

/** Session-scoped scratch directory (removed by the cleanup phase; OS also reclaims /tmp). */
const SCRATCH_DIR = "/tmp/pio-project-context";

/** Read the `questions` queue as an array (defensive — never throws). */
function questionsOf(state: PioSessionState): string[] {
  const q = state.store?.get(QUESTIONS_VAR);
  return Array.isArray(q) ? (q as string[]) : [];
}

/** True iff any question remains in the queue. Total — never throws. */
function hasQuestions(state: PioSessionState): boolean {
  return questionsOf(state).length > 0;
}

/** mtime of a file in milliseconds (0 on stat failure) — total, never throws. */
function mtimeOf(file: string): number {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Content-addressed name for a question's dedicated answer file. A pure
 * function of the question text: a short hash of the question, so the same
 * question always maps to the same file (refine-answer rewrites it) with no
 * counter to keep aligned. A single hash is unambiguous — a slug would
 * reintroduce a truncation-collision risk that could silently merge two
 * questions into one file.
 */
function answerFileName(question: string): string {
  const hash = createHash("sha256").update(question).digest("hex").slice(0, 8);
  return `q-${hash}.md`;
}

/**
 * True iff the current question's dedicated answer file exists and is
 * non-empty on disk. Each question owns its own file (a content-addressed
 * name derived from the question text), so a
 * non-empty existence check is unambiguous — no substring or size-baseline
 * detection needed. Total — never throws (missing/empty/unreadable file ⇒
 * false, so the durability loop keeps replaying until the answer lands).
 */
function answerFileWritten(state: PioSessionState): boolean {
  const answerPath = state.store?.get(ANSWER_PATH_VAR);
  if (typeof answerPath !== "string" || answerPath === "") {
    return false;
  }
  try {
    const stat = fs.statSync(answerPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

/**
 * Best-effort, total consolidation: concatenate every per-question answer
 * file (`q-*.md`) in mtime order (approximating answer order) into the notes
 * file, preserving the `# Research Notes` header. Unreadable/missing files
 * and a missing answers dir are skipped — never throws.
 */
function mergeAnswersIntoNotes(state: PioSessionState): void {
  const notesPath = state.store?.get(NOTES_VAR);
  const answersDir = state.store?.get(ANSWERS_DIR_VAR);
  if (typeof notesPath !== "string" || typeof answersDir !== "string") {
    return;
  }
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(answersDir)
      .filter((f) => /^q-.+\.md$/.test(f))
      .sort(
        (a, b) =>
          mtimeOf(path.join(answersDir, a)) - mtimeOf(path.join(answersDir, b)),
      );
  } catch {
    // answers dir missing/unreadable — best-effort, leave notes unchanged
  }
  const sections: string[] = [];
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(answersDir, f), "utf8");
      if (content.trim() !== "") {
        sections.push(content.trim());
      }
    } catch {
      // skip unreadable answer file
    }
  }
  const body = sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
  try {
    fs.writeFileSync(notesPath, `# Research Notes\n${body}\n`, "utf8");
  } catch {
    // best-effort — notes write failure is non-fatal
  }
}

/** Default open-question seed — the coverage floor that cannot be skipped. */
const DEFAULT_QUESTIONS = [
  "What is the top-level directory tree of the project, and what is each top-level area for?",
  "How many git repositories does the project contain (embedded .git directories, submodules, workspaces), and how do they relate?",
  "What languages, frameworks, and runtime versions define the project (per dependency manifests)?",
  "What are the build, test, lint, and packaging commands, and what does CI run?",
  "How is source organized, and where do tests live relative to source (conventions + runner config)?",
  "Which external services/integrations does the project depend on (databases, APIs, brokers, caches, SDKs)?",
  "What are the main entry points / executables / packages a contributor must know?",
  "What domain terminology or acronyms recur that a newcomer would need?",
  "What is the deployment or release mechanism, if any (targets, pipelines, artifact distribution, environments)?",
  "Where do documentation references live — in-repo docs and external references?",
  "Which agentic coding instruction files exist (CLAUDE.md, AGENTS.md, CURSOR.md, .github/copilot-instructions.md, or similar), and what conventions or rules do they encode for agents working on this repo?",
  "What is the project's purpose, who maintains it, and what license and repository reference apply?",
  "What is needed to run the project locally (environment variables, configs, secrets, and start commands)?",
  "What coding style and formatting conventions do the editor and lint configs encode (indentation, line length, quotes, semicolons, naming, and the lint/format tools and how to run them)?",
  "What are the git commit and release conventions (commit message format, types and scope usage, tag/versioning scheme, branch naming, and merge or signing practices)?",
  "What architecture patterns and key design decisions structure the project, and are there Architecture Decision Records (ADRs)?",
];

/**
 * Shared write-phase boilerplate appended to each file-specific write
 * instructions. References the accumulating notes file (${notes_path}) as the
 * research source and sets the quality bar — identical across all 7 writes.
 */
export default [
  // ---------------------------------------------------------------------------
  // Default Questions — seed the question queue + answers dir + notes file
  // (programmatic)
  // ---------------------------------------------------------------------------
  {
    id: "default-questions",
    title: "Default Questions",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      ctx.state.store?.set(QUESTIONS_VAR, "array", [...DEFAULT_QUESTIONS]);
      const dir = path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      const answersDir = path.join(dir, "answers");
      const notesPath = path.join(dir, "notes.md");
      fs.mkdirSync(answersDir, { recursive: true });
      // Fresh start — clear any stale answer files from a prior seed in this dir.
      for (const f of fs.readdirSync(answersDir)) {
        fs.rmSync(path.join(answersDir, f), { force: true });
      }
      fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
      ctx.state.store?.set(NOTES_VAR, "string", notesPath);
      ctx.state.store?.set(ANSWERS_DIR_VAR, "string", answersDir);
    },
  },

  // ---------------------------------------------------------------------------
  // Research Loop — seeded discovery: drain the queue (inner loop, one
  // dedicated per-question answer file each), consolidate into notes, then
  // generate genuinely new questions (outer do-while repeats while any remain)
  // ---------------------------------------------------------------------------
  {
    id: "research-loop",
    title: "Research Loop",
    kind: "loop",
    maxIterations: 10,
    repeatWhile: hasQuestions,
    body: [
      // -----------------------------------------------------------------------
      // Inner loop — process the queue one question per pass (do-while)
      // -----------------------------------------------------------------------
      {
        id: "answer-questions",
        title: "Answer the Question Queue",
        kind: "loop",
        maxIterations: 30,
        repeatWhile: hasQuestions,
        body: [
          // Reset per-pass answer state so no stale value leaks from a prior pass
          {
            id: "reset-vars",
            title: "Reset Answer State",
            kind: "variable-definition",
            variables: [
              {
                name: QUESTION_ANSWERED_VAR,
                type: "boolean",
                kind: "static",
                value: false,
              },
              {
                name: NEXT_QUESTION_VAR,
                type: "string",
                kind: "static",
                value: "",
              },
            ],
          },
          // Peek the front question into nextQuestion and derive this
          // question's dedicated answer file path. Does NOT pop — the pop is
          // conditional on a satisfactory answer. The filename is a pure
          // function of the question text, so refine-answer rewrites the same
          // file with no counter to keep aligned.
          {
            id: "get-next-question",
            title: "Get Next Question",
            kind: "code",
            run: (ctx: CodeStepContext) => {
              const questions = questionsOf(ctx.state);
              const question = questions[0] ?? "";
              ctx.state.store?.set(NEXT_QUESTION_VAR, "string", question);
              const rawDir = ctx.state.store?.get(ANSWERS_DIR_VAR);
              const dir =
                typeof rawDir === "string"
                  ? rawDir
                  : path.join(
                      SCRATCH_DIR,
                      ctx.state.sessionId ?? "unknown",
                      "answers",
                    );
              ctx.state.store?.set(
                ANSWER_PATH_VAR,
                "string",
                path.join(dir, answerFileName(question)),
              );
            },
          },
          // LLM: research the codebase, produce the answer, and write it to
          // this question's dedicated file. Mechanical completeness: replays
          // until the file exists and is non-empty.
          {
            id: "answer-question",
            title: "Answer the Question",
            maxIterations: 2,
            loopWhile: [
              {
                type: "callback",
                callback: (state: PioSessionState) => !answerFileWritten(state),
              },
            ],
            instructions: `Answer this research question for the project-context files and write the answer to its dedicated file at \`\${answer_path}\`.

**Question:** \`\${nextQuestion}\`

Research the codebase to produce a complete, well-grounded answer. Read files and run read-only commands as needed. When the question is structural (e.g. the directory tree), produce its listing via a single shell command so it lands in context for later reference (enumerate once — do not re-enumerate).

If the question can only be answered by the user (it depends on external context not present in the repo), call \`ask_user\` with \`displayMode: "inline"\` to ask it, then use the user's answer.

Write the final answer to \`\${answer_path}\` (under /tmp — writes there are not blocked by the write gate), with a question heading plus your answer. The phase advances only once the answer file exists and is non-empty on disk; if the write fails, retry.`,
          },
          // LLM judgment: is the answer satisfactory? (sets questionAnswered)
          {
            id: "validate-answer",
            title: "Validate the Answer",
            kind: "variable-definition",
            variables: [
              {
                name: QUESTION_ANSWERED_VAR,
                type: "boolean",
                kind: "llm",
                description: `Judge whether the answer just produced for the current question is satisfactory and well-grounded. Use setVar to set questionAnswered (boolean): true if the answer is complete and adequate for the PROJECT files; false only if there are genuine gaps that warrant refining. Prefer true for an adequate answer.`,
              },
            ],
          },
          // A satisfactory answer pops the question; an unsatisfactory answer
          // is refined in place (rewriting the same file, whose name derives
          // from the question text) before popping.
          {
            id: "branch-if-answered",
            title: "If Answered Satisfactorily",
            kind: "branch:if",
            condition: (state: PioSessionState) =>
              state.store?.get(QUESTION_ANSWERED_VAR) === true,
            // biome-ignore lint/suspicious/noThenProperty: 'then' is the canonical field name from the WorkflowPhase interface
            then: [
              {
                id: "pop-question",
                title: "Pop Question",
                kind: "code",
                run: (ctx: CodeStepContext) => {
                  const questions = [...questionsOf(ctx.state)];
                  questions.shift();
                  ctx.state.store?.set(QUESTIONS_VAR, "array", questions);
                },
              },
            ],
            else: [
              {
                id: "refine-answer",
                title: "Refine the Answer",
                maxIterations: 2,
                loopWhile: [
                  {
                    type: "callback",
                    callback: (state: PioSessionState) =>
                      !answerFileWritten(state),
                  },
                ],
                instructions: `The answer to the current question was judged unsatisfactory. Read the draft at \`\${answer_path}\`, improve it (fill gaps, strengthen grounding in files you actually read), and rewrite it to the same file at \`\${answer_path}\`.

**Question:** \`\${nextQuestion}\`

Keep the question heading and improve the answer body. The phase advances only once the answer file exists and is non-empty on disk; if the write fails, retry.`,
              },
              {
                id: "pop-question",
                title: "Pop Question",
                kind: "code",
                run: (ctx: CodeStepContext) => {
                  const questions = [...questionsOf(ctx.state)];
                  questions.shift();
                  ctx.state.store?.set(QUESTIONS_VAR, "array", questions);
                },
              },
            ],
          },
        ],
      },

      // After the queue is drained, consolidate every per-question answer
      // file into the single notes file (best-effort, total).
      {
        id: "merge-notes",
        title: "Merge Answers into Notes",
        kind: "code",
        run: (ctx: CodeStepContext) => {
          mergeAnswersIntoNotes(ctx.state);
        },
      },

      // After consolidation, discover genuinely new questions. The coverage
      // mandate directs the agent to verify complete architecture coverage
      // before concluding discovery.
      {
        id: "generate-questions",
        title: "Generate New Questions",
        kind: "variable-definition",
        variables: [
          {
            name: NEW_QUESTIONS_VAR,
            type: "array",
            kind: "llm",
            description: `Reflect on the questions answered during this research pass (answers are consolidated in \`\${notes_path}\`) and identify genuinely new questions that emerged — unknowns about how areas of the project work, interact, or are tested that a complete PROJECT picture still needs.

Before concluding, **verify complete architecture coverage**: check that every component/area of the architecture (per the accumulated findings) is covered by an answered question, and that no further questions remain about it. Generate any genuinely new questions needed to close coverage gaps, and only then stop.

Use setVar to set new_questions to the array of new question strings (empty array if none emerged). Do not repeat questions already asked or answered.`,
          },
        ],
      },

      // Fold generated questions into the queue for the next outer pass
      {
        id: "merge-questions",
        title: "Merge New Questions",
        kind: "code",
        run: (ctx: CodeStepContext) => {
          const questions = [...questionsOf(ctx.state)];
          const fresh = ctx.state.store?.get(NEW_QUESTIONS_VAR);
          const newQs = Array.isArray(fresh) ? (fresh as string[]) : [];
          ctx.state.store?.set(QUESTIONS_VAR, "array", [
            ...questions,
            ...newQs,
          ]);
          ctx.state.store?.set(NEW_QUESTIONS_VAR, "array", []);
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Clarification — lean final gap-check: ask only about remaining genuine
  // gaps before writing. No exhaustion loop (clarification is inline in the
  // research loop; needs-user handoff removed).
  // ---------------------------------------------------------------------------
  {
    id: "clarify",
    title: "Clarification",
    instructions: `Review your research findings (accumulated in \`\${notes_path}\`) against the 7 PROJECT files, using the \`pio-project-knowledge\` skill as the sole reference for file paths, section structure, and expected content: what should each file contain, and where is it still missing or uncertain?

If any genuine gaps, ambiguities, or uncertainties remain that only the user can resolve, ask about them one by one with the \`ask_user\` tool (\`displayMode: "inline"\`) — focused, specific questions. Do not ask filler questions like "anything else?". Only ask when there is a genuine gap that would make an output file incomplete or misleading.

If no genuine gaps remain, finish without asking. This is a single run — there is no re-loop; any remaining gap is handled by asking now or left as a noted assumption.`,
  },

  // ---------------------------------------------------------------------------
  // Seven single-output write phases — one contract file per phase, each with
  // instructions tailored to that file's section structure (per
  // pio-project-knowledge) and gated to exactly its own output with a total
  // disk-existence validation loop.
  // ---------------------------------------------------------------------------
  {
    id: "write-overview",
    title: "Write PROJECT/OVERVIEW.md",
    write: ["overview"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("overview"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/OVERVIEW.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Project Overview\` — purpose of the project (2-4 sentences); author, license, repository reference.
- \`## Tech Stack\` — programming languages, frameworks, databases, infrastructure tools; include versions when available.
- \`## Repository Structure\` — key directories and their purpose; tree format or concise list (top-level only).`,
  },
  {
    id: "write-development",
    title: "Write PROJECT/DEVELOPMENT.md",
    write: ["development"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("development"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/DEVELOPMENT.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Development Guide\`
- \`## Build and Test\` — how to build, test, and lint; commands, frameworks, prerequisites.
- \`## Test Directory Convention\` — where test files live relative to source files; test runner and configuration details.
- \`## CI/CD and Release\` — CI/CD pipeline stages, release cycle, deployment process.
- \`## Local Environment Setup\` — environment variables, configs, secrets; external services required (database, message broker, etc.); commands to start locally.`,
  },
  {
    id: "write-conventions",
    title: "Write PROJECT/CONVENTIONS.md",
    write: ["conventions"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("conventions"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/CONVENTIONS.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Code Conventions\`
- \`## Coding Style\` — conventions from editor configs (tsconfig.json, .editorconfig, .prettierrc); indentation, line length, quotes, semicolons, naming conventions.
- \`## Linting and Formatting\` — linting tools, formatting tools, how to run them; configuration files and key rules.
- \`## AI Agent Instructions\` — conventions from AGENTS.md / CLAUDE.md / CURSOR.md or similar files; project-specific agent guidance encoded in prompts.`,
  },
  {
    id: "write-git",
    title: "Write PROJECT/GIT.md",
    write: ["git"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("git"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/GIT.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Git Conventions\`
- \`## Commit Message Format\` — format (Conventional Commits \`type(scope): description\`, custom prefixes); observed commit types and usage examples; scope usage patterns; tag/versioning scheme (semver, calver, or none detected); branch naming patterns and branching strategy; merge commit conventions (squash vs. merge PRs); signing practices (GPG, DCO sign-off, or none observed).

For a project with no git repository, write "No git repository found" rather than leaving the file empty.`,
  },
  {
    id: "write-architecture",
    title: "Write PROJECT/ARCHITECTURE.md",
    write: ["architecture"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("architecture"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/ARCHITECTURE.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Architecture\`
- \`## Patterns and Design Decisions\` — architecture patterns (MVC, layered, event-driven, microservices, etc.); capability pattern (if applicable): module structure, registration, lifecycle; key design decisions and trade-offs; ADRs (Architecture Decision Records) if they exist.
- \`## Service Integrations\` — how the project integrates with other services; deployment topology; ecosystem context — how the project fits into larger systems.`,
  },
  {
    id: "write-dependencies",
    title: "Write PROJECT/DEPENDENCIES.md",
    write: ["dependencies"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("dependencies"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/DEPENDENCIES.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Dependencies\`
- \`## External APIs\` — third-party APIs and services the project integrates with; endpoints, versions, authentication methods.
- \`## Third-Party Libraries\` — key libraries and frameworks, why they are used; typically a table: Package | Version | Purpose.
- \`## Internal Package Graph\` — if a monorepo: how internal packages depend on each other; module dependency tree or ASCII diagram.
- \`## Data Flow Between Services\` — how data moves across service boundaries; workflow pipeline diagrams (ASCII art).`,
  },
  {
    id: "write-glossary",
    title: "Write PROJECT/GLOSSARY.md",
    write: ["glossary"],
    maxIterations: 2,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          !state.capState?.outputExists("glossary"),
      },
    ],
    instructions: `Write \`.pio/PROJECT/GLOSSARY.md\`. Structure it exactly as defined by the \`pio-project-knowledge\` skill:
- \`# Glossary\`
- \`## Terms\` — domain-specific terminology with definitions.
- \`## Acronyms\` — acronyms and their full expansions (typically a table).
- \`## Business Concepts\` — key business concepts relevant to understanding the codebase.`,
  },

  // ---------------------------------------------------------------------------
  // Cleanup — remove this session's scratch directory after all files are
  // written (best-effort, total — /tmp is OS-reclaimed anyway).
  // ---------------------------------------------------------------------------
  {
    id: "cleanup",
    title: "Cleanup Scratch Files",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const notesPath = ctx.state.store?.get(NOTES_VAR);
      const root =
        typeof notesPath === "string"
          ? path.dirname(notesPath)
          : path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort — /tmp is OS-reclaimed anyway
      }
    },
  },
] satisfies WorkflowPhase[];
