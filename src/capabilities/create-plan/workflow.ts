import type { WorkflowStep } from "../../capability-package";

export default [
  {
    id: "read-goal",
    title: "Read GOAL.md",
    instructions: `Read the \`GOAL.md\` file from the goal workspace directory. This is your contract — it defines what "current state" means and what "done" looks like. If \`GOAL.md\` does not exist, tell the user that they need to create a goal first.

Internalize:
- The **Current State** section (point A)
- The **To-Be State** section (point B)
- Any constraints, references, or external documents mentioned`,
  },
  {
    id: "deep-research",
    title: "Deep research",
    instructions: `Conduct thorough research using your tools (\`read\`, \`bash\`). Follow the research process documented in the \`pio-planning\` skill — read \`.pio/PROJECT/OVERVIEW.md\`, every file referenced in \`GOAL.md\`, trace dependencies, understand existing patterns and test setup, and identify hidden complexity.

**This is where deep research belongs.** You need to be confident about implementation details before writing the plan. If a step's acceptance criteria can't be made programmatic because you don't understand the test setup, go learn the test setup.

As part of the deep research step, leverage the user as an authorative source on questions related to the goal and what needs to be developed. When research reveals feasibility doubts or ambiguous areas, engage the user to resolve them before proceeding.`,
    skills: {
      mandatory: ["pio-planning"],
    },
  },
  {
    id: "validate-assumptions",
    title: "Validate assumptions and gather preferences",
    instructions: `Before designing implementation steps, engage the user to confirm findings and gather input. This is where you close gaps that research alone cannot resolve.

**Verify dimensions before designing steps:** Before designing steps, verify the following dimensions. Follow the \`grill-me\` skill for probing technique — walk decision trees, follow implications, and one question at a time.

- **Feasibility:** Can the proposed approach actually work? Are there hidden dependencies, tooling gaps, or architectural constraints that make the plan infeasible?
- **Scope completeness:** Does GOAL.md cover all necessary changes, or are hard decisions deferred that will bite during implementation?
- **Constraints from existing code:** What conventions, patterns, or shared utilities must the plan respect to stay consistent with the codebase?
- **Downstream impact on consumers:** Who consumes the output of this work? What breaks if we get it wrong?

If any dimension cannot be answered from research or user input, ask before proceeding.

**Present findings:** Summarize what your research uncovered — key files and modules, dependencies discovered, hidden complexity, and any risks or constraints. Keep this concise — the user already knows their goal from GOAL.md. Focus on what's *new* or *surprising*.

**Architecture decisions:** When multiple valid approaches exist, present options with trade-offs using \`ask_user\`. Ask one decision at a time. Follow the ask-user skill protocol: gather context first, present 2-5 clear choices, max 2 attempts per boundary.

**Scope alignment:** Confirm the decomposition matches user expectations — does the scope look right? Are there areas to emphasize or de-prioritize? Should anything be split into a separate goal?

**Assumption checks:** Verify anything you've assumed that research didn't confirm — patterns you intend to follow, implied constraints, or priorities affecting step ordering.

**Execution preferences:** Ask about step sizing (granular vs. larger), parallelism preferences, and any specific tools or approaches they want used or avoided.

**Summarize before proceeding:** After collecting input, present a brief recap of decisions made and confirm you have what you need. Then proceed to step design.`,
    skills: {
      mandatory: ["grill-me"],
    },
  },
  {
    id: "design-steps",
    title: "Design the steps",
    instructions: `Decompose the gap between current state and to-be state into numbered steps. Use the input from Step 3 to inform your decomposition.

**Conceptually, each step is a deliverable.** Design steps as coherent outputs — something you can name and verify as complete. Follow the step design rules from the \`pio-planning\` skill: each step must be concrete, ordered, sized for a single executor session, and independent where possible.

**Classifying steps:** Some deliverables are inherently composite — they contain multiple internal sub-deliverables that can't be described as a single output. These steps should be marked as subgoals so they get their own plan and recursive lifecycle. Follow the subgoal classification guidance in the \`pio-planning\` skill. When writing PLAN.md frontmatter, set \`complexity: "subgoal"\` for composite steps and always provide the \`name\` field for every entry (it serves as the subgoal workspace name when composite).`,
  },
  {
    id: "write-plan",
    title: "Write PLAN.md",
    instructions: `Write \`PLAN.md\` into the goal workspace directory.

**Follow the PLAN.md structure from the \`pio-planning\` skill:** YAML frontmatter with \`totalSteps\`, document title, Prerequisites section, numbered Steps (each with Description, Acceptance Criteria, and Files Affected), and a Notes section.

**Important:** The \`totalSteps\` value in the YAML frontmatter must equal the actual number of step headings in your plan.`,
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `When PLAN.md has been written and confirmed, call the \`pio_mark_complete\` tool to validate that all expected outputs have been produced. If validation reports missing files, produce them before calling again. Do not end your work without calling this tool.`,
  },
] satisfies WorkflowStep[];
