# Task: Add TASK.md frontmatter schema with skills

Define `TASK_FRONTMATTER_SCHEMA` in `frontmatter-schemas.ts`, following the existing pattern (`PLAN_FRONTMATTER_SCHEMA`, `REVIEW_OUTPUT_SCHEMA`). The schema declares an optional `skills` field matching the `CapabilitySkills` shape — allowing evolve-plan to write per-step mandatory and recommended skills in TASK.md YAML frontmatter.

## Context

Steps 1–5 centralized skill loading at the capability level via `CapabilityConfig.skills`. However, each step within execute-task may have unique skill needs (e.g., a database migration step needs `pio-git`, a refactoring step may need `source-research`). The spec writer (evolve-plan) has the deepest context about each step's specific requirements. This step defines the schema so that TASK.md frontmatter can carry machine-readable skill declarations, which Steps 7–8 will write and consume respectively.

## What to Build

Add `TASK_FRONTMATTER_SCHEMA` to `src/frontmatter-schemas.ts`. The schema mirrors the `CapabilitySkills` interface from `src/types.ts` but lives in the leaf module (importing only `typebox`). It defines an optional `skills` field with two sub-fields:

- `mandatory?: string[]` — skill names guaranteed to be loaded
- `recommended?: [{ name: string; condition: string }][]` — situational skills with load conditions

Also export `TaskFrontmatter` derived via `Static<typeof TASK_FRONTMATTER_SCHEMA>`.

### Code Components

**TASK_SKILLS_SCHEMA** (nested TypeBox object):
- Represents the shape of the `skills` field inside TASK.md frontmatter
- `mandatory`: optional array of strings (skill names)
- `recommended`: optional array of objects with `name: string` and `condition: string`
- This mirrors `CapabilitySkills` from `src/types.ts` but is defined independently as a TypeBox schema (leaf module constraint — cannot import from `types.ts`)

**TASK_FRONTMATTER_SCHEMA**:
- Root object schema with one optional field: `skills` referencing `TASK_SKILLS_SCHEMA`
- Optional by design — existing TASK.md files without frontmatter skills should validate as empty/undefined

**TaskFrontmatter type:**
- Derived via `Static<typeof TASK_FRONTMATTER_SCHEMA>`
- Exported for use by evolve-plan (Step 7) and the prepareSession hooks (Step 8)

### Approach and Decisions

- **Follow existing patterns exactly:** The file already contains `REVIEW_OUTPUT_SCHEMA`/`ReviewOutputs` and `PLAN_FRONTMATTER_SCHEMA`/`PlanFrontmatter`. Place the new schema in a third section with consistent documentation style, comments, and export naming.
- **Leaf module constraint:** `frontmatter-schemas.ts` imports only from `typebox`. Do NOT import `CapabilitySkills` from `src/types.ts`. Define the skills shape independently as TypeBox schemas — TypeScript structural typing ensures compatibility without an explicit import.
- **Schema granularity decisions (referenced from DECISIONS.md):** Both fields (`mandatory`, `recommended`) are optional. The `recommended` key is omitted entirely when empty (not an empty array) per capability config convention. Test the schema for graceful handling of missing/partial skills objects.
- **User feedback on testing (referenced from DECISIONS.md):** User deleted snapshot-style tests for static data — TypeScript validates structure. Test schema validation behavior (accepts valid input, rejects invalid input), not static config values.

## Skills

No additional skills recommended beyond the mandatory pio skill.

## Dependencies

- Step 1 (Add `skills` field to types) — established `CapabilitySkills` interface shape that this schema mirrors
- Step 2 (Propagate skills through config resolution) — ensures runtime config can accept merged skills from TASK.md

## Files Affected

- `src/frontmatter-schemas.ts` — add `TASK_SKILLS_SCHEMA`, `TASK_FRONTMATTER_SCHEMA`, and `TaskFrontmatter` type
- `src/frontmatter-schemas.test.ts` — add tests for the new schema (validation behavior)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] All existing tests pass (`npm test`) with no regressions
- [ ] `TASK_FRONTMATTER_SCHEMA` is exported from `frontmatter-schemas.ts`
- [ ] `TaskFrontmatter` type is derived from the schema via `Static<>` and exported
- [ ] Schema includes optional `skills` field with `mandatory?: string[]` and `recommended?: { name: string; condition: string }[]` sub-fields
- [ ] New tests verify: valid skills object passes validation, missing `skills` field validates as `{}`, invalid types for `mandatory` or `recommended` are rejected
- [ ] `frontmatter-schemas.ts` remains a leaf module — imports only from `typebox`, no relative imports

## Risks and Edge Cases

- **TypeBox nested schema naming:** Ensure `TASK_SKILLS_SCHEMA` is properly referenced inside `TASK_FRONTMATTER_SCHEMA` using `Type.Optional(TASK_SKILLS_SCHEMA)` or equivalent. Test that the nested structure validates correctly with `validateAndCoerce()`.
- **Empty vs missing skills:** An empty `{}` TASK.md frontmatter (no `skills` key) should validate successfully, producing `undefined` for the `skills` field. Don't require `skills` to be present.
- **Circular dependency risk:** If `types.ts` were to import from `frontmatter-schemas.ts`, it would create a circular dependency since `types.ts` is widely imported. The leaf module constraint prevents this — enforce via the existing module boundary test pattern.
- **Partial skills objects:** `{ mandatory: ["pio-git"] }` (no `recommended`) and `{ recommended: [{name, condition}] }` (no `mandatory`) should both validate since both sub-fields are optional.
