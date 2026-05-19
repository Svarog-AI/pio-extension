# Summary: Create shared frontmatter parsing module (`src/frontmatter.ts`)

## Status
COMPLETED

## Files Created
- `src/frontmatter.ts` — new shared module: YAML extraction from files (`extractFrontmatter`) and schema-based validation/coercion (`validateAndCoerce`). Exports `OutputField`, `OutputSchema`, and `CoerceResult` types. Generic — no capability-specific logic.
- `src/frontmatter.test.ts` — 22 unit tests covering both public functions: 10 tests for `extractFrontmatter` (valid frontmatter, missing file, no delimiters, malformed YAML, null YAML, leading whitespace, integers, booleans) and 12 tests for `validateAndCoerce` (all field types, missing fields, wrong types, enum validation, min constraints, extra fields, empty schema, boolean-as-string).

## Files Modified
- (none)

## Files Deleted
- (none)

## Decisions Made
- `extractFrontmatter` uses `firstDelimiter = 4` (length of `"---\n"`) to slice content, matching the existing `parseReviewFrontmatter` logic in `validation.ts` (which used `3` but then searched `rest` from position 3 — equivalent behavior).
- `validateAndCoerce` stops at the first validation failure — no error collection. Error messages identify the field name and what went wrong.
- Extra fields in raw data are silently ignored (not copied to output). Only schema-declared fields appear in the returned `data`.
- Array results from YAML are treated as non-object and return `null` from `extractFrontmatter` (frontmatter is expected to be key-value pairs, not arrays).

## Test Coverage
- 22 unit tests in `src/frontmatter.test.ts` covering both public functions
- All tests verified against real temp directories (`fs.mkdtempSync`)
- Full test suite: 349 tests pass across 15 test files with no regressions
- TypeScript compilation: `npx tsc --noEmit` passes with no errors
