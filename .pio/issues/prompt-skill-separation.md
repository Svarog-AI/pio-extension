# Enforce WHAT vs HOW separation between capability prompts and skills

# Prompt–Skill Separation

## Problem

When modifying `src/prompts/execute-task.md` to add a git commit instruction, the initial draft duplicated the `pio-git` skill's protocol inline:

> load the `pio-git` skill, write a short descriptive one-liner commit message summarizing what was done, and commit. Since `SUMMARY.md` was just written, the skill will extract file paths from it to stage only the files changed in this step. If git fails (no repo, not configured, etc.), log a warning and proceed — never block workflow completion.

This is wrong. The prompt was explaining **HOW** to commit (staging strategy, message format, error handling) — details that belong exclusively in the skill. The prompt should only say **WHAT** to do.

## Root Cause

No existing convention documents the separation between capability prompts and skills:

- **Prompt (WHAT):** What action to take, when to take it, and which skill to load.
- **Skill (HOW):** How to perform the action — staging strategy, message construction, error handling, edge cases.

Without this rule, prompt authors naturally over-specify in the prompt because they have the skill's details in context and assume the agent needs them repeated.

## Proposed Rule

Capability prompts should follow a delegation protocol:

1. **Instruct to load the skill** — name the skill explicitly (e.g., "load the `pio-git` skill")
2. **State the goal** — what outcome is expected (e.g., "commit the changes")
3. **State non-negotiable constraints** — workflow-level rules the skill doesn't know (e.g., "if git fails, log a warning and proceed — never block workflow completion")
4. **Do not explain skill internals** — staging strategy, message format, command sequences belong in the skill only

## Correct Version

```
2b. **Commit changes using the `pio-git` skill** — load the `pio-git` skill and commit the changes. If git fails, log a warning and proceed — never block workflow completion.
```

The skill handles: reading GIT.md conventions, extracting file paths from SUMMARY.md, constructing the commit message, running git commands, and error handling. The prompt just says "do it, and don't block if it fails."

## Files Affected

- `src/prompts/execute-task.md` — already fixed for this goal
- `src/prompts/execute-plan.md` — will need the same discipline (Step 3 of this goal)
- All future prompt modifications should follow this convention

## Suggestion

Document this as a convention in `.pio/PROJECT/CONVENTIONS.md` or in a prompt-authoring guideline so future TASK.md specs explicitly call out the WHAT/HOW boundary.

## Category

improvement

## Context

Discovered while implementing Step 2 of execute-task-auto-commit goal. The initial prompt draft was rejected for duplicating pio-git skill protocol. Files: src/prompts/execute-task.md, src/skills/pio-git/SKILL.md
