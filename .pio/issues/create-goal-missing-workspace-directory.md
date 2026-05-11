# Create-goal session does not receive the goal workspace directory path

# Create-goal session does not receive the goal workspace directory path

## Problem

When a `create-goal` sub-session is launched (via `/pio-create-goal`, `/pio-goal-from-issue`, or `/pio-next-task`), the agent inside that session does not know the correct goal workspace directory. The prompt says:

> "Your first user message will tell you the goal workspace directory path... Remember this path"

But the `initialMessage` sent to the create-goal session never includes the directory path — it only contains the issue content (for `goal-from-issue`) or a generic "Created goal workspace at..." message (for plain `create-goal`). The agent must guess or ask the user, which wastes turns and can produce files in wrong directories.

## Observed behavior

1. Session launched via `goal-from-issue` → `fix-skill-loading`
2. Agent received initial message: `"Convert the following issue into a goal:\n\nIssue file: /abs/path/to/issue.md"`
3. Agent did not know the goal was `fix-skill-loading`, guessed `agent-skips-skill-loading` based on the issue name
4. Agent asked the user for the goal name (violates instructions to not ask when directory should be provided)
5. GOAL.md was written to the wrong directory, had to be moved manually

## Root cause

In [`src/capabilities/create-goal.ts`](src/capabilities/create-goal.ts), the `defaultInitialMessage` is:

```ts
defaultInitialMessage: (goalDir) => `Created goal workspace at ${goalDir}`,
```

But when launched via `goal-from-issue`, the `initialMessage` is overwritten with the issue content and never includes the directory. When launched via `create-goal` command, the `resolveCapabilityConfig` call doesn't pass `initialMessage`, so it should use the default — but verify whether this actually reaches the agent.

The fundamental issue: **the goal workspace directory path must be communicated to the create-goal session as part of the initial message or system prompt injection**, so the agent always knows where to write GOAL.md without guessing or asking.

## Expected behavior

Every `create-goal` sub-session should receive the goal workspace directory (e.g., `/home/user/project/.pio/goals/fix-skill-loading`) in its initial message or equivalent, so the agent writes GOAL.md to the correct location on first attempt without user interaction.

## Category
bug

## Category

bug

## Context

Relevant files: src/capabilities/create-goal.ts (CAPABILITY_CONFIG.defaultInitialMessage), src/capabilities/goal-from-issue.ts (initialMessage construction), src/utils.ts (resolveCapabilityConfig — where initialMessage is resolved). The create-goal prompt (src/prompts/create-goal.md) expects the first user message to contain the directory path.
