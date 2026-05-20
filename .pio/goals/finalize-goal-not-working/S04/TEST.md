# Tests: Update tests to verify transition params and initial message

## Unit Tests

### File: `src/state-machine.test.ts`

**Test runner:** Vitest (Node.js environment, globals enabled)

**Verify existing — `resolveTransition — evolve-plan completion detection`:**

1. **`describe('resolveTransition — evolve-plan completion detection')`:** Verify the following tests exist and pass:

   - **`routes to finalize-goal when goal is completed`**: Given a mock state with `goalCompleted() → true` and params `{ goalName: "feat" }`, `resolveTransition("evolve-plan", state, params)` returns `{ capability: "finalize-goal", params: { goalName: "feat", goalDir: "<cwd>/.pio/goals/feat", workingDir: "<cwd>" } }`. Uses `vi.spyOn(process, "cwd").mockReturnValue("<cwd>")` to control cwd. Assert exact shape with `.toEqual()`.

   - **`propagates goalName in finalize-goal params`**: Given a different goal name (e.g., `"my-feature"`) and extra params like `stepNumber`, the transition still routes to finalize-goal with all three expected fields: `goalName`, `goalDir`, `workingDir`.

   - **`includes goalDir computed from resolveGoalDir`**: Assert that `result.params.goalDir` equals the resolved path `<cwd>/.pio/goals/<goalName>`. Verifies `resolveGoalDir` was called correctly.

   - **`includes workingDir set to process.cwd()`**: Assert that `result.params.workingDir` equals the mocked cwd (project root, not goal workspace).

2. **Add if missing — `non-completion paths are unaffected`:** Given `goalCompleted() → false` and params `{ goalName: "feat" }`, the transition returns `{ capability: "execute-task", params: { goalName: "feat", stepNumber: <state.currentStepNumber()> } }`. No `goalDir` or `workingDir` in params.

### File: `src/capabilities/finalize-goal.test.ts`

**Test runner:** Vitest (Node.js environment, globals enabled)

**Verify existing — `CAPABILITY_CONFIG.defaultInitialMessage`:**

1. **`includes the goal name when params.goalName is provided`**: Given `defaultInitialMessage("/tmp/test", { goalName: "my-feature", goalDir: "/abs/goal/dir" })`, the returned string contains `"my-feature"`.

2. **`formats the goal name naturally in the message`**: Assert both the goal name and goal directory appear in the same message string.

3. **`gracefully handles missing goalName (backward compat)`**: Given `{ goalDir: "/abs/goal/dir" }` without `goalName`, the message is non-empty, contains the goal dir, and does NOT contain empty artifacts like `'' at`. The fallback phrasing `"goal workspace"` should appear.

4. **`gracefully handles undefined params`**: Given `undefined` params, returns a non-empty string (no crash).

### File: `src/capability-config.test.ts`

**Test runner:** Vitest (Node.js environment, globals enabled)

**Verify existing — `resolveCapabilityConfig — explicit workingDir override`:**

1. **`explicit workingDir overrides goalName-based derivation`**: Given params `{ capability: "finalize-goal", goalName: "my-feature", workingDir: "/explicit/path" }`, the resolved config's `workingDir` is exactly `/explicit/path`.

2. **`goalName-based derivation still works when workingDir is absent`**: Given params `{ capability: "create-plan", goalName: "my-feature" }` (no `workingDir`), the resolved `workingDir` is `<cwd>/.pio/goals/my-feature`.

3. **`fallback to cwd when neither workingDir nor goalName is present`**: Given params `{ capability: "project-context" }`, the resolved `workingDir` equals `cwd`.

4. **`empty string workingDir does not override goalName derivation`**: Given params `{ capability: "finalize-goal", goalName: "my-feature", workingDir: "" }`, the resolved `workingDir` falls through to `goalName`-based derivation (`<cwd>/.pio/goals/my-feature`).

## Integration Tests

### File: `src/capability-config.test.ts`

**What:** Verify end-to-end interaction between state machine transition output and capability config resolution. This connects Step 2's transition params to Step 3's precedence check — proving that the auto-transition path produces a correctly resolved config.

**Test cases:**

1. **`finalize-goal auto-transition params resolve workingDir to project root`**: Simulate the params shape that `transitionEvolvePlan()` returns for a completed goal: `{ capability: "finalize-goal", goalName: "my-feature", goalDir: "<cwd>/.pio/goals/my-feature", workingDir: "<cwd>" }`. Call `resolveCapabilityConfig(cwd, params)`. Assert:
   - `result.workingDir` equals `<cwd>` (project root, not goal workspace)
   - `result.capability` equals `"finalize-goal"`
   - `result.writeAllowlist` contains `.pio/PROJECT/OVERVIEW.md` (static write allowlist is preserved)

2. **`finalize-goal initial message includes goal name via auto-transition params`**: Using the same params shape as above, assert that `result.initialMessage` contains the goal name `"my-feature"`. This verifies Step 1's fix works through the full resolution chain: transition → config resolution → defaultInitialMessage invocation.

### File: `src/state-machine.test.ts`

**What:** Verify the full transition chain leading to finalize-goal produces correct params at each stage.

**Test cases (add if missing):**

3. **`review-task approval leads to evolve-plan which routes to finalize-goal when complete`**: Given a mock state where step 3 is approved AND `goalCompleted() → true`, verify:
   - `resolveTransition("review-task", state, { goalName: "feat", stepNumber: 3 })` returns `{ capability: "evolve-plan", params: { goalName: "feat", stepNumber: 4 } }` (normal approval path — step increments)
   - Then calling `resolveTransition("evolve-plan", completeState, { goalName: "feat", stepNumber: 4 })` with `goalCompleted() → true` returns the finalize-goal transition with all three params.

   This two-step chain proves the review→evolve→finalize flow is wired correctly.

## Programmatic Verification

1. **What:** Full test suite passes with no failures
   **How:** `npm run test` (runs `vitest run`)
   **Expected result:** Exit code 0, all tests pass, no errors in output

2. **What:** TypeScript type checking passes with no errors
   **How:** `npm run check` (runs `tsc --noEmit`)
   **Expected result:** Exit code 0, no type errors reported

3. **What:** state-machine.test.ts contains completion detection tests asserting expanded params
   **How:** `grep -c 'goalDir\|workingDir' src/state-machine.test.ts`
   **Expected result:** Count ≥ 4 (multiple references to goalDir and workingDir in test assertions)

4. **What:** finalize-goal.test.ts contains a test for goal name in initial message
   **How:** `grep -c 'goalName\|goal name' src/capabilities/finalize-goal.test.ts`
   **Expected result:** Count ≥ 2 (references to goalName in test code)

5. **What:** capability-config.test.ts contains explicit workingDir override tests
   **How:** `grep -c 'workingDir' src/capability-config.test.ts`
   **Expected result:** Count ≥ 4 (multiple references including describe block name and assertions)

## Test Order

Execute in this priority:

1. **Unit tests** — `npm run test -- src/state-machine.test.ts` (isolated transition logic)
2. **Unit tests** — `npm run test -- src/capabilities/finalize-goal.test.ts` (isolated capability config and message generation)
3. **Unit + integration tests** — `npm run test -- src/capability-config.test.ts` (includes cross-module integration)
4. **Full suite** — `npm run test` (verifies no regressions across all 21+ test files)
5. **Type check** — `npm run check` (verifies type safety of all changes)
