# Execute-task should track user-requested changes and update SUMMARY.md

## Problem

When a user provides feedback or requests changes during an execute-task session, the executor applies the changes but does not update `SUMMARY.md` to reflect them. The summary only captures the original TASK.md scope.

## Example

During S08 of `implement-subgoals`, the user requested several changes after initial implementation:
1. Remove Step 4.5, merge subgoal classification into Step 4
2. Frame steps as deliverables conceptually
3. Don't reference skill sections explicitly in prompts
4. Remove the fixed step count guard (threshold of 8)

Each change was applied to the files, but `SUMMARY.md` was not updated until explicitly asked. The executor should track these user-requested changes and update the summary incrementally.

## Expected behavior

- When a user requests a change during execution, the executor should apply it AND update `SUMMARY.md` to document the change
- `SUMMARY.md` should accurately reflect the final state of all files, including post-initial-implementation changes
- User-requested changes should be noted in the "Decisions Made" section

## Impact

Without this, `SUMMARY.md` becomes stale and doesn't accurately represent what was actually done. Review agents and future sessions rely on summaries to understand what changed — stale summaries lead to incorrect context.

## Category

improvement

## Context

Observed during S08 of implement-subgoals goal. The execute-task prompt (Step 9) says to write SUMMARY.md with "Files Modified" and "Decisions Made" but does not instruct the executor to update it when user-requested changes occur after the initial implementation. The `execute-task.md` prompt may need guidance on tracking iterative changes.
