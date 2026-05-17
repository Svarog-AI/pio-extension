---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 1
---

# Code Review: Wire model switching into `before_agent_start` (Step 2)

## Decision
APPROVED

## Summary
The implementation correctly wires per-capability model resolution into the existing `before_agent_start` handler in `session-capability.ts`. The module-level `capabilityName` variable is captured during `resources_discover` and used to resolve the configured model before each agent turn. Model switching via `pi.setModel()` integrates cleanly with existing prompt injection logic — both operations complete in a single handler invocation and the prompt result is always returned. All 293 tests pass, type-checking reports zero errors, and the implementation follows existing project patterns.

## Critical Issues
(none)

## High Issues
(none)

## Medium Issues
(none)

## Low Issues
- [LOW] The `before_agent_start` test cases cast `ctx` objects with `as any`, bypassing type checking on the handler context shape (e.g., `{ model: currentModel, modelRegistry: { find: () => resolvedModel } } as any`). While this is acceptable for unit tests mocking internal handlers, a shared mock-context factory would improve consistency and catch future shape mismatches. — `src/capabilities/session-capability.test.ts` (lines 220–230, 257, 280, 300, 319, 340)

## Test Coverage Analysis
All 7 acceptance criteria from TASK.md are covered by tests:

| Acceptance Criterion | Covered By |
|---|---|
| `npm run check` reports no type errors | ✅ Programmatic verification — 0 errors |
| `npm run test` passes with all existing + new tests | ✅ 293 tests pass (12 files) |
| Import of `resolveModelForCapability` compiles correctly | ✅ Verified by type-checking passing |
| Model resolution only runs when `capabilityName` is defined | ✅ Test: "skips resolution when capabilityName is undefined" |
| No redundant `pi.setModel()` when current model matches | ✅ Test: "skips pi.setModel() when current model already matches" |
| No behavior change when config absent/no mapping | ✅ Tests: "no setModel call when config returns undefined" + backwards compatibility describe block |
| Session continues without crash when registry find returns undefined | ✅ Test: "skips setModel() when modelRegistry.find() returns undefined and logs warning" |

8 new tests added across 2 describe blocks. No regressions in the existing 6 tests (getSessionGoalName) or 4 tests (handleNextTask).

## Gaps Identified
- **GOAL ↔ PLAN ↔ TASK ↔ Implementation**: Fully aligned. The step implements exactly what was planned — model resolution wired into `before_agent_start` using `pi.setModel()` after prompt injection.
- **TASK ↔ TESTS**: All acceptance criteria have corresponding tests. No gaps identified.

## Recommendations
N/A — implementation is clean and complete. The single low-severity issue (inline mock context casting) can be deferred to a future refactor if desired.
