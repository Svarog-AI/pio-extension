# Summary: Add PLAN_FRONTMATTER_SCHEMA to frontmatter-schemas.ts

## Status
COMPLETED

## Files Created
- `src/frontmatter-schemas.test.ts` — 11 unit tests covering schema validation, type export, and module boundary

## Files Modified
- `src/frontmatter-schemas.ts` — added `PLAN_FRONTMATTER_SCHEMA` (TypeBox object with `totalSteps: Type.Integer({ minimum: 1 })`) and `PlanFrontmatter` derived type

## Files Deleted
- (none)

## Decisions Made
- Followed the exact pattern of `REVIEW_OUTPUT_SCHEMA`: schema constant followed by derived `Static<typeof>` type, with a comment block documenting the leaf-module invariant
- Placed new exports in a separate section below the existing REVIEW section for clear visual separation
- Used `minimum: 1` (not 0) since a plan with zero steps is semantically invalid

## Test Coverage
- 11 tests in `src/frontmatter-schemas.test.ts`:
  - 9 schema validation tests: accepts valid integers (5, boundary 1), rejects missing/zero/negative/float/string/boolean values, strips extra fields
  - 1 type export test: confirms `PlanFrontmatter` is usable by TypeScript
  - 1 module boundary test: verifies only `typebox` imports (no relative imports)
- All 402 tests in the full suite pass (no regressions)
- `npx tsc --noEmit` passes with zero errors
