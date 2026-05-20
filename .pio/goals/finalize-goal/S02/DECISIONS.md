# Accumulated Decisions (Steps 1–2)

## Skill Structure: Update Rules as Per-File Tables

The pio-project-knowledge skill (`src/skills/pio-project-knowledge/SKILL.md`) organizes update rules as tables per PROJECT file, mapping decision categories → target file + section + action. This is the canonical structure that downstream agents (finalize-goal prompt, Step 3+) must reference when evaluating decisions.

**Downstream impact:** Steps 3–6 must reference this skill by name; do not re-encode update rules inline.

## Decision Filtering Guidance Included

The skill includes a "Decision Filtering" section: skip implementation-only details, local design choices with no downstream consequences, and one-off decisions already fully applied. This prevents forced or low-value PROJECT file updates.

**Downstream impact:** The finalize-goal prompt (Step 3) must instruct the agent to follow this filtering guidance when evaluating DECISIONS.md entries.
