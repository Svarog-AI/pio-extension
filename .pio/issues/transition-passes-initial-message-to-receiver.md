# Transition layer should pass initialMessage to receiving capability instead of receiver reading the filesystem

## Problem

The re-execution feedback channel (Step 4, `review-rejected-marker`) has `execute-task.defaultInitialMessage` read the REJECTED file from disk to detect rejection context. This is backwards — the caller state (`CAPABILITY_TRANSITIONS["review-code"]`) already knows about the rejection and should pass the context forward via params or a custom `initialMessage`.

## Current approach (Step 4 spec)

- Transition checks `REJECTED` on disk, routes to `execute-task`
- `execute-task.defaultInitialMessage` independently checks `REJECTED` on disk again
- The receiver reads the filesystem to infer caller intent

## Better approach

The transition layer is the authority on *why* a transition happened. It should encode that context:

1. **Transition sets `initialMessage` in params** — when routing to `execute-task` after rejection, pass an explicit `initialMessage` that includes the REVIEW.md reference. This goes through `resolveCapabilityConfig`, which already supports `params.initialMessage` overriding `defaultInitialMessage`.
2. **Or transition passes a flag in params** — e.g., `rejectedAfterReview: true` — and `defaultInitialMessage` branches on the flag (not the filesystem).

Either way, the caller communicates intent explicitly. The receiver never reads the filesystem to guess caller state.

## Benefits

- Single source of truth for transition intent lives where it belongs — in the transition resolver
- No double-file-read (transition checks REJECTED, then execute-task checks it again)
- Works correctly even if marker files are stale or manually modified
- Follows the principle: **state changes propagate forward via params, not backward via file reads**

## Impact on Step 4 spec

Step 4's TASK.md specifies filesystem-based detection. This should be revisited to use param-based context instead. The transition in `src/utils.ts` (`CAPABILITY_TRANSITIONS["review-code"]`) should set either:
- `params.initialMessage` with a rejection-aware message, or
- `params.rejectedAfterReview: true` for the receiver to detect

## Related

- `review-rejected-marker.md` — parent goal workspace
- `state-machine-transitions.md` — broader transition architecture
- `capture-conversation-context-in-initialMessage.md` — precedent for passing context via initialMessage

## Category

improvement

## Context

Files: `src/utils.ts` (CAPABILITY_TRANSITIONS), `src/capabilities/execute-task.ts` (defaultInitialMessage), `src/capabilities/review-code.ts`. See `.pio/goals/review-rejected-marker/S04/TASK.md` for current Step 4 spec.
