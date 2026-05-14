# Elevate Transition System to State Machine Architecture

Replace the ad-hoc `CAPABILITY_TRANSITIONS` record with a proper state machine architecture: a lazy-evaluated `GoalState` object whose attributes compute on access from the filesystem, and a pure transition engine that receives state objects instead of doing I/O.

## Current State

### Transition Logic (`src/transitions.ts`)

`CAPABILITY_TRANSITIONS` is a `Record<string, string | CapabilityTransitionResolver>` mapping capability names to next-capability strings or resolver callbacks. The `review-code` resolver performs filesystem I/O directly — `fs.existsSync(rejectedPath)` and `fs.existsSync(approvedPath)` — to decide between APPROVED → evolve-plan vs REJECTED → execute-task. This mixes I/O with routing logic. The `resolveNextCapability()` function wraps both plain strings and callback results into a consistent `TransitionResult { capability, params? }`.

### Scattered State Across the Filesystem

Goal state is spread across multiple markers that capabilities read independently:

- **Step markers:** `APPROVED`, `REJECTED`, `COMPLETED`, `BLOCKED` files inside `S{NN}/` folders (created by `applyReviewDecision()` in `src/guards/validation.ts`)
- **Pending tasks:** `.pio/session-queue/task-{goalName}.json` — single-slot per-goal queue managed by `src/queues.ts` (`enqueueTask`, `readPendingTask`, `listPendingGoals`)
- **Last completed task:** `<goalDir>/LAST_TASK.json` — written by `writeLastTask()` in `src/queues.ts`
- **Step discovery:** `discoverNextStep()` in `src/fs-utils.ts` scans `S01/`, `S02/`, ... looking for folders with both `TASK.md` and `TEST.md`, returns `highestDefined + 1`
- **Review discovery:** `findMostRecentCompletedStep()` and `isStepReviewable()` in `src/capabilities/review-code.ts` scan step folders for `COMPLETED` + `SUMMARY.md` without `BLOCKED`
- **Execution readiness:** `isStepReady()` in `src/capabilities/execute-task.ts` checks `TASK.md` + `TEST.md` exist but no `COMPLETED`/`BLOCKED` marker

### No Shared State Model

Every capability that needs to know "what's the current step status" or "is there a pending task" calls its own validation functions. For example:

- `evolve-plan.ts` has `validateAndFindNextStep()` that reads PLAN.md existence, checks for root-level COMPLETED, and scans step folders
- `execute-task.ts` has `validateAndFindNextStep()` and `validateExplicitStep()` with their own filesystem scans
- `review-code.ts` has `validateStepForReview()` and `validateAndFindReviewStep()` with yet another scan pattern
- `session-capability.ts` auto-discovers stepNumber via `discoverNextStep()` during `resources_discover`

### Enriched Session Params (`src/capabilities/session-capability.ts`)

Currently, session params are enriched with `stepNumber` (auto-discovered via `discoverNextStep()`). The enriched params are stored module-level and exposed via `getSessionParams()`, `getStepNumber()`, `getSessionGoalName()`. No structured goal state is available to capability code.

### Transition Resolution (`src/guards/validation.ts`)

When `pio_mark_complete` passes validation, `resolveNextCapability()` is called from the mark-complete tool. It receives `TransitionContext { capability, workingDir, params }` and returns `TransitionResult`. The result determines which task gets enqueued next. For review-code, this happens after `applyReviewDecision()` creates APPROVED/REJECTED markers — meaning the transition reads back files it just wrote in the same call.

## To-Be State

### 1. GoalState — a lazy-evaluated view over the filesystem

A new module (e.g., `src/goal-state.ts`) defines a `GoalState` object where all attributes except `goalName` are functions that compute on access. The object is constructed once per session (given a goal directory path) but always reflects the latest filesystem state:

