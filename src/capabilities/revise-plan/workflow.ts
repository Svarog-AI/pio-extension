import type { WorkflowStep } from "../../capability-package";

const steps: WorkflowStep[] = [
  {
    id: "read-goal",
    title: "Read GOAL.md",
    instructions: `Read the \`GOAL.md\` file from the goal workspace directory. This is your contract — it defines what "current state" means and what "done" looks like.

Internalize:
- The **Current State** section — what existed when the goal was created
- The **To-Be State** section — the target outcome
- Any constraints, references, or external documents mentioned`,
  },
  {
    id: "read-archived-plans",
    title: "Read archived plans",
    instructions: `The old \`PLAN.md\` has been archived. Find the most recent archived plan in \`PLAN_ARCHIVE/\` (files are named \`PLAN-{YYYYMMDDTHHMMSSZ}.md\`, sorted by timestamp in the filename). **This archived plan is your primary authority on implementation details** — formatting decisions, architectural choices, and specific approaches already made by the planning agent. GOAL.md defines scope boundaries (*what* to build); the archived plan defines implementation decisions (*how* to build it). When resolving conflicts between sources, follow the priority hierarchy documented in the \`pio-planning\` skill.

If there are multiple archived plans, read all of them — they show the revision history and can reveal why previous plans needed changes. The most recent archive is your primary reference; earlier archives provide context on how the plan evolved.`,
  },
  {
    id: "identify-completed-steps",
    title: "Identify completed steps",
    instructions: `Scan the remaining \`S{NN}/\` folders in the goal workspace. A step is **completed** if its folder contains an \`APPROVED\` marker file. Completed steps are immutable — their implementations are done and should not be modified.

For each completed step:
- Record the step number (from the folder name, e.g., \`S01\` = Step 1)
- Determine the step title — read \`S{NN}/TASK.md\` if it exists, or infer from the archived plan
- Note that these steps are historical anchors in the new plan

Incomplete step folders (without an \`APPROVED\` marker) are **preserved** for the duration of the session so you can inspect them for context. Key files to inspect in incomplete step folders include:
- \`TASK.md\` — what was specified for the step
- \`DECISIONS.md\` — architectural decisions made during specification
- \`REVISE_PLAN_NEEDED\` — the reason revision was triggered (YAML frontmatter \`reason\` field)

These folders will be cleaned up automatically after the session completes.`,
  },
  {
    id: "research-context",
    title: "Research supporting context",
    instructions: `Use your tools (\`read\`, \`bash\`) to understand the current state of the codebase:

1. Read \`.pio/PROJECT/OVERVIEW.md\` if it exists — this is the project's entry point.
2. Read implementation files from completed steps — check \`S{NN}/SUMMARY.md\` for what was built, and read the actual source files to understand current state.
3. Understand what decisions were made during completed steps — check \`S{NN}/DECISIONS.md\` if it exists.
4. **Check the trigger step folder for revision context:** Read the \`REVISE_PLAN_NEEDED\` file to understand why revision was triggered (the YAML frontmatter \`reason\` field contains the reason). Read the trigger step's \`TASK.md\` and \`DECISIONS.md\` for context on what decisions led to the revision request.
5. Identify any new context that wasn't known when the original plan was written.

This research ensures your new steps are grounded in the actual state of the codebase, not just the archived plan.`,
  },
  {
    id: "validate-with-user",
    title: "Validate revision direction with the user",
    instructions: `Before designing new steps, engage the user to confirm the revision direction and negotiate any scope changes.

**Verify dimensions before designing new steps:** Before designing new steps, verify the following dimensions. Follow the \`grill-me\` skill for probing technique — walk decision trees, follow implications, and one question at a time.

- **Feasibility given completed work:** Can the new direction actually work with the implementations already approved? Are there architectural decisions in completed steps that conflict with the revised approach?
- **Scope boundaries of remaining work:** Does the revised scope cover all necessary changes, or are hard decisions deferred to later executors?
- **Constraints from completed implementations:** What patterns, interfaces, or conventions were established in completed steps that the revision must respect?
- **Downstream impact on future executors:** Will specification choices in the new plan (file placement, interface signatures) break or confuse later step specs?

If any dimension cannot be answered from research or user input, ask before proceeding.

**Present what changed:** Summarize the revision trigger reason and how the remaining work differs from the archived plan. Make it clear what broke or shifted, and why a new plan is needed.

**Validate assumptions:** Confirm the new direction aligns with user intent — especially around scope changes, architectural pivots, or decisions invalidated by completed work. Check that the user agrees with the approach the revision is taking.

**Negotiate scope:** If the remaining work has fundamentally changed in character compared to the original plan, confirm whether to proceed as-is, split into subgoals, or adjust the overall approach.

**Summarize and confirm:** Recap key decisions before proceeding to step design. Present a brief summary of the revision direction and confirm you have what you need.`,
  },
  {
    id: "design-steps",
    title: "Design new steps",
    instructions: `Decompose the remaining work into new steps. Continue numbering after the last completed step — for example, if steps 1–3 are APPROVED, your new steps start at Step 4.

**For each new step, follow the planning methodology from the \`pio-planning\` skill.** This includes step structure, acceptance criteria rules, and sizing guidelines.

**If changes to completed code are needed:** Do not modify completed step entries. Instead, add NEW future steps that describe the required changes (e.g., "revert X using git and replace with Y", "refactor module Z to accommodate new interface"). Completed steps remain immutable historical anchors.

**Guiding principles:**
- New steps should be concrete, ordered, and sized for a single executor session
- Steps must reflect real implementation order — dependencies on earlier steps must be clear
- Stay within GOAL.md scope — do not add unrelated refactoring or improvements
- No source code in PLAN.md — describe changes in natural language only
- When modifying archived plan decisions, follow the priority hierarchy rules defined in the \`pio-planning\` skill`,
  },
  {
    id: "write-plan",
    title: "Write PLAN.md",
    instructions: `Write a fresh \`PLAN.md\` into the goal workspace directory. The file must follow the structure defined in the \`pio-planning\` skill, with one key difference: **completed steps are included as historical anchors.**

**Structure:**

\`\`\`yaml
---
totalSteps: <count of ALL entries: completed + new>
---
\`\`\`

\`\`\`markdown
---
totalSteps: 7
---
# Plan: <Goal Name>

<One-line summary referencing GOAL.md for context.>

## Prerequisites

<Preconditions, or "None." Do not omit this section.>

## Steps

### Step 1: <Title of completed step> [COMPLETED]

**Description:** <Brief description of what was done. Marked as immutable — this is a historical anchor.>

**Status:** COMPLETED — implementation approved, do not modify.

### Step 2: <Title of completed step> [COMPLETED]

... (same for each completed step) ...

### Step 4: <Title of new step>

**Description:** <What exactly changes. Natural language only — no source code.>

**Acceptance criteria:**
- [ ] <Verifiable condition>
- [ ] <Another check>

**Files affected:**
- \`path/to/file.ts\` — brief note on what changes

... (same structure for each new step) ...

## Notes

<Additional context: risks, edge cases, migration decisions, or things an executor should watch out for. If none, write "None." Do not omit this section.>
\`\`\`

**Rules:**
- \`totalSteps\` must equal the actual count of all step headings (completed + new)
- Completed steps are clearly marked with \`[COMPLETED]\` and a \`**Status:** COMPLETED\` line
- New steps continue numbering sequentially after the last completed step
- New steps follow the full step structure from the \`pio-planning\` skill (Description, Acceptance Criteria, Files Affected)
- Completed step entries need only a brief description and status marker — they are references, not actionable items`,
  },
  {
    id: "self-review",
    title: "Self-review plan headings",
    instructions: `Before signaling completion, review the PLAN.md you just wrote for verification-style step titles.

**Scan all \`### Step N:\` headings** but **skip headings marked \`[COMPLETED]\`** — those are historical anchors from prior steps, not authored by the current session.

Check remaining headings for titles whose primary purpose is verification. The following patterns are forbidden as step titles:

- **Verify** (e.g., "Verify Implementation", "Verify Changes")
- **Validate** (e.g., "Validate Integration", "Validate Configuration")
- **Check** (e.g., "Check All Tests Pass", "Check Integration")
- **Test** (e.g., "Add Tests", "Test the Feature")
- **Confirm** (e.g., "Confirm Everything Works")
- Or similar verification-focused language where the sole purpose of the step is verification without producing other deliverables

**Important distinctions:**
- Steps that *update or modify existing tests as part of a larger implementation change* are permitted (e.g., "Update test suite for API migration")
- An *integration verification step near the end* is allowed when it involves cross-module or end-to-end verification spanning multiple steps
- Only steps whose *sole purpose is verification* without producing other deliverables are forbidden

**If offending headings are found:** Rewrite those steps as concrete deliverables with clear outputs, and update PLAN.md accordingly.

**If all non-completed headings are clean:** Proceed to \`signal-completion\` without further iteration.`,
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `When \`PLAN.md\` has been written and confirmed, call the \`pio_mark_complete\` tool to validate that all expected outputs have been produced. If validation reports missing files, produce them before calling again. Do not end your work without calling this tool.`,
  },
];

export default steps;
