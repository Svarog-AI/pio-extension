# Tests: Update `review-code` transition with explicit `REJECTED` check

## Unit Tests

- **File:** `__tests__/transition.test.ts` (existing — add new test cases to the "rejection path" describe block)
- **Test runner:** vitest (`npm run test`)

### New test cases in a new `describe("REJECTED marker routing")` block

1. **`it("returns execute-task when REJECTED exists")`** — Arrange: create temp dir with `S03/REJECTED`. Act: resolve transition with stepNumber 3. Assert: result capability is `"execute-task"`, params are `{ goalName, stepNumber: 3 }` (no extra flags).
2. **`it("preserves goalName when REJECTED routes to execute-task")`** — Arrange: `S02/REJECTED` with goalName `"my-feature"`. Assert: result params contain `goalName: "my-feature"` and `stepNumber: 2`.
3. **`it("REJECTED takes precedence when both APPROVED and REJECTED exist")`** — Arrange: `S05/` contains both `APPROVED` and `REJECTED`. Act: resolve with stepNumber 5. Assert: result is `"execute-task"` with `stepNumber: 5` (rejection wins, not approval).
4. **`it("routes to execute-task when neither marker exists")`** — Arrange: `S03/` exists with no markers. Assert: result is `"execute-task"` with params `{ goalName, stepNumber: 3 }`.

### Existing tests to verify unchanged (no new code needed — existing tests should still pass)

- "returns evolve-plan with incremented stepNumber when APPROVED exists" — must still pass (APPROVED-only path unchanged).
- "preserves goalName while incrementing stepNumber" — must still pass.
- "returns execute-task with same stepNumber when APPROVED missing" — this test currently passes because no APPROVED exists; verify it still routes to `execute-task` with the correct params. No REJECTED file is present, so fallback path applies.
- "increment does not mutate original ctx.params" — must still pass.

## Programmatic Verification

- **TypeScript type check:** Run `npm run check`. Expected result: exits with code 0, no type errors reported. The change adds a filesystem existence check and routes to execute-task with the same params shape — no new types required.
- **Full test suite:** Run `npm run test` (vitest). Expected result: all existing tests pass + new REJECTED-routing tests pass. Zero regressions.
- **Source code structure:** Verify the transition resolver contains a `REJECTED` check using: `grep -n "REJECTED" src/utils.ts`. Expected result: at least one match referencing the rejected file path construction and one match in the routing logic.

## Test Order

1. Run new unit tests (vitest) — verify REJECTED marker routing, REJECTED-over-APPROVED precedence, and fallback behavior
2. Run full test suite (`npm run test`) — confirm zero regressions
3. Run `npm run check` — confirm no type errors
