# Development Guide

## Build and Test

- **Install:** `npm install` — installs devDependencies (`@earendil-works/pi-coding-agent`, `typebox`, `typescript`, `vitest`) and runtime dependency (`js-yaml`).
- **Type check:** `npm run check` — runs `tsc --noEmit`. This is the primary static analysis. Fails on type errors.
- **Lint:** `npm run lint` — runs `biome check --error-on-warnings .`. Enforces Biome's recommended rules with zero warnings allowed. Test files (`*.test.ts`) have rule overrides for `noExplicitAny`, `noBannedTypes`, `noNonNullAssertion`, `noDuplicateTestHooks`, and `noNonNullAssertedOptionalChain`.
- **Lint fix:** `npm run lint:fix` — runs `biome check --write .`. Auto-fixes formatting, import organization, and safe lint issues locally.
- **Pre-commit hook:** Automatically installed by `npm install` via the `prepare` script (skipped in CI). Runs Biome on staged `.ts`/`.json` files via lefthook; auto-re-stages fixed files. Use `npx lefthook install` to reinstall manually.
- **Tests:** `npm test` — runs all Vitest tests (`vitest run`). Tests are colocated `.test.ts` files under `src/`.
- **No build step:** The extension is consumed as raw TypeScript ESM modules by the pi framework. Scripts for `build` and `clean` are no-op stubs. No transpilation or bundling.
- **Dual-tree gates (binding acceptance standard):** With the standalone `pio/` package, the full gate matrix is root `npm run check && npm run lint && npm test` (baseline untouched) **and** `cd pio && npm run check && npm test` — both trees must stay green. Root `biome check` covers `pio/**` via the single shared root `biome.json` (Biome walks up from `pio/` to it — verified); never duplicate a `biome.json` into `pio/`. `pio/` keeps its own manifest, lockfile, tsconfig, and vitest config; `cd pio && npm ci && npm run check/test/lint` works standalone.
- **Zero-build execution (pio executable):** `pio/bin/pio` is plain JS; all `pio/` TypeScript executes via Node's native type stripping — no transpiler, bundler, or build artifact. `pio/tsconfig.json` sets `erasableSyntaxOnly: true` (tsc rejects non-strippable syntax — enums, namespaces, parameter properties — at check time) and `allowImportingTsExtensions: true` (required so `pio/` sources can import relatives with explicit `.ts` extensions under `noEmit`). Runtime floor: Node ≥ 23.6 with native type stripping (documented, not enforced in code).

## Test Directory Convention

Tests are **colocated** alongside source files using the `*.test.ts` naming convention:
- `src/capability-state.ts` → `src/capability-state.test.ts`
- `src/fs-utils.ts` → `src/fs-utils.test.ts`
- `src/guards/validation.ts` → `src/guards/validation.test.ts`
- `src/capabilities/evolve-plan/config.ts` → `src/capabilities/evolve-plan/config.test.ts`

**Capability package tests** live inside the capability directory (e.g., `evolve-plan/config.test.ts`) following the same `*.test.ts` pattern.

Configuration: `vitest.config.ts` — Node.js environment, global `describe/it/expect`, include pattern `src/**/*.test.ts`.

**Exception for skill scripts:** Bundled shell scripts in `src/skills/*/scripts/` have colocated `.test.ts` files in the same directory (e.g., `src/skills/pio-jira/scripts/setup-config.test.ts`). These are matched by the `src/**/*.test.ts` pattern and tested using `child_process.spawnSync` to execute the script in temp directories.

Tests use `fs.mkdtempSync()` for temp directories (not mocked filesystems). Most tests create real directory trees under `os.tmpdir()` and clean up in `afterEach`.

**Console warn/error convention:** Tests that exercise `console.warn`/`console.error` paths must spy the console methods and restore them only *after* reading `mock.calls` (restoring earlier loses recorded calls) — keeps suite output free of leaked warnings.

