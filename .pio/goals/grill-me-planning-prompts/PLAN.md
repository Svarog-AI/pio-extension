---
totalSteps: 2
steps:
  - name: rewrite-grill-me-skill
    complexity: task
  - name: update-capability-prompts
    complexity: task
---

# Plan: Align grill-me skill across create-goal, create-plan, and revise-plan

Decouple WHAT (capability prompts) from HOW (skills) for user interviewing throughout the pio workflow by rewriting `grill-me/SKILL.md` as a proper reusable technique guide and updating all three capability prompts to reference it via Skill References instead of inline instructions.

## Prerequisites

None.

## Steps

### Step 1: Rewrite grill-me skill as a reusable technique guide

**Description:**

Completely rewrite `src/skills/grill-me/SKILL.md` from its current ~7-line body into a proper reusable technique guide supporting four usage contexts. The skill must be self-contained and capability-agnostic — it provides HOW to probe effectively, without referencing specific capabilities or prompts.

The rewritten skill should cover:

1. **Description field:** Broaden to match all planning/definition contexts naturally. Something along the lines of: "Probe user intent and validate assumptions during goal definition, planning, and plan revision. Also used reactively when the user wants stress-testing on a plan or design (mentions 'grill me')."

2. **Body structure with four usage contexts:**
   - **Goal definition:** Probing user intent to clarify scope. Ask focused questions about the problem, affected areas, and constraints. Stay light — goal definition is directional, not exhaustive. Stop after 2-3 rounds per section.
   - **Plan creation:** Validating assumptions after research. When feasibility doubts emerge or multiple valid approaches exist, probe the user to resolve gaps before committing to a plan. Present findings concisely, ask one decision at a time, recommend answers.
   - **Plan revision:** Confirming pivots mid-flight. The revision trigger revealed something broke — validate that the new direction is acceptable, negotiate scope changes, confirm which completed work to preserve.
   - **Reactive stress-testing:** User explicitly says "grill me." Walk down each decision tree branch relentlessly. Ask one at a time. Recommend answers.

3. **Concrete technique guidance for each context:** How to structure questions, when to recommend answers, when to stop probing, how to handle ambiguity vs. confirmed decisions.

4. **Relationship with pio-planning's User Interaction Protocol:** Clarify that pio-planning provides general timing guidelines (when to ask, max attempts) while grill-me provides the deep probing technique (how to probe effectively). This distinction should be stated in the skill body without hardwiring capability references.

**Acceptance criteria:**
- [ ] `src/skills/grill-me/SKILL.md` frontmatter `description` field is broadened to cover all four contexts (goal definition, plan creation, plan revision, reactive stress-testing)
- [ ] Skill body provides concrete technique guidance for each of the four usage contexts
- [ ] Skill remains self-contained and capability-agnostic (no references to specific prompt files or capability names in instructions)
- [ ] The skill documents how it relates to pio-planning's User Interaction Protocol (timing vs. technique)

**Files affected:**
- `src/skills/grill-me/SKILL.md` — complete rewrite

### Step 2: Update capability prompts to reference grill-me via Skill References

**Description:**

Update all three capability prompts so that WHAT-level instructions in the prompt body declare outcomes (understand intent, validate assumptions, confirm scope), while HOW is provided by the loaded skills via `Skill References`. No inline "use the grill-me skill" phrasing.

**Changes to `src/prompts/create-plan.md`:**
- Step 2 ("Deep research"): Remove the trailing sentence "Use the grill-me skill to resolve any doubts that popped up in the research that are challenging the feasibility or practicallity of the goal." Replace with a WHAT-level instruction, e.g., "When research reveals feasibility doubts or ambiguous areas, engage the user to resolve them before proceeding."
- Step 3 ("Validate assumptions and gather preferences"): Remove the trailing sentence "Use the grill-me skill to make sure you clarify as much as possible from the user." The step body already says WHAT — no HOW needed there.
- `Skill References` section: Add `grill-me` alongside the existing `pio-planning` reference, noting it covers resolving research gaps and validating assumptions.

**Changes to `src/prompts/revise-plan.md`:**
- Insert a new Step 5 ("Validate revision direction with the user") between existing Step 4 (Research supporting context) and Step 5 (Design new steps). This step declares WHAT outcomes:
  - Present what changed: summarize revision trigger reason, how remaining work differs from the archived plan.
  - Validate assumptions: confirm new direction aligns with user intent — especially around scope changes, architectural pivots, or invalidated decisions.
  - Negotiate scope: if remaining work fundamentally changed in character, confirm whether to proceed, split into subgoals, or adjust approach.
  - Summarize and confirm: recap key decisions before designing steps.
- Re-number subsequent steps accordingly (old Step 5 becomes Step 6, old Step 6 becomes Step 7, old Step 7 becomes Step 8).
- `Skill References` section: Add `grill-me` alongside the existing `pio-planning` reference.

**Changes to `src/prompts/create-goal.md`:**
- Add a `Skill References` section at the end of the document (currently absent). Reference both `pio-planning` and `grill-me`. The existing Steps 1 and 3 already handle user interaction at the WHAT level — no inline changes needed. The skill reference ensures the agent knows to load grill-me for interviewing technique during those steps.

**Acceptance criteria:**
- [ ] `src/prompts/create-plan.md` has no inline "use the grill-me skill" phrasing; Step 2 and Step 3 end with WHAT-level instructions only
- [ ] `src/prompts/create-plan.md` Skill References section includes `grill-me` alongside `pio-planning`
- [ ] `src/prompts/revise-plan.md` contains a new user validation step (between Research and Design) that declares WHAT outcomes without prescribing tool usage
- [ ] `src/prompts/revise-plan.md` steps are re-numbered sequentially after the insertion
- [ ] `src/prompts/revise-plan.md` Skill References section includes `grill-me` alongside `pio-planning`
- [ ] `src/prompts/create-goal.md` has a new Skill References section referencing both `pio-planning` and `grill-me`
- [ ] None of the three prompts contain inline "use the grill-me skill" phrasing after changes

**Files affected:**
- `src/prompts/create-plan.md` — remove inline HOW references, update Skill References
- `src/prompts/revise-plan.md` — insert user validation step, re-number steps, update Skill References
- `src/prompts/create-goal.md` — add Skill References section

## Notes

- All changes are to `.md` documentation files only — no TypeScript code or test files are affected.
- Step 1 (skill rewrite) must complete before Step 2, since the prompt Skill References will cross-reference content in the rewritten skill.
- The `ask-user` skill (`pi-ask-user`) provides the protocol for the `ask_user` tool itself. The grill-me skill should reference ask-user's protocols when appropriate (e.g., "use `ask_user` with structured options, one decision at a time") but does not need to duplicate them.
- After these changes, all three prompts will declare WHAT outcomes for user interaction and rely on loaded skills (via `<available_skills>` auto-discovery) to provide HOW. The Skill References sections serve as explicit reminders of which skills to load.
