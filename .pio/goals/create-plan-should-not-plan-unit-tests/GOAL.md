# Clarify test responsibility boundary in create-plan prompt

The `create-plan` capability's prompt should explicitly prevent the planning agent from creating dedicated "write unit tests" steps. Per-step unit testing is already handled by `evolve-plan` (via `TEST.md`) and `execute-task`. This goal adds explicit guidance to enforce the responsibility split between planning-level acceptance criteria and per-step test specification.

## Current State

The create-plan prompt (`src/prompts/create-plan.md`) currently instructs:

> "Specify how each step is verified — don't write tests yourself. Your job is to say what should be tested and how it can be checked programmatically (existing test suites, type checking, linting, build commands, curl checks)."

This guidance correctly describes acceptance criteria — high-level verification of step completion. However, in practice the planning agent frequently misinterprets this and produces plans where:

- Dedicated steps exist for "Write tests for X module" as standalone plan items
- Detailed unit test structure (test files, specific test cases) is planned at the PLAN level
- The boundary between acceptance criteria and test implementation is blurred

Meanwhile, `evolve-plan` (`src/prompts/evolve-plan.md`) already handles per-step testing through `TEST.md` generation, which describes concrete test files (`.test.ts`/`.spec.ts`), specific test cases, inputs, and expected outputs. The `execute-task` capability then writes and runs the actual tests from TEST.md.

The responsibility split should be:

| Capability | Test responsibility |
|---|---|
| **create-plan** | Acceptance criteria per step (how to verify completion) |
| **evolve-plan** | `TEST.md` per step (unit tests, specific test cases, verification commands) |
| **execute-task** | Write and run the actual unit tests described in TEST.md |

The only file that needs modification is `src/prompts/create-plan.md`.

## To-Be State

The `create-plan.md` prompt will include explicit guidance enforcing the test responsibility boundary:

1. **Explicit prohibition:** A clear statement that acceptance criteria describe how to verify completion, and dedicated steps for writing tests should not be created — testing is handled per-step by `evolve-plan` (TEST.md) and `execute-task`.

2. **Integration-level exception allowed:** If the goal requires integration tests spanning multiple steps, the planning agent may include an integration verification step near the end of the plan. This is distinct from per-step unit tests.

3. **Examples of good vs bad criteria:** The prompt should include concrete examples:
   - Good: "`npx tsc --noEmit` reports no errors" (programmatic check)
   - Good: "new function is exported from `src/auth/index.ts`" (verifiable fact)
   - Bad: "unit tests for X cover all edge cases" (that's evolve-plan/execute-task territory)

4. **Removed or clarified language:** Any existing language in the prompt that could be interpreted as encouraging planning of unit test steps should be removed or reworded to avoid ambiguity.

The change is localized to `src/prompts/create-plan.md`. No other files require modification — `evolve-plan.md` already correctly handles TEST.md generation, and `execute-plan.md` already follows the right pattern.
