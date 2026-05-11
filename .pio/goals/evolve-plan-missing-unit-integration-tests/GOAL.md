# Add unit and integration test sections to the evolve-plan TEST.md template

The `evolve-plan` prompt currently generates `TEST.md` with only "Programmatic Verification" (shell commands, grep checks) and "Manual Verification" sections. This goal adds explicit sections for **Unit Tests** and **Integration Tests** so the Specification Writer can prescribe actual test files (`.test.ts`, `.spec.ts`) with concrete test cases, inputs, expected outputs, and test runner references.

## Current State

The evolve-plan prompt (`src/prompts/evolve-plan.md`) instructs the Specification Writer to produce `TEST.md` in Step 6. The template defines exactly two verification categories:

- **Programmatic Verification** — commands like `npm run check`, `grep`, file existence checks
- **Manual Verification (if any)** — step-by-step instructions for human inspection

The preamble mentions "TDD-style test plan" but the generated output is a verification checklist, not a specification that drives test-first implementation. There are no sections or instructions for:

- Writing `.test.ts` or `.spec.ts` files
- Describing test cases with assertions, inputs, and expected outputs
- Referencing a test runner (Vitest, Jest, etc.)
- Distinguishing unit-level tests from cross-module integration tests

As a result, when `execute-task` implements a step, it reads `TEST.md` and only runs programmatic/manual checks. No actual test code is produced or executed as part of the workflow. The TDD claim doesn't match the output.

Relevant files:
- `src/prompts/evolve-plan.md` — Step 6 (Write TEST.md) contains the template to update; preamble on line 1 sets "TDD-style" framing
- `src/capabilities/evolve-plan.ts` — launches the evolve-plan session (no changes needed here, prompt-only fix)

## To-Be State

After this goal is complete:

1. **Step 6 of `src/prompts/evolve-plan.md`** includes a revised TEST.md template with four sections in this order:
   - **Unit Tests** — describes test files to create (`.test.ts`/`.spec.ts`), individual test cases with inputs and expected outputs, and which test runner to use
   - **Integration Tests** — describes test cases that verify cross-module behavior, end-to-end flows, or tool interaction
   - **Programmatic Verification** — unchanged from current (commands, grep, file checks)
   - **Manual Verification (if any)** — unchanged from current

2. **The prompt instructs the Specification Writer to:**
   - Check whether the project has a test runner and existing test conventions before writing TEST.md
   - Prescribe actual test files when the codebase supports it
   - Fall back to programmatic verification only when no test infrastructure exists (explicitly note this fallback)
   - Omit empty sections — if a category doesn't apply to the step, skip it rather than leaving a blank heading

3. **The "Test Order" section** is retained but positioned after all test categories, ordering unit → integration → programmatic → manual.

4. **No changes to `src/capabilities/evolve-plan.ts` or other capability files.** This is strictly a prompt template change. The existing sub-session mechanics, file protections, and validation remain unchanged.

The net effect: when a project has test infrastructure, `evolve-plan` will produce TEST.md files that specify real unit and integration tests alongside programmatic checks. Projects without test runners will still work — the Specification Writer will note the absence and rely on programmatic/manual verification.
