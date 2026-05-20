# Task: Add planMetadata() to GoalState and replace totalPlanSteps()

Add a `planMetadata()` method to `GoalState` that reads PLAN.md frontmatter via the existing `extractFrontmatter` + `validateAndCoerce` pipeline, and refactor `totalPlanSteps()` to delegate to it — removing the old `## Step N:` heading-parsing regex entirely.

## Context

Currently `totalPlanSteps()` scans PLAN.md for `## Step N:` headings and returns the highest N found. This is a heuristic that requires parsing document structure. With frontmatter now available (Step 1 added `PLAN_FRONTMATTER_SCHEMA`), the step count should be read from the explicit `totalSteps` field in YAML frontmatter instead. Frontmatter is the sole source of truth; heading parsing is no longer needed for reading step counts.

## What to Build

### New `planMetadata()` method on `GoalState` interface

Matches the overloaded signature pattern of `getReviewOutputs()` exactly:

- **Without options:** `planMetadata(): PlanFrontmatter | null` — backward-compatible, simple consumer contract.
- **With `{ errors: true }`:** `planMetadata({ errors: true }): { data?: PlanFrontmatter; error?: string }` — returns detailed error information instead of `null`. Suppresses `console.warn`.

Reads PLAN.md from disk, extracts YAML frontmatter with `extractFrontmatter`, and validates against `PLAN_FRONTMATTER_SCHEMA` using `validateAndCoerce`.

Returns typed `PlanFrontmatter` on success. Returns `null` (or `{ error }` in errors mode) when: PLAN.md doesn't exist, no frontmatter delimiters, malformed YAML, or validation failure (missing/invalid `totalSteps`).

Lazy-evaluated — reads fresh from disk on every call (no caching).

### Refactored `totalPlanSteps()` method

- Delegates to `planMetadata()`. If it returns a typed object, return `metadata.totalSteps`.
- Returns `undefined` when `planMetadata()` returns `null` (no plan, no frontmatter, or invalid frontmatter).
- **The old heading-parsing loop (`## Step N:` regex scan) is removed entirely.** This logic no longer belongs in `goal-state.ts`.

### Import updates

- Add `PLAN_FRONTMATTER_SCHEMA` and `type PlanFrontmatter` to the import from `./frontmatter-schemas`.
- Remove any unused imports (e.g., if the heading regex was the only use of a variable).

## Code Components

### `GoalState.planMetadata` (interface declaration)

```typescript
planMetadata: (options?: { errors?: boolean }) =>
  | PlanFrontmatter
  | null
  | { data?: PlanFrontmatter; error?: string };
```

Follows the same overloaded signature as `getReviewOutputs()`. Without options returns typed data or `null` (with `console.warn` on errors). With `{ errors: true }` returns `{ data | error }` and suppresses warnings.

### Factory implementation (`createGoalState`)

Inside the returned object in `createGoalState()`:

1. Add `planMetadata: (options?: { errors?: boolean }) => { ... }` — reads PLAN.md, calls `extractFrontmatter`, passes to `validateAndCoerce<PlanFrontmatter>(raw, PLAN_FRONTMATTER_SCHEMA)`. Follow the exact branching logic of `getReviewOutputs()`: when `errors` is true, return `{ data }` or `{ error }`; otherwise return typed data, `null` (with `console.warn` on failure).
2. Replace the `totalPlanSteps: () => { ... }` body to call `planMetadata()` without options and return `metadata ? metadata.totalSteps : undefined`.

Note: inside `createGoalState`, the factory doesn't use `this` — it returns a plain object. The implementation should store `planMetadata` logic inline or extract it into a local function. Follow the existing pattern: each method is a self-contained closure over `goalDir`.

## Approach and Decisions

- **Follow `getReviewOutputs()` pattern exactly:** That method already implements the `extractFrontmatter` → `validateAndCoerce` pipeline for REVIEW.md with an optional `{ errors: boolean }` parameter. `planMetadata()` should mirror this structure but target PLAN.md with `PLAN_FRONTMATTER_SCHEMA`. The errors mode is needed by downstream consumers (e.g., create-plan's postValidate in Step 4) that need detailed error messages.
- **`totalPlanSteps()` calls `planMetadata()` without options:** Simple consumer path — gets `PlanFrontmatter | null`, maps to `number | undefined`.
- **No backward-compatible fallback:** Per GOAL.md, there is no backwards compatibility path. If frontmatter is absent or invalid, return `undefined`. The old heading-parsing logic is discarded, not kept as a fallback.

## Dependencies

- **Step 1 (APPROVED):** `PLAN_FRONTMATTER_SCHEMA` and `PlanFrontmatter` must be available from `src/frontmatter-schemas.ts`.

## Files Affected

- `src/goal-state.ts` — add `planMetadata()` to interface and factory, refactor `totalPlanSteps()`, remove heading-parsing regex logic
- `src/goal-state.test.ts` — update existing `totalPlanSteps()` tests for frontmatter-based behavior, add new `planMetadata()` tests

## Acceptance Criteria

- [ ] `planMetadata()` method added to `GoalState` interface with overloaded return type matching `getReviewOutputs()` pattern
- [ ] `planMetadata()` (no options) returns typed `PlanFrontmatter` when PLAN.md has valid frontmatter
- [ ] `planMetadata()` (no options) returns `null` for missing PLAN.md, no frontmatter, or invalid frontmatter
- [ ] `planMetadata({ errors: true })` returns `{ data }` on success and `{ error }` with detailed message on failure
- [ ] `planMetadata({ errors: true })` suppresses `console.warn`
- [ ] `totalPlanSteps()` returns `totalSteps` from frontmatter (not from heading scan)
- [ ] `totalPlanSteps()` returns `undefined` when frontmatter is absent or invalid
- [ ] Old heading-parsing regex (`## Step N:`) is removed from `goal-state.ts`
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **PLAN.md exists but has no frontmatter:** `extractFrontmatter` returns `null`, `planMetadata()` should propagate `null`. `totalPlanSteps()` should return `undefined`. This is a common case for existing plans written before this feature.
- **PLAN.md has frontmatter with extra fields:** `validateAndCoerce` strips extras — `planMetadata()` should still succeed and return `{ totalSteps: N }`.
- **Test file impact:** The existing `totalPlanSteps()` tests in `goal-state.test.ts` write PLAN.md _without_ frontmatter (using `writePlan()` helper). These will need to be updated to write frontmatter instead, or new tests added for the frontmatter-based behavior.
- **Downstream consumers of `totalPlanSteps()`:** Code like `/pio-list-goals` reads this method — they already handle `undefined`. No changes needed there, but verify no consumer depends on heading-parse-specific behavior (e.g., non-sequential step numbers).
