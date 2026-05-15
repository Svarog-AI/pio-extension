# Task: Create state machine module, replace transitions.ts

Replace the ad-hoc `CAPABILITY_TRANSITIONS` record with a proper state machine module whose transitions are pure functions of `(capability, GoalState)` → `TransitionResult`. All filesystem I/O is delegated to the lazy-evaluated `GoalState` from Step 1.

## Context

Currently, `src/transitions.ts` uses a `Record<string, string | CapabilityTransitionResolver>` where the `review-code` resolver performs direct `fs.existsSync()` calls inside routing logic. This mixes I/O with decision-making. Step 1 produced `GoalState` — a lazy filesystem view that encapsulates all I/O. Step 2 introduces the state machine that consumes `GoalState` to make transition decisions without touching the filesystem directly.

## What to Build

### `src/state-machine.ts` — new pure transition engine

A new module replacing `src/transitions.ts`. It exports:

#### `resolveTransition(capability: string, state: GoalState): TransitionResult | undefined`

Pure function that determines the next capability given a current capability and a `GoalState` object. No filesystem I/O — all state queries go through `state.*()` methods.

**Transition rules (must match existing behavior exactly):**

| Current capability | Next capability | Conditions |
|---|---|---|
| `create-goal` | `create-plan` | Always, preserve params as-is |
| `create-plan` | `evolve-plan` | Always, preserve params as-is |
| `evolve-plan` | `execute-task` | Pass through `goalName` and `stepNumber` from state or params |
| `execute-task` | `review-code` | Pass through `goalName` and `stepNumber` from state or params |
| `review-code` (approved) | `evolve-plan` | When step status is `"approved"` → increment stepNumber |
| `review-code` (rejected) | `execute-task` | When step status is `"rejected"` → same stepNumber |
| `review-code` (unknown) | `execute-task` | When no step found or status not recognized → same stepNumber |

For `review-code`, the function looks up the step via `state.steps()` using the stepNumber from params, calls `step.status()` to check the computed status, and routes accordingly. This replaces the `fs.existsSync(rejectedPath)` / `fs.existsSync(approvedPath)` pattern in the current code.

#### `recordTransition(goalDir: string, fromCapability: string, toResult: TransitionResult): void`

Writes an audit entry to `<goalDir>/transitions.json` as an append-only JSON array. Each entry is a plain object with: `timestamp` (ISO string), `from` (capability name), `to` (TransitionResult.capability), `params` (TransitionResult.params). If the file doesn't exist, create it with `[entry]`. If it exists, parse, push, and rewrite. Wrap in try/catch — failures are non-fatal (logged but don't throw).

#### Re-exports for backward compatibility

Re-export from the new module (so existing imports can switch to state-machine.ts seamlessly):
- `TransitionContext` (interface) — re-export as-is from old definitions
- `TransitionResult` (interface) — re-export as-is from old definitions
- `stepFolderName` — re-export from `./fs-utils`

### `src/transitions.ts` — removed

The file is deleted after all its consumers are migrated. The only production consumer is `src/guards/validation.ts`, which will be updated to import `resolveTransition` and `GoalState`-related types from the new module instead.

### `src/guards/validation.ts` — updated imports

In the `pio_mark_complete` execute handler:
- Replace `import { resolveNextCapability } from "../transitions"` with `import { resolveTransition } from "../state-machine"`
- Import `createGoalState` from `"../goal-state"`
- Before calling transition resolution, construct state via `createGoalState(dir)` (where `dir` is `config.workingDir`)
- Replace `resolveNextCapability(capability, ctx)` with `resolveTransition(capability, state)`
- After a successful transition (when `nextTask` is defined and enqueued), call `recordTransition(goalDir, capability, nextTask)` to write the audit entry

The `review-code` mark-complete flow still calls `applyReviewDecision()` first (creating APPROVED/REJECTED markers on disk). Because `GoalState` reads fresh from disk on every method call, the new state will reflect these newly-created markers when `resolveTransition` queries `state.steps()[N].status()`.

