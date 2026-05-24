---
totalSteps: 2
steps:
  - name: update-revise-plan-prompt
    complexity: task
  - name: document-priority-hierarchy-in-skill
    complexity: task
---

# Plan: Revise-plan — Prioritize archived PLAN.md over GOAL.md for implementation details

Update the revise-plan prompt and planning skill to establish a clear priority hierarchy: revision notes > archived PLAN.md > GOAL.md (for implementation details), preventing the agent from discarding deliberate implementation decisions during plan revision.

## Prerequisites

None.

## Steps

### Step 1: Update revise-plan.md prompt with priority hierarchy

Strengthen the revise-plan prompt to explicitly establish that archived plans are the primary authority on implementation details, overriding GOAL.md's high-level descriptions.

**Description:**

Modify `src/prompts/revise-plan.md` in three locations to establish *what* the agent should do and where to find the rules:

1. **Step 2 (Read archived plans):** Replace weak "read for reference" language with explicit priority language. State that the archived plan is the primary authority on implementation details — GOAL.md defines scope boundaries, while the archived plan defines implementation decisions already made. State that when resolving conflicts between sources, the agent should follow the priority hierarchy documented in the `pio-planning` skill.

2. **Step 5 (Design new steps):** Add a guiding principle stating that modifications to archived plan decisions must follow the rules defined in the `pio-planning` skill (priority hierarchy for plan revision). Do not enumerate the exception cases in the prompt — delegate the *how* to the skill.

3. **Guidelines section:** Add a new guideline referencing the priority hierarchy: "When rewriting the plan, follow the priority hierarchy for implementation details defined in the `pio-planning` skill." No need to repeat the detailed rules here.

**Acceptance criteria:**
- [ ] Step 2 explicitly states the archived PLAN.md is the primary authority on implementation details (not GOAL.md)
- [ ] Step 2 references the `pio-planning` skill for the priority hierarchy rules (does not enumerate detailed exception cases inline)
- [ ] Step 5 contains a guiding principle directing the agent to follow the `pio-planning` skill's priority hierarchy when modifying archived plan decisions
- [ ] Guidelines section contains a new entry referencing the `pio-planning` skill for the priority hierarchy
- [ ] The prompt does NOT duplicate the detailed "how" rules (three exception cases, scope vs. how distinction) — those live in the skill
- [ ] Step 1 language is preserved — GOAL.md is still read as the scope contract (not removed or weakened)
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Existing test suite passes with no regressions

**Files affected:**
- `src/prompts/revise-plan.md` — strengthen Step 2, add principle in Step 5, add guideline entry

### Step 2: Document priority hierarchy in pio-planning/SKILL.md

Add documentation of the priority hierarchy concept to the shared planning skill so future planning-related agents and documentation inherit this methodology.

**Description:**

Modify `src/skills/pio-planning/SKILL.md` to document the priority hierarchy used during plan revision. This is the single source of truth for *how* to resolve conflicts between planning sources — both the revise-plan prompt and create-plan prompt should reference this skill.

Add a new subsection (sibling to **Scope Discipline**) that explains:

- The priority hierarchy for resolving conflicts during revision: revision notes > archived PLAN.md > GOAL.md (for implementation details)
- GOAL.md defines *what* should be built and scope boundaries; archived PLAN.md defines *how* it should be built
- The three conditions under which modifying archived plan decisions is permitted: (1) changes explicitly required by revision notes, (2) new steps required for gaps discovered during specification, (3) re-numbering after completed steps
- Revise-plan must preserve all implementation decisions from the archived plan unless one of the above conditions applies
- This methodology is relevant primarily to revise-plan but documented in the shared skill so both create-plan and revise-plan agents have consistent knowledge

The section should be self-contained — an agent reading only this section can resolve any conflict between GOAL.md, archived plans, and revision notes without needing additional context.

**Acceptance criteria:**
- [ ] A new subsection exists in the skill documenting the priority hierarchy (revision notes > archived PLAN.md > GOAL.md for implementation details)
- [ ] The section distinguishes between scope authority (GOAL.md) and implementation authority (archived PLAN.md during revision)
- [ ] The section enumerates the three conditions under which modifying archived plan decisions is permitted
- [ ] The section explains that revise-plan must preserve *how* decisions from archived plans unless one of the three conditions applies
- [ ] Existing sections of the skill are not modified or removed (only additions)
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Existing test suite passes with no regressions

**Files affected:**
- `src/skills/pio-planning/SKILL.md` — add new subsection on priority hierarchy for plan revision

## Notes

- Both steps modify markdown files only — no TypeScript code changes are required. The existing tests in `revise-plan.test.ts` cover the TS capability logic, not prompt content, so no test updates are needed.
- The `defaultInitialMessage` in `src/capabilities/revise-plan.ts` was identified in the GOAL.md as lacking priority guidance but is NOT included in the To-Be State changes. It remains out of scope for this goal.
- **Capabilities define WHAT, skills define HOW.** Step 1 (prompt) states that archived plans are authoritative and references the skill for rules. Step 2 (skill) contains the detailed *how* — the priority hierarchy, three exception cases, and scope-vs-how distinction. No duplication between the two files.
