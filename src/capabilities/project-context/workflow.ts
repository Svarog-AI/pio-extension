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

/** Store variable carrying the notes file size captured before the write attempt. */
const NOTES_BASELINE_VAR = "notes_baseline";

/** Session-scoped scratch directory (OS-reclaimed; no cleanup logic). */
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

/**
 * True iff the notes file's size on disk differs from the baseline captured
 * by the snapshot-notes phase — i.e. the Q&A note was durably persisted
 * before the queue is shifted. Edit detection by size (not substring match)
 * removes the collision risk where the current question's text is a substring
 * of an earlier-written note. Total — never throws (missing baseline or
 * unreadable file ⇒ false, so the write-notes completeness loop keeps
 * replaying until the note lands).
 */
function notesEdited(state: PioSessionState): boolean {
  const question = state.store?.get(NEXT_QUESTION_VAR);
  // Nothing to persist yet (no current question) — vacuously edited so the
  // write-notes completeness loop advances. Without this guard the size
  // comparison would never pass for an empty question.
  if (question === "") {
    return true;
  }
  const baseline = state.store?.get(NOTES_BASELINE_VAR);
  if (typeof baseline !== "number") {
    return false;
  }
  const notesPath = state.store?.get(NOTES_VAR);
  if (typeof notesPath !== "string") {
    return false;
  }
  let currentSize = -1;
  try {
    currentSize = fs.statSync(notesPath).size;
  } catch {
    currentSize = -1;
  }
  return currentSize !== baseline;
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
const WRITE_BOILERPLATE = `Your research findings are accumulated in \`\${notes_path}\` — consult them (with the \`pio-project-knowledge\` skill) as the source for this file's content.

When the file has no relevant content for this project, write a brief note ("No significant findings in this category") rather than leaving it empty.

Be concise — target ~2000 tokens (~1500 words) maximum. Prioritize actionable information over narrative description.

**Quality bar:** Every claim should be backed by a file you actually read or confirmed with the user. If something is uncertain, note it as such rather than guessing. Dense with relevant information, not padded with boilerplate.`;

export default [
  // ---------------------------------------------------------------------------
  // Default Questions — seed the question queue + notes file (programmatic)
  // ---------------------------------------------------------------------------
  {
    id: "default-questions",
    title: "Default Questions",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      ctx.state.store?.set(QUESTIONS_VAR, "array", [...DEFAULT_QUESTIONS]);
      const dir = path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      const notesPath = path.join(dir, "notes.md");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(notesPath, "# Research Notes\n\n", "utf8");
      ctx.state.store?.set(NOTES_VAR, "string", notesPath);
    },
  },

  // ---------------------------------------------------------------------------
  // Research Loop — seeded discovery: drain the queue (inner loop), then
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
          // Peek the front question into nextQuestion (does NOT pop — the pop
          // is conditional on a satisfactory answer)
          {
            id: "get-next-question",
            title: "Get Next Question",
            kind: "code",
            run: (ctx: CodeStepContext) => {
              const questions = questionsOf(ctx.state);
              ctx.state.store?.set(
                NEXT_QUESTION_VAR,
                "string",
                questions[0] ?? "",
              );
            },
          },
          // LLM: research the codebase and produce the answer; user-only
          // questions are resolved inline via ask_user
          {
            id: "answer-question",
            title: "Answer the Question",
            instructions: `Answer this research question for the project-context files:

**Question:** \`\${nextQuestion}\`

Research the codebase to produce a complete, well-grounded answer. Read files and run read-only commands as needed. When the question is structural (e.g. the directory tree), produce its listing via a single shell command so it lands in context for later reference (enumerate once — do not re-enumerate).

If the question can only be answered by the user (it depends on external context not present in the repo), call \`ask_user\` with \`displayMode: "inline"\` to ask it, then use the user's answer.

Produce the final answer in your response — it will be appended to the research notes and used to write the PROJECT files.`,
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
                description: `Judge whether the answer just produced for the current question is satisfactory and well-grounded. Use setVar to set questionAnswered (boolean): true if the answer is complete and adequate for the PROJECT files; false only if there are genuine gaps that warrant re-answering. Prefer true for an adequate answer.`,
              },
            ],
          },
          // Record the note first, then pop — persist before shifting so a Q&A
          // is never dropped from both the queue and the notes if the note
          // write is interrupted; otherwise the question stays at the front
          // and is re-answered next pass
          {
            id: "branch-if-answered",
            title: "If Answered Satisfactorily",
            kind: "branch:if",
            condition: (state: PioSessionState) =>
              state.store?.get(QUESTION_ANSWERED_VAR) === true,
            // biome-ignore lint/suspicious/noThenProperty: 'then' is the canonical field name from the WorkflowPhase interface
            then: [
              // Capture the notes file size before the write attempt, so the
              // write-notes completeness loop can detect a durable edit by
              // size change rather than by substring content match.
              {
                id: "snapshot-notes",
                title: "Snapshot Notes Size",
                kind: "code",
                run: (ctx: CodeStepContext) => {
                  const notesPath = ctx.state.store?.get(NOTES_VAR);
                  let baseline = -1;
                  if (typeof notesPath === "string") {
                    try {
                      baseline = fs.statSync(notesPath).size;
                    } catch {
                      baseline = -1;
                    }
                  }
                  ctx.state.store?.set(NOTES_BASELINE_VAR, "number", baseline);
                },
              },
              {
                id: "write-notes",
                title: "Write Research Notes",
                maxIterations: 2,
                loopWhile: [
                  {
                    type: "callback",
                    callback: (state: PioSessionState) => !notesEdited(state),
                  },
                ],
                instructions: `Append the Q&A for the just-answered question to the research notes file at \`\${notes_path}\`.

**Question:** \`\${nextQuestion}\`

Read the current notes file, then rewrite it with the answer you produced for this question appended as a new section (question heading + answer). Preserve all previously accumulated notes. The notes file lives under /tmp — writes to it are not blocked by the write gate.

You must actually write the question text (verbatim, as in \`nextQuestion\`) into the notes file — the phase advances only once the note is durably on disk. If the write fails, retry.`,
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

      // After the queue is drained, discover genuinely new questions
      {
        id: "generate-questions",
        title: "Generate New Questions",
        kind: "variable-definition",
        variables: [
          {
            name: NEW_QUESTIONS_VAR,
            type: "array",
            kind: "llm",
            description: `Reflect on the questions answered during this research pass and identify genuinely new questions that emerged — unknowns about how areas of the project work, interact, or are tested that a complete PROJECT picture still needs. Use setVar to set new_questions to the array of new question strings (empty array if none emerged). Do not repeat questions already asked or answered.`,
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
- \`## Repository Structure\` — key directories and their purpose; tree format or concise list (top-level only).

${WRITE_BOILERPLATE}`,
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
- \`## Local Environment Setup\` — environment variables, configs, secrets; external services required (database, message broker, etc.); commands to start locally.

${WRITE_BOILERPLATE}`,
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
- \`## AI Agent Instructions\` — conventions from AGENTS.md / CLAUDE.md / CURSOR.md or similar files; project-specific agent guidance encoded in prompts.

${WRITE_BOILERPLATE}`,
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

For a project with no git repository, write "No git repository found" rather than leaving the file empty.

${WRITE_BOILERPLATE}`,
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
- \`## Service Integrations\` — how the project integrates with other services; deployment topology; ecosystem context — how the project fits into larger systems.

${WRITE_BOILERPLATE}`,
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
- \`## Data Flow Between Services\` — how data moves across service boundaries; workflow pipeline diagrams (ASCII art).

${WRITE_BOILERPLATE}`,
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
- \`## Business Concepts\` — key business concepts relevant to understanding the codebase.

${WRITE_BOILERPLATE}`,
  },
] satisfies WorkflowPhase[];
