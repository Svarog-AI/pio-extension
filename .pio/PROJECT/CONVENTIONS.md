# Code Conventions

## Coding Style

The project's style and formatting are enforced by **Biome** (configured in `biome.json`) plus documented code patterns. There is **no `.editorconfig`, `.prettierrc`, or ESLint config**, and the editor config (`.vscode/settings.json`) is empty (`{}`) — so conventions come from Biome and established code patterns, not the editor.

### From `tsconfig.json`

- **Target:** ES2022
- **Module:** ESNext with bundler resolution
- **Strict mode:** `true` — all strict TypeScript checks enabled
- **No emit:** `noEmit: true` (type-checking only; pi runs TS directly)
- **Force consistent casing in file names**

### Formatting (from `biome.json`)

- **Indentation:** spaces, width **2** (`indentStyle: "space"`, `indentWidth: 2`)
- **Quotes:** **double quotes** (Biome default)
- **Semicolons:** **always** (Biome default)
- **Trailing commas:** **always** (Biome default)
- **Line length:** **no enforced limit**; long lines are typically wrapped at ~120 chars by convention (Biome not configured with a max width)
- **Imports:** auto-organized via `assist.actions.source.organizeImports: "on"`

### From code patterns (established conventions)

- **ES module imports:** bare specifiers without `.ts` extensions; resolve `__dirname` via `fileURLToPath(import.meta.url)`.
- **Import grouping:** imports grouped by category (framework → internal modules → node builtins), with blank lines between groups.
- **Type imports:** top-level `import type { ... }` statements only — inline `import("./module")` type annotations are not allowed. Biome organizes top-level type imports with their source groups.
- **Naming:** `camelCase` for functions/variables, `PascalCase` for interfaces/types, `UPPER_SNAKE_CASE` for constants.
- **File structure:** sections separated by `// ---------------------------------------------------------------------------` comment dividers.
- **Module header comments:** present tense — describe what the module is and does; no removal/migration narratives ("replaces X", "the former Y tool") or history in file headers.
- **Line length:** long lines typically wrapped at ~120 chars (no hard limit).

## Linting and Formatting

**Biome** (`@biomejs/biome` ^2.5.1) is the project linter and formatter, configured in `biome.json`:

- **Format:** 2-space indent, double quotes, semicolons always, trailing commas.
- **Imports:** auto-organized via `assist.actions.source.organizeImports: "on"` — alphabetical ordering, grouped by source type.
- **Lint preset:** `recommended`, with test-file overrides for `noExplicitAny`, `noBannedTypes`, `noNonNullAssertion`, `noDuplicateTestHooks`, `noNonNullAssertedOptionalChain`.
- **File scope:** all files (`"**"`) except `.pio/`, `dist/`, and `package-lock.json` (force-ignored with `!!`). `files.ignoreUnknown: true` suppresses diagnostics for non-code files.

### How to run

| Action | Command |
|--------|---------|
| Lint (strict, CI) | `npm run lint` → `biome check --error-on-warnings .` |
| Lint + auto-fix (local) | `npm run lint:fix` → `biome check --write .` |
| Type check | `npm run check` → `tsc --noEmit` |
| Pre-commit hook | Lefthook (`lefthook.yml`) runs `npx @biomejs/biome check --write --error-on-warnings --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}` on staged `*.{ts,json,jsonc}` with `stage_fixed: true` (auto-re-stages fixes). Installed automatically by `npm install` via the `prepare` script (skipped in CI). Reinstall manually with `npx lefthook install`. |

**CI enforcement:** lint, type checking, and tests must all pass (`.github/workflows/ci.yml`).

## AI Agent Instructions

**No dedicated agent instruction files exist** at the project root (no `AGENTS.md`, `CLAUDE.md`, `CURSOR.md`, `.github/copilot-instructions.md`). The `pio-git` skill explicitly defers to `.pio/PROJECT/GIT.md` for git conventions. Agent guidance is encoded in the capability prompts and skills instead:

### Capability Package Structure

Each AI-driven capability is a directory package under `src/capabilities/<name>/`:

- **`config.ts`** — default exports `CapabilityPackageConfig` (fields: `name`, `skills`, `contract` (mandatory), `readOnlyFiles`, `writeAllowlist`, `allowProjectWrites` (opt-in, default `false`), `prepareSession`, `postValidate`, `postExecute`, `preValidate`). Named export `register(pi)` registers a tool (tool-only architecture — no command handlers).
- **Declarative markers via `contract.markers`:** Prefer declarative markers over `postExecute` callbacks for creating step-level marker files (COMPLETED/BLOCKED/APPROVED/REJECTED). Declare `markers: [{ outputFile, field, values }]` on the contract; the framework handles creation and cleanup automatically.
- **`MarkdownFileSpec.name` is required** — every entry in `contract.inputs[]`/`contract.outputs[]` must declare a `name: string` (kebab-case). Names must be unique across inputs/outputs unless they share the same name and file path. Files are accessed via named accessors — `capState.input(name)`, `capState.output(name)` — not by path.
- **`MarkdownFileSpec.projectRelative`** — when `true`, resolves from the global `pioRootDir` (`<cwd>/.pio/`) instead of the workspace directory (used by `finalize-goal` and `project-context`).
- **`paramKey` forwarding** — when a contract input declares `paramKey`, the tool schema must include the matching field as `Type.Optional(Type.String())`; forward via direct assignment (`key: params.key`), never conditional spread. Naming: camelCase matching the referenced file (e.g., `goalFile`, `planFile`, `taskFile`).
- **`role.md`** — role description text.
- **`workflow.ts`** — default exports `WorkflowPhase[]`. Each phase may declare `skills: { mandatory?: string[], recommended?: ... }`.
- **`guidelines.md`** — guidelines text.
- **`callbacks.ts`** *(optional)* — lifecycle callbacks (validation, file protection resolvers).
- **`schemas.ts`** *(optional)* — capability-local TypeBox frontmatter schemas for output validation.
- **`config.test.ts`** — colocated tests. Behavioral scope only: contract shape, default export, and tool registration. Do not assert static config layout (phase counts, hardcoded `workflowPhases[n]` indices). If per-phase structural coverage is needed, use id-based lookups (`workflowPhases.find(p => p.id === "...")`).

Non-AI capabilities (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) are consolidated in `src/direct-tools.ts`.

Registration is via auto-discovery: `discoverCapabilities()` scans `src/capabilities/` for directories with `config.ts`, then calls `registerCapability(pi, descriptor)`. No hardcoded imports in `index.ts`.

### Skills

Bundled skills live in `src/skills/` (each a directory with `SKILL.md`): `pio-git` (git protocol — always defers to GIT.md), `tdd` (test-driven development), `capability-design` (loop-engine workflow design). Retired skills are archived in `src/skills.old/`. Skills are auto-discovered at startup by scanning for `SKILL.md`.
