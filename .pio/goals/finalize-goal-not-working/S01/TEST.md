# Tests: Include goal name in defaultInitialMessage

## Unit Tests

**File:** `src/capabilities/finalize-goal.test.ts`  
**Test runner:** Vitest (globals mode, Node.js environment)  
**Existing test suite to extend:** `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)`

### New and updated test cases

1. **New: `it("includes the goal name when params.goalName is provided")`**
   - **Arrange:** Call `CAPABILITY_CONFIG.defaultInitialMessage("/tmp/test", { goalName: "my-feature", goalDir: "/abs/goal/dir" })`
   - **Assert:** Result string contains `"my-feature"` (the exact goal name value)

2. **New: `it("formats the goal name naturally in the message")`**
   - **Arrange:** Same inputs as above with a distinctive goal name like `"test-goal-123"`
   - **Assert:** Result string matches a pattern containing both the goal name and goal dir, e.g., expect result to contain `"test-goal-123"` AND `"/abs/goal/dir"`, verifying they appear together in the message

3. **New: `it("gracefully handles missing goalName (backward compat)")`**
   - **Arrange:** Call `CAPABILITY_CONFIG.defaultInitialMessage("/tmp/test", { goalDir: "/abs/goal/dir" })` — no `goalName` in params
   - **Assert:** Result is a non-empty string that still contains the `goalDir` path. The message should not contain empty artifacts like `'' at` or reference an undefined/empty name

4. **New: `it("gracefully handles undefined params")`**
   - **Arrange:** Call `CAPABILITY_CONFIG.defaultInitialMessage("/tmp/test", undefined)` — no params at all
   - **Assert:** Result is a non-empty string (no crash from optional chaining)

### Existing tests that must still pass

- `it("returns a non-empty string when goalDir is provided")` — should still pass; the message format change should not affect this assertion
- `it("includes the goal directory path in the message")` — should still pass; `goalDir` is still included
- `it("includes the word 'goal' or references goal workspace")` — should still pass; "goal" keyword is still present

## Programmatic Verification

- **What:** TypeScript type checking passes with no errors
- **How:** Run `npm run check` (executes `tsc --noEmit`)
- **Expected result:** Exit code 0, no type errors reported

- **What:** Full test suite passes including existing tests
- **How:** Run `npm test` (executes `vitest run`)
- **Expected result:** All tests pass, exit code 0. Specifically the `CAPABILITY_CONFIG.defaultInitialMessage` describe block should have all existing + new tests passing.

## Test Order

1. Unit tests in `finalize-goal.test.ts` (new + existing `defaultInitialMessage` cases)
2. `npm run check` (type checking)
3. `npm test` (full suite verification)
