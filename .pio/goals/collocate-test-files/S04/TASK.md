# Task: Remove `__tests__/` directory and final verification

Delete the now-empty `__tests__/` directory and run final verification to confirm the test file collocation migration is complete with zero regressions.

## Context

Steps 1–3 relocated all 14 test files from `__tests__/` into ~9 collocated `*.test.ts` files beside their source modules, merged cross-cutting tests, updated all import paths, and rewrote `vitest.config.ts` and `tsconfig.json` to target `src/` only. Step 3 deleted the individual test files but left the empty `__tests__/` directory intact for this step to remove. This is the final cleanup step of the migration.

## What to Build

No new code or configuration changes are needed. This step performs two operations:

1. **Delete the `__tests__/` directory** — The directory is confirmed empty (all 14 `.test.ts` files were removed in Step 3). Remove it with a standard directory deletion command.

2. **Run final verification** — Execute the full test suite and type check to prove zero regressions after directory removal. Search the codebase for any remaining `__tests__/` references in source code and configuration files (excluding `node_modules/`, prompt templates, and unrelated `.pio/` goal workspaces).

## Code Components

None — this is a cleanup and verification step only.

### Approach and Decisions

- Use `rm -rf __tests__/` or equivalent to remove the empty directory.
- Verification order: type check → full test run → grep for stale references.
- References to `__tests__/` in prompt templates (`src/prompts/*.md`) are generic instructions about testing conventions, not project-specific paths — these should be left as-is (confirmed by Step 3 review).

## Dependencies

- Step 1: Complex merges must be completed and approved
- Step 2: Simple moves must be completed and approved
- Step 3: Configuration updates and file deletion must be completed and approved

## Files Affected

- `__tests__/` — deleted (empty directory)

## Acceptance Criteria

- [ ] `__tests__/` directory does not exist
- [ ] `npm run check` reports no type errors
- [ ] `npm run test` passes — all collocated test files discovered and passing
- [ ] No references to `__tests__/` remain in source code or configuration (verified via grep, excluding `node_modules/`, prompt templates, and unrelated goal workspaces)

## Risks and Edge Cases

- If `__tests__/` is not actually empty (e.g., a file was missed in Step 3), the deletion will still succeed but may indicate an incomplete migration. Verify emptiness before deleting if possible.
- The grep check must exclude `node_modules/` and `.pio/goals/` subdirectories, as those contain unrelated references.
