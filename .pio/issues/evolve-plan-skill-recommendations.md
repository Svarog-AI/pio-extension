# evolve-plan should recommend relevant skills in TASK.md

When `evolve-plan` generates `TASK.md` for a step, it should identify which pi skills are relevant to the task and include them in the TASK.md file so the `execute-task` agent knows to load them.

Currently, skill loading instructions are injected via `_skill-loading.md` at the prompt level, telling agents to scan `<available_skills>` and load matching ones. However, the specification writer (`evolve-plan`) has better context about what a specific step requires — it understands the files affected, the approach, and the code components involved.

Having `evolve-plan` explicitly recommend skills in `TASK.md` would:

1. **Reduce ambiguity** — the execute-task agent won't have to guess which skills apply
2. **Improve consistency** — skill usage is driven by the spec, not left to agent interpretation
3. **Catch missing skills** — if a step requires a skill that isn't loaded, it's visible upfront

**Suggested approach:**

- `evolve-plan` analyzes the step description, files affected, and code components
- It identifies relevant skills from the filesystem (e.g., `test-driven-development`, `pio-git`, `source-research`)
- It adds a `## Skills` section to `TASK.md` listing recommended skills with a brief justification for each
- The `execute-task` prompt already instructs agents to load matching skills — this makes the recommendation explicit in the spec itself

## Category

improvement

## Context

Related files: src/capabilities/evolve-plan.ts, src/prompts/evolve-plan.md, src/prompts/execute-task.md, src/prompts/_skill-loading.md
