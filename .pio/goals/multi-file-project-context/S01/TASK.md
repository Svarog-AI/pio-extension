# Task: Update session loader to read `.pio/PROJECT/OVERVIEW.md`

Change the `before_agent_start` handler in `session-capability.ts` from reading `.pio/PROJECT.md` to reading `.pio/PROJECT/OVERVIEW.md`.

## Context

Currently, `session-capability.ts` loads a single monolithic `.pio/PROJECT.md` into every agent session. The new architecture replaces this with 7 specialized files under `.pio/PROJECT/`, where `OVERVIEW.md` contains the project overview injected into every session. This step changes the consumer side — the loader must point to the new path.

## What to Build

A single-path change in the `before_agent_start` handler of `session-capability.ts`. The handler constructs the path to the project context file using `path.join(process.cwd(), ".pio", "PROJECT.md")`. This needs to become `path.join(process.cwd(), ".pio", "PROJECT", "OVERVIEW.md")`.

### Code Components

- **Path construction in `before_agent_start`** — The `projectContext` module-level cache is loaded once per session. Change the path from `.pio/PROJECT.md` to `.pio/PROJECT/OVERVIEW.md`. This is a one-line change inside the `if (projectContext === undefined)` block.

### Approach and Decisions

- **Preserve the `projectContext` variable name** — The cache variable remains unchanged. Only the file path changes.
- **Preserve the injection wrapper label** — The string `--- PROJECT OVERVIEW ---` stays as-is; it still wraps project overview content, just from a different file.
- **Use `path.join` with `"PROJECT"` as a directory segment** — Follow the existing pattern: `path.join(process.cwd(), ".pio", "PROJECT", "OVERVIEW.md")`.

## Dependencies

None. This is Step 1 and has no prerequisites.

## Files Affected

- `src/capabilities/session-capability.ts` — change path from `.pio/PROJECT.md` to `.pio/PROJECT/OVERVIEW.md` in the `before_agent_start` handler
- `src/capabilities/session-capability.test.ts` — add unit test verifying the new `.pio/PROJECT/OVERVIEW.md` path is used

## Acceptance Criteria

- [ ] `npm run check` reports no TypeScript errors
- [ ] The `before_agent_start` handler reads `.pio/PROJECT/OVERVIEW.md` instead of `.pio/PROJECT.md` (verifiable by reading the file)
- [ ] Module-level cache variable name and injection wrapper label are preserved (no renaming of `projectContext` or the `--- PROJECT OVERVIEW ---` string)

## Risks and Edge Cases

- **Existing `.pio/PROJECT.md` files on disk** — After this change, any existing `.pio/PROJECT.md` will be silently ignored. This is intentional per GOAL.md (clean slate, no migration). The new path won't find anything until users run `/pio-project-context` again.
- **Active sessions with cached old content** — Sessions started before this change will keep their cached `projectContext` value (old `PROJECT.md`) until they restart. This is acceptable behavior — the cache is per-session-lifetime.
