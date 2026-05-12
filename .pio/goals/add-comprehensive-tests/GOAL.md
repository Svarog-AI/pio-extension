# Add Comprehensive Test Suite to pio-extension

Add a comprehensive test suite using Vitest to cover pure utilities, validation logic, step discovery, capability config resolution, and workflow transitions. Introduce automated testing via a `npm run test` script and a GitHub Actions CI workflow. The goal is to reach 80%+ coverage on business logic and make refactoring safe across all capabilities. Integration tests (mocking the pi framework API) are out of scope.

## Current State

- **Zero tests:** No test runner, no test files, no `__tests__/` directory, no CI pipeline exist anywhere in the repository.
- **Only verification:** `npm run check` runs `tsc --noEmit` (TypeScript type checking). That's the sole automated check.
- **ESM-only project:** `package.json` sets `"type": "module"`, `tsconfig.json` uses `"noEmit": true`. Code is consumed as raw TypeScript by the pi runtime — no transpilation or bundling step. This constrains test runner choice (must support native ESM).
- **Pure utility functions in `src/utils.ts`:** Functions like `resolveGoalDir`, `goalExists`, `queueDir`, `findIssuePath`, `readIssue`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`, `deriveSessionName`, `stepFolderName`, `discoverNextStep`, and `resolveCapabilityConfig` operate on paths, filesystem state, or module imports — no pi framework coupling. Also exports `CAPABILITY_TRANSITIONS` (deterministic workflow map) and `resolveNextCapability`.
- **Validation logic in `src/capabilities/validation.ts`:** Exports `validateOutputs(rules, baseDir)` (checks file existence) and `extractGoalName(workingDir)` (path parsing). Also contains the `pio_mark_complete` tool, session-level state management, file protection enforcement via `tool_call`, and the `setupValidation(pi)` registration function.
- **Step discovery logic:** Spread across `src/capabilities/evolve-plan.ts` (step spec completeness checks, finding next step) and `src/capabilities/execute-task.ts` (step readiness checks, explicit step validation). Both import shared helpers from `utils.ts` like `stepFolderName` and `discoverNextStep`.
- **14 capability modules:** Under `src/capabilities/`, each exports a `CAPABILITY_CONFIG` with prompt name, validation rules, file protections, and a `setup*` function that registers tools/commands via the pi `ExtensionAPI`.

## To-Be State

- **Vitest configured as the test runner:** Installed as a dev dependency (`npm install --save-dev vitest`) with native ESM support (no transpilation). A `vitest.config.ts` or inline `package.json` config resolves TypeScript via Vitest's built-in TS handling. `package.json` gains `"test": "vitest run"` script.
- **Test files organized under `__tests__/`:**
  - `utils.test.ts` — Tier 1: Pure utilities (`resolveGoalDir`, `goalExists`, `queueDir`, `findIssuePath`, `readIssue`, `enqueueTask`, `readPendingTask`, `listPendingGoals`, `writeLastTask`, `deriveSessionName`, `stepFolderName`, `discoverNextStep`). Tests use temporary directories to simulate filesystem state. Covers normal names, special characters, missing dirs, edge cases.
  - `validation.test.ts` — Tier 2: Validation logic (`validateOutputs`, `extractGoalName`). Tests cover all-present, all-missing, partial-missing, empty rules scenarios. Path parsing covers standard paths, deeply nested paths, no `/goals/` segment, root-level paths.
  - `step-discovery.test.ts` — Tier 3: Step discovery from `evolve-plan.ts` and `execute-task.ts`. Tests cover empty goals, all-complete steps, gaps in middle, missing PLAN.md, COMPLETED/BLOCKED markers, mixed states. Also tests `stepFolderName` edge cases (S01-S09 padding, two-digit numbers).
  - `capability-config.test.ts` — Tier 4: Config resolution via `resolveCapabilityConfig`. Tests cover valid capability names, nonexistent modules, missing CAPABILITY_CONFIG exports. Verifies `defaultInitialMessage` returns non-empty strings with correct path info.
  - `transition.test.ts` — Workflow transitions: Tests `CAPABILITY_TRANSITIONS` and `resolveNextCapability` for all defined transitions (create-goal → create-plan → evolve-plan → execute-task → review-code → evolve-plan/execute-task). Covers approval paths, rejection re-execution, step number incrementing.
- **Test fixtures under `__tests__/fixtures/`:** Fake GOAL.md, PLAN.md, issue files, and simulated goal directory trees to exercise filesystem-dependent logic without side effects.
- **GitHub Actions CI workflow:** A `.github/workflows/ci.yml` runs `npm install`, `npm run check` (type checking), and `npm test` on every push and pull request to `main`.
- **Phased rollout:** Phase 1 covers Vitest setup + pure utilities (`utils.ts`). Phase 2 adds validation, step discovery, and config resolution tests. Phase 3 introduces the GitHub Actions CI workflow.
