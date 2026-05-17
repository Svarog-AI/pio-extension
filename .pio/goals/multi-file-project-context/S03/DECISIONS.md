# Accumulated Decisions (through Step 3)

## Architecture Decisions

- **Path resolution extracted to pure function:** `resolveProjectContextPath(cwd: string): string` in `session-capability.ts` returns `.pio/PROJECT/OVERVIEW.md`. Exported utility — do not reimplement similar logic elsewhere.

- **Module-level cache preserved:** The `projectContext` variable in `session-capability.ts` remains as a module-level cache (read once per session). Downstream steps should not alter this caching behavior.

## File Placement

- **7 output file paths are finalized** from Step 2's `writeAllowlist`: `.pio/PROJECT/OVERVIEW.md`, `.pio/PROJECT/DEVELOPMENT.md`, `.pio/PROJECT/CONVENTIONS.md`, `.pio/PROJECT/GIT.md`, `.pio/PROJECT/ARCHITECTURE.md`, `.pio/PROJECT/DEPENDENCIES.md`, `.pio/PROJECT/GLOSSARY.md`. These are the canonical paths — all prompts and code must reference these exact relative paths.

- **`createProjectContextTool` removed in Step 2:** The dead tool stub was deleted rather than updated. No downstream step should reference it or its test block.

- **Prompt files have no dedicated unit tests:** Prompt content (`src/prompts/*.md`) is verified through programmatic checks (string matching, section presence) and manual review, not Vitest test suites. This is consistent across all capability prompts in the codebase.

## Test Infrastructure

- **Colocated test pattern:** Tests live as `*.test.ts` alongside source files under `src/capabilities/`. Vitest with Node environment, ESM modules, and globals enabled.
