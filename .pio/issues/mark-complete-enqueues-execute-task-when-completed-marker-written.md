# pio_mark_complete enqueues execute-task when evolve-plan writes COMPLETED marker

## Problem

When the Specification Writer agent detects that all plan steps are already specified (no matching step in PLAN.md), it writes an empty `COMPLETED` file at the goal workspace root and calls `pio_mark_complete`. However, `pio_mark_complete` unconditionally auto-enqueues the next capability via `resolveNextCapability("evolve-plan", ctx)`, which returns `"execute-task"` — even though there is no task to execute.

## Expected behavior

When evolve-plan completes via the `COMPLETED` marker path (all steps already specified), no further task should be enqueued. The evolve-plan workflow is done.

## Root cause

In `src/capabilities/validation.ts`, `pio_mark_complete` calls `resolveNextCapability(capability, ...)` whenever validation passes and a capability is configured. The `CAPABILITY_TRANSITIONS["evolve-plan"]` resolver in `src/utils.ts` (line 299) always returns either `"execute-task"` with the current `stepNumber`, or a plain `"execute-task"` when no stepNumber is present. There's no branch for the "all steps complete" scenario.

## Suggested fix options

1. **Check for COMPLETED marker in validation.ts:** Before calling `resolveNextCapability`, check if the `COMPLETED` file exists at the goal workspace root and skip auto-enqueuing if it does.
2. **Pass allStepsComplete through params:** Have evolve-plan set `allStepsComplete: true` in session params, and have either `validation.ts` or `resolveNextCapability` return `undefined` (no next task) when this flag is set.
3. **Add a COMPLETED-aware branch to CAPABILITY_TRANSITIONS["evolve-plan"]:** Check if COMPLETED marker exists inside the transition resolver itself.

Option 2 aligns best with how `allStepsComplete` already flows through evolve-plan config callbacks (`resolveEvolveWriteAllowlist`, `resolveEvolveValidation`). The fix would involve carrying it into session params so `pio_mark_complete` can detect it.

## Files involved

- `src/capabilities/validation.ts` — `pio_mark_complete` auto-enqueue logic (line ~118)
- `src/capabilities/evolve-plan.ts` — sets `allStepsComplete` in config callbacks but may not persist it to session params
- `src/utils.ts` — `CAPABILITY_TRANSITIONS["evolve-plan"]` (line 299), `resolveNextCapability` (line 336)

## Category

bug

## Context

Observed when running pio_evolve_plan on goal fix-evolve-plan-planned-allowlist which had only Step 1 in PLAN.md. Specification Writer wrote COMPLETED and called pio_mark_complete, which reported "Next task enqueued: execute-task" — incorrect since no step exists to execute.
