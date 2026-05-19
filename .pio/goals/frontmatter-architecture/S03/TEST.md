# Tests: Add `getReviewOutputs(stepNumber)` to `GoalState`

## Unit Tests

### File: `src/goal-state.test.ts` (new test cases added to existing file)

**Test runner:** Vitest (existing infrastructure, global `describe/it/expect`)

#### `describe('getReviewOutputs')`

- **Given a valid REVIEW.md with frontmatter, returns typed ReviewOutputs:** Create temp goal directory with `S01/REVIEW.md` containing valid frontmatter (`decision: APPROVED`, issue counts). Call `state.getReviewOutputs(1)`. Assert returned object has correct shape: `decision === "APPROVED"`, all count fields are numbers ≥ 0.

- **Given a REJECTED decision, returns correct type:** Create `S02/REVIEW.md` with `decision: REJECTED` and non-zero issue counts. Call `state.getReviewOutputs(2)`. Assert `decision === "REJECTED"` and counts match input values.

- **Returns null when step folder missing:** Create goal directory but no `S03/` folder. Call `state.getReviewOutputs(3)`. Assert returns `null`.

- **Returns null when REVIEW.md missing:** Create `S01/` with TASK.md and TEST.md but no REVIEW.md. Call `state.getReviewOutputs(1)`. Assert returns `null`.

- **Returns null when REVIEW.md has no frontmatter:** Write `S01/REVIEW.md` with markdown content only (no `---` delimiters). Call `state.getReviewOutputs(1)`. Assert returns `null`.

- **Returns null for malformed YAML:** Write `S01/REVIEW.md` with `---\ninvalid: yaml: [:\n---\n# body`. Call `state.getReviewOutputs(1)`. Assert returns `null`.

- **Returns null for invalid decision value:** Write frontmatter with `decision: MAYBE` (not APPROVED or REJECTED). Call `state.getReviewOutputs(1)`. Assert returns `null` (validation failure).

- **Returns null for negative issue counts:** Write frontmatter with `criticalIssues: -5`. Call `state.getReviewOutputs(1)`. Assert returns `null` (validation failure).

- **Returns null for missing required fields:** Write frontmatter with only `decision: APPROVED` (missing count fields). Call `state.getReviewOutputs(1)`. Assert returns `null` (validation failure).

- **Step number zero-padded correctly (step 5 → S05):** Create `S05/REVIEW.md` with valid frontmatter. Call `state.getReviewOutputs(5)`. Assert returns typed data (proves path resolution uses zero-padding).

### File: `src/frontmatter-schemas.ts` — schema structure test (new describe block in `src/capabilities/review-task.test.ts`)

Since the schema moved from `review-task.ts` to `frontmatter-schemas.ts`, move the existing schema structure tests from `review-task.test.ts` to verify the schema is correctly exported from the new location.

**Test runner:** Vitest

- **Schema exports are accessible from frontmatter-schemas:** Import `REVIEW_OUTPUT_SCHEMA` and type `ReviewOutputs` from `../frontmatter-schemas`. Assert schema has expected structure (type check, required fields). This verifies the move is correct and imports work without circular dependencies.

### File: `src/capabilities/review-task.test.ts` (existing tests — regression)

All existing 35 tests must continue to pass after importing schema from `frontmatter-schemas.ts` instead of defining locally. No behavioral change expected — only import paths changed.

## Programmatic Verification

- **TypeScript compilation:** Run `npx tsc --noEmit`. Expected result: zero errors. This verifies no circular dependency exists and all types resolve correctly.

- **Schema import chain verification:** Run `grep -c "REVIEW_OUTPUT_SCHEMA" src/goal-state.ts`. Expected result: ≥ 1 (confirms schema is imported in goal-state). Run `grep "from.*frontmatter-schemas" src/capabilities/review-task.ts`. Expected result: ≥ 1 match (confirms import from new location).

- **No circular imports:** Run `npx tsc --noEmit` — if this passes with no errors, the circular dependency is resolved. TypeScript would report an error if a cycle existed with type-level imports.

## Test Order

1. Unit tests in `src/goal-state.test.ts` (new `getReviewOutputs` describe block)
2. Schema structure test in `src/capabilities/review-task.test.ts` (verifies import from new location)
3. Regression: full existing test suite in `src/capabilities/review-task.test.ts` (35 tests)
4. Programmatic verification: `npx tsc --noEmit`, import chain grep checks
5. Full test suite: `npx vitest run` (all files, confirm no regressions)
