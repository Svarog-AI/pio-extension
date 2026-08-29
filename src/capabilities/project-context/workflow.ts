import * as fs from "node:fs";
import * as path from "node:path";
import type { PioSessionState } from "../../runtime/session-state";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";

// ---------------------------------------------------------------------------
// Research backlog protocol
//
// Shared scratch-file protocol used by the `default-questions` code phase,
// the research-loop callbacks, and `clarify`. The backlog lives at
// /tmp/pio-project-context/<sessionId>/questions.md — session-scoped so
// concurrent sessions never share a backlog, and under /tmp so it bypasses
// all write gating. The absolute path is exposed to LLM phases via the
// `questions_path` store variable + ${questions_path} interpolation, and
// resolved by every callback from the store.
//
// Line grammar (one question per line; `#`-prefixed and blank lines are
// ignored):
//   [open] <question text>
//   [answered] <question text> — evidence: <repo-relative path[, ...]>
//   [needs-user] <question text> — note: <what is needed from the user>
//
// A line is terminal iff it is `[answered]` with all cited evidence paths
// existing under the project root, or `[needs-user]`.
// ---------------------------------------------------------------------------

/** Store variable carrying the absolute path of this session's questions file. */
const QUESTIONS_VAR = "questions_path";

/** Session-scoped scratch directory (OS-reclaimed; no cleanup logic). */
const SCRATCH_DIR = "/tmp/pio-project-context";

/** Parse result for the questions backlog file. */
interface QuestionsParse {
  /** Question texts of every `[open]` line */
  open: string[];
  /** True iff every `[answered]` line cites at least one evidence path that exists under the project root (vacuously true when there are no `[answered]` lines) */
  terminalOk: boolean;
  /** True iff any non-comment, non-blank line fails the line grammar (or the file is unreadable) */
  malformed: boolean;
}

/** Line-grammar patterns (exact). */
const OPEN_LINE = /^\[open\]\s+(\S.*)$/;
const ANSWERED_LINE = /^\[answered\]\s+(.+?)\s+— evidence:\s*(\S.*)$/;
const NEEDS_USER_LINE = /^\[needs-user\]\s+(.+?)\s+— note:\s*(\S.*)$/;

/**
 * Fail-safe parse shape — returned for an unreadable file, a missing
 * `questions_path` variable, or any internal error. Polarity: keeps the
 * answer phase from advancing (terminalOk: false) and keeps the generate
 * phase looping (malformed: true).
 */
function failSafeParse(): QuestionsParse {
  return { open: [], terminalOk: false, malformed: true };
}

/**
 * Total parser for the questions backlog — never throws. Every loop callback
 * is built on it (total-callback rule: a throwing callback is treated as not
 * passing at agent_end).
 */
function parseQuestions(state: PioSessionState): QuestionsParse {
  try {
    const rawPath = state.store?.get(QUESTIONS_VAR);
    if (typeof rawPath !== "string" || rawPath.length === 0) {
      return failSafeParse();
    }
    const content = fs.readFileSync(rawPath, "utf8");
    const open: string[] = [];
    let terminalOk = true;
    let malformed = false;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const openMatch = trimmed.match(OPEN_LINE);
      if (openMatch) {
        open.push(openMatch[1]);
        continue;
      }
      const answeredMatch = trimmed.match(ANSWERED_LINE);
      if (answeredMatch) {
        const evidence = answeredMatch[2]
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        const root = state.projectRoot;
        if (
          evidence.length === 0 ||
          typeof root !== "string" ||
          root.length === 0 ||
          evidence.some((p) => !fs.existsSync(path.resolve(root, p)))
        ) {
          terminalOk = false;
        }
        continue;
      }
      if (NEEDS_USER_LINE.test(trimmed)) continue;
      malformed = true;
    }
    return { open, terminalOk, malformed };
  } catch {
    return failSafeParse();
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
];

