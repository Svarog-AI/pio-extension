# Fix /pio-next-task capability overwrite — stale sessionParams launch wrong session type

## /pio-next-task launches wrong capability when task.params contains a stale `capability` key

When a capability session completes (e.g. create-goal), `validation.ts` auto-enqueues the next capability in the workflow chain. It propagates the current session's `sessionParams` into the queued task, which can include a `"capability"` field from the *previous* session. When `/pio-next-task` reads this file back, the stale param overwrites the correct top-level capability — launching the wrong prompt entirely.

### Reproduction

1. Run `/pio-create-plan <name>` (or any capability that auto-enqueues the next task)
2. After validation passes, a queue file is written: `.pio/session-queue/task.json`
3. The queue file contains `task.params.capability` from the previous session
4. Running `/pio-next-task` launches the *previous* capability instead of the intended next one

### Root cause — two defects

**Write side (`src/capabilities/validation.ts`, auto-enqueue in `pio_mark_complete`):**

```ts
enqueueTask(cwd, {
  capability: nextCapability,      // correct: "create-plan"
  params: { goalName, ...(config.sessionParams || {}) },  // includes stale { capability: "create-goal" }
});
```

`config.sessionParams` may contain `"capability"` from the session that was just completed. Spreading it into the next task's params pollutes the queue entry.

**Read side (`src/capabilities/next-task.ts`, line ~20):**

```ts
const config = await resolveCapabilityConfig(ctx.cwd, { capability: task.capability, ...task.params });
```

The spread order means `task.params.capability` overwrites the explicit `capability: task.capability`. The correct merge would be `{ ...task.params, capability: task.capability }` (spread first, override last) — but the deeper fix is to prevent the stale key from being written in the first place.

### Fix strategy

1. **validation.ts:** Exclude `"capability"` (and other reserved keys) when spreading `sessionParams` into the next task's params:
   ```ts
   const { capability: _, ...cleanParams } = config.sessionParams || {};
   enqueueTask(cwd, {
     capability: nextCapability,
     params: { goalName, ...cleanParams },
   });
   ```

2. **next-task.ts (defensive):** Reverse spread order so the top-level capability always wins:
   ```ts
   const config = await resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability });
   ```

### Impact

If unfixed, the auto-enqueue mechanism after validation will consistently launch the wrong session type. In a `create-goal → create-plan` flow, `/pio-next-task` would re-launch `create-goal` instead of `create-plan`, loading the wrong prompt and wrong validation rules.

## Category

bug

## Context

Relevant files:
- `src/capabilities/next-task.ts` — spread order bug at line ~20
- `src/capabilities/validation.ts` — auto-enqueue spreads sessionParams including stale capability key
- `src/utils.ts` — enqueueTask and resolveCapabilityConfig definitions

Observed behavior: After pio_mark_complete in a create-goal session, the queue file `.pio/session-queue/task.json` contained `"params": { "capability": "create-goal", ... }` while top-level was `"capability": "create-plan"`. Running /pio-next-task would resolve the wrong capability.
