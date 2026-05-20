# Task: Create finalize-goal capability module

Create `src/capabilities/finalize-goal.ts` — the complete capability module for finalizing a completed goal by updating `.pio/PROJECT/*.md` documentation based on accumulated decisions.

## Context

When a goal completes (`<goalDir>/COMPLETED` exists), accumulated decisions in `DECISIONS.md` remain isolated to the goal workspace. This capability launches a sub-session (the "Finalize Goal Agent") that reads those decisions and updates project-level documentation under `.pio/PROJECT/`. Step 4 was skipped — there is no `GoalState.lastStepDecisions()` method. The agent discovers DECISIONS.md by scanning step folders itself when given the goal workspace path.

## What to Build

A capability module following the established 4-part pattern: `CAPABILITY_CONFIG`, tool (`pio_finalize_goal`), command handler (`/pio-finalize-goal <name>`), and `setupFinalizeGoal(pi)`.

### CAPABILITY_CONFIG

Static config exporting all session shape metadata:

- **`prompt`**: `"finalize-goal.md"` — references the prompt created in Step 3
- **`writeAllowlist`**: Array of all 7 `.pio/PROJECT/*.md` paths (relative to `cwd`). Must match exactly: `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, `.pio/PROJECT/CONVENTIONS.md`, `.pio/PROJECT/GIT.md`, `.pio/PROJECT/ARCHITECTURE.md`, `.pio/PROJECT/DEPENDENCIES.md`, `.pio/PROJECT/GLOSSARY.md`. Same list as `project-context.ts`.
- **`validation`**: `undefined` — no file-existence validation. Output is a summary, not structured artifacts.
- **`defaultInitialMessage(workingDir, params)`**: Returns a kickoff message providing the goal name and absolute goal workspace directory path. The agent uses this path to scan step folders for DECISIONS.md, PLAN.md, and SUMMARY.md files. Reads `goalDir` from `params.goalDir` (absolute path passed by the tool/command).

### Tool (`pio_finalize_goal`)

Agent-callable tool with TypeBox parameter:

- **Parameters**: `name` (Type.String) — goal workspace name
- **Validation flow**:
  1. Resolve goal directory via `resolveGoalDir(ctx.cwd, name)`
  2. Check that the goal directory exists (fs.existsSync)
  3. Create `GoalState` via `createGoalState(goalDir)` and call `state.goalCompleted()` to verify COMPLETED marker exists
  4. If not complete, return error: `"Goal \"<name>\" is not yet complete. Wait for all steps to finish before finalizing."`
  5. If goal dir doesn't exist, return error referencing `/pio-create-goal`
- **On success**: Launch a finalize-goal sub-session via `launchCapability()`. Uses `resolveCapabilityConfig(ctx.cwd, { capability: "finalize-goal", goalDir })` — note: does NOT pass `goalName` to preserve `workingDir` as `cwd` (PROJECT files are at repo root, not inside goal workspace). Passes `goalDir` in params so `defaultInitialMessage` can include the goal workspace path.
- **Returns**: Success message confirming session launched

**Important — no DECISIONS.md validation:** Per the Step 4 deviation, do NOT check for DECISIONS.md existence. The agent handles this gracefully when it reads the goal workspace.

### Command Handler (`/pio-finalize-goal <name>`)

User-callable command in the TUI:

- **Argument parsing**: Extract `name` from args. If missing or empty, notify with usage: `"Usage: /pio-finalize-goal <goal-name>"`
- **Validation**: Same logic as the tool — check goal exists and COMPLETED marker is present
- **On success**: Launch via `resolveCapabilityConfig()` and `launchCapability()`. Same pattern as the tool — passes `goalDir` but not `goalName`.
- **Important**: All `ctx`-dependent work must happen before `launchCapability()` (it calls `ctx.newSession()` which makes ctx stale).

### `setupFinalizeGoal(pi)`

Registers both tool and command with the pi API:

```typescript
export function setupFinalizeGoal(pi: ExtensionAPI) {
  pi.registerTool(finalizeGoalTool);
  pi.registerCommand("pio-finalize-goal", {
    description: "Update .pio/PROJECT/ documentation based on completed goal decisions",
    handler: handleFinalizeGoal,
  });
}
```

## Approach and Decisions

- **Follow `evolve-plan.ts` as the primary pattern** — it has both tool and command with validation, uses `resolveCapabilityConfig`, `createGoalState`, and launches via `launchCapability`. The finalize-goal capability is structurally similar but validates COMPLETED instead of checking for incomplete steps.
- **Follow `project-context.ts` for writeAllowlist** — the 7 PROJECT file paths are identical. Use the same array literal or extract if refactoring makes sense (but do NOT refactor existing project-context.ts as part of this step).
- **workingDir must be cwd**: Unlike goal-scoped capabilities (create-plan, evolve-plan) that set `workingDir` to the goal directory, finalize-goal writes to `.pio/PROJECT/*.md` which are relative to repo root. By not passing `goalName` to `resolveCapabilityConfig()`, `workingDir` defaults to `cwd`. The agent receives the goal workspace path in the initial message for reading purposes.
- **Reference prior decisions:** See `DECISIONS.md` for details on the Step 4 deviation (no `lastStepDecisions()`), writeAllowlist paths, and test file placement conventions.

## Dependencies

- **Step 3 must be complete** — `src/prompts/finalize-goal.md` must exist (referenced by CAPABILITY_CONFIG.prompt)
- **Step 1 must be complete** — `src/skills/pio-project-knowledge/SKILL.md` must exist (referenced by the finalize-goal prompt for update rules)
- No dependency on Step 4 code changes (Step 4 was skipped)

## Files Affected

- `src/capabilities/finalize-goal.ts` — new file: complete capability module (CAPABILITY_CONFIG, tool, command, setup)

## Acceptance Criteria

- [ ] `src/capabilities/finalize-goal.ts` exists with all 4 capability parts (CAPABILITY_CONFIG, tool, command, setup)
- [ ] Tool validates COMPLETED marker exists before launching session (uses `GoalState.goalCompleted()`)
- [ ] Tool does NOT call `GoalState.lastStepDecisions()` (Step 4 was skipped — no such method exists)
- [ ] Tool returns error if goal is not complete or goal workspace doesn't exist
- [ ] Command handler validates goal name argument, same validation logic as tool
- [ ] `writeAllowlist` includes all 7 `.pio/PROJECT/*.md` files (exact paths: `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, etc.)
- [ ] `setupFinalizeGoal(pi)` registers both tool and command
- [ ] Follows established patterns: `defineTool`, TypeBox parameters, `launchCapability`, `resolveCapabilityConfig`
- [ ] Uses `createGoalState(goalDir)` for COMPLETED validation (same as evolve-plan.ts)
- [ ] `defaultInitialMessage` includes the goal workspace directory path (for agent to discover DECISIONS.md)
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **writeAllowlist path resolution:** The 7 PROJECT files are relative to `cwd`, not a goal workspace. Ensure `resolveCapabilityConfig` receives params WITHOUT `goalName` so that `workingDir` resolves to `cwd`. If `goalName` is passed, workingDir becomes the goal directory and `.pio/PROJECT/*.md` paths would be wrong (relative to goal dir instead of repo root).
- **DECISIONS.md may not exist:** Goals with only 1 step or no steps won't have DECISIONS.md. The tool should NOT check for this — the agent handles missing files gracefully per the prompt instructions.
- **Goal not yet complete:** If called before COMPLETED exists, return a clear error message directing the user to wait.
