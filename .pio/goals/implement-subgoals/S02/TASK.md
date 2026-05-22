# Task: Queue keying

Introduce hierarchical queue keys to prevent filename collisions between sibling subgoals and flat goals.

## Context

Currently, all goals use a single-slot per-goal queue file: `task-{goalName}.json`. The goal name is the basename of the goal directory (`path.basename(goalDir)`). For nested subgoals (e.g., `parent/S03/subgoals/nested`), multiple subgoals could share the same leaf name and collide on disk. This step introduces `deriveQueueKey()` to produce unique hierarchical keys, and extends queue operations to accept optional qualified names.

## What to Build

### 1. `deriveQueueKey(goalDir: string, cwd: string): string` (new, pure function in `src/queues.ts`)

A pure utility that derives a unique queue key from a goal directory path. Algorithm:

1. Strip the `<cwd>/.pio/goals/` prefix from `goalDir` to get the relative path segment after `.pio/goals/`.
2. Split the relative path by `path.sep` (or `/`).
3. Filter out any segments that equal `"subgoals"` (the directory marker used for nesting).
4. Join remaining segments with `"__"`.

**Examples:**
- Flat goal: `/repo/.pio/goals/my-feature` → strip prefix → `my-feature` → split → `["my-feature"]` → join → `"my-feature"` (identical to current behavior)
- Nested subgoal: `/repo/.pio/goals/parent/S03/subgoals/nested` → strip → `parent/S03/subgoals/nested` → filter → `["parent", "S03", "nested"]` → join → `"parent__S03__nested"`

**Backward compatibility:** Flat goals produce the exact same output as the current `goalName` basename — no migration or behavior change.

### 2. Extend `enqueueTask(cwd, goalName, task)` with optional `qualifiedName?: string`

When `qualifiedName` is provided (`!== undefined`), use it as the queue filename key instead of `goalName`:
```
task-{qualifiedName}.json   // when qualifiedName is provided
task-{goalName}.json        // when omitted (current behavior, backward compatible)
```

Use `qualifiedName !== undefined` to check (not a truthy check) — consistent with the `parentStepDir !== undefined` pattern from Step 1.

### 3. Extend `readPendingTask(cwd, goalName)` with optional `qualifiedName?: string`

Same pattern as `enqueueTask`: when `qualifiedName` is provided, construct the filename using it instead of `goalName`. When omitted, behavior is identical to current implementation.

### 4. Update `GoalState.pendingTask()` to compute qualified queue key

Currently, `pendingTask()` uses `goalName` (the basename) to construct the queue path:
```typescript
const queuePath = path.join(cwd, ".pio", "session-queue", `task-${goalName}.json`);
```

Change this to import `deriveQueueKey` from `./queues` and compute the key from `goalDir`:
```typescript
import { deriveQueueKey } from "./queues";
// ...
const queueKey = deriveQueueKey(goalDir, cwd);
const queuePath = path.join(cwd, ".pio", "session-queue", `task-${queueKey}.json`);
```

For flat goals, `deriveQueueKey` returns the same basename — behavior is identical. For nested subgoals, it returns the qualified hierarchical key, so the correct queue file is found.

### 5. Update `listPendingGoals` JSDoc

Update the return type documentation to note that returned names may contain `__` delimiters for hierarchical goals. No behavioral change required — the function already extracts whatever name is in the filename, which now includes qualified names when subgoals write their queue files.

## Code Components

| Component | Location | Type | Description |
|-----------|----------|------|-------------|
| `deriveQueueKey(goalDir, cwd)` | `src/queues.ts` | new function | Pure utility — strips `.pio/goals/`, filters `subgoals`, joins with `__` |
| `enqueueTask(cwd, goalName, task, qualifiedName?)` | `src/queues.ts` | extended signature | Optional `qualifiedName` overrides queue filename key |
| `readPendingTask(cwd, goalName, qualifiedName?)` | `src/queues.ts` | extended signature | Optional `qualifiedName` overrides queue filename key |
| `GoalState.pendingTask()` | `src/goal-state.ts` | modified implementation | Uses `deriveQueueKey(goalDir, cwd)` instead of `goalName` basename |

## Approach and Decisions

- **`deriveQueueKey` is a pure function in `src/queues.ts`** — not in `fs-utils.ts`. It's a queue-key derivation utility, closely related to `enqueueTask`/`readPendingTask`. Keeping it colocated minimizes cross-module imports.
- **Use `path.posix` for prefix stripping if needed**, or handle both POSIX and potential edge cases. The codebase already uses `node:path` and operates on real paths — `indexOf(".pio/goals/")` should work reliably since the cwd is a real directory path.
- **Backward compatibility is the primary concern:** Every existing caller of `enqueueTask`, `readPendingTask`, and `GoalState.pendingTask()` must continue to work identically for flat goals. The optional parameter pattern (`!== undefined` check) ensures this.
- **Reference DECISIONS.md decisions:** Follow the `!== undefined` guard pattern from Step 1 for the new optional parameters. `deriveQueueKey` produces keys with `__` delimiters, which will be converted to `/` by `deriveSessionName` (Step 1) for display purposes.

## Dependencies

- **Step 1 (Path resolution infrastructure):** Must be completed first. Step 1 modified `resolveGoalDir` and `deriveSessionName`, which downstream steps depend on for nested path resolution and display formatting.

## Files Affected

- `src/queues.ts` — add `deriveQueueKey()`; extend `enqueueTask` and `readPendingTask` with optional `qualifiedName` param; update `listPendingGoals` JSDoc
- `src/goal-state.ts` — import `deriveQueueKey`; `pendingTask()` computes qualified key from `goalDir` instead of using `goalName` basename
- `src/queues.test.ts` — new tests for `deriveQueueKey` and hierarchical queue keys

## Acceptance Criteria

- `npx tsc --noEmit` reports no errors
- Running existing test suite passes with no regressions
- `deriveQueueKey("/repo/.pio/goals/my-feature", "/repo")` returns `"my-feature"` (flat goal unchanged)
- `deriveQueueKey("/repo/.pio/goals/parent/S03/subgoals/nested", "/repo")` returns `"parent__S03__nested"`
- Queue file for flat goal is still `task-my-feature.json` (backward compatible)
- `enqueueTask` with no `qualifiedName` produces the same filename as before
- `readPendingTask` with no `qualifiedName` reads the same filename as before
- `GoalState.pendingTask()` for a flat goal reads from `task-{goalName}.json` (same file, same behavior)

## Risks and Edge Cases

- **Path separators on Windows:** If tested on Windows, `path.sep` is `\` but the `.pio/goals/` prefix uses `/`. The `deriveQueueKey` implementation must handle this — either normalize with `path.posix` or use a platform-agnostic approach (e.g., splitting on both `/` and `\`).
- **GoalDir without `.pio/goals/`:** If `goalDir` doesn't contain the expected prefix, `deriveQueueKey` should fall back to returning `path.basename(goalDir)` rather than crashing. This is an edge case but defensive handling prevents hard failures.
- **Empty queue keys:** If all segments after filtering are empty (highly unlikely), ensure the function returns a non-empty string.
