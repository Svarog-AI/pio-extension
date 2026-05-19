# Tests: Slim down `validation.ts` — retain only file protection

This step is a cleanup and verification task. Most validation happens through programmatic checks and existing tests. No new test code is required — the focus is verifying that removed code is truly gone and remaining functionality is intact.

## Programmatic Verification

### Slim-down completeness

- **What:** Verify no frontmatter functions remain in `validation.ts`
  - **How:** `grep -c "parseReviewFrontmatter\|validateReviewFrontmatter\|toReviewFrontmatter\|applyReviewDecision\|validateReviewState" src/guards/validation.ts`
  - **Expected result:** Exit code 1 (no matches), or count of 0

- **What:** Verify no `js-yaml` import in `validation.ts`
  - **How:** `grep -c "js-yaml" src/guards/validation.ts`
  - **Expected result:** Exit code 1 (no match)

- **What:** Verify no tool registration (`defineTool` / `pi.registerTool`) in `validation.ts`
  - **How:** `grep -c "defineTool\|markCompleteTool\|registerTool" src/guards/validation.ts`
  - **Expected result:** Exit code 1 (no matches)

- **What:** Verify `extractGoalName` is removed from `validation.ts`
  - **How:** `grep -c "extractGoalName" src/guards/validation.ts`
  - **Expected result:** Exit code 1 (no match)

- **What:** Verify no production code imports `extractGoalName` from validation.ts
  - **How:** `grep -rn "extractGoalName.*from.*validation\|from.*guards/validation.*extractGoalName" src/ --include="*.ts" | grep -v ".test.ts"`
  - **Expected result:** No output (no production imports)

### Export verification

- **What:** Verify correct exports from `validation.ts`
  - **How:** `grep "^export" src/guards/validation.ts`
  - **Expected result:** Only `setupValidation`, `validateOutputs`, and `ValidationRule` re-export are present

### TypeScript compilation

- **What:** Ensure no type errors after cleanup
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no errors

## Integration Tests (existing tests — regression check)

### File: `src/guards/validation.test.ts`

**Test runner:** Vitest (configured in `vitest.config.ts`)

The existing test file covers:

- `describe("validateOutputs")`: 6 test cases verifying file-existence validation
  - All files present → `passed: true, missing: []`
  - All files missing → `passed: false`, all in missing array
  - Partial files missing → correct subset in missing
  - Empty rules → passes
  - Undefined rules.files → passes
  - Single file present → passes

- `describe("setupValidation")`: 1 test case verifying no tool registration (only event handlers)
  - `registerTool` NOT called, only `resources_discover`, `turn_start`, `tool_call` events registered

**Note:** The `describe("extractGoalName")` tests in this file will fail after Step 8 removes the function. This is expected — Step 9 migrates/removes these tests as part of the test migration. Do NOT modify test files in this step.

**Verification command (for validateOutputs + setupValidation only):**
- **How:** `npx vitest run src/guards/validation.test.ts --reporter=verbose` (run only non-extractGoalName tests, or accept that extractGoalName tests fail)
- **Expected result:** `validateOutputs` and `setupValidation` test suites pass. `extractGoalName` tests may fail (expected — handled in Step 9).

## Full Regression Check

- **What:** Run the full test suite to catch any unexpected breakage
  - **How:** `npx vitest run`
  - **Expected result:** All tests pass EXCEPT `extractGoalName` tests in `validation.test.ts` (which fail because the export was removed). The count of failures should be exactly the number of `extractGoalName` test cases.

## Test Order

1. Programmatic verification (grep checks for removed code)
2. TypeScript compilation (`npx tsc --noEmit`)
3. Existing validation.test.ts tests (validateOutputs + setupValidation suites)
4. Full test suite regression check (`npx vitest run`)
