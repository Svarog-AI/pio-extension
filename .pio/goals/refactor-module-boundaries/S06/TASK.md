# Task: Update all capability files to import from new modules

After Steps 1–4 extracted `src/utils.ts` into four focused modules, and Step 5 moved infrastructure to `src/guards/`, every file in `src/capabilities/` still imports from `../utils` via the backward-compat re-exports. Step 6 updates all capability files to import directly from the correct decomposed modules, eliminating any dependency on `../utils`.

## Context

Steps 1–4 created four new modules and left `src/utils.ts` as a barrel of re-exports for backward compatibility:
- `src/transitions.ts` — transition state machine (`resolveNextCapability`, `CAPABILITY_TRANSITIONS`)
- `src/queues.ts` — session queue operations (`enqueueTask`, `queueDir`, `SessionQueueTask`, etc.)
- `src/fs-utils.ts` — filesystem helpers, issue utilities, step discovery (`resolveGoalDir`, `goalExists`, `discoverNextStep`, `stepFolderName`, `issuesDir`, `findIssuePath`, `readIssue`, `deriveSessionName`)
- `src/capability-config.ts` — dynamic capability loading (`resolveCapabilityConfig`, `StaticCapabilityConfig`)

**Important correction from PLAN.md:** Despite the plan listing `stepFolderName` under `../transitions`, Steps 1–4 actually placed `stepFolderName` in `src/fs-utils.ts`. This was confirmed by Step 5's implementation — `src/guards/validation.ts` imports it from `../fs-utils`. All capability files should follow this actual layout.

Step 6 is a mechanical import refactor: replace each `import { ... } from "../utils"` with targeted imports from the correct module. No behavioral changes.

## What to Build

Update the import statements in every file listed below. Each file currently imports from `../utils` and needs those symbols routed to the new modules. The exact mapping is specified per file.

### Code Components

#### Import Routing Map

Every capability file follows a consistent pattern: replace `import { ... } from "../utils"` with one or more imports from `../fs-utils`, `../queues`, `../transitions`, and/or `../capability-config`. The symbols themselves are unchanged — only the import paths change.

**Correct module locations (verified against actual files after Steps 1–5):**

| Symbol | Correct Module |
|--------|---------------|
| `resolveGoalDir`, `goalExists` | `../fs-utils` |
| `issuesDir`, `findIssuePath`, `readIssue` | `../fs-utils` |
| `discoverNextStep` | `../fs-utils` |
| `stepFolderName` | `../fs-utils` (NOT `../transitions`) |
| `deriveSessionName` | `../fs-utils` |
| `enqueueTask`, `queueDir`, `readPendingTask`, `listPendingGoals`, `writeLastTask` | `../queues` |
| `SessionQueueTask` | `../queues` |
| `resolveNextCapability`, `CAPABILITY_TRANSITIONS` | `../transitions` |
| `resolveCapabilityConfig`, `StaticCapabilityConfig` | `../capability-config` |

### Approach and Decisions

- **Preserve existing import style:** Each file typically uses a single combined import from `../utils`. Replace with multiple imports using the same named-import syntax. For example:

  Before:
  ```typescript
  import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, type StaticCapabilityConfig } from "../utils";
  ```

  After:
  ```typescript
  import { enqueueTask, resolveGoalDir } from "../fs-utils";
  import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
  ```

- **Follow the pattern from Step 5:** `src/guards/validation.ts` already demonstrates the correct approach — importing directly from decomposed modules instead of through `../utils`.

- **No barrel file needed:** Do not create any `index.ts` or barrel files. Each module is imported directly by path, consistent with the existing codebase convention.

- **Type imports preserved:** Use `import type { ... }` syntax only when the original file used it. Most files use inline `type` annotations in regular import statements (e.g., `import { ..., type StaticCapabilityConfig } from "../utils"`).

## Per-File Changes

### `src/capabilities/create-goal.ts`
Current: `import { enqueueTask, goalExists, resolveGoalDir, resolveCapabilityConfig, type StaticCapabilityConfig } from "../utils";`

New imports:
```typescript
import { enqueueTask, goalExists, resolveGoalDir } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/create-issue.ts`
Current: `import { issuesDir } from "../utils";`

New import:
```typescript
import { issuesDir } from "../fs-utils";
```

### `src/capabilities/create-plan.ts`
Current: `import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, type StaticCapabilityConfig } from "../utils";`

New imports:
```typescript
import { enqueueTask, resolveGoalDir } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/delete-goal.ts`
Current: `import { resolveGoalDir, goalExists } from "../utils";`

New import:
```typescript
import { resolveGoalDir, goalExists } from "../fs-utils";
```

### `src/capabilities/evolve-plan.ts`
Current: `import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, stepFolderName, discoverNextStep, type StaticCapabilityConfig } from "../utils";`

New imports:
```typescript
import { enqueueTask, resolveGoalDir, stepFolderName, discoverNextStep } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/execute-plan.ts`
Current: `import { resolveGoalDir, resolveCapabilityConfig, type StaticCapabilityConfig } from "../utils";`

New imports:
```typescript
import { resolveGoalDir } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/execute-task.ts`
Current: `import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, stepFolderName, type StaticCapabilityConfig } from "../utils";`

