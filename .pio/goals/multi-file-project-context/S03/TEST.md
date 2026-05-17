# Tests: Rewrite project-context.md prompt for 7-file output

This step rewrites a markdown prompt file (`src/prompts/project-context.md`). Prompt content is verified through programmatic checks and manual review — there are no unit or integration tests because the prompt is not executable code. The existing Vitest suite covers TypeScript capabilities, not prompt content.

## Programmatic Verification

### All 7 output file paths present in prompt

- **What:** Every new output file path appears in the rewritten prompt
- **How:** `grep -c '\.pio/PROJECT/OVERVIEW\.md' src/prompts/project-context.md` (and repeat for each of the 7 files)
- **Expected result:** Each returns a count ≥ 1

### Old single-file path absent from prompt

- **What:** No references to writing `.pio/PROJECT.md` remain (the old single file)
- **How:** `grep -n '\.pio/PROJECT\.md' src/prompts/project-context.md`
- **Expected result:** No matches (exit code 1). The path `.pio/PROJECT.md` without a trailing `/` or sub-path should not appear as a write target.

### Phase structure preserved (5 phases)

- **What:** All 5 phases are present: Analysis, Summarization, Clarification, Write, Signal Completion
- **How:** `grep -c '## Phase' src/prompts/project-context.md` and verify headings for each phase name
- **Expected result:** At least 5 `## Phase` headings matching the expected phase names

### Token limit guidance included

- **What:** The prompt mentions the ~2000 token target per file
- **How:** `grep -i 'token\|2000' src/prompts/project-context.md`
- **Expected result:** At least one match referencing token limits or ~2000

### Skip/minimize guidance included

- **What:** The prompt instructs the agent to skip or minimize irrelevant files
- **How:** `grep -i 'skip\|not relevant\|non-git\|minimal' src/prompts/project-context.md`
- **Expected result:** At least one match about handling irrelevant categories (e.g., non-git repos, minimal glossary)

### Filename unchanged

- **What:** The prompt file is still named `project-context.md` (required by `launchCapability`)
- **How:** `test -f src/prompts/project-context.md && echo "exists"`
- **Expected result:** File exists at exact path `src/prompts/project-context.md`

### TypeScript compilation clean

- **What:** The overall project still compiles with no TypeScript errors
- **How:** `npm run check` (runs `tsc --noEmit`)
- **Expected result:** Exit code 0, no errors

## Manual Verification

### Prompt reads as coherent instructions

- **What:** The rewritten prompt provides clear, actionable instructions for producing all 7 files
- **How:** Read `src/prompts/project-context.md` end-to-end. Verify:
  - Phase 1 research instructions are comprehensive (cover tech stack, structure, build, git, dependencies, terminology)
  - Phase 2 questions map clearly to the 7 output files
  - Phase 4 provides a template/heading structure for each of the 7 files
  - Guidelines at the bottom enforce quality bar and write-only rules
  - No stale references to the single `.pio/PROJECT.md` remain

### Each file has distinct content guidance

- **What:** The prompt differentiates what goes in each file — no ambiguity about where content belongs
- **How:** Verify that `OVERVIEW.md` guidance differs from `DEVELOPMENT.md`, which differs from `CONVENTIONS.md`, etc. Each should have a unique set of expected headings and content descriptions.

## Test Order

1. Programmatic checks (filename unchanged, TypeScript compilation)
2. Programmatic content checks (7 paths present, old path absent, phases preserved, token guidance, skip guidance)
3. Manual review (coherence, distinct content guidance)