```typescript
interface StepStatus {
  stepNumber: number;
  folderName: string;        // "S01"
  hasTask: () => boolean;    // TASK.md exists?
  hasTest: () => boolean;    // TEST.md exists?
  hasSummary: () => boolean; // SUMMARY.md exists?
  status: () => "defined" | "implemented" | "approved" | "rejected" | "blocked" | "pending";
}

interface GoalState {
  goalName: string;                      // constant — set at construction
  hasGoal: () => boolean;                // GOAL.md exists?
  hasPlan: () => boolean;                // PLAN.md exists?
  totalPlanSteps: () => number | undefined;  // parsed from PLAN.md
  steps: () => StepStatus[];             // scans S01/, S02/, ...
  currentStepNumber: () => number | undefined;  // next step to work on
  pendingTask: () => { capability: string; params: Record<string, unknown> } | undefined;
  lastCompleted: () => { capability: string; params: Record<string, unknown>; timestamp: string } | undefined;
}
```

Only `goalName` is stored as a plain property. Everything else is a zero-argument function that reads the filesystem on demand. No internal caching — these are simple file existence checks and JSON parses. The object never becomes stale between calls because it always reads fresh state.

### 2. State Machine Module

Replace `CAPABILITY_TRANSITIONS` with a proper state machine (e.g., `src/state-machine.ts`):

- Transitions are pure functions of `(currentCapability, GoalState)` → `TransitionResult`
- No filesystem I/O inside transition logic — it receives the lazy-evaluated `GoalState` object and calls its functions
- The review-code transition calls `state.steps()[N].status()` instead of `fs.existsSync`
- A module-level API owns all transition rules in one place, replacing the plain `Record` in `src/transitions.ts`

### 3. State Construction

A `createGoalState(goalDir: string): GoalState` factory function that takes a goal workspace directory path and returns the lazy-evaluated view object. Any consumer (transition logic, capability code, validation) calls this directly with the goal dir — no wiring or injection needed.

### 4. Centralized Access Point

Replace the current module-level getters (`getSessionParams()`, `getStepNumber()`, `getSessionGoalName()`) with a single `getGoalState(): GoalState | undefined` that returns the lazy-evaluated view for the current session's goal. Any capability code can import this and call state methods — no injection or wiring needed, since state always reads fresh from disk.

### 5. Additional Opportunities (to explore during planning)

- **Transition validation at dev time:** Statically verify all transitions are reachable; detect dead states
- **Capability-state contracts:** Each capability declares which state fields it reads and produces, enabling compatibility analysis
- **Transition audit log:** Record transitions to `<goalDir>/transitions.json` for debugging workflows
- **Back-transitions:** Explicit skip, undo, or "mark blocked" transitions beyond the existing review-code → execute-task (reject) path


### Files to Create or Modify

- **New:** `src/goal-state.ts` — `GoalState` interface + `createGoalState()` factory
- **New:** `src/state-machine.ts` — State machine module replacing `CAPABILITY_TRANSITIONS`
- **Modify:** `src/transitions.ts` — Transition logic becomes pure functions operating on GoalState (may be merged into state-machine.ts)
- **Modify:** `src/capabilities/session-capability.ts` — Replace `getStepNumber()` / `getSessionParams()` with `getGoalState()`
- **Modify:** `src/guards/validation.ts` — Use GoalState instead of direct filesystem reads for transition resolution
- **Modify:** `src/capabilities/evolve-plan.ts` — Use GoalState for step discovery instead of ad-hoc scanning
- **Modify:** `src/capabilities/execute-task.ts` — Use GoalState for readiness checks
- **Modify:** `src/capabilities/review-code.ts` — Use GoalState for review eligibility

### Backwards Compatibility

The transition system must remain functional during migration. Marker files (APPROVED, REJECTED, COMPLETED, BLOCKED) and queue files continue to work as the source-of-truth on disk. The state machine is a consumption layer, not a replacement for filesystem markers (those are still written by capabilities).
