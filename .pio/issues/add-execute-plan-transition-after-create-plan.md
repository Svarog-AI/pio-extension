# Add execute-plan as a valid optional transition after create-plan, with user override mechanism for all transitions

## Problem

After `create-plan` completes and writes `PLAN.md`, the only automatic transition is to `evolve-plan` (step-by-step TDD). There's no path to `execute-plan` — which implements all steps from PLAN.md in a single session. Users must manually type `/pio-execute-plan`; it never appears as an auto-enqueued option.

### Why this matters

`execute-plan` requires exactly the same preconditions as `evolve-plan` (GOAL.md + PLAN.md), yet only `evolve-plan` is wired into the transition graph. Users who want bulk implementation instead of step-by-step TDD have no automatic way to reach it.

### What we need

1. **Make `execute-plan` an optional transition after `create-plan`.** When planning completes, the user should be able to choose:
   - `evolve-plan` → step-by-step TDD workflow (keep as default)
   - `execute-plan` → single-session implementation of all steps
   
2. **Provide a mechanism for users to override default transitions.** This is not specific to execute-plan — the broader capability transition system (`CAPABILITY_TRANSITIONS` in `utils.ts`) should be overridable by users so they can customize flows (skip steps, reorder, insert custom capabilities).

## Blockers

- `execute-plan` is **command-only** (no tool). The auto-enqueue system in `validation.ts` uses `enqueueTask` which produces queue files consumed by `/pio-next-task`. For execute-plan to be reachable via auto-transition, it needs a tool form.

## Possible approaches for user overrides

### Approach A: Transition config file

A JSON file (e.g., `.pio/config.json`) that declares custom transitions:

```json
{
  "transitions": {
    "create-plan": "execute-plan"
  }
}
```

`resolveNextCapability` checks this and applies overrides before falling back to defaults.

### Approach B: Multi-option transitions with user choice

When a capability has multiple valid next steps, `pio_mark_complete` presents a choice message instead of auto-enqueueing a single task. User types the command they want.

### Approach C: Goal-level config

A `.pio/goals/<name>/CONFIG.json` that specifies transitions for specific goals (some goals → step-by-step, others → bulk).

## Scope

- If no override exists, current hardcoded defaults remain unchanged (backward compatible)
- The transition resolution logic in `src/utils.ts` (`CAPABILITY_TRANSITIONS`, `resolveNextCapability`) is the integration point
- Auto-enqueue happens in `validation.ts` (`pio_mark_complete` → `resolveNextCapability` → `enqueueTask`)

## Files involved

- `src/utils.ts` — `CAPABILITY_TRANSITIONS`, `resolveNextCapability`
- `src/capabilities/validation.ts` — auto-enqueue logic in `pio_mark_complete`
- `src/capabilities/execute-plan.ts` — needs tool form to become enqueuable (currently command-only)

## Related issues

- `state-machine-transitions.md` — broader vision for a proper state machine with user overrides (this issue is the concrete execute-plan requirement within that vision)

## Category

improvement

## Context

CAPABILITY_TRANSITIONS in utils.ts: create-plan → evolve-plan (hardcoded). execute-plan exists as command-only (/pio-execute-plan) with no tool form, so it can never be auto-enqueued. Related: state-machine-transitions.md covers the general override mechanism vision.
