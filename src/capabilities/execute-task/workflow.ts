import type { WorkflowStep } from "../../capability-package";

/**
 * Structured workflow steps for the execute-task (Execute Task Agent) capability.
 * Decomposed from the numbered steps in the original execute-task.md prompt.
 */
export default [
  {
    id: "read-goal-and-plan",
    title: "Read GOAL.md and PLAN.md for context",
    instructions: `Read the \`GOAL.md\` file in the goal workspace directory. Internalize:

- The **Current State** section — what exists today
- The **To-Be State** section — the target outcome
- Any constraints, references, or external documents mentioned

Then read \`PLAN.md\` from the same directory. Find your assigned step and understand:

- How it fits into the overall plan
- Dependencies on earlier steps
- The broader architecture being built

This gives you the big picture before narrowing to your task.`,
  },
  {
    id: "read-task-and-decisions",
    title: "Read TASK.md and (if needed) DECISIONS.md",
    instructions: `Read files from \`S{NN}/\` (your step folder):

- **TASK.md** — the focused specification of what to build, including code components, approach decisions, files affected, and acceptance criteria.

**DECISIONS.md (Step 2+):** \`S{NN}/DECISIONS.md\` may also exist alongside these files. It contains accumulated architectural decisions from all preceding steps (e.g., file placement changes, departures from the original plan). Treat it as supplementary context — read it if present but never treat it as a prerequisite. The primary source of truth for what to implement remains \`TASK.md\`. For Step 1 (\`S01/\`), this file will not exist; proceed using only \`TASK.md\`.`,
  },
  {
    id: "research-context",
    title: "Research supporting context",
    instructions: `Use your tools (\`read\`, \`bash\`) to understand the codebase areas your task touches:

1. Read the files listed in TASK.md's "Files affected" section — understand existing patterns, conventions, and interfaces.
2. Trace imports and dependencies — what modules will be affected? Are there shared utilities or types that need updating?
3. Understand the testing setup: how are things tested today? What tools (TypeScript compiler, linters, test runners) are available?
4. Look at similar code in the project to follow existing patterns.

Be thorough — this research ensures your implementation matches the project's conventions and your tests are feasible.`,
  },
  {
    id: "iterative-tdd",
    title: "Iterative TDD",
    instructions: `Apply the \`tdd\` skill for the iterative development cycle (tracer bullet → incremental RED→GREEN → refactor). The skill contains all methodology details.

After all tests pass and refactoring is done, create \`TEST.md\` inside the \`S{NN}/\` folder as a post-hoc summary record of what was actually tested. Use the "Given ____ when ____ then ____" format for test case descriptions.

**TEST.md format:** Start with a single short paragraph describing what is tested. Then list test cases as single sentences following the "Given/when/then" pattern. List programmatic verification commands below unit tests using the same pattern.

**Important:** TEST.md is created AFTER implementation, not before. It is a record of what was tested, not a pre-written test plan.`,
    skills: {
      mandatory: ["tdd"],
    },
  },
  {
    id: "run-verification",
    title: "Run all verification",
    instructions: `Execute every verification systematically:

1. **Run formal tests** — execute the test suite and confirm all pass.
2. **Run programmatic checks** — execute each command from TASK.md acceptance criteria (e.g., \`npm run check\`, \`grep -c 'setupXxx' src/index.ts\`).
3. **Perform manual checks** if specified, following the step-by-step instructions.

If any check fails, go back to the Iterative TDD step and iterate until all pass.

**Handling user-requested changes:** After initial implementation is complete (from this step onward), you may receive user messages requesting changes — for example: "can you also do X", "change this approach", "merge this with another file". Treat these as **user-requested changes**, distinct from the original \`TASK.md\` scope.

If code changes are requested, make sure to keep using the \`tdd\` skill methodology. Using this is **CRITICAL**!

After applying each user-requested change, before proceeding to final verification or completion, you **must** update \`SUMMARY.md\` to record:

- What the user requested (brief description)
- Which files were created, modified, or deleted as a result of that specific change

This ensures \`SUMMARY.md\` always reflects the final state of all files, regardless of how many feedback iterations occur during the session.`,
  },
  {
    id: "verify-acceptance-criteria",
    title: "Verify non-test acceptance criteria",
    instructions: `Cross-reference TASK.md's acceptance criteria with your implementation:

- Are all listed files created, modified, or deleted as specified?
- Do integration points (imports, exports, wiring) work correctly?
- Are conventions followed (naming, patterns, styles matching existing code)?
- Have you stayed within scope — no unplanned refactoring or out-of-scope changes?`,
  },
  {
    id: "write-completion-artifacts",
    title: "Write completion artifacts",
    instructions: `Write \`SUMMARY.md\` at \`S{NN}/SUMMARY.md\` starting with a YAML frontmatter block at the very top of the file, before any markdown headings. The frontmatter provides structured outcome data for automation:

\`\`\`yaml
---
status: completed
---
\`\`\`

Use \`status: completed\` when all tests pass and all criteria are met. Use \`status: blocked\` when blocking issues cannot be resolved — include the explanation in the SUMMARY.md body text (not in a separate file).

After the frontmatter closing \`---\`, write the human-readable markdown body. For successful steps, include: Status, Files Created, Files Modified, Files Deleted, Decisions Made, User-Requested Changes, and Test Coverage sections. For blocked steps, document what was attempted and what remains blocked.

Then follow these steps:

1. **Commit changes using the \`pio-git\` skill** — load the \`pio-git\` skill and commit the changes. If git fails, log a warning and proceed — never block workflow completion.
2. **Call \`pio_mark_complete\`** to validate outputs and signal completion.

After \`pio_mark_complete\`, the infrastructure reads \`SUMMARY.md\` frontmatter to determine next steps: \`status: completed\` routes to \`review-task\`, \`status: blocked\` stops the pipeline.`,
    skills: {
      mandatory: ["pio-git"],
    },
  },
] satisfies WorkflowStep[];
