# Tests: Modify state machine transitions, register in index.ts, verify compilation

## Unit Tests

### State Machine — evolve-plan completion routing to finalize-goal

**File:** `src/state-machine.test.ts` (existing test update)  
**Test runner:** Vitest

Update the existing test suite under `"resolveTransition — evolve-plan completion detection"`:

- **Test case 1 (UPDATE):** Rename and rewrite `"returns undefined when goal is completed"` → `"routes to finalize-goal when goal is completed"`.  
  Arrange: mock state with `goalCompleted: () => true`.  
  Act: `resolveTransition("evolve-plan", state, { goalName: "feat" })`.  
  Assert: result equals `{ capability: "finalize-goal", params: { goalName: "feat" } }` (not `undefined`).

- **Test case 2 (NEW):** `"propagates goalName in finalize-goal params"`.  
  Arrange: mock state with `goalCompleted: () => true`.  
  Act: `resolveTransition("evolve-plan", state, { goalName: "my-feature", stepNumber: 5 })`.  
  Assert: result.capability is `"finalize-goal"`, result.params.goalName is `"my-feature"`.

- **Test case 3 (NEW):** Add to `"resolveTransition — unknown capability"` suite — `"returns undefined for finalize-goal"` (no outgoing transition).  
  Arrange: mock state with any config.  
  Act: `resolveTransition("finalize-goal", state, { goalName: "feat" })`.  
  Assert: result is `undefined`.

- **Existing test cases:** The two existing tests (`"routes to execute-task when goal not completed"` and `"routes to execute-task with explicit stepNumber when not completed"`) should remain unchanged — they verify the non-completed path still works.

## Programmatic Verification

### TypeScript Compilation

- **What:** No type errors after state machine changes and index.ts import
- **How:** `npx tsc --noEmit`
- **Expected result:** Exits with code 0, no error output

### Full Test Suite

- **What:** All existing tests still pass (no regressions) plus updated/added tests pass
- **How:** `npx vitest run`
- **Expected result:** All tests pass. Total test count should increase by ~1-2 (the new finalize-goal case in unknown capabilities and the goalName propagation test). The previously-failing `"returns undefined when goal is completed"` test no longer appears (renamed/rewritten).

### index.ts Registration

- **What:** `setupFinalizeGoal` is imported and called
- **How:** `grep -c 'setupFinalizeGoal' src/index.ts`
- **Expected result:** Output is `2` (one import, one call)

### State Machine Changes

- **What:** `transitionEvolvePlan` returns finalize-goal on completion
- **How:** `grep 'finalize-goal' src/state-machine.ts`
- **Expected result:** At least 2 matches — one in `transitionEvolvePlan` body, one as a `case` in `resolveTransition`

### OVERVIEW.md Updates

- **What:** Repository structure mentions finalize-goal.ts
- **How:** `grep 'finalize-goal' .pio/PROJECT/OVERVIEW.md`
- **Expected result:** At least 1 match in the capabilities section

- **What:** Skills section includes pio-project-knowledge
- **How:** `grep 'pio-project-knowledge' .pio/PROJECT/OVERVIEW.md`
- **Expected result:** At least 1 match in the skills section

## Test Order

1. Update state-machine.test.ts tests (unit — drives implementation)
2. Implement state machine changes, index.ts registration, OVERVIEW.md updates
3. Run `npx tsc --noEmit` (programmatic compilation check)
4. Run `npx vitest run` (full test suite verification)
5. Run grep-based checks on index.ts, state-machine.ts, and OVERVIEW.md
