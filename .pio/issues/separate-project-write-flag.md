# Add separate flag to allow project file writes alongside .pio/ write allowlist

## Problem

The current `writeAllowlist` in `src/guards/validation.ts` is all-or-nothing: when present, it blocks **all** writes not in the list. This prevents `execute-task` from using a `writeAllowlist` to constrain `.pio/` writes, because it also needs to write arbitrary project source files and test files.

## Current Behavior

`writeAllowlist` has two effects in the `tool_call` handler:

1. **`.pio/` default-deny**: Blocks writes to `.pio/` outside the session's `workingDir`. Writes inside the goal workspace are permitted regardless of allowlist.
2. **Global write restriction**: When `writeAllowlistPaths.length > 0`, **every** write (including project files) must be in the allowlist. Writes to project source files are blocked.

## Encountered During Step 5 (implement-subgoals)

While implementing the execute-task capability for the subgoals goal, we needed to:
- Constrain `.pio/` writes (executor should only write TEST.md, SUMMARY.md, COMPLETED, BLOCKED, DECISIONS.md inside the goal workspace)
- Allow free editing of project source files (the whole point of execute-task)

We could not use `writeAllowlist` because it would block project file writes. The `.pio/` default-deny alone permits all writes inside the goal workspace but doesn't restrict what specific files can be written there.

## Proposed Solution

Add a new capability config flag (e.g., `allowProjectWrites?: boolean`) that, when `true`, exempts non-`.pio/` paths from the `writeAllowlist` check. The allowlist would then apply **only** to `.pio/` writes.

```typescript
// Pseudo-code for the new check logic
if (writeAllowlistPaths.length > 0) {
  for (const tp of targetPaths) {
    // If allowProjectWrites is true and this is NOT a .pio/ path, skip allowlist check
    if (config.allowProjectWrites && !tp.includes("/.pio/")) {
      continue;
    }
    if (!writeAllowlistPaths.includes(tp)) {
      return { block: true, /* ... */ };
    }
  }
}
```

## Files Affected

- `src/guards/validation.ts` — add `allowProjectWrites` check to `tool_call` handler
- `src/types.ts` — add `allowProjectWrites` to `CapabilityConfig` and `StaticCapabilityConfig`
- `src/capabilities/execute-task.ts` — add `writeAllowlist` with `allowProjectWrites: true`

## Benefits

- Execute-task can constrain `.pio/` writes (TEST.md, SUMMARY.md, markers) while freely editing project files
- Other capabilities (evolve-plan, create-plan) continue to use `writeAllowlist` unchanged
- Backward compatible — `allowProjectWrites` defaults to `false`

## Category

improvement

## Context

Discovered during S05 of implement-subgoals goal. Files: src/guards/validation.ts (writeAllowlist logic), src/types.ts (CapabilityConfig), src/capabilities/execute-task.ts (no writeAllowlist due to this limitation)
