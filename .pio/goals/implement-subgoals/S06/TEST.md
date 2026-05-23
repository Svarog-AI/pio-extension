# Tests: Subgoal lifecycle wiring

Verifies that `transitionEvolvePlan` passes `initialMessage` with a relative TASK.md path for subgoal steps, and that `pio_mark_complete` uses the transition's adjusted `goalName` as the queue key for `enqueueTask`.

## Unit Tests

### State machine — initialMessage

Given a subgoal step with complexity "subgoal" when transitionEvolvePlan routes to create-goal then params include initialMessage with a relative TASK.md path.
Given a subgoal step at S03 when transitionEvolvePlan constructs initialMessage then the relative path resolves from subgoal workspace to parent S03/TASK.md.
Given a regular task step when transitionEvolvePlan routes to execute-task then params do not include initialMessage.
Given a subgoal step with step number 1 when transitionEvolvePlan constructs initialMessage then the path uses path.relative (platform-portable).

### Session capability — queue key propagation

Given a finalize-goal transition returning parentGoalName as goalName when pio_mark_complete enqueues the next task then enqueueTask receives the parent goal name as the queue key.
Given a flat goal transition where params.goalName equals state.goalName when pio_mark_complete enqueues the next task then enqueueTask receives the flat goal name as the queue key.
Given a subgoal completion with parentGoalName "parent" when pio_mark_complete enqueues the next task then the queue file is task-parent.json, not task-child.json.

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npx vitest run is executed then all tests pass with no regressions.
