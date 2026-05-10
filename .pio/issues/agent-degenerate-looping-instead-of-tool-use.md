# Agent enters degenerate loop running bash commands instead of using available pio tools

## Problem

When asked to create an issue and then convert another issue to a goal, the agent entered a degenerate loop: repeatedly running `date +%Y%m%d_%H%M%S` via bash and listing files with `ls`, instead of calling the `pio_create_issue` and `pio_goal_from_issue` tools.

## Observed behavior

The conversation showed this pattern:

1. Agent ran `bash date +%Y%m%d_%H%M%S` (no justification)
2. Agent read ask-user skill without being asked to
3. Agent explained why it didn't load skills (user didn't ask)
4. Agent ran `bash date +%Y%m%d_%H%M%S` again
5. Agent ran `ls .pio/issues/` instead of calling `pio_create_issue`
6. Repeated the loop multiple times

The agent had access to `pio_create_issue` and `pio_goal_from_issue` tools but failed to use them, opting instead for manual bash commands that produced no progress.

## Root cause hypothesis

- The agent may have been confused about which action to take first (create issue vs. convert to goal)
- No clear protocol for when multiple tasks are requested in one message
- Agent defaulted to "gather information" (date, ls) instead of executing available tools
- Possible failure to recognize `pio_*` tools as the primary mechanism for pio workflow operations

## Expected behavior

When asked to:
1. Create an issue — call `pio_create_issue` directly with parameters
2. Convert issue to goal — call `pio_goal_from_issue` directly

No bash commands or file listing should be needed; the tools handle all filesystem operations internally.

## Impact

Wastes multiple turns, confuses the user, and delays actual work. This is a UX regression when interacting with pio workflow tools.

## Category
bug


## Category

bug

## Context

Triggered during a multi-step request: "create an issue describing X, then use goal-from-issue to create a goal." Agent should execute tools directly rather than gathering unnecessary context via bash.
