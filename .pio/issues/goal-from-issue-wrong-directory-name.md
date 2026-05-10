# pio_goal_from_issue creates goal workspace with issue slug instead of provided name

## Problem

When `pio_goal_from_issue` is called with an explicit `name` parameter, the created goal workspace directory does not match the given name. Instead, it uses the issue file's slug as the directory name.

## Reproduction

1. Call `pio_goal_from_issue` with `name: "fix-evolve-plan-step-skipping"` and `issuePath: "evolve-plan-skips-completed-steps.md"`
2. The create-goal session starts, expecting to write `GOAL.md` to `.pio/goals/fix-evolve-plan-step-skipping/`
3. But the session is actually configured for `.pio/goals/evolve-plan-skips-completed-steps/` — derived from the issue filename, not the `name` parameter
4. Two directories are created: the correct one (empty) and the wrong one (with no content since the agent was pointed at the wrong path)

## Impact

- Goal workspace is created with an unexpected name
- The create-goal agent receives a directory path that doesn't match what was requested
- Manual intervention required to clean up the orphaned directory and re-run

## Expected behavior

The `name` parameter should determine the goal workspace directory. The issue file is just input context for the session — it should never influence the output directory name.

## Files to investigate

- Likely in `pio_goal_from_issue` implementation (may be part of the pi framework itself, not this extension)
- Check how the tool constructs the session queue entry and passes the goal name to the create-goal capability

## Category

bug

## Context

Observed during conversion of issue `.pio/issues/evolve-plan-skips-completed-steps.md` into goal. Called with `name: "fix-evolve-plan-step-skipping"` but session target was `.pio/goals/evolve-plan-skips-completed-steps/`. Two orphaned directories exist: `fix-evolve-plan-step-skipping` (correct name, empty) and `evolve-plan-skips-completed-steps` (wrong name, also empty).
