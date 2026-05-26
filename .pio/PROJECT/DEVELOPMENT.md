# Development Guide

## Build and Test

- **Install:** `npm install` — installs devDependencies (`@earendil-works/pi-coding-agent`, `typebox`, `typescript`, `vitest`) and runtime dependency (`js-yaml`).
- **Type check:** `npm run check` — runs `tsc --noEmit`. This is the primary static analysis. Fails on type errors.
- **Tests:** `npm test` — runs all Vitest tests (`vitest run`). Tests are colocated `.test.ts` files under `src/`.
- **No build step:** The extension is consumed as raw TypeScript ESM modules by the pi framework. Scripts for `build` and `clean` are no-op stubs. No transpilation or bundling.

## Test Directory Convention

Tests are **colocated** alongside source files using the `*.test.ts` naming convention:
- `src/goal-state.ts` → `src/goal-state.test.ts`
- `src/fs-utils.ts` → `src/fs-utils.test.ts`
- `src/capabilities/evolve-plan.ts` → `src/capabilities/evolve-plan.test.ts`
- `src/guards/validation.ts` → `src/guards/validation.test.ts`

Configuration: `vitest.config.ts` — Node.js environment, global `describe/it/expect`, include pattern `src/**/*.test.ts`.

Tests use `fs.mkdtempSync()` for temp directories (not mocked filesystems). Most tests create real directory trees under `os.tmpdir()` and clean up in `afterEach`.

## CI/CD and Release

**GitHub Actions** (`.github/workflows/ci.yml`) runs on every push to `main` and every PR targeting `main`:

1. Checkout repository
2. Setup Node.js 22 with npm caching
3. `npm install`
4. `npm run check` (TypeScript type checking)
5. `npm test` (Vitest test suite)

No release cycle, versioning tags, or packaging pipeline exists. The extension is consumed directly from the repository path (no npm publish).

## Local Environment Setup

- **Prerequisites:** Node.js 22+, npm. Optionally `acli` (Atlassian CLI) for Jira integration via the `pio-jira` skill.
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
