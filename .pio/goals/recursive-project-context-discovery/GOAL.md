# Recursive Project Context Discovery

Add a lightweight "attention hints" list to `pio-project-context` that surfaces files an AI agent would typically overlook — like AI-specific instruction files (AGENTS.md, CLAUDE.md), editor configs, or niche directories (.wolf/) — giving the context analyzer visibility into useful files it might otherwise skip.

## Current State

The `pio_create_project_context` tool is implemented in `src/capabilities/project-context.ts`. It works as follows:

1. **Hardcoded pattern scanning** — The `FILE_PATTERNS` array defines ~35 file patterns (README.md, package.json, Dockerfile, `.github/workflows/*.yml`, etc.). These are mostly conventional documentation and infrastructure files that any agent would naturally encounter during normal exploration.

2. **Missing attention hints** — The pattern list does not include files or directories that are specifically valuable for AI agents but easy to overlook, such as:
   - AI instruction files: `CLAUDE.md`, `CURSOR.md`, `.github/copilot-instructions.md` (note: `AGENTS.md` is already in the list)
   - Niche tooling directories like `.wolf/`
   - Editor configs that encode project conventions (`.editorconfig`, `.prettierrc`, etc.)
   - Other agent-relevant files that don't fit the "docs / build infra" category

3. **Gated on pattern matches** — If no files match any pattern, the tool returns "No project context files found" and the session never starts.

4. **Flat/shallow scanning only** — Exact patterns only match at root level. Glob patterns scan one specific subdirectory. No recursive discovery.

5. **Current file list** (`src/capabilities/project-context.ts`, lines 12–56): The `FILE_PATTERNS` array currently contains patterns grouped roughly as: documentation (README.md, CONTRIBUTING.md, CHANGELOG.md, docs/*.md), AI instructions (AGENTS.md), build/automation (Makefile, justfile, Taskfile.yml, etc.), CI/CD infra (GitHub workflows, Dockerfile, docker-compose), and dependency manifests (package.json, Cargo.toml, etc.).

## To-Be State

A new attention hints list is added to the discovery mechanism. It is a small curated set of file patterns with descriptions, representing things agents commonly miss but that are highly relevant for project context. No recursive scanning or structural analysis — just a simple pattern-to-description mapping.

1. **Attention hints data structure** — A new constant (e.g., `ATTENTION_HINTS`) in `src/capabilities/project-context.ts` holds entries of the form:
   - Pattern (file path or glob)
   - Description (why it matters, what information it contains)
   Example: `{ pattern: "CLAUDE.md", description: "AI agent instructions specific to Claude/Claude Code" }`

2. **Integration with discovery** — The existing `discoverProjectFiles` function checks for these patterns alongside FILE_PATTERNS (or replaces the relevant AI-instruction entries). When found, they are surfaced in the initial message to the analysis session with their descriptions so the agent understands why each file matters.

3. **No gating change needed** — The hints supplement existing discovery. If only hints match and no conventional files exist, the session should still launch (the hints themselves may be the most valuable context). This also fixes the current gate-on-matches problem for edge cases.

4. **System prompt update** — `src/prompts/project-context.md` will note that certain highlighted files are attention hints (files the agent might otherwise skip) and should be given priority during analysis.

5. **Attention hints list**:
   - `AGENTS.md` — AI agent project instructions and conventions
   - `CLAUDE.md` — AI agent instructions specific to Claude/Claude Code
   - `CURSOR.md` — AI agent instructions for Cursor IDE
   - `Justfile` / `justfile` — Task runner definitions (alternative to Makefile)
   - `.wolf/` directory — Wolf-specific project configuration
