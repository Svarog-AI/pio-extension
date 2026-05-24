# No content tests for prompt changes

Remove fragile string-matching unit tests that assert on the textual contents of `.md` prompt files or `defaultInitialMessage()` output. Update the `test-driven-development` skill to codify the rule: never produce content-based tests for prompt and message strings. These tests break on any rewording without indicating a real behavioral regression.

## Current State

Multiple capability test files contain brittle content-based tests that assert specific words or phrases appear in `.md` prompt files or dynamically constructed initial messages. These add no behavioral confidence — they verify text, not logic:

- **`src/capabilities/create-goal.test.ts`** — Reads `src/prompts/create-goal.md` as raw text and asserts fragments like `toContain` and `not.toMatch(/always\s*confirm/i)` against the file contents (lines ~189–219). Also tests `defaultInitialMessage()` output with string assertions.
- **`src/capabilities/evolve-plan.test.ts`** — The `defaultInitialMessage` describe block (line 438) calls `CAPABILITY_CONFIG.defaultInitialMessage()` and asserts `toContain("TASK.md")` and `not.toContain("TEST.md")` on the returned message string.
- **`src/capabilities/execute-task.test.ts`** — The `defaultInitialMessage — rejection feedback channel` describe block (line 77) makes multiple calls to `CAPABILITY_CONFIG.defaultInitialMessage()` and asserts `toContain("REVIEW.md")`, `toContain("S02")`, and similar string matches on the message output.
- **`src/capabilities/finalize-goal.test.ts`** — The `CAPABILITY_CONFIG.defaultInitialMessage` describe block (line 93) tests initial message content with string assertions.
- **`src/capabilities/project-context.test.ts`** — The `CAPABILITY_CONFIG.defaultInitialMessage` describe block (line 50) asserts on initial message text.
- **`src/skills/test-driven-development/SKILL.md`** — Does not currently contain guidance about avoiding content-based tests for prompts and messages. Future agents following this skill may continue producing fragile string-matching tests.

The `revise-plan.test.ts` file was originally cited but its prompt-content tests were already removed in a prior step (Step 2 of `s03-content-deleted-before-revision-analysis`). The remaining files listed above still contain the problematic patterns.

## To-Be State

1. **All content-based tests removed** from the test files listed above. Specifically:
   - Remove any test that reads a `.md` prompt file and asserts on its text content (e.g., `toContain`, `toMatch` against prompt strings).
   - Remove any `defaultInitialMessage()` test that asserts specific phrases appear in the returned message string.
   - Preserve all tests that verify actual behavior — validation logic, filesystem operations, state transitions, config wiring — these remain unchanged.

2. **`src/skills/test-driven-development/SKILL.md` updated** with an explicit rule: for text-only changes to prompts and messages (`.md` files, template literals), do not write unit tests asserting on string content. Instead, document in `TEST.md` that no unit tests apply and use acceptance criteria verification. Rely on programmatic checks (`tsc --noEmit`, existing test suite) as sufficient proof of correctness.

3. **No other behavior changes.** The underlying capability code, prompt files, and non-content tests are untouched. Only the fragile tests are deleted and the skill is updated to prevent recurrence.
