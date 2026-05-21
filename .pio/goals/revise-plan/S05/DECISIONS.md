# Accumulated Decisions (through Step 4)

## Plan Deviations

- **Shared skill directory name:** The planning skill lives at `src/skills/pio-planning/SKILL.md` instead of `src/skills/planning/SKILL.md`. All downstream steps referencing this path must use `pio-planning`. This is critical for Steps 5, 6, and 7.

## Architecture Decisions

- **Skill structure pattern:** Planning methodology extracted into sections (Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol). Capability-specific instructions remain in individual prompt files. Revise-plan follows this same separation: revise-specific workflow in `revise-plan.md`, methodology via the shared skill reference.
- **`prepareSession` as named export:** The `prepareSession` hook is exported as a named function for testability, matching the pattern of `validateAndFindNextStep` in evolve-plan.ts. Step 3 used this pattern; downstream steps should follow it when creating capability modules.
- **Archive timestamp format:** Uses `new Date().toISOString().replace(/[:.]/g, "")` producing safe filenames like `PLAN-2026-05-21T143022Z.md`. The `prepareSession` hook in Step 3 uses this convention.
- **State machine transition purity:** `transitionRevisePlan()` does NOT pass explicit `stepNumber` — lets evolve-plan discover the next step via `state.currentStepNumber()`. When `stepNumber` is missing from params, the state machine skips the `revisionNeeded()` check and falls through. Downstream: revise-plan's prompt should not assume it receives a specific target step number.
- **`transitionRevisePlan()` routes to evolve-plan:** Unconditional routing — after plan revision completes, always goes back to evolve-plan for specification. No intermediate steps.
