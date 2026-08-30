# Development Guide

## Build and Test

The project is a source-run pi extension with **no build step** — there is no compilation or bundling. Code is consumed as raw TypeScript ESM modules directly by the pi framework. `build` and `clean` npm scripts are no-op stubs.

- **Install:** `npm install` — installs devDependencies (`@earendil-works/pi-coding-agent`, `typebox`, `typescript`, `vitest`, `@biomejs/biome`, `lefthook`, `pi-ask-user`) and runtime dependency (`js-yaml`). Also installs the lefthook pre-commit hook via the `prepare` script (skipped in CI).
- **Type check:** `npm run check` — runs `tsc --noEmit`. This is the primary static analysis; fails on type errors.
- **Tests:** `npm test` — runs `vitest run` (all Vitest tests). Tests are colocated `*.test.ts` files under `src/`.
- **Lint:** `npm run lint` — runs `biome check --error-on-warnings .` (strict, fails on errors and warnings; used by CI).
- **Lint fix:** `npm run lint:fix` — runs `biome check --write .` (auto-fixes formatting, import organization, and safe lint issues locally).
- **Pre-commit hook:** Automatically installed by `npm install` via the `prepare` script (skipped in CI). Runs Biome on staged `.ts`/`.json` files via lefthook; auto-re-stages fixed files. Reinstall manually with `npx lefthook install`.

**Prerequisites:** Node.js 22+ and npm. No external services are required for development.

## Test Directory Convention

Tests are **colocated** alongside source files using the `*.test.ts` naming convention — a test file sits in the same directory as the module it tests:

- `src/capability-state.ts` → `src/capability-state.test.ts`
- `src/fs-utils.ts` → `src/fs-utils.test.ts`
- `src/guards/validation.ts` → `src/guards/validation.test.ts`
- `src/capabilities/evolve-plan/config.ts` → `src/capabilities/evolve-plan/config.test.ts`

**Capability package tests** live inside the capability directory (e.g., `evolve-plan/config.test.ts`) following the same `*.test.ts` pattern.

**Runner config** (`vitest.config.ts`): Node.js environment, global `describe/it/expect` (no imports needed), include pattern `src/**/*.test.ts`. Run with `npm test` → `vitest run`.

**Testing conventions** (from the `tdd` skill and DEVELOPMENT docs):
- Tests are **behavioral**, verifying behavior through public interfaces — not implementation details. Prefer integration-style tests that exercise real code paths through public APIs.
- Capability `config.test.ts` files assert contract shape, default export, and tool registration only — never static layout (phase counts or hardcoded `workflowPhases[n]` indices). Use id-based lookups (`workflowPhases.find(p => p.id === "...")`) if per-phase coverage is needed.
- Tests use `fs.mkdtempSync()` for **real temp directory trees** under `os.tmpdir()` (not mocked filesystems), cleaned up in `afterEach`.
- Tests exercising `console.warn`/`console.error` paths must spy the console methods and restore them only *after* reading `mock.calls`.
- **Loop-cap hermeticity:** `model-config.ts`'s `readConfig()` caches `~/.pi/pio-config.yaml` for the module lifetime. Cap-sensitive tests set an explicit per-block `maxIterations` on fixtures, or use a file-level `vi.mock("../model-config")` spy on `resolveMaxIterations` with a `vi.hoisted` holder (restored in `beforeEach`). Loop-routing tests must drive `resolveNext()` through the live singleton state (`getState()` seeded via `__testSetState`, reset between tests).
- **Exception for skill scripts:** Bundled shell scripts in `src/skills/*/scripts/` have colocated `.test.ts` files tested via `child_process.spawnSync`.

**Explicitly not tested** (per the `tdd` skill and project decisions): prompt content/text (`.md` prompt files are not unit-tested), string literals, non-behavioral config metadata (tool descriptions, labels, titles), internal data-structure shapes, function signatures/parameter counts, and raw file contents.

## CI/CD and Release

**GitHub Actions** (`.github/workflows/ci.yml`) runs on every push to `main` and every PR targeting `main`:

1. Checkout repository (`actions/checkout@v4`)
2. Setup Node.js 22 with npm caching (`actions/setup-node@v4`)
3. `npm install`
4. `npm run lint` (Biome — fails on errors and warnings)
5. `npm run check` (TypeScript type checking)
6. `npm test` (Vitest test suite)

There is **no build step in CI** (the build script is a no-op), and **no release cycle** — no versioning tags, no packaging/publish pipeline, and no deployment. The extension is consumed directly from the repository path (no npm publish; `package.json` is `private: true`).

## Local Environment Setup

- **Prerequisites:** Node.js 22+, npm. No database, message broker, or external API services are required for local development. (Optional `acli` — Atlassian CLI — is only needed for the retired `pio-jira` skill, not the current codebase.)
- **Install:** `npm install` (installs deps and the lefthook hook).
- **Validate:** `npm run check`, `npm test`, `npm run lint`.
- **No start command:** there is no standalone executable or `start` script. "Running" the project means registering it with the pi coding agent and launching pi.

**Extension registration (required to run):** Add the extension directory to `~/.pi/config.yaml`:
```yaml
extensions:
  - /path/to/pio-extension
```
The pi framework reads `package.json`'s `pi.extensions` array to locate `./src/index.ts`.

**Optional runtime config (`~/.pi/pio-config.yaml`)** — read via `model-config.ts`, cached for module lifetime:
```yaml
default:
  provider: anthropic
  modelId: claude-sonnet-4-20250514
capabilities:
  execute-task:
    provider: openai
    modelId: gpt-5
guards:
  turnThreshold: 20
loop:
  maxIterations: 15
workspace:
  dir: ~/.pi/pio
```
- `default` / `capabilities.<name>` — per-capability LLM model overrides (resolution: per-capability → default → inherit parent).
- `guards.turnThreshold` (default 15, positive integer) — turns before the session guard sends a refinement-loop nudge.
- `loop.maxIterations` (default 15) — global cap on iterations per phase (per-phase `maxIterations` overrides).
- `workspace.dir` (default `~/.pi/pio`) — directory for per-session loop-engine state files (`<dir>/state/<sessionId>.json`).

**Environment variables / secrets:** **None required.** There is no `.env`, no `.env.example`, and no secrets in the repo. The only `process.env` usage is `PIO_CONFIG_TEST_HOME` (used solely in tests to redirect the home dir) and `STRIPE_KEY` (a teaching example in `src/skills/tdd/mocking.md`, not real code/config).