## Code Components

### Transition engine (`src/state-machine.ts`)

- **Transition rule definitions:** Internal pure functions, one per capability transition. Each receives `(capability: string, state: GoalState)` and returns `TransitionResult | undefined`.
- **`resolveTransition(capability, state)`:** Dispatcher that routes to the correct rule function based on capability name. Returns `undefined` for unknown capabilities (matching existing behavior).
- **`recordTransition(goalDir, fromCapability, toResult)`:** Audit log writer. Uses sync `node:fs` operations consistent with project patterns.

### Approach and Decisions

- **Follow existing patterns:** Use sync `node:fs` for `recordTransition()` (consistent with `transitions.ts`, `validation.ts`, `queues.ts`). ESM imports with `.ts` extension omitted.
- **Pure transition functions:** The review-code transition calls `state.steps()` to find the matching step by `stepNumber`, then `step.status()` to determine routing. No direct file reads — complete delegation to `GoalState`.
- **Backward-compatible types:** Re-export `TransitionContext`, `TransitionResult` from the new module so any test files or other modules can switch imports without changing type references.
- **Audit log is append-only and non-fatal:** `recordTransition` wraps all I/O in try/catch. Failures are logged with `console.warn` but never throw. This prevents audit logging from breaking the workflow.
- **No behavior changes to transition logic:** The routing decisions must produce identical results as the current `resolveNextCapability`. Step 2 is a structural refactor, not a behavior change.

## Dependencies

- **Step 1 (completed):** Requires `GoalState` interface and `createGoalState()` factory from `src/goal-state.ts`. The review-code transition depends on `state.steps()[N].status()` returning correct values.

## Files Affected

- `src/state-machine.ts` — created: pure transition engine + audit log (`resolveTransition`, `recordTransition`, type re-exports)
- `src/transitions.ts` — deleted (fully replaced by `src/state-machine.ts`)
- `src/guards/validation.ts` — modified: import from `state-machine.ts`, construct `GoalState` in mark-complete, call `recordTransition`
- `src/transitions.test.ts` — renamed and rewritten as `src/state-machine.test.ts`: tests use mock `GoalState` objects instead of real filesystem markers

## Acceptance Criteria

- [ ] `npm run check` reports no type errors after removing `transitions.ts`
- [ ] `npm test` passes (all existing + new tests)
- [ ] `resolveTransition("review-code", state)` routes correctly with mock state: approved step → evolve-plan with incremented stepNumber, rejected step → execute-task with same stepNumber
- [ ] `recordTransition()` creates `<goalDir>/transitions.json` as a JSON array; subsequent calls append to the array
- [ ] The only production import of anything from `./transitions` is removed — all imports updated to `./state-machine`
- [ ] `src/transitions.ts` no longer exists (deleted)
- [ ] `src/state-machine.test.ts` tests transitions using mock `GoalState` objects (no real filesystem I/O in transition tests)

## Risks and Edge Cases

- **Marker timing:** After `applyReviewDecision()` writes APPROVED/REJECTED, the new markers must be visible to `GoalState` immediately. Since `GoalState` uses sync reads with no caching, this is guaranteed — but verify the order: `applyReviewDecision` → `createGoalState(dir)` → `resolveTransition(capability, state)`.
- **Queue directory for audit log:** `<goalDir>/transitions.json` goes in the goal workspace root (e.g., `.pio/goals/my-feature/transitions.json`), not in the step folder. Ensure the directory exists before writing.
- **Malformed transitions.json:** If `transitions.json` contains invalid JSON, `recordTransition` should handle gracefully (catch and either recreate or skip). Don't crash the workflow over a corrupted audit log.
- **Backward compatibility of types:** Tests in other files might import types from `./transitions`. Ensure the state-machine module re-exports all needed types, or update those imports as part of this step.
