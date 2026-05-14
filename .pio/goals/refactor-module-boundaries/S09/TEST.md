# Tests: Update remaining test file imports + verify with `evolve-plan.test.ts`

No test runner configured for incremental test execution during this refactoring goal. Verification relies on programmatic checks (TypeScript compiler) against existing test files. The project has no dedicated test command that runs individual test files (`npm test` is not configured in `package.json`). All 14 test files under `__tests__/` are included in `tsconfig.json` for type checking but not executed by a test runner as part of the workflow.

## Programmatic Verification

- **What:** Confirm `evolve-plan.test.ts` imports `validateOutputs` from the new guard module location
  - **How:** `grep 'from.*guards/validation' __tests__/evolve-plan.test.ts`
  - **Expected result:** One matching line present (the import exists)

- **What:** Confirm `evolve-plan.test.ts` imports `resolveCapabilityConfig` from the new capability-config module
  - **How:** `grep 'from.*capability-config' __tests__/evolve-plan.test.ts`
  - **Expected result:** One matching line present (the import exists)

- **What:** Confirm no stale imports remain (no references to deleted paths)
  - **How:** `grep 'from.*\.\./src/utils\|from.*\.\./src/capabilities/validation' __tests__/evolve-plan.test.ts`
  - **Expected result:** No output (zero matches — grep exits with code 1)

- **What:** TypeScript type checking passes with zero errors
  - **How:** `npm run check`
  - **Expected result:** Exit code 0, no error output

## Test Order

1. Grep checks for correct imports (quick validation)
2. Grep check for absence of stale imports
3. `npm run check` (full type-check validation)
