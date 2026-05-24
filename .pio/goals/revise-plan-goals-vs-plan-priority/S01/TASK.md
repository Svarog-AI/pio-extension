# Task: Update revise-plan.md prompt with priority hierarchy

Strengthen the revise-plan prompt to explicitly establish that archived plans are the primary authority on implementation details, overriding GOAL.md's high-level descriptions.

## Context

Currently, the revise-plan prompt tells agents "Read GOAL.md, this is your contract" and "read archived plans for reference." This language implicitly makes GOAL.md the primary source of truth, causing agents to discard deliberate implementation decisions from archived plans and diverge into unwanted scope changes (observed on the `execute-task-auto-commit` goal). The prompt needs to delegate the *how* of priority resolution to the `pio-planning` skill while making it clear that archived PLAN.md > GOAL.md for implementation details.

## What to Build

Modify `src/prompts/revise-plan.md` at exactly three locations:

### 1. Step 2 — Strengthen "Read archived plans" language

Replace the weak "read for reference on what was planned before" phrasing with explicit priority language. The rewritten paragraph must:

- State that the archived plan is the **primary authority on implementation details** — formatting decisions, architectural choices, and specific approaches already made by the planning agent
- Clarify that GOAL.md defines scope boundaries (*what* to build), while the archived plan defines implementation decisions (*how* to build it)
- State that when resolving conflicts between sources, the agent should follow the priority hierarchy documented in the `pio-planning` skill
- Reference the `pio-planning` skill by name (it will be updated in Step 2 with the detailed rules)

### 2. Step 5 — Add a guiding principle about priority hierarchy

In the "Guiding principles" subsection under Step 5, add a new principle stating that modifications to archived plan decisions must follow the rules defined in the `pio-planning` skill (priority hierarchy for plan revision). The principle should:

- Direct the agent to consult the `pio-planning` skill for the rules on when modifying archived plan decisions is permitted
- NOT enumerate the three exception cases inline — those belong in the skill (Step 2)
- Keep the prompt lean; delegate the *how* to the skill

### 3. Guidelines section — Add a new entry

Add a guideline referencing the priority hierarchy: "When rewriting the plan, follow the priority hierarchy for implementation details defined in the `pio-planning` skill." This is a short reference — the detailed rules live in the skill file.

### Constraints on the changes

- **Do NOT duplicate detailed rules in the prompt.** The three exception cases (revision notes override, gaps discovered during spec, re-numbering) and the scope-vs-how distinction belong exclusively in `src/skills/pio-planning/SKILL.md` (Step 2). The prompt references but does not repeat these rules.
- **Do NOT weaken Step 1 language.** GOAL.md is still read as the scope contract — this must be preserved as-is. Only Step 2's framing of archived plans changes.
- **Edit existing paragraphs, don't replace entire sections.** Make targeted edits to the specific locations described above. Preserve all other prompt content unchanged.

## Dependencies

None.

## Files Affected

- `src/prompts/revise-plan.md` — modify Step 2 paragraph, add guiding principle in Step 5, add new guideline entry

## Acceptance Criteria

- [ ] Step 2 explicitly states the archived PLAN.md is the primary authority on implementation details (not GOAL.md)
- [ ] Step 2 references the `pio-planning` skill for the priority hierarchy rules (does not enumerate detailed exception cases inline)
- [ ] Step 5 contains a guiding principle directing the agent to follow the `pio-planning` skill's priority hierarchy when modifying archived plan decisions
- [ ] Guidelines section contains a new entry referencing the `pio-planning` skill for the priority hierarchy
- [ ] The prompt does NOT duplicate the detailed "how" rules (three exception cases, scope vs. how distinction) — those live in the skill
- [ ] Step 1 language is preserved — GOAL.md is still read as the scope contract (not removed or weakened)
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Existing test suite passes with no regressions (`npx vitest run`)

## Risks and Edge Cases

- **Over-promising to the skill:** The prompt references `pio-planning` skill for priority hierarchy rules, but Step 2 (which adds those rules) hasn't been implemented yet. This is acceptable — the plan notes explicitly state both steps modify markdown only and no TS code changes are needed. The executor should ensure the prompt's reference is clear enough that an agent encountering it will find the right skill section.
- **Accidental scope creep:** It's easy to start enumerating the detailed rules in the prompt itself. Resist this — the constraint is explicit: the prompt delegates *how* to the skill. If you catch yourself writing exception cases inline, move them out.
- **Preserving existing content:** The prompt has 7 steps and a Guidelines section with multiple entries. Use precise edits to modify only the targeted locations. Verify no other content was accidentally changed.
