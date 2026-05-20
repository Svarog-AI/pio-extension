# Fix finalize-goal bugs

The `finalize-goal` capability has two bugs that prevent it from functioning: the goal name is missing from the initial message sent to sub-sessions, and the state machine auto-transition resolves `workingDir` to the wrong directory, breaking write access to `.pio/PROJECT/*.md` files. This goal fixes both issues so finalize-goal works correctly whether invoked manually or via automatic workflow transition.

## Current State

The `finalize-goal` capability lives in `src/capabilities/finalize-goal.ts`. It registers the `pio_finalize_goal` tool and `/pio-finalize-goal` command. `CAPABILITY_CONFIG` declares a `writeAllowlist` of 7 `.pio/PROJECT/*.md` files (relative paths) and defines `defaultInitialMessage(workingDir, params)` to construct the sub-session kickoff message.

**Bug 1 — Goal name missing from initial message:** The `defaultInitialMessage` callback builds a message using only `params.goalDir` (a raw filesystem path). It never includes the human-readable goal name. Other capabilities (`create-plan`, `evolve-plan`) include the goal name explicitly. Without it, the finalize agent cannot clearly identify which goal it is finalizing.

**Bug 2 — State machine auto-transition resolves workingDir to wrong directory:** When all plan steps complete, `transitionEvolvePlan()` in `src/state-machine.ts` (line 54) routes to `finalize-goal` with params `{ goalName }`. In `src/capability-config.ts`, `resolveCapabilityConfig()` sees `goalName` and sets `workingDir = resolveGoalDir(cwd, goalName)` — pointing to the goal workspace (`.pio/goals/<name>/`). This causes `.pio/PROJECT/OVERVIEW.md` to resolve to `.pio/goals/<name>/.pio/PROJECT/OVERVIEW.md`, which doesn't exist.

The manual invocation path was partially fixed: `finalize-goal.ts` line 96 passes `{ goalDir: result.goalDir }` in enqueue params (no `goalName`). But the automatic state machine transition still passes `{ goalName }`, so auto-enqueued finalize sessions are broken.

**Root cause:** `finalize-goal` is project-scoped (edits `.pio/PROJECT/` under repo root) but triggered from a goal-scoped context. Passing `goalName` makes `resolveCapabilityConfig()` treat it as goal-scoped and sets workingDir to the goal workspace. This pattern is unique to `finalize-goal` — no other capability has this project-vs-goal scope mismatch.

**Existing test gap:** The completion test checks only that the transition result contains `{ capability: "finalize-goal" }` without verifying params or workingDir resolution.

Relevant files:
- `src/capabilities/finalize-goal.ts` — `CAPABILITY_CONFIG`, `defaultInitialMessage`, tool and command handlers
- `src/state-machine.ts` — `transitionEvolvePlan()` returns `{ capability: "finalize-goal", params: { goalName } }` at line 54
- `src/capability-config.ts` — `resolveCapabilityConfig()` sets `workingDir` based on presence of `goalName` (line ~38)
- `src/fs-utils.ts` — `resolveGoalDir(cwd, name)` computes the goal workspace directory

## To-Be State

**Fix 1 — Goal name included in initial message:** `defaultInitialMessage` in `src/capabilities/finalize-goal.ts` will include the human-readable goal name extracted from params. The message should read something like: "Finalize the completed goal '<goalName>' at <goalDir>."

**Fix 2 — State machine transition passes correct params:** `transitionEvolvePlan()` in `src/state-machine.ts` will pass `goalDir` (not `goalName`) when routing to `finalize-goal`. Since no `goalName` is present, `resolveCapabilityConfig()` will use `cwd` as `workingDir`, keeping `.pio/PROJECT/*.md` paths relative to the project root. To compute `goalDir`, `transitionEvolvePlan` or the state machine layer will need access to `resolveGoalDir` from `src/fs-utils.ts`. The exact approach: either have the caller (e.g., `next-task.ts`) pass `goalDir` into `resolveTransition()`, or import `resolveGoalDir` directly in `state-machine.ts` and compute it from `goalName` before passing it along.

**Test update:** Tests for the state machine transition will verify that the `finalize-goal` transition params contain the correct values (not just the capability name), ensuring workingDir resolves to project root.

Both manual (`pio_finalize_goal` tool, `/pio-finalize-goal` command) and automatic (state machine auto-transition) paths will produce correctly configured sessions with proper `workingDir`, functional write allowlist, and an initial message containing the goal name.
