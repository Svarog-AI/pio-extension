# Restrict source code write access for read-only capabilities (review, planning, etc.)

# Restrict source code writes for non-implementation sessions

Certain capability sessions — like `review-code`, `create-plan`, and `evolve-plan` — should not be able to modify source code files. The agent in these sessions is meant to read, analyze, and produce documentation only. Currently there is no explicit blocklist preventing the agent from editing project source code (`.ts`, `.js`, etc.) during sessions where it has no business touching them.

## Motivation

A review session should read code to evaluate it — not accidentally (or intentionally) fix bugs, refactor, or "help out" by modifying implementation files. This undermines the separation of concerns: the implementation agent owns the code changes; the reviewer owns the verdict. Same applies to `create-plan` and `evolve-plan` — they produce planning documents, not code.

## Current state

The file protection system in `validation.ts` supports two mechanisms:
- `writeAllowlist` — restricts all writes to a specific list of files (used by `review-code`, `create-plan`, etc.)
- `readOnlyFiles` — blocks writes to specific files only if no allowlist is set (lower precedence)

However, the `writeAllowlist` for `review-code` allows writes to project source code in addition to `.pio/` goal workspace files. The review agent should be able to write `REVIEW.md` and `APPROVED` markers, but should not be able to edit any `.ts`, `.js`, or other source files in the working directory.

## What is needed

- **Source code read-only:** Non-implementation capabilities (`review-code`, `create-plan`, `evolve-plan`) should have no ability to write project source files. The agent can read code to understand it, but all `write`, `edit`, and `vscode_apply_workspace_edit` calls targeting source files must be blocked.
- **Implementation:** Add a new capability config option — e.g. `sourceCodeReadOnly: boolean` or a file pattern blocklist — that tells the `tool_call` handler to deny writes matching project source patterns (e.g., `**/*.ts`, `**/*.js`) unless the session is an implementation-type session (`execute-task`, `execute-plan`).
- **Scope:** Apply this consistently across all non-implementation capabilities so no planning, reviewing, or specification session can silently modify production code.

## Files to modify

- **Modify:** `src/capabilities/review-code.ts` — set `sourceCodeReadOnly: true` or equivalent in `CAPABILITY_CONFIG`
- **Modify:** `src/capabilities/create-plan.ts`, `src/capabilities/evolve-plan.ts`, `src/capabilities/create-goal.ts` — same treatment for all non-implementation capabilities
- **Modify:** `src/types.ts` — add the new config option to `CapabilityConfig` / `StaticCapabilityConfig`
- **Modify:** `src/capabilities/validation.ts` — enforce source code write block in the `tool_call` handler
- **Modify:** `src/utils.ts` — wire the config through `resolveCapabilityConfig`

## Open questions

- Should this be per-capability (`sourceCodeReadOnly: true`) or inferred from capability type (anything not `execute-task`/`execute-plan` is read-only)?
- What file patterns count as "source code"? `.ts`, `.js`, `.tsx`, `.jsx`, `.py`, etc.? Hard-coded list or glob patterns in config?
- Should the blocklist also apply to tools other than `write` — e.g., `bash` commands that modify files (`sed -i`, `echo > file`)? Those are harder to intercept.

## Category

improvement

## Context

Relevant files:
- src/capabilities/validation.ts — tool_call handler with writeAllowlist and readOnlyFiles enforcement
- src/capabilities/review-code.ts — CAPABILITY_CONFIG (has writeAllowlist but it includes source files)
- src/capabilities/create-plan.ts — CAPABILITY_CONFIG (readOnlyFiles + writeAllowlist)
- src/capabilities/evolve-plan.ts — CAPABILITY_CONFIG (writeAllowlist for TASK.md/TEST.md)
- src/types.ts — CapabilityConfig, StaticCapabilityConfig type definitions
