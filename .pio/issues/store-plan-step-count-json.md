# Store expected step count in PLAN.md as JSON for testable evolve-plan completion detection

Currently, `evolve-plan` detects "all steps complete" by having the agent inside a sub-session read PLAN.md and search for its assigned step heading with regex. If the step doesn't exist, the agent writes a COMPLETED marker. This relies on prompt-driven agent behavior and is not easily testable end-to-end.

**Proposal:** When `create-plan` generates PLAN.md (or as a post-processing step), extract the total number of steps and store it in a machine-readable format — e.g., a JSON metadata block at the top or bottom of PLAN.md, or a separate `PLAN.json` file:

```json
{ "totalSteps": 3 }
```

This enables:
- **Host-side detection:** `validateAndFindNextStep` can compare `discoverNextStep()` result against `totalSteps` and directly return `{ ready: false }` when all steps are done — no sub-session launch needed.
- **Unit testability:** The comparison is a simple numeric check, trivially testable without simulating agent behavior inside a sub-session.
- **Deterministic completion:** No ambiguity about whether PLAN.md regex matching works correctly — the authoritative count is explicit.

**Files involved:** `src/capabilities/create-plan.ts` (write step count), `src/capabilities/evolve-plan.ts` (read and compare), `__tests__/` (add tests for host-side detection).

## Category

improvement

## Context

Related to the evolve-plan COMPLETED marker fix (goal: fix-evolve-plan-planned-allowlist). During review it was noted that the end-to-end "agent writes COMPLETED when all steps are done" scenario is not unit-testable because it requires simulating agent behavior inside a sub-session. An explicit step count would eliminate the need for regex-based PLAN.md scanning and make the completion check trivially testable.
