# Plan: Add Comprehensive Test Suite to pio-extension

Configure Vitest as the test runner, write tests covering pure utilities, validation logic, step discovery, capability config resolution, and workflow transitions, and add a GitHub Actions CI pipeline.

## Prerequisites

- Node.js 18+ with npm (already required by the project)
- `npm install` has been run (devDependencies present)

## Steps

### Step 1: Configure Vitest with native ESM support

**Description:** Install Vitest as a dev dependency and configure it for this ESM-only TypeScript project. Since `tsconfig.json` has `"noEmit": true` and the project uses native ESM (`"type": "module"`), Vitest must be configured to handle TypeScript files without transpilation — using its built-in TS stripping or the `@vitest/esm-plugin`. Add a `test` script to `package.json` and verify with a basic smoke test.

**Acceptance criteria:**
- [ ] `vitest` is installed as a dev dependency (`npm install --save-dev vitest`)
- [ ] `vitest.config.ts` exists with ESM-compatible TypeScript configuration (no transpilation bundler)
- [ ] `package.json` has `"test": "vitest run"` in scripts
- [ ] A basic smoke test (`__tests__/smoke.test.ts` or similar) passes with `npm test`
- [ ] `npm run check` (type checking) still reports no errors

**Files affected:**
- `package.json` — add vitest dev dependency, add `"test"` script
- `vitest.config.ts` — new file: Vitest configuration for native ESM + TypeScript
- `__tests__/smoke.test.ts` — new file: basic 1+1 test to prove the runner works

### Step 2: Test pure utilities (`utils.test.ts`)

**Description:** Write comprehensive tests for all pure utility functions exported from `src/utils.ts`. Use temporary directories (via `fs.mkdtempSync` or similar) to simulate filesystem state without side effects. Create reusable fixture setup/teardown helpers under `__tests__/fixtures/`.

Functions to test:
- `resolveGoalDir(cwd, name)` — path construction with normal and special-character names
- `goalExists(goalDir)` — true when dir exists, false when missing
- `queueDir(cwd)` — returns correct path, creates directory if missing
- `findIssuePath(cwd, identifier)` — absolute path, exact filename, bare slug, non-existent
- `readIssue(cwd, identifier)` — reads content, returns undefined for missing
- `enqueueTask(cwd, goalName, task)` — writes JSON file with correct naming convention (`task-{goalName}.json`)
- `readPendingTask(cwd, goalName)` — reads and parses JSON, returns undefined when missing
- `listPendingGoals(cwd)` — scans for `task-*.json` files, extracts goal names correctly
- `writeLastTask(goalDir, task)` — writes LAST_TASK.json with correct content
- `deriveSessionName(goalName, capability, stepNumber?)` — all three format variants (no goalName, with goalName only, with stepNumber)
- `stepFolderName(stepNumber)` — S01–S09 zero-padding, two-digit numbers (S10+)
- `discoverNextStep(goalDir)` — empty dir returns 1, complete steps increment, gaps handled correctly

**Acceptance criteria:**
- [ ] `npm test __tests__/utils.test.ts` passes with all tests green
- [ ] All 12 utility functions have test coverage
- [ ] Edge cases covered: missing dirs, special characters in names, empty queues, non-existent issues
- [ ] `npm run check` reports no errors
- [ ] No side effects on real `.pio/` directories (all tests use temp dirs)

**Files affected:**
- `__tests__/utils.test.ts` — new file: comprehensive utility function tests
- `__tests__/fixtures/` — new directory: helper functions or fixture data for test setup (e.g., fake issue files, simulated goal trees)

### Step 3: Export and test validation logic (`validation.test.ts`)

**Description:** Export the pure validation functions from `src/capabilities/validation.ts` so they can be tested in isolation. Currently `validateOutputs(rules, baseDir)` and `extractGoalName(workingDir)` are already exported (or used internally). Verify exports exist, then write tests covering all input combinations.

Test scenarios for `validateOutputs`:
- All files present → passed: true, missing: []
- All files missing → passed: false, all in missing array
- Partial missing → correct subset in missing
- Empty rules (`files: []` or undefined) → passed: true, missing: []