export default [
  // ---------------------------------------------------------------------------
  // Phase 1 — seed the session-scoped research backlog (programmatic, no turn)
  // ---------------------------------------------------------------------------
  {
    id: "default-questions",
    title: "Phase 1: Default Questions",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const dir = path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      const filePath = path.join(dir, "questions.md");
      fs.mkdirSync(dir, { recursive: true });
      const lines = [
        "# research questions",
        ...DEFAULT_QUESTIONS.map((q) => `[open] ${q}`),
      ];
      fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
      ctx.state.store?.set(QUESTIONS_VAR, "string", filePath);
    },
  },

  // ---------------------------------------------------------------------------
  // Phase 2 — seeded discovery loop: answer (disk-truth) / generate (format)
  // ---------------------------------------------------------------------------
  {
    id: "research-loop",
    title: "Phase 2: Research Loop",
    kind: "loop",
    maxIterations: 3,
    repeatWhile: (state: PioSessionState) =>
      parseQuestions(state).open.length > 0,
    // Never rendered (containers get no agent turns) — present for the
    // prompt compiler's top-level validation, which only exempts branch:*
    instructions: `This is a do-while research loop (kind: "loop"). Its two-phase body (answer-questions → generate-questions) runs at least once; after each full body pass the repeatWhile condition is evaluated — the loop repeats while any [open] line remains in the questions file, and exits once answering exhausts the backlog and generation produces nothing new. This container itself never receives an agent turn.`,
    body: [
      {
        id: "answer-questions",
        title: "Answer Open Questions",
        maxIterations: 4,
        loopMessage:
          // biome-ignore lint/suspicious/noTemplateCurlyInString: ${questions_path} is an engine-side interpolation placeholder — must stay literal in the string
          "Continue answering the remaining `[open]` lines in ${questions_path} — do not re-answer terminal lines; every open line must end this run as answered-with-evidence or needs-user.",
        terminateWhen: [
          {
            type: "callback",
            callback: (state: PioSessionState) => {
              const parsed = parseQuestions(state);
              return parsed.open.length === 0 && parsed.terminalOk;
            },
          },
        ],
        instructions: `Read \`\${questions_path}\` first — it is the research backlog: one question per line, prefixed with its status. Answer every \`[open]\` line from the codebase — read files, run read-only commands as needed. When answering a structural question (e.g. the directory tree), produce its listing via a single shell command so it lands in context for later passes (enumerate once — do not re-enumerate on replays).

Update each line in place to a terminal state:
- \`[answered] <question> — evidence: <repo-relative file>[, <file>...]\` — cite the file paths you actually read.
- \`[needs-user] <question> — note: <what is needed from the user>\` — only when the codebase cannot resolve it.

**Every open line must reach a terminal state this run** — answered-with-evidence or needs-user. That is the phase's exit condition.

Work outward from the center, using this checklist as your method:
- Start with \`README.md\` or equivalent entry points to get an initial sense of the project.
- Scan the top-level directory structure. Map out every notable folder and its purpose.
- Read dependency manifests (\`package.json\`, \`Cargo.toml\`, \`go.mod\`, \`Gemfile\`, \`pyproject.toml\`, etc.) — these reveal languages, frameworks, versions, and scripts.
- Read build and automation files (\`Makefile\`, \`justfile\`, \`Taskfile.yml\`, \`build.gradle\`, \`CMakeLists.txt\`, etc.).
- Read CI/CD configurations (\`.github/workflows/\`, \`.gitlab-ci.yml\`, Jenkinsfiles, etc.).
- Read infrastructure files (\`Dockerfile\`, \`docker-compose.*\`, Kubernetes manifests, Terraform, etc.).
- Read documentation (\`CONTRIBUTING.md\`, \`CHANGELOG.md\`, \`docs/\`).
- Read AI instruction files if they exist (\`AGENTS.md\`, \`CLAUDE.md\`, \`CURSOR.md\`, \`.github/copilot-instructions.md\`, \`.wolf/\`, \`.roo/\`).
- Read editor configs (\`.editorconfig\`, \`.prettierrc\`, \`tsconfig.json\`, etc.) — they encode project conventions.
- Dive into subdirectories recursively. Understand the source layout, test structure, and any nested services or packages in a monorepo.
- **Discover test placement conventions:** When tests exist, observe where they live relative to source files. Common patterns include: \`tests/\` mirroring \`src/\` (e.g., \`src/foo/bar.ts\` → \`tests/foo/test_bar.ts\`), colocated \`.test.ts\` alongside source files, dedicated \`__tests__/\` directories per module, or language-specific conventions like \`*_test.go\`, \`*_test.rb\`. Note the test runner and any configuration (\`jest.config.*\`, \`vitest.config.*\`, \`pytest.ini\`, etc.) that affects discovery.
- **Discover cross-service dependencies:** Identify external API integrations (HTTP clients, SDKs, gRPC stubs), third-party service connections (databases, message brokers, caches), and internal monorepo package relationships (workspace dependencies, inter-package imports). Look at \`package.json\` dependencies, import statements, configuration files, and infrastructure definitions.
- **Discover domain terminology:** While reading source code, documentation, and configuration, note recurring domain-specific terms, business concepts, acronyms, and jargon that a new contributor would need to understand.
- **Analyze git history (commit conventions):** If the project has a git repository (\`git rev-parse --git-dir\` succeeds), run the following commands to discover commit and release conventions:
  - \`git log --oneline -50\` — examine recent commit messages for patterns: Conventional Commits compliance (\`type(scope): description\`), custom prefixes or type vocabulary, message formatting conventions (imperative mood, line length limits), squash-merge vs. individual commit titles, sign-off lines (\`Signed-off-by:\`), and evidence of GPG-signed commits.
  - \`git tag -l\` — identify versioning schemes: semantic versioning (\`v1.2.3\`), calendar versioning (\`2026.05\`), release candidates, pre-release patterns, or any naming conventions in tag descriptions.
  - \`git branch -a\` — identify branching strategy: feature/fix prefix conventions (\`feature/\`, \`feat/\`, \`fix/\`), trunk-based development (single main/master), release branches, hotfix branches, and ticket/issue number embedding in branch names.
  - Check for commit signing evidence: look for GPG signature indicators and DCO-style sign-off lines in the commit history.
  - If the project is **not** a git repository, skip this step gracefully and note "no git repository found" in your findings.

For each file you read, extract only what's useful. Do not copy entire files.`,
      },
      {
        id: "generate-questions",
        title: "Generate New Questions",
        loopWhile: [
          {
            type: "callback",
            callback: (state: PioSessionState) =>
              parseQuestions(state).malformed,
          },
        ],
        instructions: `Reflect on what answering surfaced in this pass — unknowns about how areas work, interact, or are tested that the answers exposed. Add genuine new \`[open]\` questions to \`\${questions_path}\`, one per line.

Add only questions worth a PROJECT-grade answer; if none emerged, leave the file unchanged (untouched-but-valid is acceptable). Do not modify terminal lines.

The file must end in valid grammar — every non-comment, non-blank line must be exactly one of:
- \`[open] <question text>\`
- \`[answered] <question text> — evidence: <repo-relative path[, ...]>\`
- \`[needs-user] <question text> — note: <what is needed from the user>\``,
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Phase 3 — summarize (lean — one run and advance)
  // ---------------------------------------------------------------------------
  {
    id: "summarize",
    title: "Phase 3: Summarization",
    instructions: `Organize your findings into the 7 PROJECT files. Use the \`pio-project-knowledge\` skill as the sole reference for:
- Canonical file paths
- Section headings and subsection structure
- Expected content for each section

The skill is the single source of truth for PROJECT file structure. Do not invent sections or headings not defined in the skill.`,
    skills: { mandatory: ["pio-project-knowledge"] },
  },

  // ---------------------------------------------------------------------------
  // Phase 4 — clarify (exhaustion loop: silence terminates)
  // ---------------------------------------------------------------------------
  {
    id: "clarify",
    title: "Phase 4: Clarification",
    maxIterations: 5,
    loopMessage:
      // biome-ignore lint/suspicious/noTemplateCurlyInString: ${questions_path} is an engine-side interpolation placeholder — must stay literal in the string
      "This phase is replaying after your earlier answers. Start from what is still open — do not re-ask answered items. Ask the remaining genuine gaps one by one (including any unasked `[needs-user]` rows from ${questions_path}). If no genuine gaps remain, end without asking — silence terminates this loop.",
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) => state.askUserCalled,
      },
    ],
    instructions: `Review your answers from Phase 3. Are there any gaps, ambiguities, or areas where you are uncertain? List them all. Then use the \`ask_user\` tool to clarify them one by one — ask focused, specific questions. Do not ask filler questions like "anything else?". Only ask when there is a genuine gap that would make the output files incomplete or misleading.

Read \`\${questions_path}\` and ask the user every \`[needs-user]\` row (these could not be resolved from the codebase).

If no genuine gaps remain — including all \`[needs-user]\` rows answered or dismissed — finish without calling ask_user; a run that ends without asking advances the phase.`,
  },

  // ---------------------------------------------------------------------------
  // Phase 5 — write the 7 PROJECT files (gated to the declared contract outputs)
  // ---------------------------------------------------------------------------
  {
    id: "write-files",
    title: "Phase 5: Write Output Files",
    write: [
      "overview",
      "development",
      "conventions",
      "git",
      "architecture",
      "dependencies",
      "glossary",
    ],
    instructions: `Once all gaps are resolved, write the 7 files under \`.pio/PROJECT/\`. Follow the section structure defined in the \`pio-project-knowledge\` skill — use its section headings, subsections, and content expectations as the exact template for each file.

### Guidance

- **Not all files are relevant to every project.** For example: skip \`GIT.md\` for non-git repos (write "No git repository found" instead), \`GLOSSARY.md\` may be minimal for simple projects, and \`DEPENDENCIES.md\` may have little content for single-service projects with no external integrations.
- **When a file has no relevant content**, write a brief note ("No significant findings in this category") rather than leaving the file empty. This distinguishes "analyzed and found nothing" from "not analyzed".
- **Write all files to \`.pio/PROJECT/\`** (the directory). Do not write the old single-file format.
- **Be concise.** Each file should target ~2000 tokens (~1500 words) maximum. Prioritize actionable information — commands, file paths, conventions — over narrative descriptions.

**Quality bar:** Every claim should be backed by a file you actually read or confirmed with the user. If something is uncertain, note it as such rather than guessing. The files should be dense with relevant information — not padded with boilerplate, not essays.`,
  },
] satisfies WorkflowPhase[];
