# pio_mark_complete returns no terminate: true, causing agent loop when no validation rules configured

## Problem

When `pio_mark_complete` is called and there are no validation rules configured (or validation passes), the tool returns a successful result but **does not include `terminate: true`** in the result. This means the pi agent loop does not stop — it gets another turn from the LLM, which is instructed to call `pio_mark_complete`, creating an infinite loop.

## Evidence

In `pi-agent-core/dist/agent-loop.js`, the tool batch termination check is:

```js
function shouldTerminateToolBatch(finalizedCalls) {
    return finalizedCalls.length > 0 && finalizedCalls.every((finalized) => finalized.result.terminate === true);
}
```

When `terminate` is `true` on all tool results in a batch, the agent loop sets `hasMoreToolCalls = false`, checks for follow-up/steering messages, and if none exist, breaks out of the loop → emits `agent_end`.

Currently `pio_mark_complete` always returns:
```js
return { content: [{ type: "text", text: "..." }], details: {} };
```

The `terminate` field is never set. Without it, the agent continues looping.

## Fix

In `src/capabilities/validation.ts`, add `terminate: true` to all successful `pio_mark_complete` results (both the "no validation rules" and "validation passed" paths):

```js
return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {}, terminate: true };
```

and

```js
return { content: [{ type: "text", text: `Validation passed. All expected outputs have been produced.${notification}` }], details: {}, terminate: true };
```

The failure path ("validation failed") should NOT set `terminate: true` — the agent needs to continue and fix things.

## Impact

Affects all capability sessions (create-goal, create-plan, evolve-plan, execute-task, etc.) when validation rules are not configured or pass immediately. The agent will loop indefinitely calling `pio_mark_complete` until hit by some external limit.


## Category

bug

## Context

File: src/capabilities/validation.ts (markCompleteTool.execute). See pi-agent-core agent-loop.js line 193 for shouldTerminateToolBatch. The AgentToolResult type from @earendil-works/pi-agent-core includes an optional `terminate?: boolean` field that controls whether the agent loop continues after tool execution.
