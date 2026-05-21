# Task: Update create-plan prompt to reference shared skill

Shrink `src/prompts/create-plan.md` by extracting methodology content into the shared planning skill, retaining only capability-specific instructions for creating a fresh plan from GOAL.md.

## Context

`create-plan.md` currently contains ~214 lines with all planning methodology inline: PLAN.md structure format, step design rules, acceptance criteria guidelines, research instructions, scope discipline, and user interaction protocol. Step 1 extracted this content into `src/skills/pio-planning/SKILL.md`. Step 5 (revise-plan.md) demonstrated the target pattern — a slim prompt that references the skill. Now create-plan.md must be updated to match: remove duplicated methodology, add references to the shared skill, and keep only what is unique to the "create a fresh plan" workflow.

## What to Build

Rewrite `src/prompts/create-plan.md` as a capability-specific prompt that delegates planning conventions to the `pio-planning` skill. The new file should be significantly shorter (target: ~60-100 lines vs current 214).

### Code Components

#### Role Definition and Setup

Retain the role definition ("You are a Planning Agent") and setup instructions unchanged. These are capability-specific — they establish context for "creating a fresh plan from GOAL.md" as opposed to revising an existing one.

#### Process Steps

Restructure process steps to inline only create-plan-specific logic and reference the skill for shared methodology:

- **Step 1 (Read GOAL.md):** Keep as-is — this is already capability-specific context.
- **Step 2 (Deep research):** Shrink significantly. The detailed research instructions are in the `pio-planning` skill under "Research Process". Replace with a brief instruction to read GOAL.md-referenced files and understand existing patterns, then reference the skill for detailed research methodology.
- **Step 3 (Validate assumptions and gather preferences):** Keep but trim. This is partially covered by the skill's "User Interaction Protocol" but has create-plan-specific details about presenting findings, scope alignment, and summarizing before writing. Retain the capability-specific interaction flow — what to present, what decisions to ask about — but remove duplicated general rules (e.g., "use ask_user", "max 2 attempts") that are already in the skill or ask-user skill.
- **Step 4 (Design the steps):** Shrink to a brief instruction referencing the `pio-planning` skill for step design rules. The inline quality criteria (concrete, ordered, sized, independent) are duplicated from the skill.
- **Step 5 (Write PLAN.md):** Replace the detailed format template with a reference to the `pio-planning` skill for PLAN.md structure. Retain any create-plan-specific instructions (e.g., frontmatter must have `totalSteps`, step heading format). The full YAML frontmatter example, section descriptions, and step template should be removed — they are in the skill.
- **Step 6 (Signal completion):** Keep as-is — this is standard pio protocol, not methodology.

#### Guidelines Section

Replace most inline guidelines with references to the `pio-planning` skill. Retain create-plan-specific guidelines only:
- "Do not modify GOAL.md" — keep (capability-specific constraint)
- Acceptance criteria rules — remove, these are in the skill
- No dedicated test steps — remove, these are in the skill
- Reference real files — remove, this is in the skill's Scope Discipline
- No source code — remove, this is in the skill's Scope Discipline
- User interaction rules (ask_user usage, don't over-interview) — remove, these are in the skill's User Interaction Protocol
- "Be proactive about asking" / "Summarize plan structure before writing" — trim to brief reference, detailed instructions are in the skill

Remove the "Example Interaction Flow" section entirely — it demonstrates user interaction protocol which is documented in the skill. An example may be retained if significantly shortened (1-2 paragraphs max) and focused on create-plan-specific flow rather than general ask_user usage.

#### Skill References Section

Add a new section at the end of the prompt following the pattern from `revise-plan.md`:

```markdown
## Skill References

This prompt references the `pio-planning` skill for detailed methodology. When designing steps and writing PLAN.md, follow the conventions documented in the `pio-planning` skill (`src/skills/pio-planning/SKILL.md`) for:
- PLAN.md structure and frontmatter format
- Step design rules (concrete, ordered, sized for an executor)
- Acceptance criteria guidelines (programmatic verification, no dedicated test steps)
- Research process (what to investigate before designing steps)
- Scope discipline (stay within GOAL.md, reference real files only, no source code)
- User interaction protocol (when to ask users, how to use ask_user, summarizing before writing)
```

### Approach and Decisions

- **Follow the revise-plan.md pattern:** Step 5 established the slim-prompt pattern. Use it as a template — same structure (role → Setup → Process → Guidelines → Skill References), with create-plan-specific content replacing revise-specific content.
- **Correct skill path:** The planning skill is at `src/skills/pio-planning/SKILL.md` (not `src/skills/planning/`). All references must use the correct path. This is a plan deviation from the original plan specification.
- **No methodology loss:** Every rule removed from create-plan.md must have a corresponding entry in `src/skills/pio-planning/SKILL.md`. Verify this during the rewrite — cross-reference each removed guideline with the skill to confirm coverage.
- **Capabiliy-specific content is what remains unique to create-plan:** The distinction between "creating a fresh plan" vs "revising an existing plan" drives the capability-specific content. Create-plan does NOT read archived plans or identify completed steps — these are revise-plan specifics. Create-plan DOES engage the user in interactive planning (Step 3) — revise-plan does not emphasize this as much since revision is more mechanical.
- **Keep Step 3 (Validate assumptions) relatively detailed:** Unlike revise-plan, create-plan requires significant user interaction during planning. The prompt should guide the agent through findings presentation, architecture decisions, scope alignment, and execution preferences. Reference the skill for general rules but keep the capability-specific flow intact.

## Dependencies

- Step 1: `src/skills/pio-planning/SKILL.md` must exist with complete methodology content (completed)
- Step 5: `src/prompts/revise-plan.md` provides the target pattern for slim prompts with skill references (completed)

## Files Affected

- `src/prompts/create-plan.md` — modified: extract methodology into skill reference, keep capability-specific instructions

## Acceptance Criteria

- [ ] `src/prompts/create-plan.md` is significantly shorter than before (~60-100 lines vs current 214)
- [ ] Prompt retains capability-specific role definition ("You are a Planning Agent") and process overview
- [ ] Prompt references the shared planning skill (`pio-planning`) for methodology details — must mention `pio-planning` by name
- [ ] Prompt uses correct skill path: `src/skills/pio-planning/SKILL.md` (not `src/skills/planning/SKILL.md`)
- [ ] No methodology rules are lost — every removed guideline has a corresponding entry in the shared skill
- [ ] "Do not modify GOAL.md" constraint is retained
- [ ] Process steps still guide: Read GOAL.md → Research → Validate with user → Design steps → Write PLAN.md → Signal completion
- [ ] A "Skill References" section exists at the end listing what to consult from the `pio-planning` skill
- [ ] `npx tsc --noEmit` reports no errors (no TypeScript source changed, but verify clean compilation)

## Risks and Edge Cases

- **Content drift:** Ensure nothing important is accidentally deleted rather than moved. Cross-reference every removed paragraph against the planning skill to confirm it has a home there.
- **Over-slimming:** Don't remove ALL detail — some inline guidance is helpful for first-time readers. The revise-plan.md pattern keeps capability-specific details while referencing the skill for shared conventions. Follow this balance.
- **Skill path correctness:** The original plan specified `src/skills/planning/SKILL.md` but Step 1 used `src/skills/pio-planning/SKILL.md`. Use the actual (correct) path.
