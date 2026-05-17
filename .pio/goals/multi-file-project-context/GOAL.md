# Multi-File Project Context Structure

Replace the monolithic `.pio/PROJECT.md` with a structured folder `.pio/PROJECT/` containing 7 specialized files. `OVERVIEW.md` loads into every agent session (replacing the current `PROJECT.md` injection). The remaining 6 files are referenced directly by skills and prompts that need them — no new loading infrastructure required.

## Current State

A single `.pio/PROJECT.md` is produced by the `pio_create_project_context` tool/command (`src/capabilities/project-context.ts`). It is injected into every agent session via `before_agent_start` in `src/capabilities/session-capability.ts`: the file at `.pio/PROJECT.md` is read once per session (module-level cache), wrapped in `--- PROJECT OVERVIEW ---`, and prepended to the capability-specific prompt.

The analysis prompt (`src/prompts/project-context.md`) instructs a "Project Context Analyzer" agent to research the entire project recursively and produce one monolithic file covering: tech stack, repository structure, build/test/deploy, development workflow (including commit conventions from git history), AI agent instructions, and important notes. The `writeAllowlist` for this capability is `[.pio/PROJECT.md]`.

The current file mixes concerns: overview, build commands, git conventions, coding conventions, architecture hints, and agent instructions all live in one document that gets injected into every session regardless of relevance. This wastes context budget — a code review session doesn't need deploy commands, and a commit message task doesn't need the full tech stack description.

## To-Be State

### New file structure under `.pio/PROJECT/`

Seven files replace the single `PROJECT.md`:

1. **`OVERVIEW.md`** — Tech stack, repository structure, what the project is about. Loaded in every prompt on session start via `before_agent_start` (replaces current `PROJECT.md` injection path).
2. **`DEVELOPMENT.md`** — Build, test, deploy commands + development workflow. Everything a developer needs to actually develop in the project. Referenced by implementation and testing skills.
3. **`CONVENTIONS.md`** — Code conventions from editor configs, AI instruction files (`AGENTS.md`, `CLAUDE.md`, etc.), linting/formatting rules. Referenced by implementation and code review skills.
4. **`GIT.md`** — If the project is a git repository: branch naming, commit message format, PR conventions, tag/versioning scheme. Discovered from `git log`, `git branch`, `git tag`. Referenced by skills before commits or PR creation.
5. **`ARCHITECTURE.md`** — Architecture patterns and decisions, service integrations, deployment topology, ecosystem context. Includes ADRs if they exist in the project. Helps agents understand the broader system.
6. **`DEPENDENCIES.md`** — Service-to-service dependencies, external APIs, third-party integrations, internal monorepo package graph. Referenced when understanding cross-service impact or integration points.
7. **`GLOSSARY.md`** — Domain-specific terminology, business concepts, project acronyms. Referenced when working with domain-heavy codebases.

### Changes required

1. **`src/capabilities/project-context.ts`** — Update `writeAllowlist` from `[.pio/PROJECT.md]` to `[.pio/PROJECT/OVERVIEW.md, .pio/PROJECT/DEVELOPMENT.md, .pio/PROJECT/CONVENTIONS.md, .pio/PROJECT/GIT.md, .pio/PROJECT/ARCHITECTURE.md, .pio/PROJECT/DEPENDENCIES.md, .pio/PROJECT/GLOSSARY.md]`.

2. **`src/prompts/project-context.md`** — Rewrite the analysis prompt to produce all 7 files in a single session (single pass). Each section of the current Phase 2 summarization maps to one or more output files. The agent still researches once but writes to multiple targets. Include guidance that not all files may be relevant to every project (e.g., `GIT.md` is skipped for non-git repos, `GLOSSARY.md` may be minimal).

3. **`src/capabilities/session-capability.ts`** — Change the `before_agent_start` handler from reading `.pio/PROJECT.md` to reading `.pio/PROJECT/OVERVIEW.md`. The injection wrapper label changes from `--- PROJECT OVERVIEW ---` to remain the same (content is still the project overview, just from a different file).

4. **Skill prompt updates** — Existing skill files should reference the new paths where relevant:
   - `src/skills/test-driven-development/SKILL.md` — Reference `.pio/PROJECT/DEVELOPMENT.md` for test placement conventions and `.pio/PROJECT/CONVENTIONS.md` for coding standards.
   - Any future commit/PR-related skill — Reference `.pio/PROJECT/GIT.md`.

5. **Backward compatibility** — Clean slate. No migration of existing `.pio/PROJECT.md`. If one exists, it is ignored by the new loader (which reads `OVERVIEW.md` instead). Users recreate context with `/pio-project-context` to generate the new structure.

### File size limits

Each file should target a maximum of ~2000 tokens (~1500 words) to keep context injection manageable. The analysis prompt should instruct the agent to be concise and prioritize actionable information over exhaustive documentation.
