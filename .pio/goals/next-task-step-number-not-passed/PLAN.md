# Plan: Fix stepNumber propagation in auto-enqueued tasks

Correct the `review-code → evolve-plan` transition to increment `stepNumber`, add auto-discovery for `evolve-plan` when `stepNumber` is missing, and enforce mandatory `stepNumber` for `execute-task` and `review-code` — ensuring `/pio-next-task` always targets the correct step.

## Prerequisites

None.

## Steps

### Step 1: Change `resolveNextCapability()` return type and fix review-code transitions

**Description:** Update `resolveNextCapability()` in `src/utils.ts` to return `{ capability: string; params?: Record<string, unknown> }` instead of a plain string. This enables transition callbacks to return adjusted parameters (e.g., incremented stepNumber) alongside the capability name.

Update the `"review-code"` callback in `CAPABILITY_TRANSITIONS`:
- **Approval path** (`APPROVED` file exists): return `{ capability: "evolve-plan", params: { goalName, stepNumber: N + 1 } }` where N is the current stepNumber from ctx.params.
- **Rejection path** (no APPROVED): return `{ capability: "execute-task", params: { goalName, stepNumber: N } }` — re-execute the same step.

The `"execute-task"` string transition also needs updating: it currently returns a bare string but now needs to return an object preserving stepNumber through unchanged. Convert all string entries in `CAPABILITY_TRANSITIONS` that involve step-aware capabilities (`"evolve-plan": "execute-task"`, `"execute-task": "review-code"`) to callbacks that return `{ capability, params }` with the current stepNumber preserved.

Also update the `TransitionContext` interface if needed (it already contains `params`). Keep `CapabilityTransitionResolver` returning `string | undefined` for backward compatibility — no other callers of this type should exist outside utils.ts.

Update `resolveNextCapability()` to return `{ capability: string; params?: Record<string, unknown> } | undefined` instead of `string | undefined`. When the transition value is a plain string (non-step-aware transitions like `"create-goal": "create-plan"`), wrap it as `{ capability: value, params: ctx.params }` so callers always get a consistent shape.

**Acceptance criteria:**
- [ ] `resolveNextCapability()` returns an object `{ capability, params? }` for all transitions (string and callback entries)
- [ ] Calling with capability `"review-code"` and params `{ stepNumber: 3 }` on approval returns `{ capability: "evolve-plan", params: { stepNumber: 4 } }`
- [ ] Calling with capability `"review-code"` and params `{ stepNumber: 3 }` on rejection returns `{ capability: "execute-task", params: { stepNumber: 3 } }`
- [ ] Non-step-aware transitions (`"create-goal": "create-plan"`, `"create-plan": "evolve-plan"`) still resolve correctly with the new return shape
- [ ] `npx tsc --noEmit` reports no type errors after changes

**Files affected:**
- `src/utils.ts` — change return type of `resolveNextCapability()`, update `CAPABILITY_TRANSITIONS` entries, update string-to-object wrapping

---

### Step 2: Add auto-discovery for evolve-plan when stepNumber is missing

**Description:** When `/pio-next-task` launches an `evolve-plan` session and `stepNumber` is missing or stale from the queue, auto-discover the correct next step instead of silently defaulting to 1.

Add a synchronous utility function to `src/utils.ts`:
```ts
function discoverNextStep(goalDir: string): number
```
This function scans `S01/`, `S02/`, … for the highest-numbered step folder that contains both `TASK.md` and `TEST.md`, then returns N+1 (or 1 if none found). The logic mirrors `validateAndFindNextStep()` in `evolve-plan.ts` but is synchronous, takes `goalDir` directly (no need to resolve from goalName), and returns a number.

Refactor the step-folder naming helper (`stepFolderName`) — it's duplicated across `evolve-plan.ts`, `execute-task.ts`, and `review-code.ts`. Extract a single copy into `src/utils.ts` and export it. Update the three capability files to import from utils instead of defining locally. (This is refactoring only — no behavioral change.)

Update the config callbacks in `evolve-plan.ts` (`resolveEvolveValidation`, `resolveEvolveWriteAllowlist`) to call `discoverNextStep(workingDir)` as a fallback when `stepNumber` is missing from params, instead of defaulting to 1. This makes the queue path resilient: if upstream transitions produce an incorrect or missing stepNumber, evolve-plan still targets the correct next step.

Update `validateAndFindNextStep()` in `evolve-plan.ts` to use the new shared `stepFolderName` from utils.ts.

