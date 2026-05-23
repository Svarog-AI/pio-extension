# Task: Subgoal lifecycle wiring

Connect the critical path for subgoals to work end-to-end: the state machine tells create-goal where to find context, and the session capability routes completion back to the parent queue slot.

## Context

Step 4 added subgoal spawning (`transitionEvolvePlan` routes to `create-goal` with parent context) and completion propagation (`transitionFinalizeGoal` routes back to parent's `evolve-plan`). However, two critical gaps remain:

1. The create-goal session doesn't know where to find the parent step's TASK.md for decomposition scope context — there's no `initialMessage` guiding it.
2. When a subgoal completes via `finalize-goal`, `pio_mark_complete` enqueues the next task using `state.goalName` (the subgoal's leaf name) as the queue key. This writes to the wrong queue file (`task-nested-feature.json`) instead of the parent's slot (`task-parent.json`), breaking the `/pio-next-task` resumption chain.

## What to Build

### Code Components

#### 1. `transitionEvolvePlan` — add `initialMessage` with relative TASK.md path

In `src/state-machine.ts`, extend the subgoal spawning block (inside `transitionEvolvePlan`) to pass an `initialMessage` param. This is a string constructed purely from paths — no file I/O.

**Behavior:**
- When routing to `create-goal` for a subgoal step, compute the relative path from the subgoal workspace (`subgoalWorkingDir`) to the parent step's TASK.md (`<parentStepDir>/TASK.md`).
- Use Node.js `path.relative(subgoalWorkingDir, path.join(parentStepDir, "TASK.md"))` to produce a portable relative path (e.g., `../../TASK.md` on POSIX).
- Construct `initialMessage` as: `"This is a subgoal step. Read <relative_path> from the parent goal for decomposition scope context."`

**Current code (subgoal spawning return block):**
```typescript
return {
  capability: "create-goal",
  params: {
    goalName: stepMetadata.name,
    parentGoalName: goalName,
    parentStepNumber: explicitStepNumber,
    subgoalType: true,
    workingDir: subgoalWorkingDir,
  },
};
```

**After the change:** add `initialMessage` to the params object. The `path.relative()` call should use `subgoalWorkingDir` and `path.join(parentStepDir, "TASK.md")`.

#### 2. `pio_mark_complete` — use transition's adjusted `goalName` as queue key

In `src/capabilities/session-capability.ts`, the `enqueueTask` call uses `goalName` (from `state.goalName`, which is always the leaf basename). For subgoals completing via `finalize-goal`, this writes to the subgoal's own queue file instead of the parent's.

**Behavior:**
- After computing `adjustedParams = nextTask.params || {}`, extract `goalName` from adjusted params when present: `typeof adjustedParams.goalName === "string" ? adjustedParams.goalName : goalName`.
- Use this derived value as the second argument to `enqueueTask(cwd, queueKey, task)`.
- For flat goals, `adjustedParams.goalName` equals `state.goalName` — behavior is identical.
- For subgoals completing via `finalize-goal`, `transitionFinalizeGoal` sets `goalName: parentGoalName` in returned params. The queue key becomes the parent goal name, writing to `task-parent.json` and restoring the parent workflow slot.

**Current code (enqueueTask call):**
```typescript
const adjustedParams = nextTask.params || {};
// ... finalStepNumber computation ...
enqueueTask(process.cwd(), goalName, {
  capability: nextTask.capability,
  params: {
    goalName,
    ...adjustedParams,
    // ...
  },
});
```

**After the change:** compute a `queueGoalName` from `adjustedParams.goalName` (when present) or fall back to `goalName`, and pass that as the second argument to `enqueueTask`.

### Approach and Decisions

- **No file I/O in state machine.** The `initialMessage` is constructed purely from path strings using `path.relative()`. This keeps `transitionEvolvePlan` a pure function — no disk reads.
- **Follow the optional-parameter guard pattern.** Use `typeof adjustedParams.goalName === "string"` (not truthy) to distinguish explicit string goal names from missing values. Consistent with S01/S02 conventions.
- **Reference prior decisions:** DECISIONS.md documents that `steps()` derives from frontmatter, `complexity` defaults to `"task"`, and TASK.md is the universal step input artifact.
- **Step 5 eliminated TEST.md from evolve-plan outputs.** The executor reading this TASK.md will derive tests from acceptance criteria. No coordination with TEST.md needed in this step.

## Dependencies

- **Step 1 (path-resolution-infrastructure):** Uses `stepFolderName()` and `resolveGoalDir()` for path construction. Already completed.
- **Step 4 (state-machine-transitions):** Extends existing subgoal spawning block and completion propagation logic. Already completed.
- **Step 2 (queue-keying):** `enqueueTask` accepts the goal name key that determines the queue filename. Already completed.

## Files Affected

- `src/state-machine.ts` — add `initialMessage` to subgoal routing params in `transitionEvolvePlan` (additive)
- `src/state-machine.test.ts` — test for `initialMessage` presence and correct relative path construction
- `src/capabilities/session-capability.ts` — use transition's adjusted `goalName` as the queue key for `enqueueTask`
- `src/capabilities/session-capability.test.ts` — test that `pio_mark_complete` uses parent goal name when enqueuing after subgoal completion

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] Running existing test suite passes with no regressions
- [ ] `transitionEvolvePlan` passes `initialMessage` with relative TASK.md path when routing to create-goal for subgoal steps
- [ ] The `initialMessage` string contains a valid relative path (computed via `path.relative`) from subgoal workspace to parent step's TASK.md (e.g., `../../TASK.md` on POSIX)
- [ ] `pio_mark_complete` uses transition's adjusted `params.goalName` as the queue key for `enqueueTask` (parent goal name for subgoals, unchanged for flat goals)
- [ ] Flat goals without subgoals continue to function identically — queue key is still `state.goalName` when transition doesn't override it

## Risks and Edge Cases

- **Path separator differences:** `path.relative()` produces platform-specific separators. On Windows, the relative path would use `\`. This is acceptable since pio runs on POSIX environments (the subgoal workspace and TASK.md are on the same filesystem). If cross-platform portability becomes a concern, normalize with `.replace(/\\/g, "/")` — but this is not required for the initial implementation.
- **State machine purity:** Adding `path.relative()` to `transitionEvolvePlan` keeps it pure (no file I/O) as long as only string operations are used. Do not introduce `fs.existsSync` or `fs.readFileSync` checks for TASK.md existence.
- **EnqueueTask params spreading order:** In the current code, `{ goalName, ...adjustedParams }` means `adjustedParams.goalName` overrides `goalName` in the enqueued task params. The queue key change is independent of this — it affects only the filename (second arg), not the params payload. Ensure both are consistent: the queue key should match whatever `goalName` ends up being in the enqueued params.
