# Plan: Add unit and integration test sections to the evolve-plan TEST.md template

Revise `src/prompts/evolve-plan.md` so the Specification Writer produces TEST.md files with explicit Unit Tests and Integration Tests sections, enabling real test-first implementation.

## Prerequisites

None.

## Steps

### Step 1: Revise evolve-plan.md to add Unit Tests and Integration Tests to TEST.md template

**Description:** Update `src/prompts/evolve-plan.md` in two places — the preamble (Section A) and the Step 6 TEST.md template (Section B) — so the Specification Writer can prescribe actual test files alongside programmatic and manual checks.

**Section A — Preamble and "What to Build" instructions:**
- Keep the first sentence's "TDD-style test plan" framing but clarify that TEST.md should describe *actual test code* when the project supports it, not just a verification checklist.
- Add a new paragraph (before Step 1 or in an introductory section) instructing the Specification Writer to:
  1. Check whether the project has a test runner (Jest, Vitest, etc.) and existing test conventions before writing TEST.md
  2. Prescribe actual test files (`.test.ts`/`.spec.ts`) with concrete test cases when the codebase supports it
  3. Fall back to programmatic verification only when no test infrastructure exists — explicitly note this fallback in TEST.md
  4. Omit empty sections — if a category doesn't apply, skip it rather than leaving a blank heading

**Section B — Step 6 TEST.md template:**
- Restructure the template to include four verification sections in this order:
  1. **Unit Tests** — describes test files to create (`.test.ts`/`.spec.ts`), individual test cases with inputs and expected outputs, and which test runner to use
  2. **Integration Tests** — describes test cases that verify cross-module behavior, end-to-end flows, or tool interaction
  3. **Programmatic Verification** — unchanged from current template (commands, grep, file checks)
  4. **Manual Verification (if any)** — unchanged from current template
- Retain the "Test Order" section but position it after all four verification categories, ordering: unit → integration → programmatic → manual

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no TypeScript errors after changes
- [ ] The preamble of `src/prompts/evolve-plan.md` contains instructions to check for test infrastructure before writing TEST.md
- [ ] The preamble instructs the Specification Writer to prescribe actual test files (`.test.ts`/`.spec.ts`) when possible and to fall back to programmatic verification when no test runner exists
- [ ] The preamble instructs the Specification Writer to omit empty sections
- [ ] Step 6's TEST.md template contains a "Unit Tests" section describing test files, test cases with inputs/expected outputs, and test runner references
- [ ] Step 6's TEST.md template contains an "Integration Tests" section describing cross-module or end-to-end test cases
- [ ] Step 6's TEST.md template retains the "Programmatic Verification" section (unchanged in content/purpose)
- [ ] Step 6's TEST.md template retains the "Manual Verification (if any)" section (unchanged in content/purpose)
- [ ] The four verification sections appear in order: Unit Tests → Integration Tests → Programmatic Verification → Manual Verification
- [ ] The "Test Order" section appears after all four verification categories and specifies unit → integration → programmatic → manual ordering
- [ ] No other files in the repository were modified (this is strictly a prompt template change)

**Files affected:**
- `src/prompts/evolve-plan.md` — revise preamble and Step 6 TEST.md template to add Unit Tests and Integration Tests sections; add test infrastructure check instructions

## Notes

- The `execute-task.md` prompt already references unit/integration tests in Step 4 ("Determine test strategy: Which test cases from TEST.md can be implemented as actual unit/integration tests?"). No changes are needed there — the new evolve-plan output will naturally feed into the existing execute-task workflow.
- Projects without test infrastructure (like this one, which only has `npm run check`) will still work correctly: the Specification Writer will note the absence and rely on programmatic/manual verification sections.
- The prompt wording should make it clear that Unit Tests and Integration Tests sections are *conditional* — they appear only when relevant to the step and project. Empty headings should be omitted entirely.
