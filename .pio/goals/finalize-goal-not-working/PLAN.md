---
totalSteps: 4
---
# Plan: Fix finalize-goal bugs

Fix two bugs in the `finalize-goal` capability: missing goal name in initial message and incorrect `workingDir` resolution during state machine auto-transitions.

## Prerequisites

None.

## Steps

## Step 1: Include goal name in defaultInitialMessage

**Description:** Update `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/finalize-goal.ts` to extract the human-readable goal name from params and include it in the kickoff message. Currently the message only references `goalDir` (a raw filesystem path). The fix extracts `params.goalName` alongside `goalDir` so the initial message reads like "Finalize the completed goal 'my-feature' at /path/to/goal."

**Acceptance criteria:**
- [ ] `defaultInitialMessage` produces a string containing both the goal name and goal directory path when called with `{ goalName: "test-goal", goalDir: "/some/path" }`
- [ ] Existing test `CAPABILITY_CONFIG.defaultInitialMessage` still passes (message non-empty, contains goal directory)
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/capabilities/finalize-goal.ts` — extract `goalName` from params in `defaultInitialMessage`, include it in the message string

## Step 2: Fix state machine transition params for finalize-goal

**Description:** Update `transitionEvolvePlan()` in `src/state-machine.ts` so that when routing to `finalize-goal` (the goal-completed guard), the returned params contain `goalDir` and an explicit `workingDir` set to the project root — not just `goalName`. Currently it returns `{ goalName }`, which causes downstream `resolveCapabilityConfig()` to derive `workingDir` as the goal workspace directory.

The fix imports `resolveGoalDir` from `src/fs-utils.ts` (a pure path-joining function, no filesystem I/O), computes `goalDir = resolveGoalDir(process.cwd(), goalName)`, and returns `{ goalName, goalDir, workingDir: process.cwd() }`. This ensures the finalize-goal session resolves `.pio/PROJECT/*.md` paths relative to the project root.

**Acceptance criteria:**
- [ ] When `goalCompleted()` is true, `resolveTransition("evolve-plan", state, { goalName: "feat" })` returns params containing `goalDir`, `goalName`, and `workingDir`
- [ ] The returned `goalDir` equals the resolved goal workspace path (e.g., `<cwd>/.pio/goals/feat`)
- [ ] The returned `workingDir` equals the project root (`process.cwd()`)
- [ ] `npm run check` reports no type errors
- [ ] Non-completion paths (evolve-plan → execute-task) are unaffected — still return `{ goalName, stepNumber }`

**Files affected:**
- `src/state-machine.ts` — import `resolveGoalDir` from `./fs-utils`, compute `goalDir` and `workingDir` in the completion guard of `transitionEvolvePlan`, return them in params

## Step 3: Support explicit workingDir override in resolveCapabilityConfig

**Description:** Update `resolveCapabilityConfig()` in `src/capability-config.ts` to check for an explicit `params.workingDir` before falling back to the `goalName`-based derivation. Currently the function always derives `workingDir = resolveGoalDir(cwd, goalName)` when `goalName` is present. The fix adds a precedence check: if `params.workingDir` is explicitly set (as a string), use it directly; otherwise apply the existing `goalName` → `resolveGoalDir` logic. This allows capabilities like `finalize-goal` to override working directory resolution on a per-transition basis without changing global behavior.

**Acceptance criteria:**
- [ ] When params contain both `goalName` and `workingDir`, `resolveCapabilityConfig` uses the explicit `workingDir` value instead of deriving from `goalName`
- [ ] When only `goalName` is present (no explicit `workingDir`), behavior is unchanged — `workingDir` derives from `goalName` via `resolveGoalDir`
- [ ] When neither is present, behavior is unchanged — `workingDir` falls back to `cwd`
- [ ] Existing tests in `capability-config.test.ts` still pass (no regressions)
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/capability-config.ts` — add explicit `params.workingDir` precedence check before the `goalName`-based derivation

## Step 4: Update tests to verify transition params and initial message

**Description:** Update existing test suites to verify the bug fixes with programmatic assertions. Two areas require updates:

1. In `src/state-machine.test.ts`, the existing test "routes to finalize-goal when goal is completed" asserts only `{ capability: "finalize-goal", params: { goalName: "feat" } }`. Update this and related tests to assert the expanded params shape: `{ goalName, goalDir, workingDir }` with correct computed values.

2. In `src/capabilities/finalize-goal.test.ts`, add a test verifying that `defaultInitialMessage` includes the human-readable goal name when `params.goalName` is provided.

3. In `src/capability-config.test.ts`, add a test verifying that explicit `params.workingDir` overrides the `goalName`-based derivation for `finalize-goal`.

**Acceptance criteria:**
- [ ] `state-machine.test.ts` — completion detection test asserts `result.params.goalDir`, `result.params.goalName`, and `result.params.workingDir` with correct values
- [ ] `finalize-goal.test.ts` — new or updated test confirms initial message contains the goal name string
- [ ] `capability-config.test.ts` — new test confirms explicit `workingDir` in params takes precedence over `goalName` derivation
- [ ] Full test suite passes: `npm run test` exits with code 0
- [ ] `npm run check` reports no type errors

**Files affected:**
- `src/state-machine.test.ts` — update completion detection tests to assert expanded params
- `src/capabilities/finalize-goal.test.ts` — add test for goal name in initial message
- `src/capability-config.test.ts` — add test for explicit workingDir override

## Notes

- `resolveGoalDir` is a pure function (`path.join(cwd, ".pio", "goals", name)`) with no filesystem I/O. Importing it into `state-machine.ts` does not violate the "pure transition functions" principle.
- The circular dependency concern between `validation.ts` ↔ `session-capability.ts` exists but is documented in `types.ts`. No new cycles are introduced by these changes.
- `process.cwd()` usage in `transitionEvolvePlan` matches the existing pattern in `session-capability.ts` (line ~143: `enqueueTask(process.cwd(), ...)`). The state machine uses it at transition resolution time, which is always within a pi session context where cwd is well-defined.
- Step 2 and Step 3 are tightly coupled — the explicit `workingDir` in params from Step 2 requires the precedence check in Step 3. They must be implemented in order.
