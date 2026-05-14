# Tests: Remove `__tests__/` directory and final verification

No test runner configured for this step — it is a cleanup and verification step. All validation is programmatic.

## Programmatic Verification

- **What:** Confirm `__tests__/` directory no longer exists
  - **How:** `test -d __tests__ && echo "FAIL: directory exists" || echo "PASS: directory removed"`
  - **Expected result:** Output is `PASS: directory removed` (exit code 1 from `test -d`)

- **What:** TypeScript type check passes with no errors
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no error output

- **What:** Full test suite discovers and runs all collocated tests
  - **How:** `npm run test` (or `npx vitest run`)
  - **Expected result:** All ~9–10 collocated `.test.ts` files under `src/` are discovered; all tests pass with zero failures. No "test already exists" warnings.

- **What:** No stale `__tests__/` references remain in source code or configuration
  - **How:** `grep -r '__tests__' src/ vitest.config.ts tsconfig.json package.json --include='*.ts' --include='*.json' --include='*.mjs' || echo "PASS: no references found"`
  - **Expected result:** No matches (exit code 1 from grep), confirming zero stale references in project source or configuration files.

## Manual Verification

- **What:** Confirm `__tests__/` is gone from the project root listing
  - **How:** Run `ls -la` in the project root and visually confirm no `__tests__` entry
  - **Expected result:** Directory listing contains no `__tests__/`

## Test Order

1. Delete `__tests__/` directory
2. Verify directory removal (programmatic)
3. Run `npm run check` (type check)
4. Run `npm run test` (full suite)
5. Grep for stale references (programmatic)
6. Manual listing confirmation
