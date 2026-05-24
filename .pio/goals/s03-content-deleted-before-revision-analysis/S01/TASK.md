# Task: Move step folder deletion from prepareSession to postExecute

Extract the non-APPROVED step folder deletion and `REVISE_PLAN_NEEDED` marker cleanup from `prepareSession()` into a new `cleanupIncompleteSteps()` function, wired as the `postExecute` callback. After this change, `prepareSession()` performs only PLAN.md archival — step folders remain on disk during the agent session.

## Context

During plan revision, `prepareSession()` in `src/capabilities/revise-plan.ts` deletes all non-APPROVED `S{NN}/` folders _before_ the Plan Revision Agent starts. This destroys the trigger step's content (`TASK.md`, `TEST.md`, `DECISIONS.md`, `REVISE_PLAN_NEEDED`) that the agent needs to understand why revision was triggered. The fix defers this cleanup to `postExecute`, which runs after the session completes (after `pio_mark_complete`).

## What to Build

### 1. Extract deletion logic into `cleanupIncompleteSteps()`

Create a new exported function:

```ts
export async function cleanupIncompleteSteps(
  goalDir: string,
  params?: Record<string, unknown>,
): Promise<void>
```

This function must:

- **Scan disk for `S{NN}/` folders** using the regex `/^S(\d+)$/` (same pattern used in `goal-state.ts`). Do NOT rely on `createGoalState().steps()` — at `postExecute` time, PLAN.md may have been replaced by the revision agent with a different step list. Disk scanning is authoritative here.
- For each `S{NN}/` folder found: check if it contains an `APPROVED` marker file. If not, delete the entire folder recursively with `fs.rmSync(dir, { recursive: true, force: true })`.
- **Clean up `REVISE_PLAN_NEEDED` marker** from the trigger step folder when `params.revisionTriggerStep` is a number. Use `stepFolderName()` from `../fs-utils` to construct the path. Handle gracefully if the folder or marker no longer exists (use `force: true`). Note: in practice, the trigger step folder will have already been deleted by the disk-scan loop above — this cleanup is a safety net for edge cases where the trigger step was APPROVED but still had a marker.

### 2. Remove deletion logic from `prepareSession()`

In the existing `prepareSession()` function:

- **Keep** the PLAN.md archival logic (Steps 1 in current code — archive to `PLAN_ARCHIVE/`).
- **Remove** the non-APPROVED step folder deletion loop (Step 2 in current code).
- **Remove** the `REVISE_PLAN_NEEDED` marker cleanup (Step 3 in current code) — this is now handled by `cleanupIncompleteSteps()`.
- Update the JSDoc comment to reflect that it now performs only PLAN.md archival.

### 3. Wire `cleanupIncompleteSteps` as `postExecute` in `CAPABILITY_CONFIG`

Add `postExecute: cleanupIncompleteSteps` to the `CAPABILITY_CONFIG` object. This ensures cleanup runs after `pio_mark_complete` succeeds and after transition routing — i.e., after the agent has already read all needed files and the new PLAN.md is written.

The `PostExecuteCallback` type (from `src/types.ts`) is `(goalDir: string, params?: Record<string, unknown>) => void | Promise<void>`, which matches the signature of `cleanupIncompleteSteps()`. The framework in `session-capability.ts` already handles async postExecute hooks with try/catch.

### 4. Update existing tests in `revise-plan.test.ts`

**Update `prepareSession — cleanup` test suite:**
- "deletes step folders without APPROVED marker" → change to assert that S01 (non-APPROVED) is **still present** after `prepareSession()`. Folder preservation is the new expected behavior.
- "preserves APPROVED step folders" → this should still pass as-is (APPROVED folders are never deleted).
- "deletes multiple non-APPROVED folders" → change to assert that S01 and S02 (non-APPROVED) are **still present**. S03 (APPROVED) remains.
- "handles goal with all steps APPROVED" → should still pass as-is.

