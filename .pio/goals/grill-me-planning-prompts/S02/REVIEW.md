---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---

# Code Review: Update capability prompts to reference grill-me via Skill References (Step 2)

## Decision
APPROVED

## Summary
All three capability prompts were updated cleanly to decouple WHAT from HOW for user interviewing. Inline "use the grill-me skill" phrasing was removed from `create-plan.md` and replaced with WHAT-level outcome declarations. A new Step 5 ("Validate revision direction with the user") was inserted into `revise-plan.md` with correct re-numbering of subsequent steps. `create-goal.md` received a new Skill References section. All three prompts now reference both `pio-planning` and `grill-me` via Skill References. Type check and full test suite (674 tests) pass with no regressions.

## Critical Issues
- (none)

## High Issues
- (none)

## Medium Issues
- (none)

## Low Issues
- (none)

## Test Coverage Analysis
Per the `test-driven-development` skill, documentation-only changes to `.md` files require no unit tests — content-based prompt tests are an explicit anti-pattern. Verification was programmatic: `npm run check` (tsc --noEmit) passes, `npm test` passes (674 tests, 0 failures), and all acceptance criteria were manually verified against file contents. This approach is correct per project conventions.

## Acceptance Criteria Verification

1. ✅ `create-plan.md` has no inline "use the grill-me skill" phrasing — Step 2 ends with "When research reveals feasibility doubts or ambiguous areas, engage the user to resolve them before proceeding." Step 3 body contains only WHAT-level instructions.
2. ✅ `create-plan.md` Skill References includes `grill-me` alongside `pio-planning` (line 93), noting it covers resolving research gaps and validating assumptions.
3. ✅ `revise-plan.md` contains new Step 5 ("Validate revision direction with the user") with four WHAT-level subsections (Present what changed, Validate assumptions, Negotiate scope, Summarize and confirm) — no "use the grill-me skill" phrasing.
4. ✅ `revise-plan.md` steps are re-numbered sequentially: Steps 1–8 in correct order. Old Step 5 → Step 6 ("Design new steps"), old Step 6 → Step 7 ("Write PLAN.md"), old Step 7 → Step 8 ("Signal completion").
5. ✅ `revise-plan.md` Skill References includes `grill-me` (line 173) alongside `pio-planning`, and step references updated to "steps 6 and 7 above" (line 167).
6. ✅ `create-goal.md` has a new Skill References section (line 93) referencing both `pio-planning` and `grill-me`.
7. ✅ grep confirms zero occurrences of "use the grill-me skill" across all three prompt files.
8. ✅ `npm run check` exits with code 0, no errors.
9. ✅ `npm test`: 674 tests pass across 23 files, no regressions.

## Additional Observations

- The deletion of `src/prompts-grill-me.test.ts` (documented in SUMMARY.md) was a deliberate cleanup — the file contained 24 content-based unit tests that violate the `test-driven-development` skill's explicit anti-pattern for prompt testing. Justified removal with no behavioral impact.
- No unintended changes to unrelated files. Git status shows only expected workflow artifacts and the three modified `.md` prompt files.
- The `DECISIONS.md` note about removing the "Relationship with other skills" section from grill-me was respected — prompts reference skill intro content, not a dedicated relationships section.

## Recommendations
N/A — implementation meets all requirements cleanly.
