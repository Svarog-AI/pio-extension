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

### Capability Package Structure

Each AI-driven capability is a directory package under `src/capabilities/<name>/`:

- **`config.ts`** — default exports `CapabilityPackageConfig`, named export `register(pi)` registers tool + command. No `CAPABILITY_CONFIG` or `setup<Name>` aliases (removed in backward-compat cleanup)
- **`role.md`** — Role description text
- **`workflow.ts`** — default exports `WorkflowStep[]`. Each step may declare `skills: { mandatory?: string[], recommended?: ... }`
- **`guidelines.md`** — Guidelines text
- **`callbacks.ts`** *(optional)* — Lifecycle callbacks (validation, file protection resolvers). Was named `validators.ts` before Step 19 convention cleanup
- **`schemas.ts`** *(optional)* — Capability-local TypeBox frontmatter schemas for output validation. Replaced shared `src/frontmatter-schemas.ts` (deleted)
- **`config.test.ts`** — Colocated tests (follows `*.test.ts` naming convention)

Non-AI capabilities (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) are consolidated in `src/direct-tools.ts`.

Registration is via auto-discovery: `discoverCapabilities()` scans `src/capabilities/` for directories with `config.ts`, then calls `registerCapability(pi, descriptor)`. No hardcoded imports in `index.ts`.

### Capability Skills Configuration

Each capability declares skills via the `skills` field in its `CapabilityPackageConfig`. Shape: `mandatory?: string[]` (force-injected) and `recommended?: { name: string; condition: string }[]` (instruction-based). Both fields optional — a capability can declare only one, or neither. When no recommended skills exist, omit the key entirely (not empty array).

Skills can also be declared per-step in `workflow.ts` (`WorkflowStep.skills`). At runtime, `buildSkillLoadingSection()` reads base config skills, prepends global defaults (`pio`, `ask-user`), and injects them dynamically into session prompts. Per-step skills are merged via `mergeCapabilitySkills()` from `capability-utils.ts`.

The `_skill-loading.md` file was removed along with the old `src/prompts/` directory — skill loading is now handled entirely at runtime.

### Conventions encoded in capability prompts:

- **No source code in planning docs:** GOAL.md, PLAN.md, TASK.md contain descriptions and interface signatures only — never full implementations
- **Programmatic verification preferred:** Acceptance criteria should be verifiable via `npm run check`, test execution, or file existence checks
- **Stay within scope:** Each capability prompt forbids out-of-scope changes (refactoring unrelated code, "while you're at it" improvements)
- **Reference real files:** Every file path in generated documents must correspond to a file the agent actually read
- **Test-first discipline:** `execute-task` follows TDD (RED → GREEN → REFACTOR) per the `test-driven-development` skill
- **Skill reference convention:** Skills are declared dynamically via `CapabilityPackageConfig.skills` and per-step in `workflow.ts`. Capability prompts may reference shared skills by name throughout process steps — these are legitimate procedural instructions. Dedicated "Skill References" sections have been removed from prompt files; skill loading is handled automatically at runtime via `buildSkillLoadingSection()` in `capability-session.ts`. Shared methodology lives in skills; prompts retain only capability-specific instructions
- **Delegation over duplication:** When a prompt needs to invoke shared behavior (e.g., git commit), it references the relevant skill by name and instructs the agent to load it. The prompt does not duplicate skill internals — the loaded skill provides protocol details at runtime. Example: execute-task and execute-plan prompts reference `pio-git` for commits without explaining staging or message construction
- **Prompt compilation:** Prompts are assembled from component files (`role.md`, `workflow.ts`, `guidelines.md`) by `compilePrompt()` at runtime. The old `src/prompts/` directory no longer exists.

### TASK.md Skills

Every `TASK.md` produced by `evolve-plan` includes skills in **both** YAML frontmatter and a body `## Skills` section:

- **Frontmatter `skills` (required):** Machine-readable. `skills.mandatory` (string array) for force-injected skills; `skills.recommended` (`{ name, condition }` array) for conditional loading. Consumed at runtime by `execute-task` and `review-task` via `StepStatus.taskSkills()` during `prepareSession`. Merged with base capability skills via `mergeCapabilitySkills()` from `capability-utils.ts`. YAML frontmatter delimiters (`---`) are always present — even when no skills are declared. When no recommended skills exist, omit the key entirely.
- **Body `## Skills` section (informational):** Human-readable reasoning justifying skill choices for the step. Preserved alongside frontmatter — both coexist and serve different purposes.
