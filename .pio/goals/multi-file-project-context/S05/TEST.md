# Tests: Update skill file references

This step modifies only markdown documentation files. There are no code changes, so verification relies on programmatic string checks and manual review rather than unit or integration tests.

## Programmatic Verification

### Stale reference check — no `.pio/PROJECT.md` remains in skills

- **What:** After edits, no skill file should reference the old monolithic path `.pio/PROJECT.md`.
- **How:** `grep -rn '\.pio/PROJECT\.md' src/skills/`
- **Expected result:** Zero matches (exit code 1 from grep).

### pio SKILL.md — context injection references OVERVIEW.md

- **What:** The context injection description in `src/skills/pio/SKILL.md` should reference `.pio/PROJECT/OVERVIEW.md`.
- **How:** `grep -c '\.pio/PROJECT/OVERVIEW\.md' src/skills/pio/SKILL.md`
- **Expected result:** At least 1 match (the context injection description).

### pio SKILL.md — command table references the new structure

- **What:** The `/pio-project-context` command table row should reference `.pio/PROJECT/` or mention multiple files (not `.pio/PROJECT.md`).
- **How:** `grep '/pio-project-context' src/skills/pio/SKILL.md`
- **Expected result:** The output column should show `.pio/PROJECT/` with some indication of multiple files, not the old `.pio/PROJECT.md`.

### TDD SKILL.md — DEVELOPMENT.md reference present

- **What:** `src/skills/test-driven-development/SKILL.md` should reference `.pio/PROJECT/DEVELOPMENT.md`.
- **How:** `grep -c '\.pio/PROJECT/DEVELOPMENT\.md' src/skills/test-driven-development/SKILL.md`
- **Expected result:** At least 1 match.

### TDD SKILL.md — CONVENTIONS.md reference present

- **What:** `src/skills/test-driven-development/SKILL.md` should reference `.pio/PROJECT/CONVENTIONS.md`.
- **How:** `grep -c '\.pio/PROJECT/CONVENTIONS\.md' src/skills/test-driven-development/SKILL.md`
- **Expected result:** At least 1 match.

### TypeScript compilation

- **What:** The project compiles cleanly after the changes (no TypeScript errors).
- **How:** `npm run check`
- **Expected result:** Exit code 0, no errors in output.

## Manual Verification

### pio SKILL.md — command table readability

- **What:** The `/pio-project-context` row in the command reference table reads naturally and accurately describes the multi-file output.
- **How:** Open `src/skills/pio/SKILL.md`, navigate to the command reference table, verify the output column for `/pio-project-context` clearly conveys multiple files are produced (e.g., `.pio/PROJECT/` with 7 files listed or a concise description).

### TDD SKILL.md — integration quality

- **What:** The new project context references in `test-driven-development/SKILL.md` integrate naturally — they don't feel pasted on, and they're placed where a developer reading about tests would reasonably look for conventions.
- **How:** Read the section containing the new references. Verify: (a) the placement is logical (near test writing or test running guidance), (b) the phrasing acknowledges these files may not exist in all projects, (c) the additions don't disrupt the flow of existing content.

### Cross-file consistency

- **What:** The paths referenced in skill files are consistent with paths established in Steps 1–4.
- **How:** Compare references across `src/skills/pio/SKILL.md`, `src/skills/test-driven-development/SKILL.md`, and the prompt files modified in Steps 1–4 (`src/prompts/create-plan.md`, `src/prompts/execute-task.md`, `src/prompts/evolve-plan.md`). All should use `.pio/PROJECT/` with correct filenames.

## Test Order

1. Programmatic verification (grep checks) — fastest feedback, catches copy-paste errors
2. TypeScript compilation (`npm run check`) — confirms no unrelated breakage
3. Manual verification (readability and integration review) — final quality gate
