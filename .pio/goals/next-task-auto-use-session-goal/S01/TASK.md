# Task: Read session pio-config to auto-resolve goal name in handleNextTask

Insert a new case into `handleNextTask` so that when `/pio-next-task` is invoked without arguments from a capability sub-session, it automatically uses the session's `goalName` instead of scanning all pending goals.

## Context

When `pio_mark_complete` enqueues the next task from within a capability sub-session (e.g., after `execute-task` or `create-plan`), the session already knows which goal it belongs to — stored in `sessionParams.goalName` inside `pio-config`. Currently, `handleNextTask` never reads this; it always scans `.pio/session-queue/` via `listPendingGoals()`, prompting the user when multiple goals are pending. This is unnecessary friction when the user is already working within a specific goal context.

## What to Build

Two small changes across two files:

1. **Add `getSessionGoalName()` to `session-capability.ts`** — a new public getter alongside `getSessionParams()` and `getStepNumber()`.
2. **Insert a new Case 2 into `handleNextTask`** — uses `getSessionGoalName()` before falling back to scanning all pending goals.

### Code Components

#### 1. New public getter: `getSessionGoalName()` in `session-capability.ts`

Add alongside the existing `getSessionParams()` and `getStepNumber()`. Reads from the same module-level state (`enrichedSessionParams`) and returns the goal name or `undefined`:

```typescript
/**
 * Return the goalName string from enriched session params.
 * Returns a string when inside a capability sub-session with a known goal, or undefined otherwise.
 */
export function getSessionGoalName(): string | undefined {
  const params = getSessionParams();
  return typeof params?.goalName === "string" ? params.goalName : undefined;
}
```

- Placed in `session-capability.ts` because it already owns the public getters for enriched session params (`getSessionParams`, `getStepNumber`). Same module-level state, same access pattern.

#### 2. New Case 2 inside `handleNextTask` in `next-task.ts`

Import `getSessionGoalName` and insert the new case between existing Case 1 (explicit arg) and Case 2/3 (scan all):

```
// Case 1: explicit arg (unchanged)
if (args && args.trim()) { ... }

// NEW Case 2: no arg, but session has goalName
const sessionGoalName = getSessionGoalName();
if (sessionGoalName) {
    const task = readPendingTask(ctx.cwd, sessionGoalName);
    if (!task) { ctx.ui.notify("No pending task for goal..."); return; }
    await launchAndCleanup(ctx, dir, sessionGoalName, task);
    return;
}

// Case 3: no arg, no session goalName — scan all (unchanged)
const pendingGoals = listPendingGoals(ctx.cwd);
```

### Approach and Decisions

- **Add `getSessionGoalName()` to `session-capability.ts`** — keeps session-param readers centralized. Avoids scattering type-guard logic across capability handlers.
- **Type guard with `typeof === "string"`** — `sessionParams` is typed as `Record<string, unknown>`, so runtime type checking is required. Matches how `resolveCapabilityConfig` in `utils.ts` handles `params.goalName`.
- **Keep changes minimal and localized** — one new function in `session-capability.ts`, one conditional block + import in `next-task.ts`. No refactoring of unrelated code.
- **Preserve backward compatibility** — explicit arg (Case 1) unchanged. Scan-and-prompt fallback triggers only when `getSessionGoalName()` returns `undefined`.

## Dependencies

None. This is Step 1 and does not depend on any earlier steps.

## Files Affected

- `src/capabilities/session-capability.ts` — add `getSessionGoalName()` alongside existing public getters
- `src/capabilities/next-task.ts` — import `getSessionGoalName`, insert new Case 2 in `handleNextTask`

## Acceptance Criteria

- [ ] `npm run check` (`npx tsc --noEmit`) reports no type errors
- [ ] When invoked without args from a session with `goalName` in session params, the command reads that goal name and launches its pending task directly (no scanning of `listPendingGoals`)
- [ ] When invoked without args from a session with no `goalName` (e.g. parent session), the command falls back to scanning all pending goals (existing behavior preserved)
- [ ] When invoked with an explicit goal arg, behavior is unchanged (explicit arg still takes priority)

## Risks and Edge Cases

- **`getSessionParams()` returns `undefined`** — can happen in a non-capability session or if `resources_discover` hasn't run yet. The type guard handles this gracefully via optional chaining (`params?.goalName`).
- **`goalName` exists but no task is queued** — `readPendingTask` returns `undefined`. Display notification ("No pending task for goal X") and return, matching existing Case 1 behavior.
- **Session has `goalName` as a non-string value** — e.g., `goalName: 123`. The `typeof === "string"` guard must reject this and fall through to scanning.
- **Explicit arg still takes priority over session goalName** — Case 1 runs first; if an explicit arg is provided, the new Case 2 is never reached.
