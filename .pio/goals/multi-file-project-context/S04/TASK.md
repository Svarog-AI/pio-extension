# Task: Update other prompt references to the new paths

Update stale references to `.pio/PROJECT.md` in `create-plan.md`, `execute-task.md`, and `evolve-plan.md` so agents reference the correct multi-file paths under `.pio/PROJECT/`.

## Context

Steps 1–3 changed the producer (`project-context.ts`), the prompt (`project-context.md`), and the consumer (`session-capability.ts`) to use 7 files under `.pio/PROJECT/`. However, three other capability prompts still reference the old single-file path `.pio/PROJECT.md`. If left unchanged, planning, execution, and specification agents will be instructed to read a file that no longer exists.

## What to Build

Replace all remaining references to the old `.pio/PROJECT.md` path across 3 prompt files with the correct new paths from `.pio/PROJECT/`. The mapping depends on what information each agent needs:

- **Planning agents** (`create-plan.md`) need project overview → reference `.pio/PROJECT/OVERVIEW.md`
- **Execution agents** (`execute-task.md`) need test conventions → reference `.pio/PROJECT/DEVELOPMENT.md` for test directory conventions; reference `.pio/PROJECT/DEVELOPMENT.md` for test runner information
- **Specification agents** (`evolve-plan.md`) need test conventions → reference `.pio/PROJECT/DEVELOPMENT.md`

### Code Components

This step involves only text replacements in markdown prompt files — no TypeScript code changes. Each replacement maps a stale reference to its correct multi-file successor:

1. **`create-plan.md` line ~28:** `Read .pio/PROJECT.md if it exists` → `Read .pio/PROJECT/OVERVIEW.md if it exists` (the planning agent's entry point is the project overview)
2. **`execute-task.md` lines ~61–62:** Test file placement convention references `.pio/PROJECT.md` twice → change both to `.pio/PROJECT/DEVELOPMENT.md` (test directory conventions belong in DEVELOPMENT.md)
3. **`execute-task.md` line ~68:** `.pio/PROJECT.md may contain information about this` → `.pio/PROJECT/DEVELOPMENT.md may contain information about this` (test runner info belongs in DEVELOPMENT.md)
4. **`evolve-plan.md` lines ~147–148:** Test file placement convention references `.pio/PROJECT.md` twice → change both to `.pio/PROJECT/DEVELOPMENT.md`

### Approach and Decisions

- **Minimal surgical edits:** Replace only the path string. Preserve surrounding sentence structure, bold formatting, and context text. Do not rewrite paragraphs — just swap the file path.
- **Reference DECISIONS.md mapping:** The "Prompt Reference Mapping" decisions from prior steps dictate that planning agents get OVERVIEW.md and execution/specification agents get DEVELOPMENT.md for test-related guidance.
- **Verify exhaustively after edits:** After making changes, run a grep to confirm zero references to the old `.pio/PROJECT.md` path remain in `src/prompts/`. The only remaining `.pio/PROJECT` references should be the valid new paths (OVERVIEW.md, DEVELOPMENT.md, etc.) or the `.pio/PROJECT/` directory reference in `project-context.md` (which was rewritten in Step 3 and is correct).

## Dependencies

- **Step 1** — session loader reads `.pio/PROJECT/OVERVIEW.md` (consumer side)
- **Step 2** — `writeAllowlist` defines the 7 canonical paths (producer side)
- **Step 3** — `project-context.md` rewritten to produce 7 files

Steps 1–3 must be complete so the new paths are established before this step references them. However, Step 4 is textually independent — it changes prompt strings, not code interfaces.

## Files Affected

- `src/prompts/create-plan.md` — modified: change `.pio/PROJECT.md` reference to `.pio/PROJECT/OVERVIEW.md` (1 occurrence)
- `src/prompts/execute-task.md` — modified: change `.pio/PROJECT.md` references to `.pio/PROJECT/DEVELOPMENT.md` (3 occurrences)
- `src/prompts/evolve-plan.md` — modified: change `.pio/PROJECT.md` references to `.pio/PROJECT/DEVELOPMENT.md` (2 occurrences)

## Acceptance Criteria

- [ ] `src/prompts/create-plan.md` references `.pio/PROJECT/OVERVIEW.md` instead of `.pio/PROJECT.md`
- [ ] `src/prompts/execute-task.md` references `.pio/PROJECT/DEVELOPMENT.md` for test directory conventions (instead of `.pio/PROJECT.md`)
- [ ] `src/prompts/evolve-plan.md` references `.pio/PROJECT/DEVELOPMENT.md` for test-related guidance (instead of `.pio/PROJECT.md`)
- [ ] No stale references to the exact string `.pio/PROJECT.md` remain in any file under `src/prompts/` (verified by `grep`)
- [ ] Existing valid references to `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, or `.pio/PROJECT/` directory in other prompt files are unchanged

## Risks and Edge Cases

- **Over-replacement:** Be careful not to replace `.pio/PROJECT/` (the directory path used correctly in `project-context.md`). Only target the exact old single-file path `.pio/PROJECT.md`.
- **Context-sensitive mapping:** Ensure test-related references go to DEVELOPMENT.md (not OVERVIEW.md). The planning agent reference goes to OVERVIEW.md. Getting this wrong would misdirect agents.
- **Formatting preservation:** These are markdown files with bold formatting, backtick code spans, and numbered lists. Preserve all surrounding formatting — change only the path string inside backticks or plain text.
