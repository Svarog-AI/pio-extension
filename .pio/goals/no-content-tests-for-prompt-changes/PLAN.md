---
totalSteps: 2
steps:
  - name: remove-content-based-tests
    complexity: task
  - name: update-tdd-skill
    complexity: task
---

# Plan: No content tests for prompt changes

Remove fragile string-matching unit tests and codify the rule in the TDD skill so future agents stop producing them.

## Prerequisites

None.

## Steps

### Step 1: Remove content-based tests from all affected files

Remove all `describe` blocks that assert on `.md` prompt file contents or `defaultInitialMessage()` output strings across five test files. Preserve every other test — validation logic, filesystem operations, state transitions, config wiring, registration checks.

**Specifically remove:**

- **`src/capabilities/create-goal.test.ts`**
  - Entire `describe("prompts/create-goal.md", ...)` block (5 tests) — reads prompt file and asserts text content.
  - Entire `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` block (5 tests) — asserts specific strings appear in the initial message output.

- **`src/capabilities/evolve-plan.test.ts`**
  - Entire `describe("defaultInitialMessage", ...)` block (1 test) — asserts `toContain("TASK.md")` / `not.toContain("TEST.md")` on the message string.

- **`src/capabilities/execute-task.test.ts`**
  - Entire `describe("defaultInitialMessage — rejection feedback channel", ...)` block (8 tests) — asserts `toContain("REVIEW.md")`, `toContain("S02")`, and similar phrase matches on the message output.

- **`src/capabilities/finalize-goal.test.ts`**
  - Entire `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` block (7 tests) — asserts goal name, directory path, and phrasing appear in the initial message string.

- **`src/capabilities/project-context.test.ts`**
  - Entire `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` block (3 tests) — asserts on message text content.

In total, 24 `describe` blocks are removed across 5 files. After removal, clean up any now-unused imports (e.g., if a test file no longer imports `CAPABILITY_CONFIG` or related symbols).

**Acceptance Criteria:**

- All 7 `describe` blocks listed above are removed from their respective files.
- No behavioral tests were deleted — all non-content tests remain intact.
- Unused imports in the modified files are cleaned up.
- `npx tsc --noEmit` reports no errors.
- Running `npx vitest run` passes with no regressions (672 remaining tests pass: 696 original − 24 removed).

**Files Affected:**

- `src/capabilities/create-goal.test.ts` — remove 2 `describe` blocks, clean up unused imports
- `src/capabilities/evolve-plan.test.ts` — remove 1 `describe` block
- `src/capabilities/execute-task.test.ts` — remove 1 `describe` block
- `src/capabilities/finalize-goal.test.ts` — remove 1 `describe` block, clean up unused imports
- `src/capabilities/project-context.test.ts` — remove 1 `describe` block, clean up unused imports

### Step 2: Update test-driven-development skill

Add an explicit rule to `src/skills/test-driven-development/SKILL.md`: for text-only changes to prompts and messages (`.md` files, template literals), do not write unit tests asserting on string content. Instead, document in `TEST.md` that no unit tests apply and rely on acceptance criteria verification. Use programmatic checks (`tsc --noEmit`, existing test suite) as sufficient proof of correctness.

Place this rule in the "When NOT to use" section or as a new subsection under "Test Anti-Patterns to Avoid" — whichever fits the existing document structure best. The rule should explain *why* (tests break on any rewording without indicating a behavioral regression) and *what to do instead* (document in TEST.md, rely on type-checking and existing suite).

**Acceptance Criteria:**

- The skill file contains an explicit rule about avoiding content-based tests for prompts and messages.
- The rule explains the rationale (fragility on rewording) and the alternative approach (TEST.md documentation + programmatic checks).
- `npx tsc --noEmit` reports no errors.
- Running `npx vitest run` passes with no regressions.

**Files Affected:**

- `src/skills/test-driven-development/SKILL.md` — add new guidance section

## Notes

- Current test count is 696. After step 1, expected count is ~672 (24 content-based tests removed). The exact number depends on whether any individual `it` blocks inside the removed `describe` blocks are counted separately by Vitest.
- When cleaning up imports in step 1, be careful: some files import multiple symbols and may still need the symbol for other describe blocks. Only remove imports that become genuinely unused.
- Step 2 is independent of step 1 but logically follows it — the rule documents what was just removed.
