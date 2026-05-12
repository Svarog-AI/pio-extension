# Task: Fix evolve-plan COMPLETED marker — detection, validation, allowlist, and prompt

Rename `PLANNED` → `COMPLETED`, fix the write allowlist so COMPLETED can be written at the goal workspace root, make validation pass when COMPLETED is present instead of step-folder files, and add a pre-launch guard for already-complete plans.

## Context

The `evolve-plan` capability instructs the Specification Writer agent to write an empty file called `PLANNED` when all plan steps are already specified. The agent detects this *inside the sub-session* by reading PLAN.md and not finding its assigned step heading. Three problems: (1) naming is inconsistent — should be `COMPLETED`; (2) the write allowlist blocks it (only permits writes inside `S{NN}/` folders); (3) validation expects step-folder files (`TASK.md`, `TEST.md`) that won't exist when COMPLETED is written instead.

The "all steps complete" detection happens inside the sub-session — the host doesn't need to parse PLAN.md. The host only needs to: allow the write, accept COMPLETED as valid output, and skip launching if COMPLETED already exists.

## What to Build

Four targeted changes across two files plus a small validation engine enhancement:

### A. Pre-launch guard in `validateAndFindNextStep` (evolve-plan.ts)

Before calling `discoverNextStep`, check if `COMPLETED` already exists at the goal workspace root (`fs.existsSync(path.join(goalDir, "COMPLETED"))`). If present, return `{ ready: false, error }` — do not relaunch. This prevents unnecessary sub-sessions when the plan is already fully evolved.

### B. Always include `"COMPLETED"` in the write allowlist (evolve-plan.ts)

Change `resolveEvolveWriteAllowlist` to always include `"COMPLETED"` alongside step-folder paths:

```typescript
return ["COMPLETED", `${folder}/${TASK_FILE}`, `${folder}/${TEST_FILE}`];
```

This is safe — having COMPLETED always-allowed is harmless. The agent only writes it when the prompt instructs it to.

### C. Validation short-circuits on COMPLETED (validation.ts)

Modify `validateOutputs` in `validation.ts` so that if a `COMPLETED` file exists at `baseDir`, validation passes immediately — regardless of other expected files. This allows the agent to write just COMPLETED (when all steps are done) and have `pio_mark_complete` succeed without step-folder files.

Implementation: at the start of `validateOutputs`, before checking individual files, add:
```typescript
// If COMPLETED marker exists at baseDir, pass validation regardless of other expected files
if (fs.existsSync(path.join(baseDir, "COMPLETED"))) {
  return { passed: true, missing: [] };
}
```

This only affects evolve-plan in practice — it's the only capability that writes `COMPLETED` at the goal workspace root. Other capabilities write COMPLETED inside `S{NN}/` folders, not at baseDir.

### D. Rename PLANNED → COMPLETED in the prompt (evolve-plan.md)

In `src/prompts/evolve-plan.md`, change `PLANNED` to `COMPLETED` in the "all steps complete" instruction (around line 46). Ensure no references to `PLANNED` remain anywhere in the file.

## Approach and Decisions

- **No host-side PLAN.md parsing.** The agent inside the sub-session handles detection via prompt instructions. Keep the boundary clean: host validates filesystem state (COMPLETED exists → don't relaunch), agent interprets plan content.
- **Always-allowed COMPLETED in write list.** Simple, harmless — avoids conditional logic in the allowlist callback.
- **Validation short-circuit on COMPLETED at baseDir.** Minimal change to `validateOutputs` that solves the problem without restructuring the validation architecture or threading special flags through params.

## Dependencies

None. This is Step 1 and the only step in the plan.

## Files Affected

- `src/capabilities/evolve-plan.ts` — modified: COMPLETED pre-launch guard in `validateAndFindNextStep`; `"COMPLETED"` always included in `resolveEvolveWriteAllowlist`
- `src/capabilities/validation.ts` — modified: `validateOutputs` short-circuits to pass when `COMPLETED` exists at `baseDir`
- `src/prompts/evolve-plan.md` — modified: rename `PLANNED` → `COMPLETED`

## Acceptance Criteria

- [ ] `npm run check` reports no TypeScript errors
- [ ] `npm test` passes all existing tests without regression
- [ ] Running `/pio-evolve-plan <goal>` when `COMPLETED` already exists shows an error notification and does not launch a sub-session
- [ ] The write allowlist always includes `"COMPLETED"` so the agent can write it at the goal workspace root
- [ ] When COMPLETED exists at the goal root, validation passes regardless of step-folder file presence
- [ ] Normal evolve-plan flow (valid step exists) is unaffected — still creates S{NN}/, expects TASK.md + TEST.md
- [ ] `src/prompts/evolve-plan.md` instructs writing `COMPLETED` (no references to `PLANNED` remain anywhere in the file)

## Risks and Edge Cases

- **COMPLETED exists but was manually created or from an old run.** The pre-launch guard treats any existing COMPLETED as "done." If someone needs to re-evolve, they can delete it. Acceptable trade-off.
- **Validation short-circuit scope.** The `validateOutputs` change affects all capabilities, not just evolve-plan. However, only evolve-plan writes `COMPLETED` at the goal workspace root. Other capabilities write COMPLETED inside `S{NN}/` subfolders, which wouldn't match `path.join(baseDir, "COMPLETED")`. Safe in practice.
- **Transition after writing COMPLETED:** When the agent writes COMPLETED and calls `pio_mark_complete`, validation passes (short-circuit), and `resolveNextCapability("evolve-plan", ...)` fires with stepNumber=N+1. The transition sends it to execute-task, which will detect no ready steps for N+1 and report an error. This is existing behavior — ensure it still works.
- **Backwards compatibility:** A `PLANNED` file from an older evolve-plan version is harmless (just an empty marker). No migration needed.
