# Task: Document priority hierarchy in pio-planning/SKILL.md

Add a new section to the shared planning skill documenting the priority hierarchy for resolving conflicts during plan revision, so both `create-plan` and `revise-plan` agents inherit this methodology consistently.

## Context

The revise-plan prompt (Step 1 of this goal) now references the `pio-planning` skill for priority hierarchy rules. However, the skill (`src/skills/pio-planning/SKILL.md`) currently has no documentation of this concept — there is no section explaining that during revision, implementation details follow the hierarchy: **revision notes > archived PLAN.md > GOAL.md**. The prompt delegates the *how* to the skill, so the skill must now contain the detailed rules.

## What to Build

Add a new top-level section to `src/skills/pio-planning/SKILL.md` that serves as the single source of truth for how revise-plan resolves conflicts between planning sources (GOAL.md, archived plans, revision notes).

### Code Components

#### New Section: Priority Hierarchy for Plan Revision

Add a new section as a **sibling** to the existing `## Scope Discipline` section. Suggested placement: immediately after `## Scope Discipline` and before `## Subgoal Decomposition`. The section should be self-contained — an agent reading only this section can resolve any conflict between GOAL.md, archived plans, and revision notes without needing additional context.

The section must document:

1. **The hierarchy itself:** revision notes > archived PLAN.md > GOAL.md (for implementation details)
2. **What each level means:**
   - **Revision notes** — from `REVISE_PLAN_NEEDED`, trigger step's `TASK.md` and `DECISIONS.md`. These specify required changes and override everything.
   - **Archived PLAN.md** — primary reference for implementation details, formatting decisions, and architectural choices already made by the planning agent. Preserve all decisions unless revision notes explicitly require a change.
   - **GOAL.md** — provides scope boundaries and high-level context. Use it to understand *what* should be built, but do not let its high-level description override specific *how* decisions already encoded in the archived plan.
3. **Scope vs. implementation distinction:** GOAL.md defines *what* should be built and scope boundaries; archived PLAN.md defines *how* it should be built. Revise-plan must preserve the *how*.
4. **Three conditions under which modifying archived plan decisions is permitted:**
   - (1) Changes explicitly required by revision notes
   - (2) New steps required for gaps discovered during specification
   - (3) Re-numbering after completed steps
5. **Relevance note:** This methodology is primarily relevant to revise-plan but documented in the shared skill so both create-plan and revise-plan agents have consistent knowledge.

### Approach and Decisions

- Follow the existing section structure and formatting conventions of `pio-planning/SKILL.md` (top-level headings with `##`, subheadings with `###`, bold emphasis for key terms).
- The new section should be a sibling to `## Scope Discipline` — not a subsection within it. This keeps scope boundaries and revision priority as separate concerns.
- Reference: the prompt changes from Step 1 now say "follow the priority hierarchy documented in the `pio-planning` skill" (Step 2 of revise-plan.md) and "follow the priority hierarchy rules defined in the `pio-planning` skill" (Step 5 guiding principle). This new section fulfills that reference.
- Decision from Step 1: detailed rules live in the skill, not duplicated in the prompt. Ensure this section contains the complete rules so the prompt's references resolve correctly.

## Dependencies

- **Step 1 must be completed first.** The revise-plan prompt (modified in Step 1) now references this skill for priority hierarchy rules. The skill content must match what the prompt delegates to it.

## Files Affected

- `src/skills/pio-planning/SKILL.md` — add new sibling section after `## Scope Discipline` documenting the priority hierarchy for plan revision

## Acceptance Criteria

- [ ] A new top-level section exists in `src/skills/pio-planning/SKILL.md` (heading level `##`, not nested under another section)
- [ ] The section documents the full priority hierarchy: revision notes > archived PLAN.md > GOAL.md (for implementation details)
- [ ] The section distinguishes between scope authority (GOAL.md defines *what*) and implementation authority (archived PLAN.md defines *how*)
- [ ] The section enumerates exactly three conditions under which modifying archived plan decisions is permitted: (1) revision notes require it, (2) gaps discovered during specification, (3) re-numbering after completed steps
- [ ] The section states that revise-plan must preserve implementation (*how*) decisions from archived plans unless one of the three conditions applies
- [ ] The section mentions its relevance to both create-plan and revise-plan agents (consistent methodology)
- [ ] Existing sections are not modified or removed — only new content is added
- [ ] The new section is placed as a sibling to `## Scope Discipline` (not nested inside it)
- [ ] Formatting follows existing conventions: `##` headings, bold for key terms, consistent with the rest of the skill file
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `npx vitest run` passes all tests with no regressions

## Risks and Edge Cases

- The new section should not inadvertently modify or remove existing content in SKILL.md. Use careful insertion — the file is long and edits should target the exact insertion point between `## Scope Discipline` and `## Subgoal Decomposition`.
- Ensure the section title is distinct enough that agents can find it when prompted to "follow the priority hierarchy documented in the pio-planning skill."
