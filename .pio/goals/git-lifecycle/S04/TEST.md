# Tests: Specification validation

This step performs a systematic validation of SPECIFICATION.md against GOAL.md To-Be State requirements. Per the `test-driven-development` skill, no unit tests apply for document validation — this is a content-based verification task. All verification is programmatic.

## Programmatic Verification

Given SPECIFICATION.md and GOAL.md when every To-Be State requirement is mapped to a spec section then all requirements have concrete content with no placeholders.
Given SPECIFICATION.md when all five sections (§1–§5) are inspected then each section contains substantive recommendations.
Given SPECIFICATION.md when internal consistency is checked then both protocols include subgoal detection as the first step after git repo verification.
Given SPECIFICATION.md when internal consistency is checked then "skill + prompt only" constraint is respected with no capability code changes recommended.
Given SPECIFICATION.md when internal consistency is checked then graceful failure semantics are stated consistently in both protocols.
Given SPECIFICATION.md when internal consistency is checked then GIT.md convention lookup is used consistently as the primary authority.
Given SPECIFICATION.md when edge cases are checked then all 10 edge cases from Steps 1–2 are explicitly addressed.
Given SPECIFICATION.md when the staged staging principle is checked then no `git add -A` recommendations exist anywhere.
Given SPECIFICATION.md §5 when actionability is checked then target files are named concretely and skill vs. prompt changes are clearly separated.
Given SPECIFICATION.md and docs/git-lifecycle-specification.md when diff is run then the files are identical (exit code 0).
Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with 0 failures.
