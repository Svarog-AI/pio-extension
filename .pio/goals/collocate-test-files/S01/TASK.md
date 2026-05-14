# Task: Complex merges — collocate multi-source and cross-cutting tests

Handle the four most complex migrations where multiple test files merge into one or a cross-cutting file must be split, plus one single-file relocation. Each resulting file lives beside its primary source module.

## Context

All 14 test files currently live in `__tests__/` at the project root. Step 1 handles the most complex migrations — merges and splits — so that subsequent steps (simple moves) can proceed without cross-cutting concerns. Vitest is configured via `vitest.config.ts` with globals enabled. TypeScript uses ESM with `"type": "module"` in `package.json`.

## What to Build

Five new test files under `src/`, each collocated beside the source module it tests. Import paths must be updated from `../src/...` (relative to `__tests__/`) to correct relative paths from the new locations. Shared helpers (`createTempDir`, `cleanup`, `createGoalTree`) should be deduplicated when merging — keep the most capable version.

### 1. Merge → `src/capability-config.test.ts`

Merge three files into one:
- `__tests__/capability-config.test.ts` — tests `resolveCapabilityConfig` (happy path, session name, initial message, step-dependent callbacks, error handling, static config passthrough)
- `__tests__/types.test.ts` — compile-time type verification for `PrepareSessionCallback`, `StaticCapabilityConfig.prepareSession`, `CapabilityConfig.prepareSession`, plus runtime tests for `resolveCapabilityConfig — prepareSession`
- `__tests__/session-capability.test.ts` — backward-compatibility tests verifying capabilities without `prepareSession` still produce valid config

**Deduplication:** `makeCwd()` helper from `capability-config.test.ts` is shared across all three. `session-capability.test.ts` has no unique helpers. `types.test.ts` imports types from `../src/types` — after merge, change to `./types`.

**Import path changes (from `__tests__/` → `src/`):**
- `../src/capability-config` → `./capability-config`
- `../src/types` → `./types`

### 2. Merge → `src/fs-utils.test.ts`

Merge two files:
- `__tests__/fs-utils.test.ts` — comprehensive tests for `resolveGoalDir`, `goalExists`, `issuesDir`, `findIssuePath`, `readIssue`, `deriveSessionName`, `stepFolderName`, `discoverNextStep`
- `__tests__/smoke.test.ts` — 2 smoke tests (arithmetic + ESM import resolution of `stepFolderName`)

**Deduplication:** Keep the helpers from `fs-utils.test.ts` (`createTempDir`, `cleanup`, `createGoalTree`, `createIssueFiles`). `smoke.test.ts` has no unique helpers. Place the smoke tests in a dedicated `describe("smoke")` block at the **bottom** of the merged file so they run after all functional tests.

**Import path changes:**
- `../src/fs-utils` → `./fs-utils`

### 3. Split + merge → `src/capabilities/execute-task.test.ts`

From `__tests__/step-discovery.test.ts`, extract:
- The `isStepReady(goalDir, stepNumber)` describe block (6 tests)
- The `stepFolderName` describe block (2 tests) — note: these duplicate tests in `fs-utils.test.ts`, but since the goal is to collocate and these are imported from the step-discovery context, include them here for completeness (they test `stepFolderName` as used by execute-task)

Merge with `__tests__/execute-task-initial-message.test.ts` which tests `CAPABILITY_CONFIG.defaultInitialMessage` rejection feedback (7 tests).

**Deduplication:** Both files define `createTempDir`, `cleanup`, and `createGoalTree`. `step-discovery.test.ts` has the more capable `createGoalTree` (parameterized with `{ number, files }[]`). Use that version. The `execute-task-initial-message.test.ts` version of `createGoalTree` is simpler — accepts `stepNumber` and `rejected` boolean, creates a `REJECTED` marker. You'll need to merge the two `createGoalTree` patterns into one that supports both use cases (optional files array + optional rejected flag).

