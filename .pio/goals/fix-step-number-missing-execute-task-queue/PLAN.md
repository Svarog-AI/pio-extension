# Plan: Fix stepNumber missing in execute-task queue params

Ensure `stepNumber` is always present at the top level of session params and enqueued task params, by persisting enriched params in `session-capability.ts` and fixing the enqueue logic in `validation.ts`.

## Prerequisites

None.

## Steps

### Step 1: Persist and enrich session params in session-capability.ts

**Description:** During `resources_discover`, store a canonical copy of `config.sessionParams` as module-level state (`enrichedSessionParams`). Enrich with `stepNumber` when the working directory is a goal workspace: **only** if `params.stepNumber` is absent or not a valid number, call `discoverNextStep(workingDir)` to fill it in. If `params.stepNumber` was passed explicitly (e.g., from an auto-enqueued execute-task for step 3), always preserve it as-is — never overwrite with a discovered value. This ensures every capability session — regardless of how it was launched (direct command, auto-enqueue, tool) — has a complete set of params including the correct step number.

Export a getter `getSessionParams()` that returns a copy of this enriched state. Also export `getStepNumber()` as a convenience for downstream consumers needing just the step number.

This centralizes param persistence in one place (the shared launcher) so all capability sessions have reliable access to their params throughout their lifecycle. Non-step-aware capabilities (create-goal, create-plan) receive `stepNumber` but simply don't use it — no special gating needed.

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors after the change
- [ ] `getSessionParams()` is exported and importable from `session-capability.ts`
- [ ] `getStepNumber()` is exported and returns a number when working in a goal workspace, or undefined otherwise
- [ ] Code review: the `resources_discover` handler calls `discoverNextStep(workingDir)` to fill missing stepNumber before storing enriched params

**Files affected:**
- `src/capabilities/session-capability.ts` — Add module-level `enrichedSessionParams`, enrich during resources_discover, export getters

### Step 2: Fix validation.ts to read enriched params and guarantee top-level stepNumber

**Description:** In `markCompleteTool.execute()`, read session params from `getSessionParams()` instead of re-extracting inline from the custom entry. Use `getStepNumber()` from session-capability to obtain the canonical stepNumber. When enqueuing the next task, explicitly spread `stepNumber` at top level after all other properties so it cannot be shadowed by `_sessionContext`. Use the conditional spread pattern (`...(stepNumber != null ? { stepNumber } : {})`) positioned as the last property in the params object.

This guarantees that regardless of how the transition resolved (plain string fallback, TransitionResult with or without stepNumber), the enqueued task always has `stepNumber` at the top level of params. Downstream consumers (`resolveCapabilityConfig` → config callbacks in execute-task.ts, review-code.ts) will find it directly.

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors after the change
- [ ] Code review: the enqueue call spreads `stepNumber` as the last property in the params object (after `...adjustedParams` and `_sessionContext`)
- [ ] Code review: validation.ts imports and uses `getSessionParams()` / `getStepNumber()` from session-capability instead of re-extracting inline
- [ ] Manual verification: after evolve-plan completes, the queued task file (`task-{goalName}.json`) contains `stepNumber` at the top level of params, not only inside `_sessionContext`

**Files affected:**
- `src/capabilities/validation.ts` — Import getSessionParams/getStepNumber from session-capability, use enriched params in markCompleteTool.execute(), guarantee top-level stepNumber on enqueue

### Step 3: Remove discoverNextStep fallbacks from evolve-plan config callbacks

**Description:** After the fix, auto-enqueued evolve-plan tasks will always carry `stepNumber` at top level of params. The three config callbacks in evolve-plan.ts (validation, writeAllowlist, defaultInitialMessage) currently fall back to `discoverNextStep(workingDir)` when `params?.stepNumber` is undefined. Remove these fallbacks — read `stepNumber` directly from params and throw a clear error if absent (matching the existing pattern in execute-task.ts and review-code.ts).

This simplifies evolve-plan to be consistent with its sibling capabilities: all three step-aware capabilities now require stepNumber upfront and fail fast when it's missing, instead of silently auto-discovering.

**Acceptance criteria:**
- [ ] `npm run check` (tsc --noEmit) reports no errors after the change
- [ ] Code review: evolve-plan config callbacks read `stepNumber` from params directly, throwing if absent (matching execute-task.ts pattern)
- [ ] Code review: `discoverNextStep` is still imported and used by `validateAndFindNextStep` (command/tool validation) but removed from the three config callbacks

**Files affected:**
- `src/capabilities/evolve-plan.ts` — Remove discoverNextStep fallback from three config callbacks, add explicit error when stepNumber is missing

## Notes

- `discoverNextStep()` always returns a valid number (N+1 where N is the highest complete step, or 1 if none), so it's safe to call unconditionally when stepNumber is missing. Non-step-aware capabilities receive it harmlessly.
- The enrichment happens once at session startup (resources_discover) and persists for the session lifetime — no repeated filesystem scans needed during mark_complete.
- `writeLastTask` in validation.ts already handles stepNumber correctly (conditional spread), so no changes needed there beyond reading from enriched params.
- `_sessionContext` nesting issue compounds across cycles (LAST_TASK.json shows 3 levels deep). Using enriched params as the sessionContext source prevents this compounding since enriched state is a single flat object.
