# Code Review: Update `evolve-plan.md` with TDD skill reference (Step 5)

## Decision
APPROVED

## Summary
The implementation adds a single, well-placed paragraph referencing the `test-driven-development` skill inside Step 6 (Write TEST.md) of `src/prompts/evolve-plan.md`. The reference correctly highlights all four relevant TDD principles (Arrange-Act-Assert, DAMP over DRY, one assertion per concept, test pyramid sizing). The change is minimal — 6 added lines, 0 deletions — and does not alter existing guidance. It follows the same formatting convention as Step 4's `execute-task.md` update but is appropriately lighter for the specification-writing role.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- [LOW] The TDD skill guidance paragraph is a single dense sentence (~50 words). Breaking it into 2 shorter sentences could improve readability for agents, but this is a minor style preference. — `src/prompts/evolve-plan.md` (line 126)

## Test Coverage Analysis
All acceptance criteria from TASK.md are covered:

| Criterion | Verification | Result |
|-----------|-------------|--------|
| Skill reference in or near Step 6 | `grep -n` shows line 126, inside Step 6 (line 122) | ✅ Pass |
| References Arrange-Act-Assert | `grep -i 'arrange.*act.*assert'` — match found | ✅ Pass |
| References DAMP over DRY | `grep -i 'damp'` — match found | ✅ Pass |
| References one assertion per concept | `grep -i 'one assertion\|one.*concept'` — match found | ✅ Pass |
| References test pyramid sizing | `grep -i 'test pyramid'` — match found | ✅ Pass |
| Brief (single paragraph) | 6 added lines, no new sections | ✅ Pass |
| No unintended changes | `git diff` shows additions only, no deletions of substantive content | ✅ Pass |

## Gaps Identified
No gaps. The implementation aligns perfectly with GOAL → PLAN → TASK specifications:
- **GOAL ↔ PLAN:** Step 5 correctly targets evolve-plan.md with a lighter reference vs. execute-task.md's comprehensive callout.
- **PLAN ↔ TASK:** Task spec faithfully represents the plan step — focused on adding a single paragraph near Step 6.
- **TASK ↔ Implementation:** The added paragraph matches all described requirements: placement, principles mentioned, brevity, and formatting convention.

## Recommendations
N/A — implementation is complete and correct as-is.
