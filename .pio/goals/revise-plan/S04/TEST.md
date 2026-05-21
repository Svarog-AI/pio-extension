# Tests: Add revise-plan transitions in state-machine.ts

## Unit Tests

### evolve-plan → revise-plan transition

**File:** `src/state-machine.test.ts` — new `describe("resolveTransition — evolve-plan → revise-plan")` block

**Test runner:** Vitest (global `describe/it/expect`, Node.js environment)

**Test cases:**

- **describe("resolveTransition — evolve-plan → revise-plan"):**
  - `it("routes to revise-plan when current step has revisionNeeded() returning true")`: Mock state with a step at the requested number where `revisionNeeded()` returns `true`. Call `resolveTransition("evolve-plan", state, { goalName: "feat", stepNumber: 4 })`. Assert result capability is `"revise-plan"` and params include `revisionTriggerStep: 4`.
  
  - `it("includes revisionTriggerStep set to current step number")`: Same setup as above. Assert `result.params.revisionTriggerStep === 4` (matching the stepNumber from params).
  
  - `it("preserves goalName in revise-plan params")`: Verify `result.params.goalName` equals the goal name from input params.
  
  - `it("falls through to execute-task when revisionNeeded returns false")`: Mock state with a step where `revisionNeeded()` returns `false`. Assert result routes to `"execute-task"` (normal routing).

  - `it("falls through to finalize-goal when all steps complete and no revision needed")`: Mock state with `goalCompleted: () => true` and a step with `revisionNeeded: () => false`. Spy on `process.cwd()`. Assert result routes to `"finalize-goal"`.

  - `it("falls through to execute-task when step is not found in state.steps()")`: Mock state with empty `steps()`. Call with `stepNumber: 5`. Assert result routes to `"execute-task"` (safe default — no crash).

  - `it("falls through to existing behavior when stepNumber is missing from params")`: Call without `stepNumber` in params. Assert normal fallback routing via `state.currentStepNumber()` to `"execute-task"`. No revision check performed (can't check a specific step without knowing which one).

### revise-plan → evolve-plan transition

**File:** `src/state-machine.test.ts` — new `describe("resolveTransition — revise-plan → evolve-plan")` block

**Test cases:**

- **describe("resolveTransition — revise-plan → evolve-plan"):**
  - `it("routes to evolve-plan after revise-plan completes")`: Mock state with empty overrides. Call `resolveTransition("revise-plan", state, { goalName: "feat" })`. Assert result capability is `"evolve-plan"`.

  - `it("preserves goalName in evolve-plan params")`: Assert `result.params.goalName` equals the input goal name.

  - `it("does not pass explicit stepNumber (let evolve-plan discover next step)")`: Assert `result.params.stepNumber` is `undefined` — revise-plan should NOT dictate which step to evolve; let the filesystem state decide.

  - `it("preserves revisionTriggerStep if present in params")`: Call with `{ goalName: "feat", revisionTriggerStep: 4 }`. Assert `result.params.revisionTriggerStep === 4` (forwarded for downstream provenance).

### No regression on existing transitions

**File:** `src/state-machine.test.ts` — new `describe("resolveTransition — evolve-plan no-regression")` block

**Test cases:**

- **describe("resolveTransition — evolve-plan no-regression"):**
  - `it("still routes to execute-task with explicit stepNumber when no revision needed")`: Verify the existing test case from before still passes — explicit stepNumber in params, `goalCompleted: () => false`, routes to `"execute-task"`.

  - `it("still routes to finalize-goal when goalCompleted is true and no revision needed")`: Verify `goalCompleted: () => true` still triggers `finalize-goal` (spy on `process.cwd()`, verify `goalDir` and `workingDir`).

## Programmatic Verification

- **What:** TypeScript compiles without errors
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no error output

- **What:** Full test suite passes with no regressions
  - **How:** `npm test`
  - **Expected result:** All existing tests pass + new tests pass. No failures in `src/state-machine.test.ts` or any other test file.

- **What:** `resolveTransition` handles `"revise-plan"` capability string
  - **How:** `grep 'case "revise-plan"' src/state-machine.ts`
  - **Expected result:** Match found — revise-plan is a case in the resolveTransition switch

## Test Order

1. Unit tests (evolve-plan → revise-plan, revise-plan → evolve-plan, no-regression)
2. Programmatic verification (`npx tsc --noEmit`)
3. Full test suite (`npm test`)
