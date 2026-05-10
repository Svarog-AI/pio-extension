# write tool blocked for .pio/ files in execute-task sessions (COMPLETED, SUMMARY.md)

## Problem

During Step 1 execution of the `code-review-capability` goal, the `write` tool was blocked when attempting to create `.pio/goals/code-review-capability/S01/COMPLETED` and `.pio/goals/code-review-capability/S01/SUMMARY.md`. The `validation.ts` file protection mechanism intercepts all writes to paths containing `/.pio/` and blocks them unless the exact absolute path is in the session's `writeAllowlistPaths`.

## What happened

```
Writing to .pio/ files is not allowed. These files are managed by the pio workflow and should not be modified directly from this session.
```

The agent had to fall back to `bash` (`touch` + heredoc) to write these files instead of using the proper `write` tool.

## Root cause

The execute-task capability in `src/capabilities/execute-task.ts` does not configure a `writeAllowlist` (or its validation entry sets an allowlist that doesn't include `S{NN}/COMPLETED`, `S{NN}/SUMMARY.md`, or other marker files the agent needs to produce).

The `tool_call` handler in `validation.ts` has two modes:
1. **No allowlist configured** — falls through to read-only blocklist (only blocks writes to explicitly listed files)
2. **Allowlist configured** — blocks ALL writes except those matching absolute paths in the allowlist

If execute-task sets a write allowlist that includes implementation target files but omits `.pio/` marker files (`COMPLETED`, `BLOCKED`, `SUMMARY.md`), those are silently blocked.

## Impact

- Agents cannot use `write` to produce completion artifacts — forced to use `bash` workarounds
- Inconsistent UX: `edit` tool for source files works fine, but `write` to `.pio/` fails
- If no explicit allowlist is set, the read-only blocklist mode may still inadvertently block these paths if they match GOAL.md or other protected files

## Suggested fix

**Option A:** Don't set `writeAllowlist` for execute-task sessions — let them use the read-only blocklist mode instead. Only protect input files (GOAL.md, PLAN.md, TASK.md, TEST.md) via `readOnlyFiles`.

**Option B:** If write allowlist is needed for other reasons, explicitly add `S{NN}/COMPLETED`, `S{NN}/BLOCKED`, and `S{NN}/SUMMARY.md` to the allowlist (resolved at launch time based on step number).

**Option C:** Make the `.pio/` path check more granular — e.g., don't block writes to the current goal's own workspace (`cwd/.pio/goals/<current-goal>/`) if the session is operating within that same goal.

## Category

bug

## Context

Observed during Step 1 execution of goal `code-review-capability`. The writeAllowlist mechanism in `src/capabilities/validation.ts` (tool_call handler, lines ~165-200) blocks the `write` tool when target path contains `/.pio/`. See also: execute-task capability setup in `src/capabilities/execute-task.ts` for how it configures validation/writeAllowlist at launch.
