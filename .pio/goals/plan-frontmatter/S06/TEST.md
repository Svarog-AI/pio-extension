# Tests: Modify transitionEvolvePlan to return undefined when all steps complete

## Unit Tests

### goalCompleted() — new GoalState method

- **File:** `src/goal-state.test.ts` (existing test file)
- **Test runner:** Vitest
- **Pattern:** Create real directory trees under `os.tmpdir()` with `fs.mkdtempSync()`, clean up in `afterEach`. This matches the existing `goal-state.test.ts` pattern — tests use real filesystem I/O, not mocks.

Test cases (new `describe("goalCompleted")` block):

1. **`returns true when COMPLETED marker exists`**
   - Arrange: create goalDir with PLAN.md (any content), write empty `COMPLETED` file at root
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `true`

2. **`returns true when currentStepNumber() > totalPlanSteps (frontmatter completion)`**
   - Arrange: create goalDir with PLAN.md containing frontmatter `totalSteps: 3`, create S01/APPROVED, S02/APPROVED, S03/APPROVED (all three approved so `currentStepNumber()` returns 4)
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `true`

3. **`returns false when steps remain (currentStepNumber <= totalSteps)`**
   - Arrange: create goalDir with PLAN.md containing frontmatter `totalSteps: 5`, create S01/APPROVED only (`currentStepNumber()` returns 2)
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `false`

4. **`returns false when no COMPLETED marker and no frontmatter`**
   - Arrange: create goalDir with PLAN.md without frontmatter, no COMPLETED file
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `false`

5. **`returns true for single-step plan (totalSteps=1, S01 APPROVED)`**
   - Arrange: create goalDir with PLAN.md frontmatter `totalSteps: 1`, S01/APPROVED
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `true` (`currentStepNumber()` returns 2, which is > 1)

6. **`COMPLETED marker takes precedence even without frontmatter`**
   - Arrange: create goalDir with PLAN.md (no frontmatter), write COMPLETED file
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `true` — either signal is sufficient

7. **`returns false when totalPlanSteps() is undefined and no COMPLETED marker`**
   - Arrange: create goalDir with PLAN.md containing invalid frontmatter (e.g., missing totalSteps), no COMPLETED file
   - Act: `createGoalState(goalDir).goalCompleted()`
   - Assert: returns `false`

### validateAndFindNextStep() — refactored completion check

- **File:** `src/capabilities/evolve-plan.test.ts` (existing test file from Step 5)
- **Test runner:** Vitest
- **Pattern:** Existing tests use `fs.mkdtempSync()` with real directory trees. Update existing "frontmatter-based completion" tests to verify the refactored behavior through `goalCompleted()`. Test expectations are identical — only the implementation path changed.

Test cases (update existing `describe("validateAndFindNextStep with frontmatter-based completion")` block):

1. **Existing: `writes COMPLETED and returns not-ready when all steps approved`**
   - No change needed — behavior is identical, just flows through `state.goalCompleted()` internally.
   - Verify: still writes COMPLETED marker, returns not-ready with step count message.

2. **Existing: `proceeds normally when currentStepNumber() <= totalSteps`**
   - No change needed — normal flow unaffected.

3. **Existing: `existing COMPLETED guard still blocks relaunch`**
   - Update: the separate COMPLETED pre-launch guard is now part of `goalCompleted()`. Verify the refactored check still returns not-ready when COMPLETED exists.

4. **New: `PlanFrontmatter import removed from evolve-plan.ts`**
   - Programmatic: verify `import type { PlanFrontmatter }` no longer appears in evolve-plan.ts source.

### transitionEvolvePlan() — completion detection

- **File:** `src/state-machine.test.ts` (existing test file)
- **Test runner:** Vitest
- **Pattern:** Use existing `mockState()` helper to construct partial `GoalState` objects with controlled `goalCompleted()` return values.

Test cases (new `describe("resolveTransition — evolve-plan completion detection")` block):

1. **`returns undefined when goal is completed`**
   - Arrange: mock state with `goalCompleted()` returning `true`
   - Act: `resolveTransition("evolve-plan", state, { goalName: "feat" })`
   - Assert: result is `undefined`

2. **`routes to execute-task when goal not completed`**
   - Arrange: mock state with `goalCompleted()` returning `false`, `currentStepNumber()` returning `3`
   - Act: `resolveTransition("evolve-plan", state, { goalName: "feat" })`
   - Assert: result is `{ capability: "execute-task", params: { goalName: "feat", stepNumber: 3 } }`

3. **`routes to execute-task with explicit stepNumber when not completed`**
   - Arrange: mock state with `goalCompleted()` returning `false`, `currentStepNumber()` returning `5`
   - Act: `resolveTransition("evolve-plan", state, { goalName: "feat", stepNumber: 2 })`
   - Assert: result is `{ capability: "execute-task", params: { goalName: "feat", stepNumber: 2 } }` — explicit param takes precedence

## Programmatic Verification

- **What:** TypeScript type checking passes with no errors after modifying return types and adding `goalCompleted()` to interface
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no type errors

- **What:** Full test suite passes with no regressions
- **How:** `npm test` (runs `vitest run`)
- **Expected result:** All tests pass including new `goalCompleted()` and evolve-plan completion detection tests

## Test Order

1. Unit tests for `goalCompleted()` — verify completion signals with real filesystem trees
2. Unit tests for `transitionEvolvePlan()` — verify transition routing with mock GoalState objects
3. Programmatic verification — TypeScript compilation and full test suite