Test scenarios for `extractGoalName`:
- Standard path (`/repo/.pio/goals/my-feature/`) → `"my-feature"`
- Deeply nested path with subdirs after goal name → still extracts just the goal name
- No `/goals/` segment → returns `""`
- Root-level paths, edge cases

**Acceptance criteria:**
- [ ] `validateOutputs` and `extractGoalName` are exported from `src/capabilities/validation.ts` (verify or add exports if needed)
- [ ] `npm test __tests__/validation.test.ts` passes with all tests green
- [ ] All four validateOutputs scenarios covered (all-present, all-missing, partial, empty rules)
- [ ] Path parsing edge cases covered for extractGoalName
- [ ] `npm run check` reports no errors

**Files affected:**
- `src/capabilities/validation.ts` — verify exports exist; add `export` keyword to `extractGoalName` if currently private (no logic changes)
- `__tests__/validation.test.ts` — new file: validation function tests

### Step 4: Export and test step discovery (`step-discovery.test.ts`)

**Description:** Export the internal step-discovery functions from `execute-task.ts` and `review-code.ts`, then write tests covering all step state combinations. These functions rely on filesystem checks (folder existence, marker files), so tests use temp directories to simulate goal workspace trees.

Functions to export:
- From `src/capabilities/execute-task.ts`: `isStepReady(goalDir, stepNumber)`
- From `src/capabilities/review-code.ts`: `isStepReviewable(goalDir, stepNumber)`, `findMostRecentCompletedStep(goalDir)`

Test scenarios for `isStepReady`:
- TASK.md + TEST.md present, no markers → true (ready)
- Missing TASK.md → false
- Missing TEST.md → false
- Has COMPLETED marker → false
- Has BLOCKED marker → false
- Step folder doesn't exist → false

Test scenarios for `isStepReviewable`:
- COMPLETED + SUMMARY.md, no BLOCKED → true
- Missing COMPLETED → false
- Missing SUMMARY.md → false
- Has BLOCKED → false
- Folder doesn't exist → false

Test scenarios for `findMostRecentCompletedStep`:
- No step folders → undefined
- One completed step (S01) → 1
- Multiple steps, highest complete → returns highest number
- Gap in middle (S01 complete, S02 not, S03 exists but not reviewable) → returns 1
- Mix of COMPLETED, BLOCKED states

Also re-test `stepFolderName` edge cases here if not covered by utils tests (S01–S09 padding, two-digit numbers).

**Acceptance criteria:**
- [ ] `isStepReady`, `isStepReviewable`, and `findMostRecentCompletedStep` are exported from their respective modules
- [ ] `npm test __tests__/step-discovery.test.ts` passes with all tests green
- [ ] All state combinations covered (ready, completed, blocked, missing)
- [ ] `stepFolderName` zero-padding verified (S01–S09, S10+)
- [ ] `npm run check` reports no errors

**Files affected:**
- `src/capabilities/execute-task.ts` — add `export` to `isStepReady` function
- `src/capabilities/review-code.ts` — add `export` to `isStepReviewable` and `findMostRecentCompletedStep` functions
- `__tests__/step-discovery.test.ts` — new file: step discovery and state machine tests

### Step 5: Test capability config resolution (`capability-config.test.ts`)

**Description:** Write tests for `resolveCapabilityConfig(cwd, params)` from `src/utils.ts`. This function dynamically imports capability modules and reads `CAPABILITY_CONFIG` exports. Since integration with the pi framework is out of scope, tests focus on the happy path: resolving known capability names to valid configs, handling missing capabilities gracefully, and verifying derived fields.

Test scenarios for `resolveCapabilityConfig`:
- Valid capability name (e.g., `"create-goal"`) → returns config with correct `capability`, `workingDir`, `sessionName`
- Goal-scoped params (`goalName` present) → `workingDir` resolves to `.pio/goals/<name>`
- Non-goal-scoped (no goalName) → `workingDir` falls back to `cwd`
- Missing capability name in params → returns `undefined`
- Unknown/nonexistent capability name → returns `undefined` (dynamic import fails gracefully)
- `defaultInitialMessage` is called and returns a non-empty string containing path info
- Step-dependent config fields (`validation`, `readOnlyFiles`, `writeAllowlist` callbacks) are resolved with correct params

