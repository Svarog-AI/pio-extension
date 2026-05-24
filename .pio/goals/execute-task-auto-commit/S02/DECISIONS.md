# Decisions

## Step 1: pio-git skill created

- **Skill exists at `src/skills/pio-git/SKILL.md`:** Documents convention lookup (read `.pio/PROJECT/GIT.md`), unified staged commit protocol (SUMMARY.md extraction or `git status --porcelain` fallback), short descriptive one-liner commit messages (no "Step N"), and graceful failure semantics.
- **Auto-discovery via `setupSkills()`:** Skills are auto-discovered from the filesystem — no manual registration needed in `src/index.ts`. The `pio-git` skill is already registered and discoverable at runtime.

## Relevance to Step 2

The `execute-task` prompt must instruct agents to load `pio-git` and follow its protocol. Since the skill uses SUMMARY.md-based staging by default, the commit instruction should come after SUMMARY.md is written so the skill can extract file paths from it. The skill's graceful failure semantics are built-in — the prompt need only reference loading the skill; no additional error handling logic is required in the prompt itself.
