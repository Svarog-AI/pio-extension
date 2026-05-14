# Tests: Extract `src/fs-utils.ts` + update dependent tests

This step is a structural refactor — no new behavior is introduced, so no new test files are created. The existing tests in `__tests__/utils.test.ts` and `__tests__/step-discovery.test.ts` verify all extracted functions. The work consists of updating import paths and confirming all assertions still pass.

**Test runner:** Vitest (`npm test`)
**Test file placement:** Existing tests under `__tests__/` — no new test files created.

## Unit Tests

### `__tests__/utils.test.ts` (existing, imports updated)

After this step, the fs-utils symbols are imported from `../src/fs-utils` instead of `../src/utils`. The following describe blocks exercise every extracted function:

- **`describe("resolveGoalDir(cwd, name)")`** — 4 tests
  - Builds correct path for normal names (`/tmp/proj` + `my-feature` → `/tmp/proj/.pio/goals/my-feature`)
  - Handles names with hyphens and underscores
  - Handles names with dots
  - Uses `path.join` (platform-independent separators)

- **`describe("goalExists(goalDir)")`** — 3 tests
  - Returns `true` for existing directory (creates temp dir, asserts existence)
  - Returns `false` for non-existent path
  - Returns `true` for a file (not directory) — documents current `fs.existsSync` behavior

- **`describe("findIssuePath(cwd, identifier)")`** — 5 tests
  - Resolves absolute path when file exists
  - Returns `undefined` for non-existent absolute path
  - Resolves exact filename (`my-issue.md`)
  - Appends `.md` for bare slug (`my-issue` → `my-issue.md`)
  - Returns `undefined` for non-existent slug

- **`describe("readIssue(cwd, identifier)")`** — 3 tests
  - Returns file contents for existing issue
  - Returns `undefined` for missing issue
  - Reads multiline content correctly (preserves `\n`)

- **`describe("deriveSessionName(goalName, capability, stepNumber?)")`** — 5 tests
  - Empty goalName returns capability only
  - Undefined goalName returns capability only (uses `@ts-expect-error`)
  - Goal + capability (no step) returns combined name (`"my-feature create-plan"`)
  - All three params include step number (`"my-feature execute-task s3"`)
  - Step number zero includes `s0`

- **`describe("stepFolderName(stepNumber)")`** — 3 tests
  - Zero-pads single digits (1→S01, 5→S05, 9→S09)
  - No extra padding for two-digit numbers (10→S10, 25→S25, 100→S100)
  - Edge case — zero (0→S00)

- **`describe("discoverNextStep(goalDir)")`** — 6 tests
  - Empty directory returns 1
  - Single complete step returns 2
  - Multiple sequential complete steps return N+1
  - Incomplete step (missing TEST.md) is not counted as complete
  - Scans stops at first missing folder (gap detection)
  - Step with COMPLETED marker still counts if it has both spec files

**Import change:** `resolveGoalDir`, `goalExists`, `findIssuePath`, `readIssue`, `deriveSessionName`, `stepFolderName`, `discoverNextStep` → all from `"../src/fs-utils"` instead of `"../src/utils"`.

### `__tests__/step-discovery.test.ts` (existing, imports updated)

Tests step-related functions from capability files plus `stepFolderName`:

- **`describe("isStepReady(goalDir, stepNumber)")`** — 6 tests (imports unchanged — from capability files)
- **`describe("isStepReviewable(goalDir, stepNumber)")`** — 5 tests (imports unchanged — from capability files)
- **`describe("findMostRecentCompletedStep(goalDir)")`** — 6 tests (imports unchanged — from capability files)
- **`describe("stepFolderName")`** — 2 tests

**Import change:** `stepFolderName` → from `"../src/fs-utils"` instead of `"../src/utils"`. This reflects the decision that `stepFolderName` lives in `fs-utils.ts`.

## Programmatic Verification

| What | How | Expected result |
|------|-----|-----------------|
| TypeScript compiles cleanly | `npm run check` | Exit code 0, no errors |
| All tests pass (full suite) | `npm test` | All ~216 tests pass across 14 files |
| fs-utils symbols exported correctly | `grep -c 'export function' src/fs-utils.ts` | Count matches: 8 function exports (`resolveGoalDir`, `goalExists`, `issuesDir`, `findIssuePath`, `readIssue`, `stepFolderName`, `discoverNextStep`, `deriveSessionName`) |
| fs-utils has no internal pio imports | `grep 'from "./' src/fs-utils.ts` | No matches (only `node:` built-ins) |
| transitions.ts imports from fs-utils | `grep 'stepFolderName' src/transitions.ts` | Import line contains `from "./fs-utils"` (not `from "./utils"`) |
| No definitions remain in utils.ts | `grep -n 'export function resolveGoalDir\|export function stepFolderName\|export function discoverNextStep' src/utils.ts` | No matches (only re-export lines should exist) |
| Re-exports present in utils.ts | `grep 'fs-utils' src/utils.ts` | Line contains `export { ... } from "./fs-utils"` including `stepFolderName` |

## Test Order

1. Write `src/fs-utils.ts` with all extracted functions (including `stepFolderName`)
2. Update `src/transitions.ts` — change `import { stepFolderName } from "./utils"` to `from "./fs-utils"`
3. Update `src/utils.ts` — add re-exports from `./fs-utils` (including `stepFolderName`), remove definitions
4. Run `npm run check` — verify TypeScript compiles with new module structure
5. Update `__tests__/utils.test.ts` import paths (`../src/fs-utils`)
6. Update `__tests__/step-discovery.test.ts` import path (`stepFolderName` from `../src/fs-utils`)
7. Run `npm test __tests__/utils.test.ts` — verify fs-utils tests pass with new imports
8. Run `npm test __tests__/step-discovery.test.ts` — verify step discovery tests pass
9. Run `npm test` — verify full suite passes (no regressions)
