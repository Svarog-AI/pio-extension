# review-code is not called after execute-task; goes directly to evolve-plan

## Problem

`CAPABILITY_TRANSITIONS` in `utils.ts` routes `execute-task` directly to `evolve-plan`, completely skipping the `review-code` step:

```ts
export const CAPABILITY_TRANSITIONS: Record<string, string | CapabilityTransitionResolver> = {
  "create-goal": "create-plan",
  "create-plan": "evolve-plan",
  "evolve-plan": "execute-task",
  "execute-task": "evolve-plan",   // ← should go through review-code first
  "review-code": (ctx): string => { ... },
};
```

After `execute-task` completes and calls `pio_mark_complete`, the auto-enqueued next task is always `evolve-plan`. The `review-code` capability exists as a fully functional tool and command, but it's never invoked in the automatic workflow — the only way to trigger it is manually via `/pio-review-code`.

## Expected behavior

The happy-path transition should be:
```
execute-task → review-code → (if approved) evolve-plan → execute-task → ...
                                  ↓ (if rejected)
                              execute-task (re-run same step)
```

`review-code` already has a resolver callback that checks for the `APPROVED` marker file to decide between `evolve-plan` and `execute-task`. The missing link is simply wiring `execute-task` → `review-code`.

## Affected files

- **`src/utils.ts`** — `CAPABILITY_TRANSITIONS`: change `"execute-task": "evolve-plan"` to `"execute-task": "review-code"`

## Category

bug

## Category

bug

## Context

File: src/utils.ts, CAPABILITY_TRANSITIONS record. The review-code capability is fully implemented in src/capabilities/review-code.ts but never reached via auto-enqueue.
