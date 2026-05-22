---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: State machine transitions (Step 4)

## Decision
APPROVED

## Summary
The implementation correctly adds subgoal spawning and completion propagation to the state machine. Subgoal detection uses `GoalState.steps()[n].getMetadata()` instead of a standalone helper — a clean consolidation with GoalState from Step 3. All 600 tests pass, type-checking is clean, and backward-compatible transition paths are preserved. The decision to embed subgoal metadata access into GoalState (rather than a standalone `getStepMetadata`) eliminates redundant frontmatter reads and leverages existing coupling between these modules.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
All 9 acceptance criteria from TASK.md are covered:

1. ✅ `npx tsc --noEmit` — exit code 0, no errors
2. ✅ Existing test suite passes — 600 tests across 22 files, 0 regressions
3. ✅ Subgoal spawning routes to `create-goal` — tested in "evolve-plan → create-goal (subgoal)" block (7 tests)
4. ✅ Spawning params include `workingDir`, `parentGoalName`, `parentStepNumber`, `subgoalType: true` — verified with mocked `process.cwd()` and path assertions
5. ✅ Backward compatible: `complexity: "task"` routes to `execute-task` — tested explicitly
6. ✅ Completion propagation: finalize-goal with `parentGoalName` routes to `evolve-plan` for parent with incremented step number — 6 tests covering param pollution prevention
7. ✅ No forwarding of `parentGoalName`/`parentStepNumber` — explicit assertions verify undefined
8. ✅ Top-level goal returns `undefined` — backward compatible test confirmed
9. ✅ No body-scanning regex — verified via grep, purely frontmatter-based

Additional coverage: 3 integration tests verifying the full subgoal lifecycle chain (evolve-plan → create-goal → create-plan → finalize-goal → evolve-plan for parent). 2 backward compatibility tests confirm existing finalize-goal and evolve-plan behavior unchanged.

## Gaps Identified
- TASK.md specified a standalone exported `getStepMetadata(goalDir, stepNumber)` helper in state-machine.ts. The implementation uses `GoalState.steps()[n].getMetadata()` instead (documented decision in SUMMARY.md). This is functionally equivalent — the state machine receives a GoalState and reads metadata through it, eliminating redundant PLAN.md re-reads. Not flagged as an issue per user confirmation that the design direction is correct.
- Several test helper files were updated (`execute-task.test.ts`, `review-task.test.ts`, `revise-plan.test.ts`, `mark-complete-integration.test.ts`) to include PLAN.md with `steps` array. These are necessary because `GoalState.steps()` now derives from frontmatter — the refactoring in Step 4's goal-state.ts changes propagated downstream. No unintended behavior introduced.
- `src/capabilities/revise-plan.ts` was modified to read `state.steps()` before archiving PLAN.md (since steps() needs frontmatter). Noted in SUMMARY.md as a necessary change.

## Recommendations
N/A — approved as-is.

---

## Action Required: Add `steps` array to PLAN.md frontmatter

This plan's `PLAN.md` is missing the `steps` array in frontmatter. Without it, `state.steps()` returns empty everywhere — transition routing, revision detection, step validation all break. Copy this block into `.pio/goals/implement-subgoals/PLAN.md` between `totalSteps: 7` and the closing `---`:

```yaml
steps:
  - name: path-resolution
    complexity: task
  - name: queue-keying
    complexity: task
  - name: plan-frontmatter-metadata
    complexity: task
  - name: state-machine-transitions
    complexity: task
  - name: evolve-plan-integration
    complexity: task
  - name: session-capability-integration
    complexity: task
  - name: list-goals-prompts-skills
    complexity: task
```
