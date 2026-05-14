# Plan: Refactor Module Boundaries

Decompose `src/utils.ts` into focused single-responsibility modules and move infrastructure files (`validation.ts`, `turn-guard.ts`) from `src/capabilities/` to `src/guards/`. Purely structural refactoring — no behavioral changes.

## Prerequisites

None.

## Steps

### Step 1: Extract `src/transitions.ts` + update dependent tests

**Description:** Extract the transition system subsystem from `src/utils.ts` into a new module `src/transitions.ts`. This includes the workflow state machine types, transition map, and resolution logic. `stepFolderName()` is co-located here since it's used internally by `CAPABILITY_TRANSITIONS["review-code"]` and consumed by 6+ other files that already need transitions — co-location avoids an extra import for all those callers.

After extraction, update the imports in `src/utils.ts` to re-export from the new module (maintaining backward compatibility during the migration). Then update test files that import transition-related symbols.

**Symbols extracted:**
- Types: `TransitionContext`, `TransitionResult`, `CapabilityTransitionResolver`
- Data: `CAPABILITY_TRANSITIONS`
- Functions: `resolveNextCapability()`, `stepFolderName()`

**Acceptance criteria:**
- [ ] `src/transitions.ts` exists with all listed symbols exported
- [ ] `src/utils.ts` re-exports from `./transitions` (backward-compat during migration)
- [ ] `npm run check` reports no errors
- [ ] `transition.test.ts` imports from `../src/transitions` and tests pass (`npm test __tests__/transition.test.ts`)
- [ ] `smoke.test.ts` imports `stepFolderName` from `../src/transitions` and tests pass
- [ ] `execute-task-initial-message.test.ts` imports `stepFolderName` from `../src/transitions` and tests pass
- [ ] `review-code-config.test.ts` imports `stepFolderName` from `../src/transitions` and tests pass

**Files affected:**
- `src/transitions.ts` — new file: transition system + step folder naming
- `src/utils.ts` — add re-exports from `./transitions`, remove extracted symbols
- `__tests__/transition.test.ts` — update imports: `../src/utils` → `../src/transitions`
- `__tests__/smoke.test.ts` — update import: `stepFolderName` from `../src/utils` → `../src/transitions`
- `__tests__/execute-task-initial-message.test.ts` — update import: `stepFolderName` from `../src/utils` → `../src/transitions`
- `__tests__/review-code-config.test.ts` — update import: `stepFolderName` from `../src/utils` → `../src/transitions`

### Step 2: Extract `src/queues.ts` + update dependent tests

**Description:** Extract the session queue subsystem from `src/utils.ts` into `src/queues.ts`. This handles all file operations on `.pio/session-queue/` for FIFO task management — directory creation, enqueueing tasks, reading pending tasks, listing goals with pending tasks, and writing completed task records.

After extraction, add re-exports in `src/utils.ts` and update tests that import queue-related symbols.

**Symbols extracted:**
- Type: `SessionQueueTask`
- Functions: `queueDir()`, `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`

**Acceptance criteria:**
- [ ] `src/queues.ts` exists with all listed symbols exported
- [ ] `src/utils.ts` re-exports from `./queues` (backward-compat during migration)
- [ ] `npm run check` reports no errors
- [ ] Queue-related tests in `utils.test.ts` import from `../src/queues` and pass (`npm test __tests__/utils.test.ts`)

**Files affected:**
- `src/queues.ts` — new file: session queue file operations
- `src/utils.ts` — add re-exports from `./queues`, remove extracted symbols
- `__tests__/utils.test.ts` — update imports for queue symbols: `../src/utils` → `../src/queues`

### Step 3: Extract `src/fs-utils.ts` + update dependent tests

**Description:** Extract filesystem path helpers, issue utilities, step discovery, and session naming from `src/utils.ts` into `src/fs-utils.ts`. This creates a dependency on `src/transitions.ts` since `discoverNextStep()` calls `stepFolderName()`.

After extraction, add re-exports in `src/utils.ts` and update tests.

