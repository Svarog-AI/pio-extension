# Summary: Register skills and create pio-git skill

## Status
COMPLETED

## Files Created
- `src/skills/pio-git/SKILL.md` — New skill defining git operations for pio agents. Documents convention lookup (read `.pio/PROJECT/GIT.md`), unified staged commit protocol (SUMMARY.md extraction or `git status --porcelain` fallback), commit message construction (short descriptive one-liners without "Step N"), graceful failure semantics, and future extensibility notes.

## Files Modified
- `src/index.ts` — Extracted inline skill registration into `setupSkills(api: ExtensionAPI)` function using filesystem discovery (`fs.readdirSync` + `fs.existsSync`). Imports `node:fs`. All skills now auto-discovered — no hardcoded skill names. Added `import * as fs from "node:fs"`.
- `src/index.test.ts` — Updated existing test to verify all 6 skills (added `write-a-skill` and `pio-git`). Added 2 new tests for filesystem discovery (auto-registration of new skills, skipping directories without SKILL.md). Added 9 new tests in a `pio-git skill` describe block verifying SKILL.md content (existence, frontmatter, convention lookup, staging protocol, commit message rules, graceful failure, future extensibility).

## Files Deleted
- (none)

## Decisions Made
- **Filesystem discovery over hardcoded list:** `setupSkills()` scans `SKILLS_DIR` at startup, filtering by `SKILL.md` existence. Adding a new skill requires only creating its directory and SKILL.md file.
- **Synchronous scan:** Uses `fs.readdirSync()` matching the existing synchronous startup pattern. No async needed at initialization.
- **Graceful error handling:** If `SKILLS_DIR` doesn't exist or is unreadable, the scan silently produces an empty array rather than crashing.
- **Skill follows write-a-skill conventions:** YAML frontmatter with `name` and `description` (under 1024 chars, third person, includes "Use when" trigger). Body organized into clear sections mirroring existing skills.

## Test Coverage
- 16 tests in `src/index.test.ts` (5 existing + 11 new)
- Tests verify: all 6 skills discovered, filesystem auto-discovery works, directories without SKILL.md are skipped, `pio-git/SKILL.md` content meets all acceptance criteria
- Full test suite: 686 tests pass, 0 failures
- TypeScript: `npx tsc --noEmit` exits with code 0
