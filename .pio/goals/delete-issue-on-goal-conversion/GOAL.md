# Delete Issue File on Goal Conversion

When `pio_goal_from_issue` converts an issue into a goal, the original issue file under `.pio/issues/` should be automatically deleted. This enforces the lifecycle **issue → goal → done** and prevents duplication of the same work item across two tracking locations.

## Current State

The capability lives in `src/capabilities/goal-from-issue.ts` and exposes both a tool (`pio_goal_from_issue`) and a command (`/pio-goal-from-issue`). Both handlers follow the same pattern:

1. **Validate** — `validateGoalFromIssue()` checks that the issue file exists (via `findIssuePath()`) and no goal workspace collides (via `goalExists()`). Returns `{ ok, error?, issuePath? }` where `issuePath` is the resolved absolute path to the issue file.
2. **Create goal directory** — `fs.mkdirSync(goalDir, { recursive: true })`.
3. **Queue or launch** — The tool handler calls `enqueueTask()` to queue a create-goal session; the command handler calls `launchCapability()` directly.

At no point is the original issue file deleted. After conversion, the same content exists in both `.pio/issues/<slug>.md` and `.pio/goals/<name>/GOAL.md`, creating duplication. The resolved absolute path of the issue (`validation.issuePath`) is already available in both handlers after validation passes.

## To-Be State

After this goal is complete, converting an issue into a goal will automatically delete the source issue file from `.pio/issues/`. Specifically:

- In **both** the tool `execute` handler (around line 60) and the command `handleGoalFromIssue` handler (around line 95), add `fs.rmSync(validation.issuePath, { force: true })` immediately after creating the goal directory and before enqueuing/launching.
- Deletion only happens when validation **passes**. If the issue is not found or a goal already exists, the issue file is left untouched (the early returns on validation failure ensure this).
- All existing behavior — goal workspace creation, task queuing, config resolution, session launching — remains unchanged.

The change requires modifying only `src/capabilities/goal-from-issue.ts`. No new files, dependencies, or API changes are needed. Type check must pass (`npm run check`).

### Acceptance Criteria

- Running `/pio-goal-from-issue <issue-id> <goal-name>` deletes the source issue file from `.pio/issues/`.
- Calling `pio_goal_from_issue` tool also deletes the source issue file.
- If validation fails (issue not found, goal exists), the issue file is **not** deleted.
- `npm run check` passes with no type errors.
- Existing behavior (goal workspace creation, task queuing, session launch) is unchanged.
