# Task: Support explicit workingDir override in resolveCapabilityConfig

Add a precedence check in `resolveCapabilityConfig()` so that an explicit `params.workingDir` string overrides the default `goalName`-based directory derivation.

## Context

Step 2 of this goal updated `transitionEvolvePlan()` to return `workingDir: process.cwd()` alongside `goalName` and `goalDir` for the finalize-goal auto-transition. However, `resolveCapabilityConfig()` currently ignores `params.workingDir` — it always derives `workingDir = resolveGoalDir(cwd, goalName)` when `goalName` is present (line 38 of `src/capability-config.ts`). This means the explicit `workingDir` from Step 2's transition is discarded, and finalize-goal still resolves `.pio/PROJECT/*.md` relative to the goal workspace instead of the project root.

## What to Build

Modify the `workingDir` derivation logic in `resolveCapabilityConfig()` (`src/capability-config.ts`) to check for an explicit `params.workingDir` before applying the `goalName`-based fallback.

### Code Components

#### Precedence check in resolveCapabilityConfig

**Current code** (line 38 of `src/capability-config.ts`):
```typescript
const workingDir = goalName ? resolveGoalDir(cwd, goalName) : cwd;
```

**Required behavior:** Three-way precedence:
1. If `params.workingDir` is a non-empty string → use it directly (highest priority)
2. Else if `goalName` is a non-empty string → derive via `resolveGoalDir(cwd, goalName)` (existing behavior)
3. Else → fall back to `cwd` (existing behavior)

This is a single-line logic change. Extract `params.workingDir` using the same defensive pattern already established for other params:
```typescript
const explicitWorkingDir = typeof params?.workingDir === "string" ? params.workingDir : "";
```

Then use it in a ternary chain or if/else block that preserves backward compatibility.

### Approach and Decisions

- **Follow existing param extraction pattern:** The codebase uses `typeof params?.<field> === "string" ? params.<field> : ""` for defensive extraction (see `goalName` extraction on line 37). Apply the same pattern for `workingDir`.
- **Minimal change:** Only modify the `workingDir` derivation — do not change any other logic in `resolveCapabilityConfig()`. The rest of the function (callback resolution, initial message, session name) uses `workingDir` as-is and will automatically benefit.
- **No type changes needed:** `params` is already typed as `Record<string, unknown>`, so accessing `params.workingDir` requires only runtime type narrowing, not interface changes.

## Dependencies

- Step 1: Completed (goal name in initial message). Not directly required for this change but part of the overall fix chain.
- **Step 2:** Must be completed first. The explicit `workingDir` from `transitionEvolvePlan()` is what this precedence check will honor.

## Files Affected

- `src/capability-config.ts` — add explicit `params.workingDir` extraction and precedence check before the `goalName`-based derivation (modify line 38 area)

## Acceptance Criteria

- [ ] When params contain both `goalName` and `workingDir`, `resolveCapabilityConfig` uses the explicit `workingDir` value instead of deriving from `goalName`
- [ ] When only `goalName` is present (no explicit `workingDir`), behavior is unchanged — `workingDir` derives from `goalName` via `resolveGoalDir`
- [ ] When neither is present, behavior is unchanged — `workingDir` falls back to `cwd`
- [ ] Existing tests in `capability-config.test.ts` still pass (no regressions)
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- **Empty string workingDir:** If `params.workingDir` is an empty string `""`, it should NOT override — treat as absent. The ternary guard (`typeof === "string"`) alone won't catch this; the code should also check for non-empty length, or rely on downstream behavior (empty path would be clearly broken, so a length check adds safety).
- **Backward compatibility:** Existing callers that don't pass `workingDir` must see zero behavioral change. The existing test "derives workingDir from goalName" and "falls back to cwd when no goalName" must still pass unchanged.
