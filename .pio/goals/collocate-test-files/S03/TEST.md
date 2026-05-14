# Tests: Update configuration and verify full test suite

## Programmatic Verification

### vitest.config.ts — include pattern updated

- **What:** `vitest.config.ts` no longer references `__tests__/` in the `include` array. The only include pattern is `"src/**/*.test.ts"`.
- **How:** `grep -c '__tests__' vitest.config.ts`
- **Expected result:** Exit code 1 (no match). Alternatively, read the file and confirm `include: ["src/**/*.test.ts"]`.

### tsconfig.json — include array updated

- **What:** `tsconfig.json` `include` is exactly `["src/**/*.ts"]` with no `__tests__/` reference.
- **How:** `grep -c '__tests__' tsconfig.json`
- **Expected result:** Exit code 1 (no match). Alternatively, read the file and confirm `"include": ["src/**/*.ts"]`.

### Remaining __tests__ files deleted

- **What:** Only 9 original test files remain in `__tests__/` after Steps 1–2. All 9 must be deleted.
- **How:** `ls __tests__/*.test.ts 2>/dev/null | wc -l`
- **Expected result:** `0` (no `.test.ts` files remain).

### TypeScript type check passes

- **What:** After config changes and file deletions, TypeScript reports no type errors across the entire project.
- **How:** `npm run check`
- **Expected result:** Exit code 0, no error output.

### Full test suite passes

- **What:** All collocated tests under `src/` are discovered and pass. The expected count is approximately 219 tests (sum of all individual test files verified in Steps 1 and 2).
- **How:** `npm run test`
- **Expected result:** Exit code 0. All tests pass. No "test already exists" warnings indicating duplicate discovery from both `__tests__/` and `src/`.

### Individual test files still pass after config change

- **What:** Each collocated test file passes individually with the updated vitest config (no `__tests__/` fallback).
- **How:** Run each of the following:
  - `vitest run src/capability-config.test.ts`
  - `vitest run src/fs-utils.test.ts`
  - `vitest run src/queues.test.ts`
  - `vitest run src/transitions.test.ts`
  - `vitest run src/capabilities/evolve-plan.test.ts`
  - `vitest run src/capabilities/execute-task.test.ts`
  - `vitest run src/capabilities/review-code.test.ts`
  - `vitest run src/capabilities/session-capability.test.ts`
  - `vitest run src/guards/validation.test.ts`
  - `vitest run src/guards/turn-guard.test.ts`
- **Expected result:** All exit code 0, all tests pass.

## Test Order

1. Delete remaining files from `__tests__/` (prevents double-discovery)
2. Update `vitest.config.ts` include pattern
3. Update `tsconfig.json` include array
4. Run `npm run check` (fast — catches import/type issues early)
5. Run `vitest run src/<each-file>.test.ts` for individual verification
6. Run `npm run test` (full suite — final confirmation)
