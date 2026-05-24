# Tests: execute-plan prompt auto-commit instruction

This verifies that `src/prompts/execute-plan.md` contains a git commit step between "Final verification" and "Signal completion", references the `pio-git` skill, includes graceful failure semantics, and maintains sequential step numbering.

## Programmatic Verification

Given the execute-plan prompt when a new commit step is inserted between Final verification and Signal completion then the step ordering is correct.
Given the execute-plan prompt when the commit step is present then it references loading the pio-git skill.
Given the execute-plan prompt when the commit step is present then it instructs writing a short one-liner commit message.
Given the execute-plan prompt when the commit step is present then it includes graceful failure semantics (warn and proceed).
Given the execute-plan prompt when step numbering is updated then all steps are sequential with no gaps.
