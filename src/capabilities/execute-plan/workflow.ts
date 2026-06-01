import type { WorkflowStep } from "../../capability-package";

export default [
  {
    id: "read-goal",
    title: "Read GOAL.md for context",
    instructions: `Read the \`GOAL.md\` file from the goal workspace directory. Internalize:

- The **Current State** section — what exists today
- The **To-Be State** section — the target outcome
- Any constraints, references, or external documents mentioned

This gives you the big picture. You will narrow your focus to each step next.`,
  },
  {
    id: "read-plan",
    title: "Read PLAN.md and understand all steps",
    instructions: `Read the \`PLAN.md\` file from the goal workspace directory. Study the entire plan:

- Every step's **Description** — what exactly changes
- Every step's **Acceptance criteria** — what must be verifiable for completion
- Every step's **Files affected** — which files are created, modified, or deleted
- Step ordering and **dependencies** — steps that depend on earlier steps
- Any **Prerequisites** or **Notes** at the top of the plan

Understand the full scope before you begin coding.`,
  },
  {
    id: "research",
    title: "Research supporting context",
    instructions: `Use your tools (\`read\`, \`bash\`) to understand the codebase areas your steps touch:

1. Read the files listed in "Files affected" — understand existing patterns, conventions, and interfaces.
2. Trace imports and dependencies — what modules will be affected? Are there shared utilities or types that need updating?
3. Understand the testing setup: how are things tested today? What tools (TypeScript compiler, linters, test runners) are available for programmatic verification?

Be thorough — this research ensures your implementation is grounded in reality and your acceptance criteria can be checked programmatically.`,
  },
  {
    id: "implement",
    title: "Implement all steps sequentially",
    instructions: `Implement every step from PLAN.md in order. For each step:

1. Make the code changes described in the step's Description.
2. Follow any guidelines about patterns, conventions, or decisions noted in the plan.
3. After completing a step, verify its acceptance criteria:
   - **Programmatic checks** — run existing test suites, type-checking (\`npm run check\` or equivalent), linting, or build commands. Prefer these over manual checks.
   - **Manual checks** — if programmatic verification is truly impossible, perform the manual check described in the acceptance criteria (e.g., inspect file content, verify a specific string exists).
4. If a step depends on an earlier step, make sure that step is fully complete before proceeding.

Continue until **all** steps are implemented and verified.`,
  },
  {
    id: "verify",
    title: "Final verification",
    instructions: `After implementing all steps:

1. Run the full type-check command (e.g., \`npm run check\` or \`npx tsc --noEmit\`) to ensure no TypeScript errors were introduced.
2. Re-run any existing test suites relevant to the areas you changed.
3. Confirm that every acceptance criterion across all steps has been satisfied.`,
  },
  {
    id: "commit-changes",
    title: "Commit changes",
    instructions: `Load the \`pio-git\` skill and commit the changes. If git fails, log a warning and proceed — never block workflow completion.`,
    skills: { mandatory: ["pio-git"] },
  },
  {
    id: "signal-completion",
    title: "Signal completion",
    instructions: `When all steps are implemented and verified, call \`pio_mark_complete\` to signal that your work is done. If validation rules are configured for this session, it will check that expected output files exist — produce any missing files and call again if needed.`,
  },
] satisfies WorkflowStep[];
