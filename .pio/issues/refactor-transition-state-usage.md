# Refactor transition functions to use GoalState values instead of extracting from params

# Refactor transition functions to use GoalState values

## Problem

Transition functions in `src/state-machine.ts` extract `goalName` and `stepNumber` from `params` using `extractGoalName(params)` and `extractStepNumber(params)`, then fall back to `state.currentStepNumber()` when params don't have them.

But `GoalState` already provides these values directly:
- `state.goalName` — constant, derived from the goal directory at construction
- `state.currentStepNumber()` — lazy-evaluated filesystem scan

## Current Pattern

```typescript
function transitionEvolvePlan(state: GoalState, params?: Record<string, unknown>): TransitionResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    return { capability: "execute-task", params: { goalName, stepNumber: explicitStepNumber } };
  }
  const stepNumber = state.currentStepNumber();
  return { capability: "execute-task", params: { goalName, stepNumber } };
}
```

## Target Pattern

```typescript
function transitionEvolvePlan(state: GoalState, params?: Record<string, unknown>): TransitionResult | undefined {
  const stepNumber = extractStepNumber(params) ?? state.currentStepNumber();
  return { capability: "execute-task", params: { goalName: state.goalName, stepNumber } };
}
```

## Affected Functions

- `transitionEvolvePlan()` — uses `extractStepNumber`, `extractGoalName`, falls back to `state.currentStepNumber()`
- `transitionExecuteTask()` — same pattern
- `transitionReviewTask()` — uses `extractStepNumber`, `extractGoalName`, falls back to `state.currentStepNumber()`

## Benefits

- Eliminates redundant `extractGoalName` calls — `state.goalName` is always available and correct
- Simplifies the dual-source pattern (params vs state) for step numbers
- Makes the GoalState the single source of truth for goal identity, as intended by the architecture
- `extractStepNumber` from params is still useful when the caller wants to override the filesystem-derived step number (e.g., re-executing a specific step), but the goal name should never come from params

## Category

improvement

## Context

Files: `src/state-machine.ts` (transition functions), `src/goal-state.ts` (GoalState interface with `goalName` and `currentStepNumber()`)
