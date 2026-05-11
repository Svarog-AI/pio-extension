# evolve-plan does not schedule the next task after pio_mark_complete

## Problem

After an evolve-plan session completes successfully and `pio_mark_complete` validates that TASK.md and TEST.md exist, the next task is not enqueued. The user sees "No validation rules configured for this session." instead of the expected "Next task enqueued: execute-task" notification.

## Expected behavior

When `pio_mark_complete` passes validation in an evolve-plan session, it should:
1. Extract the capability name (`evolve-plan`) from the session config
2. Resolve the next capability via `CAPABILITY_TRANSITIONS` → `execute-task`
3. Call `enqueueTask()` to write the execute-task queue file
4. Notify the user that the next task was enqueued

## Actual behavior

`pio_mark_complete` returns "No validation rules configured for this session." — meaning either `config.validation` or `config.workingDir` is missing from the custom entry data, so the auto-enqueue logic in `src/capabilities/validation.ts` (lines ~120-135) never runs.

## Affected files

- `src/capabilities/validation.ts` — auto-enqueue logic inside `pio_mark_complete` execute handler
- `src/capabilities/evolve-plan.ts` — command handler that overrides `config.validation` and launches the session
- `src/capabilities/session-capability.ts` — `launchCapability` writes config to custom entry; may not propagate overridden fields

## Likely root cause

The evolve-plan command handler mutates `config.validation` after calling `resolveCapabilityConfig()`, but the mutation may not be reflected in the data stored by `launchCapability()` (e.g., if the config is serialized or copied before the override takes effect). Alternatively, the custom entry data may not include all fields of `CapabilityConfig` when read back in validation.ts.

## Category

bug

## Context

Observed during evolve-plan session for goal `multi-goal-parallel-workflow`, Step 1. TASK.md and TEST.md were produced in S01/, but calling pio_mark_complete returned: "No validation rules configured for this session." No task was enqueued for the next step (execute-task).
