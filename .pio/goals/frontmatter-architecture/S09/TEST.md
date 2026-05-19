# Tests: Update `src/index.ts`, migrate tests, verify build

## Unit Tests

### Fix `src/guards/validation.test.ts` — remove orphaned `extractGoalName` tests

**File:** `src/guards/validation.test.ts`
**Test runner:** Vitest (global describe/it/expect)
**Action:** Remove the stale import and test block. Do not add new tests — this is a cleanup.

**Changes to make:**

1. **Remove from import statement** (line 6): Delete `extractGoalName,` from the destructured import:
   ```typescript
   // Before:
   import { validateOutputs, extractGoalName, setupValidation } from "./validation";
   // After:
   import { validateOutputs, setupValidation } from "./validation";
   ```

2. **Remove the entire describe block** (lines ~115–148): Delete `describe("extractGoalName", ...)` with all 7 test cases:
   - "standard path extracts goal name"
   - "path without trailing slash extracts goal name"
   - "deeply nested path stops at goal name"
   - "no /goals/ segment returns empty string"
   - "root-level goals path extracts goal name"
   - "empty string input returns empty string"
   - "goal name with hyphens and underscores is preserved"

**Verification:** After this change, the file has exactly 7 tests (6 validateOutputs + 1 setupValidation). The `npx tsc --noEmit` error `TS2305: Module '"./validation"' has no exported member 'extractGoalName'` should disappear.

---

### Add `pio_mark_complete` exit orchestration tests to `session-capability.test.ts`

**File:** `src/capabilities/session-capability.test.ts`
**Test runner:** Vitest (global describe/it/expect, with vi.mock)
**Action:** Add a new top-level `describe("pio_mark_complete tool — exit orchestration", ...)` block.

#### Test setup pattern

Import the `markCompleteTool` directly from `session-capability.ts`. For each test:

- Create a temp directory with goal structure (`.pio/goals/{name}/`).
- Construct a mock `ctx` object with:
  - `sessionManager.getEntries()` returning a custom `pio-config` entry with a complete `CapabilityConfig`.
  - Other required fields as needed by the tool execute handler.
- Call `markCompleteTool.execute(toolCallId, params, signal, onUpdate, ctx)` directly.
- Assert on return value and filesystem state.

#### Test cases

**describe("pio_mark_complete tool — exit orchestration"):**

1. **File validation fails — returns error, no termination**
   - Arrange: config with `validation: { files: ["MISSING.md"] }`, temp dir without that file. No postValidate/postExecute.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: return value contains "Validation failed" text, `terminate` is `false` (or not present). No transition enqueued.

2. **File validation passes — proceeds to next phase**
   - Arrange: config with `validation: { files: ["GOAL.md"] }`, temp dir has `GOAL.md`. No postValidate.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: return value contains "Validation passed", `terminate` is `true`.

3. **postValidate returns failure — error message propagated, no termination**
   - Arrange: config with `postValidate` returning `{ success: false, message: "Custom error" }`. File validation passes.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: return text contains "Custom error". `terminate` is `false`. No markers created.

4. **postValidate returns success — proceeds to transition routing**
   - Arrange: config with `postValidate` returning `{ success: true }`. File validation passes. Mock `resolveTransition` to return a next task.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: `resolveTransition` was called. `enqueueTask` was called with correct capability. Return value mentions "Next task enqueued".

5. **REJECTED decision — postValidate creates REJECTED marker, deletes COMPLETED**
   - Arrange: review-task config (real `postValidate` from `CAPABILITY_CONFIG`), S01/ has REVIEW.md with REJECTED frontmatter and COMPLETED marker.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: S01/REJECTED exists on disk, S01/COMPLETED is deleted. Return value contains "Validation passed".

6. **APPROVED decision — postValidate creates APPROVED marker**
   - Arrange: review-task config, S02/ has REVIEW.md with APPROVED frontmatter and COMPLETED marker.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: S02/APPROVED exists on disk, S02/COMPLETED still exists. Return value contains "Validation passed".

7. **postValidate throws — error caught, non-fatal**
   - Arrange: config with `postValidate` that throws an error.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: Return text mentions "Post-validation error". Agent stays in session (`terminate` is `false`).

8. **postExecute is called after transitions**
   - Arrange: config with both `postValidate` (success) and `postExecute` (a vi.fn). File validation passes. Mock `resolveTransition` to return a next task.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: `postExecute` was called after transitions completed.

9. **postExecute errors are non-fatal**
   - Arrange: config with `postExecute` that throws an error. postValidate succeeds.
   - Act: call `markCompleteTool.execute(...)`.
   - Assert: Tool still returns success (`terminate: true`). Error was logged to console.warn but didn't crash the flow.

10. **fileCleanup deletes declared files**
    - Arrange: config with `fileCleanup: [someFile]`. Create that file in temp dir. postValidate succeeds.
    - Act: call `markCompleteTool.execute(...)`.
    - Assert: The file is deleted from disk after validation passes.

11. **No config entry — returns pass message without validation**
    - Arrange: `ctx.sessionManager.getEntries()` returns no `pio-config` entry.
    - Act: call `markCompleteTool.execute(...)`.
    - Assert: Return text mentions "No validation rules configured". `terminate` is `true`.

12. **Missing workingDir — returns error message**
    - Arrange: config exists but `workingDir` is undefined.
    - Act: call `markCompleteTool.execute(...)`.
    - Assert: Return text mentions "No directory is defined". `terminate` is `true`.

## Programmatic Verification

- **What:** TypeScript compilation has zero errors after removing `extractGoalName` import
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Zero exit code, no error output (previously: 1 error in `validation.test.ts`)

- **What:** Full test suite passes with zero failures
  - **How:** `npx vitest run`
  - **Expected result:** Exit code 0, all tests pass. Previously: 391 passed / 7 failed. Target: 0 failed (398+ total including new mark-complete tests).

- **What:** No `extractGoalName` references remain in validation test file
  - **How:** `grep -c "extractGoalName" src/guards/validation.test.ts`
  - **Expected result:** `0` (no matches)

- **What:** validation.test.ts imports only retained exports
  - **How:** `grep "from.*validation" src/guards/validation.test.ts`
  - **Expected result:** Line contains only `validateOutputs` and `setupValidation` (no `extractGoalName`)

- **What:** markCompleteTool is defined in session-capability.ts, not validation.ts
  - **How:** `grep -c "markCompleteTool\|defineTool.*mark_complete" src/guards/validation.ts` and `grep -c "markCompleteTool" src/capabilities/session-capability.ts`
  - **Expected result:** 0 in validation.ts, >= 1 in session-capability.ts

## Test Order

1. Fix `validation.test.ts` (remove extractGoalName) — this eliminates the TypeScript error and 7 failing tests first.
2. Verify `npx tsc --noEmit` passes (baseline: no type errors).
3. Add mark_complete orchestration tests to `session-capability.test.ts`.
4. Run full test suite (`npx vitest run`) — all pass, no regressions.
