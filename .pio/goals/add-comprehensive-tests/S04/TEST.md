# Tests: Export and test step discovery (`step-discovery.test.ts`)

## Unit Tests

### File: `__tests__/step-discovery.test.ts`

**Test runner:** Vitest (configured in `vitest.config.ts`, run via `npm test`)

**Imports:**
- `isStepReady` from `../src/capabilities/execute-task`
- `isStepReviewable`, `findMostRecentCompletedStep` from `../src/capabilities/review-code`
- `stepFolderName` from `../src/utils`
- `fs`, `os`, `path` from Node.js standard library

**Setup:** Each `describe` block uses `beforeEach`/`afterEach` to create and clean up a temp directory via `fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"))`. A local helper `createGoalTree(tempDir, goalName, steps)` creates goal workspace trees with controlled step folder contents (mirrors the pattern from `__tests__/utils.test.ts`).

---

### `describe('isStepReady')`

Tests the execution-readiness gate for a single step.

1. **it('TASK.md + TEST.md present, no markers → true'):**
   - Arrange: Create S01 with TASK.md and TEST.md only (no COMPLETED, no BLOCKED)
   - Act: `isStepReady(goalDir, 1)`
   - Assert: returns `true`

2. **it('missing TASK.md → false'):**
   - Arrange: Create S01 with only TEST.md
   - Act: `isStepReady(goalDir, 1)`
   - Assert: returns `false`

3. **it('missing TEST.md → false'):**
   - Arrange: Create S01 with only TASK.md
   - Act: `isStepReady(goalDir, 1)`
   - Assert: returns `false`

4. **it('both specs + COMPLETED marker → false'):**
   - Arrange: Create S01 with TASK.md, TEST.md, and COMPLETED
   - Act: `isStepReady(goalDir, 1)`
   - Assert: returns `false`

5. **it('both specs + BLOCKED marker → false'):**
   - Arrange: Create S01 with TASK.md, TEST.md, and BLOCKED
   - Act: `isStepReady(goalDir, 1)`
   - Assert: returns `false`

6. **it('step folder does not exist → false'):**
   - Arrange: Goal dir exists but no S01/ subdirectory
   - Act: `isStepReady(goalDir, 1)`
   - Assert: returns `false`

---

### `describe('isStepReviewable')`

Tests the review-readiness gate for a single step.

7. **it('COMPLETED + SUMMARY.md, no BLOCKED → true'):**
   - Arrange: Create S01 with COMPLETED and SUMMARY.md (no BLOCKED)
   - Act: `isStepReviewable(goalDir, 1)`
   - Assert: returns `true`

8. **it('missing COMPLETED → false'):**
   - Arrange: Create S01 with only SUMMARY.md (no COMPLETED marker)
   - Act: `isStepReviewable(goalDir, 1)`
   - Assert: returns `false`

9. **it('missing SUMMARY.md → false'):**
   - Arrange: Create S01 with only COMPLETED (no SUMMARY.md)
   - Act: `isStepReviewable(goalDir, 1)`
   - Assert: returns `false`

10. **it('has BLOCKED → false even with COMPLETED + SUMMARY.md'):**
    - Arrange: Create S01 with COMPLETED, SUMMARY.md, and BLOCKED
    - Act: `isStepReviewable(goalDir, 1)`
    - Assert: returns `false`

11. **it('folder does not exist → false'):**
    - Arrange: Goal dir exists but no S01/ subdirectory
    - Act: `isStepReviewable(goalDir, 1)`
    - Assert: returns `false`

---

### `describe('findMostRecentCompletedStep')`

Tests the reverse-scan discovery of the most recently reviewable step.

12. **it('no step folders → undefined'):**
    - Arrange: Empty goal directory (no S01/, S02/, etc.)
    - Act: `findMostRecentCompletedStep(goalDir)`
    - Assert: returns `undefined`

13. **it('one completed step (S01) → 1'):**
    - Arrange: Create S01 with COMPLETED and SUMMARY.md
    - Act: `findMostRecentCompletedStep(goalDir)`
    - Assert: returns `1`

14. **it('multiple sequential completed steps → returns highest'):**
    - Arrange: Create S01 and S02, both with COMPLETED + SUMMARY.md
    - Act: `findMostRecentCompletedStep(goalDir)`
    - Assert: returns `2`

15. **it('gap in middle — S01 complete, S02 not reviewable → returns 1'):**
    - Arrange: S01 has COMPLETED + SUMMARY.md (reviewable). S02 exists but has only TASK.md/TEST.md (no COMPLETED)
    - Act: `findMostRecentCompletedStep(goalDir)`
    - Assert: returns `1`

16. **it('S01 blocked, S02 completed → returns 2'):**
    - Arrange: S01 has COMPLETED + SUMMARY.md + BLOCKED (not reviewable due to BLOCKED). S02 has COMPLETED + SUMMARY.md (reviewable)
    - Act: `findMostRecentCompletedStep(goalDir)`
    - Assert: returns `2`

17. **it('S01 has specs but no COMPLETED, S02 reviewable → returns 2'):**
    - Arrange: S01 has TASK.md + TEST.md (not completed). S02 has COMPLETED + SUMMARY.md
    - Act: `findMostRecentCompletedStep(goalDir)`
    - Assert: returns `2`

---

### `describe('stepFolderName')` — zero-padding verification

Re-verifies folder naming from `../src/utils` in the context of step discovery.

18. **it('zero-pads single digits S01–S09'):**
    - Assert: `stepFolderName(1)` → `"S01"`, `stepFolderName(5)` → `"S05"`, `stepFolderName(9)` → `"S09"`

19. **it('no extra padding for two-digit numbers S10+'):**
    - Assert: `stepFolderName(10)` → `"S10"`, `stepFolderName(25)` → `"S25"`

## Programmatic Verification

- **What:** TypeScript compilation passes with no errors after exporting the two functions
- **How:** Run `npm run check` (which runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no output (or only pre-existing warnings)

- **What:** All step-discovery tests pass
- **How:** Run `npx vitest run __tests__/step-discovery.test.ts`
- **Expected result:** All ~19 tests green, exit code 0

- **What:** No regressions in the full test suite
- **How:** Run `npm test` (runs all tests under `__tests__/`)
- **Expected result:** All existing tests from Steps 1–3 still pass + new Step 4 tests pass (79+ total)

## Test Order

Execute in this priority: unit → programmatic.

1. Unit tests (`npm test __tests__/step-discovery.test.ts`) — all `describe` blocks run independently
2. Type checking (`npm run check`) — validates exports don't break type safety
3. Full suite (`npm test`) — validates no regressions

Within the unit test file, there are no inter-test dependencies — each test creates its own temp directory and cleans up after itself. Order within `describe` blocks does not matter.
