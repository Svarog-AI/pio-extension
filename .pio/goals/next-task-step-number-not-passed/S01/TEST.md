# Tests: Change `resolveNextCapability()` return type and fix review-code transitions

## Programmatic Verification

### 1. TypeScript compilation passes

- **What:** No type errors after changing `resolveNextCapability()` return type and transition callbacks
- **How:** `cd /home/aleksj/git/pio-extension && npx tsc --noEmit`
- **Expected result:** Exit code 0, no output (or only pre-existing warnings)

### 2. `TransitionResult` interface exists and is exported

- **What:** New interface `TransitionResult` with `{ capability: string; params?: Record<string, unknown> }` is defined and exported from `src/utils.ts`
- **How:** `grep -c 'export interface TransitionResult' src/utils.ts`
- **Expected result:** Output is `1`

### 3. `CapabilityTransitionResolver` accepts `TransitionResult`

- **What:** The type now allows callbacks to return `string | TransitionResult | undefined` instead of just `string | undefined`
- **How:** `grep 'CapabilityTransitionResolver' src/utils.ts`
- **Expected result:** Type definition includes `TransitionResult` in the return union

### 4. `resolveNextCapability()` returns `TransitionResult | undefined`

- **What:** The function signature declares `TransitionResult | undefined` as the return type
- **How:** `grep 'function resolveNextCapability' src/utils.ts`
- **Expected result:** Return type annotation includes `TransitionResult`

### 5. String transitions wrapped in object form

- **What:** Plain string entries like `"create-goal": "create-plan"` are automatically wrapped as `{ capability: value, params: ctx.params }` inside `resolveNextCapability()`
- **How:** Read `src/utils.ts`, inspect the `typeof value === "string"` branch inside `resolveNextCapability()`
- **Expected result:** Branch returns `{ capability: value, params: ctx.params }` (or equivalent)

### 6. Review-code callback returns incremented stepNumber on approval

- **What:** The `"review-code"` transition callback increments `stepNumber` when `APPROVED` file exists
- **How:** Read the `"review-code"` entry in `CAPABILITY_TRANSITIONS` within `src/utils.ts`. Verify the approval path computes `stepNumber + 1` and returns `{ capability: "evolve-plan", params: { ..., stepNumber: stepNumber + 1 } }`
- **Expected result:** Approval branch contains `stepNumber + 1` (or equivalent increment)

### 7. Review-code callback preserves stepNumber on rejection

- **What:** The rejection path returns the same `stepNumber` for re-execution
- **How:** Read the `"review-code"` entry — verify the non-approval branch returns `{ capability: "execute-task", params: { ..., stepNumber } }` (same value, not incremented)
- **Expected result:** Rejection branch passes through `stepNumber` unchanged

### 8. evolve-plan and execute-task transitions preserve stepNumber

- **What:** Both `"evolve-plan"` and `"execute-task"` entries are now callbacks that preserve `stepNumber` when present
- **How:** Read the `"evolve-plan"` and `"execute-task"` entries in `CAPABILITY_TRANSITIONS`. Verify they check for `ctx.params?.stepNumber` and return `{ capability: ..., params: { goalName, stepNumber } }` when available
- **Expected result:** Both entries contain a callback that reads `stepNumber` from ctx.params and includes it in returned params

### 9. No regressions in non-step-aware transitions

- **What:** `"create-goal": "create-plan"` and `"create-plan": "evolve-plan"` still resolve correctly
- **How:** Read the entries — they should remain as plain strings. The `resolveNextCapability()` wrapping logic handles them
- **Expected result:** Entries are still plain strings (not converted to callbacks)

### 10. Existing callers compile without errors

- **What:** Any code that imports `resolveNextCapability` from `src/utils.ts` must still compile
- **How:** After changes, run `npx tsc --noEmit` and specifically check for errors referencing `resolveNextCapability`
- **Expected result:** No type errors related to `resolveNextCapability` callers. Note: `src/capabilities/validation.ts` currently accesses `.capability` on the return value — if it was written as a string, this will break. The executor needs to update validation.ts too (per plan Step 4) OR ensure backward compat. **Important:** Per Step 1 scope, only utils.ts is modified. If validation.ts breaks, note that it's an expected consequence addressed in Step 4 — but the acceptance criteria says `npx tsc --noEmit` must pass. The executor should check if validation.ts already uses object destructuring or needs a minimal adjustment here.

## Manual Verification (if any)

### 11. Code review of `resolveNextCapability()` implementation

- **What:** The function correctly handles all three cases: plain string transitions, callback returning TransitionResult, and callback returning plain string
- **How:** Read the full implementation of `resolveNextCapability()` in `src/utils.ts`. Trace through each branch with mental test inputs:
  - Input: capability=`"create-goal"`, ctx.params=`{ goalName: "test" }` → Expected: `{ capability: "create-plan", params: { goalName: "test" } }`
  - Input: capability=`"review-code"`, ctx.params=`{ stepNumber: 3, goalName: "test" }`, APPROVED exists → Expected: `{ capability: "evolve-plan", params: { goalName: "test", stepNumber: 4 } }`
  - Input: capability=`"review-code"`, ctx.params=`{ stepNumber: 3, goalName: "test" }`, no APPROVED → Expected: `{ capability: "execute-task", params: { goalName: "test", stepNumber: 3 } }`

## Test Order

1. Run TypeScript compilation (Test 1) — if this fails, investigate before continuing
2. Verify structural changes (Tests 2–9) — confirm the code shape is correct
3. If validation.ts has compile errors, determine if a minimal fix belongs in Step 1 or if it's deferred to Step 4. The plan says Step 1 modifies only utils.ts, but if the return type change breaks callers, either: (a) keep backward compat (e.g., by having string-wrapped results also be strings), or (b) include the minimal caller update here
4. Manual code review (Test 11) to verify logic correctness
