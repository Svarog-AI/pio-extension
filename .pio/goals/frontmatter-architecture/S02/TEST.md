# Tests: Add types, output schema, and marker creation to `review-task.ts`

## Unit Tests

### File: `src/capabilities/review-task.test.ts` (existing — append new test suites)

**Test runner:** Vitest (globals mode, Node.js environment)

#### New suite: `REVIEW_OUTPUT_SCHEMA` (typebox-based)

- `describe('REVIEW_OUTPUT_SCHEMA')`:
  - **it("is a typebox schema object with correct structure")** — Assert `REVIEW_OUTPUT_SCHEMA.type === "object"`. Assert `REVIEW_OUTPUT_SCHEMA.required` contains exactly `["decision", "criticalIssues", "highIssues", "mediumIssues", "lowIssues"]`.
  - **it("decision field is anyOf (union) of APPROVED and REJECTED")** — Assert `REVIEW_OUTPUT_SCHEMA.properties.decision.anyOf` exists. Extract the two options: one should have `const: "APPROVED"`, the other `const: "REJECTED"`.
  - **it("count fields are integer type with minimum 0")** — For each of the four count fields, assert `properties[fieldName].type === "integer"` and `properties[fieldName].minimum === 0`.

#### New suite: `ReviewOutputs` type derived from schema

- `describe('ReviewOutputs')`:
  - **it("is exported and matches the schema structure")** — Import both `REVIEW_OUTPUT_SCHEMA` and `ReviewOutputs`. Verify at compile time that a valid object `{ decision: "APPROVED", criticalIssues: 0, highIssues: 0, mediumIssues: 0, lowIssues: 0 }` satisfies `ReviewOutputs`. Test by assigning to a typed variable.

#### New suite: `applyReviewDecision` (moved from validation.ts)

Use `fs.mkdtempSync()` for temp directories, `createGoalTree()` helper for directory setup.

- `describe('applyReviewDecision')`:
  - **it("creates APPROVED marker on APPROVED decision")** — Arrange: create goal dir with S01/ folder containing COMPLETED and REVIEW.md. Call `applyReviewDecision(goalDir, 1, { decision: "APPROVED", criticalIssues: 0, highIssues: 0, mediumIssues: 0, lowIssues: 0 })`. Assert: `S01/APPROVED` exists, `S01/COMPLETED` still exists.
  - **it("creates REJECTED marker and deletes COMPLETED on REJECTED decision")** — Arrange: create goal dir with S01/ folder containing COMPLETED and REVIEW.md. Call `applyReviewDecision(goalDir, 1, { decision: "REJECTED", ... })`. Assert: `S01/REJECTED` exists, `S01/COMPLETED` does NOT exist.
  - **it("handles zero-padded step folder names (step 5 → S05)")** — Arrange: create goal dir with S05/ and COMPLETED. Call `applyReviewDecision(goalDir, 5, { decision: "APPROVED", ... })`. Assert: `S05/APPROVED` exists (not `S5/APPROVED`).
  - **it("creates step directory if missing")** — Arrange: goal dir exists but no S03/ folder. Call `applyReviewDecision(goalDir, 3, { decision: "APPROVED", ... })`. Assert: `S03/APPROVED` exists (no error thrown).

#### New suite: typebox runtime validation of schema (integration with typebox/value)

- `describe('REVIEW_OUTPUT_SCHEMA runtime validation')`:
  - **it("Value.Check returns true for valid frontmatter")** — Import `* as Value from "typebox/value"`. Call `Value.Check(REVIEW_OUTPUT_SCHEMA, { decision: "APPROVED", criticalIssues: 0, highIssues: 1, mediumIssues: 2, lowIssues: 3 })`. Assert `true`.
  - **it("Value.Check returns false for invalid decision")** — Call `Value.Check(REVIEW_OUTPUT_SCHEMA, { decision: "PENDING", ... })`. Assert `false`.
  - **it("Value.Check returns false for negative count")** — Call `Value.Check(REVIEW_OUTPUT_SCHEMA, { ..., criticalIssues: -1 })`. Assert `false`. This verifies the `{ minimum: 0 }` constraint works at runtime.
  - **it("Value.Errors provides error details on failure")** — Call `[...Value.Errors(REVIEW_OUTPUT_SCHEMA, { decision: "INVALID", ... })]`. Assert the array is non-empty and contains error objects with `message` strings referencing the invalid value.

