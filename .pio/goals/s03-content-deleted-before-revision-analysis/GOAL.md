# Defer incomplete step folder cleanup to postExecute during revise-plan

During plan revision, `prepareSession()` in `revise-plan` deletes all non-APPROVED `S{NN}/` folders before the Plan Revision Agent can inspect them. This discards the trigger step's content — `TASK.md`, `TEST.md`, `DECISIONS.md`, and `REVISE_PLAN_NEEDED` — which the agent needs to understand why revision was triggered. Move this cleanup from `prepareSession()` (runs before the session) to `postExecute` (runs after `pio_mark_complete`).

## Current State

When a step signals `REVISE_PLAN_NEEDED`, the state machine routes to `revise-plan` via `transitionEvolvePlan()` in `src/state-machine.ts`, passing `revisionTriggerStep` in params.

Before the revise-plan session starts, `prepareSession()` in `src/capabilities/revise-plan.ts` runs mechanical cleanup:

1. Archives `PLAN.md` to `PLAN_ARCHIVE/` with a timestamped filename
2. **Deletes ALL non-APPROVED `S{NN}/` folders** — including the trigger step's folder, which has status `"defined"` or `"implemented"` but never `"approved"` at revision time
3. Attempts to clean up the `REVISE_PLAN_NEEDED` marker from the (already-deleted) trigger step folder

The lifecycle is: `prepareSession` → agent session → validation (`pio_mark_complete`) → transition routing → task enqueuing → `postExecute` → terminate. The `postExecute` hook runs after transition routing and is described as: "Applies irreversible side effects or capability-specific cleanup." Currently, the revise-plan capability defines no `postExecute` — all cleanup happens too early in `prepareSession`.

The `CapabilityConfig` type (`src/types.ts`) supports `postExecute?: PostExecuteCallback`, which receives `(goalDir, params)` and may be async. The framework calls it from `pio_mark_complete` after transition routing (see `session-capability.ts`).

As a result, the Plan Revision Agent (`src/prompts/revise-plan.md`) cannot read the trigger step's files — it must infer why revision happened solely from archived plans and `GOAL.md`.

## To-Be State

Split cleanup between `prepareSession()` and `postExecute`:

- **`prepareSession()` in `src/capabilities/revise-plan.ts`**: Keep only the operations that MUST happen before the agent session: archive `PLAN.md` to `PLAN_ARCHIVE/`. Remove the deletion of non-APPROVED step folders. The incomplete step folders (including the trigger step) remain on disk and readable during the session.
- **Add a `postExecute` hook to the revise-plan `CAPABILITY_CONFIG`**: After `pio_mark_complete` succeeds, delete all non-APPROVED `S{NN}/` folders (same logic currently in `prepareSession()` but deferred). This runs after transition routing — by then, the agent has already read everything it needs and the revised `PLAN.md` is written.
- **Read-only protection**: The existing `resolveReviseReadOnlyFiles()` already makes APPROVED step folders read-only. The incomplete step folders should remain writable (the agent may write to them during the session) but will be cleaned up after completion. No change needed here.
- **Update `src/prompts/revise-plan.md`**: Step 3 ("Identify completed steps") and Step 4 ("Research supporting context") should mention that the trigger step folder is now available for inspection — specifically `REVISE_PLAN_NEEDED`, `TASK.md`, `DECISIONS.md`, and any reviewer notes. The agent should read these to understand why revision was triggered.
- **Tests**: Add tests in `src/capabilities/revise-plan.test.ts` (or create if missing) to verify that `prepareSession()` preserves all step folders and only archives the plan, and that `postExecute` deletes non-APPROVED step folders after completion.
