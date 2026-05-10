# pio-next-task launches sessions without validation config, blocking auto-enqueue of subsequent tasks

## Problem

When a capability session is launched via `/pio-next-task` (processing a queued task from `task.json`), the resulting sub-session has **no validation rules configured**. This causes `pio_mark_complete` to exit early with "No validation rules configured for this session." and **never auto-enqueues the next task** in the workflow chain.

## Root cause

In `src/capabilities/next-task.ts`, `handleNextTask` does:

```ts
const config = await resolveCapabilityConfig(ctx.cwd, { capability: task.capability, ...task.params });
await launchCapability(ctx, config);
```

`resolveCapabilityConfig()` (utils.ts) returns a `CapabilityConfig` built from the capability's `CAPABILITY_CONFIG` export. However, this base config **does not include** `validation` or `writeAllowlist` — those fields are set dynamically by each capability's command handler:

- `evolve-plan.ts` sets `config.validation = { files: [S{NN}/TASK.md, S{NN}/TEST.md] }`
- `execute-task.ts` sets `config.validation = { files: [S{NN}/SUMMARY.md] }`
- etc.

When launched via `/pio-next-task`, these command handlers are **never called**, so the config is missing validation rules entirely.

## Impact

- `pio_mark_complete` returns "No validation rules configured" — no file checking, no auto-enqueue
- The workflow chain breaks: after completing a step via pio-next-task, the user must manually launch the next capability instead of the automated transition working
- This affects ALL capabilities launched via the queue (evolve-plan, execute-task, etc.)

## Reproduction

1. Queue a task: write `{ "capability": "evolve-plan", "params": { "goalName": "my-goal", "stepNumber": 1 } }` to `.pio/session-queue/task.json`
2. Run `/pio-next-task`
3. In the sub-session, complete the work and call `pio_mark_complete`
4. Observe: "No validation rules configured for this session." — no task enqueued

## Suggested fix

After `resolveCapabilityConfig()` in `next-task.ts`, apply capability-specific validation overrides based on the capability name and params. This could be done by:

1. Adding a function like `resolveValidation(capability, params)` that returns the appropriate validation rules per capability (mirroring what each command handler does), OR
2. Storing validation requirements in `CAPABILITY_CONFIG` as defaults (with command handlers able to override), OR
3. Having `resolveCapabilityConfig` call a capability-level hook for dynamic config resolution

The cleanest approach may be option 1: add a centralized mapping or switch that resolves validation rules per capability name, using params (like stepNumber) for dynamic paths.

## Category

bug

## Context

Files involved: src/capabilities/next-task.ts (no validation set), src/utils.ts resolveCapabilityConfig (returns base config without validation), src/capabilities/evolve-plan.ts (sets validation in command handler only), src/capabilities/validation.ts pio_mark_complete (exits early when !rules)

Task was enqueued by the evolve-plan tool (which calls enqueueTask directly) and then processed by pio-next-task. The tool path bypasses the command handler's validation setup.
