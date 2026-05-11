# Evolve CAPABILITY_TRANSITIONS into a state machine with default paths + user overrides

## Problem

`CAPABILITY_TRANSITIONS` in `src/utils.ts` is currently a hardcoded map that determines which capability runs next after each one completes. There's no way for the user to customize the flow — the path is always:

```
create-goal → create-plan → evolve-plan → execute-task → (evolve-plan | review-code) → ...
```

This doesn't allow workflows like: skip planning, run multiple reviews, jump between goals, or insert custom steps.

## Vision

Transform the transition map into a proper state machine concept with two layers:

1. **Default transitions** — the current hardcoded paths serve as the baseline (what's in `src/utils.ts` today).
2. **User overrides** — per-project or per-goal configuration that lets the user change what happens next after any capability.

## User story

The user should be able to override the default flow with a simple command, e.g.:

- `/pio-override-transition create-plan evolve-plan` — "After `create-plan`, go directly to `evolve-plan` instead of whatever the default is."
- Or a config file approach: define overrides in `.pio/config.json` or similar.

We can decide on the exact command name and UX during goal creation and planning. The key requirement: it should be simple to use, discoverable, and reversible.

## Considerations

- Overrides should be scoped (per-project default vs. per-goal override).
- There should be a way to reset/inspect current overrides.
- The state machine should validate that transitions make sense (e.g., warn if transitioning to a capability that expects files that don't exist yet).
- `CAPABILITY_TRANSITIONS` in `src/utils.ts` becomes the default layer; overrides are layered on top at resolution time.

## Files involved

- `src/utils.ts` — contains `CAPABILITY_TRANSITIONS`, `resolveNextCapability`, `TransitionContext`
- `src/capabilities/next-task.ts` — consumes transitions to decide what to run next
- Potentially new files: config schema, override storage, override command implementation


## Category

idea

## Context

Current hardcoded transitions in `src/utils.ts`: create-goal → create-plan → evolve-plan → execute-task → (evolve-plan | review-code conditional). The `resolveNextCapability` function is called to determine what runs next. The state machine should preserve backward compatibility — defaults stay the same, overrides are opt-in.
