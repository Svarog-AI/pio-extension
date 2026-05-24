# Task: Update test-driven-development skill

Add an explicit rule to the TDD skill preventing future agents from writing content-based tests for prompt files and message strings.

## Context

Step 1 just removed 29 fragile string-matching tests across 5 test files. These tests asserted on `.md` prompt file contents or `defaultInitialMessage()` output — they broke on any rewording without indicating a real behavioral regression. To prevent recurrence, the `test-driven-development` skill must codify the rule so all future agents following this skill know not to produce such tests.

## What to Build

Add guidance to `src/skills/test-driven-development/SKILL.md` explicitly stating that content-based tests for prompts and messages should not be written. The guidance must explain:
- **What not to do:** writing unit tests that assert specific words/phrases appear in `.md` prompt files or dynamically constructed message strings (e.g., `toContain("TASK.md")`, `toMatch(/always\s*confirm/i)`).
- **Why:** these tests break on any rewording without indicating a behavioral regression — they verify text, not logic.
- **What to do instead:** document in `TEST.md` that no unit tests apply for text-only changes; rely on acceptance criteria verification and programmatic checks (`tsc --noEmit`, existing test suite) as sufficient proof of correctness.

### Placement in SKILL.md

The plan suggests either the "When NOT to use" section or a new entry under "Test Anti-Patterns to Avoid". Research the file structure and choose the best fit:

- The **"When NOT to use"** section already lists exceptions (config changes, docs, static content). A prompt/message testing exception could extend this naturally.
- The **"Test Anti-Patterns to Avoid"** table has entries like "Testing implementation details" and "Snapshot abuse". A row for "Content-based tests for prompts and messages" would fit the tabular format.

**Recommendation:** Add to BOTH locations for maximum visibility:
1. Extend "When NOT to use" to explicitly call out prompt/message content testing as an exception.
2. Add a new row to the "Test Anti-Patterns to Avoid" table with the pattern, problem, and fix columns.

### Code Components

No code changes — this is a documentation-only update to a single markdown file. The executor should:
1. Read the existing SKILL.md structure carefully.
2. Identify the exact insertion points in "When NOT to use" and "Test Anti-Patterns to Avoid".
3. Add concise guidance that matches the existing tone and formatting of the document.

### Approach and Decisions

- Follow the existing markdown formatting conventions (bold/italics, code blocks, table structure).
- Keep the new content brief — 1–2 sentences for "When NOT to use", one table row with Problem/Fix columns for the anti-patterns table.
- Reference real examples from what was removed: asserting `toContain("TASK.md")` on initial messages or reading `.md` prompt files and checking text fragments.

## Dependencies

Step 1 (remove content-based tests) should be completed first so the rule documents a concrete precedent. However, there are no code-level dependencies — this step modifies only a skill markdown file.

## Files Affected

- `src/skills/test-driven-development/SKILL.md` — modified: add guidance about avoiding content-based tests for prompts and messages (updates to "When NOT to use" section and "Test Anti-Patterns to Avoid" table)

## Acceptance Criteria

- The skill file contains an explicit rule about avoiding content-based tests for prompts and messages.
- The rule explains the rationale (fragility on rewording — tests break without indicating behavioral regression).
- The rule describes the alternative approach (document in `TEST.md` that no unit tests apply; rely on programmatic checks like `tsc --noEmit` and existing test suite).
- The new content is placed in an appropriate existing section of the document ("When NOT to use" and/or "Test Anti-Patterns to Avoid").
- The new content matches the existing tone, formatting, and structure of SKILL.md.
- `npx tsc --noEmit` reports no errors.
- Running `npx vitest run` passes with no regressions (same 667 tests as after Step 1).

## Risks and Edge Cases

- **Placement ambiguity:** The plan offers two possible locations. If the executor chooses only one, that's acceptable — both are valid. Adding to both is recommended for maximum agent visibility.
- **Formatting consistency:** Ensure table columns align with existing "Test Anti-Patterns to Avoid" rows (Anti-Pattern | Problem | Fix). Match markdown style exactly.
- **No behavioral changes:** This step modifies only a `.md` file — no TypeScript code, no imports, no exports. Verify that the test suite is unaffected beyond confirming it still passes.
