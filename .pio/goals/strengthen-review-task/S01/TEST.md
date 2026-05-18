# Tests: Rename `review-code` → `review-task` everywhere

This is a rename-only task with no behavioral changes. Testing focuses on verifying that all identifiers, imports, and references are updated consistently — no new test code is needed. The existing test suite serves as a regression proof when run against the renamed codebase.

## Programmatic Verification

- **What:** No remaining references to `review-code` in source tree
  - **How:** `grep -r "review-code" src/`
  - **Expected result:** Zero matches (empty output)

- **What:** TypeScript type checking passes after all renames
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no type errors. This confirms all imports resolve correctly after file renames and function name changes.

- **What:** All existing tests pass with no regressions
  - **How:** `npx vitest run`
  - **Expected result:** All tests pass, exit code 0. The existing test assertions remain semantically identical — only capability name strings changed from `"review-code"` to `"review-task"`.

- **What:** New file names exist on disk (file renames were performed)
  - **How:** `test -f src/capabilities/review-task.ts && test -f src/prompts/review-task.md && test -f src/capabilities/review-task.test.ts`
  - **Expected result:** All three files exist (exit code 0 for each `test`)

- **What:** Old file names no longer exist on disk
  - **How:** `! test -f src/capabilities/review-code.ts && ! test -f src/prompts/review-code.md && ! test -f src/capabilities/review-code.test.ts`
  - **Expected result:** All three old files are gone (exit code 0)

- **What:** `src/index.ts` imports from the new module path and calls the new function
  - **How:** `grep "setupReviewTask" src/index.ts` and `grep "from.*review-task" src/index.ts`
  - **Expected result:** Both grep commands find exactly one match each

- **What:** `src/state-machine.ts` uses the new transition function name and capability string
  - **How:** `grep "transitionReviewTask" src/state-machine.ts` and `grep '"review-task"' src/state-machine.ts`
  - **Expected result:** Both grep commands return matches

## Test Order

1. Verify file renames (new files exist, old files gone) — fast filesystem checks
2. Grep for remaining `"review-code"` references — confirms completeness of the rename
3. `npx tsc --noEmit` — catches any import or type mismatches
4. `npx vitest run` — end-to-end regression proof
