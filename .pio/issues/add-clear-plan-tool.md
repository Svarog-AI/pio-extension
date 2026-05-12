# Add clear-plan tool to remove incomplete step folders from a goal workspace

## Problem

After multiple plan revisions or failed execution attempts, goal workspaces accumulate stale step folders (`S01/`, `S02/`, ...) containing partial work — old TASK.md, TEST.md, SUMMARY.md files that no longer match the current plan. These orphaned folders pollute the workspace and confuse downstream capabilities:

- `discoverNextStep` scans step folders sequentially — incomplete folders with TASK.md + TEST.md but no COMPLETED marker are treated as "ready to execute" even if they reference an old plan version
- `findMostRecentCompletedStep` may find stale completed markers from a previous plan iteration
- The goal directory becomes cluttered with ghost steps that don't correspond to any real work

There's currently no way to clean up incomplete steps. The options are: delete the entire goal (`pio_delete_goal`) or manually `rm -rf` step folders — both lossy and error-prone.

## Proposed solution

Add a `pio_clear_plan` tool (and `/pio-clear-plan` command) that:

1. Takes a goal name as input
2. Scans all step folders (`S01/`, `S02/`, ...) in the goal workspace
3. **Removes** any folder that does **not** contain the `COMPLETED` placeholder file
4. Preserves folders that have `COMPLETED` (completed work is kept)
5. Reports what was removed and what was kept

### Tool signature

```typescript
defineTool({
  name: "pio_clear_plan",
  label: "Pio Clear Plan",
  description: "Remove incomplete step folders from a goal workspace. Keeps only steps with the COMPLETED marker file.",
  parameters: Type.Object({
    name: Type.String({ description: "Name of the goal workspace (under .pio/goals/<name>)" }),
    dryRun: Type.Optional(Type.Boolean({ description: "If true, list what would be removed without deleting. Default: false." })),
  }),
  // ...
});
```

### Behavior

1. Validate goal exists and has GOAL.md + PLAN.md
2. Scan `S01/`, `S02/`, ... in the goal directory
3. For each folder: check for `COMPLETED` file
   - Has `COMPLETED` → keep (report as kept)
   - No `COMPLETED` → remove entire folder (report as removed)
4. Also clear the session queue task slot for this goal (`task-{goalName}.json`) to prevent stale tasks from running against deleted steps
5. Return summary: "Removed N incomplete steps (S01, S03). Kept M completed steps (S02)."

### Command

```
/pio-clear-plan <goal-name> [--dry-run]
```

If `--dry-run` is provided, list what would be removed without actually deleting anything. Useful for safety checks before clearing.

### Safety considerations

- This is a destructive operation — consider requiring explicit confirmation or making dry-run the default for the tool (command can default to real execution)
- The command should show the dry-run output before proceeding when not using `--dry-run` explicitly, asking user to confirm
- Never remove GOAL.md, PLAN.md, LAST_TASK.json, or the session queue directory itself

## Implementation location

- New file: `src/capabilities/clear-plan.ts` — tool + command (no prompt/sub-session needed, it's a direct filesystem operation)
- Register in `src/index.ts` alongside other tools/commands

## Category

improvement

## Category

improvement
