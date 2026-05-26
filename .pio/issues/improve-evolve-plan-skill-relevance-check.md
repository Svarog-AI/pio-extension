# Evolve-plan skill-relevance check is too vague — agents skip relevant skills

The Step 5 Probing Gate in `src/prompts/evolve-plan.md` instructs:

> "Review `<available_skills>` for both bundled skills and external skills."

This invites a glance-and-guess instead of systematic matching. During the jira-integration S03 evolve-plan session, `write-a-skill` was missed entirely despite its frontmatter description literally saying *"Use when user wants to create, write, or build a new skill"* — which exactly describes creating `src/skills/pio-jira/SKILL.md`.

## Root cause

- No requirement to enumerate each skill and read its description
- No matching axes defined (output type, process)
- No accountability for skipped skills

## Proposed fix

Replace the single bullet with explicit enumeration-and-match instructions:

- Require iterating over each `<available_skills>` entry and reading its frontmatter description
- Match on two concrete axes: **output artifact type** (SKILL.md → `write-a-skill`, git commands → `pio-git`) and **implementation process** (TDD → `test-driven-development`)
- Force the agent to read any SKILL.md it thinks might apply — no guessing from names
- Require stating why each skipped skill was excluded, in one sentence

## File affected

- `src/prompts/evolve-plan.md` — Step 5 Probing Gate, "Skill relevance" bullet

## Category

improvement

## Context

Observed during jira-integration goal, Step 3 (S03). TASK.md was written without `write-a-skill` in the mandatory skills list. Fixed post-hoc by user prompting. File: src/prompts/evolve-plan.md, approximately line containing "Skill relevance:".
