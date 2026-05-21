# Accumulated Decisions (through Step 2)

## Plan Deviations

- **Shared skill directory name:** The planning skill was created at `src/skills/pio-planning/SKILL.md` instead of `src/skills/planning/SKILL.md` as originally specified in PLAN.md. The `pio-planning` name aligns with existing skill conventions (`pio/`, `pio-project-knowledge/`). Downstream steps 5–9 that reference this path must use `pio-planning`.

## Architecture Decisions

- **Skill format:** YAML frontmatter uses `name: pio-planning` and a descriptive `description` field, followed by markdown content. Modeled after `src/skills/pio-project-knowledge/SKILL.md`.
- **Skill structure:** 6 sections — Overview, PLAN.md Structure, Step Design Rules, Acceptance Criteria Guidelines, Research Process, Scope Discipline, User Interaction Protocol. Capability-specific instructions remain in individual prompt files.
