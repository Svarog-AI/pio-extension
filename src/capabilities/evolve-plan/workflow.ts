import type { WorkflowStep } from "../../capability-package";

/**
 * Structured workflow steps for the evolve-plan (Specification Writer) capability.
 * Decomposed from the numbered steps in the original evolve-plan.md prompt.
 */
export default [
  {
    id: "read-goal",
    title: "Read GOAL.md for context",
    instructions: `Read the \`GOAL.md\` file in the goal workspace directory. Internalize:

- The **Current State** section — what exists today
- The **To-Be State** section — the target outcome
- Any constraints, references, or external documents mentioned

This gives you the big picture. You will narrow your focus to one step next.`,
  },
  {
    id: "read-plan-and-locate-step",
    title: "Read PLAN.md and locate your step",
    instructions: `Read the \`PLAN.md\` file in the goal workspace directory. Find the step assigned to you (e.g., "Step 3"). Study:

- The step's **Description** — what exactly changes
- The step's **Acceptance criteria** — what must be verifiable for completion
- The step's **Files affected** — which files are created, modified, or deleted
- Any **Dependencies** on earlier steps (e.g., "Step 3 needs an export from Step 1")
- The overall plan structure — understand how your step fits in the sequence

Also note any prerequisites listed at the top of the plan.

**Important — check if this step exists in the plan:** Search PLAN.md for your assigned step number (e.g., look for "Step 3" or "### Step 3"). If you **cannot find** your assigned step in PLAN.md, it means all steps have already been specified. In that case:

1. Write \`COMPLETION_SUMMARY.md\` in the goal workspace root (next to \`PLAN.md\`). Include YAML frontmatter with \`status: "complete"\` and a markdown body explaining why the goal is considered complete (e.g., "all N steps have been approved").
2. Call \`pio_mark_complete\` and stop — you are done.

If the step **does** exist, continue with the normal process below.`,
  },
  {
    id: "read-previous-context",
    title: "Read previous step context (optional enrichment)",
    instructions: `If you are working on Step N and N > 1, read outputs from the previous step for background context:

1. Check if \`S{NN-1}/SUMMARY.md\` exists (e.g., \`S02/SUMMARY.md\` when writing Step 3). If it does, read it — it describes what was built in that step. Pay special attention to the "Decisions Made" section.
2. Check if \`S{NN-1}/REVIEW.md\` exists. If it does, read it — it contains the review feedback on that step's implementation.
3. Check if \`S{NN-1}/DECISIONS.md\` exists. If it does, read it — it contains accumulated architectural decisions from all steps before N-1. **Important:** for Step 2 (N=2), \`S01/DECISIONS.md\` does not exist — Step 1 produces no DECISIONS.md. Handle this gracefully: proceed using only \`SUMMARY.md\` and \`REVIEW.md\`. This is expected, not an error.
4. Also look for any other files in the previous step folder (e.g., implementation files referenced in SUMMARY.md) that might help you understand the code changes made.

This is **optional enrichment only**. Proceed gracefully if these files don't exist or are empty — never treat them as prerequisites. If there is no previous step (you are Step 1), skip this section entirely.`,
  },
  {
    id: "write-decisions",
    title: "Write DECISIONS.md (Step 2+)",
    instructions: `For Step 1, skip this step entirely — there are no prior decisions to carry forward.

For Step 2+, produce \`S{NN}/DECISIONS.md\` by merging accumulated decisions with new ones. This file serves as the accumulating decision log for all downstream steps. Follow these rules:

- **Read inputs:** Extract "Decisions Made" from the previous step's \`SUMMARY.md\`. Read accumulated decisions from the previous step's \`DECISIONS.md\` (if it exists — for Step 2, only SUMMARY.md is available).
- **Selective accumulation — forward-looking only:** Include only decisions that may impact future steps. Exclude implementation-only details, local design choices with no downstream consequences, and one-off decisions already fully applied in the completed step.
- **Deduplication:** If the same decision appears across multiple prior steps, keep exactly one entry — do not repeat the same decision under different headings. Merge related decisions where they express the same underlying choice.
- **Plan deviations are high-priority must-carry decisions:** If a step adjusted or changed the original \`PLAN.md\` (e.g., moved a function to a different file than planned, chose a different architecture), this is critical context for downstream agents. Mark these clearly — group them under a "Plan Deviations" section or flag them explicitly.
- **Rephrase for context:** Don't just append verbatim — rephrase decisions to fit the current step's context and make them actionable for downstream consumers. Group related decisions logically rather than listing them chronologically.
- **Be brief and concise:** Each decision entry should be 1–2 sentences: state the decision, the affected files/areas, and downstream impact. Do not overexplain.

Write \`S{NN}/DECISIONS.md\` as a structured markdown document with a heading per decision category (e.g., "Plan Deviations", "Architecture Decisions", "File Placement").`,
  },
  {
    id: "research-context",
    title: "Research supporting context",
    instructions: `Use your tools (\`read\`, \`bash\`) to understand the codebase areas your step touches:

1. Read the files listed in your step's "Files affected" section — understand existing patterns, conventions, and interfaces.
2. Trace imports and dependencies — what modules will be affected? Are there shared utilities or types that need updating?
3. Look at nearby related code that might interact with the changes (e.g., if modifying a capability, check how it's wired in \`index.ts\`).
4. Understand the testing setup: how are things tested today? What tools (TypeScript compiler, linters, test runners) are available for programmatic verification?

Be thorough — this research ensures your specification is grounded in reality and your acceptance criteria can be checked programmatically.`,
  },
  {
    id: "probing-gate",
    title: "Probing Gate",
    instructions: `Before writing TASK.md, verify the following four dimensions. Follow the \`grill-me\` skill for probing technique — walk decision trees, follow implications, and one question at a time.

- **Spec completeness:** Does the specification leave implementation-critical decisions to the executor's guesswork? Are interfaces, contracts, and edge cases explicit enough to write tests from?
- **Downstream impact on future steps:** Will specification choices (file placement, interface signatures, new types) break or confuse later steps' specs?
- **Plan deviation assessment:** Do specification decisions diverge from the original plan in ways that affect completed work or require revision? Should \`REVISE_PLAN_NEEDED\` be written?
- **Skill relevance:** Have all relevant skills been identified for the execute-task agent? Review \`<available_skills>\` for both bundled skills (from \`src/skills/\`) and external skills. Does the frontmatter \`skills\` block cover what the executor will need?

If any dimension raises doubts, you **must research further or ask the user before proceeding**. This ensures TASK.md is a truly actionable specification, not a restatement of PLAN.md with surface-level detail.`,
  },
  {
    id: "write-task",
    title: "Write TASK.md",
    instructions: `Write \`TASK.md\` into the \`S{NN}/\` folder. This file is a focused, actionable specification of exactly what needs to be built in this step.

**YAML frontmatter (required):** TASK.md begins with a YAML frontmatter block delimited by \`---\`. This block is always present — even when empty. It provides machine-readable data consumed at runtime by execute-task and review-task sessions. The frontmatter may include an optional \`skills\` block:

- \`skills.mandatory\` — array of skill names critical for step completion. These skills are force-injected into the prompt (full SKILL.md content delivered before the agent starts). Examples: \`pio-git\` for a migration step, \`tdd\` for any TDD step.
- \`skills.recommended\` — array of \`{name, condition}\` pairs for situational skills loaded on demand. The \`condition\` field describes when the skill is relevant.
- **Omit \`skills.recommended\` entirely** (do not write an empty array) when there are no recommended skills — matching the capability config convention.
- Both \`skills.mandatory\` and \`skills.recommended\` are optional — a step with no special skill needs omits the \`skills\` block entirely, but always keeps the \`---\` delimiters.
- **Frontmatter is authoritative for runtime behavior;** the body \`## Skills\` section is informational only. If both exist, runtime systems use frontmatter.

Follow the TASK.md template with sections: Title, Context, What to Build, Code Components, Approach and Decisions, Skills, Dependencies, Files Affected, Acceptance Criteria, Risks and Edge Cases.`,
  },
  {
    id: "assess-revision",
    title: "Assess if plan revision is needed",
    instructions: `After writing \`TASK.md\`, evaluate whether your specification decisions require a plan revision.

Write a \`REVISE_PLAN_NEEDED\` marker file inside the current \`S{NN}/\` folder if **any** of the following conditions are met:

1. **Impossible future steps:** Decisions made during specification make at least one future step impossible as-planned.
2. **Requires completed changes:** Decisions require changes to implementations in already-completed previous steps.
3. **Additional steps needed:** Decisions require additional steps beyond what the plan accounts for.
4. **Significant divergence:** The next step's spec diverges significantly from the original plan, making it confusing to read both side by side.
5. **Probing gate discovery:** The Probing Gate revealed that any of the above conditions are already true before specification began.

Do **not** write the marker when only minor descriptive changes are needed in a single future step, or all steps stay roughly the same with minor additions or removals.

Write \`REVISE_PLAN_NEEDED\` as a markdown file with YAML frontmatter including \`reason\` and \`decisions\` fields, followed by a markdown body explaining the context.`,
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `When \`TASK.md\` is written and confirmed (and \`DECISIONS.md\` for Step 2+, and \`REVISE_PLAN_NEEDED\` if applicable), call the \`pio_mark_complete\` tool to validate that all expected outputs have been produced. If validation reports missing files, produce them before calling again. Do not end your work without calling this tool.`,
  },
] satisfies WorkflowStep[];
