# /pio-next-task call to evolve-plan doesn't pass the step number; stepNumber should be mandatory for step-aware capabilities

## Problem

When `pio_mark_complete` auto-enqueues the next workflow task after a capability session completes, it passes `stepNumber` from the current session's params verbatim via `resolveNextCapability`. This works correctly in some transitions but breaks others:

### Specific bug: `execute-task` → `evolve-plan` is missing stepNumber entirely

**Real-world evidence** — actual queued task JSON after an `execute-task` session completed:
```json
{
  "capability": "evolve-plan",
  "params": {
    "goalName": "top-brands-v3-config-override",
    "_sessionContext": { ... }
  }
}
```

Notice there is **no `stepNumber` field anywhere** in the params. The `resolveNextCapability` call in `validation.ts` only extracts `stepNumber` from `sessionParams` and passes it through:
```ts
const stepNumber = typeof sessionParams.stepNumber === "number"
  ? sessionParams.stepNumber
  : undefined;
// ...
enqueueTask(cwd, goalName, {
  capability: nextCapability,
  params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
});
```

Since `sessionParams.stepNumber` is `undefined`, the conditional spread skips it entirely. The enqueued task has no `stepNumber`. When `/pio-next-task` launches this, `resolveCapabilityConfig` passes params without `stepNumber`, and all config callbacks in `evolve-plan.ts` silently fall back to `stepNumber: 1` — meaning the agent will generate specs for **step 1** regardless of which step was actually just completed.

In `CAPABILITY_TRANSITIONS` (`utils.ts`), the transition `"execute-task": "evolve-plan"` is a plain string — it doesn't even attempt to increment or adjust the step number. It just returns `"evolve-plan"`. The `resolveNextCapability` function passes `{ goalName, stepNumber }` in the context, but if `stepNumber` was never set on the source params, nothing downstream can recover it.

### Affected code paths

- **`validation.ts`** — `mark_completeTool.execute()` enqueues next task with `stepNumber` from current session params:
  ```ts
  enqueueTask(cwd, goalName, {
    capability: nextCapability,
    params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
  });
  ```

- **`utils.ts`** — `CAPABILITY_TRANSITIONS` passes step number through unchanged. The `"execute-task": "evolve-plan"` transition should increment to the next step.

- **`next-task.ts`** — `launchAndCleanup()` reads the queued task and calls `resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability })`. All params including `stepNumber` are used as-is with no validation or adjustment.

- **`evolve-plan.ts`** — Config callbacks (`resolveEvolveValidation`, `resolveEvolveWriteAllowlist`, `defaultInitialMessage`) all read `params.stepNumber` with a fallback of `1`. When called via `/pio-next-task` with a stale step number from the queue, they use that wrong value.

### Secondary issue: stepNumber should be mandatory for step-aware capabilities

Step-dependent capabilities (`evolve-plan`, `execute-task`, `review-code`) all have config callbacks that fall back to `stepNumber: 1` when `params.stepNumber` is missing or undefined:
```ts
const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : 1;
```
This silent fallback masks bugs and produces incorrect behavior — the wrong step folder is targeted, validation checks the wrong files, and the agent works on the wrong step with no error signal.

The `stepNumber` field should be required/mandatory in params for these capabilities. If it's missing, the config resolution should fail explicitly rather than silently defaulting to step 1. For `evolve-plan`, the tool can still auto-discover the next step when called directly (not via queue), but once queued, the step number must be explicit.

## Root cause

In `validation.ts`, the `mark_completeTool` extracts `stepNumber` only from the top-level `sessionParams`:
```ts
const sessionParams = config.sessionParams || {};
const stepNumber = typeof sessionParams.stepNumber === "number"
  ? sessionParams.stepNumber
  : undefined;
```

But for the `evolve-plan` → `execute-task` transition, `stepNumber` IS correctly set in params. However after `execute-task` completes, there's no code that determines which step to target next for `evolve-plan`. The transition is a plain string `"evolve-plan"` with no logic to say "after executing step N, evolve targets step N+1".

The fix needs to either:
- Pass the current step number through and let downstream auto-discover (e.g. evolve-plan scans for the next incomplete step), OR
- Have a resolver callback in `CAPABILITY_TRANSITIONS` that computes the correct step number before enqueueing.

## Suggested fixes

1. **In `CAPABILITY_TRANSITIONS`**: The `"execute-task": "evolve-plan"` transition should be a resolver callback that increments `stepNumber` by 1 (i.e., after executing step N, evolve targets step N+1).

2. **Enforce mandatory `stepNumber`**: Step-aware capabilities (`evolve-plan`, `execute-task`, `review-code`) should require `stepNumber` in params. If missing during config resolution, throw/log an error instead of silently defaulting to 1.

3. **Alternative for evolve-plan via next-task**: Consider whether `/pio-next-task` + `evolve-plan` should re-run the auto-discovery logic from `validateAndFindNextStep()` rather than trusting a stale queued `stepNumber`. This would make evolve-plan resilient even if the step number in the queue is wrong.

## Category

bug

## Context

Files involved: src/capabilities/validation.ts (mark_complete auto-enqueue), src/utils.ts (CAPABILITY_TRANSITIONS, resolveNextCapability), src/capabilities/next-task.ts (launchAndCleanup), src/capabilities/evolve-plan.ts (config callbacks), src/capabilities/execute-task.ts, src/capabilities/review-code.ts