**Import path changes:**
- `../src/capabilities/execute-task` → `./execute-task`
- `../src/fs-utils` → `../../fs-utils`

### 4. Split + merge → `src/capabilities/review-code.test.ts`

From `__tests__/step-discovery.test.ts`, extract:
- The `isStepReviewable(goalDir, stepNumber)` describe block (5 tests)
- The `findMostRecentCompletedStep(goalDir)` describe block (6 tests)

Merge with `__tests__/review-code-config.test.ts` which tests `CAPABILITY_CONFIG.writeAllowlist` and `CAPABILITY_CONFIG.prepareSession` (10 tests total).

**Deduplication:** Both define `createTempDir`, `cleanup`, `createGoalTree`. `step-discovery.test.ts` has the parameterized version. `review-code-config.test.ts` returns `{ goalDir, stepDir }` from `createGoalTree`. Merge into one helper supporting both patterns.

**Import path changes:**
- `../src/capabilities/review-code` → `./review-code`
- `../src/fs-utils` → `../../fs-utils`

### 5. Move → `src/capabilities/evolve-plan.test.ts`

Single-file relocation from `__tests__/evolve-plan.test.ts`. No merging needed. Tests: `validateOutputs with COMPLETED at baseDir` (4 tests), `resolveEvolveWriteAllowlist` (1 test), `validateAndFindNextStep with COMPLETED marker` (2 tests).

**Import path changes:**
- `../src/guards/validation` → `../../guards/validation`
- `../src/capability-config` → `../../capability-config`
- `../src/capabilities/evolve-plan` → `./evolve-plan`

## Dependencies

None. This is Step 1 — no prior step outputs are required.

## Files Affected

- `src/capability-config.test.ts` — new: merged from capability-config + types + session-capability tests
- `src/fs-utils.test.ts` — new: merged from fs-utils + smoke tests
- `src/capabilities/execute-task.test.ts` — new: merged from execute-task-initial-message + step-discovery (isStepReady, stepFolderName) portions
- `src/capabilities/review-code.test.ts` — new: merged from review-code-config + step-discovery (isStepReviewable, findMostRecentCompletedStep) portions
- `src/capabilities/evolve-plan.test.ts` — new: relocated from `__tests__/evolve-plan.test.ts` with updated imports

## Acceptance Criteria

- [ ] All 5 new test files exist at their target paths
- [ ] `npm run check` reports no type errors
- [ ] `vitest run src/capability-config.test.ts` passes (all original tests from 3 merged files)
- [ ] `vitest run src/fs-utils.test.ts` passes (all original tests including smoke tests)
- [ ] `vitest run src/capabilities/execute-task.test.ts` passes
- [ ] `vitest run src/capabilities/review-code.test.ts` passes
- [ ] `vitest run src/capabilities/evolve-plan.test.ts` passes

## Risks and Edge Cases

- **Helper merge conflicts:** `createGoalTree` has different signatures across files. The merged version must satisfy all callers (parameterized `{ number, files }[]` from step-discovery, plus `rejected` boolean from execute-task-initial-message). Create a unified helper or two separate helpers if they diverge too much.
- **Describe block naming:** Ensure no nested `describe` blocks with the same name (e.g., if merging produces duplicate `describe("stepFolderName")` in review-code.test.ts). Rename to be distinct if needed.
- **Import ordering:** Vitest globals (`describe`, `it`, `expect`) are available without imports due to `globals: true` in `vitest.config.ts`. Keep existing import patterns — no need to add/remove vitest-specific imports.
- **step-discovery.test.ts is read twice but not deleted yet:** Both execute-task and review-code merges read from this file. The original `__tests__/step-discovery.test.ts` remains on disk until Step 3 deletes all `__tests__/` files.
- **Module mocking:** No module mocking (`vi.mock`) is used in the Step 1 files — that concern is handled in Step 2 (`next-task.test.ts`).