**Symbols extracted:**
- Goal directory: `resolveGoalDir()`, `goalExists()`
- Issue utilities: `issuesDir()`, `findIssuePath()`, `readIssue()`
- Step discovery: `discoverNextStep()` (depends on `stepFolderName` from `./transitions`)
- Session naming: `deriveSessionName()`

**Acceptance criteria:**
- [ ] `src/fs-utils.ts` exists with all listed symbols exported
- [ ] `src/fs-utils.ts` imports `stepFolderName` from `./transitions` (no circular dependency)
- [ ] `src/utils.ts` re-exports from `./fs-utils` (backward-compat during migration)
- [ ] `npm run check` reports no errors
- [ ] `step-discovery.test.ts` imports `discoverNextStep` from `../src/fs-utils` and tests pass
- [ ] `step-discovery.test.ts` imports `stepFolderName` from `../src/transitions` and tests pass
- [ ] FS-utils related tests in `utils.test.ts` import from `../src/fs-utils` and pass

**Files affected:**
- `src/fs-utils.ts` — new file: filesystem path helpers, issue utilities, step discovery, session naming
- `src/utils.ts` — add re-exports from `./fs-utils`, remove extracted symbols
- `__tests__/step-discovery.test.ts` — update imports: `discoverNextStep` from `../src/fs-utils`, `stepFolderName` from `../src/transitions`
- `__tests__/utils.test.ts` — update imports for fs-utils symbols: `../src/utils` → `../src/fs-utils`

### Step 4: Extract `src/capability-config.ts` + update dependent tests

**Description:** Extract capability config resolution from `src/utils.ts` into `src/capability-config.ts`. This is framework-level infrastructure that dynamically loads capability modules via `import('./capabilities/${cap}')` and assembles session configs. Depends on `resolveGoalDir` and `deriveSessionName` from `./fs-utils`.

After extraction, add re-exports in `src/utils.ts` and update all remaining test files.

**Symbols extracted:**
- Function: `resolveCapabilityConfig()`
- Re-export: `StaticCapabilityConfig` (from `./types`)

**Acceptance criteria:**
- [ ] `src/capability-config.ts` exists with all listed symbols exported
- [ ] `src/capability-config.ts` imports from `./fs-utils` (`resolveGoalDir`, `deriveSessionName`)
- [ ] `src/utils.ts` re-exports from `./capability-config` (backward-compat during migration)
- [ ] `npm run check` reports no errors
- [ ] All remaining test files updated and pass individually:
  - `capability-config.test.ts` — imports `resolveCapabilityConfig` from `../src/capability-config`
  - `session-capability.test.ts` — imports `resolveCapabilityConfig` from `../src/capability-config`
  - `types.test.ts` — imports `resolveCapabilityConfig` from `../src/capability-config`, keeps `StaticCapabilityConfig` from `../src/types`

**Files affected:**
- `src/capability-config.ts` — new file: dynamic capability module loading and config assembly
- `src/utils.ts` — add re-exports from `./capability-config`, remove extracted symbols (now only re-exports remain)
- `__tests__/capability-config.test.ts` — update import: `../src/utils` → `../src/capability-config`
- `__tests__/session-capability.test.ts` — update import: `../src/utils` → `../src/capability-config`
- `__tests__/types.test.ts` — update import: `resolveCapabilityConfig` from `../src/utils` → `../src/capability-config`

### Step 5: Move `validation.ts`, `turn-guard.ts` to `src/guards/` + update validation imports

**Description:** Create the `src/guards/` directory and move both infrastructure files. These are event-handler modules that wire into the pi ExtensionAPI lifecycle but are not capabilities themselves (no tools/commands for agent invocation). Moving `validation.ts` requires updating its imports to point to the new decomposed utility modules instead of `../utils`. Moving `turn-guard.ts` requires no import changes — it has zero dependencies on utils.

**Acceptance criteria:**
- [ ] `src/guards/validation.ts` exists (moved from `src/capabilities/validation.ts`)
- [ ] `src/guards/turn-guard.ts` exists (moved from `src/capabilities/turn-guard.ts`)
- [ ] `src/guards/validation.ts` imports: `resolveNextCapability`, `stepFolderName` from `../../transitions`; `enqueueTask`, `writeLastTask` from `../../queues`; `resolveGoalDir` from `../../fs-utils`
- [ ] `src/guards/turn-guard.ts` has unchanged internal imports (no utils dependencies)
- [ ] `npm run check` reports no errors

