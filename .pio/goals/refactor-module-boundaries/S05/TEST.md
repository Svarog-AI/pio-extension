# Tests: Move `validation.ts`, `turn-guard.ts` to `src/guards/` + update validation imports

This is a structural refactor step — no behavioral changes. All existing tests should pass with only import path updates. The test suite uses Vitest (`npm test`).

## Integration Tests

### `__tests__/validation.test.ts` — update import path

- **File:** `__tests__/validation.test.ts`
- **What:** Update the module import to point to the new `src/guards/` location. After removing the bad test (see below), verify all remaining tests still pass identically.
- **Change:** Import line changes from:
  ```typescript
  // Before
  } from "../src/capabilities/validation";
  // After
  } from "../src/guards/validation";
  ```
- **Test cases affected (all should pass unchanged):**
  - `describe("validateOutputs")` — 6 tests for file-existence validation engine
  - `describe("extractGoalName")` — 7 tests for path-parsing logic
  - `describe("parseReviewFrontmatter")` — 8 tests for YAML frontmatter extraction
  - `describe("validateReviewFrontmatter")` — 5 tests for decision/count validation
  - `describe("applyReviewDecision")` — 5 tests for marker file creation/deletion
  - `describe("validateReviewState")` — 5 tests for post-creation consistency check
  - `describe("review-code markComplete automation")` — 3 integration tests for full review flow (the bad source-reading test is removed)

### `__tests__/turn-guard.test.ts` — update import path

- **File:** `__tests__/turn-guard.test.ts`
- **What:** Update the module import to point to the new `src/guards/` location. Verify all 12 existing tests still pass identically.
- **Change:** Import line changes from:
  ```typescript
  // Before
  import { isThinkingOnlyTurn, setupTurnGuard, __testSetActiveSession } from "../src/capabilities/turn-guard";
  // After
  import { isThinkingOnlyTurn, setupTurnGuard, __testSetActiveSession } from "../src/guards/turn-guard";
  ```
- **Test cases affected (all should pass unchanged):**
  - `describe("isThinkingOnlyTurn")` — 6 tests for pure detection logic
  - `describe("setupTurnGuard")` — 7 tests for handler registration and dead-turn recovery

### Remove bad test from `validation.test.ts`

- **File:** `__tests__/validation.test.ts`
- **What:** The test case `"non-review-code path is unaffected"` reads source code from disk (`../src/capabilities/validation.ts`) to verify implementation details. This is not a valid behavioral test — it will break on any file move and tests the wrong thing.
- **Change:** Delete this entire test case.

## Programmatic Verification

- **What:** TypeScript type checking passes with zero errors after the move
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no diagnostics output

- **What:** All remaining validation tests pass after import update and bad test removal
  - **How:** `npm test __tests__/validation.test.ts`
  - **Expected result:** All remaining tests pass, exit code 0 (one less than before)

- **What:** All turn-guard tests pass after import update
  - **How:** `npm test __tests__/turn-guard.test.ts`
  - **Expected result:** All ~12 tests pass, exit code 0

- **What:** New files exist at correct paths
  - **How:** `test -f src/guards/validation.ts && test -f src/guards/turn-guard.ts`
  - **Expected result:** Exit code 0 (both files exist)

- **What:** Old files still exist (not yet deleted — that's Step 8)
  - **How:** `test -f src/capabilities/validation.ts && test -f src/capabilities/turn-guard.ts`
  - **Expected result:** Exit code 0 (both still present during migration)

- **What:** `src/guards/validation.ts` imports from correct decomposed modules
  - **How:** `grep -c 'from "../../transitions"' src/guards/validation.ts` and `grep -c 'from "../../queues"' src/guards/validation.ts` and `grep -c 'from "../../fs-utils"' src/guards/validation.ts`
  - **Expected result:** Each grep returns at least 1 match (all three decomposed modules are imported)

- **What:** `src/guards/validation.ts` imports session-capability from correct relative path
  - **How:** `grep 'session-capability' src/guards/validation.ts`
  - **Expected result:** Line contains `../capabilities/session-capability` (not `./session-capability`)

- **What:** No remaining references to `../utils` in `src/guards/validation.ts`
  - **How:** `grep -c 'from "../utils"' src/guards/validation.ts || true`
  - **Expected result:** 0 matches

## Test Order

1. Update imports in both test files (validation.test.ts, turn-guard.test.ts) — must happen before running tests
2. Run programmatic verification: `npm run check` first to catch any TypeScript errors early
3. Run `npm test __tests__/turn-guard.test.ts` (simpler file, no internal import changes needed beyond the test file itself)
4. Run `npm test __tests__/validation.test.ts` (more complex — requires bad test removal)
