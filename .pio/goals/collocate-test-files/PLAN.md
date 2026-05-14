# Plan: Collocate test files beside their source modules

Move 14 test files from the centralized `__tests__/` directory to live beside the source modules they test, merging tests targeting the same module into single `*.test.ts` files, and updating all configuration accordingly. See GOAL.md for full context.

## Prerequisites

- `npm install` has been run (vitest must be available)
- Current test suite passes: `npm run test` succeeds with all existing tests in `__tests__/`

## Steps

### Step 1: Complex merges — collocate multi-source and cross-cutting tests

**Description:** Handle the four most complex migrations where multiple test files merge into one or a cross-cutting file must be split. Each resulting file lives beside its primary source module.

1. **Merge `capability-config.test.ts` + `types.test.ts` + `session-capability.test.ts` → `src/capability-config.test.ts`**
   All three test files primarily exercise `resolveCapabilityConfig` from `src/capability-config.ts`. Deduplicate shared helpers (e.g., `makeCwd()`). Update import paths: `../src/capability-config` → `./capability-config`, `../src/types` → `./types`.

2. **Merge `fs-utils.test.ts` + `smoke.test.ts` → `src/fs-utils.test.ts`**
   `smoke.test.ts` imports `stepFolderName` from `src/fs-utils.ts`. Move the smoke tests into a dedicated `describe("smoke")` block at the bottom of the merged file. Update import paths: `../src/fs-utils` → `./fs-utils`.

3. **Split `step-discovery.test.ts`, merge execute-task portions into `src/capabilities/execute-task.test.ts`**
   From `step-discovery.test.ts`, extract the `isStepReady` describe block and the `stepFolderName` describe block (both test `src/capabilities/execute-task.ts` behavior). Merge with existing `execute-task-initial-message.test.ts`. Deduplicate shared helpers (`createTempDir`, `cleanup`, `createGoalTree`). Update import paths: `../src/capabilities/execute-task` → `./execute-task`, `../src/fs-utils` → `../../fs-utils`.

4. **Split `step-discovery.test.ts`, merge review-code portions into `src/capabilities/review-code.test.ts`**
   From `step-discovery.test.ts`, extract the `isStepReviewable` and `findMostRecentCompletedStep` describe blocks (both test `src/capabilities/review-code.ts` behavior). Merge with existing `review-code-config.test.ts`. Deduplicate shared helpers. Update import paths: `../src/capabilities/review-code` → `./review-code`, `../src/fs-utils` → `../../fs-utils`.

5. **Move `evolve-plan.test.ts` → `src/capabilities/evolve-plan.test.ts`**
   Single-file move. Update all import paths: `../src/guards/validation` → `../../guards/validation`, `../src/capability-config` → `../../capability-config`, `../src/capabilities/evolve-plan` → `./evolve-plan`.

**Acceptance criteria:**
- [ ] All 5 new test files exist at their target paths
- [ ] `npm run check` reports no type errors
- [ ] `vitest run src/capability-config.test.ts` passes (all original tests from 3 merged files)
- [ ] `vitest run src/fs-utils.test.ts` passes (all original tests including smoke tests)
- [ ] `vitest run src/capabilities/execute-task.test.ts` passes
- [ ] `vitest run src/capabilities/review-code.test.ts` passes
- [ ] `vitest run src/capabilities/evolve-plan.test.ts` passes

**Files affected:**
- `src/capability-config.test.ts` — new merged file: capability-config + types + session-capability tests
- `src/fs-utils.test.ts` — new merged file: fs-utils + smoke tests
- `src/capabilities/execute-task.test.ts` — new merged file: execute-task-initial-message + step-discovery (isStepReady, stepFolderName) tests
- `src/capabilities/review-code.test.ts` — existing file, append: step-discovery (isStepReviewable, findMostRecentCompletedStep) tests
- `src/capabilities/evolve-plan.test.ts` — moved from `__tests__/evolve-plan.test.ts`, updated imports

### Step 2: Simple moves — collocate single-module test files

**Description:** Move the remaining five test files to live beside their source modules. These are straightforward relocations with import path updates only — no merging required.

1. **Move `queues.test.ts` → `src/queues.test.ts`**
   Update imports: `../src/queues` → `./queues`.

2. **Move `transition.test.ts` → `src/transitions.test.ts`** (note: renamed to match source module name)
   Update imports: `../src/transitions` → `./transitions`, `../src/fs-utils` → `./fs-utils`.

