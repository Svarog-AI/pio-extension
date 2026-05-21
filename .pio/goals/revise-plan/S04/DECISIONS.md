# Accumulated Decisions (through Step 3)

## Plan Deviations

- **Shared skill directory name:** The planning skill was created at `src/skills/pio-planning/SKILL.md` instead of `src/skills/planning/SKILL.md` as originally specified in PLAN.md. All downstream steps referencing this path must use `pio-planning`.

## Architecture Decisions

- **Skill structure:** Planning methodology extracted into 6 sections (Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol). Capability-specific instructions remain in individual prompt files. This separation pattern applies to revise-plan as well: revise-specific instructions go in `revise-plan.md`, methodology reference points to the shared skill.
- **`revisionNeeded()` on `StepStatus`:** Follows existing lazy-evaluation pattern (`fs.existsSync` with no caching). Marker filename is exactly `REVISE_PLAN_NEEDED`. Accessible via `state.steps()[N].revisionNeeded()`. No changes needed to `GoalState` interface — used through the existing `steps()` array.
- **prepareSession exports as a named function:** Exported for testability, matching the pattern of `validateAndFindNextStep` in evolve-plan.ts.
- **Archive timestamp format:** Uses `new Date().toISOString().replace(/[:.]/g, "")` producing safe filenames like `PLAN-2026-05-21T143022Z.md`.
- **Copy-then-delete for archiving:** `fs.copyFileSync` followed by `fs.unlinkSync` — safe because if delete fails after copy, both files exist (data preserved).
- **readOnlyFiles as callback:** Uses a callback to dynamically resolve approved step folders at session time, matching the evolve-plan pattern for step-dependent config.