New imports:
```typescript
import { enqueueTask, resolveGoalDir, stepFolderName } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/goal-from-issue.ts`
Current: `import { enqueueTask, findIssuePath, goalExists, resolveGoalDir, resolveCapabilityConfig } from "../utils";`

New imports:
```typescript
import { enqueueTask, findIssuePath, goalExists, resolveGoalDir } from "../fs-utils";
import { resolveCapabilityConfig } from "../capability-config";
```

### `src/capabilities/list-goals.ts`
Current: `import { resolveGoalDir, type SessionQueueTask } from "../utils";`

New imports:
```typescript
import { resolveGoalDir } from "../fs-utils";
import type { SessionQueueTask } from "../queues";
```

### `src/capabilities/next-task.ts`
Current: `import { resolveCapabilityConfig, queueDir, readPendingTask, listPendingGoals, type SessionQueueTask } from "../utils";`

New imports:
```typescript
import { queueDir, readPendingTask, listPendingGoals, type SessionQueueTask } from "../queues";
import { resolveCapabilityConfig } from "../capability-config";
```

### `src/capabilities/project-context.ts`
Current: `import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../utils";`

New import:
```typescript
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/review-code.ts`
Current: `import { enqueueTask, resolveGoalDir, resolveCapabilityConfig, stepFolderName, type StaticCapabilityConfig } from "../utils";`

New imports:
```typescript
import { enqueueTask, resolveGoalDir, stepFolderName } from "../fs-utils";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";
```

### `src/capabilities/session-capability.ts`
Current: `import { discoverNextStep } from "../utils";`

New import:
```typescript
import { discoverNextStep } from "../fs-utils";
```

## Dependencies

- **Step 1 (transitions.ts):** Must exist for modules that depend on transition symbols
- **Step 2 (queues.ts):** Must exist for queue-related imports
- **Step 3 (fs-utils.ts):** Must exist with `stepFolderName`, `discoverNextStep`, goal/issue helpers
- **Step 4 (capability-config.ts):** Must exist for capability config resolution
- **Step 5 (guards move):** Completed — validates the import pattern works correctly

All four decomposed modules and their re-exports in `src/utils.ts` must be in place. This step is safe because backward-compat re-exports still exist in `utils.ts`; if any import is missed, TypeScript will catch it via the remaining re-exports.

## Files Affected

- `src/capabilities/create-goal.ts` — split `../utils` into `../fs-utils`, `../capability-config`
- `src/capabilities/create-issue.ts` — update: `../utils` → `../fs-utils`
- `src/capabilities/create-plan.ts` — split `../utils` into `../fs-utils`, `../capability-config`
- `src/capabilities/delete-goal.ts` — update: `../utils` → `../fs-utils`
- `src/capabilities/evolve-plan.ts` — split `../utils` into `../fs-utils`, `../capability-config` (all symbols, including `stepFolderName` and `discoverNextStep`, from `../fs-utils`)
- `src/capabilities/execute-plan.ts` — split `../utils` into `../fs-utils`, `../capability-config`
- `src/capabilities/execute-task.ts` — split `../utils` into `../fs-utils`, `../capability-config` (`stepFolderName` from `../fs-utils`)
- `src/capabilities/goal-from-issue.ts` — split `../utils` into `../fs-utils`, `../capability-config`
- `src/capabilities/list-goals.ts` — split `../utils` into `../fs-utils`, `../queues`
- `src/capabilities/next-task.ts` — split `../utils` into `../queues`, `../capability-config`
- `src/capabilities/project-context.ts` — update: `../utils` → `../capability-config`
- `src/capabilities/review-code.ts` — split `../utils` into `../fs-utils`, `../capability-config` (`stepFolderName` from `../fs-utils`)
- `src/capabilities/session-capability.ts` — update: `../utils` → `../fs-utils`

## Acceptance Criteria

- [ ] All 14 capability files + session-capability.ts import from correct new modules (no imports from `../utils`)
- [ ] `npm run check` reports no TypeScript errors
- [ ] `src/capabilities/evolve-plan.ts` imports `stepFolderName`, `discoverNextStep` from `../fs-utils`
- [ ] `src/capabilities/execute-task.ts` imports `stepFolderName` from `../fs-utils`
- [ ] `src/capabilities/review-code.ts` imports `stepFolderName` from `../fs-utils`
- [ ] No file in `src/capabilities/` contains `from "../utils"` (verified via grep)

## Risks and Edge Cases

- **`stepFolderName` location mismatch with PLAN.md:** PLAN.md lists `stepFolderName` under `../transitions`, but the actual implementation placed it in `src/fs-utils.ts`. Step 5 confirmed this — `src/guards/validation.ts` imports from `../fs-utils`. Follow the actual file layout, not the plan text.
- **No behavioral changes expected:** This is purely import path refactoring. Any runtime behavior change indicates an incorrect import (e.g., importing from a module that doesn't export the symbol).
- **TypeScript verification is sufficient:** Since all symbols retain identical names and signatures, `npm run check` will catch any missing or incorrect imports. No unit test changes are needed for this step — existing tests exercise the behavior through capability files, and import correctness is verified by the compiler.
- **`src/utils.ts` still exists with re-exports:** If the executor accidentally leaves a `../utils` import, it will still compile because of backward-compat re-exports. The grep verification criterion ensures zero `../utils` imports remain.