3. **Move `next-task.test.ts` → `src/capabilities/session-capability.test.ts`**
   Tests `getSessionGoalName` from `session-capability.ts`. Update imports: `../src/capabilities/session-capability` → `./session-capability`. The mock for `session-capability` module also needs updating.

4. **Move `validation.test.ts` → `src/guards/validation.test.ts`**
   Update imports: `../src/guards/validation` → `./validation`.

5. **Move `turn-guard.test.ts` → `src/guards/turn-guard.test.ts`**
   Update imports: `../src/guards/turn-guard` → `./turn-guard`.

**Acceptance criteria:**
- [ ] All 5 new test files exist at their target paths
- [ ] `npm run check` reports no type errors
- [ ] `vitest run src/queues.test.ts` passes
- [ ] `vitest run src/transitions.test.ts` passes
- [ ] `vitest run src/capabilities/session-capability.test.ts` passes
- [ ] `vitest run src/guards/validation.test.ts` passes
- [ ] `vitest run src/guards/turn-guard.test.ts` passes

**Files affected:**
- `src/queues.test.ts` — moved from `__tests__/queues.test.ts`, updated imports
- `src/transitions.test.ts` — moved and renamed from `__tests__/transition.test.ts`, updated imports
- `src/capabilities/session-capability.test.ts` — moved from `__tests__/next-task.test.ts`, updated imports
- `src/guards/validation.test.ts` — moved from `__tests__/validation.test.ts`, updated imports
- `src/guards/turn-guard.test.ts` — moved from `__tests__/turn-guard.test.ts`, updated imports

### Step 3: Update configuration and verify full test suite

**Description:** Update vitest and TypeScript configuration to reflect the new test file locations. Remove all original test files from `__tests__/` now that they've been relocated. Run the full test suite to confirm zero regressions.

1. **Update `vitest.config.ts`**: Change `include: ["__tests__/**/*.test.ts", "__tests__/*.test.ts"]` to `["src/**/*.test.ts"]` so vitest discovers all collocated tests automatically.

2. **Update `tsconfig.json`**: Remove `"__tests__/**/*.ts"` from the `include` array. Since all test files now live under `src/`, the existing `"src/**/*.ts"` pattern covers everything.

3. **Delete all original test files from `__tests__/`**: Remove all 14 `.test.ts` files but keep the directory empty for now (removed in Step 4).

**Acceptance criteria:**
- [ ] `vitest.config.ts` includes `"src/**/*.test.ts"` and no longer references `__tests__/`
- [ ] `tsconfig.json` `include` is `["src/**/*.ts"]` (no `__tests__` reference)
- [ ] `npm run check` reports no type errors
- [ ] `npm run test` passes with all tests discovered and passing under `src/`

**Files affected:**
- `vitest.config.ts` — change include pattern from `__tests__/` to `src/**/*.test.ts`
- `tsconfig.json` — remove `"__tests__/**/*.ts"` from include array
- `__tests__/*.test.ts` — delete all 14 original test files

### Step 4: Remove `__tests__/` directory and final verification

**Description:** Delete the now-empty `__tests__/` directory. Run final verification to confirm the migration is complete with no regressions.

**Acceptance criteria:**
- [ ] `__tests__/` directory does not exist
- [ ] `npm run check` reports no type errors
- [ ] `npm run test` passes — all ~9 collocated test files discovered and passing
- [ ] No references to `__tests__/` remain in source code or configuration (verified via grep)

**Files affected:**
- `__tests__/` — deleted (empty directory removal)

## Notes

- **Helper deduplication:** Multiple test files define identical helpers (`createTempDir`, `cleanup`, `createGoalTree`). When merging, keep one definition. Prefer the most capable version (e.g., the parameterized `createGoalTree` from `step-discovery.test.ts` supports optional marker files).
- **Import path arithmetic:** After moving, relative imports must point to the correct depth. For example, `src/capabilities/execute-task.test.ts` importing `src/fs-utils.ts` uses `../../fs-utils` (two levels up from capabilities/).
- **Module mocking:** `next-task.test.ts` uses `vi.mock("../src/capabilities/session-capability", ...)` — after moving to `src/capabilities/`, the mock path becomes `vi.mock("./session-capability", ...)`.
- **No source files import from `__tests__/`:` Confirmed via grep — no cross-dependencies exist.
- **tsconfig types:** The `"types": ["vitest/globals", "node"]` setting already provides global vitest types (describe/it/expect) regardless of test file location.
- **Review code test merge:** `review-code.test.ts` is created from merging `review-code-config.test.ts` with the review-code portions of `step-discovery.test.ts`. Ensure describe block names remain distinct to avoid nested describes.
