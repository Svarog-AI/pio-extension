---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 1
lowIssues: 0
---

# Code Review: Plan frontmatter with per-step metadata and enriched StepStatus (Step 3)

## Decision
APPROVED

## Summary
The implementation correctly extends the PLAN.md frontmatter schema with a required `steps` array, enriches `StepStatus` with a `getMetadata()` method, and validates the new field during plan creation. All 581 tests pass with zero regressions. TypeScript compilation reports no errors. The code follows existing lazy-evaluation patterns and handles backward compatibility gracefully — old plans without `steps` return `null` from `getMetadata()` without crashing.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- [MEDIUM] Regression fixes in 3 files not documented in SUMMARY.md: `src/capabilities/evolve-plan.test.ts` (updated PLAN.md fixtures for new required `steps`), `src/frontmatter-schemas.test.ts` (updated all 14 test inputs to include `steps`), and `src/state-machine.test.ts` (added `getMetadata` to mock StepStatus). Additionally, `src/capabilities/create-plan.ts` was modified with core validation logic but omitted from SUMMARY.md's "Files Modified" section. These changes are correct and necessary — TEST.md explicitly warns about updating fixtures — but SUMMARY.md should list all files touched for downstream visibility. — `S03/SUMMARY.md`

## Low Issues
- (none)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered:

| Acceptance Criterion | Test Coverage | Status |
|---|---|---|
| `npx tsc --noEmit` reports no errors | Programmatic verification | ✅ Pass |
| 563+ tests pass with no regressions | `npm test` — 581 tests pass | ✅ Pass |
| TypeBox rejects plans without `steps` field | `create-plan.test.ts`: "rejects when steps field is missing" | ✅ Pass |
| Valid `steps` with `complexity: "subgoal"` accepted | `create-plan.test.ts`: "passes when steps entries include complexity: 'subgoal'" | ✅ Pass |
| Rejects length mismatch | `create-plan.test.ts`: "rejects when steps array length is less/greater than totalSteps" | ✅ Pass |
| Rejects empty name or invalid complexity | `create-plan.test.ts`: dedicated test cases for both | ✅ Pass |
| Old plans: `planMetadata()` returns null, workflows continue | `goal-state.test.ts`: "returns null when PLAN.md has no steps field" | ✅ Pass |
| `getMetadata()` populated from frontmatter | `goal-state.test.ts`: "returns metadata for step 1/2/3" | ✅ Pass |
| Step N maps to index N-1; returns null out of bounds | `goal-state.test.ts`: "maps step N to index N-1", "out of bounds" | ✅ Pass |

TEST.md test plan is fully executed — all described test cases exist and pass. No gaps identified.

## Gaps Identified
- **GOAL ↔ PLAN**: GOAL.md originally specified in-body `[subgoal]` annotations as primary detection method. PLAN.md deliberately changed to frontmatter-only (`steps` array). This architectural decision is documented in PLAN.md notes but represents a deviation from the original GOAL.md vision. Downstream steps (4–7) should rely on frontmatter exclusively, not body-scanning.
- **TASK ↔ SUMMARY**: SUMMARY.md lists 4 files modified but 8 files were actually changed (including 3 test regression fixes). No functional gap — just incomplete documentation.

## Recommendations
N/A — approved with user confirmation on the medium-severity documentation issue. Future steps should be aware that `src/capabilities/evolve-plan.test.ts`, `src/frontmatter-schemas.test.ts`, and `src/state-machine.test.ts` were modified as regression fixtures and may need further updates in subsequent steps.
