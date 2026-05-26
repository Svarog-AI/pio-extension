# Summary: Create the pio-jira Skill

## Status
COMPLETED

## Files Created
- `src/skills/pio-jira/SKILL.md` — Agent skill documentation for all Jira/acli operations (64 lines, under 100-line limit)
- `src/skills/pio-jira/REFERENCE.md` — Execution reference with exact acli command strings, field mapping examples, edge case tables, and shell quoting patterns

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- Split into SKILL.md + REFERENCE.md per write-a-skill conventions (SKILL.md ≤100 lines)
- Followed pio-git/SKILL.md format exactly: YAML frontmatter, organized protocol sections, progressive disclosure via REFERENCE.md link
- Included five operation areas as separate sections: Auth Status Check, Pull Jira → Local Issue, Push Local Issue → Jira, Search with JQL, Error Handling
- Embedded config file format (`.pio/jira-config.yaml`) inline in SKILL.md since it's short and referenced directly in the push protocol
- Documented slug derivation with examples table in REFERENCE.md
- Added shell quoting guidance for multi-line descriptions (heredoc pattern)
- Emphasized `--json` flag usage throughout

## User-Requested Changes
- (none)

## Test Coverage
- `npm run check` (tsc --noEmit) exits with code 0
- `npm test` passes: 26 test files, 769 tests passed, no regressions
- All acceptance criteria verified programmatically:
  - SKILL.md exists with correct YAML frontmatter (`name: pio-jira`, description present)
  - All five operation areas covered (auth, pull, push, search, error handling)
  - `--json` flag documented (4 occurrences)
  - `.pio/jira-config.yaml` format documented with `projectKey` and `defaultType` fields
  - `pio_create_issue` tool usage instructed (not manual file writes)
  - Slug derivation convention `jira-<project>-<number>` documented
  - SKILL.md is 64 lines (under 100-line limit)
  - Progressive disclosure to REFERENCE.md via link
