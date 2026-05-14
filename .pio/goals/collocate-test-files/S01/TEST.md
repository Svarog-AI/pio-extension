# Tests: Complex merges — collocate multi-source and cross-cutting tests

## Context

The project uses **Vitest** (`vitest ^4.1.6`) with `globals: true` for describe/it/expect. Test command: `npm run test` (runs `vitest run`). Type checking: `npm run check` (`tsc --noEmit`). No new tests are being written — existing tests are being relocated and merged. The verification strategy is to run each collocated test file individually via vitest to confirm zero regressions after migration.

## Unit Tests

All test cases below are **existing tests being relocated**. The executor must ensure every describe block and it() from the source files appears in the target file with correct import paths.

### File: `src/capability-config.test.ts`

Merged from 3 source files. Total expected describe blocks: 8 (from capability-config) + 4 (from types) + 1 (from session-capability) = **13 describe blocks**.

**From `__tests__/capability-config.test.ts` (56 tests across 6 describe blocks):**
- `describe("resolveCapabilityConfig — happy path with static config")` — 4 tests: create-goal prompt, create-plan validation, workingDir derivation, goalName fallback
- `describe("resolveCapabilityConfig — session name derivation")` — 3 tests: goal+capability, step number, capability-only
- `describe("resolveCapabilityConfig — initial message derivation")` — 3 tests: defaultInitialMessage, explicit override, path info
- `describe("resolveCapabilityConfig — step-dependent callback resolution")` — 5 tests: evolve-plan validation/writeAllowlist, execute-task validation/readOnlyFiles, review-code writeAllowlist
- `describe("resolveCapabilityConfig — graceful error handling")` — 4 tests: missing capability, undefined params, unknown capability, sessionParams passthrough
- `describe("resolveCapabilityConfig — static config passthrough")` — 2 tests: validation JSON equality, writeAllowlist JSON equality

**From `__tests__/types.test.ts` (8 tests across 4 describe blocks):**
- `describe("PrepareSessionCallback")` — 2 compile-time type verification tests
- `describe("StaticCapabilityConfig.prepareSession")` — 3 tests: optional field, callback acceptance, inline arrow function
- `describe("CapabilityConfig.prepareSession")` — 2 tests: optional on resolved config, callback acceptance
- `describe("resolveCapabilityConfig — prepareSession")` — 1 test: undefined when not defined, 1 test: review-code has it, others don't

**From `__tests__/session-capability.test.ts` (4 tests in 1 describe block):**
- `describe("backward compatibility — capabilities without prepareSession")` — 4 tests: create-goal, create-plan, execute-task (all undefined), review-code (defined)

**Verify:** All 13 describe blocks present. No duplicate describe names (if collision occurs, rename one). Imports use `./capability-config` and `./types`.

### File: `src/fs-utils.test.ts`

Merged from 2 source files. Total expected describe blocks: 7 (from fs-utils) + 1 (smoke) = **8 describe blocks**.

**From `__tests__/fs-utils.test.ts` (26 tests across 7 describe blocks):**
- `describe("resolveGoalDir(cwd, name)")` — 4 tests
- `describe("goalExists(goalDir)")` — 3 tests
- `describe("issuesDir(cwd)")` — 3 tests
- `describe("findIssuePath(cwd, identifier)")` — 5 tests
- `describe("readIssue(cwd, identifier)")` — 3 tests
- `describe("deriveSessionName(goalName, capability, stepNumber?)")` — 5 tests
- `describe("stepFolderName(stepNumber)")` — 3 tests
- `describe("discoverNextStep(goalDir)")` — 6 tests

**From `__tests__/smoke.test.ts` (2 tests in 1 describe block):**
- `describe("smoke")` — 2 tests: arithmetic, ESM import resolution

Place the smoke describe block at the **bottom** of the file. Imports use `./fs-utils`.

### File: `src/capabilities/execute-task.test.ts`

Merged from execute-task-initial-message + step-discovery portions. Total expected describe blocks: 1 (initial message) + 2 (from step-discovery) = **3 describe blocks**.

**From `__tests__/execute-task-initial-message.test.ts` (7 tests):**
- `describe("defaultInitialMessage — rejection feedback channel")` — 7 tests: REVIEW.md reference, re-execution language, no rejection message when absent, normal message, missing stepNumber, non-existent step folder, zero-padded step number

**From `__tests__/step-discovery.test.ts` (extract only these blocks):**
- `describe("isStepReady(goalDir, stepNumber)")` — 6 tests: TASK+TEST present, missing TASK, missing TEST, COMPLETED marker, BLOCKED marker, folder missing
- `describe("stepFolderName")` — 2 tests: zero-pads S01-S09, no extra padding S10+

