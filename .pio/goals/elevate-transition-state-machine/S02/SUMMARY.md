# Summary: Create state machine module, replace transitions.ts

## Status
COMPLETED

## Files Created
- `src/state-machine.ts` — Pure transition engine with `resolveTransition(capability, state, params)` and `recordTransition(goalDir, fromCapability, toResult)`. Re-exports `TransitionContext`, `TransitionResult`, and `stepFolderName` for backward compatibility.
- `src/state-machine.test.ts` — 31 tests using mock `GoalState` objects for pure transition verification + temp directories for `recordTransition` I/O tests.

## Files Modified
- `src/guards/validation.ts` — Replaced `import { resolveNextCapability } from "../transitions"` with `import { resolveTransition, recordTransition } from "../state-machine"`. Added `import { createGoalState } from "../goal-state"`. In the mark-complete handler: constructs `GoalState` via `createGoalState(dir)`, calls `resolveTransition(capability, state, params)` instead of `resolveNextCapability()`, and calls `recordTransition(dir, capability, nextTask)` after enqueuing the next task.
- `src/guards/validation.ts` (re-execution fix) — Removed unreachable `else if (nextTask && goalName && capability)` block (previously lines 415–427). The condition was identical to the preceding `if`, making it dead code that could never execute.

## Files Deleted
- `src/transitions.ts` — Fully replaced by `src/state-machine.ts`
- `src/transitions.test.ts` — Replaced by `src/state-machine.test.ts` (tests rewritten to use mock `GoalState` objects instead of real filesystem markers)

## Decisions Made
- **`resolveTransition` signature:** Uses three parameters `(capability, state, params)` rather than bundling params inside a `TransitionContext` object. This keeps the function pure and avoids the need for `workingDir` (all state queries go through `GoalState`).
- **Transition rules as individual functions:** Each capability transition is its own pure function (`transitionCreateGoal`, `transitionEvolvePlan`, etc.), dispatched via a `switch` in `resolveTransition`. This follows DAMP principles — each function's purpose is clear from its name.
- **review-code fallback behavior:** When step is not found or status is not "approved"/"rejected", defaults to `execute-task` (safe default matching existing behavior).
- **Audit log format:** JSON array of `{ timestamp, from, to, params }` entries. Malformed files are recovered by starting fresh. All I/O wrapped in try/catch with `console.warn`.
- **`currentStepNumber()` fallback for evolve-plan and execute-task:** When `stepNumber` is missing from params, both transitions fall back to `state.currentStepNumber()` instead of passing incomplete params downstream.

## Test Coverage
- **31 tests in `src/state-machine.test.ts`:**
  - Module structure verification (exports) — 4 tests
  - `create-goal → create-plan` transitions — 2 tests
  - `create-plan → evolve-plan` transitions — 1 test
  - `evolve-plan → execute-task` transitions — 3 tests (including `currentStepNumber()` fallback + param precedence)
  - `execute-task → review-code` transitions — 3 tests (including `currentStepNumber()` fallback + param precedence)
  - `review-code` approval path (mock state with `"approved"` status) — 3 tests
  - `review-code` rejection path (mock state with `"rejected"` status) — 2 tests
  - `review-code` fallback (empty steps, implemented, blocked) — 3 tests
  - Unknown capabilities — 2 tests
  - TransitionResult shape consistency — 2 tests
  - `recordTransition` file creation — 2 tests
  - `recordTransition` append behavior — 2 tests
  - `recordTransition` error handling (non-fatal) — 1 test
  - `recordTransition` isolation from resolveTransition — 1 test
- **All 264 project tests pass** (including 9 existing test suites unaffected by this change)
- **TypeScript compilation passes** with `npm run check` (zero errors)