**Loop-cap test hermeticity:** `model-config.ts`'s `readConfig()` caches the parsed `~/.pi/pio-config.yaml` for the **module lifetime** (no invalidation export), so real config values are machine-dependent and fixed after the first read within one module instance. Cap-sensitive tests must either set an explicit per-block `maxIterations` on fixtures (priority-1 override — the convention in `loop-engine.test.ts`) or pin behavior through a file-level `vi.mock("../model-config")` spy on `resolveMaxIterations` with a `vi.hoisted` holder and restore-to-original in `beforeEach` (precedent: `phase-manager.test.ts`). Do not add that mock to files whose suites assert real model-config behavior. Related: loop-routing tests must drive `resolveNext()` through the **live singleton** state (`getState()` seeded via `__testSetState`, reset between tests) — the engine reads the pass counter from the `state` argument but writes via the `setState` singleton, so a detached stub desynchronizes reads from writes and cap tests never terminate.

**pio package test hermeticity:** Unit suites under `pio/` NEVER reach the real SDK/provider/TUI. Seams: `vi.mock("./session.ts")` spies session construction (with temporarily redefined `process.stdin`/`process.stdout` descriptors restored in `afterEach`), `vi.mock("./probe.ts")` drives the CLI dispatch block, and injectable IO sinks (CliIO lineage) let `main()` be driven without touching real streams. No unit test instantiates `InteractiveMode`. Live interactive behavior (round-trip, clean Ctrl-C exit, transcript interop, extension-under-probe health) is proven exclusively by a separate scripted/manual E2E battery.

## CI/CD and Release

**GitHub Actions** (`.github/workflows/ci.yml`) runs on every push to `main` and every PR targeting `main`:

1. Checkout repository
2. Setup Node.js 22 with npm caching
3. `npm install`
4. `npm run lint` (Biome linting — fails on errors and warnings)
5. `npm run check` (TypeScript type checking)
6. `npm test` (Vitest test suite)

No release cycle, versioning tags, or packaging pipeline exists. The extension is consumed directly from the repository path (no npm publish).

## Local Environment Setup

- **Prerequisites:** Node.js 22+, npm. Optionally `acli` (Atlassian CLI) for Jira integration via the `pio-jira` skill.
- **pio executable requirements:** `pio/bin/pio` additionally requires Node with native type stripping (≥ 23.6; on by default in Node 24.x) and a disk-backed pi config under `~/.pi/agent` (auth/models/settings) for live probe sessions — model/thinking levels resolve from disk-backed defaults, nothing is hardcoded in `pio/src/`.
- **Commands:** `npm install` followed by `npm run check` and `npm test`
- **No external services required:** No database, message broker, or API dependencies for local development
- **Extension registration:** Add the extension directory to `.pi/config.yaml`:
  ```yaml
  extensions:
    - /path/to/pio-extension
  ```
  The pi framework reads `package.json`'s `pi.extensions` array to locate `./src/index.ts`.
- **Per-capability model config (optional):** Create `~/.pi/pio-config.yaml` to override models for specific capabilities:
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
  ```
  - **Guard config (optional):** The `guards` block in `~/.pi/pio-config.yaml` supports guard-level settings:
    - `turnThreshold` (`number`, default: 15) — number of turns before the session guard sends a refinement-loop nudge. Must be a positive integer; invalid values fall back to the default.
  - **Loop config (optional):** The `loop` block in `~/.pi/pio-config.yaml` configures the runtime loop engine:
    - `maxIterations` (`number`, default: 15) — global safety cap on iterations per step. Per-step `maxIterations` overrides this value. Resolution order: per-step > global config > built-in default (15).
  - **Workspace config (optional):** The `workspace` block in `~/.pi/pio-config.yaml` controls the pio runtime workspace directory:
    - `dir` (`string`, default: `~/.pi/pio`) — custom path for the pio workspace. Stores per-session loop engine state files at `<dir>/state/<sessionId>.json`.
