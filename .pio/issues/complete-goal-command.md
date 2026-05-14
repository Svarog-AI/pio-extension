# Add /pio-complete-goal command to finish a goal early

There is currently no way to mark a goal as complete before all plan steps have been executed. If a goal's objectives are met early, or if scope changes make remaining steps unnecessary, the only options are to manually delete the goal (`/pio-delete-goal`) or run through every remaining step.

Add a `/pio-complete-goal <name>` command (with corresponding `pio_complete_goal` tool) that:
1. Validates the goal workspace exists
2. Marks the goal as complete (e.g., writes a `COMPLETED` marker file in `.pio/goals/<name>/`)
3. Clears any pending tasks for that goal from `.pio/session-queue/`
4. Optionally generates a brief completion summary

This complements `/pio-delete-goal` by preserving the goal's artifacts while formally closing it out.

## Category

improvement

## Context

Related files: `src/capabilities/delete-goal.ts` (pattern for name-validated commands), `src/fs-utils.ts` (`resolveGoalDir`, `goalExists`), `src/queues.ts` (session queue operations). The command should follow the same tool+command dual-registration pattern as `pio_delete_goal`.
