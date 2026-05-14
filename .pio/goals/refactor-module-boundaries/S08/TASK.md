# Task: Delete old files + remove re-exports from `src/utils.ts`

Remove the original source files now that all consumers point to new module locations, and clean up remaining test imports that still reference `src/utils.ts`.

## Context

Steps 1–4 extracted subsystems from `src/utils.ts` into focused modules (`transitions.ts`, `queues.ts`, `fs-utils.ts`, `capability-config.ts`). Steps 5–7 moved `validation.ts` and `turn-guard.ts` to `src/guards/` and updated all capability file imports. At this point, the old files are dead weight:

- `src/utils.ts` — contains only re-exports from steps 1–4 (no original code)
- `src/capabilities/validation.ts` — stale copy; active version is at `src/guards/validation.ts`
- `src/capabilities/turn-guard.ts` — stale copy; active version is at `src/guards/turn-guard.ts`

Before deletion, 5 test files still import symbols from `../src/utils`. These need redirecting to the actual new module locations so that `npm run check` passes after `src/utils.ts` is removed.

## What to Build

This is a cleanup/deletion step with no new code. The work involves:

1. **Update test imports** — redirect 5 remaining test file imports from `../src/utils` to the correct new modules
2. **Delete old files** — remove `src/utils.ts`, `src/capabilities/validation.ts`, and `src/capabilities/turn-guard.ts`
3. **Verify** — confirm no references remain and type checking passes

### Test Import Updates

The following test files still import from `../src/utils` and need updating:

| File | Current Import | New Import Target | Symbol(s) |
|------|----------------|-------------------|-----------|
| `__tests__/transition.test.ts` | `import { stepFolderName } from "../src/utils"` | `../src/fs-utils` | `stepFolderName` |
| `__tests__/smoke.test.ts` | `import { stepFolderName } from "../src/utils"` | `../src/fs-utils` | `stepFolderName` |
| `__tests__/execute-task-initial-message.test.ts` | `import { stepFolderName } from "../src/utils"` | `../src/fs-utils` | `stepFolderName` |
| `__tests__/review-code-config.test.ts` | `import { stepFolderName } from "../src/utils"` | `../src/fs-utils` | `stepFolderName` |
| `__tests__/evolve-plan.test.ts` | `import { resolveCapabilityConfig } from "../src/utils"` | `../src/capability-config` | `resolveCapabilityConfig` |

### File Deletions

After updating test imports, delete these three files entirely:

- `src/utils.ts` — re-export shim, no longer needed
- `src/capabilities/validation.ts` — moved to `src/guards/validation.ts` in Step 5
- `src/capabilities/turn-guard.ts` — moved to `src/guards/turn-guard.ts` in Step 5

### Approach and Decisions

- Use the actual module locations, not the plan's original locations. `stepFolderName` lives in `../src/fs-utils` (confirmed by reading `fs-utils.ts` and the current import patterns across capabilities).
- Verify with grep before deleting to ensure no source files (`src/`) still reference the deleted paths. Test-only references are expected for `evolve-plan.test.ts` (Step 9).
- Run `npm run check` after all changes to confirm zero TypeScript errors.

## Dependencies

- Step 7 must be completed (all capability files updated, `src/index.ts` imports from `./guards/`)
- Steps 1–4 must be completed (new modules exist with correct exports)
- Step 5 must be completed (files moved to `src/guards/`)
- Step 6 must be completed (all capability file imports redirected)

## Files Affected

- `__tests__/transition.test.ts` — modified: redirect `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/smoke.test.ts` — modified: redirect `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/execute-task-initial-message.test.ts` — modified: redirect `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/review-code-config.test.ts` — modified: redirect `stepFolderName` import from `../src/utils` → `../src/fs-utils`
- `__tests__/evolve-plan.test.ts` — modified: redirect `resolveCapabilityConfig` import from `../src/utils` → `../src/capability-config`
- `src/utils.ts` — deleted
- `src/capabilities/validation.ts` — deleted
- `src/capabilities/turn-guard.ts` — deleted

## Acceptance Criteria

- [ ] `src/utils.ts` no longer exists on disk
- [ ] `src/capabilities/validation.ts` no longer exists on disk
- [ ] `src/capabilities/turn-guard.ts` no longer exists on disk
- [ ] No remaining imports in `src/` reference `../utils`, `./capabilities/validation`, or `./capabilities/turn-guard` (verified via grep)
- [ ] `__tests__/transition.test.ts` imports `stepFolderName` from `../src/fs-utils`
- [ ] `__tests__/smoke.test.ts` imports `stepFolderName` from `../src/fs-utils`
- [ ] `__tests__/execute-task-initial-message.test.ts` imports `stepFolderName` from `../src/fs-utils`
- [ ] `__tests__/review-code-config.test.ts` imports `stepFolderName` from `../src/fs-utils`
- [ ] `__tests__/evolve-plan.test.ts` imports `resolveCapabilityConfig` from `../src/capability-config`
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Stale test imports:** If a test file still references `../src/utils` after deletion, TypeScript will report "Cannot find module" errors since `tsconfig.json` includes `__tests__/**/*.ts`. Ensure all 4 listed test files are updated before deleting `src/utils.ts`.
- **evolve-plan.test.ts:** This file imports `resolveCapabilityConfig` from `../src/utils`. It is included in this step (not deferred to Step 9) because deleting `src/utils.ts` would otherwise cause TypeScript errors — `npm run check` cannot pass until this import is also redirected. Step 9 becomes a final verification step that confirms the change compiles.
- **No behavioral changes expected:** This is purely structural. Any runtime behavior change would indicate a missing import migration.
