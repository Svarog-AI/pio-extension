# Plan: Multi-File Project Context Structure

Replace the monolithic `.pio/PROJECT.md` with 7 specialized files under `.pio/PROJECT/`, update all consumers and references accordingly.

## Prerequisites

None.

## Steps

### Step 1: Update session loader to read `.pio/PROJECT/OVERVIEW.md`

**Description:** Change the `before_agent_start` handler in `session-capability.ts` from reading `.pio/PROJECT.md` to reading `.pio/PROJECT/OVERVIEW.md`. The module-level cache variable and the `fs.existsSync` + `fs.readFileSync` call both need the new path. The injection wrapper label (`--- PROJECT OVERVIEW ---`) remains unchanged — the content is still the project overview, just from a different file.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] The `before_agent_start` handler reads `.pio/PROJECT/OVERVIEW.md` instead of `.pio/PROJECT.md` (verifiable by reading the file)
- [ ] Module-level cache variable name and injection wrapper label are preserved (no renaming of `projectContext` or the `--- PROJECT OVERVIEW ---` string)

**Files affected:**
- `src/capabilities/session-capability.ts` — change path from `.pio/PROJECT.md` to `.pio/PROJECT/OVERVIEW.md` in the `before_agent_start` handler

### Step 2: Update project-context capability config and descriptions

