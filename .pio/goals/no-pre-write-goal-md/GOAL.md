# Prevent pre-writing of capability output files

Block agents from writing any file inside `.pio/` by default — across all sessions. Capabilities that need to write `.pio/` files opt in via the existing `writeOnlyFiles` config, which already provides allowlist semantics. This makes the workflow self-enforcing: an agent can't accidentally (or deliberately) shortcut a capability by writing its output file from the wrong session.

## Current State

**File protections are per-capability and opt-in.** The `tool_call` handler in `src/capabilities/validation.ts` enforces `readOnlyFiles` and `writeOnlyFiles` at runtime:

- When `writeOnlyFiles` is set for a session, only those absolute paths may be written. All other writes (including to `.pio/`) are blocked.
- When neither list is configured, **there is no protection at all** — any file can be written by any tool (`write`, `edit`, `vscode_apply_workspace_edit`).

This means:
- `project-context.ts` already uses `writeOnlyFiles: [".pio/PROJECT.md"]` — its sub-session can only write that one file.
- `create-plan.ts` uses `readOnlyFiles: ["GOAL.md"]` to protect input, but has no protection for outputs or against writing arbitrary `.pio/` files from outside the session.
- `execute-task.ts` sets dynamic `readOnlyFiles` at runtime (line ~290) to protect step spec files, but has no output write restrictions.
- `create-goal.ts` and `evolve-plan.ts` have **no file protections at all** — neither readOnly nor writeOnly.

**There is no global protection.** A general agent session (not launched via a capability sub-session) can freely read and write any `.pio/` file. This is the root cause of the issue: after calling `pio_create_goal`, nothing stops the agent from writing GOAL.md itself instead of letting the Goal Definition Assistant do it in its own sub-session.

**Key files:**
- `src/capabilities/validation.ts` — `tool_call` handler (lines ~196–265). This is where file protections are enforced. Currently: if neither list is set, all writes are allowed.
- `src/capabilities/session-capability.ts` — loads config from `pio-config` custom entry during `resources_discover`, populates `readOnlyFilePaths` / `writeOnlyFilePaths`.
- `src/utils.ts` — `resolveCapabilityConfig` resolves per-capability file protections from `CAPABILITY_CONFIG`.
- `src/types.ts` — `StaticCapabilityConfig` defines the `readOnlyFiles`/`writeOnlyFiles` fields.

## To-Be State

### Default-deny for `.pio/` writes in all sessions

The `tool_call` handler in `validation.ts` will gain a new first-tier check that runs **before** the existing allowlist/blocklist logic:

1. For any write tool (`write`, `edit`, `vscode_apply_workspace_edit`), resolve each target path.
2. If the resolved path contains `/\.pio/` (i.e., targets any file inside the `.pio/` directory), **block it by default** with a reason explaining that `.pio/` files are managed by the pio workflow and should not be modified directly.
3. This check applies to **all sessions**, including general agent sessions and capability sub-sessions.

### Capability opt-in via existing `writeOnlyFiles`

The existing `writeOnlyFiles` mechanism already provides the correct override: if a session declares `writeOnlyFiles`, those paths pass through. To make this work with the new default-deny:

1. The global `.pio/` check must run **before** blocking, but check whether the target is in the session's `writeOnlyFilePaths` allowlist first. If it's in the allowlist, permit it. Otherwise, block.
2. This means capabilities that need to write `.pio/` files simply declare them — no new config shape needed:

| Capability | Write access needed | Change required |
|---|---|---|
| `create-goal` | `GOAL.md` inside goal workspace | Add `writeOnlyFiles: ["GOAL.md"]` to `CAPABILITY_CONFIG` |
| `create-plan` | `PLAN.md` inside goal workspace | Add `writeOnlyFiles: ["PLAN.md"]` to `CAPABILITY_CONFIG` (keeps existing `readOnlyFiles: ["GOAL.md"]`) |
| `evolve-plan` | Step files (`S01/TASK.md`, `S01/TEST.md`) | Add dynamic `writeOnlyFiles` resolved at runtime (similar to how `execute-task.ts` resolves step dirs) |
| `execute-task` | Source project files (not `.pio/`) | No change needed — already sets `readOnlyFiles` for spec files |
| `project-context` | `.pio/PROJECT.md` | Already has `writeOnlyFiles: [".pio/PROJECT.md"]` — no change |

### What is explicitly out of scope

- Changes to the queue mechanism (`enqueueTask`, `next-task.ts`). The queue writes to `.pio/session-queue/task.json` via Node.js `fs.writeFileSync` in `src/utils.ts`, not through agent tools.
- Prompt changes. The protection is enforced at runtime — prompt guardrails are unnecessary when the tool call itself is blocked.
- Blocking reads from `.pio/`. Reads remain unrestricted (agents need to read GOAL.md, PLAN.md, etc.).
