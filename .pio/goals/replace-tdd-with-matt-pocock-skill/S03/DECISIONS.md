# Accumulated Decisions (through Step 2)

## Plan Deviations

- None. Steps 1 and 2 executed as planned.

## Skill References

- Canonical TDD skill name is now `"tdd"` across all capability configs, prompts, and test fixtures (Step 1). The old `src/skills/test-driven-development/` directory will be deleted in Step 3.

## TDD Workflow

- `execute-task.md` uses an iterative tracer-bullet approach (tracer bullet → incremental RED→GREEN → refactor → post-hoc TEST.md) instead of the old linear "plan all tests upfront" workflow (Step 2).

## Test Validation Infrastructure

- `resolveExecuteValidation` in `execute-task.ts` still returns `TEST_FILE` as a required output — unchanged. TEST.md is created post-hoc but still exists for exit-gate validation.
