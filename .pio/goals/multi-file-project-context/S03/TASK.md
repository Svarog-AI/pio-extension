# Task: Rewrite project-context.md prompt for 7-file output

Completely rewrite the Project Context Analyzer prompt so it produces 7 specialized files under `.pio/PROJECT/` instead of a single `.pio/PROJECT.md`.

## Context

The current `src/prompts/project-context.md` instructs an agent to research a project and produce one monolithic `.pio/PROJECT.md`. This wastes context budget — every agent session receives the full file regardless of relevance. Steps 1 and 2 already updated the consumer (session loader reads `OVERVIEW.md`) and producer config (`writeAllowlist` has 7 paths). Step 3 rewrites the prompt so the Project Context Analyzer actually generates all 7 files.

## What to Build

Rewrite `src/prompts/project-context.md` to instruct the agent to produce 7 output files in a single session (single research pass, multiple write targets). The overall phase structure is preserved but Phase 2 (Summarization) and Phase 4 (Write) are restructured.

### Code Components

This step modifies one file only — no new code components. The prompt rewrite has these structural changes:

#### Phase 1 (Analysis) — Preserved with additions
- Keep the existing research instructions largely as-is.
- Add explicit instruction to discover **cross-service dependencies** (external APIs, third-party integrations, monorepo package graph) and **domain terminology** (business concepts, acronyms).
- The git history analysis sub-section remains unchanged.
- The test placement convention discovery remains unchanged (needed for `DEVELOPMENT.md`).

#### Phase 2 (Summarization) — Restructured to map to output files
Replace the flat list of 9 questions with grouped questions that map directly to output files:

1. **→ `OVERVIEW.md`**: Project purpose, problem solved, users. Repository structure and key directories. Tech stack with versions.
2. **→ `DEVELOPMENT.md`**: Build commands, test execution, linting/formatting. CI/CD pipeline and release cycle. Test directory conventions. Local environment setup (env vars, services needed).
3. **→ `CONVENTIONS.md`**: Coding style from editor configs (`.editorconfig`, `.prettierrc`, `tsconfig.json`). Linting and formatting rules and how to run them. AI agent instructions (`AGENTS.md`, `CLAUDE.md`, etc.).
4. **→ `GIT.md`**: Commit message format (Conventional Commits, custom prefixes). Tag/versioning scheme. Branch naming patterns and branching strategy. Signing practices (GPG, DCO). Skip gracefully if not a git repo.
5. **→ `ARCHITECTURE.md`**: Architecture patterns and key design decisions. Service integrations and deployment topology. ADRs if they exist. Ecosystem context — how the project fits into larger systems.
6. **→ `DEPENDENCIES.md`**: External API dependencies with endpoints/versions. Third-party library integrations. Monorepo internal package graph (if applicable). Data flow between services.
7. **→ `GLOSSARY.md`**: Domain-specific terminology and definitions. Acronyms and their expansions. Business concepts relevant to the codebase.

#### Phase 3 (Clarification) — Preserved unchanged
- Review gaps from Phase 2, use `ask_user` to clarify. Same behavior as today.

#### Phase 4 (Write) — Complete rewrite for multi-file output
Replace the single file write with instructions to produce 7 files under `.pio/PROJECT/`:

Each file section should specify:
- Exact output path (e.g., `.pio/PROJECT/OVERVIEW.md`)
- Required headings and content structure (template with markdown headings)
- Target size: ~2000 tokens (~1500 words) maximum per file
- Guidance to be concise — actionable information over exhaustive documentation

The **guidance section** at the end should specify:
- Not all files are relevant to every project. Examples: skip `GIT.md` for non-git repos, `GLOSSARY.md` may be minimal or empty, `DEPENDENCIES.md` may be empty for single-service projects.
- When a file has no relevant content, write a brief note ("No significant findings in this category") rather than an empty file.
- Write all files to `.pio/PROJECT/` (the directory). Do not write the old `.pio/PROJECT.md`.

#### Phase 5 (Signal Completion) — Preserved unchanged
- After writing all files, call `pio_mark_complete`. Update the completion signal to mention "all output files" instead of referencing a single file path.

### Approach and Decisions

- **Follow the existing prompt structure.** Preserve the 5-phase flow and the Guideline style (bulleted rules at the bottom). The rewrite should feel like an evolution, not a replacement — familiar tone and formatting conventions.
- **Use the exact paths from Step 2's `writeAllowlist`.** These are canonical: `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, etc. Do not invent alternative paths.
- **Each output file section should include a brief template** showing the expected markdown headings (like the current Phase 4 does for the single file). This guides the agent to produce consistent structure across projects.
- **Reference `DECISIONS.md` context:** The 7-file paths are finalized and enforced by `writeAllowlist` in `project-context.ts`. The prompt must align with these exact paths.

## Dependencies

- Step 1 (session loader updated) — not a hard dependency, but ensures the consumer side is ready.
- Step 2 (`writeAllowlist` and `defaultInitialMessage` updated) — provides canonical file paths that this prompt must reference.

## Files Affected

- `src/prompts/project-context.md` — complete rewrite for multi-file output (modified)

## Acceptance Criteria

- [ ] The prompt specifies all 7 output files with their `.pio/PROJECT/` paths
- [ ] Each output file has a clear description of what content it should contain
- [ ] The prompt includes guidance to skip or minimize files that aren't relevant (e.g., non-git repos)
- [ ] The prompt mentions the ~2000 token target per file
- [ ] Phase 1 (research), Phase 3 (clarification), and Phase 5 (completion signal) are preserved
- [ ] No references to writing a single `.pio/PROJECT.md` remain in the prompt
- [ ] `npm run check` reports no TypeScript errors (prompt is a `.md` file, but the overall project should still compile cleanly)

## Risks and Edge Cases

- **Prompt length:** The new prompt will be significantly longer than the current one. Ensure it stays focused — use concise templates rather than verbose explanations for each file.
- **Backward compatibility of prompt format:** The `launchCapability` function loads prompts from `src/prompts/` by name. The filename (`project-context.md`) must not change.
- **Agent compliance:** The agent receiving this prompt will need to write 7 files instead of 1. Ensure the instructions are explicit about writing each file separately and calling `pio_mark_complete` after all are done.
- **Empty or minimal files:** The prompt should handle projects where some categories have nothing meaningful (e.g., a simple script with no dependencies, no git history). Include guidance to write brief placeholder notes rather than empty files.
