# Task: Extract `src/queues.ts` + update dependent tests

Extract the session queue subsystem from `src/utils.ts` into a new module `src/queues.ts`. This handles all file operations on `.pio/session-queue/` for per-goal task slot management — directory creation, enqueueing tasks, reading pending tasks, listing goals with pending tasks, and writing completed task records.

## Context

`src/utils.ts` still contains multiple subsystems mixed together. Step 1 extracted the transition system into `src/transitions.ts`. This step (Step 2) extracts the session queue subsystem — a coherent group of functions managing `.pio/session-queue/` file I/O. The re-export strategy preserves backward compatibility: after extraction, `utils.ts` re-exports queue symbols so that un-updated consumers (capability files updated in Step 6) continue to compile.

## What to Build

### Create `src/queues.ts`

A new module containing the session queue subsystem extracted verbatim from `src/utils.ts`. This file should contain:

#### Type
- `SessionQueueTask` — interface with `capability: string` and optional `params?: Record<string, unknown>` fields

#### Functions
- `queueDir(cwd: string): string` — returns path to `.pio/session-queue/`, creating it if missing (`fs.mkdirSync` with `{ recursive: true }`)
- `enqueueTask(cwd: string, goalName: string, task: SessionQueueTask): void` — writes a per-goal task file as `.pio/session-queue/task-{goalName}.json` (JSON.stringify with 2-space indentation). Overwrites existing task for the same goal.
- `readPendingTask(cwd: string, goalName: string): SessionQueueTask | undefined` — reads and parses `task-{goalName}.json`, returns `undefined` if file doesn't exist
- `listPendingGoals(cwd: string): string[]` — scans `.pio/session-queue/` for files matching `task-*.json`, extracts goal names by stripping the `task-` prefix and `.json` suffix. Returns empty array if queue dir doesn't exist or is empty.
- `writeLastTask(goalDir: string, task: SessionQueueTask): void` — writes completed task record to `<goalDir>/LAST_TASK.json`

#### Import requirements
- `node:fs` (for all file operations)
- `node:path` (for path construction)

All symbols must be `export`ed. The implementation should be an exact copy of the queue logic from `src/utils.ts` — no behavioral changes, just extraction.

### Update `src/utils.ts` to re-export from `./queues`

Remove the extracted queue symbols from `src/utils.ts` and replace with re-exports:

```typescript
export {
  queueDir,
  enqueueTask,
  readPendingTask,
  listPendingGoals,
  writeLastTask,
} from "./queues";
export type { SessionQueueTask } from "./queues";
```

Remove the original `SessionQueueTask` interface definition, the `queueDir`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, and `writeLastTask` function definitions. Leave all other code in `utils.ts` unchanged (fs-utils, capability-config sections remain).

### Create `__tests__/queues.test.ts`

Move the queue-related test `describe` blocks from `__tests__/utils.test.ts` into a new dedicated test file. This follows the established pattern: each extracted module gets its own test file (`transition.test.ts`, `capability-config.test.ts`, `step-discovery.test.ts`). The queue tests are self-contained — they use their own `beforeEach`/`afterEach` temp dirs and don't depend on any other describe blocks.

The new file imports from `../src/queues`:

```typescript
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  queueDir,
  enqueueTask,
  readPendingTask,
  listPendingGoals,
  writeLastTask,
  type SessionQueueTask,
} from "../src/queues";
```

Move the following `describe` blocks as-is (copy exact test code):
- `describe("queueDir(cwd)")` — 3 tests
- `describe("enqueueTask(cwd, goalName, task)")` — 4 tests
- `describe("readPendingTask(cwd, goalName)")` — 3 tests
- `describe("listPendingGoals(cwd)")` — 4 tests
- `describe("writeLastTask(goalDir, task)")` — 2 tests

Total: 16 tests moved. The shared temp-dir helpers (`createTempDir`, `cleanup`) should be re-defined locally in the new file since they're already duplicated per-describe-block and don't need sharing across files.

### Update `__tests__/utils.test.ts` imports

Remove the queue symbols from the import in `utils.test.ts` and remove the 5 queue-related `describe` blocks (now living in `queues.test.ts`). The remaining import should be:

