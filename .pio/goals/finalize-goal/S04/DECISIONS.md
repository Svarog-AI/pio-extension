# Accumulated Decisions (Steps 1–3)

## Plan Deviation: Step 4 Skipped — No `lastStepDecisions()` in GoalState

**Decision:** The `lastStepDecisions()` method was removed from the plan. Steps 5 and 6 must NOT reference or call `GoalState.lastStepDecisions()`.

**Reasoning:** The finalize-goal tool does not validate DECISIONS.md existence — the agent handles it. Adding a `GoalState` method with zero consumers is over-abstraction. The agent (LLM session) can scan step folders itself using the goal workspace path provided in the initial message.

**Downstream impact:** Step 5 (finalize-goal capability) must pass the goal workspace directory path to the agent and let it find DECISIONS.md autonomously. Do not add validation logic or GoalState method calls for DECISIONS.md lookup.

## Skill Structure: Update Rules as Per-File Tables

The pio-project-knowledge skill (`src/skills/pio-project-knowledge/SKILL.md`) organizes update rules as tables per PROJECT file, mapping decision categories → target file + section + action. This is the canonical structure that downstream agents must reference when evaluating decisions.

**Downstream impact:** Steps 5–6 must reference this skill by name; do not re-encode update rules inline.

## Finalize-Goal Prompt: Multi-Source Analysis (PLAN.md + SUMMARY.md + DECISIONS.md)

The finalize-goal agent reads PLAN.md, per-step SUMMARY.md files, and DECISIONS.md to identify PROJECT file updates. The capability module must provide the goal workspace path so the agent can scan for step folders itself.

**Downstream impact:** Step 5 (capability tool/initial message) must provide the goal workspace directory path — not a pre-located DECISIONS.md path. The agent handles discovery and missing-file gracefulness.

## Test File Placement: Colocated .test.ts

Tests are colocated alongside source files under `src/` using the `*.test.ts` naming convention. Use existing helpers (`createGoalTree()` in `goal-state.test.ts`) as patterns.

**Downstream impact:** Step 5 tests go in `src/capabilities/finalize-goal.test.ts`. Step 6 tests update `src/state-machine.test.ts` and add capability registration checks.
