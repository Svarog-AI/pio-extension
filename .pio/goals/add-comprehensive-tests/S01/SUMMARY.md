# Summary: Configure Vitest with native ESM support

## Status
COMPLETED

## Files Created
- `vitest.config.ts` — Vitest configuration for native ESM + TypeScript. Uses `defineConfig` from `vitest/config`, sets Node.js environment, enables globals, and includes `__tests__/**/*.test.ts` patterns.
- `__tests__/smoke.test.ts` — Smoke test verifying the entire toolchain works: basic arithmetic assertion and ESM import resolution (imports `stepFolderName` from `src/utils`).

## Files Modified
- `package.json` — Added `vitest` (^4.1.6) as a dev dependency. Added `"test": "vitest run"` to scripts section.

## Files Deleted
- (none)

## Decisions Made
- **Vitest 4.x:** Installed the latest stable Vitest (4.1.6). Configuration uses `defineConfig` from `vitest/config`, which is the standard API for Vitest 4.
- **No transpilation bundler needed:** Vitest's built-in TypeScript handling via esbuild works out of the box with `"noEmit": true`. No additional plugins required.
- **Glob patterns:** Used both `__tests__/**/*.test.ts` and `__tests__/*.test.ts` to ensure files directly in `__tests__/` are discovered (Vitest 4 glob matching requires explicit single-level pattern).
- **ESM is automatic:** With `"type": "module"` in `package.json`, Vitest runs in ESM mode by default. No special configuration needed beyond setting the Node.js environment.

## Test Coverage
- `smoke.test.ts` contains 2 passing tests:
  - `adds numbers correctly` — proves basic test execution
  - `resolves ESM imports` — imports `stepFolderName` from `src/utils` and verifies correct output for S01, S09, S10. Proves Vitest resolves TypeScript + ESM imports from `src/` correctly.

## Verification Results
- ✅ `vitest` in `devDependencies`: PASS
- ✅ `"test": "vitest run"` in scripts: PASS
- ✅ `vitest.config.ts` exists: PASS
- ✅ `npm test` exits 0 with all tests passing (2/2): PASS
- ✅ `npm run check` exits 0 with no type errors: PASS
- ✅ `__tests__/smoke.test.ts` exists and is non-empty: PASS
