# Fix create-goal asking for workspace name instead of using the provided goal name

When a `create-goal` sub-session starts, the Goal Definition Assistant prompt should use the goal name that was already supplied via the `pio_create_goal` tool parameter. Instead, the current prompt instructions cause the assistant to ask the user about the workspace name, creating redundant friction in the `pio_create_goal` → `/pio-next-task` flow.

## Current State

The create-goal workflow passes the goal name through several layers:

1. **`src/capabilities/create-goal.ts`** — `pio_create_goal` accepts a `name` parameter, creates `.pio/goals/<name>/`, and enqueues a task with `params: { goalName: params.name, initialMessage }`. The command handler (`handleCreateGoal`) does the same but calls `launchCapability` directly.

2. **`src/capability-config.ts`** — `resolveCapabilityConfig` receives `params` (which includes `goalName`), passes it as `sessionParams`, and constructs `initialMessage` from `CAPABILITY_CONFIG.defaultInitialMessage(workingDir, params)` when no explicit `initialMessage` is provided. The default message for create-goal is: `"Created goal workspace at ${goalDir}"`.

3. **`src/capabilities/session-capability.ts`** — During `resources_discover`, `config.sessionParams` is stored into `enrichedSessionParams` (accessible later via `getSessionGoalName()`). The `initialMessage` is sent as the first user message via `ctx.sendUserMessage()`. During `before_agent_start`, the capability prompt (`create-goal.md`) is injected as a custom conversation message.

4. **`src/prompts/create-goal.md`** — The Setup section says: "Your first user message will tell you the goal workspace directory path. **Remember this path**." Step 1 says: "The goal name (derived from the directory) may give a hint, but do not assume — always confirm with the user." This instruction to "always confirm" combined with the generic initial message (`"Created goal workspace at /path/.pio/goals/my-goal"`) can cause the assistant to ask about the workspace/goal name rather than proceeding directly to understanding the goal's purpose.

The `goal-from-issue.ts` capability demonstrates a better pattern: it passes a descriptive `initialMessage` like `"Convert the following issue into a goal:\n\nIssue file: <path>"` which gives clear context without requiring confirmation of the workspace name.

## To-Be State

The create-goal session prompt and initial message should be updated so the assistant knows the workspace name without asking:

1. **Update `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/create-goal.ts`** — The initial message should explicitly state the goal name as a given fact, not just the directory path. For example: `"Goal workspace created: <name>\n\nWrite GOAL.md in this workspace."` This makes the goal name unambiguous and frames the assistant's role clearly from the start.

2. **Update `src/prompts/create-goal.md`** — The Setup section should instruct the assistant that the goal name is provided by the session and should not be asked for. Remove or rephrase the "always confirm with the user" language in Step 1 so the assistant derives the goal name from the initial message and proceeds to ask about the goal's purpose, scope, and requirements instead. The Setup section should clarify that if an `initialMessage` provides issue context or other specifics, the assistant should use those directly.

3. **Verify existing behavior is preserved for edge cases** — When `goal-from-issue` invokes create-goal with a custom `initialMessage`, that message still takes priority (handled by `resolveCapabilityConfig`). The fix should not break this path. When the user runs `/pio-create-goal <name>` from the TUI command, the same fix applies since both the tool and command flow through the same config resolution.

4. **Update tests** — Add or update tests in `src/capabilities/create-goal.test.ts` to verify the initial message contains the goal name and that the prompt no longer instructs asking for it. Ensure `goal-from-issue.ts` integration still works with custom initial messages.