**Acceptance criteria:**
- [ ] `discoverNextStep(goalDir)` correctly returns 1 when no S{NN}/ folders exist
- [ ] `discoverNextStep(goalDir)` correctly returns N+1 when S01 through S(N) all have TASK.md and TEST.md
- [ ] `stepFolderName` is imported from `utils.ts` in evolve-plan.ts, execute-task.ts, and review-code.ts (no duplicates)
- [ ] `resolveEvolveValidation()` and `resolveEvolveWriteAllowlist()` fall back to `discoverNextStep()` when stepNumber is missing
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/utils.ts` — add `discoverNextStep(goalDir: string): number`, export shared `stepFolderName(stepNumber: number): string`
- `src/capabilities/evolve-plan.ts` — import `stepFolderName` from utils, update config callbacks to use `discoverNextStep` as fallback
- `src/capabilities/execute-task.ts` — import `stepFolderName` from utils (refactoring only)
- `src/capabilities/review-code.ts` — import `stepFolderName` from utils (refactoring only)

**Parallel with Step 3** — Both steps modify utils.ts but touch different functions. Coordinate to avoid merge conflicts on the same region of the file.

---

### Step 3: Enforce mandatory stepNumber for execute-task and review-code

**Description:** The config callbacks in `execute-task.ts` and `review-code.ts` silently default to `stepNumber: 1` when the parameter is missing. This causes queued tasks to target the wrong step with no error signal. Change this behavior to throw an explicit error.

In `src/capabilities/execute-task.ts`, update `resolveExecuteValidation()` and `resolveExecuteReadOnlyFiles()` to throw `Error("stepNumber is required for execute-task. Ensure the task was enqueued with a valid step number.")` when `stepNumber` is missing from params. Also update `defaultInitialMessage` in `CAPABILITY_CONFIG` to handle this case — if stepNumber is missing, return an initial message that describes the error rather than silently targeting step 1.

In `src/capabilities/review-code.ts`, apply the same pattern to `resolveReviewValidation()`, `resolveReviewReadOnlyFiles()`, and `resolveReviewWriteAllowlist()` — throw with a clear error message mentioning `"review-code"` when stepNumber is missing. Update `defaultInitialMessage` similarly.

The error thrown from config callbacks during `resolveCapabilityConfig()` will be caught by the existing try/catch in `next-task.ts` `launchAndCleanup()`, which surfaces it to the user via `ctx.ui.notify(..., "error")`. No changes needed in next-task.ts for this behavior.

**Acceptance criteria:**
- [ ] Calling `resolveCapabilityConfig()` with capability `"execute-task"` and params missing stepNumber throws an error mentioning "execute-task"
- [ ] Calling `resolveCapabilityConfig()` with capability `"review-code"` and params missing stepNumber throws an error mentioning "review-code"
- [ ] `/pio-next-task` surfaces the error to the user via notification when stepNumber is missing for execute-task or review-code
- [ ] Existing behavior with a valid stepNumber is unchanged (no regression)
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/execute-task.ts` — update config callbacks to throw on missing stepNumber
- `src/capabilities/review-code.ts` — update config callbacks to throw on missing stepNumber

**Parallel with Step 2** — Independent changes to different files. Both modify utils.ts-adjacent code but don't overlap.

---

### Step 4: Update validation.ts to consume adjusted params from `resolveNextCapability()`

**Description:** Update the auto-enqueue logic in `markCompleteTool.execute()` (in `src/capabilities/validation.ts`) to use the adjusted params returned by `resolveNextCapability()` instead of constructing params manually. This ensures that any param adjustments made by transition callbacks (e.g., stepNumber increment for review-code → evolve-plan) are correctly propagated to the enqueued task.

Replace the current enqueue logic:
```ts
const nextCapability = resolveNextCapability(capability, { ... });
enqueueTask(cwd, goalName, {
  capability: nextCapability,
  params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
});
```

With logic that uses the returned object:
```ts
const result = resolveNextCapability(capability, { ... });
if (result) {
  const adjustedParams = result.params || {};
  enqueueTask(cwd, goalName, {
    capability: result.capability,
    params: {
      goalName,
      ...adjustedParams,
      _sessionContext: sessionParams,
    },
  });
  // ... same writeLastTask logic, updated similarly
}
```

The key difference: `adjustedParams` may contain an incremented stepNumber (from the review-code callback), and spreading it ensures it overrides any stale value from the original params. The original extraction of `stepNumber` from `config.sessionParams` is still needed for constructing the `TransitionContext`, but the enqueued task should use whatever `resolveNextCapability()` returns.

**Acceptance criteria:**
- [ ] After review-code approves step N, the enqueued task has `stepNumber: N+1` (verifiable by reading `.pio/session-queue/task-{goalName}.json`)
- [ ] After review-code rejects step N, the enqueued task has `stepNumber: N` (same step for re-execution)
- [ ] After evolve-plan completes step N, the enqueued execute-task has `stepNumber: N` (unchanged)
- [ ] After execute-task completes step N, the enqueued review-code has `stepNumber: N` (unchanged)
- [ ] Non-step-aware transitions (create-goal → create-plan, create-plan → evolve-plan) still enqueue correctly without stepNumber
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/validation.ts` — update auto-enqueue logic to use `{ capability, params }` return value from `resolveNextCapability()`

## Notes

- **Circular dependency watch:** Adding `discoverNextStep()` and `stepFolderName()` to utils.ts should not create circular imports. utils.ts currently imports only `node:fs`, `node:path`, and `./types`. The new functions will use only these same modules — no capability imports needed.
- **Step folder naming convention:** All step-aware capabilities use `S{NN}` format (zero-padded to 2 digits). The shared `stepFolderName()` function centralizes this: `` `S${String(stepNumber).padStart(2, "0")}` ``.
- **Queue file format:** Tasks are written to `.pio/session-queue/task-{goalName}.json` as JSON with `{ capability, params }`. After these changes, `params` may contain adjusted values from transition callbacks. Downstream consumers (`next-task.ts`) should always trust the queue file contents — they don't need additional validation beyond what config callbacks enforce.
- **Error handling:** When execute-task or review-code throw on missing stepNumber, the error propagates through `resolveCapabilityConfig()` → `launchAndCleanup()` in next-task.ts, where it's caught and shown to the user. This is existing error-handling infrastructure — no new error paths needed.
