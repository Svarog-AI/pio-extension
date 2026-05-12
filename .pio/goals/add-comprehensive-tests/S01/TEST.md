# Tests: Configure Vitest with native ESM support

No test runner was configured before this step. This step creates the test infrastructure itself, so verification is split between programmatic checks (config validity, runner execution) and the smoke test (a real `.test.ts` file that proves end-to-end execution).

## Unit Tests

### Smoke Test — `__tests__/smoke.test.ts`

- **File:** `__tests__/smoke.test.ts`
- **Test runner:** Vitest (via `npm test`)
- **Purpose:** Verify the entire toolchain works — Vitest discovers, loads, and executes TypeScript tests under native ESM.

**Test cases:**

- `describe('smoke')`:
  - `it('adds numbers correctly')` — Assert `1 + 1 === 2`. Proves basic test execution.
  - `it('resolves ESM imports')` — Import a value from `src/utils.ts` (e.g., `stepFolderName`) and assert it returns the expected output. This proves Vitest resolves TypeScript + ESM imports from `src/` correctly.

## Programmatic Verification

### Vitest installed as dev dependency

- **What:** Confirm `vitest` appears in `devDependencies` of `package.json`
- **How:** `node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.devDependencies.vitest ? 'PASS' : 'FAIL')"`
- **Expected result:** Prints `PASS`

### `test` script present in package.json

- **What:** Confirm `"test": "vitest run"` exists in `scripts`
- **How:** `node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.scripts.test === 'vitest run' ? 'PASS' : 'FAIL')"`
- **Expected result:** Prints `PASS`

### `vitest.config.ts` exists

- **What:** Confirm the config file is present at the project root
- **How:** `test -f vitest.config.ts && echo PASS || echo FAIL`
- **Expected result:** Prints `PASS`

### Smoke test passes via `npm test`

- **What:** Running `npm test` executes Vitest, discovers `__tests__/smoke.test.ts`, and all tests pass
- **How:** `npm test`
- **Expected result:** Exit code 0, output shows passing tests (e.g., "Tests 1 passed" or similar), no errors

### TypeScript type checking still passes

- **What:** Adding Vitest config and `__tests__/` does not break existing type checking
- **How:** `npm run check`
- **Expected result:** Exit code 0, no type errors reported

### Smoke test file exists with correct naming

- **What:** Confirm `__tests__/smoke.test.ts` is a non-empty file
- **How:** `test -s __tests__/smoke.test.ts && echo PASS || echo FAIL`
- **Expected result:** Prints `PASS`

## Manual Verification

### Inspect Vitest output for ESM warnings

- **What:** Ensure no ESM-related warnings (e.g., "Module format could not be detected", "Cannot use import statement outside a module") appear in the test output
- **How:** Run `npm test` and visually inspect the output for any warning lines mentioning "module", "esm", or "import"

## Test Order

1. Programmatic: Verify files exist (`vitest.config.ts`, `__tests__/smoke.test.ts`)
2. Programmatic: Verify `package.json` changes (dev dependency, script)
3. Unit: Run `npm test` (smoke test — proves Vitest runs TypeScript + ESM)
4. Programmatic: Run `npm run check` (no regressions in type checking)
5. Manual: Inspect output for ESM warnings