**Files affected:**
- `src/guards/validation.ts` — moved from `src/capabilities/validation.ts`, updated imports
- `src/guards/turn-guard.ts` — moved from `src/capabilities/turn-guard.ts`, no import changes
- `__tests__/validation.test.ts` — update import: `../src/capabilities/validation` → `../src/guards/validation`
- `__tests__/turn-guard.test.ts` — update import: `../src/capabilities/turn-guard` → `../src/guards/turn-guard`

### Step 6: Update all capability files to import from new modules

**Description:** Every file in `src/capabilities/` that imported from `../utils` must now import from the correct decomposed module. Each capability will typically need 2-3 targeted imports instead of one large `../utils` import, but each targets a single-responsibility module. Also update `session-capability.ts` which imports `discoverNextStep` from `../utils`.

**Import changes per file:**
- `create-goal.ts`: `enqueueTask`, `resolveGoalDir` → `../fs-utils`; `goalExists` → `../fs-utils`; `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `create-issue.ts`: `issuesDir` → `../fs-utils`
- `create-plan.ts`: `enqueueTask`, `resolveGoalDir` → `../fs-utils`; `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `delete-goal.ts`: `resolveGoalDir`, `goalExists` → `../fs-utils`
- `evolve-plan.ts`: `enqueueTask`, `resolveGoalDir`, `discoverNextStep` → `../fs-utils`; `stepFolderName` → `../transitions`; `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `execute-plan.ts`: `resolveGoalDir` → `../fs-utils`; `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `execute-task.ts`: `enqueueTask`, `resolveGoalDir` → `../fs-utils`; `stepFolderName` → `../transitions`; `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `goal-from-issue.ts`: `enqueueTask`, `findIssuePath`, `goalExists`, `resolveGoalDir` → `../fs-utils`; `resolveCapabilityConfig` → `../capability-config`
- `list-goals.ts`: `resolveGoalDir` → `../fs-utils`; `SessionQueueTask` → `../queues`
- `next-task.ts`: `queueDir`, `readPendingTask`, `listPendingGoals`, `SessionQueueTask` → `../queues`; `resolveCapabilityConfig` → `../capability-config`
- `project-context.ts`: `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `review-code.ts`: `enqueueTask`, `resolveGoalDir` → `../fs-utils`; `stepFolderName` → `../transitions`; `resolveCapabilityConfig`, `StaticCapabilityConfig` → `../capability-config`
- `session-capability.ts`: `discoverNextStep` → `../fs-utils`

**Acceptance criteria:**
- [ ] All 14 capability files + session-capability.ts import from correct new modules (no imports from `../utils`)
- [ ] `npm run check` reports no errors

**Files affected:**
- `src/capabilities/create-goal.ts` — split `../utils` import across `../fs-utils`, `../capability-config`
- `src/capabilities/create-issue.ts` — update: `../utils` → `../fs-utils`
- `src/capabilities/create-plan.ts` — split `../utils` import across `../fs-utils`, `../capability-config`
- `src/capabilities/delete-goal.ts` — update: `../utils` → `../fs-utils`
- `src/capabilities/evolve-plan.ts` — split `../utils` import across `../fs-utils`, `../transitions`, `../capability-config`
- `src/capabilities/execute-plan.ts` — split `../utils` import across `../fs-utils`, `../capability-config`
- `src/capabilities/execute-task.ts` — split `../utils` import across `../fs-utils`, `../transitions`, `../capability-config`
- `src/capabilities/goal-from-issue.ts` — split `../utils` import across `../fs-utils`, `../capability-config`
- `src/capabilities/list-goals.ts` — split `../utils` import across `../fs-utils`, `../queues`
- `src/capabilities/next-task.ts` — split `../utils` import across `../queues`, `../capability-config`
- `src/capabilities/project-context.ts` — update: `../utils` → `../capability-config`
- `src/capabilities/review-code.ts` — split `../utils` import across `../fs-utils`, `../transitions`, `../capability-config`
- `src/capabilities/session-capability.ts` — update: `../utils` → `../fs-utils`

