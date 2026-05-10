# Capture conversation context in initialMessage when enqueuing sub-session tasks

When pio tools enqueue new sub-sessions, the `initialMessage` sent to the new session should carry meaningful context about what problem to solve and why. Currently most capabilities send generic template strings (`"Created goal workspace at ${goalDir}"`, `"Please explore this project..."`) that lose all conversation context from the calling agent. This forces sub-sessions to re-discover intent by reading files from scratch.

The fix has two parts: (1) make `initialMessage` a **required parameter** on all task-queuing tools so the calling agent must provide context, and (2) add an optional `summary` parameter to `pio_mark_complete` so auto-transitions carry forward what was accomplished.

## Current State

### How `initialMessage` works today

The first user message sent to a sub-session comes from `CapabilityConfig.initialMessage`. Resolution chain in `src/utils.ts` (`resolveCapabilityConfig`, line ~110):

```
params.initialMessage (if string) → config.defaultInitialMessage(workingDir, params)
```

Each capability exports `CAPABILITY_CONFIG: StaticCapabilityConfig` with a `defaultInitialMessage` function. Current messages:

| Capability | defaultInitialMessage | Accepts explicit initialMessage? |
|---|---|---|
| **create-goal** (`src/capabilities/create-goal.ts`) | `"Created goal workspace at ${goalDir}"` | Yes, optional param |
| **create-plan** (`src/capabilities/create-plan.ts`) | `"Goal workspace is at ${goalDir}. GOAL.md exists..."` | No — not in schema |
| **evolve-plan** (`src/capabilities/evolve-plan.ts`) | Step-specific: `"You are responsible for **Step N**..."` | No |
| **execute-task** (`src/capabilities/execute-task.ts`) | Step-specific: `"Read TASK.md and TEST.md..."` | No |
| **project-context** (`src/capabilities/project-context.ts`) | `"Please explore this project..."` | No |
| **goal-from-issue** (`src/capabilities/goal-from-issue.ts`) | N/A — hardcodes initialMessage referencing issue file | No (hardcoded) |

### Auto-transition context loss

When `pio_mark_complete` passes validation, `src/capabilities/validation.ts` resolves the next capability via `resolveNextCapability` and enqueues it with:

```ts
enqueueTask(cwd, {
  capability: nextCapability,
  params: { goalName, ...(config.sessionParams || {}) },
});
```

No `initialMessage` is ever set — the next session receives only the generic `defaultInitialMessage`. The completing agent's knowledge about what was done, decisions made, or edge cases encountered is lost.

### Types and interfaces

- `src/types.ts`: `CapabilityConfig.initialMessage` is optional (`string | undefined`). `StaticCapabilityConfig.defaultInitialMessage` signature: `(workingDir: string, params?: Record<string, unknown>) => string`.
- `src/utils.ts`: `SessionQueueTask` shape — `{ capability, params? }` where `params` is `Record<string, unknown>`. No explicit typing for `initialMessage`.
- `src/capabilities/session-capability.ts`: `launchCapability` sends `config.initialMessage` as a user message via `_newCtx.sendUserMessage(config.initialMessage)`.

### Command handlers

Command paths (e.g., `/pio-create-plan <name>`) call `launchCapability` directly via `resolveCapabilityConfig` — never passing `initialMessage`. They rely entirely on `defaultInitialMessage`. Per the design, commands should pass a default/generic message since they are user-initiated (no LLM conversation context to capture).

## To-Be State

### 1. All task-queuing tools require `initialMessage`

Every tool that enqueues a sub-session task must declare `initialMessage` as a **required** parameter in the TypeBox schema (change from `Type.Optional(Type.String(...))` to `Type.String(...)`):

- **`pio_create_goal`** — change existing optional `initialMessage` to required
- **`pio_create_plan`** — add required `initialMessage`
- **`pio_evolve_plan`** — add required `initialMessage`
- **`pio_execute_task`** — add required `initialMessage`
- **`pio_create_project_context`** — add required `initialMessage`

The agent calling these tools must describe: what problem the sub-session should solve, relevant context from the conversation, and any constraints or decisions already made. The TypeBox schema enforcement ensures the framework rejects calls missing this parameter.

### 2. Command handlers supply default messages

Since commands are user-initiated (no LLM caller to provide context), each command handler must supply a sensible default `initialMessage` when constructing params for `resolveCapabilityConfig`. These defaults can be identical to or improvements over existing `defaultInitialMessage` text. This ensures the code path works correctly both when called by an agent (who provides custom context) and by a user via command (who gets the generic fallback).

Affected command handlers:
- `handleCreatePlan` in `src/capabilities/create-plan.ts`
- `handleEvolvePlan` in `src/capabilities/evolve-plan.ts`
- `handleExecuteTask` in `src/capabilities/execute-task.ts`
- `handleProjectContext` in `src/capabilities/project-context.ts`
- `handleCreateGoal` in `src/capabilities/create-goal.ts` (already has the param plumbing but should ensure defaults)

### 3. `pio_mark_complete` accepts optional `summary` for auto-transitions

Add an optional `summary` parameter to `pio_mark_complete`:

```ts
parameters: Type.Object({
  summary: Type.Optional(Type.String({ description: "Optional summary of what was accomplished in this session. Used as context for the next auto-transitioned task." })),
}),
```

When validation passes and the auto-transition enqueues the next capability, use `summary` as the `initialMessage` if provided:

```ts
enqueueTask(cwd, {
  capability: nextCapability,
  params: {
    goalName,
    ...(config.sessionParams || {}),
    initialMessage: summary || defaultInitialMessageFor(nextCapability, ...),
  },
});
```

If no summary is provided, fall back to the existing `defaultInitialMessage` behavior. This gives the completing agent a way to pass context forward without making it mandatory (the agent might be in a simple step where there's nothing notable to add).

### 4. `goal-from-issue` hardcoding review

`pio_goal_from_issue` currently hardcodes `initialMessage` rather than accepting it as a parameter. Since the issue file path is the primary context, this may remain hardcoded (or be supplemented with an optional override). This is a lower priority — the hardcoded message at least references the source artifact. Decisions on this can be deferred to planning.

### Files affected

- `src/types.ts` — potentially update `SessionQueueTask` or related types if stronger typing is desired
- `src/utils.ts` — `resolveCapabilityConfig` already handles `params.initialMessage`; no changes needed unless adding stronger typing
- `src/capabilities/create-goal.ts` — make `initialMessage` required in tool schema, add default to command handler
- `src/capabilities/create-plan.ts` — add required `initialMessage` to tool schema, pass default in command handler
- `src/capabilities/evolve-plan.ts` — add required `initialMessage` to tool schema, pass default in command handler
- `src/capabilities/execute-task.ts` — add required `initialMessage` to tool schema, pass default in command handler
- `src/capabilities/project-context.ts` — add required `initialMessage` to tool schema, pass default in command handler
- `src/capabilities/validation.ts` — add optional `summary` param to `pio_mark_complete`, use it in auto-transition enqueue

### What is NOT included

- Automatic conversation summarization (no LLM-based summarization of session history)
- File reading in `defaultInitialMessage` (the next session reads files itself)
- Maximum length limits on `initialMessage` (open question, deferred to planning)
- Changes to `goal-from-issue.ts` parameter schema (deferred)
