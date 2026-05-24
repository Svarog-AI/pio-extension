# Tests: TDD skill update — no content tests for prompts

This verifies that the test-driven-development skill contains an explicit rule against writing content-based tests for prompt files and message strings, with rationale and alternative approach documented.

## Unit Tests

No unit tests apply. This step modifies only a markdown skill file — a static documentation change with no behavioral impact on code logic.

## Programmatic Verification

Given the updated SKILL.md when the file is read then it contains a rule about avoiding content-based tests for prompts and messages in the "When NOT to use" section.
Given the updated SKILL.md when the file is read then it contains a row in the "Test Anti-Patterns to Avoid" table for content-based prompt/message tests.
Given the rule text when searched for rationale keywords then it mentions fragility on rewording and behavioral regression.
Given the rule text when searched for alternative approach then it mentions documenting in TEST.md and relying on programmatic checks.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
Given the test suite when npx vitest run is executed then all tests pass with no regressions.
