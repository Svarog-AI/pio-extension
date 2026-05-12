# Fix evolve-plan PLANNED marker: rename to COMPLETED and add to write allowlist

# Fix evolve-plan PLANNED marker: rename to COMPLETED and add to write allowlist

The `evolve-plan` capability is instructed by its prompt (`src/prompts/evolve-plan.md`, line ~46) to write a file called `PLANNED` in the goal workspace root when all steps have already been specified. However, the write allowlist in `src/capabilities/evolve-plan.ts` only permits writing inside step folders (`S{NN}/TASK.md`, `S{NN}/TEST.md`). The file protection handler in `validation.ts` will block this write — the agent is told to create the file but cannot.

Two changes are needed:
1. Rename `PLANNED` → `COMPLETED` (consistent naming with other capabilities)
2. Add `COMPLETED` to the evolve-plan write allowlist so the file can actually be written

## Files to modify

### `src/prompts/evolve-plan.md`
- Line ~46: Replace "Write an empty file called `PLANNED`" → "Write an empty file called `COMPLETED`"

### `src/capabilities/evolve-plan.ts` — `resolveEvolveWriteAllowlist`
Current (line ~34):
```
return [`${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`];
```
The allowlist is step-number-dependent — when all steps are complete, the agent writes `COMPLETED` at the goal root (not inside a step folder). The allowlist needs to include `COMPLETED` unconditionally or handle the no-step case:

Option A: Always include it in the allowlist (simplest):
```typescript
return ["COMPLETED", `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`];
```

Option B: Conditional — check if all steps are already defined and only add `COMPLETED` in that path. More correct but requires knowing step completion state at config resolution time.

**Recommendation:** Option A (always include). The agent will only write it when prompted to, so having it in the allowlist unconditionally is harmless.

### `src/capabilities/evolve-plan.ts` — `resolveEvolveValidation`
When all steps are complete (stepNumber exists but step doesn't exist in PLAN.md), the expected output file should be `COMPLETED` instead of `S{NN}/TASK.md` + `S{NN}/TEST.md`. Consider making validation conditional on whether the step actually needs spec writing vs. just signals completion.

### `src/skills/pio/SKILL.md`
- Update references to PLANNED → COMPLETED in workflow lifecycle description

## Open questions
- Should validate-and-find-next-step also check for an existing `COMPLETED` marker and skip re-running evolve-plan if the plan is already fully specified?

## Category

bug

## Context

Relevant files:
- `src/prompts/evolve-plan.md:46` — instructs agent to write `PLANNED` when all steps are done
- `src/capabilities/evolve-plan.ts:34` — `resolveEvolveWriteAllowlist` only allows step-folder writes, not goal-root writes
- `src/capabilities/validation.ts` — file protection handler that enforces allowlists (blocks writes not in allowlist)
