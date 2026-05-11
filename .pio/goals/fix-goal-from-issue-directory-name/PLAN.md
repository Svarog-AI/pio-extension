# Plan: Fix pio_goal_from_issue directory name

Remove the `name` parameter from `pio_goal_from_issue` and derive the goal workspace name directly from the issue slug, eliminating the possibility of a mismatch between the requested name and the actual directory.

## Prerequisites

None.

## Steps

### Step 1: Remove `name` parameter and derive goal name from issue slug

**Description:** Simplify `pio_goal_from_issue` so it accepts only one parameter — `issuePath`. The goal workspace name is derived from the issue filename by stripping the `.md` extension (e.g., `fix-something.md` → `fix-something/`). This eliminates the mismatch bug entirely since there's a single source of truth for the goal name.

Changes in the tool path (`defineTool.execute`):
- Remove `name` from `Type.Object` schema — only `issuePath` remains
- After resolving the issue path via `findIssuePath`, derive goal name: `path.basename(resolvedPath, ".md")`
- Use derived goal name in `goalExists` check, `enqueueTask` call (first arg and inside `params.goalName`)

Changes in the command path (`handleGoalFromIssue`):
- Update usage message to single arg: `/pio-goal-from-issue <issue-identifier>`
- Parse a single argument instead of splitting into `issuePath` + `name`
- Resolve issue path via `findIssuePath`, derive goal name from slug
- Use derived goal name in validation and in the call to `resolveCapabilityConfig`

The create-goal session still receives `goalName` in its params (derived from the issue slug), so downstream behavior (directory creation, write allowlist, etc.) is unaffected. No changes needed to `create-goal.ts`, `next-task.ts`, `utils.ts`, or `session-capability.ts`.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no type errors
- [ ] Tool schema has exactly one parameter: `issuePath` (string) — no `name` param
- [ ] Command handler accepts a single positional argument (issue identifier) and shows correct usage message when called with zero or multiple args
- [ ] Goal name is derived from the issue path using `path.basename(resolvedPath, ".md")` in both tool and command paths
- [ ] The enqueued task contains `goalName` matching the derived slug (inspect queue file content if testing manually)
- [ ] No other source files are modified (`src/capabilities/goal-from-issue.ts` is the only changed file)

**Files affected:**
- `src/capabilities/goal-from-issue.ts` — remove `name` param, derive goal name from issue slug in tool and command paths

## Notes

- **Backwards compatibility:** Old queued tasks in `.pio/session-queue/` that still carry a `goalName` param will continue to work — `resolveCapabilityConfig` reads `goalName` from params regardless of how it was produced. No migration needed.
- **Directory creation:** The create-goal session (via `prepareGoal` in `create-goal.ts`) creates the workspace directory before writing GOAL.md. No change needed here.
- **Existing orphaned directories** like `.pio/goals/goal-from-issue-wrong-directory-name/` are not cleaned up by this change — they're artifacts of past runs that should be removed manually if desired.
