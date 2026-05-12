# Add a skill-writer capability for execute-task and review-code workflows

# Add a skill-writer capability

Introduce a new capability (and matching prompt) — `skill-writer` — that is used by the `execute-task` and `review-code` capabilities to write or update SKILL.md files. This ensures skills are authored consistently whenever the implementation agent or reviewer creates/changes reusable agent guidance.

## Motivation

The project already ships two skills under `src/skills/` (`pio` and `test-driven-development`). These are standalone SKILL.md files but there is no workflow step that produces or maintains them. When execute-task implements a feature, or when review-code approves code, the agent has no structured prompt to author a corresponding skill if one is warranted.

## What it does

- A new capability module `src/capabilities/skill-writer.ts` with `CAPABILITY_CONFIG`, tool/command registration, and `setupSkillWriter(pi)`.
- A new prompt `src/prompts/skill-writer.md` with instructions for authoring SKILL.md files (frontmatter, structure, conventions).
- Both `execute-task` and `review-code` should be aware of this capability — after implementation or approval, they can enqueue a skill-writer task if a new skill is needed or an existing one needs updating.

## Files to create/modify

- **New:** `src/capabilities/skill-writer.ts`
- **New:** `src/prompts/skill-writer.md`
- **Modify:** `src/index.ts` — wire up the new capability
- **Modify:** `src/utils.ts` — add `"skill-writer"` to `CAPABILITY_TRANSITIONS` (e.g., execute-task → skill-writer → review-code, or as an optional branch)
- **Modify:** `src/capabilities/execute-task.ts` and `src/capabilities/review-code.ts` — awareness of the skill-writer in the workflow

## Open questions

- Is skill-writing a mandatory step after every task, or optional (triggered by the agent/user)?
- Should it have its own tool (`pio_create_skill`) or live as a sub-step within execute-task/review-code sessions?
- Where do skills live — `src/skills/<name>/SKILL.md`? Any validation or naming conventions needed?

## Category

feature

## Context

Relevant files:
- `src/capabilities/execute-task.ts` — current implementation capability, no skill-writing logic
- `src/capabilities/review-code.ts` — current review capability, no skill-writing logic
- `src/skills/pio/SKILL.md` — example of an existing skill (structure, frontmatter)
- `src/skills/test-driven-development/SKILL.md` — another existing skill with usage conditions and TDD cycle
- `src/prompts/execute-task.md` — implementation agent prompt
- `src/prompts/review-code.md` — review agent prompt
- `src/utils.ts` — CAPABILITY_TRANSITIONS map
- `src/index.ts` — extension entry point wiring all capabilities
