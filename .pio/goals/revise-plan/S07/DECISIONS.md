# Accumulated Decisions (through Step 6)

## Plan Deviations

- **Shared skill directory name:** The planning skill lives at `src/skills/pio-planning/SKILL.md` instead of `src/skills/planning/SKILL.md`. All references must use `pio-planning`. This affected Steps 5, 6, and must be used in Step 7's wiring.

## Architecture Decisions

- **Skill structure pattern:** Planning methodology extracted into sections (Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol). Capability-specific instructions remain in individual prompt files. Both create-plan.md and revise-plan.md follow this separation: capability-specific workflow in the prompt, methodology via the shared skill reference.
- **Skill reference convention:** Prompts reference the skill by name (`pio-planning`) throughout process steps, with full path (`src/skills/pio-planning/SKILL.md`) in a dedicated "Skill References" section at the end of each prompt.

## File Placement

- **Archive timestamp format:** Uses `new Date().toISOString().replace(/[:.]/g, "")` producing safe filenames like `PLAN-2026-05-21T143022Z.md`.
- **State machine transition purity:** `transitionRevisePlan()` does NOT pass explicit `stepNumber` — lets evolve-plan discover via `state.currentStepNumber()`. Routes unconditionally to evolve-plan after revision.
- **`prepareSession` as named export:** Used for testability, matching existing patterns in the codebase.
