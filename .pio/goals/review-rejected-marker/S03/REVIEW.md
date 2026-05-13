# Code Review: Update `review-code` transition with explicit `REJECTED` check (Step 3)

## Decision
APPROVED

## Summary
The implementation correctly adds an explicit `REJECTED` file check to the `CAPABILITY_TRANSITIONS["review-code"]` resolver in `src/utils.ts`. REJECTED is checked before APPROVED (safety preference — rejection wins if both exist). Rejection routes back to `execute-task` with the same step number and no extra flags, relying on the marker file itself as the signal for downstream code. All acceptance criteria are met, all 168 tests pass with zero regressions, and type checking is clean.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- [LOW] TEST.md specifies a fourth test case — `"routes to execute-task when neither marker exists"` — but this scenario is already covered by the pre-existing test `"returns execute-task with same stepNumber when APPROVED missing"` in the rejection-path describe block. No new test was added for it under the REJECTED routing block. This is not a coverage gap, just a minor organizational deviation from the spec. — `__tests__/transition.test.ts`

## Test Coverage Analysis
All TASK.md acceptance criteria are covered:
1. **REJECTED checked before APPROVED** — verified by implementation code order (lines 322-325) and test "returns execute-task when REJECTED exists"
2. **Rejection routes to `execute-task` with same step number, no extra flags** — verified by test assertions matching `{ capability: "execute-task", params: { goalName: "feat", stepNumber: 3 } }`
3. **Approval unchanged** — verified by existing tests "returns evolve-plan with incremented stepNumber when APPROVED exists" and "preserves goalName while incrementing stepNumber"
4. **Fallback unchanged** — verified by existing test "returns execute-task with same stepNumber when APPROVED missing"
5. **REJECTED takes precedence over APPROVED** — verified by test "REJECTED takes precedence when both APPROVED and REJECTED exist"
6. **Type check clean** — `npm run check` exits 0

Programmatic verification from TEST.md all pass:
- `npm run check` — exits 0, no type errors
- `npm run test` — all 168 tests pass (including 3 new REJECTED-routing tests)
- `grep -n "REJECTED" src/utils.ts` — matches at lines 321-322

## Gaps Identified
- **GOAL ↔ PLAN**: Step 3 plan item asks for a `rejectedAfterReview: true` param or different initialMessage. TASK.md explicitly decided against this — the REJECTED file itself is the signal. This is a documented deviation that aligns with the overall goal (marker files as single source of truth) and simplifies Step 4's feedback channel (it checks for the file on disk). No gap.
- **PLAN ↔ TASK**: Faithful representation. TASK.md adds the precedence decision (REJECTED over APPROVED) and explicitly documents no-extra-params approach.
- **TASK ↔ TESTS**: All criteria covered. Minor note: TEST.md lists 4 new test cases but only 3 were added — the "neither exists" case is already covered by pre-existing tests.
- **TASK ↔ Implementation**: Exact match. Code follows the three-way branch described in TASK.md.

## Recommendations
N/A — implementation is clean and complete.
