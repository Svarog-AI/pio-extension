# Fix: Session-aware .pio/ write check in validation.ts

Make the `/.pio/` path block in `validation.ts` context-aware so that capability sessions can legitimately write files inside their own goal workspace directory. Currently the blanket `tp.includes("/.pio/")` check blocks all writes to any `.pio/` subdirectory unless the exact absolute path appears in a session's `writeAllowlistPaths`, which forces workarounds (e.g., `bash` heredocs) or breaks execute-task sessions entirely.

## Current State

The `tool_call` handler in `src/capabilities/validation.ts` enforces file protection in three layers:

1. **Default-deny `.pio/` block** (always active): For every write tool (`write`, `edit`, `vscode_apply_workspace_edit`), the handler resolves target paths and checks if they contain `/.pio/`. If a path matches but is not in the session's `writeAllowlistPaths`, the call is blocked with: *"Writing to .pio/ files is not allowed."*

2. **Write allowlist** (when configured): If `writeAllowlistPaths` is non-empty, ALL writes must target an exact absolute path in the list. Any other file — including source code outside `.pio/` — is blocked. This means capabilities that need to write arbitrary source files (like execute-task) cannot safely use an allowlist.

3. **Read-only blocklist** (when no allowlist): Only blocks writes to files explicitly listed in `readOnlyFilePaths`. Source file writes are unrestricted, but the `.pio/` default-deny still applies from layer 1.

The session context is available via the pio-config entry: it carries `capability` name (e.g. `"execute-task"`), `workingDir` (the goal directory, e.g. `/repo/.pio/goals/my-feature`), and `sessionParams`. However, the `.pio/` check in layer 1 does not consult any of this — it's a blind substring match on all paths.

**How capabilities configure write protection today:**

- **execute-task** (`src/capabilities/execute-task.ts`): Sets `readOnlyFiles` for `TASK.md` and `TEST.md`. Does NOT set `writeAllowlist` (correctly, since the agent must write arbitrary source files). But layer 1 still blocks writes to `S{NN}/COMPLETED`, `S{NN}/BLOCKED`, `S{NN}/SUMMARY.md` — all inside `.pio/goals/<name>/`.
- **review-code** (`src/capabilities/review-code.ts`): Sets both `readOnlyFiles` AND `writeAllowlist`. The allowlist explicitly lists absolute paths for `REVIEW.md` and `APPROVED`. This works because review-code writes only specific `.pio/` files (not arbitrary source code).
- **evolve-plan, create-plan, create-goal**: Do not set write protection. They write specific files inside the goal directory without issue — the blanket `.pio/` block was introduced later and now affects them too.

**The problem in practice:** execute-task needs to write `S01/SUMMARY.md`, `S01/COMPLETED` etc. (inside `.pio/`) plus arbitrary source code (outside `.pio/`). The `.pio/` block prevents the marker files; using an allowlist would prevent the source files. Both are wrong.

## To-Be State

The `.pio/` default-deny check in `validation.ts` will be replaced with a session-aware policy:

1. **When no `writeAllowlist` is configured** (blocklist mode): The handler should resolve the session's `workingDir` and `capability` from the pio-config entry. Writes to files inside the session's own goal workspace directory (`workingDir`, which lives under `.pio/goals/<name>/`) are permitted. The default-deny block applies only to writes targeting OTHER goals' directories or non-goal `.pio/` areas (e.g., `.pio/session-queue/`, `.pio/PROJECT.md`).

2. **When a `writeAllowlist` IS configured** (allowlist mode): Current behavior is preserved — the explicit allowlist controls what's permitted, and the `.pio/` check is bypassed for paths in the list.

3. **The `readOnlyFiles` blocklist layer** remains unchanged as a final guard on top of whatever mode is active.

**Concrete changes:**

- **`src/capabilities/validation.ts`**: In the `tool_call` handler, replace the blind `tp.includes("/.pio/")` substring check with logic that: (a) determines whether the target path lives inside the session's own `workingDir`, and (b) blocks `.pio/` writes only when the target is outside the session's goal workspace AND not in the allowlist. The session config (`capability`, `workingDir`) is already available from the pio-config entry — just needs to be captured at `resources_discover` time alongside existing variables.

- **`src/capabilities/execute-task.ts`**: No changes needed to the command handler. Once validation.ts is fixed, execute-task's existing config (readOnlyFiles only, no writeAllowlist) will work correctly — the agent can write both source files and `.pio/goals/<name>/S{NN}/` marker files.

- **All other capabilities**: No breaking changes. review-code's explicit allowlist continues to work as before. create-plan, evolve-plan, create-goal sessions gain the ability to write inside their own goal directory (which they already needed).

**Files affected:**
- `src/capabilities/validation.ts` — refactored `.pio/` check logic in the `tool_call` handler
- No changes required to `execute-task.ts`, `review-code.ts`, or other capability files

**Acceptance criteria:**
- execute-task sessions can write `S{NN}/COMPLETED`, `S{NN}/BLOCKED`, `S{NN}/SUMMARY.md` using the `write` tool without errors
- execute-task sessions can still write arbitrary source code outside `.pio/`
- review-code sessions continue to work with their explicit `writeAllowlist`
- A session cannot write to another goal's directory (e.g., an execute-task session for goal "A" should not be able to modify files in `.pio/goals/B/`)
- `npm run check` passes with no type errors
