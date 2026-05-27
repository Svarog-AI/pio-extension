# Tests: Push protocol documentation integration (re-review)

This verifies that REFERENCE.md Push execution section uses proper markdown formatting (numbered lists for procedural steps, code blocks only for actual commands) and that the Push edge case table references the setup protocol instead of the stale "ask user" behavior.

**No unit tests apply** — this is a documentation-only change. Per TDD conventions, content-based tests for markdown docs break on any rewording without indicating a behavioral regression. Verification relies on programmatic checks and acceptance criteria cross-referencing.

## Programmatic Verification

Given REFERENCE.md Push execution section when the step-by-step is read then procedural instructions use markdown numbered lists, not bash code blocks.
Given REFERENCE.md Push execution section when code blocks are inspected then only actual acli invocations appear inside code blocks.
Given REFERENCE.md Push edge case table when the "No project key" row is read then it references the Jira Config Setup protocol instead of "ask user for project key".
Given SKILL.md when the Push protocol step 2 text is searched for "Config Setup" or "setup" then a cross-reference to the Jira Config Setup section must be present.
Given SKILL.md when the Push section config example block is read then it contains all 3 fields: `site`, `projectKey`, `defaultType`.
Given SKILL.md when line count is checked then total lines are ≤100.
Given SKILL.md when sections other than Push are read then Auth Status Check, Jira Config Setup, Pull, Goal from Issue, Search, and Error Handling sections are preserved unchanged.
Given REFERENCE.md when sections other than Push execution are read then Pull, Goal from Issue, Auth Status Check, Config Setup, JQL Search, and edge case tables (except Push) are preserved unchanged.
Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npx vitest run` is executed then all existing tests pass with no regressions.
