# Fix stepNumber propagation in auto-enqueued tasks

When `pio_mark_complete` auto-enqueues the next workflow task after a capability session completes, `stepNumber` is either missing or incorrect for downstream capabilities. This causes `/pio-next-task` to launch sessions targeting the wrong step — generating specs, implementing, or reviewing the wrong step silently with no error signal. The fix requires correcting the `review-code → evolve-plan` transition and enforcing mandatory `stepNumber` for step-aware capabilities.

## Current State

The pio workflow auto-enqueues the next task when a capability session completes via `pio_mark_complete`. The flow is:

1. **`validation.ts`** — `markCompleteTool.execute()` calls `resolveNextCapability()` to determine the next capability, then `enqueueTask()` to write `.pio/session-queue/task-{goalName}.json`. It extracts `stepNumber` only from `config.sessionParams.stepNumber` and passes it verbatim. If `sessionParams.stepNumber` is undefined, the conditional spread skips it entirely — the enqueued task has no `stepNumber`.

2. **`utils.ts`** — `CAPABILITY_TRANSITIONS` defines happy-path transitions as plain strings or resolver callbacks:
   - `"execute-task": "review-code"` (string — passes `stepNumber` through unchanged, correct)
   - `"review-code": callback` that returns `"evolve-plan"` when APPROVED exists, or `"execute-task"` on rejection. The callback reads `ctx.params.stepNumber` but **does not increment it** for the evolve-plan path. After approving step N, evolve-plan receives `stepNumber: N` instead of `N+1`.
   - `"evolve-plan": "execute-task"` (string — passes through, correct since both target the same step)

3. **`next-task.ts`** — `launchAndCleanup()` reads the queued task and calls `resolveCapabilityConfig()` with `task.params` as-is. No validation or adjustment of `stepNumber` occurs.

4. **Step-aware capabilities** (`evolve-plan.ts`, `execute-task.ts`, `review-code.ts`) all have config callbacks that fall back to `stepNumber: 1`:
   ```ts
   const stepNumber = typeof params?.stepNumber === "number" ? params.stepNumber : 1;
   ```
   This affects validation rules, read-only files, write allowlists, and the initial message. When called via `/pio-next-task` with a missing or wrong `stepNumber`, these silently target step 1 — producing specs for the wrong folder (`S01/`), validating the wrong files, and writing to the wrong directory.

5. **Tool enqueueing is correct**: When capabilities are invoked directly (tool or command), they always call `enqueueTask()` with an explicit `stepNumber` from validation logic (e.g., `validateAndFindNextStep()` for evolve-plan/execute-task). The bug only manifests in auto-enqueued transitions after `pio_mark_complete`.

## To-Be State

### 1. Fix `review-code → evolve-plan` transition to increment stepNumber

In `utils.ts`, the `"review-code"` resolver callback should compute `stepNumber + 1` when transitioning to `evolve-plan` (approval path). The `resolveNextCapability()` function in `validation.ts` must propagate this incremented value. This requires either:
- Returning a richer result from `resolveNextCapability()` (capability name + computed params), or
- Having the callback mutate/return adjusted params alongside the capability name.

After fixing, when review-code approves step N, the enqueued evolve-plan task will have `stepNumber: N+1`.

### 2. Auto-discover stepNumber for evolve-plan via queue

When `/pio-next-task` launches an `evolve-plan` session and `stepNumber` is missing or stale from the queue, **re-run** the `validateAndFindNextStep()` logic (from `evolve-plan.ts`) to auto-discover the correct next step instead of trusting a potentially wrong queued value. This makes evolve-plan resilient even if upstream transitions produce incorrect stepNumbers. The auto-discovery should scan for the highest-numbered step folder with both TASK.md and TEST.md, then target N+1.

### 3. Enforce mandatory stepNumber for execute-task and review-code

The config callbacks in `execute-task.ts` (`resolveExecuteValidation`, `resolveExecuteReadOnlyFiles`) and `review-code.ts` (`resolveReviewValidation`, `resolveReviewReadOnlyFiles`, `resolveReviewWriteAllowlist`) should **throw an error** or return a failure when `stepNumber` is missing, instead of silently defaulting to 1. This catches bugs early with explicit error signals rather than incorrect silent behavior.

The enforcement point can be in `resolveCapabilityConfig()` (in `utils.ts`) where step-dependent callbacks are invoked — validate that `params.stepNumber` is present for capabilities that require it (`execute-task`, `review-code`). If missing, log a clear error and fail the config resolution so `/pio-next-task` surfaces the issue to the user.

### 4. Files to modify

- **`src/utils.ts`** — Update `CAPABILITY_TRANSITIONS` `"review-code"` callback; update `resolveNextCapability()` to support returning adjusted params; add stepNumber validation in `resolveCapabilityConfig()`.
- **`src/capabilities/validation.ts`** — Update the auto-enqueue logic in `markCompleteTool.execute()` to use any adjusted params from `resolveNextCapability()`.
- **`src/capabilities/next-task.ts`** — Add auto-discovery fallback for evolve-plan: if `stepNumber` is missing, scan for the next step before launching.
- **`src/capabilities/evolve-plan.ts`** — Update config callbacks to attempt auto-discovery when `stepNumber` is missing (for the queue path); keep existing behavior for direct invocations.

### Acceptance criteria

1. After review-code approves step N, `/pio-next-task` launches evolve-plan targeting step N+1.
2. If `stepNumber` is missing for `execute-task` or `review-code` in a queued task, config resolution fails with a clear error instead of silently targeting step 1.
3. If `stepNumber` is missing for `evolve-plan` in a queued task, auto-discovery runs and targets the correct next step.
4. All existing transitions (create-goal → create-plan, create-plan → evolve-plan, evolve-plan → execute-task, execute-task → review-code, review-code rejection → execute-task) continue to work correctly.
