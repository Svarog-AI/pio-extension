# Decisions (carried forward for Steps 3–6)

## Architecture Decisions

- **Schema placement:** `PLAN_FRONTMATTER_SCHEMA` and `PlanFrontmatter` live in `src/frontmatter-schemas.ts` as a leaf module importing only from `typebox`. Downstream modules import this schema to validate PLAN.md frontmatter. (Step 1)
- **Schema constraint:** `totalSteps` uses `Type.Integer({ minimum: 1 })` — zero steps is semantically invalid. (Step 1)

## Pattern Decisions

- **Frontmatter pipeline:** All frontmatter consumption follows the same two-step pattern: `extractFrontmatter(filePath)` → `validateAndCoerce(raw, SCHEMA)`. This is established by `getReviewOutputs()` in `goal-state.ts` and should be reused for `planMetadata()`. (Step 1 context from existing code)
- **Overloaded return type with `{ errors }` option:** `planMetadata()` follows the exact same overloaded signature as `getReviewOutputs()`: without options returns typed data or `null`, with `{ errors: true }` returns `{ data | error }`. This enables downstream consumers (create-plan postValidate in Step 4) to get detailed validation messages. Downstream steps should use `{ errors: true }` when they need to report errors back to an agent.
