# Task: Remove content-based tests from all affected files

Remove all `describe` blocks that assert on `.md` prompt file contents or `defaultInitialMessage()` output strings across five test files, preserving every behavioral test.

## Context

Multiple capability test files contain brittle content-based tests that assert specific words or phrases appear in `.md` prompt files or dynamically constructed initial messages. These add no behavioral confidence — they verify text, not logic. When prompts are reworded, these tests fail without indicating a real regression. This step removes them all; Step 2 will codify the rule in the TDD skill.

## What to Build

Delete exactly six `describe` blocks across five files. After each deletion, clean up any imports or constants that become unused. No source code, prompt files, or behavioral tests are modified.

### describe Blocks to Remove

1. **`src/capabilities/create-goal.test.ts`** — remove 2 blocks:
   - `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` — 5 tests asserting specific strings appear in the initial message output (lines ~13–66).
   - `describe("prompts/create-goal.md", ...)` — 5 tests reading a `.md` prompt file and asserting text content with helper functions `extractSetupSection()` and `extractStep1Section()`. This is at the end of the file.

2. **`src/capabilities/evolve-plan.test.ts`** — remove 1 block:
   - `describe("defaultInitialMessage", ...)` — 1 test asserting `toContain("TASK.md")` / `not.toContain("TEST.md")` on the message string (near end of file, after "resolveEvolveValidation excludes TEST.md").

3. **`src/capabilities/execute-task.test.ts`** — remove 1 block:
   - `describe("defaultInitialMessage — rejection feedback channel", ...)` — 8 tests asserting `toContain("REVIEW.md")`, `toContain("S02")`, and similar phrase matches (lines ~77–175, before the `isStepReady` describe blocks).

4. **`src/capabilities/finalize-goal.test.ts`** — remove 1 block:
   - `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` — 7 tests asserting goal name, directory path, and phrasing appear in the initial message string (after the `describe("CAPABILITY_CONFIG", ...)` block that tests structure).

5. **`src/capabilities/project-context.test.ts`** — remove 1 block:
   - `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` — 3 tests asserting on message text content (after the `describe("CAPABILITY_CONFIG.writeAllowlist", ...)` block).

### Import and Constant Cleanup

After removing describe blocks, check each file for newly-unused imports or constants:

- **`create-goal.test.ts`:**
  - Remove `CAPABILITY_CONFIG` from the import `{ CAPABILITY_CONFIG, prepareGoal }` → keep only `{ prepareGoal }`.
  - Remove the `fileURLToPath` import and the `__filename`/`__dirname` constants (lines 7–8) — they are used only by the `prompts/create-goal.md` block.

- **`evolve-plan.test.ts`:**
  - Remove `CAPABILITY_CONFIG` from the import `{ validateAndFindNextStep, CAPABILITY_CONFIG }` → keep only `{ validateAndFindNextStep }`.

- **`execute-task.test.ts`:**
  - Remove the entire `import { CAPABILITY_CONFIG } from "./execute-task";` line — it is used exclusively by the removed block. The separate `import { isStepReady } from "./execute-task";` stays intact.

- **`finalize-goal.test.ts`:**
  - No import cleanup needed. `CAPABILITY_CONFIG` is still used by the `describe("CAPABILITY_CONFIG", ...)` block that tests structure (prompt, writeAllowlist).

- **`project-context.test.ts`:**
  - No import cleanup needed. `CAPABILITY_CONFIG` is still used by the `describe("CAPABILITY_CONFIG.writeAllowlist", ...)` block.

### Code Components

This task involves only deletions — no new code, functions, or modules are created. The executor should:

1. Locate each described `describe` block by its label string.
2. Delete the full block including any helper functions local to that block (e.g., `extractSetupSection()` in create-goal.test.ts).
3. After deletion, check for unused imports/symbols and remove them.
4. Verify no behavioral tests were inadvertently removed.

### Approach and Decisions

- Match describe blocks by their label string to locate the exact region — do not rely on line numbers alone since files may differ.
- When a `describe` block has local helper functions (like the two `extract*` helpers in create-goal.test.ts), include those in the deletion scope.
- After each file edit, run `npx tsc --noEmit` to confirm no import errors remain.
- Run `npx vitest run` at the end to confirm the remaining tests pass.

## Dependencies

None. This step does not depend on any prior work.

## Files Affected

- `src/capabilities/create-goal.test.ts` — remove 2 `describe` blocks, remove `CAPABILITY_CONFIG`, `fileURLToPath`, `__filename`, and `__dirname`
- `src/capabilities/evolve-plan.test.ts` — remove 1 `describe` block, remove `CAPABILITY_CONFIG` from import
- `src/capabilities/execute-task.test.ts` — remove 1 `describe` block, remove `import { CAPABILITY_CONFIG }` line
- `src/capabilities/finalize-goal.test.ts` — remove 1 `describe` block
- `src/capabilities/project-context.test.ts` — remove 1 `describe` block

## Acceptance Criteria

- All 6 content-based `describe` blocks listed above are removed from their respective files.
- No behavioral tests were deleted — all non-content tests remain intact (prepareGoal, goalExists, resolveGoalDir, isStepReady, stepFolderName, CAPABILITY_CONFIG structure tests, writeAllowlist tests, validateAndFindNextStep tests, etc.).
- Unused imports in `create-goal.test.ts`, `evolve-plan.test.ts`, and `execute-task.test.ts` are cleaned up.
- The `fileURLToPath` import and `__filename`/`__dirname` constants are removed from `create-goal.test.ts`.
- `npx tsc --noEmit` reports no errors.
- Running `npx vitest run` passes with no regressions (approximately 29 fewer test cases: original count minus the removed content-based tests).

## Risks and Edge Cases

- **Accidentally removing behavioral tests:** Several test files have multiple `describe` blocks close together. Be careful to remove only the content-based blocks identified by their label strings. For example, in `finalize-goal.test.ts`, remove only `describe("CAPABILITY_CONFIG.defaultInitialMessage", ...)` but keep `describe("CAPABILITY_CONFIG", ...)` (structure tests).
- **Split imports:** In `execute-task.test.ts`, `CAPABILITY_CONFIG` and `isStepReady` are imported on separate lines from the same module. Remove only the `CAPABILITY_CONFIG` import line, not the `isStepReady` line.
- **Helper functions:** The `prompts/create-goal.md` block in `create-goal.test.ts` defines local helper functions (`extractSetupSection`, `extractStep1Section`). These must be removed along with the describe block — they are used nowhere else.
