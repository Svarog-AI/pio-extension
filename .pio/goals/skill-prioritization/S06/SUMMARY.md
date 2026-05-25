# Summary: Add TASK.md frontmatter schema with skills

## Status
COMPLETED

## Files Created
- `.pio/goals/skill-prioritization/S06/TEST.md` — test specification for TASK_FRONTMATTER_SCHEMA
- `.pio/goals/skill-prioritization/S06/COMPLETED` — completion marker

## Files Modified
- `src/frontmatter-schemas.ts` — added `TASK_RECOMMENDED_SKILL_SCHEMA`, `TASK_SKILLS_SCHEMA`, `TASK_FRONTMATTER_SCHEMA`, and derived types (`TaskRecommendedSkill`, `TaskSkills`, `TaskFrontmatter`)
- `src/frontmatter-schemas.test.ts` — added 11 new tests covering schema validation (valid input, partial input, invalid types, empty object) and type export verification

## Files Deleted
- (none)

## Decisions Made
- Followed existing pattern exactly: separate nested schemas (`TASK_RECOMMENDED_SKILL_SCHEMA`, `TASK_SKILLS_SCHEMA`) composed into root `TASK_FRONTMATTER_SCHEMA`, matching the `STEP_ENTRY_SCHEMA` → `PLAN_FRONTMATTER_SCHEMA` pattern
- Both `mandatory` and `recommended` are optional — partial skills objects validate successfully
- Leaf module constraint enforced: imports only from `typebox`, verified by existing module boundary test
- Used `as TaskFrontmatter` cast in test assertions since `validateAndCoerce` returns `Record<string, unknown>` at the type level

## User-Requested Changes
- (none)

## Test Coverage
- 11 new tests added to `frontmatter-schemas.test.ts`:
  - Valid skills with both mandatory and recommended fields → passes
  - Missing skills field → passes with undefined
  - Partial skills (mandatory only) → passes
  - Partial skills (recommended only) → passes
  - mandatory as non-array → rejected
  - recommended object missing `name` → rejected
  - recommended object missing `condition` → rejected
  - recommended as non-array → rejected
  - Empty object → passes with undefined skills
  - TaskFrontmatter type accepts valid values
  - TaskFrontmatter type accepts empty object
- All 716 tests pass (24 test files), no regressions
- `npx tsc --noEmit` exits with code 0
