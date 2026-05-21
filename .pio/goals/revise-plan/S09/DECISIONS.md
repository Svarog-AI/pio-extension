# Accumulated Decisions (through Step 8)

## Plan Deviations

- **Shared skill directory name:** The planning skill lives at `src/skills/pio-planning/SKILL.md` instead of `src/skills/planning/SKILL.md`. All references must use `pio-planning`. This affects any documentation that references the skill path.
- **State machine transition purity:** `transitionRevisePlan()` does NOT pass explicit `stepNumber` — lets evolve-plan discover via `state.currentStepNumber()`. Routes unconditionally to evolve-plan after revision.

## Architecture Decisions

- **Skill structure pattern:** Planning methodology extracted into a shared skill (`pio-planning`). Capability-specific instructions remain in individual prompt files. Both create-plan.md and revise-plan.md follow this separation.
- **Skill reference convention:** Prompts reference the skill by name (`pio-planning`) throughout process steps, with full path (`src/skills/pio-planning/SKILL.md`) in a dedicated "Skill References" section at the end of each prompt.

## Note

This is Step 9 (final step). No further downstream decisions to carry forward — all implementation decisions have been consumed by Steps 1–8. The remaining work is documentation-only.
