# Tests: pio-jira Skill

This verifies that `src/skills/pio-jira/SKILL.md` and `REFERENCE.md` exist with correct structure, cover all five operation areas, and follow the format conventions of existing skills. No unit tests apply — this is a documentation-only change per TDD guidelines.

## Programmatic Verification

Given the TypeScript project when `npm run check` is run then it exits with code 0.
Given the test suite when `npm test` is run then all tests pass with no regressions.
Given the skill directory when `ls src/skills/pio-jira/SKILL.md` is run then the file exists.
Given the skill directory when `ls src/skills/pio-jira/REFERENCE.md` is run then the file exists.
Given the SKILL.md file when the YAML frontmatter is parsed then it contains `name: pio-jira` and a non-empty `description`.
Given the SKILL.md file when the content is searched then it covers all five operation areas: auth check, pull Jira → local, push local → Jira, JQL search, error handling.
Given the SKILL.md file when the content is searched then it documents the `--json` flag for programmatic output.
Given the SKILL.md file when the content is searched then it documents `.pio/jira-config.yaml` with fields `projectKey` and `defaultType`.
Given the SKILL.md file when the content is searched then it instructs agents to use `pio_create_issue` (not manual file writes) for pull operations.
Given the SKILL.md file when the content is searched then it documents the slug derivation convention `jira-<project>-<number>`.
Given the SKILL.md file when the line count is checked then it is under 100 lines (progressive disclosure to REFERENCE.md).
Given the SKILL.md file when compared to pio-git/SKILL.md structure then it follows the same conventions (frontmatter, organized sections, progressive disclosure).
