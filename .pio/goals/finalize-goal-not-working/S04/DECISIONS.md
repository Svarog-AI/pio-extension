# Accumulated Decisions (Step 4)

## Key Architecture Decision: Explicit workingDir override in resolveCapabilityConfig

`resolveCapabilityConfig()` (`src/capability-config.ts`) checks `params.workingDir` as a string before falling back to the `goalName` → `resolveGoalDir` derivation. This gives per-transition control over directory resolution without changing global behavior for goal-scoped capabilities. Downstream impact: any capability or transition can now opt out of goal-scoped `workingDir` by passing an explicit value.

## Context from Prior Steps

- **Step 1:** Modified `defaultInitialMessage` in `finalize-goal.ts` to include goal name using quoted format (`"my-feature"`) with graceful fallback to `"goal workspace"` when absent. Fully contained — no downstream impact.
- **Step 2:** Updated `transitionEvolvePlan()` to return `{ goalName, goalDir, workingDir: process.cwd() }` for the finalize-goal auto-transition. Uses `process.cwd()` directly, matching existing patterns in `session-capability.ts`. Re-exported `resolveGoalDir` from `state-machine.ts` for backward compatibility.
- **Step 3:** Added three-way precedence in `resolveCapabilityConfig()`: explicit `workingDir` > `goalName` via `resolveGoalDir` > `cwd` fallback. Empty string `workingDir` is treated as absent. Uses defensive extraction pattern matching existing code.

## Plan Deviations

None. Step 4 follows the plan as specified — updating tests to verify all three bug fixes with programmatic assertions. Steps 1-3 each included their own test updates as part of implementation (TDD workflow), so Step 4 verifies completeness and adds any remaining integration coverage.
