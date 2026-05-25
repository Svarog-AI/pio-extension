# Tests: TASK.md frontmatter schema with skills

This verifies that `TASK_FRONTMATTER_SCHEMA` correctly validates per-step skill declarations in TASK.md YAML frontmatter, following the existing pattern in `frontmatter-schemas.ts`.

## Unit Tests

Given valid skills with both mandatory and recommended fields when validateAndCoerce is called then it passes validation.
Given missing skills field when validateAndCoerce is called then it passes validation with skills undefined.
Given partial skills with only mandatory when validateAndCoerce is called then it passes validation.
Given partial skills with only recommended when validateAndCoerce is called then it passes validation.
Given mandatory as a non-array type when validateAndCoerce is called then it rejects validation.
Given recommended containing an object missing the name field when validateAndCoerce is called then it rejects validation.
Given recommended containing an object missing the condition field when validateAndCoerce is called then it rejects validation.
Given recommended as a non-array type when validateAndCoerce is called then it rejects validation.
Given an empty object when validateAndCoerce is called then it passes validation producing undefined skills.
Given TaskFrontmatter type when assigned a valid value then TypeScript accepts it without errors.
Given the frontmatter-schemas.ts file when import lines are scanned then only typebox is imported (leaf module).

## Programmatic Verification

Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.
