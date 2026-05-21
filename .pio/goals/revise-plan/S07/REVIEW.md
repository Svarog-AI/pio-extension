---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---
# Code Review: Wire revise-plan and register planning skill in index.ts (Step 7)

## Decision
APPROVED

## Summary
Step 7 wires the `revise-plan` capability and registers the `pio-planning` skill in `src/index.ts`. The implementation is minimal, focused, and follows existing patterns exactly. All acceptance criteria are met, all tests pass, and TypeScript compiles cleanly with no errors or diagnostics.

## Critical Issues
(none)

## High Issues
(none)

## Medium Issues
(none)

## Low Issues
(none)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered:

1. **Skill path presence** — `"includes pio-planning in skillPaths"` invokes `resources_discover` handler and asserts a path containing `"pio-planning"` exists.
2. **Skill names list updated** — `"skillPaths contain absolute paths under the skills directory"` asserts all four skill names including `"pio-planning"`.
3. **Tool registration** — `"setupRevisePlan registers pio_revise_plan tool"` checks `registerTool.mock.calls` for a call with `call[0]?.name === "pio_revise_plan"`.
4. **Command registration** — `"setupRevisePlan registers pio-revise-plan command"` checks `registerCommand.mock.calls` for `call[0] === "pio-revise-plan"`.

All 5 tests in `src/index.test.ts` pass (3 pre-existing + 2 new, with 1 updated). The test suite correctly uses `makeMockPi()` and validates runtime behavior via mocks.

## Gaps Identified
No gaps found. Alignment verified across all dimensions:
- **GOAL ↔ PLAN**: Step 7 correctly wires the revise-plan capability and planning skill as described in both GOAL.md and PLAN.md.
- **PLAN ↔ TASK**: Task spec faithfully represents the plan step — two changes to `src/index.ts` (import+call, skill registration).
- **TASK ↔ TESTS**: All 5 acceptance criteria have corresponding tests or programmatic verifications.
- **TASK ↔ Implementation**: Code matches task spec exactly — correct import path (`./capabilities/revise-plan`), correct skill directory name (`pio-planning`), alphabetically ordered imports, logically placed setup call.

Programmatic verification (TEST.md grep checks) all pass:
- `setupRevisePlan` count: 2 (import + call) ✅
- Module path: `from "./capabilities/revise-plan"` ✅
- Skill path: `"pio-planning"` in skillPaths ✅
- No stale `"planning"` reference ✅
- TypeScript compilation: exit code 0 ✅

## Recommendations
N/A — no changes needed.
