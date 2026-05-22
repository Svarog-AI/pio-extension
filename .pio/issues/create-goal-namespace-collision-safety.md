# pio_create_goal should not silently overwrite existing goal workspaces on "already exists" — add safety guard

## Problem

When `pio_create_goal` is called with a name that already has an existing goal workspace, it returns an error: `"Goal workspace already exists at ..."`. This is correct behavior. However, the agent then deleted the existing goal (via `pio_delete_goal`) and re-created it — destroying all accumulated work (GOAL.md, PLAN.md, completed steps, transitions, review artifacts).

## What happened

1. Agent called `pio_create_goal` with name `subgoals`, got "already exists"
2. User said "create a new goal" (meaning: don't reuse the existing one)
3. Agent interpreted this as "delete the old one and create a new one with the same name"
4. Existing goal workspace was fully deleted via `pio_delete_goal`
5. New goal created, then agent re-read feasibility docs into it

Recovery required a manual `git checkout HEAD -- .pio/goals/subgoals/`.

## Root cause

No prompt guard on `pio_create_goal`: it doesn't surface the "already exists" conflict to the user or present options (reuse, pick a new name, delete-and-recreate). The agent has no context about why the existing goal exists or what state it's in.

## Proposed fix

- **Guard:** When `pio_create_goal` detects an existing workspace, prompt the user with: reuse existing / create with different name / delete-and-recreate
- **Safety on delete:** `pio_delete_goal` should warn if the goal has completed steps, a PLAN.md, or significant work (non-empty step folders)
- **Goal listing context:** Before suggesting deletion, surface the current state of the existing goal (phase, steps completed, last task) to inform the decision

## Category

improvement

## Context

Affected files: `src/capabilities/create-goal.ts` (needs conflict detection + prompt), `src/capabilities/delete-goal.ts` (needs safety guard), `.pio/goals/subgoals/` (was the affected workspace)
