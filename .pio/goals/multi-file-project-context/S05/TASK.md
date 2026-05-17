# Task: Update skill file references

Update `src/skills/pio/SKILL.md` and `src/skills/test-driven-development/SKILL.md` to reference the new multi-file project context paths under `.pio/PROJECT/`.

## Context

Steps 1–4 have updated all code and prompt files to use the new 7-file structure under `.pio/PROJECT/`. The remaining stale references are in skill documentation — which agents read at runtime for behavioral guidance. If left unchanged, agents will look for project context at old paths (`.pio/PROJECT.md`) that no longer exist or produce relevant output.

## What to Build

Two markdown files need targeted updates:

1. **`src/skills/pio/SKILL.md`** — Two occurrences of the old `.pio/PROJECT.md` path must be replaced with references to the new `.pio/PROJECT/OVERVIEW.md` (and the 7-file folder).
2. **`src/skills/test-driven-development/SKILL.md`** — This skill currently has no project context file references at all. New guidance must be added directing users to check `.pio/PROJECT/DEVELOPMENT.md` for test placement conventions and `.pio/PROJECT/CONVENTIONS.md` for coding standards.

### Code Components

#### 1. `src/skills/pio/SKILL.md` — Command table update

- **Line 36** (command reference table): The `/pio-project-context` row currently shows `.pio/PROJECT.md` as the output column value. Replace with a reference to the 7-file structure, e.g., `.pio/PROJECT/` (7 files) or similar concise phrasing that conveys multiple files are produced.
- **Line 56** (context injection description): The sentence "`On before_agent_start, .pio/PROJECT.md is loaded first...`" should reference `.pio/PROJECT/OVERVIEW.md` instead of `.pio/PROJECT.md`.

#### 2. `src/skills/test-driven-development/SKILL.md` — Add project context guidance

The skill currently has no references to project context files. Add a short section (or integrate into an existing relevant section) that instructs the executor to:

- Check `.pio/PROJECT/DEVELOPMENT.md` first for test directory conventions, test runner configuration, and coding standards before writing tests.
- Check `.pio/PROJECT/CONVENTIONS.md` for project-specific coding standards, linting rules, and agent instructions.

**Where to add this:** The most natural place is in the "Test File Placement Convention" logic already described in the `evolve-plan.md` step 6 (per TASK.md of Step 4). Looking at the TDD skill, a good integration point would be the **"Running Tests"** section or a new brief subsection near it. Alternatively, add guidance in the **"Writing Good Tests"** preamble — since test placement conventions and coding standards are prerequisites to writing tests effectively.

**Key constraint:** The existing TDD skill is generic methodology guidance — this addition should be brief (1–2 sentences) and clearly mark these as project-specific files that may or may not exist. Do not restructure the entire skill for two new references.

### Approach and Decisions

- **Minimal surgical edits:** Follow the approach from Steps 3 and 4 — replace only the path strings, preserve surrounding formatting, bold text, backtick code spans, and sentence structure.
- **For `test-driven-development/SKILL.md`:** Add a short note rather than restructuring. The skill is large and comprehensive — the addition should be a natural insertion, not a reorg. A good pattern: add to an existing relevant section (e.g., near "Running Tests" or as a brief new subsection) with 2–3 sentences max.
- **Reference the correct file for each concern:** `DEVELOPMENT.md` for test conventions (runner, placement, directory structure), `CONVENTIONS.md` for coding standards (style, linting, naming). Do not swap these mappings — they follow the Prompt Reference Mapping from accumulated decisions.

## Dependencies

- **Step 1** (session loader) — completed. Confirms `.pio/PROJECT/OVERVIEW.md` is the correct injection path.
- **Step 2** (project-context capability) — completed. Confirms the 7-file `writeAllowlist` paths.
- **Step 4** (prompt references) — completed. Established the Prompt Reference Mapping convention used here.

## Files Affected

- `src/skills/pio/SKILL.md` — modified: update command table output path and context injection description (2 occurrences of `.pio/PROJECT.md`)
- `src/skills/test-driven-development/SKILL.md` — modified: add guidance to check `.pio/PROJECT/DEVELOPMENT.md` for test conventions and `.pio/PROJECT/CONVENTIONS.md` for coding standards

## Acceptance Criteria

- [ ] `npm run check` reports no TypeScript errors
- [ ] `src/skills/pio/SKILL.md` command table shows the 7-file structure (not `.pio/PROJECT.md`) as the output of `/pio-project-context`
- [ ] `src/skills/pio/SKILL.md` context injection description references `.pio/PROJECT/OVERVIEW.md` (not `.pio/PROJECT.md`)
- [ ] `src/skills/test-driven-development/SKILL.md` includes guidance to check `.pio/PROJECT/DEVELOPMENT.md` for test placement conventions
- [ ] `src/skills/test-driven-development/SKILL.md` includes guidance to check `.pio/PROJECT/CONVENTIONS.md` for coding standards
- [ ] No stale references to the old path `.pio/PROJECT.md` remain in any skill file under `src/skills/`

## Risks and Edge Cases

- **Accidental modification of other skill files:** Only modify the two specified files. Don't touch other SKILL.md files unless they contain stale `.pio/PROJECT.md` references discovered during verification.
- **Over-restructuring the TDD skill:** The test-driven-development skill is large (~200+ lines). Keep changes minimal — add 2–3 sentences, don't reorganize sections.
- **Path consistency:** Ensure all new references use `.pio/PROJECT/` (with trailing slash + filename) consistently — not `.pio/PROJECT.md`, `PROJECT/OVERVIEW.md`, or other variants.
