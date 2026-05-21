# Decisions (through Step 2)

## Plan Deviations

- **Shared planning skill path:** The skill was created at `src/skills/pio-planning/SKILL.md` rather than `src/skills/planning/SKILL.md` as stated in PLAN.md. The `pio-planning` name aligns with existing skill naming conventions (`pio/`, `pio-project-knowledge/`). All downstream steps referencing this path must use `pio-planning`.

## Architecture Decisions

- **Skill structure:** Planning methodology extracted into 6 sections (Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol). Capability-specific instructions ("you are creating a fresh plan from GOAL.md") remain in `create-plan.md` — the skill contains only shared conventions. This separation pattern applies to revise-plan as well (Step 5): revise-specific instructions go in `revise-plan.md`, methodology reference points to the shared skill.
- **`revisionNeeded()` on `StepStatus`:** Follows existing lazy-evaluation pattern (`fs.existsSync` with no caching). Marker filename is exactly `REVISE_PLAN_NEEDED`. Accessible via `state.steps()[N].revisionNeeded()`. No changes needed to `GoalState` interface — used through the existing `steps()` array.
