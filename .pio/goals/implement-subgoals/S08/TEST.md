# Tests: Prompts and skills documentation

Verifies that all four documentation files contain the required subgoal content, preserve existing content, and remain valid markdown.

## Programmatic Verification

Given create-plan.md when searched for leaf-node criteria reference then it contains instructions to evaluate steps against criteria from pio-planning/SKILL.md.
Given create-plan.md when searched for complexity: "subgoal" then it instructs marking composite steps with this value in the steps array.
Given create-plan.md when searched for step count guard then it mentions totalSteps > 8 with soft-guard semantics.
Given create-plan.md when searched for name field then it instructs providing name for every step entry, noting it serves as subgoal workspace name.
Given finalize-goal.md when searched for subgoals/ directory then it instructs checking for subgoals/ inside step folders.
Given finalize-goal.md when searched for subgoal summaries then it instructs reading subgoal GOAL.md, DECISIONS.md, and per-sub-step SUMMARY.md.
Given pio-planning/SKILL.md when searched for I/O contract test then it documents the test with concrete examples of leaf vs composite.
Given pio-planning/SKILL.md when searched for encapsulation rule then it documents the rule with concrete examples.
Given pio-planning/SKILL.md when searched for step count guard then it documents threshold 8 as a soft guard.
Given pio-planning/SKILL.md when searched for frontmatter declaration then it documents the steps array with name + optional complexity.
Given pio/SKILL.md when searched for subgoal spawning then workflow lifecycle describes evolve-plan spawning subgoals when complexity is "subgoal".
Given pio/SKILL.md when searched for completion propagation then workflow lifecycle describes subgoal finalize-goal routing back to parent evolve-plan.
Given pio/SKILL.md when searched for subgoals/ directory then it documents the S{NN}/subgoals/<name>/ structure.
Given all four files when read after edits then existing content sections are preserved (no deletions of existing instructions).
Given all four files when parsed as markdown then they contain no syntax errors (valid heading levels, code fences, lists).
Given only .md files are modified when checking for code changes then no .ts files were created or modified.