**Acceptance criteria:**
- [ ] `npm test __tests__/capability-config.test.ts` passes with all tests green
- [ ] Happy-path resolution verified (at least 2 known capabilities tested)
- [ ] Graceful handling of missing/unknown capabilities
- [ ] `workingDir`, `sessionName`, and `initialMessage` derivation verified
- [ ] Step-dependent callbacks invoked correctly when stepNumber is present
- [ ] `npm run check` reports no errors

**Files affected:**
- `__tests__/capability-config.test.ts` — new file: capability config resolution tests

### Step 6: Test workflow transitions (`transition.test.ts`)

**Description:** Write tests for `CAPABILITY_TRANSITIONS` and `resolveNextCapability(capability, ctx)` from `src/utils.ts`. These define the deterministic task flow between capabilities. Tests verify every transition path, param propagation, and conditional branching (approval vs rejection).

Test scenarios:
- `create-goal → create-plan`: Deterministic string transition, params preserved
- `create-plan → evolve-plan`: Deterministic string transition
- `evolve-plan → execute-task`: With stepNumber in params → TransitionResult with goalName + stepNumber; without stepNumber → plain capability name
- `execute-task → review-code`: Same pattern as evolve-plan (with/without stepNumber)
- `review-code → evolve-plan` (approval path): When APPROVED file exists at `{workingDir}/{stepFolder}/APPROVED`, stepNumber is incremented (+1)
- `review-code → execute-task` (rejection path): When APPROVED file doesn't exist, same stepNumber preserved for re-execution
- Unknown capability → returns `undefined`

**Acceptance criteria:**
- [ ] `npm test __tests__/transition.test.ts` passes with all tests green
- [ ] All six defined transitions tested (create-goal, create-plan, evolve-plan, execute-task, review-code approval, review-code rejection)
- [ ] Param propagation verified (goalName, stepNumber preserved or incremented correctly)
- [ ] `resolveNextCapability` returns consistent `TransitionResult` shape for both string and callback transitions
- [ ] Unknown capabilities return `undefined`
- [ ] `npm run check` reports no errors

**Files affected:**
- `__tests__/transition.test.ts` — new file: workflow transition tests (uses temp dirs to simulate APPROVED file existence)

### Step 7: Add GitHub Actions CI workflow

**Description:** Create a GitHub Actions workflow that runs on every push and pull request to the `main` branch. The pipeline installs dependencies, runs type checking (`npm run check`), and executes the test suite (`npm test`). This ensures all automated checks pass before merging.

**Acceptance criteria:**
- [ ] `.github/workflows/ci.yml` exists with valid GitHub Actions syntax
- [ ] Workflow triggers on `push` to `main` and `pull_request` to `main`
- [ ] Runs on a recent Node.js version (20.x or 22.x)
- [ ] Steps include: checkout, setup Node.js, `npm install`, `npm run check`, `npm test`
- [ ] Workflow file is syntactically valid YAML

**Files affected:**
- `.github/workflows/ci.yml` — new file: CI workflow definition

## Notes

- **Temp directories for filesystem tests:** Use `fs.mkdtempSync(os.tmpdir())` with proper cleanup in `afterEach`. This avoids polluting the real `.pio/` directory and ensures test isolation.
- **No pi framework mocking required:** The GOAL.md explicitly excludes integration tests. All tested functions are either pure or depend only on filesystem I/O (mockable via temp dirs). Functions that import `ExtensionAPI` types but don't use them in their logic (e.g., `validateOutputs`) are testable as-is.
- **Dynamic imports in resolveCapabilityConfig:** Step 5 will test against real capability modules on disk (e.g., importing `"./capabilities/create-goal"` from the project's source). This works with Vitest's native ESM resolution. For "unknown capability" scenarios, pass a non-existent name — the try/catch in `resolveCapabilityConfig` handles it gracefully.
- **Circular dependency:** The utils.ts ↔ validation.ts ↔ session-capability.ts cycle is already broken via `src/types.ts`. Tests should not introduce new cycles — import types from `src/types.ts`, not from capability modules that re-export them.
- **Coverage target:** Aim for 80%+ coverage on business logic files (`utils.ts`, `validation.ts` pure functions, exported functions from `execute-task.ts`/`review-code.ts`). Coverage is a guide — correctness matters more than hitting arbitrary percentages.
