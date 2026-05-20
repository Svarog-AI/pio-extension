# Accumulated Decisions (Steps 1–2)

## Skill Structure: Update Rules as Per-File Tables

The pio-project-knowledge skill (`src/skills/pio-project-knowledge/SKILL.md`) organizes update rules as tables per PROJECT file, mapping decision categories → target file + section + action. This is the canonical structure that downstream agents (finalize-goal prompt, Steps 4–6) must reference when evaluating decisions.

**Downstream impact:** Step 3 (finalize-goal prompt) and Steps 4–6 must reference this skill by name; do not re-encode update rules inline.

## Decision Filtering Guidance Included

The skill includes a "Decision Filtering" section: skip implementation-only details, local design choices with no downstream consequences, and one-off decisions already fully applied. This prevents forced or low-value PROJECT file updates.

**Downstream impact:** The finalize-goal prompt (Step 3) must instruct the agent to follow this filtering guidance when evaluating DECISIONS.md entries. Steps 4–6 should be aware of this so they wire up the right behavior in the capability module.

## Finalize-Goal Prompt: Multi-Source Analysis (PLAN.md + SUMMARY.md + DECISIONS.md)

The finalize-goal agent must read PLAN.md (intent), per-step SUMMARY.md files (what was built), and DECISIONS.md (captured decisions) to identify PROJECT file updates. DECISIONS.md alone may be incomplete — not every step produces decisions, and significant changes might only appear in SUMMARY.md or PLAN.md.

**Downstream impact:** Steps 4–6 (capability module, state machine) must ensure the finalize-goal session can access the goal workspace so it can scan for step folders and read PLAN.md. The tool/initial message must provide the goal workspace path, not just DECISIONS.md content.

## Test File Placement: Colocated .test.ts

Tests are colocated alongside source files under `src/` using the `*.test.ts` naming convention (e.g., `src/goal-state.test.ts`). New tests for prompt-related changes go in `src/index.test.ts` following the pattern established in Step 2.

**Downstream impact:** Steps 4–6 should create or update colocated `.test.ts` files as appropriate, and continue adding prompt verification tests to `src/index.test.ts`.
