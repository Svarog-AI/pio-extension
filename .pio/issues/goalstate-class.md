# Convert GoalState from factory/plain-object to a TypeScript class

## Problem

`GoalState` is implemented as a factory function (`createGoalState`) returning a plain object literal. This forces workarounds like the `_planMetadata` closure variable so that one method can call another — `this` doesn't work inside plain object literals.

## Current pattern

```typescript
export function createGoalState(goalDir: string): GoalState {
  const _planMetadata = (options) => { /* shared logic */ };
  return {
    planMetadata: _planMetadata,
    totalPlanSteps: () => { _planMetadata() /* delegate via closure */ },
    // ...
  };
}
```

## Proposed change

Convert to a class:

```typescript
export class GoalState implements GoalState {
  constructor(goalDir: string) { /* ... */ }
  planMetadata(options?) { /* ... */ }
  totalPlanSteps() { return this.planMetadata()?.totalSteps; }
  // ...
}
```

## Benefits
- Methods can reference each other via `this` — no closure workarounds needed
- Cleaner DRY: `totalPlanSteps()` delegates to `this.planMetadata()` naturally
- Standard TypeScript pattern — easier to reason about, extend, or mock in tests
- Interface + class separation already exists (interface `GoalState` could remain for consumers)

## Scope
- `src/goal-state.ts` — refactor factory to class
- `src/goal-state.test.ts` — update `createGoalState(...)` to `new GoalState(...)`
- Any other file that imports `createGoalState` — update call sites

## Category

improvement

## Context

File: `src/goal-state.ts`. Discovered during Step 2 review of the plan-frontmatter goal — the `_planMetadata` closure workaround was needed because `totalPlanSteps()` can't use `this.planMetadata()` in a plain object literal.
