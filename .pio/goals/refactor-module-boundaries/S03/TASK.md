# Task: Extract `src/fs-utils.ts` + update dependent tests

Extract filesystem path helpers, issue utilities, step folder naming (`stepFolderName`), step discovery, and session naming from `src/utils.ts` into a new module `src/fs-utils.ts`. This flips the dependency relative to the plan text: `fs-utils.ts` has no internal dependencies, and `transitions.ts` imports `stepFolderName` from it.

## Context

`src/utils.ts` is a ~370-line catch-all containing 7 unrelated subsystems. Steps 1 and 2 have already extracted the transition system (`src/transitions.ts`) and session queue utilities (`src/queues.ts`). Step 3 extracts the filesystem utilities — goal directory resolution, issue file operations, step folder naming (`stepFolderName`), step folder discovery, and session naming.

**Important decision from Step 1:** `stepFolderName()` was decided to live in `fs-utils.ts` (not `transitions.ts` as PLAN.md originally stated). This means `transitions.ts` must import `stepFolderName` from `./fs-utils`, not the reverse. The dependency chain is: `transitions.ts` → `fs-utils.ts`. No circular dependencies exist.

## What to Build

### Create `src/fs-utils.ts`

A new module containing five coherent groups of filesystem-related helpers:

#### Code Components

**Goal directory helpers:**
- `resolveGoalDir(cwd: string, name: string): string` — resolves `.pio/goals/<name>` under a given cwd
- `goalExists(goalDir: string): boolean` — checks if a goal workspace directory exists on disk

**Issue utilities:**
- `issuesDir(cwd: string): string` — returns path to `.pio/issues/`, creating it if needed
- `findIssuePath(cwd: string, identifier: string): string | undefined` — resolves slug, filename, or absolute path to a full issue file path
- `readIssue(cwd: string, identifier: string): string | undefined` — reads an issue file by identifier

**Step folder naming:**
- `stepFolderName(stepNumber: number): string` — formats zero-padded folder name (e.g., 1→"S01", 25→"S25"). Extracted here per Step 1 decision. Consumers in `transitions.ts`, `evolve-plan.ts`, `execute-task.ts`, `review-code.ts`, and `validation.ts` will eventually import from here.

**Step discovery:**
- `discoverNextStep(goalDir: string): number` — scans for completed step folders (containing both TASK.md and TEST.md) and returns N+1. Calls `stepFolderName()` internally. Since both live in the same module, no cross-module import needed.

**Session naming:**
- `deriveSessionName(goalName: string, capability: string, stepNumber?: number): string` — formats human-readable session names (e.g., `"my-feature execute-task s3"`)

### Update `src/transitions.ts`

Change the import from `./utils` to `./fs-utils`:
- `import { stepFolderName } from "./utils"` → `import { stepFolderName } from "./fs-utils"`

This is a critical cross-step fix: `transitions.ts` was created in Step 1 importing from `./utils`. With `stepFolderName` now defined in `fs-utils.ts`, the import must point to the actual definition, not a re-export. After this change, the dependency chain is clean: `fs-utils.ts` (no deps) ← `transitions.ts`.

### Update `src/utils.ts`

Add re-exports from `./fs-utils` for backward compatibility during migration. Remove the original function definitions. The file should still contain:
- Re-exports from `./transitions` (Step 1)
- Re-exports from `./queues` (Step 2)
- Re-exports from `./fs-utils` (this step), including `stepFolderName`
- The `resolveCapabilityConfig()` function and its `StaticCapabilityConfig` re-export remain for now (extracted in Step 4)

### Update test files

**`__tests__/step-discovery.test.ts`:**
- Change `import { stepFolderName } from "../src/utils"` to `import { stepFolderName } from "../src/fs-utils"`
- The file uses `isStepReady`, `isStepReviewable`, `findMostRecentCompletedStep` from capability files — those imports are unchanged

**`__tests__/utils.test.ts`:**
- Change imports for `resolveGoalDir`, `goalExists`, `findIssuePath`, `readIssue`, `deriveSessionName`, `stepFolderName`, `discoverNextStep` from `"../src/utils"` to `"../src/fs-utils"`

### Approach and Decisions

- **Verbatim extraction:** Copy functions as-is from `utils.ts` with no behavioral changes. This is a structural refactor, not a behavior change.
- **Dependency direction:** `fs-utils.ts` has zero internal dependencies. `transitions.ts` imports `stepFolderName` from `./fs-utils`. This was decided in Step 1 — the PLAN.md text placing `stepFolderName` in transitions.ts should be considered superseded by the implementation decision.
- **ESM imports:** Use bare specifier with `.ts` extension omitted, consistent with project convention (e.g., `import { stepFolderName } from "./fs-utils"`).
- **No new types needed:** All extracted functions return primitive types or are self-typed.

## Dependencies

- **Step 1 (transitions.ts):** Required — this step updates `transitions.ts` to import `stepFolderName` from `./fs-utils`. Step 1 must be completed and approved first.
- **Step 2 (queues.ts):** Not directly required, but should be completed for a clean codebase state.

## Files Affected

- `src/fs-utils.ts` — created: filesystem path helpers, issue utilities, step folder naming (`stepFolderName`), step discovery, session naming
- `src/transitions.ts` — modified: import `stepFolderName` from `"./fs-utils"` instead of `"./utils"`
- `src/utils.ts` — modified: remove extracted function definitions, add re-exports from `./fs-utils` (including `stepFolderName`)
- `__tests__/step-discovery.test.ts` — modified: import `stepFolderName` from `../src/fs-utils` instead of `../src/utils`
- `__tests__/utils.test.ts` — modified: import fs-utils symbols from `../src/fs-utils` instead of `../src/utils`

## Acceptance Criteria

- [ ] `src/fs-utils.ts` exists with all listed symbols exported: `resolveGoalDir`, `goalExists`, `issuesDir`, `findIssuePath`, `readIssue`, `stepFolderName`, `discoverNextStep`, `deriveSessionName`
- [ ] `src/fs-utils.ts` has no internal imports from other pio modules (no circular dependency)
- [ ] `src/transitions.ts` imports `stepFolderName` from `"./fs-utils"` (was `"./utils"`)
- [ ] `src/utils.ts` re-exports from `./fs-utils` (backward-compat during migration), including `stepFolderName`
- [ ] Original function definitions removed from `src/utils.ts` (only re-exports and `resolveCapabilityConfig` remain)
- [ ] `npm run check` reports no errors
- [ ] `step-discovery.test.ts` imports `stepFolderName` from `../src/fs-utils` and tests pass
- [ ] FS-utils related tests in `utils.test.ts` import from `../src/fs-utils` and pass

## Risks and Edge Cases

- **Import direction is the key change:** PLAN.md says `fs-utils.ts` imports from `./transitions`, but the decision was reversed. The executor must follow TASK.md (the authoritative spec), not PLAN.md text, for this detail.
- **Updating transitions.ts is a cross-step modification:** Step 1 created `transitions.ts`. This step modifies it to fix its import. Ensure the change is from `"./utils"` → `"./fs-utils"`, not deleting the import.
- **No behavioral changes:** Any change to function logic risks subtle bugs. Extract verbatim.
