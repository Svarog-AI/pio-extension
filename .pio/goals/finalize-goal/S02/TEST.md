# Tests: Register pio-project-knowledge skill and update project-context prompt

## Programmatic Verification

### index.ts: Skill path registered

- **What:** `src/index.ts` includes the pio-project-knowledge skill in `skillPaths`
- **How:** `grep -c 'pio-project-knowledge' src/index.ts`
- **Expected result:** Output is `1` or greater (path appears at least once)

### index.ts: Correct path format

- **What:** The skill path uses the established `path.join(SKILLS_DIR, "pio-project-knowledge")` pattern
- **How:** `grep 'path.join(SKILLS_DIR, "pio-project-knowledge")' src/index.ts`
- **Expected result:** Match found (non-empty output)

### project-context.md: Skill loading instruction present

- **What:** `src/prompts/project-context.md` contains instructions to load the pio-project-knowledge skill
- **How:** `grep -i 'pio-project-knowledge' src/prompts/project-context.md`
- **Expected result:** At least one match referencing the skill by name

### project-context.md: All 7 PROJECT files still referenced

- **What:** The prompt still ensures all 7 PROJECT files are produced (via skill reference or inline mention)
- **How:** For each of `OVERVIEW.md`, `DEVELOPMENT.md`, `CONVENTIONS.md`, `GIT.md`, `ARCHITECTURE.md`, `DEPENDENCIES.md`, `GLOSSARY.md`, run: `grep -c 'PROJECT/<FILE>' src/prompts/project-context.md`
- **Expected result:** Each file is referenced at least once (output ≥ 1)

### TypeScript compilation

- **What:** No type errors after changes to `index.ts`
- **How:** `npx tsc --noEmit`
- **Expected result:** Exit code 0, no error output

### Existing tests pass (no regressions)

- **What:** All existing unit and integration tests still pass
- **How:** `npx vitest run`
- **Expected result:** All tests pass, exit code 0

## Manual Verification

### project-context.md: Skill loading instruction placement

- **What:** The skill-loading instruction is positioned near the top of the prompt so the agent loads it before beginning analysis
- **How:** Open `src/prompts/project-context.md` and verify the pio-project-knowledge skill loading instruction appears before Phase 1 (Analysis) instructions

### project-context.md: Prompt still coherent after reduction

- **What:** Removing inline PROJECT file structure doesn't create gaps — the agent can still produce all 7 files correctly using the skill as reference
- **How:** Read through the modified prompt end-to-end. Verify that Phase 2 (Summarization) and Phase 4 (Write Output Files) reference the pio-project-knowledge skill for structural details, and that the prompt flow is logical without the removed inline content

## Test Order

1. Programmatic verification (file content checks)
2. TypeScript compilation (`npx tsc --noEmit`)
3. Existing tests (`npx vitest run`)
4. Manual verification (prompt coherence review)
