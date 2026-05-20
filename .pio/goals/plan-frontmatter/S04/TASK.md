# Task: Add postValidate hook to create-plan capability

Add a `postValidate` callback to `CAPABILITY_CONFIG` in `src/capabilities/create-plan.ts` that validates PLAN.md frontmatter correctness — ensuring the `totalSteps` value matches the actual number of step headings in the document.

## Context

PLAN.md is the only output file from the create-plan capability. Currently, after the Planning Agent writes PLAN.md, validation checks only that the file exists. There is no check that the YAML frontmatter is correct or that `totalSteps` matches reality. This means agents can produce plans with wrong step counts and the infrastructure accepts them silently.

This step adds a `postValidate` hook (Step 3 of the capability lifecycle) that runs after file-existence validation passes but before transition routing. It verifies both frontmatter validity and heading consistency, keeping the agent in-session to fix errors.

## What to Build

A `postValidateCreatePlan` function following the `PostValidateCallback` signature: `(goalDir: string, params?: Record<string, unknown>) => { success: boolean; message?: string }`.

The function performs two checks in sequence:
1. **Validate frontmatter via GoalState:** Call `createGoalState(goalDir)` → `state.planMetadata({ errors: true })`. If the result has an `error` property, return `{ success: false, message }` with the detailed validation error. This delegates to the shared `extractFrontmatter` + `validateAndCoerce` pipeline internally — same pattern as `postValidateReview` using `state.getReviewOutputs(stepNumber, { errors: true })`.
2. **Verify heading count:** Read PLAN.md content from disk (`fs.readFileSync`), count occurrences of `## Step N:` headings using a regex match, and compare against `totalSteps` from frontmatter data. On mismatch, fail with a descriptive message showing both expected and actual counts.

On all checks passing, return `{ success: true }`.

### Code Components

#### `postValidateCreatePlan(goalDir, params)`

A module-level function in `src/capabilities/create-plan.ts`. Behavior:
1. Create `GoalState` via `createGoalState(goalDir)`
2. Call `state.planMetadata({ errors: true })` — on error (result has `.error`), return `{ success: false, message: result.error }`
3. Read PLAN.md content from disk (`fs.readFileSync`) to count headings
4. Count `## Step N:` headings (matching pattern like `/^## Step \d+:/gm`)
5. Compare heading count to `result.data.totalSteps` — on mismatch, return `{ success: false, message: "..." }`
6. Return `{ success: true }` when all checks pass

### Approach and Decisions

- **Follow the `postValidateReview` pattern exactly:** The canonical example in `review-task.ts` calls `createGoalState(goalDir)` → `state.getReviewOutputs(stepNumber, { errors: true })`, checks for `.error`, and returns `{ success, message }`. Mirror this: call `createGoalState(goalDir)` → `state.planMetadata({ errors: true })`. Frontmatter validation is delegated to GoalState — do NOT import low-level frontmatter utilities (`extractFrontmatter`, `PLAN_FRONTMATTER_SCHEMA`) directly.
- **Import `createGoalState` from `../goal-state`:** This is the only new import needed in `create-plan.ts` for this change. The heading count check requires raw content, which needs a separate `fs.readFileSync` call after frontmatter validation succeeds (since `planMetadata()` returns typed data only).
- **Heading regex:** Use `/^## Step \d+:/gm` to match headings like `## Step 1:`, `## Step 2: Add schema`, etc. The `m` flag enables `^` to match start of each line. Count with `.match()` and check array length (or `null` for zero matches).
- **Error messages should be actionable:** Tell the agent what's wrong and how to fix it. For example: `"totalSteps is 5 but found 3 step headings"` rather than just `"mismatch"`.
- **Assign to CAPABILITY_CONFIG:** Add `postValidate: postValidateCreatePlan` to the existing `CAPABILITY_CONFIG` object. The validation field already exists as `{ files: ["PLAN.md"] }` — do not change it.

## Dependencies

- **Step 2 (planMetadata in GoalState):** Must be complete — this step calls `createGoalState(goalDir).planMetadata({ errors: true })` to validate frontmatter.
- **Step 1 (PLAN_FRONTMATTER_SCHEMA):** Used transitively through GoalState — no direct import needed.

## Files Affected

- `src/capabilities/create-plan.ts` — add `postValidate` callback to `CAPABILITY_CONFIG`, import `createGoalState` from `../goal-state`

## Acceptance Criteria

- [ ] `postValidate` is defined in `CAPABILITY_CONFIG` in `src/capabilities/create-plan.ts`
- [ ] Returns failure when PLAN.md has no frontmatter
- [ ] Returns failure when frontmatter has invalid `totalSteps` (missing, zero, negative, non-integer)
- [ ] Returns failure when `totalSteps` doesn't match actual heading count
- [ ] Returns success when frontmatter is valid and counts match
- [ ] Uses `GoalState.planMetadata({ errors: true })` for frontmatter validation (delegates to `extractFrontmatter` + `validateAndCoerce` internally)
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Two file reads:** `planMetadata()` reads PLAN.md internally, and the heading count check needs another `fs.readFileSync`. This is unavoidable — `planMetadata()` returns typed data only. Two reads of a small markdown file are fine.
- **Heading format variations:** The regex should match `## Step 1:`, `## Step 10:`, etc. Be careful with the `m` flag on the regex for multiline matching. Test with realistic step headings from existing PLAN.md files.
- **Error message quality:** The agent needs to understand what's wrong. Include specific values in error messages (expected vs actual count, validation error details).
