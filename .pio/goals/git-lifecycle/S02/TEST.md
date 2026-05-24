# Tests: Branching strategies analysis (Step 2, re-execution)

This verifies that Section 2 of SPECIFICATION.md correctly evaluates branch collision strategies (including a fair assessment of `ask_user`), subgoal branching options, and worktree viability — with GIT.md convention lookup for branch naming throughout.

## Unit Tests

No unit tests apply. This is a research and specification task producing a documentation artifact. Per TDD methodology, content-based tests for specification documents are not appropriate — they verify text, not logic.

## Programmatic Verification

Given SPECIFICATION.md Section 2 when it is read then it contains subsections 2.1 (branch collision), 2.2 (subgoal branching), and 2.3 (worktree assessment).
Given Section 2.1 Strategy D evaluation when it is read then it does NOT cite "non-interactive design" as a reason to dismiss `ask_user`.
Given Section 2.1 Strategy D evaluation when it is read then it correctly interprets the pio-git constraint as governing retry behavior, not decision-making.
Given Section 2.1 collision strategies when they are read then branch names reference GIT.md convention lookup rather than hardcoded `feat/<goal-name>`.
Given Section 2.2 subgoal options when they are read then branch names reference GIT.md convention lookup rather than hardcoded `feat/<goal-name>`.
Given the Branch Checkout Protocol recommendation when it is read then it specifies reading branch naming pattern from GIT.md with `feat/<goal-name>` as fallback.
Given the TypeScript project when `npm run check` is run then it exits with code 0 (no type errors introduced).
Given the test suite when `npm test` is run then all existing tests pass (no regressions).
Given every file path referenced in Section 2 when the file is looked up then it exists in the codebase.
