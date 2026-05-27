# Tests: Rename test-driven-development to tdd

This verifies that all 17 references to `test-driven-development` have been renamed to `tdd` across capability configs, prompt examples, and test fixtures, leaving only the old skill directory itself unmodified.

## Unit Tests

No new unit tests required — this is a pure string replacement with no behavioral logic changes. Existing tests validate capability config skill names and frontmatter schemas; their fixture data is updated to use `"tdd"` instead of `"test-driven-development"`. The test suite passing after the changes is the proof of correctness.

## Programmatic Verification

Given the source files when `grep -rn "test-driven-development" src/ --include="*.ts" --include="*.md"` is run then only hits inside `src/skills/test-driven-development/SKILL.md` remain.
Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the full test suite when `npx vitest run` is run then it exits with code 0.
