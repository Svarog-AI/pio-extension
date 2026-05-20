# Tests: Add PLAN_FRONTMATTER_SCHEMA to frontmatter-schemas.ts

## Unit Tests

**File:** `src/frontmatter-schemas.test.ts` (new file, colocated alongside `frontmatter-schemas.ts`)
**Test runner:** Vitest (Node.js environment, globals enabled)

### Schema Validation Tests

- `describe("PLAN_FRONTMATTER_SCHEMA")`: Import `PLAN_FRONTMATTER_SCHEMA` from `./frontmatter-schemas` and `validateAndCoerce` from `./frontmatter`. Test the schema using `validateAndCoerce` (the established testing pattern from `frontmatter.test.ts`).

  - **it("accepts valid totalSteps as positive integer")**: Pass `{ totalSteps: 5 }` to `validateAndCoerce`. Expect `{ data: { totalSteps: 5 } }`, no error.
  - **it("accepts totalSteps at minimum boundary (1)")**: Pass `{ totalSteps: 1 }`. Expect success, `data.totalSteps === 1`.
  - **it("rejects missing totalSteps")**: Pass `{}`. Expect `{ error: string }` containing "totalSteps".
  - **it("rejects zero totalSteps")**: Pass `{ totalSteps: 0 }`. Expect error mentioning "totalSteps" and minimum constraint.
  - **it("rejects negative totalSteps")**: Pass `{ totalSteps: -1 }`. Expect error.
  - **it("rejects float totalSteps")**: Pass `{ totalSteps: 3.5 }`. Expect error (TypeBox `Integer` rejects non-integers).
  - **it("rejects string totalSteps")**: Pass `{ totalSteps: "5" }`. Expect error.
  - **it("rejects boolean totalSteps")**: Pass `{ totalSteps: true }`. Expect error.
  - **it("ignores extra fields not in schema")**: Pass `{ totalSteps: 3, extraField: "value" }`. Expect success with `data.totalSteps === 3` and no `extraField` in result.

### Type Export Test

- **it("exports PlanFrontmatter type usable by TypeScript")**: Assign `const value: PlanFrontmatter = { totalSteps: 1 }` to confirm the type is exported and accepts valid shapes. (TypeScript compilation check — this test verifies runtime presence; structural correctness is enforced by `tsc --noEmit`.)

### Module Boundary Test

- **it("is a leaf module importing only from typebox")**: Use a file-system check: read `src/frontmatter-schemas.ts`, assert all import statements reference `"typebox"` only (no relative imports like `./frontmatter`). This ensures the leaf-module invariant is maintained.

## Programmatic Verification

- **TypeScript compilation:**
  - **What:** No type errors after adding new exports
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no errors mentioning `frontmatter-schemas.ts`

- **Export presence:**
  - **What:** `PLAN_FRONTMATTER_SCHEMA` and `PlanFrontmatter` are exported
  - **How:** `grep -c 'export.*PLAN_FRONTMATTER_SCHEMA' src/frontmatter-schemas.ts` and `grep -c 'export type PlanFrontmatter' src/frontmatter-schemas.ts`
  - **Expected result:** Both return `1`

- **Leaf module check (no internal imports):**
  - **What:** `frontmatter-schemas.ts` imports only from `typebox`
  - **How:** `grep 'from "' src/frontmatter-schemas.ts | grep -v typebox`
  - **Expected result:** No output (empty result)

- **Full test suite passes:**
  - **What:** Existing tests still pass with the new schema added
  - **How:** `npm test`
  - **Expected result:** All tests pass, exit code 0

## Test Order

1. Unit tests (`npm test` — includes the new `frontmatter-schemas.test.ts`)
2. Programmatic verification (`npx tsc --noEmit`, grep checks)
