# Tests: Cleanup Superseded Jira Code

This verifies that the four superseded TypeScript files are deleted, `src/index.ts` is restored (no Jira imports/calls), no dangling references remain, and the project builds and tests cleanly. No unit tests apply — this is a file deletion and import removal task. All criteria are verified programmatically.

## Programmatic Verification

Given the four superseded files when they are checked for existence then they do not exist.
Given src/index.ts when it is read then it contains no import of setupJiraToIssue.
Given src/index.ts when it is read then it contains no call to setupJiraToIssue.
Given all TypeScript files under src/ when grep searches for jira-to-issue or jira-utils then no matches are found.
Given the TypeScript project when npm run check is run then it exits with code 0.
Given the test suite when npm test is run then all tests pass with no regressions.
Given the pio-jira skill directory when it is checked for existence then src/skills/pio-jira/SKILL.md still exists.