**After (queue symbols removed):**
```typescript
import {
  resolveGoalDir,
  goalExists,
  findIssuePath,
  readIssue,
  deriveSessionName,
  stepFolderName,
  discoverNextStep,
} from "../src/utils";
```

The shared helpers `createTempDir`, `cleanup`, `createGoalTree`, and `createIssueFiles` stay in `utils.test.ts` — they're still used by the remaining describe blocks.

## Code Components

| Component | Location | Description |
|-----------|----------|-------------|
| `SessionQueueTask` | `src/queues.ts` | Interface — minimal task descriptor for JSON serialization |
| `queueDir()` | `src/queues.ts` | Returns `.pio/session-queue/` path, creates directory if missing |
| `enqueueTask()` | `src/queues.ts` | Writes per-goal task file as JSON (overwrites existing) |
| `readPendingTask()` | `src/queues.ts` | Reads and parses per-goal task file |
| `listPendingGoals()` | `src/queues.ts` | Scans queue dir, extracts goal names from `task-*.json` pattern |
| `writeLastTask()` | `src/queues.ts` | Writes completed task record to `<goalDir>/LAST_TASK.json` |

## Approach and Decisions

- **Exact copy extraction:** Copy the queue-related code from `src/utils.ts` verbatim into `src/queues.ts`. Do not modify logic, variable names, or structure. The refactoring is purely structural.
- **Re-export for backward compat:** After extraction, `src/utils.ts` re-exports the queue symbols using the pattern `export { named } from "./queues"` for values and `export type { T } from "./queues"` for types. This ensures capability files still compile until Step 6 updates their imports.
- **Follow existing import patterns:** Use bare specifiers with `.ts` extension omitted, consistent with the rest of the codebase.
- **Dedicated test file:** Create `__tests__/queues.test.ts` following the established pattern (`transition.test.ts`, `capability-config.test.ts`). Move queue tests out of `utils.test.ts` so each module owns its own test file.
- **No circular dependencies:** `queues.ts` depends only on `node:fs` and `node:path`. No internal pio dependencies.

## Dependencies

- Step 1 must be completed (transition system extracted). The re-export from Step 1 ensures that any code still importing transition symbols from `utils.ts` continues to work during this step.

## Files Affected

- `src/queues.ts` — created: session queue file operations (SessionQueueTask, queueDir, enqueueTask, readPendingTask, listPendingGoals, writeLastTask)
- `__tests__/queues.test.ts` — created: 16 tests moved from `utils.test.ts`, importing from `../src/queues`
- `src/utils.ts` — modified: remove extracted queue symbols, add re-exports from `./queues`; all other code unchanged
- `__tests__/utils.test.ts` — modified: remove queue-related describe blocks (moved to `queues.test.ts`), remove queue symbols from import

## Acceptance Criteria

- [ ] `src/queues.ts` exists with all listed symbols exported (`SessionQueueTask`, `queueDir`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`)
- [ ] `__tests__/queues.test.ts` exists with 16 tests importing from `../src/queues`
- [ ] `__tests__/queues.test.ts` tests pass (`npm test __tests__/queues.test.ts`)
- [ ] `src/utils.ts` re-exports queue symbols from `./queues` (backward-compat during migration)
- [ ] `src/utils.ts` no longer contains original definitions of queue symbols (removed, not duplicated)
- [ ] `__tests__/utils.test.ts` no longer imports queue symbols or contains queue-related describe blocks
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Missing re-export:** If a queue symbol is forgotten in the utils.ts re-export, capability files importing from `../utils` will fail type checking. Verify all 6 symbols are re-exported (5 values + 1 type).
- **Test file split — shared helpers:** The temp-dir helpers (`createTempDir`, `cleanup`) exist at the top of `utils.test.ts`. They need to be re-defined in `queues.test.ts` since the queue tests will no longer share the file. Do not try to extract them into a shared test-utils module — keep it simple, matching how `transition.test.ts` defines its own helpers.
- **Removing from utils.test.ts:** After moving the 5 queue `describe` blocks to `queues.test.ts`, ensure they are fully removed from `utils.test.ts` (no orphaned tests or duplicate imports). The remaining describe blocks in `utils.test.ts` test goal dir, issue utilities, session naming, step folder naming, and step discovery.
- **Exact copy only:** Do not modify any queue function logic during extraction. Behavioral equivalence is critical — this is purely structural refactoring.
