# Tests: Refactor execute-task prompt Step 5

Verifies that `src/prompts/execute-task.md` Step 5 no longer prescribes specific TDD patterns by name and instead delegates to the mandatory `tdd` skill.

## Programmatic Verification

Given the execute-task prompt when grep for "Arrange-Act-Assert" is run then it returns zero results.
Given the execute-task prompt when grep for "DAMP" is run then it returns zero results.
Given the execute-task prompt when grep for "RED.*GREEN" or "RED→GREEN" is run then it returns zero results.
Given the execute-task prompt when grep for "one assertion per concept" is run then it returns zero results.
Given the execute-task prompt Step 5 when it is read then it references the mandatory `tdd` skill as the source of test structure guidance.
Given the execute-task prompt Step 5 when bullets 1, 2, and 4 are checked then they are preserved unchanged.
Given the TypeScript project when npx tsc --noEmit is run then it exits with code 0.
