# Task: Simple moves — collocate single-module test files

Move five remaining test files from `__tests__/` to live beside their source modules. These are straightforward relocations with import path updates only — no merging required.

## Context

Step 1 completed the complex merges (multi-source and cross-cutting tests). Five test files remain in `__tests__/`, each testing a single source module. The goal is to collocate them so every test file lives next to its source module, matching the pattern established by Step 1's output (`src/capability-config.test.ts`, `src/fs-utils.test.ts`, etc.).

## What to Build

Relocate five test files and update their relative import paths. No logic changes, no helper deduplication, no describe block consolidation needed.

### Code Components

#### 1. Move `queues.test.ts` → `src/queues.test.ts`

- Tests `src/queues.ts`: functions `queueDir`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`
- Update import: `import { ... } from "../src/queues"` → `import { ... } from "./queues"`
- No other imports to change (uses only `node:` builtins besides the queues module)

#### 2. Move `transition.test.ts` → `src/transitions.test.ts`

- File renamed from `transition.test.ts` to match source module name `transitions.ts`
- Tests `src/transitions.ts`: `CAPABILITY_TRANSITIONS`, `resolveNextCapability`, `TransitionContext`
- Update imports:
  - `import { ... } from "../src/transitions"` → `import { ... } from "./transitions"`
  - `import { stepFolderName } from "../src/fs-utils"` → `import { stepFolderName } from "./fs-utils"`

#### 3. Move `next-task.test.ts` → `src/capabilities/session-capability.test.ts`

- Tests `getSessionGoalName` from `src/capabilities/session-capability.ts` and `handleNextTask` from `src/capabilities/next-task.ts`
- Uses `vi.mock()` for module mocking — this requires careful path updates:
  - Mock path: `vi.mock("../src/capabilities/session-capability", ...)` → `vi.mock("./session-capability", ...)`
  - Import: `import { getSessionGoalName } from "../src/capabilities/session-capability"` → `import { getSessionGoalName } from "./session-capability"`
  - Dynamic import: `await import("../src/capabilities/next-task")` → `await import("./next-task")`

#### 4. Move `validation.test.ts` → `src/guards/validation.test.ts`

- Tests `src/guards/validation.ts`: `validateOutputs`, `extractGoalName`, `parseReviewFrontmatter`, `validateReviewFrontmatter`, `applyReviewDecision`, `validateReviewState`
- Update import: `import { ... } from "../src/guards/validation"` → `import { ... } from "./validation"`

#### 5. Move `turn-guard.test.ts` → `src/guards/turn-guard.test.ts`

- Tests `src/guards/turn-guard.ts`: `isThinkingOnlyTurn`, `setupTurnGuard`, `__testSetActiveSession`
- Update import: `import { ... } from "../src/guards/turn-guard"` → `import { ... } from "./turn-guard"`

### Approach and Decisions

- **File content:** Copy the file content as-is (no reformatting or restructuring). Only modify import paths.
- **Import path depth:** From `src/` level, relative imports to siblings use `./`. From `src/capabilities/`, relative imports to siblings use `./`. From `src/guards/`, relative imports to siblings use `./`. The `transition.test.ts` file also imports from `fs-utils`, which at the new location is a sibling (`./fs-utils`).
- **Module mocking in `session-capability.test.ts`:** The `vi.mock()` call path must match the relative path from the *test file's new location*. Since both test and mocked module are now in `src/capabilities/`, the path becomes `"./session-capability"`.
- **Renaming:** `transition.test.ts` → `transitions.test.ts` (note plural "s") to match the source module name `transitions.ts`.
- **Do NOT delete originals from `__tests__/`:** Original files are removed in Step 3. Keep them for now so the full suite still passes during the migration transition.

## Dependencies

- Step 1 must be completed (provides the collocated test pattern and updated `vitest.config.ts` with `"src/**/*.test.ts"` include)

## Files Affected

- `src/queues.test.ts` — new file: moved from `__tests__/queues.test.ts`, import `../src/queues` → `./queues`
- `src/transitions.test.ts` — new file: moved and renamed from `__tests__/transition.test.ts`, imports updated (`../src/transitions` → `./transitions`, `../src/fs-utils` → `./fs-utils`)
- `src/capabilities/session-capability.test.ts` — new file: moved from `__tests__/next-task.test.ts`, mock and import paths updated to `./session-capability` and `./next-task`
- `src/guards/validation.test.ts` — new file: moved from `__tests__/validation.test.ts`, import `../src/guards/validation` → `./validation`
- `src/guards/turn-guard.test.ts` — new file: moved from `__tests__/turn-guard.test.ts`, import `../src/guards/turn-guard` → `./turn-guard`

## Acceptance Criteria

- [ ] All 5 new test files exist at their target paths
- [ ] `npm run check` reports no type errors
- [ ] `vitest run src/queues.test.ts` passes (all original tests from queues.test.ts)
- [ ] `vitest run src/transitions.test.ts` passes (all original tests from transition.test.ts)
- [ ] `vitest run src/capabilities/session-capability.test.ts` passes (all original tests from next-task.test.ts)
- [ ] `vitest run src/guards/validation.test.ts` passes (all original tests from validation.test.ts)
- [ ] `vitest run src/guards/turn-guard.test.ts` passes (all original tests from turn-guard.test.ts)

## Risks and Edge Cases

- **`vi.mock()` hoisting:** In `session-capability.test.ts`, the `vi.hoisted()` call creates a mock before imports. After relocation, the `vi.mock("../src/capabilities/session-capability", ...)` path becomes `vi.mock("./session-capability", ...)`. This must be exact — vitest resolves mock paths relative to the test file location.
- **Dynamic import in `next-task.test.ts`:** The `handleNextTask` tests use `await import("../src/capabilities/next-task")` inside a `beforeEach()`. After moving, this becomes `await import("./next-task")`. Missing this update would cause module resolution failures.
- **Transition test imports `fs-utils`:** `transition.test.ts` has two source imports (transitions + fs-utils). Both must be updated; forgetting the fs-utils import would cause a runtime error during tests.
