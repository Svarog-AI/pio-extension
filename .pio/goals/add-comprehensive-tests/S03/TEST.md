# Tests: Export and test validation logic (`validation.test.ts`)

## Unit Tests

### File: `__tests__/validation.test.ts`

**Test runner:** Vitest (configured in `vitest.config.ts`, run via `npm test`)

### `describe('validateOutputs')`: File-existence validation engine

Each test creates a temp directory and controls which files exist inside it.

1. **All files present → passed: true, missing: []**
   - Arrange: Create temp dir as baseDir. Write two files (`"output1.md"`, `"output2.md"`) into it. Create rules with both file names.
   - Act: Call `validateOutputs(rules, baseDir)`.
   - Assert: Result is `{ passed: true, missing: [] }`.

2. **All files missing → passed: false, all in missing**
   - Arrange: Create temp dir as baseDir (empty, no output files). Create rules with two file names.
   - Act: Call `validateOutputs(rules, baseDir)`.
   - Assert: Result has `passed: false` and `missing` contains both file names.

3. **Partial files missing → correct subset**
   - Arrange: Create temp dir. Write only `"output1.md"` (not `"output2.md"`). Rules reference both.
   - Act: Call `validateOutputs(rules, baseDir)`.
   - Assert: `passed: false`, `missing` contains exactly `"output2.md"` (length === 1).

4. **Empty rules (files: []) → passed: true, missing: []**
   - Arrange: Create rules with `files: []`.
   - Act: Call `validateOutputs(rules, baseDir)`.
   - Assert: Result is `{ passed: true, missing: [] }`.

5. **Undefined rules.files → passed: true, missing: []**
   - Arrange: Create rules object without `files` property (or explicitly `files: undefined`).
   - Act: Call `validateOutputs(rules, baseDir)`.
   - Assert: Result is `{ passed: true, missing: [] }` (the `|| []` fallback works).

6. **Single file present → passes with empty missing**
   - Arrange: Create temp dir. Write one file (`"README.md"`). Rules reference just that one.
   - Act: Call `validateOutputs(rules, baseDir)`.
   - Assert: `{ passed: true, missing: [] }`.

### `describe('extractGoalName')`: Path-parsing logic

Pure string manipulation — no filesystem needed.

1. **Standard path extracts goal name**
   - Arrange: Input = `/repo/.pio/goals/my-feature/`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `"my-feature"`.

2. **Path without trailing slash**
   - Arrange: Input = `/repo/.pio/goals/my-feature`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `"my-feature"`.

3. **Deeply nested path stops at goal name**
   - Arrange: Input = `/repo/.pio/goals/my-feature/S01/extra/path`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `"my-feature"` (splits on first separator after `/goals/`).

4. **No /goals/ segment returns empty string**
   - Arrange: Input = `/repo/.pio/session-queue/task.json`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `""`.

5. **Root-level goals path**
   - Arrange: Input = `/.pio/goals/root-goal/`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `"root-goal"`.

6. **Empty string input returns empty string**
   - Arrange: Input = `""`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `""`.

7. **Goal name with hyphens and underscores**
   - Arrange: Input = `/repo/.pio/goals/my_feature-v2/`
   - Act: Call `extractGoalName(input)`.
   - Assert: Returns `"my_feature-v2"`.

## Programmatic Verification

1. **Export verification — `extractGoalName` is importable**
   - **What:** Confirm `extractGoalName` can be imported from the validation module (it was previously private).
   - **How:** After writing the source change, run: `npm run check`
   - **Expected result:** Exit code 0, no type errors. If the export is missing, the test file import will fail at type-check time.

2. **Export verification — `ValidationResult` interface is importable**
   - **What:** Confirm `ValidationResult` can be imported as a type.
   - **How:** Run `npm run check` (same as above — covers all imports).
   - **Expected result:** Exit code 0.

3. **All validation tests pass**
   - **What:** The full validation test suite executes without failures.
   - **How:** `npm test __tests__/validation.test.ts`
   - **Expected result:** Exit code 0, all tests green (12-15 tests expected).

4. **Full test suite passes (no regressions)**
   - **What:** Existing tests from Steps 1 and 2 still pass after the source change to `validation.ts`.
   - **How:** `npm test`
   - **Expected result:** Exit code 0, all tests across smoke, utils, and validation suites pass.

5. **Type checking passes**
   - **What:** No TypeScript errors introduced by the export changes or new test file.
   - **How:** `npm run check`
   - **Expected result:** Exit code 0, no errors reported.

## Test Order

1. Write and verify exports in `src/capabilities/validation.ts` (add `export` keywords)
2. Run `npm run check` to confirm exports are visible
3. Write tests in `__tests__/validation.test.ts`
4. Run `npm test __tests__/validation.test.ts` — validate new tests pass
5. Run `npm test` — verify no regressions across the full suite
6. Run `npm run check` — final type-check confirmation
