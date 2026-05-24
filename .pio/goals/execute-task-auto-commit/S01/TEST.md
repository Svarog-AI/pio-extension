# Tests: Skill registration refactoring and pio-git skill

This verifies that `setupSkills()` discovers skills via filesystem scanning, registers all six skills, and that the `pio-git` skill file exists with correct content.

## Unit Tests

Given `setupSkills()` scans SKILLS_DIR when the extension factory is called then all subdirectories containing `SKILL.md` are registered.
Given the extension factory is called when `resources_discover` is invoked then `skillPaths` contains all six skill names: `pio`, `test-driven-development`, `pio-project-knowledge`, `pio-planning`, `write-a-skill`, `pio-git`.
Given a new skill directory is added to SKILLS_DIR when `resources_discover` is invoked then it is auto-discovered without code changes (filesystem discovery, not hardcoded).
Given `setupSkills()` is called when `pi.on("resources_discover", ...)` is registered then the handler returns `{ skillPaths }`.
Given `setupSkills()` scans SKILLS_DIR with non-directory entries then non-directories are skipped without crashing.
Given `src/skills/pio-git/SKILL.md` exists when it is read then YAML frontmatter contains `name: pio-git`.
Given `src/skills/pio-git/SKILL.md` frontmatter when the description is read then it is under 1024 characters and includes a "Use when" trigger phrase.
Given `src/skills/pio-git/SKILL.md` content when searched for convention lookup then it documents reading `.pio/PROJECT/GIT.md` before operations.
Given `src/skills/pio-git/SKILL.md` content when searched for staging protocol then it documents SUMMARY.md extraction and `git status --porcelain` fallback.
Given `src/skills/pio-git/SKILL.md` content when searched for staging method then it specifies `git add <paths>` and prohibits `git add -A`.
Given `src/skills/pio-git/SKILL.md` content when searched for commit messages then it specifies short descriptive one-liners without "Step N" substrings.
Given `src/skills/pio-git/SKILL.md` content when searched for error handling then it documents graceful failure semantics (warn and proceed).
Given `src/skills/pio-git/SKILL.md` content when searched for future extensibility then it mentions branch checkout and PR creation as future operations.

## Programmatic Verification

Given the TypeScript project when `npx tsc --noEmit` is run then it exits with code 0.
Given all tests when `npx vitest run --reporter=verbose` is run then all tests pass with exit code 0.
