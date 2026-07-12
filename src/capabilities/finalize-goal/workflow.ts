import type { WorkflowStep } from "../../runtime/workflow-types";

const steps: WorkflowStep[] = [
  {
    id: "read-plan",
    title: "Read the `plan` input for overall scope",
    instructions: `Read the \`plan\` input from the goal workspace root. This tells you:

- What was planned to change (intent and scope)
- Which files were targeted
- The overall architecture or capability being built

Use this to identify new capabilities, modules, or architectural changes that may warrant PROJECT file updates.`,
  },
  {
    id: "read-summaries",
    title: "Read per-step completion summaries",
    instructions: `Scan the subdirectories in the goal workspace. Read completion summaries from each one that exists. These provide ground truth of what was actually built:

- Files created, modified, or deleted per step
- Decisions made during implementation
- Test coverage details

If a subdirectory has no completion summary, skip it gracefully.

**Subgoal-aware reading:** When scanning subdirectories, check for a \`subgoals/\` subdirectory inside each one. If present, this step spawned nested subgoals. For each subgoal workspace under \`subgoals/<name>/\`:

- Read the subgoal's requirements file for context on what was built
- Read per-sub-step completion summaries from the subgoal workspace

Treat the subgoal as a single unit — don't confuse subgoal subdirectories with parent subdirectories. The subgoal's completion marker signals that the parent step is complete.`,
  },
  {
    id: "read-decisions",
    title: "Read additional context if provided",
    instructions: `If the initial user message provides a path to an accumulated decisions file, read it for explicit architectural decisions, file placement changes, and prompt reference mappings captured during the goal lifecycle.

**The decisions file may be missing, empty, or incomplete.** If it doesn't exist or has no relevant content, proceed using only the \`plan\` input and completion summaries. Note this in your final summary.`,
  },
  {
    id: "synthesize",
    title: "Synthesize a complete picture",
    instructions: `Combine insights from all available sources:

- **\`plan\` input** — intent: what was planned and targeted
- **Completion summaries** — ground truth: what was actually built, files changed, decisions made per step
- **Decisions file** (if provided) — explicit decisions: captured architectural choices and patterns

Cross-reference all available sources: if the \`plan\` input mentions a new capability module that a completion summary confirms was created, still evaluate it for PROJECT file updates. Do not rely on any single source alone.`,
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
- **Triggering sources:** Which decisions entry, completion summary finding, or \`plan\` input item triggered each change
- **Sources available:** Note which sources were read (the \`plan\` input, decisions file, per-step completion summaries) and which were missing or empty

If no updates were warranted, explicitly state: "No PROJECT file updates were warranted. All decisions from this goal were implementation-specific or locally scoped, and none mapped to project-wide patterns, conventions, or structural changes."`,
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `After producing the summary, call \`pio_mark_complete\` to signal that your work is done. You must call \`pio_mark_complete\` only after the summary output is complete.`,
  },
];

export default steps;
