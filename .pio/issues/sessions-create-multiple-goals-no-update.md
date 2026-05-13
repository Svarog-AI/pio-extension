# Sessions create multiple goals because there is no way to update existing ones

## Problem

When a pio agent session needs to modify or refine an existing goal (e.g., after receiving new requirements, clarifications, or corrections), it has no tool or command to update an existing goal. The only available action is `pio_create_goal`, which creates a brand-new goal workspace.

This leads to:
- **Duplicate goals** for the same feature/task with slightly different definitions
- **Fragmented planning** where work is split across multiple goal directories
- **Agent confusion** — no way to tell "update this existing goal" vs "create a new one"

## Current Behavior

- `pio_create_goal <name>` always creates a fresh `.pio/goals/<name>/GOAL.md` (fails if it already exists)
- No `pio_update_goal`, `pio_edit_goal`, or equivalent capability exists
- Goal definition is effectively write-once — the initial create-goal session is the only chance to define it correctly

## Expected Behavior

There should be a way to reopen or update an existing goal workspace. Possible approaches:

1. **`pio_update_goal <name>`** — Re-launches the Goal Definition Assistant for an existing goal, allowing GOAL.md (and potentially PLAN.md) to be edited
2. **`pio_create_goal --update`** — Flag on the existing tool that opens edit mode instead of create mode  
3. **General concept:** Goals are mutable artifacts that can be refined throughout the workflow, not just at creation time

## Scope

This likely needs a new capability module (e.g., `update-goal.ts`) or an extension to `create-goal.ts` that detects existing goals and enters update mode instead of failing.

## Category

improvement

## Context

Related files: src/capabilities/create-goal.ts (check goalExists guard that prevents overwriting), src/utils.ts (goalExists). Look at how create-goal handles the "already exists" case — it likely just errors out.
