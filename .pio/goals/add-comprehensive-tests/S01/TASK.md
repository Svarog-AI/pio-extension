# Task: Configure Vitest with native ESM support

Install and configure Vitest as the test runner for this ESM-only TypeScript project, enabling subsequent steps to add actual tests.

## Context

The pio-extension project currently has zero test infrastructure — no test runner, no test files, no CI. The sole automated check is `npm run check` (`tsc --noEmit`). The project uses native ESM (`"type": "module"` in `package.json`), TypeScript 5.8+ with `"noEmit": true`, and `"moduleResolution": "bundler"`. Code runs as raw TypeScript via the pi framework's runtime — no transpilation or bundling step exists.

Vitest must be configured to handle TypeScript files natively (stripping types at runtime) without requiring a separate build step, and must work with native ESM imports. This is the foundation for all subsequent test steps.

## What to Build

### Install Vitest

Install `vitest` as a dev dependency. Use the latest stable version available via npm. The installation should produce an entry in `package.json` under `devDependencies`.

### Create `vitest.config.ts`

A new root-level configuration file that tells Vitest how to handle this project's TypeScript + ESM setup. Key requirements:

- **TypeScript support:** Use Vitest's built-in TypeScript stripping (no separate transpiler needed). With `"noEmit": true` in `tsconfig.json`, Vitest should strip types on-the-fly using esbuild or its native TS handling.
- **ESM compatibility:** The project uses `"type": "module"`. Vitest must run in ESM mode. Configure globals appropriately so tests can use `describe`/`it`/`expect` without explicit imports (conventional for most test suites).
- **Test directory:** Point Vitest at `__tests__/` as the test directory via `include` patterns.
- **Type checking alignment:** The config should not conflict with the existing `tsconfig.json` (`target: ES2022`, `module: ESNext`, `moduleResolution: bundler`, `strict: true`).

### Update `package.json` scripts

Add `"test": "vitest run"` to the `scripts` section. This runs Vitest in non-watch mode (suitable for CI). The existing `check`, `build`, and `clean` scripts must remain unchanged.

### Create a smoke test

Create `__tests__/smoke.test.ts` — a minimal test file with at least one passing test to verify the entire toolchain works: Vitest starts, resolves TypeScript + ESM correctly, discovers tests, and executes them successfully. The test should be trivially simple (e.g., asserting `1 + 1 === 2`) — its purpose is infrastructure validation, not feature testing.

### Code Components

No new functions or modules. This step is purely configuration and infrastructure:

| Artifact | Purpose |
|----------|---------|
| `vitest.config.ts` | Vitest runner configuration (ESM + TypeScript) |
| `__tests__/smoke.test.ts` | Proof-of-life test to verify the runner works |
| `package.json` changes | Add vitest dependency, add `test` script |

### Approach and Decisions

- **No transpilation bundler needed for basic TS:** Vitest 3+ has built-in TypeScript support via esbuild. Configure `deps.inline` or equivalent only if bare-module imports fail in tests.
- **Follow existing conventions:** The config file should use the same ESM import style as the rest of the project (`import ... from "..."`).
- **Keep it minimal:** Don't add coverage thresholds, reporters, or plugins yet — those can be added later when tests exist. Focus on getting the runner working.
- **`__tests__/` directory:** Create this at the project root (matching the convention documented in GOAL.md). This is distinct from `src/` — tests live alongside source, not inside it.

## Dependencies

None. This is Step 1 — no prior steps to depend on.

## Files Affected

- `package.json` — modified: add `vitest` dev dependency, add `"test"` script
- `vitest.config.ts` — created: Vitest configuration for native ESM + TypeScript
- `__tests__/smoke.test.ts` — created: basic smoke test

## Acceptance Criteria

- [ ] `vitest` is installed as a dev dependency (`npm install --save-dev vitest`)
- [ ] `vitest.config.ts` exists with ESM-compatible TypeScript configuration (no transpilation bundler)
- [ ] `package.json` has `"test": "vitest run"` in scripts
- [ ] A basic smoke test (`__tests__/smoke.test.ts` or similar) passes with `npm test`
- [ ] `npm run check` (type checking) still reports no errors

## Risks and Edge Cases

- **Vitest version compatibility:** Vitest 3+ changed configuration options significantly. Ensure the config format matches the installed version. Check if `globals`, `include`, `deps` options have changed naming or behavior.
- **Native ESM + node builtins:** Tests that import from `node:fs`, `node:path`, etc. must work without polyfills. Vitest's default Node.js environment should handle this, but verify.
- **`tsconfig.json` `"noEmit": true`:** Ensure Vitest doesn't fail because of the noEmit setting. Vitest should use its own TS stripping independently of the compiler's emit settings.
- **Module resolution:** The project uses `"moduleResolution": "bundler"` which allows omitting `.ts` extensions. Vitest must resolve these correctly in test files that import from `src/`.
- **`package.json` `"type": "module"`: All `.ts` files are treated as ES modules. The vitest config and test files must use ESM syntax (no `require`).
