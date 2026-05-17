# Tests: Update other prompt references to the new paths

This step modifies only markdown prompt files — no TypeScript code changes. Verification relies on programmatic string matching and file content checks.

## Programmatic Verification

### Verify `create-plan.md` updated correctly

- **What:** The planning agent should reference `.pio/PROJECT/OVERVIEW.md` (not the old `.pio/PROJECT.md`)
- **How:** `grep -c '\.pio/PROJECT/OVERVIEW\.md' src/prompts/create-plan.md`
- **Expected result:** Output is `1` (exactly one reference to OVERVIEW.md)

### Verify `execute-task.md` updated correctly

- **What:** Test-related references should point to `.pio/PROJECT/DEVELOPMENT.md`
- **How:** `grep -c '\.pio/PROJECT/DEVELOPMENT\.md' src/prompts/execute-task.md`
- **Expected result:** Output is `3` (three references: two in test placement convention + one for test runner info)

### Verify `evolve-plan.md` updated correctly

- **What:** Test-related references should point to `.pio/PROJECT/DEVELOPMENT.md`
- **How:** `grep -c '\.pio/PROJECT/DEVELOPMENT\.md' src/prompts/evolve-plan.md`
- **Expected result:** Output is `2` (two references in test placement convention)

### Verify no stale `.pio/PROJECT.md` references remain

- **What:** The exact old single-file path `.pio/PROJECT.md` should not appear in any prompt file
- **How:** `grep -rn '\.pio/PROJECT\.md' src/prompts/*.md | grep -v 'OVERVIEW\|DEVELOPMENT\|CONVENTIONS\|ARCHITECTURE\|DEPENDENCIES\|GLOSSARY'`
- **Expected result:** No output (0 matches). The old path is fully eliminated from prompt files.

### Verify project-context.md was not accidentally modified

- **What:** Step 3's rewrite of `project-context.md` should be untouched — it already uses correct `.pio/PROJECT/` paths
- **How:** `grep -c '\.pio/PROJECT\.md' src/prompts/project-context.md | head -1` and verify the only matches are to valid new paths (OVERVIEW.md, DEVELOPMENT.md, etc.) or the directory `.pio/PROJECT/`
- **Expected result:** All matches resolve to valid new file paths (e.g., `.pio/PROJECT/OVERVIEW.md`) or the directory reference `.pio/PROJECT/`. No match for the bare string `.pio/PROJECT.md` followed by a non-slash character.

### Verify TypeScript compilation is clean

- **What:** Changes are text-only in markdown files — TypeScript should not be affected
- **How:** `npm run check` (or `npx tsc --noEmit`)
- **Expected result:** Exit code 0, no errors

## Manual Verification

### Verify sentence context is correct

- **What:** Each replaced path should make sense in its surrounding sentence
- **How:** Open each of the 3 modified files and visually inspect the changed lines:
  - `create-plan.md` — "Read `.pio/PROJECT/OVERVIEW.md` if it exists — this is the project's entry point..." should read naturally
  - `execute-task.md` — test file placement convention steps should reference DEVELOPMENT.md for test conventions
  - `evolve-plan.md` — same test file placement convention steps should reference DEVELOPMENT.md

### Verify no unintended changes

- **What:** Only path strings changed; surrounding formatting, numbering, and paragraph structure preserved
- **How:** Compare each modified file against git HEAD (or previous version) to confirm only the expected path strings differ

## Test Order

Execute in this order:

1. Programmatic verification — stale reference grep (quickest check that old paths are gone)
2. Programmatic verification — new reference counts (verify correct replacement counts)
3. Programmatic verification — TypeScript compilation
4. Manual verification — sentence context and formatting review
