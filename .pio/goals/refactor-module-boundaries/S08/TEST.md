# Tests: Delete old files + remove re-exports from `src/utils.ts`

This step is a structural cleanup (file deletions and import redirects). No new functionality is added, so no new unit or integration tests are needed. Verification relies on programmatic checks to confirm the deletions and import updates are correct.

## Programmatic Verification

### File Deletion Checks

- **What:** Verify `src/utils.ts` has been deleted
  - **How:** `test ! -f src/utils.ts && echo PASS || echo FAIL`
  - **Expected result:** `PASS`

- **What:** Verify `src/capabilities/validation.ts` has been deleted
  - **How:** `test ! -f src/capabilities/validation.ts && echo PASS || echo FAIL`
  - **Expected result:** `PASS`

- **What:** Verify `src/capabilities/turn-guard.ts` has been deleted
  - **How:** `test ! -f src/capabilities/turn-guard.ts && echo PASS || echo FAIL`
  - **Expected result:** `PASS`

### Stale Import Checks (source files)

- **What:** No source files in `src/` reference `../utils`, `./capabilities/validation`, or `./capabilities/turn-guard`
  - **How:** `grep -rn 'from.*\.\./utils\|from.*\.\/capabilities\/validation\|from.*\.\/capabilities\/turn-guard' src/ --include='*.ts'`
  - **Expected result:** No output (zero matches)

### Test Import Verification

- **What:** `transition.test.ts` imports `stepFolderName` from `../src/fs-utils`
  - **How:** `grep 'stepFolderName.*from.*fs-utils' __tests__/transition.test.ts`
  - **Expected result:** One matching line

- **What:** `smoke.test.ts` imports `stepFolderName` from `../src/fs-utils`
  - **How:** `grep 'stepFolderName.*from.*fs-utils' __tests__/smoke.test.ts`
  - **Expected result:** One matching line

- **What:** `execute-task-initial-message.test.ts` imports `stepFolderName` from `../src/fs-utils`
  - **How:** `grep 'stepFolderName.*from.*fs-utils' __tests__/execute-task-initial-message.test.ts`
  - **Expected result:** One matching line

- **What:** `review-code-config.test.ts` imports `stepFolderName` from `../src/fs-utils`
  - **How:** `grep 'stepFolderName.*from.*fs-utils' __tests__/review-code-config.test.ts`
  - **Expected result:** One matching line

- **What:** `evolve-plan.test.ts` imports `resolveCapabilityConfig` from `../src/capability-config`
  - **How:** `grep 'resolveCapabilityConfig.*from.*capability-config' __tests__/evolve-plan.test.ts`
  - **Expected result:** One matching line

### No Stale Test References to Deleted Modules

- **What:** No test files import from `../src/utils` anymore (all redirected)
  - **How:** `grep -rn 'from.*\.\./src/utils' __tests__/ --include='*.ts'`
  - **Expected result:** No output (zero matches)

### TypeScript Compilation

- **What:** All files compile with zero TypeScript errors
  - **How:** `npm run check` (runs `tsc --noEmit`)
  - **Expected result:** Zero exit code, no error output

### Existing Tests Still Pass

- **What:** The 4 affected test files still pass after import updates
  - **How:** `npx vitest run __tests__/transition.test.ts __tests__/smoke.test.ts __tests__/execute-task-initial-message.test.ts __tests__/review-code-config.test.ts __tests__/evolve-plan.test.ts`
  - **Expected result:** All tests pass, zero failures

## Test Order

1. **File deletion checks** — verify files are gone before checking imports
2. **Stale import checks** — confirm no references to deleted modules remain
3. **Test import verification** — confirm new imports point to correct modules
4. **TypeScript compilation** (`npm run check`) — catches any missed references
5. **Existing tests** — confirm behavioral equivalence (tests still pass)
