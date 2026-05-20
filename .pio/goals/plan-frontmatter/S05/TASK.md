# Task: Implement infrastructure-managed completion in evolve-plan

Modify `validateAndFindNextStep()` in evolve-plan to detect goal-level completion using PLAN.md frontmatter (`totalSteps`) and write the COMPLETED marker automatically — replacing reliance on the Specification Writer agent to manually create it.

## Context

Currently, evolve-plan determines "all steps specified" only when a sub-session runs and the Specification Writer agent discovers its step doesn't exist in PLAN.md (the agent writes `COMPLETED` manually). There's no infrastructure check that compares the requested step against the declared plan size. With frontmatter now providing `totalSteps`, evolve-plan can detect completion proactively at the tool entry point — before launching any session. This eliminates the wasted sub-session and provides deterministic completion detection.

## What to Build

Modify `validateAndFindNextStep()` in `src/capabilities/evolve-plan.ts` to add frontmatter-based completion detection. The function already creates a `GoalState` via `createGoalState(goalDir)` and has access to `state.planMetadata()`. Insert a new check between the existing PLAN.md existence check and the existing COMPLETED pre-launch guard.

### Code Components

#### New completion check in `validateAndFindNextStep()`

Insert this logic **after** `if (!state.hasPlan())` and **before** the COMPLETED marker check:

1. Read `totalSteps` from frontmatter via `state.planMetadata()`. This returns `PlanFrontmatter | null`.
2. If frontmatter is available (not `null`), compare `state.currentStepNumber()` against `metadata.totalSteps`.
3. When `currentStepNumber() > totalSteps`:
   - Write an empty `<goalDir>/COMPLETED` marker file using `fs.writeFileSync()`
   - Return `{ goalDir, ready: false, error: "<message>" }` with a message like `"All X plan steps for \"<name>\" have been specified. No further specification work required."` where X is `totalSteps`.
4. If frontmatter is unavailable (`null`), skip this check entirely — proceed to the existing COMPLETED guard and normal flow. This ensures backward compatibility with plans that haven't been migrated yet.

**Important:** The comparison uses `state.currentStepNumber()`, not a step number from params. `currentStepNumber()` returns the first non-APPROVED step, or `N+1` when all N steps are APPROVED. When this exceeds `totalSteps`, it means all plan steps have been approved — no more specification work remains.

### Approach and Decisions

- **Use `state.planMetadata()` without `{ errors: true }`:** At this point we only need to know if frontmatter is available or not. Return `null` on failure; proceed to fallback behavior. No need for detailed error messages here — this is infrastructure detection, not agent-facing validation.
- **Placement matters:** The new check goes between the PLAN.md existence guard and the COMPLETED marker guard. This ensures: (a) we only check frontmatter when PLAN.md exists, (b) if a previous run already wrote COMPLETED, that guard still catches it (defense-in-depth).
- **Write COMPLETED as infrastructure-managed:** Use `fs.writeFileSync(completedPath, "", "utf-8")`. The COMPLETED marker is already in the write allowlist for evolve-plan sessions and causes `validateOutputs` to pass (see `validation.ts`). This ensures backward compatibility with existing exit-gate logic.
- **Referenced decision from DECISIONS.md:** The completion condition is `currentStepNumber() > totalSteps`, not a params-derived step number. This matches Step 6's approach in `transitionEvolvePlan` and is consistent across the plan frontmatter feature.

## Dependencies

- Step 1: `PLAN_FRONTMATTER_SCHEMA` must be exported from `src/frontmatter-schemas.ts`
- Step 2: `planMetadata()` must be available on `GoalState` interface and factory
- Both steps are approved and their implementation is complete.

## Files Affected

- `src/capabilities/evolve-plan.ts` — modify `validateAndFindNextStep()`: add frontmatter-based completion check, write COMPLETED marker, return not-ready result. Import `PlanFrontmatter` from `../frontmatter-schemas` if needed for type annotation.
- `src/capabilities/evolve-plan.test.ts` — add unit tests for the new completion detection logic

## Acceptance Criteria

- [ ] `validateAndFindNextStep()` checks `GoalState.planMetadata()` for `totalSteps`
- [ ] When `currentStepNumber() > totalSteps`, writes `<goalDir>/COMPLETED` marker and returns not-ready result (`{ ready: false, error }`)
- [ ] Error message indicates all steps are complete (not treated as a failure condition — the COMPLETED marker causes `validateOutputs` to pass)
- [ ] Existing COMPLETED guard below the new check still prevents relaunch when marker exists
- [ ] Normal flow (`currentStepNumber() <= totalSteps`) proceeds unchanged to launch/enqueue
- [ ] When frontmatter is unavailable (`planMetadata()` returns `null`), the check is skipped — normal flow continues
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **COMPLETED write failure:** If `fs.writeFileSync` throws (e.g., permission denied), the function should propagate the error naturally. This shouldn't happen in normal operation since evolve-plan sessions already have COMPLETED in their write allowlist.
- **Frontmatter unavailable:** Plans without frontmatter (`planMetadata()` returns `null`) must continue working normally — no regression for existing plans. The new check is purely additive.
- **COMPLETED already exists:** The pre-launch guard (below the new check) will catch this and refuse relaunch. Both guards can trigger but won't conflict since they return the same `{ ready: false }` shape.
- **Race condition:** If two evolve-plan instances run concurrently, both might try to write COMPLETED. `fs.writeFileSync` is idempotent for empty files — no data corruption possible.