**Shared helpers to deduplicate:** Merge `createGoalTree` from both sources into one that supports `{ number, files }[]` (from step-discovery) AND the simpler `(tempDir, goalName, stepNumber?, rejected?)` signature (from execute-task-initial-message). One approach: make files optional and add a `rejected` parameter.

**Verify:** Imports use `./execute-task` and `../../fs-utils`.

### File: `src/capabilities/review-code.test.ts`

Merged from review-code-config + step-discovery portions. Total expected describe blocks: 2 (from review-code-config) + 2 (from step-discovery) = **4 describe blocks**.

**From `__tests__/review-code-config.test.ts` (10 tests):**
- `describe("resolveReviewWriteAllowlist")` — 3 tests: returns REVIEW.md path, excludes APPROVED, throws on missing stepNumber
- `describe("CAPABILITY_CONFIG.prepareSession")` — 8 tests: is defined, deletes APPROVED, deletes REJECTED, deletes both, preserves COMPLETED, preserves REVIEW.md, handles missing markers, throws on missing stepNumber, zero-padded names

**From `__tests__/step-discovery.test.ts` (extract only these blocks):**
- `describe("isStepReviewable(goalDir, stepNumber)")` — 5 tests: COMPLETED+SUMMARY no BLOCKED, missing COMPLETED, missing SUMMARY, has BLOCKED, folder missing
- `describe("findMostRecentCompletedStep(goalDir)")` — 6 tests: no folders, one complete, multiple sequential, gap in middle, S01 blocked S02 completed, S01 specs-only S02 reviewable

**Shared helpers to deduplicate:** Merge `createGoalTree` from both sources. The step-discovery version returns `string` (goalDir). The review-code-config version returns `{ goalDir, stepDir }`. Create a unified helper that returns an object with both properties.

**Verify:** Imports use `./review-code` and `../../fs-utils`.

### File: `src/capabilities/evolve-plan.test.ts`

Single-file relocation. Total expected describe blocks: **3**.

- `describe("validateOutputs with COMPLETED at baseDir")` — 4 tests: passes with COMPLETED, passes when COMPLETED is only expected file, fails without COMPLETED, doesn't match subfolder COMPLETED
- `describe("resolveEvolveWriteAllowlist")` — 1 test: includes COMPLETED alongside step-folder paths
- `describe("validateAndFindNextStep with COMPLETED marker")` — 2 tests: returns ready:false with COMPLETED, returns ready:true without COMPLETED

**Verify:** Imports use `../../guards/validation`, `../../capability-config`, and `./evolve-plan`.

## Programmatic Verification

Run these commands in order after all 5 files are created:

1. **TypeScript type check:**
   - **What:** All collocated test files have correct types and import paths
   - **How:** `npm run check` (runs `tsc --noEmit`)
   - **Expected result:** Exit code 0, no errors mentioning the 5 new test files

2. **capability-config tests:**
   - **What:** All merged tests from 3 source files pass
   - **How:** `npx vitest run src/capability-config.test.ts`
   - **Expected result:** All tests pass (13 describe blocks, all it() assertions green)

3. **fs-utils tests:**
   - **What:** All merged tests including smoke tests pass
   - **How:** `npx vitest run src/fs-utils.test.ts`
   - **Expected result:** All tests pass (8 describe blocks, smoke block at end)

4. **execute-task tests:**
   - **What:** Merged initial-message + step-discovery tests pass
   - **How:** `npx vitest run src/capabilities/execute-task.test.ts`
   - **Expected result:** All tests pass (3 describe blocks)

5. **review-code tests:**
   - **What:** Merged review-config + step-discovery tests pass
   - **How:** `npx vitest run src/capabilities/review-code.test.ts`
   - **Expected result:** All tests pass (4 describe blocks)

6. **evolve-plan tests:**
   - **What:** Relocated tests pass with new import paths
   - **How:** `npx vitest run src/capabilities/evolve-plan.test.ts`
   - **Expected result:** All tests pass (3 describe blocks)

## Test Order

Execute in this priority:

1. **Type check first** (`npm run check`) — catches import path errors before running tests
2. **Individual test files** (steps 2–6 above) — each file is independent, run in any order after type check passes
3. If vitest config has not yet been updated from `__tests__/` to `src/**`, individual file invocation (`vitest run <path>`) bypasses the include pattern and still works. Full suite discovery (`npm run test`) won't find the new files until Step 3 updates vitest.config.ts.
