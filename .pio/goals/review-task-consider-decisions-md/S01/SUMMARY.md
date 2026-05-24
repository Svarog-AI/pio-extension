# Summary: Add DECISIONS.md support to review-task

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capabilities/review-task.ts` — added `DECISIONS_FILE` constant, appended `${folder}/${DECISIONS_FILE}` to `resolveReviewReadOnlyFiles()` return value
- `src/prompts/review-task.md` — updated Step 2 with DECISIONS.md instructions, User-Requested Changes instructions, and authority hierarchy; updated Step 4 alignment check with TASK ↔ DECISIONS and TASK ↔ User-Requested Changes dimensions
- `src/capabilities/review-task.test.ts` — added 3 tests verifying DECISIONS.md appears in readOnlyFiles for step numbers 1, 2, and 5

## Files Deleted
- (none)

## Decisions Made
- `DECISIONS.md` is included unconditionally in `readOnlyFiles` (no `stepNumber > 1` check). This is a write-blocklist — including a non-existent file is harmless and simpler than conditional logic.
- The prompt instructs the reviewer that `DECISIONS.md` won't exist for Step 1 — this is a behavioral instruction, not a filesystem gate.

## User-Requested Changes
- (none)

## Test Coverage
- 3 new unit tests in `review-task.test.ts` verify `DECISIONS.md` appears in `readOnlyFiles` for step numbers 1, 2, and 5 (with zero-padded folder names).
- All 670 existing tests continue to pass — no regressions.
- `npx tsc --noEmit` exits with code 0.
