# Summary: Add conditional transition support and sessionParams to utils.ts + types.ts

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/utils.ts` — Added `TransitionContext` interface, `CapabilityTransitionResolver` type, changed `CAPABILITY_TRANSITIONS` value type to `string | CapabilityTransitionResolver`, added `resolveNextCapability()` exported function, added `"review-code"` callback entry checking `S{NN}/APPROVED`, attached `sessionParams: params` in `resolveCapabilityConfig` return block
- `src/types.ts` — Added optional `sessionParams?: Record<string, unknown>` field to `CapabilityConfig` interface
- `src/capabilities/validation.ts` — Updated import from `CAPABILITY_TRANSITIONS` to `resolveNextCapability`, replaced direct map lookup with `resolveNextCapability(capability, { capability, workingDir: dir, params: { goalName } })` call

## Decisions Made
- **validation.ts minimal change:** Rather than waiting for Step 2 to fix the type error in validation.ts (caused by the CAPABILITY_TRANSITIONS type change), the direct map lookup was replaced with `resolveNextCapability` now. This is a one-line semantic equivalent — Step 2 will add sessionParams propagation on top of this.
- **Inline zero-padding:** The review-code callback duplicates `S${String(stepNumber).padStart(2, "0")}` rather than importing `stepFolderName()` from execute-task.ts, avoiding a cross-capability dependency in utils.ts.
- **Callback returns string (not undefined):** The `"review-code"` resolver is typed `(ctx): string =>` (never returns undefined) since it always has a fallback (`"execute-task"`).

## Test Coverage
- Test 1: `npm run check` passes — verified ✓
- Test 2: CAPABILITY_TRANSITIONS contains string entries + review-code callback — verified via grep ✓
- Test 3: `resolveNextCapability` is exported — verified via grep ✓
- Test 4: String narrowing (`typeof value === "string"`) present in resolver body — verified ✓
- Test 5: `TransitionContext` interface defined with correct fields — verified ✓
- Test 6: `CapabilityTransitionResolver` type defined and used — verified ✓
- Test 7: review-code callback references `APPROVED` and uses `fs.existsSync` — verified ✓
- Test 8: `sessionParams?: Record<string, unknown>` in CapabilityConfig (types.ts) — verified ✓
- Test 9: `sessionParams: params` in resolveCapabilityConfig return block — verified ✓
- Test 10: No regression in imports — confirmed by `npm run check` exit code 0 ✓
- Test 11: Callback returns `"evolve-plan"` (APPROVED) and `"execute-task"` (default) — verified ✓
