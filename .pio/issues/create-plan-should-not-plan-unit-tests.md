# create-plan should not plan individual step unit tests (that's evolve-plan's job)

## Problem

`create-plan` tends to plan steps for writing unit tests, but unit tests are written per-step individually by `evolve-plan` (via TEST.md). This creates redundancy and confusion about responsibilities.

### Current behavior

The create-plan prompt instructs:
> "Specify how each step is verified — don't write tests yourself. Your job is to say what should be tested and how it can be checked programmatically (existing test suites, type checking, linting, build commands, curl checks)."

This guidance is sound for *acceptance criteria* — describing how to verify a step is complete. However in practice, the planning agent often:
- Creates dedicated steps for "write tests for X" as separate plan items
- Plans detailed unit test structure (test files, test cases) that evolves-plan will already handle via TEST.md generation
- Blurs the line between acceptance criteria and test implementation

### Responsibility split

| Capability | Test responsibility |
|---|---|
| **create-plan** | Acceptance criteria per step (how to verify completion) |
| **evolve-plan** | TEST.md per step (unit tests, specific test cases, verification commands) |
| **execute-task** | Write and run the actual unit tests described in TEST.md |

### What create-plan *should* plan for testing

At most, create-plan should cover:
- **Integration tests** involving implementations from multiple steps (e.g., "verify end-to-end flow after steps 1-3 are wired together")
- **Cross-step verification** — acceptance criteria that can only be checked once dependent steps are complete
- **Existing test suite expectations** — "all existing tests pass" as a regression criterion per step

### What create-plan should *not* plan

- Individual step unit tests (TEST.md handles this via evolve-plan)
- Dedicated "write tests for X" steps (test writing is part of execute-task's job, not a separate plan step)
- Detailed test file structure or specific test case enumeration

## Proposed solution

Update the create-plan prompt to clarify the test responsibility boundary:

1. **Add explicit guidance:** "Acceptance criteria describe how to verify completion. Do not create dedicated steps for writing tests — testing is handled per-step by evolve-plan (TEST.md) and execute-task."
2. **Allow integration-level planning only:** "If the goal requires integration tests spanning multiple steps, you may include an integration verification step near the end of the plan."
3. **Examples of good vs bad criteria:**
   - ✅ Good: "`npx tsc --noEmit` reports no errors" (programmatic check)
   - ✅ Good: "new function is exported from `src/auth/index.ts`" (verifiable fact)
   - ❌ Bad: "unit tests for X cover all edge cases" (that's evolve-plan/execute-task territory)

## Implementation

- Modify `create-plan.md` prompt to clarify the testing scope boundary
- Remove any language that encourages planning unit test steps
- Add a section or note about integration vs unit test responsibility split

## Category

improvement

## Context

Observed in generated PLAN.md files where step 2 or 3 is "Write tests for X module" as a standalone plan item. This duplicates work that evolve-plan will do anyway (generate TEST.md with specific test cases) and inflates plan size unnecessarily.

## Category

improvement
