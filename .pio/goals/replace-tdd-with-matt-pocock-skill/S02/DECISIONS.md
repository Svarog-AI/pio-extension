# Accumulated Decisions (through Step 1)

## Plan Deviations

- None so far. Step 1 executed exactly as planned — pure string replacement with no scope creep or architectural decisions.

## Skill References

- All skill name references changed from `"test-driven-development"` to `"tdd"` across capability configs, prompts, and test fixtures (Step 1). The old `src/skills/test-driven-development/` directory still exists and will be deleted in Step 3. Downstream steps should use `"tdd"` as the canonical skill name.

## TDD Methodology Content

- `execute-task.md` currently contains a linear "create TEST.md upfront → write all tests → implement everything" workflow. Step 2 will restructure this to an iterative tracer-bullet approach (tracer bullet → incremental RED→GREEN cycles → refactor → post-hoc TEST.md). This is the primary architectural decision for Steps 2 and 3.

## Test Validation Infrastructure

- `resolveExecuteValidation` in `execute-task.ts` still returns `TEST_FILE` as a required output — this is unchanged across all steps. TEST.md timing changes (post-hoc instead of upfront) but the artifact still exists for exit-gate validation. No code changes needed to validation logic.
