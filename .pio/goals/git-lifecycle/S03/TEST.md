# Tests: Specification document draft

This verifies that SPECIFICATION.md is written to the correct location, copied to docs/, contains all five required sections with concrete content, and follows consistency requirements. This is a documentation-only task — no unit tests apply per TDD methodology (content-based tests for prompts and messages are explicitly excluded). Verification relies on programmatic checks.

## Programmatic Verification

Given SPECIFICATION.md at `.pio/goals/git-lifecycle/SPECIFICATION.md` when the file exists then it is non-empty and contains all five section headings (§1–§5).
Given docs/git-lifecycle-specification.md when it exists then its content is identical to `.pio/goals/git-lifecycle/SPECIFICATION.md`.
Given §1 (Branch checkout) when the section content is inspected then it specifies Branch Checkout Protocol steps, GIT.md convention lookup, collision resolution with `ask_user`, subgoal auto-suffix, non-main branch handling, and required file changes.
Given §2 (PR creation) when the section content is inspected then it specifies PR Creation Protocol steps, `gh pr create` command with flags, PR title/body format, target branch determination, pre-creation checks, and required file changes.
Given §3 (Subgoal branching) when the section content is inspected then it specifies top-level-only recommendation with rationale, detection mechanism (`/subgoals/` path check), no PR for subgoals, and pio-git impact.
Given §4 (Worktrees) when the section content is inspected then it contains an explicit exclusion statement with rationale.
Given §5 (Implementation plan) when the section content is inspected then it specifies concrete file changes for `pio-git/SKILL.md`, `create-goal.md`, `finalize-goal.md` and proposes 3–5 plan steps for a follow-up goal.
Given graceful failure semantics when all git operations in the spec are reviewed then every operation includes a warn-and-continue clause — none block workflow completion.
Given the TypeScript project when `npm run check` is run then it exits with code 0 (no type errors introduced).
Given the test suite when `npm test` is run then all tests pass with 0 failures (no regressions).
