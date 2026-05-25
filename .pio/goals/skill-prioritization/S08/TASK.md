---
skills:
  mandatory:
    - test-driven-development
---

# Task: Add task skills to StepStatus and consume in prepareSession

Add a `taskSkills()` method to `StepStatus` so each step object owns its skill data — following the existing per-step design (`hasTask()`, `status()`, `getMetadata()`). Then update `execute-task.ts` and `review-task.ts` to read skills from `StepStatus` via `GoalState.steps()` instead of importing `readTaskFrontmatterSkills()` from `fs-utils.ts`. TASK.md skills are now part of goal state — a single source of truth.

## Context

Steps 1–7 centralized capability-level skill loading via `CapabilityConfig.skills`, added the `TASK_FRONTMATTER_SCHEMA` for TASK.md frontmatter validation, and updated evolve-plan to write skills in the frontmatter. However, reading TASK.md skills currently lives in `fs-utils.ts` (`readTaskFrontmatterSkills()`) — breaking the established pattern where **all goal workspace state access goes through `GoalState` and its `StepStatus` objects**. Each step already has lazy-evaluated methods: `hasTask()`, `hasTest()`, `status()`, `getMetadata()`. The skills data belongs as another method on `StepStatus`, not as a standalone function in `fs-utils.ts`.

## What to Build

Add a `taskSkills()` lazy-evaluated method to `StepStatus` that reads TASK.md frontmatter, validates against `TASK_FRONTMATTER_SCHEMA`, and returns the `skills` field. Then update `execute-task.ts` and `review-task.ts` to access skills through `state.steps()[i].taskSkills()` instead of calling `readTaskFrontmatterSkills()` from `fs-utils.ts`. Finally, remove `readTaskFrontmatterSkills` from `fs-utils.ts` — the logic is now part of goal state.

### Code Components

#### 1. `taskSkills()` on StepStatus

**Interface change to `StepStatus`:**
```typescript
export interface StepStatus {
  stepNumber: number;
  folderName: string;
  hasTask: () => boolean;
  hasTest: () => boolean;
  hasSummary: () => boolean;
  status: () => "defined" | "implemented" | "approved" | "rejected" | "blocked" | "pending";
  revisionNeeded: () => boolean;
  getMetadata: () => StepMetadata | null;
  /**
   * Reads TASK.md frontmatter and returns the `skills` field.
   * Lazy-evaluated — reads fresh from disk on every call.
   * Returns `TaskSkills | null`: parsed skills when present, or `null` when
   * the file is missing, has no frontmatter, has no `skills` key, or fails validation.
   */
  taskSkills: () => TaskSkills | null;
}
```

**Behavior (inside `createStepStatus` factory):**
- Resolve TASK.md path: `<stepDir>/TASK.md` using the `stepDir` parameter already available to `createStepStatus()`
- Call `extractFrontmatter(taskPath)` from `frontmatter.ts` to parse YAML frontmatter
- Validate against `TASK_FRONTMATTER_SCHEMA` using `validateAndCoerce()` from `frontmatter.ts`
- Return the `.skills` field from the coerced data, or `null` on any error
- **Never throws** — handles missing files, malformed YAML, and schema validation failures gracefully by returning `null`
- Lazy-evaluated closure like `hasTask()`, `status()` — reads fresh from disk on every call

#### 2. Update execute-task.ts `prepareExecuteSession`

Replace the current `readTaskFrontmatterSkills()` call:
```typescript
// Before (fs-utils import):
const taskSkills = readTaskFrontmatterSkills(workingDir, stepNumber);

// After (via GoalState → StepStatus):
const state = createGoalState(workingDir); // already imported
const step = state.steps().find(s => s.stepNumber === stepNumber);
const taskSkills = step?.taskSkills();
```
- Pass result to `mergeCapabilitySkills()` (still from `fs-utils.ts`)
- Handle `null` return — skip merging, same as current `undefined` handling

#### 3. Update review-task.ts `prepareReviewSession`

Same pattern:
```typescript
// Before:
const taskSkills = readTaskFrontmatterSkills(_dir, stepNumber);

// After:
const state = createGoalState(_dir); // already imported
const step = state.steps().find(s => s.stepNumber === stepNumber);
const taskSkills = step?.taskSkills();
```
- Pass result to `mergeCapabilitySkills()` (still from `fs-utils.ts`)
- Handle `null` return — skip merging

#### 4. Remove `readTaskFrontmatterSkills` from fs-utils.ts

After both consumers are migrated, remove the `readTaskFrontmatterSkills` function and its imports (`extractFrontmatter`, `validateAndCoerce`, `TASK_FRONTMATTER_SCHEMA`, `TaskFrontmatter`) from `fs-utils.ts`. The logic now lives exclusively on `StepStatus.taskSkills()`.

**Keep `mergeCapabilitySkills` in `fs-utils.ts`** — it's a pure utility for merging skill configs, not goal state access. It doesn't read from the goal workspace; it operates on typed objects. Its placement is correct as a general-purpose helper.

### Approach and Decisions

