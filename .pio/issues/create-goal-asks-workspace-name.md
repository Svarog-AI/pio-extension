# Create goal keeps asking about workspace name instead of using the goal name parameter

## Problem

When running a `create-goal` session, the workflow repeatedly asks the user what workspace name to use. This is redundant and confusing because the goal name is already provided as a parameter to the session.

## Expected behavior

The workspace name should be taken directly from the `name` parameter passed to the `pio_create_goal` tool (which creates `.pio/goals/<name>`). The user should not need to confirm or re-enter it during the create-goal session.

## Current behavior

The create-goal session prompts the user for a workspace name, even though this information is already known from the session parameters.

## Impact

- Friction in the workflow — users must re-confirm information they just provided
- Confusion when the prompt doesn't match the name already specified
- Breaks the smooth UX of `pio_create_goal` → `/pio-next-task` flow

## Category

bug

## Context

Related to the `pio_create_goal` tool and the create-goal session prompt/system instructions. The goal name is passed as the `name` parameter when calling `pio_create_goal`, and the workspace is created at `.pio/goals/<name>`. The create-goal session prompt likely asks for the name again instead of reading it from the session context.
