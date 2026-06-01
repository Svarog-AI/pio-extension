import type { WorkflowStep } from "../../capability-package";

const steps: WorkflowStep[] = [
  {
    id: "read-plan",
    title: "Read PLAN.md for overall scope",
    instructions: `Read \`PLAN.md\` from the goal workspace root. This tells you:

- What was planned to change (intent and scope)
- Which files were targeted
- The overall architecture or capability being built

Use this to identify new capabilities, modules, or architectural changes that may warrant PROJECT file updates — even if they don't appear in \`DECISIONS.md\`.`,
  },
  {
    id: "read-summaries",
    title: "Read per-step SUMMARY.md files",
    instructions: `Scan the goal workspace for step folders (\`S01/\`, \`S02/\`, etc.). Read \`SUMMARY.md\` from each one that exists. These provide ground truth of what was actually built:

- Files created, modified, or deleted per step
- Decisions made during implementation
- Test coverage details
- Technical decisions not captured in \`DECISIONS.md\`

If a step folder has no \`SUMMARY.md\`, skip it gracefully.

**Subgoal-aware reading:** When scanning step folders, check for a \`subgoals/\` subdirectory inside each \`S{NN}/\` folder (e.g., \`S03/subgoals/\`). If present, this step spawned nested subgoals. For each subgoal workspace under \`subgoals/<name>/\`:

- Read the subgoal's \`GOAL.md\` for context on what was built
- Read the subgoal's final \`DECISIONS.md\` (from the highest-numbered sub-step folder) for accumulated decisions
- Read per-sub-step \`SUMMARY.md\` files from the subgoal workspace

Treat the subgoal as a single unit — don't confuse subgoal step folders (e.g., \`S03/subgoals/nested-feature/S01/\`) with parent step folders. The subgoal's \`COMPLETED\` marker signals that the parent step is complete.`,
  },
  {
    id: "read-decisions",
    title: "Read the final DECISIONS.md",
    instructions: `Read \`DECISIONS.md\` from the path provided in the initial user message. This is the accumulated decisions file from the highest-numbered step folder. It contains explicit architectural decisions, file placement changes, and prompt reference mappings captured during the goal lifecycle.

**DECISIONS.md may be missing, empty, or incomplete.** If it doesn't exist or has no relevant content, proceed using only \`PLAN.md\` and \`SUMMARY.md\` files. Note this in your final summary.`,
  },
  {
    id: "synthesize",
    title: "Synthesize a complete picture",
    instructions: `Combine insights from all three sources:

- **PLAN.md** — intent: what was planned and targeted
- **SUMMARY.md files** — ground truth: what was actually built, files changed, decisions made per step
- **DECISIONS.md** — explicit decisions: captured architectural choices and patterns

Cross-reference all three: if \`PLAN.md\` mentions a new capability module that a \`SUMMARY.md\` confirms was created, but \`DECISIONS.md\` doesn't mention it, still evaluate it for PROJECT file updates. Do not rely on \`DECISIONS.md\` alone.`,
  },
  {
    id: "filter-decisions",
    title: "Apply decision filtering",
    instructions: `Before updating any PROJECT file, apply the "Decision Filtering" guidance from the \`pio-project-knowledge\` skill:

- **Skip implementation-only details:** Internal function signatures, local variable naming, or algorithm choices with no project-wide impact.
- **Skip local design choices:** Decisions scoped to a single file or module with no downstream consequences.
- **Skip one-off decisions:** Temporary workarounds, experimental features, or decisions unlikely to persist.
- **Update when the decision establishes a pattern, convention, or structural change** that future contributors or agents should know about.

When in doubt, skip — it's better to leave a decision undocumented than to force an update that doesn't fit naturally.`,
  },
  {
    id: "evaluate-rules",
    title: "Evaluate against update rules",
    instructions: `For each finding that passes the filter, consult the "Update Rules" section of the \`pio-project-knowledge\` skill to determine:

- Which PROJECT file to update
- Which section within that file
- What action to take (add, modify, document)

If a finding doesn't map to any update rule, skip it.`,
  },
  {
    id: "read-project-files",
    title: "Read existing PROJECT files before modifying",
    instructions: `For each PROJECT file you plan to update, read the current content first. This ensures you:

- Preserve existing content — insert updates at appropriate sections
- Avoid duplicating information already documented
- Match the existing formatting and style`,
  },
  {
    id: "write-updates",
    title: "Write PROJECT file updates",
    instructions: `Apply the updates to \`.pio/PROJECT/*.md\` files. For each update:

- Insert new content at the appropriate section (per the skill's section structure)
- Preserve all existing content
- Be concise — document the change without padding
- Reference the goal or decision that triggered the update when helpful`,
  },
  {
    id: "produce-summary",
    title: "Produce a summary output",
    instructions: `After all updates are applied, produce a structured summary:

- **Files modified:** List each \`.pio/PROJECT/*.md\` file that was changed
- **Changes made:** Brief description of what was added or modified in each file
- **Triggering sources:** Which \`DECISIONS.md\` entry, \`SUMMARY.md\` finding, or \`PLAN.md\` item triggered each change
- **Sources available:** Note which sources were read (\`PLAN.md\`, \`DECISIONS.md\`, per-step \`SUMMARY.md\` files) and which were missing or empty

If no updates were warranted, explicitly state: "No PROJECT file updates were warranted. All decisions from this goal were implementation-specific or locally scoped, and none mapped to project-wide patterns, conventions, or structural changes."`,
  },
  {
    id: "create-pr",
    title: "Create a pull request",
    instructions: `After producing the summary, you **must** create a pull request for this goal's changes. Follow the PR Creation Protocol from the pio-git skill. Pass the goal name and workspace path as context so the skill can derive the PR title and body. This step is required before calling \`pio_mark_complete\`. Graceful failure semantics apply: if PR creation fails due to missing prerequisites (no \`gh\` CLI, not authenticated, no remote, etc.), log a warning and continue — do not block completion. However, skipping this step without attempting is not permitted.`,
    skills: { mandatory: ["pio-git"] },
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `After producing the summary **and** after Step 10 (PR creation) has been attempted, call \`pio_mark_complete\` to signal that your work is done. You must call \`pio_mark_complete\` only after both the summary output and the PR creation attempt are complete.`,
  },
];

export default steps;
