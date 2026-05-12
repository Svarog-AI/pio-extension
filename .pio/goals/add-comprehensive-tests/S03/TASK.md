# Task: Export and test validation logic (`validation.test.ts`)

Write comprehensive tests for the pure validation functions in `src/capabilities/validation.ts`, exporting `extractGoalName` (currently private) so it can be tested in isolation.

## Context

The pio-extension has zero tests outside of what Steps 1 and 2 established (Vitest setup + utility function tests). `validation.ts` contains two pure functions — `validateOutputs(rules, baseDir)` which checks file existence against a validation rule, and `extractGoalName(workingDir)` which parses goal names from paths. Only `validateOutputs` is currently exported; `extractGoalName` is private. This step makes both testable in isolation using the existing Vitest infrastructure and temp-directory pattern established in `__tests__/utils.test.ts`.

## What to Build

### 1. Export `extractGoalName` from `src/capabilities/validation.ts`

The function currently has no `export` keyword. Add `export` so it can be imported by test code. This is a non-breaking change — no logic modifications, no behavior changes. The function signature remains:

```typescript
function extractGoalName(workingDir: string): string;
```

Also export the `ValidationResult` interface so tests can type-assert return values from `validateOutputs`.

### 2. Create `__tests__/validation.test.ts`

Write a comprehensive test file covering both `validateOutputs` and `extractGoalName`. Follow the established patterns from `__tests__/utils.test.ts`:

- Use `fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"))` for temp directories
- Clean up in `afterEach` with `fs.rmSync(tempDir, { recursive: true, force: true })`
- Use `describe` blocks per function, `it` blocks per scenario
- Import directly from `../src/capabilities/validation`

### Code Components

#### `validateOutputs` tests

Test the file-existence validation engine. Create temp directories with controlled file presence/absence to exercise all code paths:

- **All files present:** Given rules with 2+ files, create all of them in baseDir → `{ passed: true, missing: [] }`
- **All files missing:** Given rules with 2+ files, create none → `{ passed: false, missing: [all files] }`
- **Partial files missing:** Create some but not all → correct subset in `missing` array
- **Empty rules (`files: []`):** No files to check → `{ passed: true, missing: [] }`
- **Undefined rules.files:** `rules` object exists but `files` is undefined → `{ passed: true, missing: [] }` (the `|| []` fallback)

#### `extractGoalName` tests

Test the path-parsing logic. Cover all code branches:

- **Standard path:** `/repo/.pio/goals/my-feature/` → `"my-feature"`
- **Trailing slash variations:** With and without trailing slash — both extract correctly
- **Deeply nested path after goal name:** `/repo/.pio/goals/my-feature/S01/extra` → `"my-feature"` (stops at first separator after goals/)
- **No `/goals/` segment:** `/repo/.pio/session-queue/task.json` → `""`
- **Root-level paths:** `/.pio/goals/root-goal` → `"root-goal"`
- **Empty string input:** `""` → `""`

## Approach and Decisions

- **Follow `utils.test.ts` conventions:** Use the same temp-directory pattern, same cleanup approach, same describe/it structure. The fixture helper functions from utils tests are self-contained — don't extract shared helpers to a separate module yet.
- **Real filesystem over mocks:** Per the established convention, use actual `fs` operations on temp directories rather than mocking `fs`. This provides higher confidence in real behavior.
- **No logic changes to `validation.ts`:** The only source code change is adding `export` to `extractGoalName` and `ValidationResult`. Do not modify function bodies, add new functions, or change any behavior.

## Dependencies

- **Step 1 (Vitest setup):** Must be completed — Vitest must be installed and configured
- **Step 2 (utils tests):** Not strictly required but provides the test pattern to follow. The temp-directory helpers in `__tests__/utils.test.ts` serve as the reference implementation.

## Files Affected

- `src/capabilities/validation.ts` — modified: add `export` to `extractGoalName` function and `ValidationResult` interface (no logic changes)
- `__tests__/validation.test.ts` — new file: validation function tests (~12-15 tests)

## Acceptance Criteria

- [ ] `validateOutputs` and `extractGoalName` are exported from `src/capabilities/validation.ts`
- [ ] `npm test __tests__/validation.test.ts` passes with all tests green
- [ ] All four `validateOutputs` scenarios covered (all-present, all-missing, partial, empty rules)
- [ ] Path parsing edge cases covered for `extractGoalName` (standard, nested, no goals/, root-level)
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Circular imports:** `validation.ts` imports from `../types`, `./session-capability`, and `../utils`. Importing `extractGoalName` from the test file should not create cycles since test files are leaf consumers. If circular dependency issues arise, import only the specific function (not the whole module).
- **`ValidationResult` interface:** Currently private (`interface ValidationResult`). It must be exported alongside `extractGoalName` for tests to type-check against the return shape of `validateOutputs`.
- **Path separator differences on Windows:** `extractGoalName` uses `.split(path.sep)` after finding `/goals/`. On Windows, `path.sep` is `\`, so the split might behave differently. Tests should document actual behavior rather than enforcing cross-platform guarantees for this path-parsing function.