#### Existing suites: behavioral equivalence after refactor

- `describe("isStepReviewable(goalDir, stepNumber)")` — already present. Should pass without modification.
- `describe("findMostRecentCompletedStep(goalDir)")` — already present. Should pass without modification.

## Programmatic Verification

### TypeScript compilation

- **What:** No type errors after refactoring (including typebox `Static<typeof schema>` derivation)
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no error output

### Export verification — `REVIEW_OUTPUT_SCHEMA`

- **What:** `REVIEW_OUTPUT_SCHEMA` is exported from `review-task.ts` as a typebox schema
- **How:** `grep -c 'export.*REVIEW_OUTPUT_SCHEMA' src/capabilities/review-task.ts`
- **Expected result:** Output is `1`

### Export verification — `ReviewOutputs` derived from schema

- **What:** `ReviewOutputs` is exported as `Static<typeof REVIEW_OUTPUT_SCHEMA>` (not a manual interface)
- **How:** `grep 'type ReviewOutputs.*Static.*REVIEW_OUTPUT_SCHEMA' src/capabilities/review-task.ts`
- **Expected result:** Matches exactly one line

### Export verification — `applyReviewDecision`

- **What:** `applyReviewDecision` is exported from `review-task.ts`
- **How:** `grep -c 'export function applyReviewDecision' src/capabilities/review-task.ts`
- **Expected result:** Output is `1`

### No `_private` pattern remains

- **What:** No underscore-prefixed functions remain in review-task.ts
- **How:** `grep -cE 'function _\w+' src/capabilities/review-task.ts`
- **Expected result:** Output is `0`

### Frontmatter functions removed from validation.ts

- **What:** Frontmatter parsing functions no longer exist in `validation.ts`
- **How:** `grep -cE '(parseReviewFrontmatter|validateReviewFrontmatter|toReviewFrontmatter|applyReviewDecision|validateReviewState)' src/guards/validation.ts`
- **Expected result:** Output is `0`

### No `js-yaml` import in validation.ts

- **What:** `validation.ts` no longer imports `js-yaml`
- **How:** `grep -c 'js-yaml' src/guards/validation.ts`
- **Expected result:** Output is `0`

### Frontmatter types removed from validation.ts

- **What:** Review frontmatter types (`RawReviewFrontmatter`, `ReviewFrontmatter`) no longer in `validation.ts`
- **How:** `grep -cE '(RawReviewFrontmatter|ReviewFrontmatter)' src/guards/validation.ts`
- **Expected result:** Output is `0`

### Full test suite — regression check (excluding validation.test.ts)

**Note:** `src/guards/validation.test.ts` imports removed functions and will fail. This is expected — migrated in Step 9.

- **What:** Verify review-task tests pass, no regressions in other test files
- **How:** `npx vitest run src/capabilities/review-task.test.ts`
- **Expected result:** All existing tests pass plus new tests pass (exit code 0)

## Test Order

1. Unit tests for `REVIEW_OUTPUT_SCHEMA` structure and typebox validation (pure, no filesystem)
2. Unit tests for `ReviewOutputs` type derivation (compile-time check via TypeScript)
3. Unit tests for `applyReviewDecision` (filesystem-dependent, uses temp dirs)
4. Existing `isStepReviewable` tests (regression — should pass without changes)
5. Existing `findMostRecentCompletedStep` tests (regression — should pass without changes)
6. Programmatic verification: `npx tsc --noEmit`
7. Programmatic verification: grep-based export/function checks
8. Full test suite regression check (`vitest run src/capabilities/review-task.test.ts`)
