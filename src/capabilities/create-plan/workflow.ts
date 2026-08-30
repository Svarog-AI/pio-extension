import * as fs from "node:fs";
import * as path from "node:path";
import type { PioSessionState } from "../../runtime/session-state";
import type {
  CodeStepContext,
  WorkflowPhase,
} from "../../runtime/workflow-types";

/** Store variable carrying the absolute path of this session's research notes scratch file. */
const NOTES_VAR = "notes_path";

/** Session-scoped scratch directory (OS reclaims /tmp; no cleanup phase needed). */
const SCRATCH_DIR = "/tmp/pio-create-plan";

const steps: WorkflowPhase[] = [
  // -------------------------------------------------------------------------
  // Default Setup — create the session-scoped scratch dir and set the
  // notes_path store variable (programmatic, no agent turn).
  // -------------------------------------------------------------------------
  {
    id: "default-setup",
    title: "Set up the session scratch space",
    kind: "code",
    run: (ctx: CodeStepContext) => {
      const root = path.join(SCRATCH_DIR, ctx.state.sessionId ?? "unknown");
      fs.mkdirSync(root, { recursive: true });
      ctx.state.store?.set(NOTES_VAR, "string", path.join(root, "notes.md"));
    },
  },

  // -------------------------------------------------------------------------
  // Read Goal — internalize the goal contract. Lean single pass: no loop
  // fields, no write gates. Establishes the contract for the phases that follow.
  // -------------------------------------------------------------------------
  {
    id: "read-goal",
    title: "Read the `goal` input",
    instructions: `Read the \`goal\` input from the goal workspace directory, and read \`.pio/PROJECT/OVERVIEW.md\`. The \`goal\` is your contract — it defines what "current state" (point A) means and what "done" (point B) looks like. If the \`goal\` does not exist, tell the user that they need to create a goal first.

Internalize:
- The **Current State** section (point A)
- The **To-Be State** section (point B)
- Any constraints, references, or external documents mentioned

This is a single-pass entry phase — gather the contract now; research follows in the next phase.`,
  },

  // -------------------------------------------------------------------------
  // Deep Research — thorough research over the repo, web, and tests, with
  // every finding recorded as evidence to the scratch notes file. An
  // exhaustion loop (evidence-fixpoint): a run that appended new notes
  // replays; a silent run (nothing new to record) advances.
  // -------------------------------------------------------------------------
  {
    id: "deep-research",
    title: "Deep research",
    maxIterations: 8,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("notes.md")),
      },
    ],
    loopMessage: `Have another look — any missed files, dependencies, or assumptions? Re-scan the repo, referenced files, and test setup for anything not yet recorded. If you find something new, record it to \`\${notes_path}\` (under /tmp — writes there are not blocked). If you find nothing new, make **no changes** to \`\${notes_path}\` and finish.`,
    instructions: `Conduct thorough research using your tools (\`read\`, \`bash\`, \`web_search\`), following the research process in the \`pio-planning\` skill. Read \`.pio/PROJECT/OVERVIEW.md\`, every file referenced in the \`goal\` input, trace dependencies, understand existing patterns and test setup, and identify hidden complexity.

**Record every finding as evidence to the scratch notes file at \`\${notes_path}\`** (under /tmp — writes there are not blocked). Append each finding with its evidence source, one per entry:

- **Evidence = repo path | web URL | recorded test output | explicit user statement.** A source is required — "just saying something" is not evidence.
- Do **not** require a web link for codebase facts. Web research is for assumptions genuinely unanswerable from code/tests — use \`web_search\` and cite the URL.
- If a step's acceptance criteria can't be made programmatic because you don't understand the test setup, go learn the test setup and record it as evidence.

You need to be confident about implementation details before writing the plan. **Dedupe** — do not re-add findings already present in \`\${notes_path}\`.`,
    skills: {
      mandatory: ["pio-planning"],
      recommended: [
        {
          name: "source-research",
          condition:
            "when researching existing solutions or external libraries",
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // Validate Assumptions — confirm findings and assumptions with the user and
  // resolve genuinely-unanswerable questions via ask_user. An exhaustion loop:
  // a run that asked the user replays (more to confirm); a silent run (no
  // questions) advances — silence is a legitimate end state.
  // -------------------------------------------------------------------------
  {
    id: "validate-assumptions",
    title: "Validate assumptions and gather preferences",
    maxIterations: 6,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) => state.askUserCalled,
      },
    ],
    loopMessage: `Any remaining assumptions to confirm? If none, finish without asking. Do not re-ask already-confirmed items.`,
    instructions: `Before designing implementation steps, confirm your findings and assumptions with the user and close any gaps that research alone cannot resolve. Follow the \`grill-me\` skill for probing technique — walk decision trees, follow implications, and ask one question at a time.

**Verify dimensions before designing steps:**
- **Feasibility:** Can the proposed approach actually work? Hidden dependencies, tooling gaps, architectural constraints?
- **Scope completeness:** Does the \`goal\` input cover all necessary changes, or are hard decisions deferred?
- **Constraints from existing code:** What conventions, patterns, or shared utilities must the plan respect?
- **Downstream impact on consumers:** Who consumes the output of this work? What breaks if we get it wrong?

**Resolve genuinely-unanswerable assumptions:** if research (from \`\${notes_path}\`) leaves assumptions that cannot be answered from the codebase, resolve them here with the user via \`ask_user\` (\`displayMode: "inline"\`) — ask one decision at a time, present 2-5 clear choices with trade-offs. **The user's answer becomes the evidence** — a question never passes without evidence or explicit user resolution. Do not silently drop unresolved assumptions.

**Present findings:** Summarize concisely what research uncovered — key files and modules, dependencies, hidden complexity, risks. Focus on what's *new* or *surprising*.

**Execution preferences:** Ask about step sizing (granular vs. larger) and any specific tools or approaches to use or avoid.

Resolve only what remains genuinely open.`,
    skills: {
      mandatory: ["grill-me"],
    },
  },

  // -------------------------------------------------------------------------
  // Write Plan — design the steps AND write PLAN.md from the research notes +
  // validated assumptions, then run the final consistency review over the
  // written document before the pass ends. An exhaustion loop: a pass that
  // made a consequential change (wrote PLAN.md) replays for another review
  // pass; a clean review pass (nothing to change) advances.
  // -------------------------------------------------------------------------
  {
    id: "write-plan",
    title: "Design the steps and write PLAN.md",
    write: ["plan"],
    maxIterations: 8,
    loopWhile: [
      {
        type: "callback",
        callback: (state: PioSessionState) =>
          state.filesWritten.some((f) => f.endsWith("PLAN.md")),
      },
    ],
    loopMessage: `Have another look — it doesn't matter how many times you've reviewed. Re-scan the whole plan for consequential inconsistencies. If you find a consequential issue, fix it in PLAN.md. If the review finds nothing consequential, make **no changes** to PLAN.md and report it.`,
    instructions: `**Design the steps AND write \`PLAN.md\`** into the goal workspace directory, from the research notes (\`\${notes_path}\`) and the validated assumptions, then run the **final consistency review** over the whole written plan before this pass ends.

**Step design (from the \`pio-planning\` skill):**
- Each step is a concrete, nameable deliverable — a transformation, not an activity.
- Order steps by real dependency so an executor never reorders them.
- Every goal outcome (from the \`goal\` Current/To-Be states) is covered by some step.
- **Subgoal classification:** composite steps (containing multiple internal sub-deliverables that can't be a single output) get \`complexity: "subgoal"\` so they get their own recursive lifecycle. Every PLAN.md frontmatter \`steps\` entry gets a \`name\` field (it serves as the subgoal workspace name when composite). \`complexity\` is optional (defaults to \`task\`). Follow \`PLAN_FRONTMATTER_SCHEMA\` and \`postValidateCreatePlan\`.

**PLAN.md structure (from the \`pio-planning\` skill):** YAML frontmatter with \`totalSteps\` and a \`steps\` array (each entry \`name\`, optional \`complexity\`); document title; Prerequisites section; numbered \`### Step N:\` headings (each with Description, Acceptance Criteria, and Files Affected); and a Notes section. \`totalSteps\` must equal the count of \`### Step N:\` headings and the length of the \`steps\` array.

**Final consistency review (run over the WHOLE plan each pass):**
1. Find major inconsistencies and missed decisions in the plan steps:
   - (a) **outcomes not covered** — steps fail to cover all goal outcomes;
   - (b) **order of steps wrong or impossible** — dependencies/ordering broken;
   - (c) **final outcome not satisfying the goal**;
   - (d) **explicit unit-test steps** — dedicated verification/test steps that should be handled by the TDD process (no step whose sole purpose is Verify/Validate/Check/Test/Confirm; test-updating steps and a final integration-verification step are permitted).
2. **Filter** to issues/decisions with important consequences only — skip trivialities (renamed variables, trivial implementation details like variable naming, minor test/implementation changes). If none pass the filter, report it and move on.
3. **Resolve:** if consequential issues remain, before any \`ask_user\` do a \`web_search\` (no workflow) and a code_search to gather information and try to resolve on your own. If still unresolved, use \`ask_user\` one-by-one (\`displayMode: "inline"\`).
4. **End:** each pass must either make a change to PLAN.md, call \`ask_user\`, or explicitly report that there is nothing to change.`,
    skills: {
      mandatory: ["pio-planning"],
    },
  },
] satisfies WorkflowPhase[];

export default steps;
