# Decisions

## Step 1: pio-git skill created and registered

- **Skill at `src/skills/pio-git/SKILL.md`:** Documents convention lookup (read `.pio/PROJECT/GIT.md`), unified staged commit protocol (SUMMARY.md extraction or `git status --porcelain` fallback), short descriptive one-liner commit messages, graceful failure semantics.
- **Auto-discovery:** Skills are auto-discovered from filesystem via `setupSkills()` in `src/index.ts`. No manual registration needed.

## Step 2: execute-task prompt updated with auto-commit

- **Commit instruction uses "2b" sub-step numbering** within Step 9, placed after SUMMARY.md writing and before `pio_mark_complete`. This ordering ensures the pio-git skill can extract file paths from SUMMARY.md.
- **Delegation over duplication:** The prompt instructs agents to load `pio-git` and commit; the skill documentation fills in the detailed protocol (staging, message construction). No need to repeat skill internals in the prompt.
- **Medium-severity gap accepted:** Acceptance criterion "write a short one-liner commit message" is not explicitly stated in the prompt — the skill fills this in functionally. User approved as-is.

## Relevance to Step 3

The `execute-plan` prompt has no SUMMARY.md (it implements all steps inline), so the pio-git skill will use its `git status --porcelain` fallback for staging. The commit instruction should follow the same delegation pattern: reference `pio-git`, instruct a short descriptive commit message summarizing all changes, and include graceful failure semantics. Step numbering must remain sequential after inserting the new step.
