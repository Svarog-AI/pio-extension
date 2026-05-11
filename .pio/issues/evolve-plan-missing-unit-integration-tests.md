# evolve-plan never prescribes unit or integration tests—only programmatic verification

## Problem

The `evolve-plan` capability (prompt: `src/prompts/evolve-plan.md`) generates `TEST.md` with only two categories of checks:

1. **Programmatic Verification** — commands like `npm run check`, `grep`, file existence checks
2. **Manual Verification** — step-by-step instructions for human inspection

Neither category corresponds to actual unit tests or integration tests. There's no instruction to produce `.test.ts` files, describe test cases with assertions, or reference a test runner (Vitest, Jest, etc.). The word "TDD" appears in the preamble but the generated `TEST.md` is a verification checklist, not a test specification that drives implementation.

## Impact

- Tests are never written as part of the workflow since `execute-plan` implements what `TEST.md` prescribes
- No regression safety net accumulates across steps
- Behavior is verified only by compilation/linting checks and manual inspection
- The TDD claim ("TDD-style test plan") doesn't match the actual output

## Location

- `src/prompts/evolve-plan.md` — Step 6 (Write TEST.md) template defines only "Programmatic Verification" and "Manual Verification" sections
- `src/capabilities/evolve-plan.ts` — launches the evolve-plan session

## Suggested fix

Expand the TEST.md template to include a section for actual unit/integration tests when appropriate, e.g.:

```markdown
## Unit Tests

<Describe test files to create, test cases with inputs and expected outputs,
and which test runner to use. Reference existing test patterns in the codebase.>

## Integration Tests

<Test cases that verify cross-module behavior, end-to-end flows, or tool interaction.>
```

The prompt should also instruct the Specification Writer to:

1. Check if the project has a test runner and existing test conventions
2. Prescribe actual test files (`.test.ts`, `.spec.ts`) when the codebase supports it
3. Fall back to programmatic verification only when no test infrastructure exists

## Category

improvement

## Context

See `src/prompts/evolve-plan.md` Step 6: the TEST.md template has sections for "Programmatic Verification" (commands to run) and "Manual Verification" only. The project overview confirms: "No test suite: No test runner, test files, or CI pipeline exist in the repository."
