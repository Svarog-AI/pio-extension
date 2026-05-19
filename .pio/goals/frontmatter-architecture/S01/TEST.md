# Tests: Create shared frontmatter parsing module (`src/frontmatter.ts`)

## Unit Tests

**File:** `src/frontmatter.test.ts` (colocated alongside `src/frontmatter.ts`, following the project convention documented in `.pio/PROJECT/DEVELOPMENT.md`)

**Test runner:** Vitest 4.x — Node.js environment, global `describe/it/expect`

### `extractFrontmatter`

```
describe('extractFrontmatter'):
```

- **Valid frontmatter with multiple fields** — given a file starting with `---\n`, containing key-value YAML pairs, and closing with `\n---\n` followed by body text: returns a `Record<string, unknown>` with all keys parsed correctly (string values remain strings, integer values are numbers).
- **Minimal valid frontmatter** — single key-value pair between delimiters (`---\nkey: value\n---\nbody`): returns object `{ key: "value" }`.
- **Returns null for missing file** — given a path that does not exist on disk: returns `null` (readFileSync throws, caught by try/catch).
- **Returns null when file does not start with `---`** — given a file starting with body text (`# Title\n...`): returns `null`.
- **Returns null when file starts with `---` but no closing delimiter** — given `---\nkey: value` with no `\n---\n`: returns `null`.
- **Returns null for malformed YAML between delimiters** — given valid delimiters but broken YAML (`---\nkey: [unclosed\n---\nbody`): returns `null` (js-yaml.load throws).
- **Returns null when YAML parses to null** — empty frontmatter (`---\n---\nbody`) or explicit `~`: js-yaml loads as `null`, which is not a plain object, so returns `null`.
- **Returns null for leading whitespace before `---`** — given `\n---\nkey: value\n---\nbody`: frontmatter must be at position 0, returns `null`.
- **Integer values parsed correctly from YAML** — `---\ncount: 42\n---\nbody`: returns `{ count: 42 }` (number, not string).
- **Boolean values preserved** — `---\nenabled: true\n---\nbody`: returns `{ enabled: true }` (boolean).

### `validateAndCoerce`

```
describe('validateAndCoerce'):
```

- **Valid schema with all field types passes** — given raw data matching a schema with `"string"`, `"integer"`, and `"enum"` fields, all correct types and values: returns `{ data }` with coerced typed object.
- **Missing required field returns error** — schema declares field `decision` but raw data omits it: returns `{ error }` string mentioning the missing field name.
- **Wrong type (string expected, number given)** — schema expects `"string"` for field `name`, raw has a number: returns `{ error }` identifying the type mismatch.
- **Wrong type (integer expected, string given)** — schema expects `"integer"`, raw has `"5"` (string): returns `{ error }`.
- **Float fails integer check** — schema expects `"integer"`, raw has `1.5`: returns `{ error }` because `Number.isInteger(1.5)` is false.
- **Enum value not in allowed list** — schema has `values: ["APPROVED", "REJECTED"]`, raw has `"PENDING"`: returns `{ error }` listing allowed values and the found value.
- **Enum value matches one of allowed values** — schema has `values: ["A", "B"]`, raw has `"B"`: passes successfully.
- **Integer below min threshold** — schema has `type: "integer", min: 0`, raw has `-1`: returns `{ error }` stating the minimum constraint.
- **Integer equal to min passes** — schema has `min: 0`, raw has `0`: passes successfully (boundary).
- **Extra fields in raw data are ignored** — raw has keys not declared in schema: they do not cause errors; only schema-declared fields are validated. The returned `data` contains only the coerced schema fields.
- **Empty schema (no fields) always succeeds** — given `fields: []`: returns `{ data: {} }` regardless of raw content.
- **Error for boolean value where string is expected** — YAML parsed `true` as a boolean, schema expects `"string"` type: returns `{ error }`.

## Integration Tests

None required for Step 1. The module is pure utility with no cross-module dependencies or filesystem interactions beyond the single-file read in `extractFrontmatter` (already tested at the unit level).

## Programmatic Verification

- **TypeScript compilation:** Run `npx tsc --noEmit`. Expected: exits 0, no errors. Verifies types are correct and no circular dependencies.
- **Full test suite:** Run `npx vitest run`. Expected: all existing tests pass + new `src/frontmatter.test.ts` tests pass. No regressions in other test files.

## Test Order

1. Unit tests (`src/frontmatter.test.ts`) — cover both `extractFrontmatter` and `validateAndCoerce` independently
2. Programmatic verification — `npx tsc --noEmit` followed by `npx vitest run` to confirm no regressions
