# Plan: Fix /pio-next-task capability overwrite

Nest session context to prevent param key collisions when auto-enqueuing the next workflow task, and add a defensive spread-order fix in next-task.

## Prerequisites

None.

## Steps

### Step 1: Nest `_sessionContext` instead of spreading `sessionParams` flat (validation.ts)

**Description:** In the `pio_mark_complete` execute handler, replace the flat spread of `config.sessionParams` with a nested `_sessionContext` key. Extract `stepNumber` explicitly at the top level so downstream consumers (`resolveCapabilityConfig`, transition resolvers) still find it where expected. This prevents the stale `capability` key inside `sessionParams` from colliding with the correct top-level `capability` set by `enqueueTask`.

Changes on lines ~107–118 of `src/capabilities/validation.ts`:
- Before auto-enqueue, extract `stepNumber` from `config.sessionParams` (if it exists and is a number)
- Pass `goalName`, optional `stepNumber`, and `_sessionContext: config.sessionParams` to `enqueueTask` instead of spreading `sessionParams` flat

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no type errors
- [ ] The queued task file no longer contains a top-level `capability` key inside `params` — the stale capability is nested under `params._sessionContext` instead
- [ ] `stepNumber` is still present at `params.stepNumber` (top-level) when it was set in the previous session

**Files affected:**
- `src/capabilities/validation.ts` — replace flat spread `{ goalName, ...(config.sessionParams || {}) }` with nested `_sessionContext`; extract `stepNumber` explicitly before enqueue

---

### Step 2: Reverse spread order so `task.capability` always wins (next-task.ts)

**Description:** In `handleNextTask`, reverse the object spread so that `task.capability` is applied last and cannot be overwritten by anything inside `task.params`. This is a defensive fix — it ensures correctness even if future code accidentally puts a `capability` key inside params again.

Change on line ~23 of `src/capabilities/next-task.ts`:
- Replace `{ capability: task.capability, ...task.params }` with `{ ...task.params, capability: task.capability }`

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no type errors
- [ ] The spread order in the `resolveCapabilityConfig` call places `capability: task.capability` after `...task.params`, guaranteeing it wins any collision

**Files affected:**
- `src/capabilities/next-task.ts` — reverse spread order in the `resolveCapabilityConfig` call inside `handleNextTask`

**Parallel with Step 1:** These two steps are independent. Step 2 can be done before, after, or simultaneously with Step 1.

## Notes

- **No test suite exists.** Acceptance criteria rely on type checking (`npm run check`) and code inspection. If a test framework is added later, the reproduction flow from GOAL.md makes an ideal integration test: create-goal → mark_complete → next-task should launch create-plan, not create-goal again.
- **Backward compatibility:** Existing queue files (if any exist with the old flat format) will still work correctly after Step 2, since the spread-order fix ensures `task.capability` always wins regardless of params contents.
- **Forward propagation:** When `resolveCapabilityConfig` stores the new params (containing `_sessionContext`) as `sessionParams` for the next cycle, the key is harmless — it just nests deeper on subsequent auto-enqueues, creating a shallow history chain with no collisions.
- **No changes needed elsewhere:** `src/utils.ts`, individual capability tools, and `session-capability.ts` all operate on params as an opaque container or read specific top-level fields that remain unchanged.
