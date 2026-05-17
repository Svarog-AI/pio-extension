# Tests: Verify compilation and backwards compatibility

This is a verification-only step. No new test code is created — all tests already exist from Steps 1 and 2. The executor runs existing commands and validates outputs.

## Programmatic Verification

### Type Checking (npm run check)

- **What:** TypeScript compiler reports zero type errors across all source files
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Command exits with code 0, no error output

### Full Test Suite (npm run test)

- **What:** All existing and new tests pass with zero failures
- **How:** `npm run test` (runs `vitest run`)
- **Expected result:** Exit code 0, output contains "12 passed (12)" for test files and "293 passed" (or higher) for total tests

### Backwards Compatibility — No Config File

- **What:** When no `~/.pi/pio-config.yaml` exists, sessions inherit the parent's model unchanged
- **How:** These are already covered by existing unit tests in `src/model-config.test.ts` and `src/capabilities/session-capability.test.ts`:
  - `src/model-config.test.ts` → "returns undefined when file doesn't exist" (readConfig — no config file exists)
  - `src/model-config.test.ts` → "returns undefined when no config file exists" (resolveModelForCapability — no config)
  - `src/capabilities/session-capability.test.ts` → "no setModel call when config returns undefined (no config file)" (model resolution — backwards compatibility)
  - `src/capabilities/session-capability.test.ts` → "prompt injection still works alongside model resolution" (model resolution — backwards compatibility)
- **Expected result:** All four tests pass

### No New Type Errors in Unrelated Files

- **What:** The new import of `resolveModelForCapability` from `../model-config` in `session-capability.ts` doesn't cause cascading errors in other files
- **How:** After running `npm run check`, verify no errors reference files other than `model-config.ts` or `session-capability.ts`
- **Expected result:** Zero type errors total (no isolated check needed if the first criterion passes)

### Test Count Validation

- **What:** Confirm the expected number of tests exist (no accidental deletions during Steps 1–2)
- **How:** After `npm run test`, grep output for test file count and total test count
- **Expected result:** At least 12 test files, at least 293 total tests

## Test Order

Execute in this priority: type checking → full test suite → inspection of specific backwards-compatibility tests. Type checking must pass before running the test suite (catches compile-level issues early).
