# Task: Update capability prompts to reference grill-me via Skill References

Remove inline HOW-level "use the grill-me skill" phrasing from all three capability prompts and add explicit Skill References sections that point agents to `grill-me` for probing technique.

## Context

The WHAT/HOW decoupling principle requires capability prompts to declare outcomes (WHAT: understand intent, validate assumptions, confirm scope) while skills provide technique (HOW: how to probe effectively). Step 1 rewrote `grill-me/SKILL.md` as a proper reusable technique guide with four usage contexts. Step 2 now updates the three prompts so they reference this skill via Skill References instead of prescribing tool usage inline.

## What to Build

Update three `.md` prompt files so that:
1. Inline "use the grill-me skill" instructions are removed and replaced with WHAT-level outcome declarations
2. Skill References sections explicitly mention `grill-me` alongside `pio-planning`
3. A new user validation step is inserted into `revise-plan.md`

### Changes to `src/prompts/create-plan.md`

**Step 2 (Deep research):** The last paragraph currently reads:

> As part of the deep research step, leverage the user as an authorative source on questions related to the goal and what needs to be developed. Use the grill-me skill to resolve any doubts that popped up in the research that are challenging the feasibility or practicallity of the goal.

Remove the sentence "Use the grill-me skill to resolve any doubts that popped up in the research that are challenging the feasibility or practicallity of the goal." Replace it with a WHAT-level instruction such as: "When research reveals feasibility doubts or ambiguous areas, engage the user to resolve them before proceeding."

**Step 3 (Validate assumptions and gather preferences):** The last line currently reads:

> Use the grill-me skill to make sure you clarify as much as possible from the user.

Remove this trailing sentence entirely. The step body already describes WHAT outcomes are needed at each subsection — no HOW reference is required.

**Skill References section:** Currently references only `pio-planning`. Add `grill-me` alongside it, noting it covers resolving research gaps and validating assumptions. The new entry should follow the existing bullet format (e.g., a line describing what grill-me covers). Keep the existing pio-planning bullets unchanged.

### Changes to `src/prompts/revise-plan.md`

**Insert a new Step 5 ("Validate revision direction with the user"):** Insert between existing Step 4 (Research supporting context) and existing Step 5 (Design new steps). This step declares WHAT outcomes — no "use the grill-me skill" phrasing:

- Present what changed: summarize revision trigger reason, how remaining work differs from the archived plan.
- Validate assumptions: confirm new direction aligns with user intent — especially around scope changes, architectural pivots, or invalidated decisions.
- Negotiate scope: if remaining work fundamentally changed in character, confirm whether to proceed, split into subgoals, or adjust approach.
- Summarize and confirm: recap key decisions before designing steps.

**Re-number subsequent steps:** Old Step 5 becomes Step 6 ("Design new steps"), old Step 6 becomes Step 7 ("Write PLAN.md"), old Step 7 becomes Step 8 ("Signal completion"). Update any internal references to step numbers (e.g., "Step 5 and Step 6" in Skill References should become "Step 6 and Step 7").

**Skill References section:** Currently references only `pio-planning`. Add `grill-me` alongside it. Update the step number references in this section to match the new numbering.

### Changes to `src/prompts/create-goal.md`

**Add a Skill References section:** The file currently has no Skill References section at all. Add one at the end of the document (after the Guidelines section). Reference both `pio-planning` and `grill-me`. The existing Steps 1 and 3 already handle user interaction at the WHAT level — no inline changes needed there.

The section should follow the same format as create-plan.md and revise-plan.md Skill References sections: introduce which skills are referenced, then list bullets describing what each skill covers. For pio-planning, reference general planning methodology (user interaction protocol, scope discipline). For grill-me, note it provides probing technique for Steps 1 and 3 (goal clarification and gap-filling questions).

### Approach and Decisions

- All changes are to `.md` documentation files only — no TypeScript code or test files affected.
- Follow the existing Skill References format in `create-plan.md` as the template: an introductory sentence naming referenced skills, then bullet points describing what each covers.
- The grill-me skill has four context sections (Goal definition, Plan creation, Plan revision, Reactive stress-testing). Each prompt's Skill References should implicitly point to the relevant context — no need to name sections explicitly in the prompt; agents will find the right section based on their role.
- Refer to accumulated decisions in `DECISIONS.md`: the "Relationship with other skills" section was removed from grill-me (per user feedback), so prompts cannot reference it. The timing-vs-technique distinction lives in the skill intro paragraph.

## Skills

No additional skills recommended beyond the mandatory pio skill. All changes are to documentation files — no code implementation, testing, or git operations required.

## Dependencies

- **Step 1 must be completed first:** The rewritten `grill-me/SKILL.md` (Step 1) must exist before prompt Skill References cross-reference its content. Step 1 is APPROVED.

## Files Affected

- `src/prompts/create-plan.md` — modified: remove two inline "use the grill-me skill" sentences, add grill-me to Skill References
- `src/prompts/revise-plan.md` — modified: insert new Step 5 (user validation), re-number Steps 5–7 to 6–8, update step references in Skill References, add grill-me to Skill References
- `src/prompts/create-goal.md` — modified: add Skill References section referencing both pio-planning and grill-me

## Acceptance Criteria

- [ ] `src/prompts/create-plan.md` has no inline "use the grill-me skill" phrasing; Step 2 and Step 3 end with WHAT-level instructions only
- [ ] `src/prompts/create-plan.md` Skill References section includes `grill-me` alongside `pio-planning`, noting it covers resolving research gaps and validating assumptions
- [ ] `src/prompts/revise-plan.md` contains a new user validation step (between Research and Design) that declares WHAT outcomes without prescribing tool usage (no "use the grill-me skill" phrasing)
- [ ] `src/prompts/revise-plan.md` steps are re-numbered sequentially after the insertion: old Step 5 → Step 6 ("Design new steps"), old Step 6 → Step 7 ("Write PLAN.md"), old Step 7 → Step 8 ("Signal completion")
- [ ] `src/prompts/revise-plan.md` Skill References section includes `grill-me` alongside `pio-planning`, and internal step number references match the new numbering
- [ ] `src/prompts/create-goal.md` has a new Skill References section at the end referencing both `pio-planning` and `grill-me`
- [ ] None of the three prompts contain inline "use the grill-me skill" phrasing after changes
- [ ] `npm run check` (tsc --noEmit) passes with no errors
- [ ] `npm test` passes with no regressions (all existing tests still pass)

## Risks and Edge Cases

- **Step numbering in revise-plan.md:** The Skill References section currently says "steps 5 and 6 above" — these must be updated to reflect new numbering ("steps 6 and 7"). Check for any other hardcoded step references in the document body.
- **Formatting consistency:** The three Skill References sections should follow similar formatting conventions but don't need to be identical — create-plan.md is the template, revise-plan.md follows it with updated step numbers, create-goal.md gets a new section modeled on the same pattern.
- **No TypeScript changes:** These are `.md` files only. The `tsc --noEmit` check should pass trivially since no `.ts` files are modified. Run it anyway to confirm no indirect references (e.g., string literals in TS referencing these prompts) break.