### Step 7: Update `src/index.ts` imports

**Description:** Update the two infrastructure imports in the extension entry point to reflect the new `src/guards/` location.

**Acceptance criteria:**
- [ ] `setupValidation` imported from `"./guards/validation"` (was `"./capabilities/validation"`)
- [ ] `setupTurnGuard` imported from `"./guards/turn-guard"` (was `"./capabilities/turn-guard"`)
- [ ] `npm run check` reports no errors

**Files affected:**
- `src/index.ts` — update two import paths

### Step 8: Delete old files + remove re-exports from `src/utils.ts`

**Description:** Remove the original files now that all consumers point to new locations. This includes deleting `src/utils.ts` entirely, and deleting `src/capabilities/validation.ts` and `src/capabilities/turn-guard.ts` (already moved in step 5).

At this point, `src/utils.ts` contains only re-exports from steps 1-4. With all consumers updated in steps 6-7, these re-exports are no longer needed. Delete the file entirely.

**Acceptance criteria:**
- [ ] `src/utils.ts` no longer exists on disk
- [ ] `src/capabilities/validation.ts` no longer exists on disk
- [ ] `src/capabilities/turn-guard.ts` no longer exists on disk
- [ ] No remaining imports reference `../utils`, `./capabilities/validation`, or `./capabilities/turn-guard` (verified via grep)
- [ ] `npm run check` reports no errors

**Files affected:**
- `src/utils.ts` — deleted
- `src/capabilities/validation.ts` — deleted (moved in step 5)
- `src/capabilities/turn-guard.ts` — deleted (moved in step 5)

### Step 9: Update remaining test file imports + verify with `evolve-plan.test.ts`

**Description:** `evolve-plan.test.ts` imports from both `../src/capabilities/validation` and `../src/utils`. Both need updating to reflect new module locations.

**Acceptance criteria:**
- [ ] `evolve-plan.test.ts` imports `validateOutputs` from `../src/guards/validation` (was `../src/capabilities/validation`)
- [ ] `evolve-plan.test.ts` imports `resolveCapabilityConfig` from `../src/capability-config` (was `../src/utils`)
- [ ] `npm run check` reports no errors

**Files affected:**
- `__tests__/evolve-plan.test.ts` — update two import paths

### Step 10: Final verification — all tests pass

**Description:** Run the full type check and test suite to verify zero regressions across the entire refactoring. All 14 test files should compile and produce identical results.

**Acceptance criteria:**
- [ ] `npm run check` reports zero TypeScript errors
- [ ] `npm test` passes — all 14 test files execute with no failures
- [ ] No behavioral changes: identical runtime behavior before and after refactoring

**Files affected:**
- None (verification step only)

## Notes

- **Dependency chain for new modules:** `transitions.ts` has no internal dependencies. `queues.ts` has no internal dependencies. `fs-utils.ts` depends on `transitions.ts` (`discoverNextStep` → `stepFolderName`). `capability-config.ts` depends on `fs-utils.ts` (`resolveGoalDir`, `deriveSessionName`). No circular dependencies exist.
- **Re-export strategy:** During steps 1-4, `src/utils.ts` re-exports from new modules to maintain backward compatibility. This allows incremental migration — capability files can be updated in any order during step 6 without breaking type checking. Re-exports are removed in step 8 when the file is deleted.
- **`next-task.test.ts` requires no changes** — it imports only from `session-capability`, not from utils or capabilities directly.
- **Validation + turn-guard move:** Step 5 moves files and updates validation's internal imports (which point to decomposed utils). The old `src/capabilities/` copies are deleted in step 8 after all consumers have been updated.
- **Test file `utils.test.ts`:** Tests symbols from multiple subsystems (queues, fs-utils). After steps 2-3, its imports will be split across `../src/queues` and `../src/fs-utils`. The test file itself remains at `__tests__/utils.test.ts` — it's testing the extracted symbols regardless of origin.
- **`src/types.ts` remains unchanged** — it already serves as the shared type hub for `ValidationRule`, `CapabilityConfig`, `StaticCapabilityConfig`, etc.
