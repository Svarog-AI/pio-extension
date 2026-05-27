# Tests: REFERENCE.md — Jira Config Setup Execution Reference

This verifies that REFERENCE.md contains the correct "Jira Config Setup — Execution" section with proper placement, example payloads, and edge case entries. All existing content must be preserved. No unit tests apply — this is a documentation-only change. Verification relies on programmatic checks against the file contents.

## Programmatic Verification

Given the REFERENCE.md file when grep for "## Jira Config Setup — Execution" is run then it finds exactly one match.
Given the REFERENCE.md section ordering when the file is parsed then "Jira Config Setup — Execution" appears after "Auth Status Check — Execution" and before "JQL Search — Execution".
Given the execution section when grep for "acli jira auth status" is run then it finds at least one match in the new section.
Given the execution section when grep for "ask_user" is run then it finds at least two matches (site URL and project key).
Given the execution section when grep for "setup-config.sh" is run then it finds the script path `src/skills/pio-jira/scripts/setup-config.sh`.
Given the execution section when grep for the script signature is run then it shows `SITE PROJECT_KEY [DEFAULT_TYPE]` (three-field signature).
Given the execution section when grep for ask_user example payloads is run then two JSON-like code blocks exist with `question` and `allowFreeform` fields.
Given the execution section when grep for the config YAML example is run then it shows all three fields: `site`, `projectKey`, `defaultType`.
Given the Edge Cases section when grep for "Jira Config Setup" subsection is run then it finds a new edge case table subsection.
Given the new edge case table when the table rows are counted then it contains at least 5 rows covering: config already exists, unauthenticated user, cancelled ask_user (site), cancelled ask_user (project key), script execution failure.
Given all pre-existing headings in REFERENCE.md when compared to the original then they are all still present and unchanged.
Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given the test suite when `npm test` is run then all existing tests pass with no regressions.
