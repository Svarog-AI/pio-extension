# Fix stepNumber missing in execute-task queue params

When `pio_mark_complete` auto-enqueues the next workflow task (e.g., evolve-plan → execute-task), `stepNumber` ends up nested inside `_sessionContext` instead of at the top level of the enqueued task params. This causes `/pio-next-task` to fail with `Error: stepNumber is required for execute-task` because `resolveCapabilityConfig` reads `params.stepNumber` (undefined) instead of `params._sessionContext.stepNumber`.

## Current State

The auto-enqueue flow in `pio_mark_complete` (`src/capabilities/validation.ts`, line ~115):

1. **validation.ts** extracts `stepNumber` from `config.sessionParams.stepNumber` and passes it to `resolveNextCapability()`:
   ```ts
   const result = capability
     ? resolveNextCapability(capability, { capability, workingDir: dir, params: { goalName, stepNumber, _sessionContext: sessionParams } })
     : undefined;
   ```

2. **utils.ts** — `resolveNextCapability()` invokes transition resolvers from `CAPABILITY_TRANSITIONS`. For step-aware transitions (evolve-plan, execute-task, review-code), the resolver returns a `TransitionResult` with `params` containing `{ goalName, stepNumber }`:
   - evolve-plan → `{ capability: "execute-task", params: { goalName, stepNumber } }`
   - execute-task → `{ capability: "review-code", params: { goalName, stepNumber } }`
   - review-code → `{ capability: "evolve-plan" | "execute-task", params: { goalName, stepNumber (+1 on approval) } }`

3. **validation.ts** then enqueues using the adjusted params:
   ```ts
   const adjustedParams = result.params || {};
   enqueueTask(cwd, goalName, {
     capability: result.capability,
     params: {
       goalName,
       ...adjustedParams,           // should spread stepNumber at top level
       _sessionContext: sessionParams,
     },
   });
   ```

4. **next-task.ts** (line ~66) reads the queued task and resolves config:
   ```ts
   const config = await resolveCapabilityConfig(ctx.cwd, { ...task.params, capability: task.capability });
   ```

5. **utils.ts** — `resolveCapabilityConfig()` reads `params.stepNumber` to derive session name and invoke step-dependent config callbacks. When undefined, the callbacks in `execute-task.ts` (line 18) throw: `"stepNumber is required for execute-task."`

The bug manifests as `stepNumber` being buried inside `_sessionContext` rather than at top level of params. This can occur when `adjustedParams` doesn't include it (e.g., a transition returning a plain string instead of a `TransitionResult`), or when the nesting compounds across multiple transition cycles — LAST_TASK.json shows deeply nested `_sessionContext` (3 levels) confirming this compounds.

## To-Be State

In `src/capabilities/validation.ts`, ensure `stepNumber` is always explicitly set at the top level of enqueued params:

1. **Extract and enforce stepNumber at enqueue time:** After resolving the next capability, extract `stepNumber` from both the transition result's adjusted params AND from `_sessionContext` as a fallback. Always write it to the top level of the enqueued task params.

2. **Spread order guarantee:** The explicit `stepNumber` spread must be positioned so it cannot be shadowed by `_sessionContext`. This means either spreading it after all other properties, or assigning it explicitly:
   ```ts
   enqueueTask(cwd, goalName, {
     capability: result.capability,
     params: {
       goalName,
       ...adjustedParams,
       _sessionContext: sessionParams,
       ...(stepNumber != null ? { stepNumber } : {}),  // explicit top-level guarantee
     },
   });
   ```

3. **Files to modify:**
   - **`src/capabilities/validation.ts`** — Fix the `enqueueTask` call in `markCompleteTool.execute()` to guarantee `stepNumber` at top level of params (line ~115-125).

### Acceptance criteria

1. After evolve-plan completes, `pio_mark_complete` enqueues execute-task with `stepNumber` at the top level of params (not only inside `_sessionContext`).
2. Running `/pio-next-task` after the auto-enqueued task successfully launches the execute-task session without the "stepNumber is required" error.
3. The fix works for all step-aware transitions: evolve-plan → execute-task, execute-task → review-code, and review-code → evolve-plan/execute-task.
