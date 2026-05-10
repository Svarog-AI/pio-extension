# Fix issue removal bug in goal-from-issue

The `goal-from-issue` capability deletes the source issue file before the create-goal sub-session has a chance to read it. This is a critical bug — the session starts with a reference to a non-existent file, so it cannot fulfill its task of converting the issue into GOAL.md.

## Current State

The capability lives in `src/capabilities/goal-from-issue.ts` and exposes both a tool (`pio_goal_from_issue`) and a command (`/pio-goal-from-issue`). Both code paths have the same bug:

1. **Tool path** (lines ~67-70): After validation, it creates the goal directory with `fs.mkdirSync`, then immediately deletes the issue with `fs.rmSync(validation.issuePath!)`. Only after deletion does it enqueue a task whose `initialMessage` references the now-deleted issue file path: `Issue file: ${validation.issuePath}`.

2. **Command path** (lines ~97-99): Same sequence — `fs.mkdirSync(goalDir)`, then `fs.rmSync(validation.issuePath!)`, then calls `launchCapability` with a config that includes the same reference to the deleted issue in its `initialMessage`.

In both cases, the create-goal sub-session is launched (or queued) with an `initialMessage` that tells the Goal Definition Assistant to read an issue file that no longer exists on disk. The session cannot proceed meaningfully.

## To-Be State

The issue file should remain on disk long enough for the create-goal sub-session to read it, and only be removed once the goal has been successfully created. Two approaches are viable:

1. **Pass content inline (preferred):** Before deleting the issue, read its contents with `fs.readFileSync`, include the full issue text in the `initialMessage` (e.g., `Convert the following issue into a goal:\n\n---\n{issue content}\n---`), then delete the file. This eliminates the dependency on disk access entirely — the create-goal session receives everything it needs in its prompt.

2. **Deferred deletion:** Keep the issue file and pass its path as-is, but defer `fs.rmSync` until after the sub-session has started. This is fragile because there's no reliable hook for "goal created successfully" to trigger cleanup.

The fix should use **approach 1** (pass content inline). After the change:
- Both the tool and command paths read the issue file content before deleting it.
- The `initialMessage` embeds the full issue text directly, so no file reference is needed.
- The issue is deleted after the task is enqueued / session is launched.
- If reading the issue fails (corrupt/missing), the operation should fail with a clear error rather than silently proceeding.

**Files to change:**
- `src/capabilities/goal-from-issue.ts` — both the tool's `execute` handler and the command's `handleGoalFromIssue` function need the fix applied consistently.
