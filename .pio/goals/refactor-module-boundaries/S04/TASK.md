# Task: Extract `src/capability-config.ts` + update dependent tests

Extract capability config resolution from `src/utils.ts` into a new focused module `src/capability-config.ts`, maintaining backward compatibility via re-exports, and update all affected test files.

## Context

After Steps 1–3, `src/utils.ts` has been decomposed into three modules (`transitions.ts`, `queues.ts`, `fs-utils.ts`). The last remaining subsystem in `src/utils.ts` is the **capability config resolution** logic — `resolveCapabilityConfig()` plus the re-export of `StaticCapabilityConfig`. This function dynamically loads capability modules via `import('./capabilities/${cap}')` and assembles full `CapabilityConfig` objects. It depends on `resolveGoalDir` and `deriveSessionName` from `./fs-utils`. Extracting it completes the utils decomposition; after this step, `src/utils.ts` will contain only re-exports (to be deleted in Step 8).

## What to Build

### Create `src/capability-config.ts`

A new module at `src/capability-config.ts` containing:

- **Import**: `resolveGoalDir`, `deriveSessionName` from `./fs-utils`
- **Import type**: `CapabilityConfig`, `StaticCapabilityConfig` from `./types`
- **Export function**: `resolveCapabilityConfig(cwd: string, params?: Record<string, unknown>): Promise<CapabilityConfig | undefined>` — moved verbatim from `src/utils.ts`
- **Re-export type**: `StaticCapabilityConfig` from `./types` (for backward compatibility)

The function body is unchanged. It dynamically imports capability modules, reads `CAPABILITY_CONFIG`, derives `workingDir` from `goalName`, resolves step-dependent callbacks (`validation`, `readOnlyFiles`, `writeAllowlist`), and returns a complete `CapabilityConfig`.

### Update `src/utils.ts`

In `src/utils.ts`:

1. **Remove** the local import of `resolveGoalDir` and `deriveSessionName` from `./fs-utils` (no longer needed — they were only used by `resolveCapabilityConfig`)
2. **Remove** the `resolveCapabilityConfig` function definition entirely
3. **Add** re-export from `./capability-config`:
   ```
   export { resolveCapabilityConfig } from "./capability-config";
   export type { StaticCapabilityConfig } from "./capability-config";
   ```

After this change, `src/utils.ts` contains only re-exports from all four new modules. No original code remains.

### Update test files

Three test files currently import `resolveCapabilityConfig` from `../src/utils`:

1. **`__tests__/capability-config.test.ts`** (21 tests): Change `import { resolveCapabilityConfig } from "../src/utils"` → `from "../src/capability-config"`
2. **`__tests__/session-capability.test.ts`** (4 tests): Same import change
3. **`__tests__/types.test.ts`** (9 tests): Change the `resolveCapabilityConfig` import from `../src/utils` → `../src/capability-config`. The existing type imports (`PrepareSessionCallback`, `StaticCapabilityConfig`, `CapabilityConfig`) from `../src/types` remain unchanged

## Code Components

### `resolveCapabilityConfig()` — moved as-is

- **What it does**: Given a capability name in `params.capability`, dynamically imports the matching module under `./capabilities/`, reads its `CAPABILITY_CONFIG` export, and resolves all config fields (including step-dependent callbacks) into a complete `CapabilityConfig`.
- **Signature**: `(cwd: string, params?: Record<string, unknown>) => Promise<CapabilityConfig | undefined>`
- **Dependencies**: imports `resolveGoalDir` and `deriveSessionName` from `./fs-utils`; types from `./types`
- **No behavioral changes**: The function body is identical to its current form in `src/utils.ts`

## Approach and Decisions

- **Follow the extraction pattern from Steps 1–3**: Create new module, move code verbatim, add backward-compat re-exports in `utils.ts`, update test imports.
- **No new test files needed**: The existing `capability-config.test.ts` (21 tests) already provides comprehensive coverage of `resolveCapabilityConfig`. No behavioral change means no new tests required.
- **Import path convention**: Test files use relative paths (`../src/capability-config`) matching the established pattern from Steps 1–3 (`../src/transitions`, `../src/queues`, `../src/fs-utils`).
- **StaticCapabilityConfig re-export chain**: The new module re-exports `StaticCapabilityConfig` from `./types`. The old `utils.ts` re-exports it from `./capability-config`. This maintains the full backward-compat chain for any code importing from utils.

## Dependencies

- **Step 1 (transitions.ts)**: Required — must be completed first
- **Step 2 (queues.ts)**: Required — must be completed first
- **Step 3 (fs-utils.ts)**: Required — `src/capability-config.ts` imports `resolveGoalDir` and `deriveSessionName` from `./fs-utils`, which must exist

## Files Affected

- `src/capability-config.ts` — created: capability config resolution + StaticCapabilityConfig re-export
- `src/utils.ts` — modified: remove `resolveCapabilityConfig` definition and local imports; add re-exports from `./capability-config`
- `__tests__/capability-config.test.ts` — modified: import `resolveCapabilityConfig` from `../src/capability-config` instead of `../src/utils`
- `__tests__/session-capability.test.ts` — modified: import `resolveCapabilityConfig` from `../src/capability-config` instead of `../src/utils`
- `__tests__/types.test.ts` — modified: import `resolveCapabilityConfig` from `../src/capability-config` instead of `../src/utils`

## Acceptance Criteria

- [ ] `src/capability-config.ts` exists with `resolveCapabilityConfig` exported and `StaticCapabilityConfig` re-exported
- [ ] `src/capability-config.ts` imports `resolveGoalDir` and `deriveSessionName` from `./fs-utils`
- [ ] `src/utils.ts` re-exports from `./capability-config` (backward-compat during migration)
- [ ] `npm run check` reports no TypeScript errors
- [ ] All three test files pass individually:
  - `npm test __tests__/capability-config.test.ts` — 21 tests pass, imports from `../src/capability-config`
  - `npm test __tests__/session-capability.test.ts` — 4 tests pass, imports from `../src/capability-config`
  - `npm test __tests__/types.test.ts` — 9 tests pass, imports `resolveCapabilityConfig` from `../src/capability-config`

## Risks and Edge Cases

- **Dynamic import warning**: The Vite warning about `import("./capabilities/${cap}")` (missing file extension) will persist after the move. This is pre-existing behavior — do not attempt to fix it as part of this step.
- **ESM re-export chain**: After Step 4, `utils.ts` re-exports `StaticCapabilityConfig` from `./capability-config`, which in turn re-exports it from `./types`. This double-indirection is intentional for backward compatibility but should not cause issues — verify with `npm run check`.
- **No circular dependencies**: `capability-config.ts` → `fs-utils.ts` → no internal pio imports. Safe dependency direction confirmed by the plan's Notes section.
