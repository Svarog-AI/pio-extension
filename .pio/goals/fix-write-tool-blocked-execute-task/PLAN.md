# Plan: Fix write tool blocked in execute-task

Replace the blind `/.pio/` substring check in `validation.ts` with a session-aware policy that permits writes inside the session's own goal workspace directory.

## Prerequisites

None.

## Steps

### Step 1: Capture session context and refactor the `.pio/` default-deny check

**Description:** In `src/capabilities/validation.ts`, make the `.pio/` write block aware of the current session's working directory. Currently the check (`tp.includes("/.pio/")`) blocks all writes to any `.pio/` subdirectory unless the exact path is in `writeAllowlistPaths`. The fix introduces two new module-level variables (`workingDir`, `capabilityName`) populated at `resources_discover` time, then refactors the default-deny block to permit writes that fall inside the session's own `workingDir`.

Concrete changes:
1. Declare two new module-level variables: `workingDir` (string | undefined) and `capabilityName` (string | undefined), alongside the existing `validationRules`, `baseDir`, etc.
2. In the `resources_discover` handler, capture `config.capability` and `config.workingDir` from the pio-config entry into these new variables (resetting them alongside existing state).
3. Replace the default-deny `.pio/` block in the `tool_call` handler with logic that:
   - If the target path contains `/.pio/` AND is inside the session's own `workingDir` → permit (this is the fix)
   - If the target path contains `/.pio/` AND is in `writeAllowlistPaths` → permit (existing behavior preserved)
   - If the target path contains `/.pio/` AND neither condition is met → block (existing protection for other goals' directories and non-goal `.pio/` areas like `.pio/session-queue/`)

The helper `isInsideWorkingDir` can be a simple `path.startsWith()` check: resolve both paths consistently, then check if the target starts with `workingDir + path.sep` or equals `workingDir` exactly. This prevents an execute-task session for goal "A" from writing into `.pio/goals/B/`.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) passes with no type errors
- [ ] The new variables `workingDir` and `capabilityName` are declared at module level and populated in the `resources_discover` handler
- [ ] The `.pio/` default-deny block now permits writes inside the session's own `workingDir` (verified by code inspection of the conditional logic)
- [ ] The `.pio/` check still blocks writes to paths outside `workingDir` that contain `/.pio/` (e.g., `.pio/session-queue/`, other goal directories)
- [ ] When `writeAllowlistPaths` is non-empty, allowlist mode behavior is unchanged — the `.pio/` bypass still works for explicit allowlist entries

**Files affected:**
- `src/capabilities/validation.ts` — capture session context at `resources_discover`; refactor the `.pio/` default-deny block in the `tool_call` handler

### Step 2: Verify no breaking changes to existing capability configs

**Description:** Confirm that all existing capability configurations continue to work correctly after the validation.ts change. This is a verification step — no code changes are expected, but we need to ensure:
- **execute-task**: With `readOnlyFiles` only (no `writeAllowlist`), the agent can now write `S{NN}/SUMMARY.md`, `S{NN}/COMPLETED`, `S{NN}/BLOCKED` (inside its own goal dir) plus arbitrary source code outside `.pio/`.
- **review-code**: With explicit `writeAllowlist` (absolute paths for `REVIEW.md`, `APPROVED`), behavior is unchanged — allowlist mode takes precedence.
- **create-plan** / **create-goal**: With `writeAllowlist` containing relative paths (resolved to absolute in `resources_discover`), behavior is unchanged.
- **evolve-plan**: With `writeAllowlist` containing relative paths, behavior is unchanged.

This step involves reading each capability file and tracing through the logic mentally or with comments to verify correctness. If any issues are found, fix them in this step.

**Acceptance criteria:**
- [ ] Code review of each capability's config confirms no breaking changes: `execute-task.ts`, `review-code.ts`, `create-plan.ts`, `create-goal.ts`, `evolve-plan.ts`
- [ ] `npm run check` passes with no type errors
- [ ] No capability files needed modifications (if any did, document the fix in SUMMARY.md)

**Files affected:**
- `src/capabilities/execute-task.ts` — read-only verification
- `src/capabilities/review-code.ts` — read-only verification
- `src/capabilities/create-plan.ts` — read-only verification
- `src/capabilities/create-goal.ts` — read-only verification
- `src/capabilities/evolve-plan.ts` — read-only verification

## Notes

- **Path comparison edge case:** On Windows, `path.resolve` uses backslashes, but the `/.pio/` substring check uses forward slashes. The project runs on Linux (evidenced by tooling), so this is not a concern. If cross-platform support becomes needed later, normalize with `path.sep` or use `path.relative`.
- **`workingDir` is always under `.pio/goals/<name>/`:** All capability sessions set `workingDir` via `resolveGoalDir(cwd, name)` in `utils.ts`, which produces `{cwd}/.pio/goals/{name}`. This means a `startsWith(workingDir + path.sep)` check is sufficient to allow writes inside the session's goal directory while blocking writes to sibling goals.
- **No test suite exists:** Acceptance criteria rely on type checking (`npm run check`) and code inspection. No automated tests are created as part of this plan.
- **The `capabilityName` variable is captured but not strictly needed for the core fix:** It's included for completeness and potential future use (e.g., capability-specific policies). The current fix uses only `workingDir`.
