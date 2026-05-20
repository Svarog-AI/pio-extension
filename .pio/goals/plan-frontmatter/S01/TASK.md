# Task: Add PLAN_FRONTMATTER_SCHEMA to frontmatter-schemas.ts

Add a TypeBox schema for PLAN.md frontmatter (`totalSteps`) following the existing `REVIEW_OUTPUT_SCHEMA` pattern in `src/frontmatter-schemas.ts`.

## Context

PLAN.md currently has no structured metadata. The goal is to introduce mandatory YAML frontmatter with a `totalSteps` field so downstream code (GoalState, create-plan postValidate) can read it programmatically. Step 1 establishes the schema definition — the building block consumed by Steps 2–6.

## What to Build

Add two exports to `src/frontmatter-schemas.ts`:

1. **`PLAN_FRONTMATTER_SCHEMA`** — a TypeBox `Type.Object()` with one required field:
   - `totalSteps: Type.Integer({ minimum: 1 })`
2. **`PlanFrontmatter`** — derived TypeScript type: `type PlanFrontmatter = Static<typeof PLAN_FRONTMATTER_SCHEMA>`

### Code Components

#### `PLAN_FRONTMATTER_SCHEMA`

- TypeBox object schema with a single required property `totalSteps`.
- `totalSteps` is `Type.Integer({ minimum: 1 })` — must be a positive integer.
- No optional fields, no additional properties.

#### `PlanFrontmatter` type

- Exported as `type PlanFrontmatter = Static<typeof PLAN_FRONTMATTER_SCHEMA>`.
- Derives automatically from the schema — no manual interface.

### Approach and Decisions

- **Follow `REVIEW_OUTPUT_SCHEMA` pattern exactly.** The module already has a well-established convention: schema constant followed by derived type, with a comment block explaining it's a leaf module (imports only from `typebox`). Add the new exports in a separate comment section below the existing REVIEW section.
- **Minimum 1, not 0.** A plan with zero steps is invalid — use `{ minimum: 1 }`.
- **Module boundary:** `src/frontmatter-schemas.ts` must remain a leaf module — it imports only from `typebox`. Do not add any internal imports (no `./frontmatter`, no `./goal-state`).

## Dependencies

None. This is Step 1 — the foundation for all downstream steps.

## Files Affected

- `src/frontmatter-schemas.ts` — modified: add `PLAN_FRONTMATTER_SCHEMA` constant and `PlanFrontmatter` type export below the existing REVIEW section

## Acceptance Criteria

- [ ] `PLAN_FRONTMATTER_SCHEMA` is exported from `src/frontmatter-schemas.ts`
- [ ] Schema validates `{ totalSteps: 3 }` as valid
- [ ] Schema rejects missing `totalSteps`, zero, negative values, floats, and non-integer types
- [ ] `PlanFrontmatter` type is exported as `Static<typeof PLAN_FRONTMATTER_SCHEMA>`
- [ ] Module remains a leaf module — imports only from `typebox`, no internal imports
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Float values:** YAML can parse `3.0` as a float. TypeBox `Type.Integer()` rejects floats — this is the correct behavior (we want strict integers).
- **Extra fields:** If PLAN.md frontmatter contains extra keys beyond `totalSteps`, `validateAndCoerce` strips them during coercion (existing behavior, no schema change needed).
