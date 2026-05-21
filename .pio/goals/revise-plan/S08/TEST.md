# Tests: Integrate evolve-plan marker writing

## Unit Tests

**File:** `src/capabilities/evolve-plan.test.ts`  
**Test runner:** Vitest  
**Existing test patterns:** Uses `resolveCapabilityConfig()` to invoke `resolveEvolveWriteAllowlist()` via the capability config system. Checks returned arrays with `toContain()`.

### Test cases for `resolveEvolveWriteAllowlist` — REVISE_PLAN_NEEDED inclusion

- `describe("resolveEvolveWriteAllowlist with REVISE_PLAN_NEEDED")`:
  - `"includes S01/REVISE_PLAN_NEEDED in write allowlist for stepNumber=1"` — Arrange: call `resolveCapabilityConfig` with `stepNumber: 1`. Assert: `writeAllowlist` contains `"S01/REVISE_PLAN_NEEDED"`.
  - `"includes S03/REVISE_PLAN_NEEDED in write allowlist for stepNumber=3"` — Arrange: call `resolveCapabilityConfig` with `stepNumber: 3`. Assert: `writeAllowlist` contains `"S03/REVISE_PLAN_NEEDED"`.
  - `"marker path uses correct step folder naming (zero-padded)"` — Arrange: stepNumber 12. Assert: allowlist contains `"S12/REVISE_PLAN_NEEDED"` (not `"S120/..."` or `"S1/..."`).

### Test cases for marker filename consistency

- `describe("REVISE_PLAN_NEEDED marker filename consistency")`:
  - `"marker filename in evolve-plan writeAllowlist matches revise-plan constant"` — Arrange: resolve evolve-plan config for step 2, extract the marker path from writeAllowlist. Extract just the basename (after last `/`). Assert: equals `"REVISE_PLAN_NEEDED"`. Cross-check against the `REVISE_PLAN_MARKER` constant imported from `./revise-plan` or a shared source.

## Programmatic Verification

- **What:** `resolveEvolveWriteAllowlist()` includes `REVISE_PLAN_NEEDED` in output
  - **How:** `grep -c 'REVISE_PLAN_NEEDED' src/capabilities/evolve-plan.ts`
  - **Expected result:** Count ≥ 1 (the constant reference in the allowlist logic)

- **What:** Marker filename string matches between evolve-plan.ts and revise-plan.ts
  - **How:** `grep 'REVISE_PLAN_NEEDED' src/capabilities/evolve-plan.ts src/capabilities/revise-plan.ts`
  - **Expected result:** Both files reference the exact same string `"REVISE_PLAN_NEEDED"`

- **What:** evolve-plan.md contains trigger conditions for writing the marker
  - **How:** `grep -c 'REVISE_PLAN_NEEDED' src/prompts/evolve-plan.md`
  - **Expected result:** Count ≥ 1 (instructions reference the marker)

- **What:** evolve-plan.md specifies YAML frontmatter format with `reason` and `decisions` fields
  - **How:** `grep -c 'reason:' src/prompts/evolve-plan.md && grep -c 'decisions:' src/prompts/evolve-plan.md`
  - **Expected result:** Both counts ≥ 1

- **What:** evolve-plan.md specifies when NOT to write the marker
  - **How:** `grep -ci 'not.*enqueu\|minor.*chang\|roughly.*same' src/prompts/evolve-plan.md` (case-insensitive, matching non-trigger criteria language)
  - **Expected result:** Count ≥ 1

- **What:** TypeScript compilation passes
  - **How:** `npx tsc --noEmit`
  - **Expected result:** Exit code 0, no errors

## Test Order

1. Unit tests (`npm test` — Vitest)
2. Programmatic verification (grep checks + TypeScript compilation)
