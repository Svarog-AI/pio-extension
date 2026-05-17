# Accumulated Decisions (through Step 2)

## Architecture Decisions

- **Path resolution extracted to pure function:** Step 1 introduced `resolveProjectContextPath(cwd: string): string` in `session-capability.ts`. This is a public exported utility. Downstream steps should be aware this function exists and controls the loader path — do not re-implement similar logic elsewhere. No downstream impact for Step 2 itself.

- **Module-level cache preserved:** The `projectContext` variable in `session-capability.ts` remains as a module-level cache (read once per session). Only the source path changed. Downstream steps should not alter this caching behavior unless explicitly planned.

## File Placement

- **Step 1 modified `src/capabilities/session-capability.ts` and `src/capabilities/session-capability.test.ts`.** Step 2 operates on a different file (`project-context.ts`) — no overlap or conflict expected.
