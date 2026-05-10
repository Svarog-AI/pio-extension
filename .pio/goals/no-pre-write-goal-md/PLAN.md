# Plan: Prevent pre-writing of capability output files

Add a default-deny rule blocking all agent writes to `.pio/` across every session, with opt-in via the existing `writeOnlyFiles` allowlist per capability.

## Prerequisites

None.

## Steps

### Step 1: Add default-deny check for `.pio/` writes in `validation.ts`

**Description:** Insert a new first-tier check into the `tool_call` handler in `src/capabilities/validation.ts`. Before the existing allowlist and blocklist logic, intercept all write tools (`write`, `edit`, `vscode_apply_workspace_edit`) and check whether any target path contains `/.pio/` (after resolution to an absolute path). If it does:

- Permit the write if the resolved path is present in `writeOnlyFilePaths` (the session's allowlist, which may be empty for sessions that don't declare any).
- Block the write otherwise, with a reason explaining that `.pio/` files are managed by the pio workflow and should not be modified directly.

This check must run regardless of whether `writeOnlyFilePaths` or `readOnlyFilePaths` are configured — it applies to all sessions including general agent sessions. The existing allowlist and blocklist logic remain unchanged after this new tier; if a path passes the `.pio/` default-deny, the rest of the handler proceeds as before.

Key detail: the check must resolve paths with `path.resolve()` (as already done in the existing handler) before testing for the `/.pio/` substring, so relative paths like `../../my-project/.pio/goals/foo/bar.md` are also caught.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] The `tool_call` handler blocks a `write` tool targeting a `.pio/` path when `writeOnlyFilePaths` is empty (general session)
- [ ] The `tool_call` handler permits a `write` tool targeting a `.pio/` path when that exact resolved path is in `writeOnlyFilePaths`
- [ ] The check fires before the existing allowlist/blocklist logic (code ordering: new block appears at the top of the handler)

**Files affected:**
- `src/capabilities/validation.ts` — add default-deny tier at the beginning of the `tool_call` handler (before the existing write-allowlist check, around line 196)

### Step 2: Add `writeOnlyFiles` to `create-goal` CAPABILITY_CONFIG

**Description:** The create-goal session needs to write `GOAL.md` inside its goal workspace. Add `writeOnlyFiles: ["GOAL.md"]` to the static `CAPABILITY_CONFIG` in `src/capabilities/create-goal.ts`. This is resolved relative to `workingDir` (the goal directory) by `resolveCapabilityConfig` in `utils.ts`, and then validated against in `validation.ts`.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `CAPABILITY_CONFIG.writeOnlyFiles` equals `["GOAL.md"]` in create-goal.ts
- [ ] The config shape conforms to `StaticCapabilityConfig` (no new fields added)

**Files affected:**
- `src/capabilities/create-goal.ts` — add `writeOnlyFiles: ["GOAL.md"]` to CAPABILITY_CONFIG

### Step 3: Add `writeOnlyFiles` to `create-plan` CAPABILITY_CONFIG

**Description:** The create-plan session needs to write `PLAN.md` inside its goal workspace. Add `writeOnlyFiles: ["PLAN.md"]` to the static `CAPABILITY_CONFIG` in `src/capabilities/create-plan.ts`. This capability already has `readOnlyFiles: ["GOAL.md"]` — both fields coexist on the same config, and the allowlist takes precedence over the blocklist in the existing handler.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] `CAPABILITY_CONFIG.writeOnlyFiles` equals `["PLAN.md"]` in create-plan.ts
- [ ] Existing `readOnlyFiles: ["GOAL.md"]` is preserved unchanged

**Files affected:**
- `src/capabilities/create-plan.ts` — add `writeOnlyFiles: ["PLAN.md"]` to CAPABILITY_CONFIG

### Step 4: Add dynamic `writeOnlyFiles` to `evolve-plan` at runtime

