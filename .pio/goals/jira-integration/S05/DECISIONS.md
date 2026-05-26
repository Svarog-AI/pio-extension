# Decisions (carried from Steps 1–4)

## Context

Steps 1–2 built TypeScript capability code that was superseded by the skill-only approach. Step 3 created the `pio-jira` skill. Step 4 cleaned up all superseded code. Step 5 documents the "Jira → local issue → goal" workflow in the existing skill files.

## Key Decisions

- **Skill-only architecture:** All Jira operations are handled via agents running `acli` through `bash`, guided by `src/skills/pio-jira/SKILL.md`. No TypeScript capability code for Jira exists or should be added.
- **`pio_goal_from_issue` behavior:** Derives goal name from issue slug (e.g., `jira-proj-123`), validates issue exists and no goal workspace collision, enqueues a `create-goal` session with issue content as initial message, and marks the issue file for cleanup via `fileCleanup`.
- **SKILL.md line budget:** 64 lines current, 100-line limit. Budget ~36 lines for new "Goal Creation from Pulled Issue" section.
