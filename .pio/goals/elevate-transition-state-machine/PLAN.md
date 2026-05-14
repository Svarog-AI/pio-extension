# Plan: Elevate Transition System to State Machine Architecture

Replace the ad-hoc `CAPABILITY_TRANSITIONS` record and scattered filesystem scanning with a proper state machine: a lazy-evaluated `GoalState` object, pure transition functions, and centralized access — per GOAL.md.

## Prerequisites

- None. All required files (`src/transitions.ts`, `src/fs-utils.ts`, `src/capabilities/*.ts`, `src/guards/validation.ts`) already exist and are confirmed from research.

## Steps

### Step 1: Create `GoalState` interface and factory in `src/goal-state.ts`

**Description:** Introduce a new module that defines the `GoalState` type — a lazy-evaluated view over the goal workspace filesystem. Every attribute except `goalName` is a zero-argument function that reads fresh state on access (no internal caching). Export `createGoalState(goalDir: string): GoalState` as the factory.

The `GoalState` interface provides:
- `goalName: string` — constant, set at construction (derived from directory name)
- `hasGoal(): boolean` — GOAL.md exists?
- `hasPlan(): boolean` — PLAN.md exists?
- `totalPlanSteps(): number | undefined` — parsed step count from PLAN.md headings (`## Step N:` patterns)
- `steps(): StepStatus[]` — scans S01/, S02/, ... and returns status for each folder that exists. Each `StepStatus` has: `stepNumber`, `folderName`, `hasTask()`, `hasTest()`, `hasSummary()`, `status()` returning `"defined" | "implemented" | "approved" | "rejected" | "blocked" | "pending"`
- `currentStepNumber(): number | undefined` — next step to work on (highest defined step + 1, matching existing `discoverNextStep` behavior)
- `pendingTask(): { capability: string; params: Record<string, unknown> } | undefined` — reads `.pio/session-queue/task-{goalName}.json`
- `lastCompleted(): { capability: string; params: Record<string, unknown>; timestamp: string } | undefined` — reads `<goalDir>/LAST_TASK.json`

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `createGoalState(goalDir)` returns a `GoalState` object where all methods execute without throwing on an empty goal directory (no step folders)
- [ ] `steps()` correctly identifies status from marker files: COMPLETED → "implemented", APPROVED → "approved", REJECTED → "rejected", BLOCKED → "blocked"
- [ ] `totalPlanSteps()` parses step count from a PLAN.md containing `## Step 1:`, `## Step 2:`, etc.
- [ ] All filesystem reads use `node:fs` (sync operations, consistent with existing project patterns)

**Files affected:**
- `src/goal-state.ts` — new file: `GoalState` interface, `StepStatus` interface, `createGoalState()` factory

---

### Step 2: Create state machine module in `src/state-machine.ts`, replace `src/transitions.ts`

**Description:** Replace the ad-hoc `CAPABILITY_TRANSITIONS` record with a proper state machine module. Transitions are pure functions of `(currentCapability, GoalState)` → `TransitionResult`. No filesystem I/O inside transition logic — all I/O is delegated to the lazy-evaluated `GoalState` object.

The new module exports:
- `resolveTransition(capability: string, state: GoalState): TransitionResult | undefined` — pure function looking up and executing transition rules
- Transition rules for: create-goal → create-plan, create-plan → evolve-plan, evolve-plan → execute-task (with stepNumber), execute-task → review-code (with stepNumber), review-code → evolve-plan (approved, next step) or execute-task (rejected, same step)
- The review-code transition calls `state.steps()[N].status()` instead of `fs.existsSync` — eliminating I/O from routing logic
- `recordTransition(goalDir: string, fromCapability: string, toResult: TransitionResult): void` — writes an audit entry to `<goalDir>/transitions.json` (append-only JSON array with timestamp, from, to capability, and params)
- Re-export `TransitionContext`, `TransitionResult`, and `stepFolderName` for backward compatibility (existing tests import these)

After this step, `src/transitions.ts` is fully replaced by `src/state-machine.ts`. All imports of `resolveNextCapability` should be updated to import `resolveTransition` from the new module. The old file is removed.

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors after renaming/removing `transitions.ts`
- [ ] `resolveTransition("review-code", state)` routes correctly: approved step → evolve-plan with incremented stepNumber, rejected step → execute-task with same stepNumber, unknown → execute-task
- [ ] `recordTransition()` creates or appends to `<goalDir>/transitions.json` as a JSON array of audit entries
- [ ] All existing imports of `resolveNextCapability`, `CAPABILITY_TRANSITIONS`, and `TransitionContext` are updated to use the new module

**Files affected:**
- `src/state-machine.ts` — new file: pure transition engine + audit log
- `src/transitions.ts` — removed (replaced by state-machine.ts)
- `src/guards/validation.ts` — update import from `transitions.ts` to `state-machine.ts`
- `src/transitions.test.ts` — renamed/updated to `src/state-machine.test.ts` with tests using mock `GoalState` objects instead of real filesystem markers

---

### Step 3: Migrate capability pre-launch validation to use `GoalState`

**Description:** Replace ad-hoc filesystem scanning in three capability modules with calls to `createGoalState()`. Each capability's validation functions currently do their own `fs.existsSync` checks — they will be replaced by equivalent queries against the `GoalState` object. This keeps validation logic centralized and testable.

Specific changes per file:

