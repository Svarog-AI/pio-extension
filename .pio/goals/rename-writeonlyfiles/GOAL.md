# Rename `writeOnlyFiles` to `writeAllowlist` and Fix Allowlist Reset Bug

Rename the field `writeOnlyFiles` to `writeAllowlist` across the codebase, and fix a bug where the write allowlist is cleared every turn, blocking all writes to `.pio/` directories. The current name reads like a descriptive file property rather than an exclusive permission set, and the runtime reset prevents any actual writes from succeeding.

## Current State

### Naming

The write-allowlist mechanism restricts which files an agent may modify during a capability sub-session. When `writeOnlyFiles` is configured, any write tool (`write`, `edit`, `vscode_apply_workspace_edit`) targeting a file outside the list is blocked. This takes precedence over the read-only blocklist (`readOnlyFiles`).

The field `writeOnlyFiles` appears in 12 locations across 6 files:

- **`src/types.ts`** — Declared as an optional property in both `CapabilityConfig` and `StaticCapabilityConfig`. JSDoc reads: *"Files that MAY be written during this session (allowlist). When present, takes precedence over readOnlyFiles."*
- **`src/utils.ts`** — Propagated in `resolveCapabilityConfig` from the static config into the runtime `CapabilityConfig`.
- **`src/capabilities/validation.ts`** — Module-level variable `writeOnlyFilePaths` caches resolved absolute paths. Populated in the `resources_discover` handler from `config.writeOnlyFiles`. Used in the `tool_call` handler to enforce both the `.pio/` default-deny exemption and the general write-allowlist check.
- **`src/capabilities/create-goal.ts`** — Declares `writeOnlyFiles: ["GOAL.md"]`.
- **`src/capabilities/create-plan.ts`** — Declares `writeOnlyFiles: ["PLAN.md"]`.
- **`src/capabilities/evolve-plan.ts`** — Sets `config.writeOnlyFiles` dynamically based on the step being executed.
- **`src/capabilities/project-context.ts`** — Declares `writeOnlyFiles: [".pio/PROJECT.md"]`.

### Bug: Allowlist Reset on Every Turn

In `src/capabilities/validation.ts`, the `turn_start` handler resets `writeOnlyFilePaths = []` (alongside `warnedOnce = false`). This means:

1. During `resources_discover`, paths are resolved from relative config values to absolute paths and stored in `writeOnlyFilePaths`.
2. On `turn_start` (before each agent turn), the cache is wiped back to an empty array.
3. When any write tool call fires, the `.pio/` default-deny check (`tp.includes("/.pio/")`) blocks all writes inside `.pio/` because the allowlist is now empty and nothing matches.

The `warnedOnce = false` reset makes sense — it's a one-shot guard per round. But resetting the allowlist cache is incorrect: the set of allowed write targets should persist for the entire session lifetime, just like `readOnlyFilePaths` (which is not reset on turn start). This bug effectively prevents *all* capability sessions from writing to their intended output files when those files live inside `.pio/`, which is true for every goal-based capability.

## To-Be State

### Rename

Every occurrence of `writeOnlyFiles` is renamed to `writeAllowlist`. The module-level cache variable in `validation.ts` is renamed from `writeOnlyFilePaths` to `writeAllowlistPaths` for consistency.

Specific changes:

1. **`src/types.ts`** — Rename the property in both `CapabilityConfig` and `StaticCapabilityConfig`. Update JSDoc: *"Allowlist of files that may be written during this session. When present, takes precedence over readOnlyFiles."*
2. **`src/utils.ts`** — Rename the property reference in `resolveCapabilityConfig`.
3. **`src/capabilities/validation.ts`** — Rename the module variable and all references (`writeOnlyFilePaths` → `writeAllowlistPaths`, `config.writeOnlyFiles` → `config.writeAllowlist`). Update inline comments to use "allowlist" terminology.
4. **`src/capabilities/create-goal.ts`** — Rename property in `CAPABILITY_CONFIG`.
5. **`src/capabilities/create-plan.ts`** — Rename property in `CAPABILITY_CONFIG`.
6. **`src/capabilities/evolve-plan.ts`** — Rename the dynamic assignment (`config.writeAllowlist = [...]`).
7. **`src/capabilities/project-context.ts`** — Rename property in `CAPABILITY_CONFIG`.

### Bug Fix

Remove `writeOnlyFilePaths = [];` from the `turn_start` handler in `validation.ts`. The allowlist should be populated once during `resources_discover` and persist for the session's lifetime. Keep `warnedOnce = false` in `turn_start` — that reset is correct behavior.

This restores the intended behavior: when a capability declares allowed write targets (e.g., `writeAllowlist: ["GOAL.md"]`), those files are writable throughout the entire sub-session, including all turns after the first.

### Verification

- `npm run check` passes (no type errors).
- Every capability session can successfully write to its declared allowlist files inside `.pio/`.

No behavioral changes beyond the fix — this is a rename refactoring plus a bug correction with zero semantic impact on non-broken code paths.
