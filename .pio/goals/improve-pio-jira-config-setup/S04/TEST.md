# Tests: Push protocol documentation integration

This verifies that the Push protocol sections in SKILL.md and REFERENCE.md correctly reference the Jira Config Setup flow when `.pio/jira-config.yaml` is missing, and that the config example shows all 3 fields.

**No unit tests apply** — this is a documentation-only change. Per TDD conventions, content-based tests for markdown docs break on any rewording without indicating a behavioral regression. Verification relies on programmatic checks and acceptance criteria cross-referencing.

## Programmatic Verification

Given SKILL.md when the Push protocol step 2 text is searched for "Config Setup" or "setup" then a cross-reference to the Jira Config Setup section must be present.
Given SKILL.md when the Push section config example block is read then it contains all 3 fields: `site`, `projectKey`, `defaultType`.
Given SKILL.md when line count is checked then total lines are ≤100.
Given SKILL.md when sections other than Push are read then Auth Status Check, Jira Config Setup, Pull, Goal from Issue, Search, and Error Handling sections are preserved unchanged.
Given REFERENCE.md when the Push execution section step 2 is read then it includes a setup script invocation (`bash src/skills/pio-jira/scripts/setup-config.sh`) for the missing-config case.
Given REFERENCE.md when sections other than Push execution are read then Pull, Goal from Issue, Auth Status Check, Config Setup, JQL Search, and edge case tables are preserved unchanged.
Given the documentation chain when traced from Push → missing config → Setup → Push continues then the flow is clear and unambiguous.
Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npx vitest run` is executed then all existing tests pass with no regressions.
