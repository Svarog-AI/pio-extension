# Accumulated Decisions (Step 3)

## Key Architecture Decision: Explicit workingDir override in resolveCapabilityConfig

`resolveCapabilityConfig()` (`src/capability-config.ts`) checks `params.workingDir` as a string before falling back to the `goalName` → `resolveGoalDir` derivation. This gives per-transition control over directory resolution without changing global behavior for goal-scoped capabilities. Downstream impact: any capability or transition can now opt out of goal-scoped `workingDir` by passing an explicit value.

## Plan Deviation

None. Step 3 follows the plan as specified — adding the precedence check to `resolveCapabilityConfig()` exactly as described in PLAN.md Step 3.

## Context from Prior Steps

- **Step 1:** Modified `defaultInitialMessage` in `finalize-goal.ts` to include goal name. Fully contained — no downstream impact beyond the capability itself.
- **Step 2:** Updated `transitionEvolvePlan()` to return `{ goalName, goalDir, workingDir: process.cwd() }` for the finalize-goal transition. This is what supplies the explicit `workingDir` that Step 3's precedence check will honor.