- **Per-step ownership:** `StepStatus` already owns step-level data (`hasTask()`, `status()`, `getMetadata()`). Skills are per-step data derived from the step's TASK.md. Adding `taskSkills()` keeps related behavior collocated — consumers find all step info on one object, not scattered across `GoalState` methods and `fs-utils.ts` functions. This is the single source of truth pattern for goal state.
- **No console.warn on missing files:** `taskSkills()` returns `null` silently for missing TASK.md or missing `skills` key. This matches the current behavior of `readTaskFrontmatterSkills()` — no warning for a genuinely absent skills declaration.
- **Import TaskSkills type:** `goal-state.ts` needs to import `type TaskSkills` from `frontmatter-schemas.ts`. This is safe — `frontmatter-schemas.ts` is a leaf module importing only typebox, and `goal-state.ts` already imports other types from it (`PlanFrontmatter`, `ReviewOutputs`, `StepMetadata`).
- **mergeCapabilitySkills stays in fs-utils.ts:** Pure merge utility operating on typed objects. Doesn't access the filesystem.
- **Plan Deviation from PLAN.md:** The plan suggested a "shared helper" in `fs-utils.ts`. Skills are now on `StepStatus` — the single source of truth for per-step state (matching `hasTask()`, `status()`, `getMetadata()`). This is the correct design: goal state owns all workspace data access.
- **Backward compatibility:** The `prepareSession` hook signatures and behavior are unchanged — only the source of skills data changes. The merged result has identical semantics.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- **Step 6 (TASK.md frontmatter schema):** `TASK_FRONTMATTER_SCHEMA` and `TaskSkills` type must exist in `src/frontmatter-schemas.ts`.
- **Step 7 (evolve-plan writes skills):** Spec writers now produce TASK.md with skills in frontmatter. This step consumes that data.
- **Steps 1–5 (core infrastructure):** `CapabilityConfig.skills`, `buildSkillLoadingSection()`, and the skill injection pipeline must be in place.

## Files Affected

- `src/goal-state.ts` — modified: add `taskSkills()` method to `StepStatus` interface; implement it inside `createStepStatus()` factory; import `TASK_FRONTMATTER_SCHEMA` and `TaskSkills` from `frontmatter-schemas.ts`; pass `stepDir` to `extractFrontmatter()` for TASK.md path resolution
- `src/capabilities/execute-task.ts` — modified: replace `readTaskFrontmatterSkills()` call in `prepareExecuteSession` with `createGoalState(workingDir).steps().find(s => s.stepNumber === stepNumber)?.taskSkills()`; remove `readTaskFrontmatterSkills` import from fs-utils
- `src/capabilities/review-task.ts` — modified: replace `readTaskFrontmatterSkills()` call in `prepareReviewSession` with `createGoalState(_dir).steps().find(s => s.stepNumber === stepNumber)?.taskSkills()`; remove `readTaskFrontmatterSkills` import from fs-utils
- `src/fs-utils.ts` — modified: remove `readTaskFrontmatterSkills()` function and its imports (`extractFrontmatter`, `validateAndCoerce`, `TASK_FRONTMATTER_SCHEMA`, `TaskFrontmatter`); keep `mergeCapabilitySkills` and its `CapabilitySkills` import
- `src/goal-state.test.ts` — modified: add tests for `StepStatus.taskSkills()` method (valid skills, no skills, missing file, malformed YAML, invalid schema)
- `src/skill-consumption.test.ts` — modified: update tests that import `readTaskFrontmatterSkills` from `fs-utils.ts` to use `createGoalState(goalDir).steps()[i].taskSkills()` instead; remove `readTaskFrontmatterSkills` import

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass (`npm test`) with no regressions
- [ ] `StepStatus.taskSkills()` returns `TaskSkills | null` — follows the same lazy-evaluated pattern as `hasTask()`, `status()`, `getMetadata()`
- [ ] execute-task `prepareExecuteSession` reads TASK.md skills via `state.steps().find(s => s.stepNumber === stepNumber)?.taskSkills()` instead of `readTaskFrontmatterSkills()`
- [ ] review-task `prepareReviewSession` reads TASK.md skills via `state.steps().find(s => s.stepNumber === stepNumber)?.taskSkills()` instead of `readTaskFrontmatterSkills()`
- [ ] When TASK.md has no `skills` in frontmatter, behavior is identical to pre-change (base skills only)
- [ ] When TASK.md has both mandatory and recommended skills, they are merged with base capability skills via `mergeCapabilitySkills()`
- [ ] Missing or malformed TASK.md frontmatter returns `null` — `prepareSession` skips merging, falls back to base skills without crashing
- [ ] Deduplication works: if a per-step skill name duplicates a base skill, it appears only once in the final config (verified via existing `mergeCapabilitySkills` tests)
- [ ] `readTaskFrontmatterSkills` is removed from `fs-utils.ts` — all TASK.md frontmatter access flows through `StepStatus.taskSkills()` on goal state
- [ ] `mergeCapabilitySkills` remains in `fs-utils.ts` — it's a pure merge utility, not goal state access

## Risks and Edge Cases

- **Import cycle:** Adding `TASK_FRONTMATTER_SCHEMA` import to `goal-state.ts` is safe — `frontmatter-schemas.ts` is a leaf module (imports only typebox). No circular dependency risk. Verify with `npx tsc --noEmit`.
- **Null vs undefined semantics:** The existing `readTaskFrontmatterSkills()` returns `undefined` on missing skills. The new `taskSkills()` returns `null`. The `prepareSession` hooks check truthiness (`if (taskSkills)`) which handles both. However, if `mergeCapabilitySkills(base, null)` is called directly, the function should handle `null` gracefully — either add `| null` to the param type or coerce with `?? undefined` at call sites.
- **Test migration:** `skill-consumption.test.ts` currently imports `readTaskFrontmatterSkills` directly from `fs-utils.ts`. These tests must be updated to go through `createGoalState(goalDir).steps()` → `step.taskSkills()` — testing the new access path, not the old one.
- **`createStepStatus` signature:** Adding `taskSkills()` to the returned object requires capturing `stepDir` in the closure (already available as a parameter). No additional parameters needed — the existing function signature is sufficient.
