# Plan: Rename `writeOnlyFiles` to `writeAllowlist` and Fix Allowlist Reset Bug

Rename the `writeOnlyFiles` field to `writeAllowlist` across 6 source files (14 occurrences), rename the module-level cache variable, update comments/JSDoc, and remove the erroneous allowlist reset in the `turn_start` handler.

## Prerequisites

None.

## Steps

### Step 1: Rename `writeOnlyFiles` → `writeAllowlist` in type definitions and utils

**Description:** Update both `CapabilityConfig` and `StaticCapabilityConfig` interfaces in `src/types.ts` to use `writeAllowlist` instead of `writeOnlyFiles`. Update the JSDoc comment on `CapabilityConfig.writeAllowlist` to: *"Allowlist of files that may be written during this session. When present, takes precedence over readOnlyFiles."* Then update the corresponding property reference in `resolveCapabilityConfig` in `src/utils.ts` so it propagates `writeAllowlist` from static config into runtime config.

**Acceptance criteria:**
- [ ] `npm run check` passes (no type errors)
- [ ] `writeOnlyFiles` no longer appears anywhere in `src/types.ts` or `src/utils.ts`
- [ ] Both interfaces and the propagation in `resolveCapabilityConfig` use `writeAllowlist`

**Files affected:**
- `src/types.ts` — rename property in `CapabilityConfig` (line ~39) and `StaticCapabilityConfig` (line ~49), update JSDoc
- `src/utils.ts` — rename property reference in `resolveCapabilityConfig` (line ~139)

### Step 2: Rename module variable and fix allowlist reset bug in validation.ts

**Description:** In `src/capabilities/validation.ts`, rename the module-level cache variable from `writeOnlyFilePaths` to `writeAllowlistPaths`. Rename all references throughout the file — the declaration, population in `resources_discover`, usage in the `.pio/` default-deny check, the general write-allowlist check, and the error message string. Update the config type cast in `resources_discover` to reference `writeAllowlist` instead of `writeOnlyFiles`. Update inline comments to use "allowlist" terminology (e.g., comment above the variable declaration, comments near the allowlist checks).

Critically, remove the line `writeOnlyFilePaths = [];` from the `turn_start` handler. The `warnedOnce = false` reset should remain — only the allowlist cache reset is removed. This fixes the bug where writes to `.pio/` files are blocked after the first turn because the allowlist is wiped.

**Acceptance criteria:**
- [ ] `npm run check` passes (no type errors)
- [ ] `writeOnlyFilePaths` and `writeOnlyFiles` no longer appear anywhere in `src/capabilities/validation.ts`
- [ ] The `turn_start` handler resets `warnedOnce = false` but does NOT reset `writeAllowlistPaths`
- [ ] All references use `writeAllowlistPaths` and `config.writeAllowlist`

**Files affected:**
- `src/capabilities/validation.ts` — rename variable declaration (line ~25), rename in `resources_discover` handler (lines ~160, ~172-175), remove reset in `turn_start` (line ~185), rename in `tool_call` handler (lines ~234, ~241, ~260-261), update comments

### Step 3: Rename `writeOnlyFiles` in all capability CAPABILITY_CONFIG declarations

**Description:** Update the four capability files that declare or set `writeOnlyFiles` to use `writeAllowlist` instead. This is a straightforward find-and-rename in each file:

1. **create-goal.ts:** `CAPABILITY_CONFIG.writeOnlyFiles` → `CAPABILITY_CONFIG.writeAllowlist` (static declaration)
2. **create-plan.ts:** Same rename (static declaration alongside `readOnlyFiles`)
3. **evolve-plan.ts:** `config.writeOnlyFiles = [...]` → `config.writeAllowlist = [...]` (dynamic assignment in command handler)
4. **project-context.ts:** Same rename (static declaration)

**Acceptance criteria:**
- [ ] `npm run check` passes (no type errors)
- [ ] `writeOnlyFiles` no longer appears anywhere in these four files
- [ ] All four files now reference `writeAllowlist`

**Files affected:**
- `src/capabilities/create-goal.ts` — rename in CAPABILITY_CONFIG (line ~16)
- `src/capabilities/create-plan.ts` — rename in CAPABILITY_CONFIG (line ~17)
- `src/capabilities/evolve-plan.ts` — rename dynamic assignment (line ~175)
- `src/capabilities/project-context.ts` — rename in CAPABILITY_CONFIG (line ~14)

### Step 4: Final verification

**Description:** Confirm the rename is complete across the entire source tree and that the bug fix is correct. Run the type checker one final time and verify no stray references remain.

**Acceptance criteria:**
- [ ] `npm run check` passes (no type errors)
- [ ] `grep -rn "writeOnlyFiles\|writeOnlyFilePaths" src/ --include="*.ts"` returns zero results
- [ ] `grep -rn "writeAllowlist\|writeAllowlistPaths" src/ --include="*.ts"` confirms all expected renames are in place (should match the 14 locations from before)

**Files affected:**
- None (verification step only)

## Notes

- This is a pure rename + one-line bug fix. No behavioral changes beyond the fix itself.
- The `StaticCapabilityConfig` type is also re-exported from `utils.ts` for backward compatibility — since we're renaming the property everywhere it's used, this re-export is unaffected (it just exports the type alias).
- The `.pio/PROJECT.md` and other goal documents outside `src/` reference `writeOnlyFiles` in descriptive text, but those are documentation files managed by other goals — they are out of scope for this rename.
- Steps 1 and 2 can technically be done independently (types/utils vs. validation), but Step 3 depends on both since it references the renamed property. Ordering them sequentially keeps things simple.
