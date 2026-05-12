# Task: Add GitHub Actions CI workflow

Create a GitHub Actions workflow that automatically runs type checking and the full test suite on every push and pull request to `main`.

## Context

The project currently has zero CI/CD. All automated checks (`npm run check` for TypeScript, `npm test` for Vitest) are run only locally. After Steps 1–6, the test suite is fully configured with 122 passing tests across 6 files under `__tests__/`. Without a CI pipeline, nothing prevents broken code from reaching `main` — type errors or failing tests can go unnoticed until someone runs checks locally. This step closes that gap by adding automated verification on every push and pull request.

## What to Build

A single GitHub Actions workflow file (`.github/workflows/ci.yml`) that:

1. **Triggers** on `push` and `pull_request` events targeting the `main` branch
2. **Runs** on a recent Node.js LTS environment (22.x)
3. **Executes** three sequential steps:
   - Check out repository code (`actions/checkout@v4`)
   - Set up Node.js 22.x with caching (`actions/setup-node@v4`)
   - Install dependencies via `npm install`
4. **Verifies** by running `npm run check` (TypeScript type checking) followed by `npm test` (Vitest test suite)
5. **Fails the pipeline** if either command exits with a non-zero code

The workflow should be minimal — no matrix strategies, no artifact uploads, no deployment steps. Just install, type-check, and test.

### Code Components

No source code is written. The only artifact is a YAML configuration file. Key components:

- **`name:`** — Human-readable workflow name (e.g., "CI")
- **`on:`** — Trigger configuration for `push` and `pull_request` to `main`
- **`jobs.build.runs-on:`** — Runner image (e.g., `ubuntu-latest`)
- **`jobs.build.steps:`** — Ordered list of checkout, setup-node, npm install, npm run check, npm test

### Approach and Decisions

- **Node 22.x:** Use the current LTS version. The project uses `"type": "module"` (native ESM) and Vitest with `environment: "node"`, both of which require Node 18+. Node 22.x provides the most recent stable runtime.
- **`actions/checkout@v4` and `actions/setup-node@v4`:** Use v4 of both actions for stability and active maintenance.
- **Node cache:** Configure `setup-node` with `cache: "npm"` to speed up subsequent runs by caching `node_modules/`.
- **No matrix:** A single runner is sufficient — the project has no platform-specific behavior or multiple Node version requirements.
- **Sequential steps:** Type checking (`npm run check`) must pass before tests run. This catches type errors early and provides clearer failure messages (a type error is distinct from a test failure).

## Dependencies

- **Step 1 (Vitest configuration):** The `npm test` script must exist and work. Step 1 added `"test": "vitest run"` to `package.json`.
- **Steps 2–6 (test implementations):** The workflow executes the full suite — all prior steps contribute passing tests that must continue to pass in CI.

## Files Affected

- `.github/workflows/ci.yml` — created: GitHub Actions CI workflow definition

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` exists with valid GitHub Actions syntax
- [ ] Workflow triggers on `push` to `main` and `pull_request` to `main`
- [ ] Runs on a recent Node.js version (20.x or 22.x)
- [ ] Steps include: checkout, setup Node.js, `npm install`, `npm run check`, `npm test`
- [ ] Workflow file is syntactically valid YAML

## Risks and Edge Cases

- **YAML syntax errors:** GitHub Actions silently ignores malformed workflow files. Validate with a YAML linter or by checking the Actions tab after push. Use consistent indentation (2 spaces) throughout.
- **Node.js version compatibility:** Ensure `actions/setup-node` version and Node version string are compatible (e.g., `node-version: "22"` works with `setup-node@v4`).
- **npm cache key:** The default npm cache behavior should work without explicit key configuration, but verify the setup-node action uses `cache: "npm"` for correct lockfile-based caching.
