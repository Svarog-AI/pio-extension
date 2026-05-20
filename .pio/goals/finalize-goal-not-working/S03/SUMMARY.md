# Summary: Support explicit workingDir override in resolveCapabilityConfig

## Status
COMPLETED

## Files Created
- (none)

## Files Modified
- `src/capability-config.ts` — Added `params.workingDir` precedence check before `goalName`-based derivation. Three-way precedence: explicit `workingDir` > `goalName` via `resolveGoalDir` > `cwd` fallback. Empty string `workingDir` is treated as absent.
- `src/capability-config.test.ts` — Added new `describe` block with 4 test cases verifying the override behavior and backward compatibility.

## Files Deleted
- (none)

## Decisions Made
- Used the same defensive extraction pattern as existing params: `typeof params?.workingDir === "string" && params.workingDir` to guard against non-string and empty-string values.
- Implemented as a ternary chain rather than if/else to keep the change minimal (single logical block, same indentation level).
- No type changes needed — `params` is already `Record<string, unknown>`, so only runtime narrowing was required.

## Test Coverage
- 4 new test cases in `capability-config.test.ts`:
  1. `explicit workingDir overrides goalName-based derivation` — verifies highest-priority path
  2. `goalName-based derivation still works when workingDir is absent` — verifies backward compatibility
  3. `fallback to cwd when neither workingDir nor goalName is present` — verifies lowest-priority path
  4. `empty string workingDir does not override goalName derivation` — verifies edge case safety
- All 489 tests pass (485 existing + 4 new)
- `npm run check` (tsc --noEmit) passes with no errors
