# Task: Update evolve-plan capability config for DECISIONS.md

Modify the step-dependent config callbacks in `evolve-plan.ts` so that Step 2+ includes `DECISIONS.md` in both validation and write allowlist, while Step 1 remains unchanged.

## Context

Currently, `pio_evolve_plan` produces only `TASK.md` and `TEST.md` per step. The carryover mechanism requires a `DECISIONS.md` to be written alongside them for Step 2+, so architectural decisions from earlier steps propagate forward. This task modifies the capability config — the actual content of DECISIONS.md is produced by the Specification Writer agent (prompt changes in Step 2).

## What to Build

### Code Components

#### 1. `DECISIONS_FILE` constant

Add a module-level constant `DECISIONS_FILE = "DECISIONS.md"` alongside the existing constants (`PLAN_FILE`, `TASK_FILE`, `TEST_FILE`) near the top of `evolve-plan.ts`.

#### 2. Update `resolveEvolveValidation` callback

Currently returns `{ files: ["S{NN}/TASK.md", "S{NN}/TEST.md"] }` for all steps. Modify to conditionally append `S{NN}/DECISIONS.md` when `stepNumber > 1`:

- Step 1: `[S01/TASK.md, S01/TEST.md]` (unchanged)
- Step 2+: `[S02/TASK.md, S02/TEST.md, S02/DECISIONS.md]`

Follow the existing pattern: extract `stepNumber` from params, compute `folder` via `stepFolderName(stepNumber)`, build the files array.

#### 3. Update `resolveEvolveWriteAllowlist` callback

Currently returns `["COMPLETED", "S{NN}/TASK.md", "S{NN}/TEST.md"]` for all steps. Modify to conditionally append `S{NN}/DECISIONS.md` when `stepNumber > 1`:

- Step 1: `["COMPLETED", "S01/TASK.md", "S01/TEST.md"]` (unchanged)
- Step 2+: `["COMPLETED", "S02/TASK.md", "S02/TEST.md", "S02/DECISIONS.md"]`

Follow the existing pattern: extract `stepNumber`, compute `folder`, build the array.

### Approach and Decisions

- Follow the exact same conditional branching pattern already used in both callbacks (checking `stepNumber > 1`).
- The constant `DECISIONS_FILE` should be a simple string constant like `TASK_FILE` and `TEST_FILE`.
- Both callbacks already extract `stepNumber` and compute `folder` — reuse those variables.
- No changes to `validateAndFindNextStep`, the tool handler, or the command handler are needed for this step.
- The config callback pattern (`ConfigCallback`) receives `(workingDir, params)` where `params.stepNumber` is always a number at call time (validated earlier).

## Dependencies

None. This is Step 1 and does not depend on any prior work.

## Files Affected

- `src/capabilities/evolve-plan.ts` — add `DECISIONS_FILE` constant; update `resolveEvolveValidation` and `resolveEvolveWriteAllowlist` to conditionally include `DECISIONS.md` for `stepNumber > 1`
- `src/capabilities/evolve-plan.test.ts` — add tests for the new DECISIONS.md behavior

## Acceptance Criteria

- [ ] A new constant `DECISIONS_FILE = "DECISIONS.md"` exists in `evolve-plan.ts`
- [ ] `resolveEvolveValidation` returns `{ files: ["S01/TASK.md", "S01/TEST.md"] }` for `stepNumber=1` (no DECISIONS.md)
- [ ] `resolveEvolveValidation` returns `{ files: ["S02/TASK.md", "S02/TEST.md", "S02/DECISIONS.md"] }` for `stepNumber=2`
- [ ] `resolveEvolveWriteAllowlist` includes `S02/DECISIONS.md` for `stepNumber=2`
- [ ] `resolveEvolveWriteAllowlist` does not include `S01/DECISIONS.md` for `stepNumber=1`
- [ ] Existing tests in `evolve-plan.test.ts` still pass (no regressions)
- [ ] `npm run check` reports no TypeScript errors

## Risks and Edge Cases

- Ensure `stepNumber` is always a valid positive integer when callbacks are invoked — this is already guaranteed by the enqueuing logic, but tests should verify the boundary (step 1 vs step 2).
- The order of files in the validation array matters for error messages; append DECISIONS.md at the end to keep it additive.
- Do not modify `discoverNextStep` in `fs-utils.ts` — that function checks for TASK.md + TEST.md completeness, which is independent of DECISIONS.md (DECISIONS.md is produced by evolve-plan, and discoverNextStep is used to find the *next* step to evolve).
