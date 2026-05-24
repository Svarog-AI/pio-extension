# Summary: Update execute-task prompt with auto-commit instruction

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/prompts/execute-task.md` — inserted git commit sub-step (2b) into Step 9 for both success and failure paths, between SUMMARY.md writing and `pio_mark_complete`. The instruction delegates to the `pio-git` skill without duplicating its protocol.

## Files Deleted
- (none)

## Decisions Made
- Used step numbering "2b" for the commit sub-step to clearly indicate it comes after SUMMARY.md (step 2) and before `pio_mark_complete` (step 3)
- The failure path includes an additional sentence: "Even on failure, commit whatever files were created/modified as a checkpoint" to emphasize checkpointing partial work
- No unit tests written — this is a prompt-only change with no TypeScript code modifications. All acceptance criteria verified via programmatic grep checks.

## Test Coverage
- No new unit tests — prompt-only change
- All 686 existing tests pass across 23 test files (no regressions)
- TypeScript type check (`npx tsc --noEmit`) passes with no errors
- Acceptance criteria verified via grep: pio-git reference, commit message instruction, graceful failure semantics, correct ordering in both success and failure paths
