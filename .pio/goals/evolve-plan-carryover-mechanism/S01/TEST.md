# Tests: Update evolve-plan capability config for DECISIONS.md

## Unit Tests

### File: `src/capabilities/evolve-plan.test.ts`

**Test runner:** Vitest (run via `npm run test`)

Add a new `describe` block for the DECISIONS.md behavior. Follow the existing file's conventions: use `resolveCapabilityConfig` from `../capability-config` to exercise the callbacks end-to-end, and use direct assertions on returned config objects.

#### describe("resolveEvolveValidation with DECISIONS_FILE")

- **Test: "excludes DECISIONS.md for stepNumber=1"**
  - Arrange: params `{ capability: "evolve-plan", goalName: "test-goal", stepNumber: 1 }`
  - Act: `await resolveCapabilityConfig("/tmp/proj", params)`
  - Assert: `result.validation.files` equals `["S01/TASK.md", "S01/TEST.md"]` (exactly 2 items, no DECISIONS.md)

- **Test: "includes DECISIONS.md for stepNumber=2"**
  - Arrange: params `{ capability: "evolve-plan", goalName: "test-goal", stepNumber: 2 }`
  - Act: `await resolveCapabilityConfig("/tmp/proj", params)`
  - Assert: `result.validation.files` equals `["S02/TASK.md", "S02/TEST.md", "S02/DECISIONS.md"]` (exactly 3 items, DECISIONS.md is last)

- **Test: "includes DECISIONS.md for stepNumber=3"**
  - Arrange: params `{ capability: "evolve-plan", goalName: "test-goal", stepNumber: 3 }`
  - Act: `await resolveCapabilityConfig("/tmp/proj", params)`
  - Assert: `result.validation.files` contains `"S03/DECISIONS.md"`; total length is 3

#### describe("resolveEvolveWriteAllowlist with DECISIONS_FILE")

- **Test: "excludes DECISIONS.md from write allowlist for stepNumber=1"**
  - Arrange: params `{ capability: "evolve-plan", goalName: "test-goal", stepNumber: 1 }`
  - Act: `await resolveCapabilityConfig("/tmp/proj", params)`
  - Assert: `result.writeAllowlist` does NOT contain any path with "DECISIONS.md"

- **Test: "includes DECISIONS.md in write allowlist for stepNumber=2"**
  - Arrange: params `{ capability: "evolve-plan", goalName: "test-goal", stepNumber: 2 }`
  - Act: `await resolveCapabilityConfig("/tmp/proj", params)`
  - Assert: `result.writeAllowlist` contains `"S02/DECISIONS.md"`; still contains `"COMPLETED"`, `"S02/TASK.md"`, `"S02/TEST.md"` (total length is 4)

## Regression Tests

The existing test suite must continue to pass without modification. Verify:

- **describe("validateOutputs with COMPLETED at baseDir")**: All 4 existing tests pass
- **describe("resolveEvolveWriteAllowlist")**: The existing test ("always includes COMPLETED alongside step-folder paths") still passes — the write allowlist for step 2 should now contain 4 items (COMPLETED + S02/TASK.md + S02/TEST.md + S02/DECISIONS.md). This existing test uses `toContain` assertions, so it will pass as long as those 3 files are still present.
- **describe("validateAndFindNextStep with COMPLETED marker")**: Both existing tests pass

## Programmatic Verification

- **TypeScript type checking**
  - What: No TypeScript compilation errors after changes
  - How: `npm run check` (runs `tsc --noEmit`)
  - Expected result: Exit code 0, no output errors

- **DECISIONS_FILE constant exists**
  - What: The `DECISIONS_FILE` constant is exported or declared in `evolve-plan.ts`
  - How: `grep 'DECISIONS_FILE' src/capabilities/evolve-plan.ts`
  - Expected result: At least one match containing `"DECISIONS.md"`

- **Test suite passes**
  - What: All tests (existing + new) pass
  - How: `npm run test -- --run` (or `npx vitest run`)
  - Expected result: All tests green, exit code 0

## Test Order

1. Write unit tests for `resolveEvolveValidation` with DECISIONS_FILE (stepNumber=1 and stepNumber=2)
2. Write unit tests for `resolveEvolveWriteAllowlist` with DECISIONS_FILE (stepNumber=1 and stepNumber=2)
3. Implement the changes in `evolve-plan.ts` to make all tests pass
4. Run full test suite (`npm run test`) to confirm no regressions
5. Run `npm run check` to confirm TypeScript type correctness