**Update `prepareSession — marker cleanup` test suite:**
- "deletes REVISE_PLAN_NEEDED from triggering step folder when revisionTriggerStep provided" → change to assert that the marker is **still present** after `prepareSession()` (it's now cleaned up by `postExecute`, not `prepareSession`). The S01 folder should still exist and contain the marker.
- "does not attempt cleanup when revisionTriggerStep is not provided" → this test currently relies on S02 being deleted because it's non-APPROVED. Update to: create a non-APPROVED step with a marker, call `prepareSession()` without params, and assert the folder **still exists** (including the marker).
- "handles missing marker gracefully" → should still pass as-is (no-op when marker is absent).

**Update end-to-end test:**
- "full lifecycle: archive, cleanup, marker removal in one run" → update assertions so that after `prepareSession()`: S01 exists with APPROVED and marker intact, S02 and S03 still exist (not deleted), PLAN_ARCHIVE has one file, original PLAN.md is gone.

**Add new test suite for `cleanupIncompleteSteps()`:**
- "deletes non-APPROVED S{NN}/ folders found on disk" — create goalDir with mixed approved/non-approved folders, call `cleanupIncompleteSteps()`, assert only APPROVED folders remain.
- "preserves APPROVED S{NN}/ folders" — all APPROVED folders survive cleanup.
- "handles empty goal directory (no step folders)" — no crash when no S{NN}/ folders exist.
- "deletes all folders when none are APPROVED" — all folders removed.
- "scans disk, not PLAN.md frontmatter" — create folders on disk that differ from what PLAN.md says (or delete PLAN.md entirely), verify cleanup still finds and processes the real folders.
- "cleans up REVISE_PLAN_NEEDED marker when trigger step folder exists" — create APPROVED S01 with `REVISE_PLAN_NEEDED` marker, call with `revisionTriggerStep: 1`, assert marker is removed but folder remains (it's APPROVED).
- "handles missing trigger step folder gracefully" — call with `revisionTriggerStep: 99` where S99 doesn't exist — no crash.

### 5. TypeScript compilation check

After all changes, run `npx tsc --noEmit` to verify no type errors. The test file must import `cleanupIncompleteSteps` alongside the existing imports from `./revise-plan`.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/capabilities/revise-plan.ts` — extract deletion logic into `cleanupIncompleteSteps()`, remove it from `prepareSession()`, add `postExecute` to `CAPABILITY_CONFIG`
- `src/capabilities/revise-plan.test.ts` — update existing prepareSession assertions (folders preserved), add new test suite for `cleanupIncompleteSteps()`

## Acceptance Criteria

### From PLAN.md (verbatim):
- `prepareSession()` no longer deletes any `S{NN}/` folders — only archives PLAN.md
- `CAPABILITY_CONFIG.postExecute` is defined and calls `cleanupIncompleteSteps()`
- `cleanupIncompleteSteps()` scans disk for `S{NN}/` folders (not just frontmatter) to handle the post-revision state where the new PLAN.md may differ from archived one
- Non-APPROVED `S{NN}/` folders are deleted by `cleanupIncompleteSteps()`; APPROVED folders are preserved
- `REVISE_PLAN_NEEDED` marker is cleaned up when trigger step folder still exists at cleanup time
- `npx tsc --noEmit` reports no errors

### Additional criteria:
- All existing tests in `revise-plan.test.ts` pass with updated assertions (`npx vitest run src/capabilities/revise-plan.test.ts`)
- New test suite for `cleanupIncompleteSteps()` covers: disk scanning, APPROVED preservation, marker cleanup, missing folder handling, empty directory
- The end-to-end integration test is updated to reflect the new split lifecycle (prepareSession preserves, cleanupIncompleteSteps deletes)

## Risks and Edge Cases

1. **PLAN.md absent at postExecute time:** After `prepareSession()`, PLAN.md is deleted. The revision agent writes a new PLAN.md during the session. If the agent fails to write one, `cleanupIncompleteSteps()` must still work — hence disk scanning instead of frontmatter parsing.
2. **New step folders created by revision agent:** The revise-plan agent might create new `S{NN}/` folders for completed-step anchors. These won't have `APPROVED` markers but represent intentional references. However, per the current prompt design, the agent reads existing APPROVED folders as anchors — it doesn't create new ones. If this changes in future, the cleanup logic may need refinement.
3. **Concurrent sessions:** `postExecute` runs after `pio_mark_complete`, which terminates the session. There's no risk of concurrent access during cleanup since the agent has already finished.
4. **Error tolerance:** The framework catches postExecute errors (`session-capability.ts` wraps in try/catch). Errors here do not affect transitions. This is intentional — cleanup failure should not block workflow progression.
