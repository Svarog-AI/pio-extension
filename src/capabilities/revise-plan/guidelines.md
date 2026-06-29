## Guidelines

- **Do not modify GOAL.md.** Your output is `PLAN.md` only.
- **Completed steps are immutable.** Preserve them as historical anchors with `[COMPLETED]` markers. Never modify completed step entries to reflect new plans.
- **Handle changes to completed code via new steps.** If the revision requires changes to already-completed implementations, add NEW future steps ("revert X and replace with Y") rather than editing completed entries.
- **New steps follow planning methodology.** Refer to the `pio-planning` skill for step structure, acceptance criteria rules, and sizing guidelines.
- **No dedicated verification steps.** Do not create steps titled "Verify", "Validate", "Check", "Test", "Confirm", or similar where the sole purpose is verification. Each step's acceptance criteria already handle verification — a dedicated check step is always redundant. (Exception: steps that update tests as part of a larger deliverable are permitted; an integration verification step spanning multiple steps near the end is allowed.)
- **Reference real files only.** Every path in PLAN.md should correspond to a file you actually read or confirmed exists. Don't guess paths.
- **No source code in PLAN.md.** Describe every step in natural language or high-level pseudocode. You may write a short interface signature (type stub) if it clarifies a contract — never full function bodies or class implementations.
- **Do not implement.** Your job ends when PLAN.md is written. Do not create source files, modify code, or run build commands as part of this process.
- **Be proactive about scope.** If the remaining work seems to require major architectural changes, note them in the Notes section so executors are aware.
- **`totalSteps` must be accurate.** Count all step headings (completed + new) and set the frontmatter value accordingly.
- **Follow the priority hierarchy for implementation details.** When rewriting the plan, follow the priority hierarchy for implementation details defined in the `pio-planning` skill.