- **`evolve-plan.ts`:** Replace `validateAndFindNextStep()` filesystem checks with `state.hasPlan()`, `state.currentStepNumber()`. Remove direct use of `discoverNextStep()` (behavior preserved via `GoalState`).
- **`execute-task.ts`:** Replace `isStepReady()`, `validateAndFindNextStep()`, and `validateExplicitStep()` filesystem checks with `state.steps()[N].hasTask()`, `state.steps()[N].hasTest()`, `state.steps()[N].status()`.
- **`review-code.ts`:** Replace `isStepReviewable()`, `findMostRecentCompletedStep()`, `validateStepForReview()`, and `validateAndFindReviewStep()` filesystem checks with `state.steps()[N].status()` (checking for "implemented" status).

The functions remain exported with the same signatures — only internal implementation changes from raw `fs` calls to `GoalState` queries. This maintains backward compatibility for any callers (tests, other modules).

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `evolve-plan.ts` validation functions produce identical results as before when given the same filesystem state (verified by existing tests in `src/capabilities/evolve-plan.test.ts`)
- [ ] `execute-task.ts` `isStepReady()` returns true only when step has TASK.md + TEST.md but no COMPLETED/BLOCKED — verified via existing behavior
- [ ] `review-code.ts` `isStepReviewable()` and `findMostRecentCompletedStep()` return identical results — verified via existing behavior
- [ ] No capability directly imports `node:fs` for goal-state checks (all filesystem queries go through `GoalState`)

**Files affected:**
- `src/capabilities/evolve-plan.ts` — replace ad-hoc scanning with `createGoalState()` calls
- `src/capabilities/execute-task.ts` — replace ad-hoc scanning with `createGoalState()` calls
- `src/capabilities/review-code.ts` — replace ad-hoc scanning with `createGoalState()` calls

---

### Step 4: Replace session-capability getters with `getGoalState()`, migrate validation.ts mark-complete flow

**Description:** Complete the migration by replacing module-level getters in `session-capability.ts` with a single `getGoalState(): GoalState | undefined`, and updating `validation.ts` to use the new state machine for transition resolution.

Changes to `session-capability.ts`:
- Add `let currentGoalState: GoalState | undefined` as module-level state
- Populate it during `resources_discover` via `createGoalState(config.workingDir)` when inside a goal workspace
- Replace `getSessionParams()`, `getStepNumber()`, `getSessionGoalName()` with `getGoalState(): GoalState | undefined`
- Keep old getters as thin compatibility wrappers (derive from `getGoalState()`) to avoid breaking `next-task.ts` in this step — they will be removed or deprecated later

Changes to `validation.ts`:
- In the mark-complete handler, construct `GoalState` from `config.workingDir` and pass it to `resolveTransition()` instead of `resolveNextCapability()`
- After resolving a transition, call `recordTransition(goalDir, capability, result)` to write the audit entry
- Remove import of `getSessionParams`/`getStepNumber`; derive needed values from `GoalState`

Changes to `next-task.ts`:
- Update to use `getGoalState()?.goalName` instead of `getSessionGoalName()` (or keep existing call since compatibility wrappers remain)

**Acceptance criteria:**
- [ ] `npm run check` reports no type errors
- [ ] `getGoalState()` returns a valid `GoalState` during capability sub-sessions (populated in `resources_discover`)
- [ ] Mark-complete flow resolves transitions using `resolveTransition(capability, state)` instead of `resolveNextCapability(capability, ctx)`
- [ ] Successful transitions write audit entries to `<goalDir>/transitions.json`
- [ ] Old getters (`getSessionParams`, `getStepNumber`, `getSessionGoalName`) still work for backward compatibility (deriving from `getGoalState()`)
- [ ] The review-code mark-complete flow still creates APPROVED/REJECTED markers via `applyReviewDecision()` and the transition correctly routes based on the decision

**Files affected:**
- `src/capabilities/session-capability.ts` — add `getGoalState()`, keep old getters as compatibility wrappers
- `src/guards/validation.ts` — use `createGoalState()` + `resolveTransition()` + `recordTransition()`
- `src/capabilities/next-task.ts` — update to use `getGoalState()` (optional, compat wrappers suffice)

## Notes

- **Migration safety:** During the entire migration, marker files (APPROVED, REJECTED, COMPLETED, BLOCKED) and queue files remain the source-of-truth on disk. The state machine is a consumption layer only — it never writes markers itself. `applyReviewDecision()` in `validation.ts` continues to write APPROVED/REJECTED markers as before.
- **Step ordering:** Steps 1 and 2 are sequential (state-machine depends on goal-state). Step 3 depends on step 1 but is independent of step 2 (capabilities use GoalState, not the state machine yet). Step 4 depends on both steps 1 and 2. In practice, execute sequentially for safety.
- **`list-goals.ts`:** Not modified in this plan — it reads across multiple goals, while `GoalState` is per-goal. Its `inferPhase()` function could be migrated in a future goal if desired.
- **Test strategy:** Existing tests verify filesystem-based behavior. Step 2 tests should mock `GoalState` objects (no real filesystem) to prove transitions are pure. Steps 3 and 4 can leverage existing tests that create real temp directories — the external behavior shouldn't change.
- **Additional opportunities deferred:** Transition validation at dev time, capability-state contracts, and back-transitions (skip/undo/mark-blocked) are out of scope. These should be separate goals per user decision.
