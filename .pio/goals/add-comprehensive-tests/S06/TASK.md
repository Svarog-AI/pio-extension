# Task: Test workflow transitions (`transition.test.ts`)

Write tests for `CAPABILITY_TRANSITIONS` and `resolveNextCapability(capability, ctx)` from `src/utils.ts` to verify the deterministic task flow between pio capabilities.

## Context

The pio workflow chains capabilities together: create-goal → create-plan → evolve-plan → execute-task → review-code → (evolve-plan or execute-task). The transition logic lives in `src/utils.ts` as `CAPABILITY_TRANSITIONS` (a map) and `resolveNextCapability()` (the resolver). Simple transitions are plain strings; conditional transitions (evolve-plan, execute-task, review-code) are callbacks that inspect runtime state — step numbers, file existence on disk. Tests must verify every transition path, param propagation, and the approval/rejection fork in review-code.

## What to Build

A single test file `__tests__/transition.test.ts` with comprehensive coverage of all six defined transitions plus the unknown-capability fallback. The review-code approval path requires a filesystem check (`APPROVED` file existence), so tests need temporary directories to simulate goal workspace trees.

### Code Components

#### `CAPABILITY_TRANSITIONS` static structure
- Verify the map contains entries for all six capabilities: `create-goal`, `create-plan`, `evolve-plan`, `execute-task`, `review-code`
- Verify string-valued transitions (create-goal → "create-plan", create-plan → "evolve-plan")

#### `resolveNextCapability(capability, ctx)` — deterministic transitions
- **create-goal → create-plan:** Returns `{ capability: "create-plan", params: ctx.params }`. Params are preserved as-is.
- **create-plan → evolve-plan:** Same pattern — returns `{ capability: "evolve-plan", params: ctx.params }`.

#### `resolveNextCapability` — callback transitions with stepNumber
- **evolve-plan → execute-task (with stepNumber):** When `ctx.params.stepNumber` is a number, returns `TransitionResult` with `capability: "execute-task"` and `params` containing both `goalName` and `stepNumber`.
- **evolve-plan → execute-task (without stepNumber):** Returns plain string wrapped in `TransitionResult` — `{ capability: "execute-task", params: ctx.params }`.
- **execute-task → review-code (with stepNumber):** Same pattern — propagates `goalName` + `stepNumber`.
- **execute-task → review-code (without stepNumber):** Falls back to plain string wrap.

#### `resolveNextCapability` — review-code conditional branching (filesystem-dependent)
- **Approval path (APPROVED file exists):** When `{workingDir}/{stepFolder(stepNumber)}/APPROVED` exists, returns `capability: "evolve-plan"` with `stepNumber` incremented by 1.
- **Rejection path (APPROVED file missing):** When APPROVED doesn't exist but stepNumber is present, returns `capability: "execute-task"` with the same `stepNumber` preserved.
- **No stepNumber:** Falls back to `"execute-task"` plain string.

#### Unknown capability
- Any capability name not in `CAPABILITY_TRANSITIONS` returns `undefined`.

### Approach and Decisions

- Follow the established test patterns: use `fs.mkdtempSync(os.tmpdir())` + cleanup in `afterEach` for filesystem-dependent tests (review-code approval/rejection).
- For non-filesystem tests (deterministic transitions), simple string paths suffice — no temp directories needed.
- Import `CAPABILITY_TRANSITIONS`, `resolveNextCapability`, `TransitionContext`, `stepFolderName` from `../src/utils`.
- Use `vi.spyOn(fs, "existsSync")` for mocking the APPROVED file check — this avoids creating real directories and keeps tests fast (small tests per the test pyramid). Alternatively, create real temp dirs as done in `step-discovery.test.ts`. Since review-code is a filesystem-dependent transition callback, using real temp directories is preferred per TDD guidelines (prefer real implementations over mocks).
- Organize into logical `describe` blocks matching the six transitions plus unknown-capability handling.

## Dependencies

- **Step 1 (Vitest configuration):** Vitest must be installed and configured (`vitest.config.ts`, `npm test` script).
- **Steps 2–5:** No direct code dependency, but tests should not regress existing tests (full suite pass required).

## Files Affected

- `__tests__/transition.test.ts` — created: workflow transition tests (uses temp dirs to simulate APPROVED file existence)

## Acceptance Criteria

- [ ] `npm test __tests__/transition.test.ts` passes with all tests green
- [ ] All six defined transitions tested (create-goal, create-plan, evolve-plan, execute-task, review-code approval, review-code rejection)
- [ ] Param propagation verified (goalName, stepNumber preserved or incremented correctly)
- [ ] `resolveNextCapability` returns consistent `TransitionResult` shape for both string and callback transitions
- [ ] Unknown capabilities return `undefined`
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- The `review-code` callback reads the filesystem (`fs.existsSync`) to check for APPROVED. Tests must either mock this or use real temp directories. Real directories are preferred per TDD skill guidelines but require proper cleanup.
- `resolveNextCapability` wraps string transitions in `TransitionResult` with `params: ctx.params`. When `ctx.params` is `undefined`, the result should have `params: undefined` — verify this edge case.
- The stepNumber increment in review-code approval must produce `stepNumber + 1`, not modify the original params object. Verify immutability.
