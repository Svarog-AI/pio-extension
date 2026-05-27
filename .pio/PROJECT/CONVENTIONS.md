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

### Capability Skills Configuration

Each capability declares skills via the `skills` field in its `CAPABILITY_CONFIG` (`StaticCapabilityConfig.skills: CapabilitySkills`). Shape: `mandatory?: string[]` (force-injected) and `recommended?: { name: string; condition: string }[]` (instruction-based). Both fields optional — a capability can declare only one, or neither. When no recommended skills exist, omit the key entirely (not empty array).

At runtime, `buildSkillLoadingSection()` reads these from the capability config, prepends global defaults (`pio`, `ask-user`), and injects them dynamically into session prompts. Skills are resolved per-capability, not hardcoded in prompt files. The `_skill-loading.md` file is retained on disk as documentation only.

### Conventions encoded in capability prompts:

- **No source code in planning docs:** GOAL.md, PLAN.md, TASK.md contain descriptions and interface signatures only — never full implementations
- **Programmatic verification preferred:** Acceptance criteria should be verifiable via `npm run check`, test execution, or file existence checks
- **Stay within scope:** Each capability prompt forbids out-of-scope changes (refactoring unrelated code, "while you're at it" improvements)
- **Reference real files:** Every file path in generated documents must correspond to a file the agent actually read
- **Iterative TDD:** `execute-task` uses an iterative tracer-bullet workflow per the `tdd` skill (tracer bullet → incremental RED→GREEN cycles → refactor). TEST.md is created post-hoc as a summary record, not upfront as a test plan
- **Skill reference convention:** Skills are declared dynamically via `CAPABILITY_CONFIG.skills` (not hardcoded in prompts). Capability prompts may reference shared skills by name throughout process steps — these are legitimate procedural instructions. Dedicated "Skill References" sections have been removed from prompt files; skill loading is handled automatically at runtime via `buildSkillLoadingSection()`. Shared methodology lives in skills; prompts retain only capability-specific instructions
- **Delegation over duplication:** When a prompt needs to invoke shared behavior (e.g., git commit), it references the relevant skill by name and instructs the agent to load it. The prompt does not duplicate skill internals — the loaded skill provides protocol details at runtime. Example: execute-task and execute-plan prompts reference `pio-git` for commits without explaining staging or message construction

The `_skill-loading.md` file is retained on disk as documentation of the legacy format. It is no longer injected into sessions — skill loading is now handled dynamically via `buildSkillLoadingSection()` in `session-capability.ts`.

### TASK.md Skills

Every `TASK.md` produced by `evolve-plan` includes skills in **both** YAML frontmatter and a body `## Skills` section:

- **Frontmatter `skills` (required):** Machine-readable. `skills.mandatory` (string array) for force-injected skills; `skills.recommended` (`{ name, condition }` array) for conditional loading. Consumed at runtime by `execute-task` and `review-task` via `StepStatus.taskSkills()` during `prepareSession`. Merged with base capability skills via `mergeCapabilitySkills()`. YAML frontmatter delimiters (`---`) are always present — even when no skills are declared. When no recommended skills exist, omit the key entirely.
- **Body `## Skills` section (informational):** Human-readable reasoning justifying skill choices for the step. Preserved alongside frontmatter — both coexist and serve different purposes.
