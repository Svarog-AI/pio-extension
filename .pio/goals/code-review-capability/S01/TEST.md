# Tests: Add conditional transition support and sessionParams to utils.ts + types.ts

## Programmatic Verification

### 1. Type check passes (baseline)

- **What:** `npm run check` completes with zero errors after changes
- **How:** Run `npm run check` in the project root (`/home/aleksj/git/pio-extension`)
- **Expected result:** Exit code 0, no output (tsc --noEmit produces no errors)

### 2. CAPABILITY_TRANSITIONS accepts string and function values

- **What:** The `CAPABILITY_TRANSITIONS` type signature allows both `string` and callable entries
- **How:** Run `grep -A6 'CAPABILITY_TRANSITIONS' src/utils.ts | head -10` and verify the map contains at least one string entry (e.g., `"create-goal": "create-plan"`) and one callback entry for `"review-code"` (shown as a function/arrow expression)
- **Expected result:** All four original string entries are present plus a `"review-code"` entry that is not a plain string literal

### 3. resolveNextCapability is exported

- **What:** The new resolver function is exported from utils.ts
- **How:** Run `grep 'export.*resolveNextCapability' src/utils.ts`
- **Expected result:** One match line containing `export` and `resolveNextCapability`

### 4. Existing string transitions resolve identically through resolveNextCapability

- **What:** Calling `resolveNextCapability("create-goal", ctx)` returns `"create-plan"` (the existing string value)
- **How:** This is verified by TypeScript compilation — the resolver must handle `typeof value === "string" ? value : value(ctx)`. Also verify with `grep -n 'typeof.*string' src/utils.ts` to find the narrowing check inside resolveNextCapability
- **Expected result:** The function body contains a `typeof` check that returns the string directly when the value is not a function

### 5. TransitionContext interface is defined and exported

- **What:** The `TransitionContext` interface exists in utils.ts with the correct shape
- **How:** Run `grep -A4 'interface TransitionContext' src/utils.ts`
- **Expected result:** Interface definition contains fields: `capability: string`, `workingDir: string`, `params?: Record<string, unknown>`

### 6. CapabilityTransitionResolver type is defined

- **What:** The resolver function type exists in utils.ts
- **How:** Run `grep 'CapabilityTransitionResolver' src/utils.ts`
- **Expected result:** At least two matches — the type definition and its usage in CAPABILITY_TRANSITIONS value type

### 7. review-code transition callback checks for APPROVED file

- **What:** The `"review-code"` entry is a function that checks `S{NN}/APPROVED` existence
- **How:** Run `grep -A10 '"review-code"' src/utils.ts` and verify the callback references `APPROVED` and uses `fs.existsSync`
- **Expected result:** The callback body contains a reference to `APPROVED` (the marker filename) and uses `fs.existsSync` or equivalent

### 8. CapabilityConfig has sessionParams field in types.ts

- **What:** `CapabilityConfig` interface includes the optional `sessionParams` field
- **How:** Run `grep -A1 'sessionParams' src/types.ts`
- **Expected result:** One match showing `sessionParams?: Record<string, unknown>` inside the CapabilityConfig interface

### 9. resolveCapabilityConfig stores sessionParams

- **What:** The return object in `resolveCapabilityConfig` includes `sessionParams: params`
- **How:** Run `grep -A2 'sessionParams' src/utils.ts` (looking at the resolveCapabilityConfig function body)
- **Expected result:** A line like `sessionParams: params` appears inside the return block of `resolveCapabilityConfig`

### 10. No regression in existing imports/references

- **What:** Files that import from utils.ts still compile correctly
- **How:** Run `npm run check` — this implicitly verifies all imports resolve correctly
- **Expected result:** Exit code 0 (same as test 1, but specifically validates backwards compatibility)

### 11. review-code callback returns correct values

- **What:** The callback returns `"evolve-plan"` when APPROVED exists and `"execute-task"` when it doesn't
- **How:** Inspect the source: `grep -A15 '"review-code"' src/utils.ts` and verify the conditional logic — presence of `evolve-plan` string literal and `execute-task` string literal in the callback body
- **Expected result:** Both `"evolve-plan"` and `"execute-task"` appear as return values within the review-code callback

## Manual Verification (if any)

### 12. Code review: resolver logic correctness

- **What:** The resolveNextCapability function correctly handles all three cases: string entry, callback entry, missing entry
- **How:** Read `src/utils.ts` lines around `resolveNextCapability` and trace: (a) undefined entry returns undefined, (b) string entry returns the string directly, (c) function entry calls the function with ctx and returns result
- **Expected result:** Logic matches the specification in TASK.md

## Test Order

1. Tests 5-6 (type definitions exist) — verify types are present before checking behavior
2. Test 2 (CAPABILITY_TRANSITIONS structure) — verify the map shape is correct
3. Tests 7, 11 (review-code callback logic) — verify conditional transition implementation
4. Test 3 (resolveNextCapability exported) — verify resolver function exists
5. Test 4 (backwards compatibility) — verify string entries resolve identically
6. Tests 8-9 (sessionParams propagation) — verify param storage
7. Tests 1, 10 (`npm run check`) — final type check validates everything together