**Description:** Update `src/capabilities/project-context.ts` to allow writing to all 7 new files. Replace the single `writeAllowlist` entry `[.pio/PROJECT.md]` with seven entries under `.pio/PROJECT/`. Update the tool description, command description, and `defaultInitialMessage` to reference the new multi-file structure instead of a single `PROJECT.md`.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `writeAllowlist` contains exactly 7 paths: `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, `.pio/PROJECT/CONVENTIONS.md`, `.pio/PROJECT/GIT.md`, `.pio/PROJECT/ARCHITECTURE.md`, `.pio/PROJECT/DEPENDENCIES.md`, `.pio/PROJECT/GLOSSARY.md`
- [ ] `defaultInitialMessage` mentions the multi-file structure (not a single file)
- [ ] Tool description references the new output structure

**Files affected:**
- `src/capabilities/project-context.ts` — update `writeAllowlist`, `defaultInitialMessage`, tool description, and command description

### Step 3: Rewrite project-context.md prompt for 7-file output

**Description:** Completely rewrite `src/prompts/project-context.md` to instruct the Project Context Analyzer agent to produce all 7 files in a single session (single research pass, multiple write targets). The prompt should map each Phase 2 question from the current prompt to one or more output files:
- Questions 1–2 → `OVERVIEW.md` (project purpose, structure, tech stack)
- Questions 3, 5, 7 → `DEVELOPMENT.md` (build/test/deploy commands, test conventions, local setup)
- Question 8 + editor configs → `CONVENTIONS.md` (coding style, linting/formatting rules, agent instructions)
- Git history analysis → `GIT.md` (commit format, branching, tagging — skip for non-git repos)
- Architecture/ecosystem context → `ARCHITECTURE.md` (patterns, ADRs, service integrations)
- Cross-service dependencies → `DEPENDENCIES.md` (external APIs, third-party libs, monorepo graph)
- Domain terminology → `GLOSSARY.md` (may be minimal for some projects)

Include guidance that not all files are relevant to every project (e.g., skip `GIT.md` for non-git repos, `GLOSSARY.md` may be empty). Each file should target ~2000 tokens max. The Phase 3 clarification step and Phase 5 completion signal remain unchanged.

**Acceptance criteria:**
- [ ] The prompt specifies all 7 output files with their `.pio/PROJECT/` paths
- [ ] Each output file has a clear description of what content it should contain
- [ ] The prompt includes guidance to skip or minimize files that aren't relevant (e.g., non-git repos)
- [ ] The prompt mentions the ~2000 token target per file
- [ ] Phase 1 (research), Phase 3 (clarification), and Phase 5 (completion signal) are preserved
- [ ] No references to writing a single `.pio/PROJECT.md` remain in the prompt

**Files affected:**
- `src/prompts/project-context.md` — complete rewrite for multi-file output

### Step 4: Update other prompt references to the new paths

**Description:** Update references to `.pio/PROJECT.md` in `create-plan.md`, `execute-task.md`, and `evolve-plan.md` so agents reference the correct files. Map each reference to the most appropriate new file:
- `create-plan.md`: "Read `.pio/PROJECT.md` if it exists" → "Read `.pio/PROJECT/OVERVIEW.md` if it exists" (planning agent needs project overview)
- `execute-task.md`: "Check `.pio/PROJECT.md` first" for test conventions → "Check `.pio/PROJECT/DEVELOPMENT.md` first" (test directory conventions belong in DEVELOPMENT.md)
- `evolve-plan.md`: Similar references to test conventions should point to `.pio/PROJECT/DEVELOPMENT.md`

**Acceptance criteria:**
- [ ] `src/prompts/create-plan.md` references `.pio/PROJECT/OVERVIEW.md` instead of `.pio/PROJECT.md`
- [ ] `src/prompts/execute-task.md` references `.pio/PROJECT/DEVELOPMENT.md` for test directory conventions (instead of `.pio/PROJECT.md`)
- [ ] `src/prompts/evolve-plan.md` references `.pio/PROJECT/DEVELOPMENT.md` for test-related guidance (if applicable)
- [ ] No stale references to `.pio/PROJECT.md` remain in any prompt file

**Files affected:**
- `src/prompts/create-plan.md` — update PROJECT.md reference to OVERVIEW.md
- `src/prompts/execute-task.md` — update PROJECT.md references to DEVELOPMENT.md (for test conventions) and OVERVIEW.md (for general project context)
- `src/prompts/evolve-plan.md` — update PROJECT.md references as applicable

### Step 5: Update skill file references

**Description:** Update skill documentation to reference the new multi-file paths:
- `src/skills/pio/SKILL.md`: Update command table output from `.pio/PROJECT.md` to `.pio/PROJECT/OVERVIEW.md` (and mention the folder). Update context injection description to reference `.pio/PROJECT/OVERVIEW.md`.
- `src/skills/test-driven-development/SKILL.md`: Add guidance to check `.pio/PROJECT/DEVELOPMENT.md` for test placement conventions and `.pio/PROJECT/CONVENTIONS.md` for coding standards. This is a new addition — the skill currently has no references to project context files.

**Acceptance criteria:**
- [ ] `src/skills/pio/SKILL.md` command table shows `.pio/PROJECT/OVERVIEW.md` (or mentions the 7-file structure) as output
- [ ] `src/skills/pio/SKILL.md` context injection description references `.pio/PROJECT/OVERVIEW.md`
- [ ] `src/skills/test-driven-development/SKILL.md` includes guidance to check `.pio/PROJECT/DEVELOPMENT.md` for test conventions and `.pio/PROJECT/CONVENTIONS.md` for coding standards

**Files affected:**
- `src/skills/pio/SKILL.md` — update command table and context injection description
- `src/skills/test-driven-development/SKILL.md` — add references to DEVELOPMENT.md and CONVENTIONS.md

## Notes

- **Backward compatibility is a clean slate per GOAL.md.** No migration logic is needed. If `.pio/PROJECT.md` still exists on disk, it will be ignored by the new loader (which reads `OVERVIEW.md`). Users run `/pio-project-context` again to generate the new structure.
- **Steps 1 and 2 are independent** — either can be done first. Step 1 changes the consumer; Step 2 changes the producer. Step 3 (prompt rewrite) is the largest change but has no code dependencies on Steps 1–2.
- **The `writeAllowlist` check in `validation.ts` resolves paths relative to `workingDir`.** For project-context, `workingDir = cwd` (not goal-scoped), so `.pio/PROJECT/OVERVIEW.md` resolves to `{cwd}/.pio/PROJECT/OVERVIEW.md`. The file protection enforces exact path matching — ensure all 7 allowlist entries use the correct relative paths.
- **Module-level cache in `session-capability.ts`:** The `projectContext` variable is read once per session lifetime and cached. This behavior is preserved — only the source path changes. Active sessions created before this change will continue using their cached value (old `PROJECT.md`) until they restart.
