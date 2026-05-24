# Execute-Task Track User Changes

Add instructions to the execute-task prompt so that the executor tracks user-requested changes during a session and updates `SUMMARY.md` incrementally with a dedicated "User-Requested Changes" section. This ensures `SUMMARY.md` always reflects the final state of all files, not just the original `TASK.md` scope.

## Current State

The execute-task agent follows a linear workflow defined in `src/prompts/execute-task.md`:

1. Read `GOAL.md` and `PLAN.md` for context
2. Read `TASK.md` (and optionally `DECISIONS.md`) from the step folder (`S{NN}/`)
3. Research supporting codebase context
4. Create `TEST.md` with test cases derived from acceptance criteria
5. Write tests first (Red phase)
6. Implement the feature (Green phase)
7. Run all verification (tests, programmatic checks)
8. Verify non-test acceptance criteria
9. Write completion artifacts: `COMPLETED`, `SUMMARY.md`, commit changes

`SUMMARY.md` is written once at Step 9 with these sections: `Status`, `Files Created`, `Files Modified`, `Files Deleted`, `Decisions Made`, and `Test Coverage`. The prompt does not instruct the executor to revisit or update `SUMMARY.md` after user feedback. When a user requests changes mid-session (e.g., "merge this step", "change the framing"), the executor applies the code changes but leaves `SUMMARY.md` stale until explicitly reminded — sometimes never.

The execute-task capability itself (`src/capabilities/execute-task.ts`) enforces file protection: `TASK.md` is read-only, and `pio_mark_complete` validates that `TEST.md` and `SUMMARY.md` exist. There is no code-side mechanism for tracking user interactions; the behavior is entirely prompt-driven.

Observed during S08 of the `implement-subgoals` goal: the user requested four separate changes (step merging, framing adjustments, prompt rewrites) that were all applied to source files but not reflected in `SUMMARY.md`.

## To-Be State

The execute-task prompt (`src/prompts/execute-task.md`) will be updated with new instructions so that:

1. **User feedback is detected and tracked.** When the user provides feedback or requests changes after initial implementation (between Step 6 and Step 9, or during verification), the executor recognizes this as a user-requested change rather than part of the original task scope.

2. **SUMMARY.md is updated incrementally.** After applying each user-requested change, the executor updates `SUMMARY.md` to reflect:
   - Any new files created or modified by the change
   - A new "User-Requested Changes" section documenting each change with a brief description of what was requested and what files were affected

3. **The SUMMARY.md template gains a "User-Requested Changes" section.** The Step 9 completion artifacts template will include this section between "Decisions Made" and "Test Coverage". When no user changes occurred, it lists "(none)". When changes did occur, each entry describes the user request and the resulting file modifications.

4. **The executor knows to revisit SUMMARY.md on user feedback.** A new sub-step or guideline will instruct the executor that after applying user-requested changes (before proceeding to final verification), they must update `SUMMARY.md` with the change details. This prevents the summary from going stale regardless of how many iterations occur.

Files affected:
- `src/prompts/execute-task.md` — primary change: add instructions for tracking and recording user-requested changes, update SUMMARY.md template to include the new section
