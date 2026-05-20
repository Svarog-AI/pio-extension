# Encapsulate COMPLETED marker writes in GoalState (markCompleted)

## Problem

After Step 6 adds `goalCompleted(): boolean` to `GoalState`, the *read* side of completion detection is covered — both transitionEvolvePlan and validateAndFindNextStep call `state.goalCompleted()` instead of doing manual checks.

However, `validateAndFindNextStep()` still does a COMPLETED marker *write* as a side effect:
```typescript
fs.writeFileSync(completedPath, "", "utf-8"); // infrastructure-managed completion
```

This is a capability-level concern — should it also live on GoalState? If so, `goalCompleted()` is a read-only query and a companion `markCompleted()` method would handle writes. This makes the COMPLETED marker fully encapsulated in the state abstraction: capabilities never touch it directly via `fs.writeFileSync`.

## Fix (if pursued)

- Add `markCompleted(): void` to GoalState — writes `<goalDir>/COMPLETED`
- Refactor evolve-plan's `fs.writeFileSync(completedPath, "", "utf-8")` to `state.markCompleted()`
- Consider whether other COMPLETED-touching code (e.g. validation.ts passing when COMPLETED exists) benefits from this encapsulation

## Files affected

- `src/goal-state.ts` — add `markCompleted()` method
- `src/capabilities/evolve-plan.ts` — replace direct write with GoalState call

## Notes

Optional cleanup. Step 6 uses `goalCompleted()` for the read/check but keeps the write in evolve-plan (matching current behavior). This issue tracks the broader encapsulation question.

## Category

improvement

## Context

Related to plan-frontmatter goal, Step 6. Depends on `goalCompleted()` being implemented. See `src/capabilities/evolve-plan.ts` for the current `fs.writeFileSync(completedPath, "", "utf-8")` call.
