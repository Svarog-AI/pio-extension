# Ambiguous return type on GoalState.planMetadata() forces type assertions at every call site

## Problem

`GoalState.planMetadata()` has a 3-way union return type:

```ts
planMetadata: (options?: { errors?: boolean }) =>
  | PlanFrontmatter
  | null
  | { data?: PlanFrontmatter; error?: string };
```

When called **without** options (the common case), the caller still gets all three variants, forcing a type assertion:

```ts
const metadata = state.planMetadata() as PlanFrontmatter | null;
```

This happens in `goal-state.ts` (`totalPlanSteps`) and `evolve-plan.ts`. Every new consumer will need the same cast. The `{ data?; error? }` variant should only appear when `{ errors: true }` is explicitly passed.

## Impact

- Requires manual type narrowing at every call site
- Masks runtime mismatches — the cast doesn't verify the actual shape
- Same pattern exists for `getReviewOutputs()` but the fix applies to both

## Suggested Fix

Use TypeScript method overloads on a class, or split into two methods:

```ts
planMetadata(): PlanFrontmatter | null;
planMetadata(options: { errors: true }): { data?: PlanFrontmatter; error?: string };
```

Or rename the error-returning variant (e.g., `planMetadataWithError()`) to keep the simple case clean.

## Category

improvement

## Context

Affected files: src/goal-state.ts (line ~108, totalPlanSteps cast; line ~132-156, _planMetadata definition). Same pattern in getReviewOutputs() at line ~174. Consumer in src/capabilities/evolve-plan.ts line 107.
