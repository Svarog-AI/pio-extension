# Task: Decouple `validation.ts` from `session-capability.ts`

Remove the dependency of `validation.ts` on module-level getters in `session-capability.ts`. All values needed during mark-complete should be derived locally from `config.sessionParams` and `createGoalState(dir)`.

## Context

Steps 1–3 introduced `GoalState`, replaced `transitions.ts` with `state-machine.ts`, and migrated capability validation functions to `GoalState`. The remaining coupling: `validation.ts` imports `getSessionParams` and `getStepNumber` from `session-capability.ts`. This ties the validation module to session-level state management — a dependency that serves no purpose since both values are available locally.

The PLAN.md mentions `getGoalState()` in `session-capability.ts`, but there's no actual consumer: capabilities already construct their own state via `createGoalState(goalDir)`, `validation.ts` already does the same, and command handlers don't run inside sub-sessions where module-level state would be populated. Adding a cached singleton that nobody uses is unnecessary complexity.

## What to Build

### Remove session-capability dependency from `validation.ts`

Replace two call sites with locally-available values:

**1. `getSessionParams()` → use `config.sessionParams` directly**

Currently at line ~371:
```
const sessionParams = getSessionParams() || config.sessionParams || {};
```

Replace with:
```
const sessionParams = config.sessionParams || {};
```

The completing session's params are in `config.sessionParams` (set when the capability was launched via `launchCapability()`). This is the authoritative source — the enriched params from session-capability were a copy of these same values anyway.

**2. `getStepNumber()` → derive from `config.sessionParams` with fallback to `state.currentStepNumber()`**

Currently at line ~374:
```
const stepNumber = getStepNumber();
```

Replace with:
```
const stepNumber = typeof sessionParams.stepNumber === "number" 
  ? sessionParams.stepNumber 
  : state.currentStepNumber();
```

The `state` object (`createGoalState(dir)`) is already constructed in scope at this point (~line 376). For review-code automation at line ~311, apply the same pattern:
```
const autoStepNumber = typeof config.sessionParams?.stepNumber === "number"
  ? config.sessionParams.stepNumber
  : createGoalState(dir).currentStepNumber();
```

Or if `state` is already available by that point in the code flow, reuse it directly.

**3. Remove the import line entirely:**
```
// Before: import { getSessionParams, getStepNumber } from "../capabilities/session-capability";
// After: (deleted)
```

## Code Components

### Changed call sites in `validation.ts`

Two values derived locally instead of via module-level getters:
- `sessionParams` ← `config.sessionParams` (no fallback to session-capability)
- `stepNumber` ← `config.sessionParams.stepNumber` or `state.currentStepNumber()` (local derivation)

### Deleted import in `validation.ts`

`getSessionParams` and `getStepNumber` removed from the import of `../capabilities/session-capability`. After removal, if no other imports from that module remain, remove the entire import statement.

## Approach and Decisions

- **Keep it minimal.** Only change what's necessary: two call sites + one import line in `validation.ts`. Do not add new exports, functions, or module-level state to any file.
- **`config.sessionParams` is authoritative.** It contains the params passed when the capability sub-session was created — exactly the same values that `enrichedSessionParams` in session-capability derives from. No behavioral change.
- **Fallback to `state.currentStepNumber()` is safe.** When `stepNumber` is missing from session params (edge case), `currentStepNumber()` returns the next step to work on by scanning the filesystem — this matches what `discoverNextStep()` does and was the original fallback behavior of `getStepNumber()`.

## Dependencies

- **Step 1:** `src/goal-state.ts` with `createGoalState()` (COMPLETED, APPROVED)
- **Step 2:** `src/state-machine.ts` with `resolveTransition()`, `recordTransition()` (COMPLETED, APPROVED)
- **Step 3:** Capability validation migrated to `GoalState` (COMPLETED, APPROVED)

## Files Affected

- `src/guards/validation.ts` — modified: remove session-capability import, derive `sessionParams` and `stepNumber` locally

## Acceptance Criteria

- [ ] `npm run check` reports no type errors
- [ ] `npm test` passes all existing tests (264+ across 11 files)
- [ ] `validation.ts` no longer imports from `session-capability.ts` — verify via `grep 'session-capability' src/guards/validation.ts` returns 0 matches
- [ ] The review-code mark-complete flow still creates APPROVED/REJECTED markers and routes correctly — existing integration test in `validation.test.ts` proves this
- [ ] Successful transitions still write audit entries to `<goalDir>/transitions.json` — existing behavior preserved

## Risks and Edge Cases

- **stepNumber for review-code automation:** Currently uses `getStepNumber()` which reads from `enrichedSessionParams`. After migration, it derives from `config.sessionParams?.stepNumber` with fallback to `state.currentStepNumber()`. In normal operation these produce the same value — verify the existing integration test covers this path (it creates REVIEW.md + COMPLETED and runs the full automation sequence).
- **`_sessionContext` propagation:** The mark-complete flow spreads `_sessionContext: sessionParams` into enqueued task params. When switching from `getSessionParams()` to `config.sessionParams`, ensure the same object shape is used — both come from the same source (`CapabilityConfig.sessionParams`), so they should be identical.
