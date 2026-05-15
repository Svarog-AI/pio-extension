# Tests: Create state machine module, replace transitions.ts

## Unit Tests

**File:** `src/state-machine.test.ts` (renamed from `src/transitions.test.ts`)  
**Test runner:** Vitest (`npm test`)

### Transition structure

Verify the new module exports the expected symbols and types.

- `describe("exports")`: verify `resolveTransition`, `recordTransition`, `TransitionContext`, `TransitionResult`, and `stepFolderName` are all exported from `./state-machine`

### resolveTransition — create-goal → create-plan

Pure function, no filesystem needed. Mock `GoalState` is trivial (only `goalName` matters).

- `describe("resolveTransition — create-goal → create-plan")`:
  - Given capability `"create-goal"` and any mock state, returns `{ capability: "create-plan", params: <preserved> }`
  - When params contains `goalName`, it is preserved in the result
  - When params is undefined, `params` in result is `undefined`

### resolveTransition — create-plan → evolve-plan

- `describe("resolveTransition — create-plan → evolve-plan")`:
  - Given capability `"create-plan"` and any mock state, returns `{ capability: "evolve-plan", params: <preserved> }`

### resolveTransition — evolve-plan → execute-task

- `describe("resolveTransition — evolve-plan → execute-task")`:
  - When params contains `stepNumber`, result includes `execute-task` with `goalName` and `stepNumber` propagated
  - When params is missing `stepNumber`, result includes `execute-task` with original params (no stepNumber injected)

### resolveTransition — execute-task → review-code

- `describe("resolveTransition — execute-task → review-code")`:
  - When params contains `stepNumber`, result includes `review-code` with `goalName` and `stepNumber` propagated
  - When params is missing `stepNumber`, result includes `review-code` with original params

### resolveTransition — review-code (approval path)

**Key test:** Prove the transition is pure — uses mock `GoalState`, no real filesystem.

- `describe("resolveTransition — review-code approval")`:
  - Mock state where `steps()` returns a step with `status()` → `"approved"`: routes to `evolve-plan` with `stepNumber + 1`
  - Preserves `goalName` while incrementing `stepNumber`
  - When `stepNumber` is missing from params, falls back to `execute-task` (no step to look up)

### resolveTransition — review-code (rejection path)

- `describe("resolveTransition — review-code rejection")`:
  - Mock state where `steps()` returns a step with `status()` → `"rejected"`: routes to `execute-task` with same `stepNumber`
  - Preserves `goalName` and same `stepNumber` in result

### resolveTransition — review-code (unknown/missing step)

- `describe("resolveTransition — review-code fallback")`:
  - Mock state where `steps()` returns empty array (no matching step): routes to `execute-task` with same `stepNumber`
  - Mock state where step status is `"implemented"` (COMPLETED but not yet reviewed): routes to `execute-task` (default)
  - Mock state where step status is `"blocked"`: routes to `execute-task` (safe default)

### resolveTransition — unknown capabilities

- `describe("resolveTransition — unknown capability")`:
  - Unknown string → returns `undefined`
  - Empty string → returns `undefined`

### TransitionResult shape consistency

- `describe("TransitionResult shape consistency")`:
  - String transitions (create-goal, create-plan) wrap in `TransitionResult` with `params`
  - Callback transitions return `TransitionResult` directly (not double-wrapped)

### recordTransition — audit log creation and append

This function does real I/O (writes to disk). Use temp directories.

- `describe("recordTransition — file creation")`:
  - First call creates `<goalDir>/transitions.json` with a single-entry JSON array
  - Entry contains: `timestamp` (ISO string), `from`, `to`, `params`
- `describe("recordTransition — append to existing")`:
  - Second call appends to the existing JSON array (file now has 2 entries)
  - Subsequent calls continue appending (verify entry count matches call count)
- `describe("recordTransition — error handling")`:
  - When `goalDir` is unwritable, function does not throw (non-fatal, silent failure via try/catch)

### recordTransition — does not interfere with resolveTransition

- `describe("recordTransition isolation")`:
  - Verify that calling `recordTransition` does not affect subsequent `resolveTransition` calls (proves modularity)

## Programmatic Verification

- **What:** TypeScript compilation passes with no errors after removing `transitions.ts`
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no error output

- **What:** All tests pass
  - **How:** `npm test`
  - **Expected result:** Exit code 0, all tests green (old transitions.test.ts cases ported + new state-machine tests)

- **What:** `src/transitions.ts` no longer exists
  - **How:** `test ! -f src/transitions.ts && echo "PASS" || echo "FAIL"`
  - **Expected result:** Output contains "PASS"

- **What:** `src/state-machine.ts` exists and exports all required symbols
  - **How:** `grep -c 'export' src/state-machine.ts`
  - **Expected result:** At least 5 exports (resolveTransition, recordTransition, plus re-exported types)

- **What:** No production files import from `./transitions` anymore
  - **How:** `grep -rn "from.*transitions" src/ --include="*.ts" | grep -v ".test.ts"`
  - **Expected result:** No output (zero matches)

- **What:** `src/guards/validation.ts` imports from `./state-machine`
  - **How:** `grep 'from.*state-machine' src/guards/validation.ts`
  - **Expected result:** At least one match containing `resolveTransition`

## Test Order

1. **Unit tests** — `resolveTransition` pure function tests with mock `GoalState` (no filesystem)
2. **Unit tests** — `recordTransition` I/O tests with temp directories
3. **Programmatic verification** — type check, test suite, file existence checks

## Notes

- Mock `GoalState` objects are plain inline objects in test code: `{ goalName: "test", steps: () => [{ stepNumber: 3, folderName: "S03", status: () => "approved" }], ... }`. Only implement the methods needed for each test case.
- The old `transitions.test.ts` used real filesystem markers (APPROVED/REJECTED files) to verify review-code routing. These tests are rewritten to use mock `GoalState` objects — this is a core goal of Step 2: transitions are pure functions that receive state, they don't do I/O themselves.
- Existing tests in `validation.test.ts`, `evolve-plan.test.ts`, etc. may import types from `./transitions`. These imports should be updated to use `./state-machine` as part of this step (the re-exported types maintain compatibility).
