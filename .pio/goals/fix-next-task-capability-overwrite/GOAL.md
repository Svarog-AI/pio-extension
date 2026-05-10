# Fix /pio-next-task capability overwrite — nest session context to prevent param collisions

When `pio_mark_complete` auto-enqueues the next workflow task, it spreads `config.sessionParams` flat into the queued task's params. Since `sessionParams` always includes `"capability"` (set by the caller of `resolveCapabilityConfig`), this stale key collides with and overwrites the correct top-level capability when `/pio-next-task` reads the queue file back. This launches the wrong prompt, validation rules, and session entirely.

The root structural issue: session params are spread flat, so any key in sessionParams can collide with keys at the top level. The fix is to nest session context under a dedicated key instead of spreading it flat.

## Current State

### How sessionParams are created (`src/utils.ts`, `resolveCapabilityConfig`)

`resolveCapabilityConfig` accepts a flat params object (e.g., `{ capability: "create-goal", goalName: "my-feature" }`) and stores it verbatim as `sessionParams: params`. Every caller — command handlers, next-task.ts, tool execute handlers — passes `capability` as a top-level param, so it is always present in sessionParams.

### How they propagate through auto-enqueue (`src/capabilities/validation.ts`)

In the `pio_mark_complete` handler (~line 95), when validation passes:

```ts
enqueueTask(cwd, {
  capability: nextCapability,              // correct: e.g. "create-plan"
  params: { goalName, ...(config.sessionParams || {}) },  // spreads stale { capability: "create-goal", goalName } flat
});
```

This produces a queue file like:
```json
{ "capability": "create-plan", "params": { "goalName": "my-feature", "capability": "create-goal" } }
```

### How the collision manifests (`src/capabilities/next-task.ts`)

In `handleNextTask` (~line 23):

```ts
const config = await resolveCapabilityConfig(ctx.cwd, { capability: task.capability, ...task.params });
```

The spread order `{ capability: "create-plan", goalName: "...", capability: "create-goal" }` lets the second `capability` win (last key wins in object literals). The result is `resolveCapabilityConfig` receives `capability: "create-goal"` — loading the wrong capability module.

### What downstream consumers actually read from params

- **`resolveCapabilityConfig`** reads: `params.capability`, `params.goalName`, `params.initialMessage`, `params.fileCleanup`
- **Transition resolvers** (`CAPABILITY_TRANSITIONS` in `src/utils.ts`) read: `ctx.params?.stepNumber` (used by the review-code resolver)
- **`defaultInitialMessage`** callbacks read: `params?.stepNumber` (used by evolve-plan)

No consumer reads the full params object as context — only specific fields. The `capability` key in sessionParams is incidental baggage from the caller, not intentional context sharing.

### Which capabilities enqueue tasks and what params they include

| Capability | Queue file params |
|---|---|
| create-goal (tool) | `{ goalName, initialMessage? }` |
| create-plan (tool) | `{ goalName }` |
| evolve-plan (tool) | `{ goalName, stepNumber }` |
| execute-task (tool) | `{ goalName, stepNumber }` |
| validation auto-enqueue | `{ goalName, ...sessionParams }` — **includes stale `capability`** |

### Reproduction flow

1. Run `/pio-create-goal <name>` → command calls `resolveCapabilityConfig({ capability: "create-goal", goalName })`, launches session
2. Session completes, writes GOAL.md → `pio_mark_complete` passes validation
3. Auto-enqueue writes queue file with stale `capability: "create-goal"` in params
4. Run `/pio-next-task` → spread order lets `"capability": "create-goal"` win → re-launches create-goal instead of create-plan

## To-Be State

### Core fix — nest session context (`src/capabilities/validation.ts`)

Instead of spreading `config.sessionParams` flat, nest the full session context under a `_sessionContext` key. Extract fields needed at top level explicitly:

```ts
const stepNumber = typeof (config.sessionParams || {})?.stepNumber === "number"
  ? (config.sessionParams as Record<string, unknown>).stepNumber
  : undefined;

enqueueTask(cwd, {
  capability: nextCapability,
  params: {
    goalName,
    ...(stepNumber != null ? { stepNumber } : {}),
    _sessionContext: config.sessionParams,  // full context preserved, no flat collisions
  },
});
```

This produces a queue file like:
```json
{
  "capability": "create-plan",
  "params": {
    "goalName": "my-feature",
    "_sessionContext": { "capability": "create-goal", "goalName": "my-feature" }
  }
}
```

### Defensive fix — spread order (`src/capabilities/next-task.ts`)

Reverse the spread so `task.capability` always wins, regardless of what `_sessionContext` or other params contain:

```ts
const config = await resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability });
```

### Why this works

- **No key collisions:** `_sessionContext` is a single nested key. Reserved top-level keys (`capability`, `goalName`) never collide with anything inside it.
- **Backward compatible:** Downstream consumers read specific top-level fields (`goalName`, `stepNumber`). These are still present at the expected location — only the accidental baggage is moved under `_sessionContext`.
- **Context preserved:** The full previous session params are still available if a future capability needs richer cross-session context. It's just nested, not spread flat.
- **Forward propagation safe:** When `resolveCapabilityConfig` stores `params` as `sessionParams` for the next cycle, the `_sessionContext` key is harmless — it's just another param that gets nested again on the next auto-enqueue (creating a shallow history chain, not a collision).

### No changes needed in other files

- **`src/utils.ts`:** `resolveCapabilityConfig` and `enqueueTask` work correctly with nested params — they operate on the params object as an opaque container.
- **Individual capability tools:** create-goal, create-plan, evolve-plan, execute-task all enqueue tasks explicitly (not via auto-enqueue). They don't spread sessionParams flat, so they are unaffected.

### Files changed

| File | Change |
|---|---|
| `src/capabilities/validation.ts` | Nest `_sessionContext` instead of spreading sessionParams flat; extract `stepNumber` explicitly |
| `src/capabilities/next-task.ts` | Reverse spread order so `task.capability` always wins |
