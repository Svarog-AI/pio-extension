# Summary: Add re-execution feedback channel in `execute-task`

## Status
COMPLETED

## Files Created
- `__tests__/execute-task-initial-message.test.ts` — 7 unit tests for the rejection feedback channel (REJECTED detection, REVIEW.md reference, re-execution language, graceful degradation)

## Files Modified
- `src/capabilities/execute-task.ts` — `defaultInitialMessage` now checks for `S{NN}/REJECTED` on disk and prepends a rejection-aware instruction block referencing `S{NN}/REVIEW.md` when the marker is present

## Files Deleted
- (none)

## Decisions Made
- **File-based detection (not param flag):** Followed TASK.md's direction to check `fs.existsSync` for the REJECTED file directly, rather than relying on a `params.rejectedAfterReview` flag. The REJECTED file on disk is the single source of truth.
- **Non-blocking try/catch:** If filesystem read fails for any reason, the code falls through to the normal message — the rejection feedback is an enhancement, not a hard requirement.
- **Used existing imports:** No new imports needed — `fs`, `path`, and `stepFolderName()` are already available in the module.

## Test Coverage
- 7 new unit tests (all passing):
  - REVIEW.md reference present when REJECTED marker exists
  - Re-execution language present when REJECTED marker exists
  - No rejection message when REJECTED absent
  - Normal message preserved when no rejection
  - Graceful handling of missing stepNumber (error message, no crash)
  - Normal message when step folder doesn't exist (fs.existsSync returns false)
  - Zero-padded step number in rejection message (S05 not S5)
- Full suite: 175 tests across 12 files — all passing, no regressions
- `npm run check`: TypeScript compilation succeeds with no type errors