**Description:** The evolve-plan session writes step spec files (`S{NN}/TASK.md`, `S{NN}/TEST.md`) inside the goal workspace. The step number is determined at runtime (either from params or by scanning for the next incomplete step), so the paths can't be static in `CAPABILITY_CONFIG`. Following the same pattern used by `execute-task` (which sets dynamic `readOnlyFiles` at line ~290 of the command handler), add a dynamic `writeOnlyFiles` override in the evolve-plan command handler.

In `handleEvolvePlan`, after resolving config via `resolveCapabilityConfig`, set `config.writeOnlyFiles` to:
```
[`${folderName}/TASK.md`, `${folderName}/TEST.md`]
```
where `folderName` is already computed via `stepFolderName(result.stepNumber)` in that handler.

The static `CAPABILITY_CONFIG` does not need a placeholder — it simply omits `writeOnlyFiles`, and the runtime override fills it in before `launchCapability` is called.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors
- [ ] The command handler sets `config.writeOnlyFiles` to the step-specific paths before calling `launchCapability`
- [ ] The pattern mirrors how `execute-task.ts` sets dynamic `readOnlyFiles` (same location in the handler flow: after config resolution, before launch)

**Files affected:**
- `src/capabilities/evolve-plan.ts` — add dynamic `config.writeOnlyFiles` assignment in `handleEvolvePlan` before `launchCapability`

### Step 5: Verify type consistency and default-deny behavior across all capabilities

**Description:** Final verification pass. Confirm that every capability's file protection is correct under the new default-deny semantics:

- **create-goal:** `writeOnlyFiles: ["GOAL.md"]` — can write GOAL.md, blocked from everything else in `.pio/`
- **create-plan:** `readOnlyFiles: ["GOAL.md"]` + `writeOnlyFiles: ["PLAN.md"]` — can write PLAN.md only
- **evolve-plan:** dynamic `writeOnlyFiles: [S{NN}/TASK.md, S{NN}/TEST.md]` — can write step specs only
- **execute-task:** `readOnlyFiles` for spec files (existing), no `writeOnlyFiles` — writes to source project files (outside `.pio/`), default-deny doesn't affect it
- **project-context:** `writeOnlyFiles: [".pio/PROJECT.md"]` — can write PROJECT.md, already correct
- **execute-plan:** no file protections declared — writes to source project files, default-deny blocks any accidental `.pio/` writes

Also verify that `StaticCapabilityConfig` in `src/types.ts` correctly allows the optional `writeOnlyFiles` field (it already does — no change needed).

Run `npm run check` to confirm the full extension type-checks cleanly.

**Acceptance criteria:**
- [ ] `npm run check` reports no TypeScript errors across the entire project
- [ ] No capability is missing `writeOnlyFiles` when it needs to write `.pio/` files (verify by inspection)
- [ ] Capabilities that only write source project files (execute-task, execute-plan) do not need `writeOnlyFiles` and remain unaffected

**Files affected:**
- No code changes expected — verification step only
- Reference: `src/capabilities/create-goal.ts`, `create-plan.ts`, `evolve-plan.ts`, `execute-task.ts`, `project-context.ts`, `execute-plan.ts`, `src/types.ts`, `src/capabilities/validation.ts`

## Notes

- The `/.pio/` substring check is intentionally simple. It matches any path segment `.pio` (e.g., `/project/.pio/goals/`, `/project/sub/.pio/`). This avoids edge cases with deeply nested project structures while being precise enough for the use case.
- The default-deny applies to tool-level writes only (`write`, `edit`, `vscode_apply_workspace_edit`). Direct Node.js `fs.writeFileSync` calls (e.g., `enqueueTask` in `utils.ts`) are unaffected — these are internal framework operations, not agent actions.
- Reads from `.pio/` remain unrestricted. Only writes are blocked by default.
- The existing allowlist logic (`writeOnlyFilePaths.length > 0`) already provides the correct override mechanism. The new check must integrate with it: if a path is in the allowlist, permit it even if it's under `.pio/`. If the allowlist is empty (general sessions), block all `.pio/` writes.
- `execute-plan` has no file protections and relies on default-deny to prevent accidental `.pio/` writes. If execute-plan needs to write step markers or summaries in a future iteration, it will need its own `writeOnlyFiles` declaration — that's out of scope for this goal.
