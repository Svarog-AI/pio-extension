# Code Conventions

## Coding Style

From `tsconfig.json`:
- **Target:** ES2022
- **Module:** ESNext with bundler resolution
- **Strict mode:** `true` — all strict TypeScript checks enabled
- **No emit:** `noEmit: true` (type-checking only; pi runs TS directly)
- **Force consistent casing in file names**
- **ES module imports:** Use bare specifiers without `.ts` extensions. Resolve `__dirname` via `fileURLToPath(import.meta.url)`.

From code patterns observed in source files:
- **Imports:** Grouped by category (framework → internal modules → node builtins), with blank lines between groups
- **Naming:** camelCase for functions/variables, PascalCase for interfaces/types, UPPER_SNAKE_CASE for constants
- **File structure:** Sections separated by `// ---------------------------------------------------------------------------` comment dividers
- **Line length:** No hard limit enforced, but long lines are typically wrapped at ~120 chars

No `.editorconfig`, `.prettierrc`, or ESLint configuration exists. Formatting conventions are established through code patterns rather than tooling.

## Linting and Formatting

- **Type checking as lint:** `npm run check` (`tsc --noEmit`) is the primary quality gate — catches type errors, undefined variables, and interface mismatches
- **No dedicated linter:** No ESLint, Biome, or similar tools configured
- **No formatter:** No Prettier, Biome format, or similar tools configured
- **CI enforces:** Both type checking and tests must pass (`.github/workflows/ci.yml`)

Consider adding a formatter (e.g., Prettier or Biome) to standardize code style across contributors.

## AI Agent Instructions

**No dedicated agent instruction files exist** at the project root (no `AGENTS.md`, `CLAUDE.md`, `CURSOR.md`). The prompts in `src/prompts/` serve as de facto agent guidance — each defines detailed rules for its respective workflow role.

### Conventions encoded in capability prompts:

- **No source code in planning docs:** GOAL.md, PLAN.md, TASK.md contain descriptions and interface signatures only — never full implementations
- **Programmatic verification preferred:** Acceptance criteria should be verifiable via `npm run check`, test execution, or file existence checks
- **Stay within scope:** Each capability prompt forbids out-of-scope changes (refactoring unrelated code, "while you're at it" improvements)
- **Reference real files:** Every file path in generated documents must correspond to a file the agent actually read
- **Test-first discipline:** `execute-task` follows TDD (RED → GREEN → REFACTOR) per the `test-driven-development` skill

The `_skill-loading.md` prompt instructs all sub-sessions to load relevant skill documentation before acting, including the mandatory `pio/SKILL.md`.
