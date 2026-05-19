# Task: Update `src/index.ts`, migrate tests, verify build

Final integration step — fix dangling test imports, add missing mark-complete orchestration tests, and verify the full build passes.

## Context

Steps 1–8 refactored frontmatter parsing out of `validation.ts` into a shared module, added lifecycle hooks, and slimmed down `validation.ts`. However, some test cleanup was deferred to this final step:

- `src/guards/validation.test.ts` still imports `extractGoalName` (removed in Step 8), causing 7 failing tests and 1 TypeScript error.
- `src/capabilities/session-capability.test.ts` has no tests for the `pio_mark_complete` tool — the core exit orchestration (validateOutputs → postValidate → resolveTransition → postExecute) is untested.

The rest of the test migration was already completed by earlier steps: `frontmatter.test.ts`, `review-task.test.ts` (post-validate), and `goal-state.test.ts` (getReviewOutputs) all exist with comprehensive coverage.

## What to Build

### 1. Fix `src/guards/validation.test.ts` — remove `extractGoalName` tests

The `extractGoalName` function was removed from `validation.ts` in Step 8. It is no longer exported, and the test file has a stale import causing a TypeScript error (`TS2305`) and 7 runtime failures.

**Changes:**
- Remove `extractGoalName` from the import statement (line 6).
- Remove the entire `describe("extractGoalName", ...)` block (lines ~115–148).
- Keep the `validateOutputs` tests and the `setupValidation` test — these validate retained functionality.

**After this change:**
- The file imports only: `validateOutputs`, `setupValidation` from `./validation`.
- Contains two describe blocks: `validateOutputs` (6 tests) and `setupValidation` (1 test).
- No TypeScript errors from the validation test file.

### 2. Add `pio_mark_complete` exit orchestration tests to `session-capability.test.ts`

The `markCompleteTool` in `session-capability.ts` orchestrates: validateOutputs → postValidate → resolveTransition → enqueueTask → recordTransition → postExecute → cleanup → terminate. Currently no tests cover this flow.

**Add a new describe block:** `pio_mark_complete tool — exit orchestration`

Test the tool by invoking it directly (it's defined in the module, importable for testing). The tool reads config from session custom entries (`pio-config`), so tests must construct a mock `ctx.sessionManager.getEntries()` returning the correct capability config.

Key test cases:
- **File validation fails** — when `validateOutputs` returns `{ passed: false }`, tool returns error text, no termination.
- **File validation passes** — proceeds past file check to postValidate.
- **postValidate fails** — when `config.postValidate` returns `{ success: false, message }`, tool returns the error message, no termination.
- **postValidate succeeds with valid review frontmatter** — marker (APPROVED/REJECTED) is created on disk via `applyReviewDecision`, tool proceeds to transition routing.
- **Transition + task enqueuing** — after successful postValidate, `resolveTransition` and `enqueueTask` are called with correct capability and params. Verify a queue file appears at `.pio/session-queue/task-{goalName}.json`.
- **PostExecute hook is called** — when `config.postExecute` is defined, it runs after transitions. Errors in postExecute are caught (non-fatal).
- **File cleanup** — files in `config.fileCleanup` are deleted from disk after validation passes.
- **Terminate on success** — when all phases pass, the tool returns `{ terminate: true }`.

### 3. Verify `src/index.ts` imports are correct

Read `src/index.ts` and confirm:
- `setupValidation` is still imported from `./guards/validation` (function signature preserved).
- `setupCapability` is imported from `./capabilities/session-capability` (now also registers `pio_mark_complete`).
- No dangling imports to removed functions (`extractGoalName`, `parseReviewFrontmatter`, etc.).
- No missing exports that downstream modules depend on.

**Expected:** No changes needed. The function signatures and export paths were preserved during the refactoring. This is a verification step — if anything is broken, fix it.

### 4. Final verification

Run the full type check and test suite:
- `npx tsc --noEmit` — must report zero errors (the `extractGoalName` error should be gone).
- `npx vitest run` — all tests pass (398 total, including new mark-complete tests). No regressions.

## Code Components

### Test helpers for mark_complete tests

The `session-capability.test.ts` file already has mocking infrastructure (`vi.hoisted`, `vi.mock`). New tests should follow the existing pattern:

- Mock `../state-machine` to control what `resolveTransition` returns.
- Mock `../queues` to verify `enqueueTask` and `writeLastTask` are called.
- Use real filesystem (temp dirs) for marker creation verification by `postValidate`.
- Construct mock `ctx.sessionManager.getEntries()` returning a custom `pio-config` entry with full `CapabilityConfig`.

### Test data — minimal capability config

Tests need a way to construct a complete `CapabilityConfig` for the tool to consume. Build it inline:

```typescript
// Type signature (reference only, not implementation):
const config: CapabilityConfig = {
  capability: "review-task",
  workingDir: goalDir,
  validation: { files: ["S01/REVIEW.md"] },
  postValidate: mockPostValidate,
  // ... other fields as needed
};
```

## Approach and Decisions

- **Follow the existing test pattern in `session-capability.test.ts`:** Use `vi.hoisted` + `vi.mock` for module-level mocks. Prefer real implementations where possible (e.g., don't mock `validateOutputs` — use the real function).
- **Test state, not interactions:** Verify filesystem outcomes (markers exist, queue files created) rather than mocking every internal call. Use mocks only for `resolveTransition` and `enqueueTask` which have side effects outside test scope.
- **No changes to production code expected:** This step is test migration and verification only. If type errors reveal a real issue in source code, fix it minimally (e.g., add a missing export).
- **DECISIONS.md cross-reference:** See S09/DECISIONS.md for plan deviations about typebox schemas, GoalState as single parsing path, and the extractGoalName removal. These decisions affect how tests should be structured.

## Dependencies

- Steps 1–8 must all be completed (frontmatter module, review-task refactoring, GoalState getReviewOutputs, lifecycle hooks, mark_complete relocation, validation.ts slim-down).

## Files Affected

- `src/guards/validation.test.ts` — modified: remove `extractGoalName` import and describe block
- `src/capabilities/session-capability.test.ts` — modified: add `pio_mark_complete` exit orchestration tests
- `src/index.ts` — verified (likely no changes needed)
- `S09/DECISIONS.md` — created: accumulated decisions from Steps 1–8

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports zero errors
- [ ] `npx vitest run` passes all tests with zero failures (no regressions)
- [ ] `src/guards/validation.test.ts` no longer imports or references `extractGoalName`
- [ ] `src/guards/validation.test.ts` contains only `validateOutputs` and `setupValidation` tests
- [ ] `src/capabilities/session-capability.test.ts` contains `pio_mark_complete` exit orchestration tests covering: file validation fail/pass, postValidate fail/success, transition enqueuing, postExecute, file cleanup, terminate on success
- [ ] `src/index.ts` has no dangling imports or missing exports

## Risks and Edge Cases

- **Module import resolution:** After removing `extractGoalName`, verify nothing else in the test suite imports it from `validation.test.ts` indirectly.
- **Mock scope with `vi.resetModules`:** The existing `session-capability.test.ts` uses `vi.resetModules()` in some describe blocks. New tests must be placed carefully to avoid mock interference between describe blocks.
- **Real filesystem interactions:** Mark-complete tests that invoke `postValidate` will trigger real filesystem writes (APPROVED/REJECTED markers). Ensure temp dirs are properly cleaned up in `afterEach`.
