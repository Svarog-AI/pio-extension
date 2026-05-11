# stepNumber not passed to execute-task when auto-enqueued from pio_mark_complete

The evolve-plan → execute-task transition fails with `Error: stepNumber is required for execute-task` when the task is auto-enqueued via `pio_mark_complete` and later launched via `/pio-next-task`.

It could also be that we were on the final step, and something went wrong with processing that case.

## Error

```
Error: stepNumber is required for execute-task. Ensure the task was enqueued with a valid step number.
    at Object.resolveExecuteValidation [as validation] (src/capabilities/execute-task.ts:18:11)
    at resolveCapabilityConfig (src/utils.ts:263:10)
    at launchAndCleanup (src/capabilities/next-task.ts:66:20)
```

## Root cause

The enqueued task JSON has `stepNumber` buried inside `_sessionContext` but not at the top level of `params`:

```json
{
  "capability": "execute-task",
  "params": {
    "goalName": "...",
    "_sessionContext": {
      "goalName": "...",
      "stepNumber": 1,
      ...
    }
  }
}
```

When `next-task.ts` calls `resolveCapabilityConfig(cwd, { ...task.params, capability: task.capability })`, it spreads `task.params` — so `goalName` is at top level but `stepNumber` is nested inside `_sessionContext.stepNumber`. The config resolver reads `params.stepNumber` (undefined) instead of `params._sessionContext.stepNumber` (1).

## Trace

1. **evolve-plan enqueues execute-task** (`src/capabilities/validation.ts`, `pio_mark_complete` handler):
   ```ts
   enqueueTask(cwd, goalName, {
     capability: result.capability, // "execute-task"
     params: {
       goalName,
       ...adjustedParams,           // { goalName, stepNumber } from transition resolver
       _sessionContext: sessionParams,  // overwrites stepNumber nesting
     },
   });
   ```
   The spread of `_sessionContext: sessionParams` may overwrite or shadow the top-level `stepNumber` from `adjustedParams`.

2. **`/pio-next-task` launches** (`src/capabilities/next-task.ts`):
   ```ts
   const config = await resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability });
   ```
   This spreads `task.params`, which has `goalName` at top level but `stepNumber` nested under `_sessionContext`.

3. **Config resolver** (`src/utils.ts`) reads `params.stepNumber` → undefined → throws in `execute-task.ts:18`.

## Fix

In `validation.ts`, ensure `stepNumber` is explicitly set at the top level of the enqueued params, not buried inside `_sessionContext`:

```ts
enqueueTask(cwd, goalName, {
  capability: result.capability,
  params: {
    goalName,
    ...(stepNumber != null ? { stepNumber } : {}),
    ...adjustedParams,
    _sessionContext: sessionParams,
  },
});
```

The explicit `stepNumber` spread must come *after* `_sessionContext` to take precedence, or be extracted from the nested context if missing.

## Reproduction

1. Run `/pio-evolve-plan <goal>` — completes successfully, TASK.md + TEST.md written
2. `pio_mark_complete` validates and auto-enqueues execute-task
3. Run `/pio-next-task` — fails with "stepNumber is required" error


## Category

bug

## Context

Files involved:
- `src/capabilities/validation.ts` — pio_mark_complete tool (line ~115, enqueueTask call)
- `src/capabilities/next-task.ts` — launchAndCleanup (line ~66, resolveCapabilityConfig call)
- `src/utils.ts` — resolveCapabilityConfig reads params.stepNumber, CAPABILITY_TRANSITIONS evolve-plan resolver returns { goalName, stepNumber } in adjustedParams
- `src/capabilities/execute-task.ts:18` — throws when stepNumber is undefined

The LAST_TASK.json for the affected goal shows deeply nested _sessionContext (3 levels), confirming the nesting problem compounds across transitions.
