# Delete issue file when it is converted into a goal

When `pio_goal_from_issue` converts an existing issue into a structured goal, the original issue file under `.pio/issues/` should be automatically deleted.

## Rationale

An issue represents open/unresolved work. Once it has been turned into a goal (i.e., actively being planned and implemented), keeping the issue file around creates duplication — the same content is tracked in both `.pio/issues/<slug>.md` and `.pio/goals/<name>/GOAL.md`. Deleting the issue on conversion keeps the issues directory clean and reinforces the lifecycle: **issue → goal → done**.

## Proposed Behavior

In `src/capabilities/goal-from-issue.ts`, after successful validation and before (or alongside) creating the goal workspace, delete the resolved issue file from disk.

### Where to change

- **File:** `src/capabilities/goal-from-issue.ts`
- **Both paths:** The tool `execute` handler and the command `handleGoalFromIssue` handler should both perform the deletion.
- **Timing:** Delete after validation passes (issue exists, no goal collision) but before or during goal workspace creation. This is safe because all pre-launch work must complete before `launchCapability` anyway.

### Implementation sketch

```ts
// After validation.ok === true:
const issuePath = validation.issuePath!;
fs.rmSync(issuePath, { force: true });
```

Add the deletion in both the tool handler (line ~70 area) and the command handler (line ~100 area), right after creating `goalDir` and before enqueuing/launching.

## Acceptance Criteria

- Running `/pio-goal-from-issue <id> <name>` or calling `pio_goal_from_issue` tool deletes the source issue file from `.pio/issues/`.
- If validation fails (issue not found, goal exists), the issue file is **not** deleted.
- Type check passes: `npm run check`.
- Existing behavior (goal workspace creation, task queuing) is unchanged.

## Category

improvement

## Context

File to modify: src/capabilities/goal-from-issue.ts — both the tool execute handler (~line 70) and the command handler handleGoalFromIssue (~line 100). The validation function validateGoalFromIssue already resolves the issue path, so the resolved absolute path is available in both handlers via `validation.issuePath`.
