# Task: Create revise-plan prompt

Create `src/prompts/revise-plan.md` — the system prompt that drives the plan revision agent session.

## Context

The pio workflow now supports mid-project plan revisions. When an evolve-plan step discovers that remaining steps are no longer valid (due to new decisions, discovered constraints, or scope changes), it triggers a revise-plan session. The `prepareSession` hook has already archived the old PLAN.md and deleted incomplete step folders. The agent starts with only completed (APPROVED) step folders and needs to write a fresh PLAN.md from scratch.

This prompt defines the revise-plan agent's role, workflow, and output requirements. It must reference the shared planning skill (`src/skills/pio-planning/SKILL.md`) for methodology details rather than duplicating them.

## What to Build

A new system prompt file `src/prompts/revise-plan.md` containing instructions specific to plan revision. The agent's job is: read context, identify completed steps, and write a fresh PLAN.md that preserves completed work as anchors while planning new future steps.

### Prompt Structure

The prompt should follow the structural conventions of existing prompts (e.g., `create-plan.md`, `evolve-plan.md`):
1. **Role definition** — "You are a Plan Revision Agent"
2. **Setup section** — goal workspace directory, path conventions
3. **Process steps** — numbered ordered workflow
4. **Guidelines** — constraints and best practices
5. **Signal completion** — call `pio_mark_complete`

### Prompt Content — Process Steps

The agent should execute these steps in order:

1. **Read GOAL.md** — understand current state, to-be state, and constraints from the goal definition.
2. **Read archived plans** — find the most recent file in `PLAN_ARCHIVE/` (sorted by name/timestamp) for reference on what was planned before. Read all archived plans if there are multiple — they show the revision history.
3. **Identify completed steps** — scan remaining `S{NN}/` folders. Those with an `APPROVED` marker file are completed and immutable. Record their step numbers and titles (from TASK.md or the last known PLAN_ARCHIVE).
4. **Write fresh PLAN.md** — create a new plan containing:
   - Completed step entries as historical anchors, marked clearly as immutable (e.g., "[COMPLETED]" in the title or description)
   - New future steps continuing numbering after the last completed step (e.g., if steps 1–3 are APPROVED, new steps start at Step 4)
   - `totalSteps` frontmatter reflecting the actual count of all entries (completed + new)
5. **Handle changes to completed code** — if the revision requires changes to already-completed implementations, add NEW future steps ("revert X and replace with Y") rather than modifying completed step entries. Completed steps are immutable references.
6. **Signal completion** — call `pio_mark_complete` when PLAN.md is written.

### Skill References

- Reference `src/skills/pio-planning/SKILL.md` for planning methodology (step structure, acceptance criteria rules, research process, scope discipline). This is the shared skill created in Step 1.
- Include the standard skill-loading instructions pattern (load pio skill + matching skills) consistent with other prompts.

### Key Behavioral Instructions

- Do not modify GOAL.md
- Do not start implementing anything — PLAN.md only
- Completed step entries should be preserved as historical anchors but clearly marked immutable
- New steps must follow planning methodology from the shared skill
- If changes to completed code are needed, add new future steps rather than editing completed entries
- The agent receives the goal workspace directory path in its first user message

## Dependencies

- **Step 1:** Shared planning skill (`src/skills/pio-planning/SKILL.md`) must exist — the prompt references it for methodology.
- **Step 3:** Revise-plan capability implementation — the `CAPABILITY_CONFIG` uses prompt `"revise-plan.md"`, so this filename must match what the capability expects.

## Files Affected

- `src/prompts/revise-plan.md` — new file: revise-plan system prompt

## Acceptance Criteria

- [ ] `src/prompts/revise-plan.md` exists with revise-specific instructions
- [ ] Prompt references the shared planning skill (`src/skills/pio-planning/SKILL.md`) for methodology
- [ ] Prompt instructs agent to read archived plans from `PLAN_ARCHIVE/` and completed step folders
- [ ] Prompt instructs agent to write fresh PLAN.md with completed steps as anchors + new future steps
- [ ] Prompt instructs agent to add new future steps (not modify completed entries) when changes to completed code are needed
- [ ] Prompt references the correct shared skill path (`src/skills/pio-planning/SKILL.md`, not `src/skills/planning/SKILL.md`)
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Skill path must match actual directory:** The plan originally specified `src/skills/planning/` but Step 1 created `src/skills/pio-planning/`. Use the actual path.
- **Prompt filename convention:** The capability config references `"revise-plan.md"` — the filename must match exactly (no extension mismatch).
- **Completed step identification:** The agent needs to know which folder markers indicate completion (`APPROVED`). This should be explicit in the prompt.
- **Empty PLAN_ARCHIVE edge case:** On first revision, there's exactly one archived plan. On subsequent revisions, there may be multiple. The prompt should handle both cases (read most recent as primary reference).
