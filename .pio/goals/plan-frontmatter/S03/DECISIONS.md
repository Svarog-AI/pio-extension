# Decisions (carried forward for Steps 4–6)

## Architecture Decisions

- **Schema placement:** `PLAN_FRONTMATTER_SCHEMA` and `PlanFrontmatter` live in `src/frontmatter-schemas.ts` as a leaf module importing only from `typebox`. Downstream modules import this schema to validate PLAN.md frontmatter. (Step 1)
- **Schema constraint:** `totalSteps` uses `Type.Integer({ minimum: 1 })` — zero steps is semantically invalid. (Step 1)

## Pattern Decisions

- **Frontmatter pipeline:** All frontmatter consumption follows the same two-step pattern: `extractFrontmatter(filePath)` → `validateAndCoerce(raw, SCHEMA)`. This is established by `getReviewOutputs()` in `goal-state.ts` and reused by `planMetadata()`. (Steps 1–2)
- **Overloaded return type with `{ errors }` option:** `planMetadata()` supports an overloaded signature: without options returns typed data or `null`, with `{ errors: true }` returns `{ data | error }`. Downstream steps should use `{ errors: true }` when they need to report detailed validation messages back to an agent. (Step 2)

## Prompt Modification Conventions

- **Prompt updates are content-only:** When modifying prompts (Steps 3+), the structure and sections of existing instructions remain unchanged unless explicitly required by the plan. New instructions are injected into existing sections where they naturally belong (e.g., frontmatter instructions go in Step 5's example PLAN.md template). (Step 3)
