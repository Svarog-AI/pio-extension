# Decisions (carried forward for Step 6)

## Architecture Decisions

- **Schema placement:** `PLAN_FRONTMATTER_SCHEMA` and `PlanFrontmatter` live in `src/frontmatter-schemas.ts` as a leaf module importing only from `typebox`. Downstream modules import this schema to validate PLAN.md frontmatter. (Step 1)
- **Schema constraint:** `totalSteps` uses `Type.Integer({ minimum: 1 })` — zero steps is semantically invalid. (Step 1)

## Pattern Decisions

- **Frontmatter pipeline:** All frontmatter consumption follows the two-step pattern: `extractFrontmatter(filePath)` → `validateAndCoerce(raw, SCHEMA)`. Established by `getReviewOutputs()` in `goal-state.ts` and reused by `planMetadata()`. Steps 5–6 follow this same pattern when reading PLAN.md frontmatter directly. (Steps 1–2)
- **Overloaded return type with `{ errors }` option:** `planMetadata()` supports an overloaded signature: without options returns typed data or `null`, with `{ errors: true }` returns `{ data | error }`. Downstream steps should use `{ errors: true }` when they need to report detailed validation messages back to an agent. (Step 2)
- **postValidate hook pattern:** The `postValidate` callback in `CAPABILITY_CONFIG` receives `(goalDir, params?)` and returns `{ success: boolean; message?: string }`. On failure, the agent stays in-session to fix issues. On success, transitions proceed normally. See `postValidateReview` in `review-task.ts` for the canonical pattern. (Step 4)

## Plan Deviations

- **Completion detection uses `currentStepNumber() > totalSteps`:** The Step 5 description states "when `stepNumber > totalSteps`" but the actual implementation compares `state.currentStepNumber()` against `totalSteps`. `currentStepNumber()` returns the first non-APPROVED step (or `N+1` when all N steps are APPROVED). This comparison (`currentStepNumber() > totalSteps`) signals that all plan steps have been approved and no more specification work remains. Step 6 uses the same condition in `transitionEvolvePlan`, so consistency across both functions is maintained.
