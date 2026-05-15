# Task: Create `GoalState` interface and factory in `src/goal-state.ts`

Introduce a new module that defines the `GoalState` type — a lazy-evaluated view over the goal workspace filesystem — and export `createGoalState(goalDir: string): GoalState` as the factory.

## Context

Currently, goal state is scattered across multiple ad-hoc filesystem scans in different capability files (`evolve-plan.ts`, `execute-task.ts`, `review-code.ts`). Each does its own `fs.existsSync` checks for marker files (COMPLETED, APPROVED, REJECTED, BLOCKED), step folders (S01/, S02/), and queue files. This creates duplication and makes the transition logic hard to reason about or test in isolation.

The GOAL.md defines a `GoalState` object as the solution: a single lazy-evaluated view where every attribute (except `goalName`) is a zero-argument function that reads fresh state on access. No internal caching — always reflects the latest filesystem state.

## What to Build

A new module `src/goal-state.ts` with two exported interfaces and one factory function:

### Code Components

#### `StepStatus` interface

Describes the computed status of a single step folder (S01/, S02/, etc.):

```typescript
interface StepStatus {
  stepNumber: number;
  folderName: string;        // "S01", "S02", etc.
  hasTask: () => boolean;    // TASK.md exists in the step folder?
  hasTest: () => boolean;    // TEST.md exists?
  hasSummary: () => boolean; // SUMMARY.md exists?
  status: () => "defined" | "implemented" | "approved" | "rejected" | "blocked" | "pending";
}
```

**Status determination logic (implement this in `status()`):**
- If APPROVED marker exists → `"approved"`
- Else if REJECTED marker exists → `"rejected"`
- Else if BLOCKED marker exists → `"blocked"`
- Else if COMPLETED marker exists → `"implemented"`
- Else if both TASK.md AND TEST.md exist → `"defined"`
- Else (step folder exists but no specs or markers) → `"pending"`

Each `StepStatus` method must read the filesystem fresh on every call — no caching.

#### `GoalState` interface

Describes the computed status of an entire goal workspace:

```typescript
interface GoalState {
  goalName: string;                              // constant — derived from dir basename
  hasGoal: () => boolean;                        // GOAL.md exists in goalDir?
  hasPlan: () => boolean;                        // PLAN.md exists?
  totalPlanSteps: () => number | undefined;      // parsed from PLAN.md "## Step N:" headings
  steps: () => StepStatus[];                     // scan S01/, S02/, ... return status for each folder found
  currentStepNumber: () => number | undefined;   // highest defined step + 1 (same as discoverNextStep)
  pendingTask: () => { capability: string; params: Record<string, unknown> } | undefined;
  lastCompleted: () => { capability: string; params: Record<string, unknown>; timestamp?: string } | undefined;
}
```

**Method semantics:**
- `goalName`: Derive from the goal directory path. Given `/repo/.pio/goals/my-feature`, return `"my-feature"`. Use `path.basename(goalDir)`.
- `hasGoal()`: Check if `<goalDir>/GOAL.md` exists.
- `hasPlan()`: Check if `<goalDir>/PLAN.md` exists.
- `totalPlanSteps()`: Read PLAN.md, scan for headings matching `## Step N:` (where N is a number). Return the highest N found, or `undefined` if PLAN.md doesn't exist or has no step headings.
- `steps()`: Scan `<goalDir>/` for directories matching pattern `S{NN}` (e.g., S01, S02, S100). For each matching folder, create a `StepStatus` object. Return the array sorted by `stepNumber`. Only include folders that actually exist on disk.
- `currentStepNumber()`: Find the highest step number where both TASK.md AND TEST.md exist (same logic as existing `discoverNextStep()` in `fs-utils.ts`). Return that number + 1, or `undefined` if no step folders found with specs. The scan should stop at the first missing folder (matching `discoverNextStep` behavior — gaps halt scanning).
- `pendingTask()`: Read `<cwd>/.pio/session-queue/task-{goalName}.json`. Parse as JSON. Return `{ capability, params }` or `undefined` if the file doesn't exist. The `cwd` is derived by walking up from `goalDir` to find `.pio/` parent (i.e., `path.dirname(path.dirname(goalDir.replace(/\/goals\/[^/]+$/, "")))` — practically, resolve the repo root as two levels above `.pio/goals/<name>`).
- `lastCompleted()`: Read `<goalDir>/LAST_TASK.json`. Parse as JSON. Return the parsed object with an optional `timestamp` field (not currently written by `writeLastTask`, return as-is from file). Return `undefined` if the file doesn't exist.

#### `createGoalState(goalDir: string): GoalState` factory

Takes a goal workspace directory path (e.g., `/repo/.pio/goals/my-feature`). Returns a `GoalState` object where all methods are closures over `goalDir`. No internal state or caching — each method reads the filesystem on every call.

### Approach and Decisions

1. **Use sync filesystem operations** (`node:fs.existsSync`, `node:fs.readFileSync`) — consistent with existing patterns in `fs-utils.ts`, `queues.ts`, `transitions.ts`.
2. **Reuse `stepFolderName()` from `./fs-utils`** for formatting step numbers as folder names (S01, S02). Import it rather than reimplementing.
3. **Derive `cwd` (repo root) from `goalDir`** for `pendingTask()`. The goal directory follows the pattern `<cwd>/.pio/goals/<name>`. Walk up from goalDir to find the parent of `.pio/`: split by `/goals/`, take the part before, then go up one more level from `.pio`.
4. **No internal caching.** Every method call reads fresh from disk. The object never becomes stale between calls.
5. **Graceful degradation:** All methods return safe defaults (`false`, `undefined`, `[]`) when files don't exist or can't be parsed. Never throw on missing files.
6. **Error handling for JSON parsing:** Wrap `JSON.parse` in try/catch for `pendingTask()` and `lastCompleted()`. Return `undefined` on parse errors.
7. **Step folder scanning:** Use a regex like `/^S(\d+)$/` to identify valid step folders when scanning `goalDir`. This is more robust than the infinite loop in `discoverNextStep()` — we scan all existing S{NN} folders regardless of gaps.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/goal-state.ts` — new file: `GoalState` interface, `StepStatus` interface, `createGoalState()` factory

## Acceptance Criteria

- [ ] `npm run check` reports no type errors
- [ ] `createGoalState(goalDir)` returns a `GoalState` object where all methods execute without throwing on an empty goal directory (no step folders)
- [ ] `steps()` correctly identifies status from marker files: COMPLETED → "implemented", APPROVED → "approved", REJECTED → "rejected", BLOCKED → "blocked"
- [ ] `totalPlanSteps()` parses step count from a PLAN.md containing `## Step 1:`, `## Step 2:`, etc.
- [ ] All filesystem reads use `node:fs` (sync operations, consistent with existing project patterns)

## Risks and Edge Cases

- **Step folder regex:** Ensure `/^S(\d+)$/` matches S01, S02, S100 but not "Steps", "Source", etc.
- **PLAN.md parsing:** Step headings might have variations (e.g., `## Step 1: Title`, `### Step 1: Title`). Match only `## Step N:` pattern as specified in PLAN.md format (used by the Planning Agent).
- **Empty goal directory:** `steps()` returns `[]`, `currentStepNumber()` returns `undefined` — don't crash.
- **Malformed JSON in queue/LAST_TASK files:** Return `undefined` instead of throwing.
- **Goal name derivation:** If goalDir is just a basename (no path separators), handle gracefully.
