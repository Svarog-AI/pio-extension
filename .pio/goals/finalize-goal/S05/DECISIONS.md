# Accumulated Decisions (Steps 1–4)

## Plan Deviation: Step 4 Skipped — No `lastStepDecisions()` in GoalState

**Decision:** The `lastStepDecisions()` method was never added to `GoalState`. Steps 5 and 6 must NOT reference or call `GoalState.lastStepDecisions()`.

**Reasoning:** Zero consumers. The finalize-goal tool does not validate DECISIONS.md existence — the agent handles it. Adding a typed API with no consumers is over-abstraction.

**Downstream impact:** Step 5 (capability) must pass the goal workspace directory path to the agent. The agent discovers DECISIONS.md by scanning step folders itself. Do not add validation or GoalState method calls for DECISIONS.md lookup.

## Skill Structure: Update Rules as Per-File Tables

The pio-project-knowledge skill (`src/skills/pio-project-knowledge/SKILL.md`) organizes update rules as tables per PROJECT file, mapping decision categories → target file + section + action. This is the canonical structure that downstream agents reference when evaluating decisions.

**Downstream impact:** Step 5 references this skill by name in the prompt; do not re-encode update rules inline.

## Finalize-Goal Prompt: Multi-Source Analysis (PLAN.md + SUMMARY.md + DECISIONS.md)

The finalize-goal agent reads PLAN.md, per-step SUMMARY.md files, and DECISIONS.md to identify PROJECT file updates. The capability module must provide the goal workspace path so the agent can scan for step folders itself.

**Downstream impact:** Step 5 (capability tool/initial message) must provide the goal workspace directory path — not a pre-located DECISIONS.md path. The agent handles discovery and missing-file gracefulness.

## Test File Placement: Colocated .test.ts

Tests are colocated alongside source files under `src/` using the `*.test.ts` naming convention. Use existing helpers (`createGoalTree()` in `goal-state.test.ts`) as patterns.

**Downstream impact:** Step 5 tests go in `src/capabilities/finalize-goal.test.ts`. Step 6 tests update `src/state-machine.test.ts`.

## writeAllowlist: All 7 `.pio/PROJECT/*.md` Files

The finalize-goal capability writes to exactly the 7 PROJECT files under `.pio/PROJECT/`, following the same allowlist as `project-context.ts`. These paths are relative to the repo root (`cwd`), not a goal workspace directory.

**Downstream impact:** Step 5 CAPABILITY_CONFIG writeAllowlist matches project-context.ts exactly. workingDir must be `cwd` (not a goal dir) so that `.pio/PROJECT/*.md` resolves correctly. The agent receives the goal workspace path in the initial message for reading DECISIONS.md.
