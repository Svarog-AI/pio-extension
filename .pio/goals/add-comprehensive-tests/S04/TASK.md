# Task: Export and test step discovery (`step-discovery.test.ts`)

Export the internal step-discovery functions from `execute-task.ts` and `review-code.ts`, then write tests covering all step state combinations using temp directories to simulate goal workspace trees.

## Context

The pio-extension has no tests for step-discovery logic (finding which step is ready, completed, or reviewable). These functions live inside capability modules — `isStepReady` in `execute-task.ts` and `isStepReviewable` / `findMostRecentCompletedStep` in `review-code.ts`. They rely on filesystem checks (`fs.existsSync`) to examine S01/, S02/, … for marker files (TASK.md, TEST.md, COMPLETED, BLOCKED, SUMMARY.md). Only `isStepReady` is currently exported; the review-code functions are private. This step makes all three testable in isolation using the existing Vitest infrastructure and temp-directory pattern established in `__tests__/utils.test.ts` and `__tests__/validation.test.ts`.

## What to Build

### 1. Export `isStepReady` from `src/capabilities/execute-task.ts` (already exported — verify)

`isStepReady(goalDir, stepNumber)` is already exported. Verify the export is present. No changes needed.

Signature:
```typescript
export function isStepReady(goalDir: string, stepNumber: number): boolean;
```

Behavior: Returns `true` when the step folder exists AND both TASK.md and TEST.md are present AND neither COMPLETED nor BLOCKED marker exists. Returns `false` otherwise.

### 2. Export `isStepReviewable` and `findMostRecentCompletedStep` from `src/capabilities/review-code.ts`

Both functions currently lack the `export` keyword. Add it — no logic modifications, no behavior changes.

Signatures:
```typescript
export function isStepReviewable(goalDir: string, stepNumber: number): boolean;
export function findMostRecentCompletedStep(goalDir: string): number | undefined;
```

**`isStepReviewable`** behavior: Returns `true` when the step folder exists AND COMPLETED marker exists AND SUMMARY.md exists AND no BLOCKED marker is present.

**`findMostRecentCompletedStep`** behavior: Scans S01, S02, … in ascending order to find the highest existing step folder number, then scans from highest to lowest for the first `isStepReviewable` step. Returns that step number or `undefined`.

### 3. Create `__tests__/step-discovery.test.ts`

Write a comprehensive test file covering all three functions. Follow the established patterns:

- Use `fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"))` for temp directories
- Clean up in `afterEach` with `fs.rmSync(tempDir, { recursive: true, force: true })`
- Use `describe` blocks per function, `it` blocks per scenario
- Import from `../src/capabilities/execute-task` and `../src/capabilities/review-code`
- Reuse the `createGoalTree` helper pattern from `__tests__/utils.test.ts` (or define a local equivalent)

### Code Components

#### `isStepReady` tests

Test the step-readiness gate. Create temp goal directories with controlled file presence/absence:

- **TASK.md + TEST.md present, no markers → `true`:** Ready for execution
- **Missing TASK.md → `false`:** Only TEST.md exists
- **Missing TEST.md → `false`:** Only TASK.md exists
- **Both spec files + COMPLETED marker → `false`:** Already done
- **Both spec files + BLOCKED marker → `false`:** Blocked
- **Step folder doesn't exist → `false`:** No S01/ directory at all

#### `isStepReviewable` tests

Test the review-readiness gate:

- **COMPLETED + SUMMARY.md, no BLOCKED → `true`:** Ready for review
- **Missing COMPLETED → `false`:** Has SUMMARY.md but no COMPLETED marker
- **Missing SUMMARY.md → `false`:** Has COMPLETED but no SUMMARY.md
- **Has BLOCKED → `false`:** Even if COMPLETED + SUMMARY.md present
- **Folder doesn't exist → `false`:** No S01/ directory

#### `findMostRecentCompletedStep` tests

Test the reverse-scan discovery logic:

- **No step folders → `undefined`:** Empty goal workspace
- **One completed step (S01) → `1`:** Basic case
- **Multiple sequential steps, highest complete → returns highest:** S01 complete, S02 complete → returns 2
- **Gap in middle (S01 complete, S02 not reviewable, S03 exists but not reviewable) → returns 1:** Scans from highest down, finds S01 first
- **Mix of COMPLETED and BLOCKED states:** S01 blocked (has BLOCKED), S02 completed → returns 2
- **S01 has specs but no COMPLETED, S02 is reviewable → returns 2:** Non-completed steps are skipped

#### `stepFolderName` edge cases (re-verification)

Verify zero-padding behavior again in this file's context (or rely on utils tests). Test S01–S09 padding and S10+ no-extra-padding. This ensures the step-discovery logic uses correct folder names internally.

## Approach and Decisions

- **Follow established test conventions:** Use the same temp-directory pattern, cleanup approach, and describe/it structure from `__tests__/utils.test.ts` and `__tests__/validation.test.ts`.
- **Reuse `createGoalTree` helper:** Define a local version of the `createGoalTree` helper in this test file (matching the one from utils tests) to create goal directory trees with controlled step folder contents. This avoids cross-test-file coupling while maintaining consistency.
- **Real filesystem over mocks:** Per project convention, use actual `fs` operations on temp directories rather than mocking `fs`.
- **No logic changes to capability files:** The only source code change is adding `export` to two functions in `review-code.ts`. Do not modify function bodies, add new functions, or change any behavior.
- **Import `stepFolderName` from utils:** The test file needs `stepFolderName` to verify folder naming independently (import from `../src/utils`).

## Dependencies

- **Step 1 (Vitest setup):** Must be completed — Vitest must be installed and configured
- **Steps 2–3:** Provide the test pattern reference (`__tests__/utils.test.ts`, `__tests__/validation.test.ts`) but are not strict prerequisites

## Files Affected

- `src/capabilities/review-code.ts` — modified: add `export` to `isStepReviewable` and `findMostRecentCompletedStep` functions (no logic changes)
- `src/capabilities/execute-task.ts` — no changes (verify `isStepReady` is already exported)
- `__tests__/step-discovery.test.ts` — new file: step discovery and state machine tests (~20-25 tests)

## Acceptance Criteria

- [ ] `isStepReady`, `isStepReviewable`, and `findMostRecentCompletedStep` are exported from their respective modules
- [ ] `npm test __tests__/step-discovery.test.ts` passes with all tests green
- [ ] All state combinations covered (ready, completed, blocked, missing) for both `isStepReady` and `isStepReviewable`
- [ ] `findMostRecentCompletedStep` covers empty dir, single complete, multiple complete, gaps, and mixed states
- [ ] `stepFolderName` zero-padding verified (S01–S09, S10+)
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Circular imports:** `execute-task.ts` and `review-code.ts` import from `./session-capability`, `../utils`, and `@earendil-works/pi-coding-agent`. Importing the exported functions from test files should not create cycles since tests are leaf consumers. If circular dependency issues arise, verify that only the specific functions are needed (not the full module setup).
- **`isStepReady` already exported:** Confirm it's exported before attempting to re-export. The plan assumes it might need exporting, but code review shows it already has `export`.
- **Constants not exported:** The marker file names (`COMPLETED_MARKER`, `BLOCKED_MARKER`, etc.) are local constants in each capability file. Tests should use the string literals directly (`"COMPLETED"`, `"BLOCKED"`) rather than relying on exports — this matches how the functions work internally.
- **Step folder naming consistency:** Both `execute-task.ts` and `review-code.ts` import `stepFolderName` from `../utils`. Tests must use the same function to construct expected folder names.
