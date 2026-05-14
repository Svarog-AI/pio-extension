# Task: Extract `src/transitions.ts` + update dependent tests

Extract the transition system subsystem from `src/utils.ts` into a new module `src/transitions.ts`. This includes the workflow state machine types, transition map, and resolution logic. `stepFolderName()` is **not** extracted here — it stays in `utils.ts` until Step 3 (fs-utils extraction), at which point transitions will import it from the new location.

## Context

`src/utils.ts` is a ~370-line catch-all containing 7 unrelated subsystems. The transition system — workflow state machine types, the `CAPABILITY_TRANSITIONS` map, and `resolveNextCapability()` — forms a coherent, self-contained subsystem that should live in its own module. `stepFolderName()` (a string-formatting utility) is used by the `review-code` resolver inside `CAPABILITY_TRANSITIONS`, but semantically belongs with filesystem helpers and will be extracted into `fs-utils.ts` during Step 3.

This is Step 1 of a 10-step refactoring. The re-export strategy in steps 1-4 enables incremental migration — `utils.ts` continues to provide all symbols via re-exports while capability files are updated later.

## What to Build

### 1. Create `src/transitions.ts`

A new module containing the transition system extracted from `src/utils.ts`. This file should contain:

#### Types
- `TransitionContext` — interface with `capability`, `workingDir`, `params?` fields
- `TransitionResult` — interface with `capability` and `params?` fields
- `CapabilityTransitionResolver` — function type `(ctx: TransitionContext) => string | TransitionResult | undefined`

#### Data
- `CAPABILITY_TRANSITIONS` — `Record<string, string | CapabilityTransitionResolver>` mapping capability names to next capability (string) or resolver callback. Contains entries for: `create-goal`, `create-plan`, `evolve-plan`, `execute-task`, `review-code`.

The `review-code` resolver calls `stepFolderName(stepNumber)` to construct step folder paths (e.g., checking for `S03/APPROVED`). Since `stepFolderName` is extracted in Step 3, the new transitions module must **import it from `./utils`** temporarily:

```typescript
import { stepFolderName } from "./utils";
```

This import will be updated to `./fs-utils` after Step 3.

#### Functions
- `resolveNextCapability(capability: string, ctx: TransitionContext): TransitionResult | undefined` — resolves next capability using `CAPABILITY_TRANSITIONS`, handling both plain-string and callback transitions

#### Import requirements
- `node:fs` (for `fs.existsSync` in the `review-code` resolver)
- `node:path` (for path construction in the `review-code` resolver)
- `stepFolderName` from `./utils` (temporary — updated after Step 3)

All symbols must be `export`ed. The implementation should be an exact copy of the transition logic from `src/utils.ts` — no behavioral changes, just extraction.

### 2. Update `src/utils.ts` to re-export from `./transitions`

Remove the extracted symbols from `src/utils.ts` and replace with re-exports:

```typescript
export {
  resolveNextCapability,
  CAPABILITY_TRANSITIONS,
} from "./transitions";
export type { TransitionContext, TransitionResult, CapabilityTransitionResolver } from "./transitions";
```

**Do not** remove `stepFolderName` from `utils.ts` — it remains there until Step 3 (fs-utils extraction). The re-export is NOT needed for it.

The remaining code in `utils.ts` (queues, fs-utils, capability-config sections) stays unchanged at this point.

### 3. Update test file imports

Only `__tests__/transition.test.ts` needs updating — it's the only test that imports transition-specific symbols. The other three test files (`smoke.test.ts`, `execute-task-initial-message.test.ts`, `review-code-config.test.ts`) import only `stepFolderName`, which stays in `utils.ts` until Step 3, so they require no changes in this step.

#### `__tests__/transition.test.ts`

Split the current single import into two:

**Before:**
```typescript
import {
  CAPABILITY_TRANSITIONS,
  resolveNextCapability,
  type TransitionContext,
  stepFolderName,
} from "../src/utils";
```

**After:**
```typescript
import {
  CAPABILITY_TRANSITIONS,
  resolveNextCapability,
  type TransitionContext,
} from "../src/transitions";
import { stepFolderName } from "../src/utils";
```

`stepFolderName` is still needed by the test's `createGoalTree` helper function. It stays imported from `../src/utils` since it hasn't been moved yet (Step 3 will update this).

## Code Components

| Component | Location | Description |
|-----------|----------|-------------|
| `TransitionContext` | `src/transitions.ts` | Interface — context for transition resolution |
| `TransitionResult` | `src/transitions.ts` | Interface — result of transition resolution |
| `CapabilityTransitionResolver` | `src/transitions.ts` | Type — callback signature for conditional transitions |
| `CAPABILITY_TRANSITIONS` | `src/transitions.ts` | Constant — deterministic workflow state machine map |
| `resolveNextCapability()` | `src/transitions.ts` | Pure function — resolves next capability from transition map |

Note: `stepFolderName()` is **not** part of this step. It remains in `src/utils.ts` until Step 3 extracts it into `src/fs-utils.ts`.

## Approach and Decisions

- **Exact copy extraction:** Copy the transition-related code from `src/utils.ts` verbatim into `src/transitions.ts`. Do not modify logic, variable names, or structure. The refactoring is purely structural.
- **Temporary import from utils:** `transitions.ts` imports `stepFolderName` from `./utils` because the review-code resolver needs it to construct step folder paths. This is a known technical debt that Step 3 resolves when `stepFolderName` moves to `fs-utils.ts`.
- **Re-export for backward compat:** After extraction, `src/utils.ts` re-exports the transition symbols so that files not yet updated (capability files in steps 6-7) continue to compile. Re-exports use the pattern: `export { named } from "./transitions"` for values and `export type { T } from "./transitions"` for types.
- **Follow existing import patterns:** Use bare specifiers with `.ts` extension omitted, consistent with the rest of the codebase.
- **Test imports split:** The transition test needs symbols from both modules — import each from its canonical source.

## Dependencies

None. This is Step 1 — no prior steps required.

## Files Affected

- `src/transitions.ts` — created: transition system (types, CAPABILITY_TRANSITIONS, resolveNextCapability)
- `src/utils.ts` — modified: remove extracted transition symbols, add re-exports from `./transitions`; `stepFolderName` stays in-place
- `__tests__/transition.test.ts` — modified: split import — transition symbols from `../src/transitions`, `stepFolderName` stays from `../src/utils`

## Acceptance Criteria

- [ ] `src/transitions.ts` exists with all listed symbols exported (`TransitionContext`, `TransitionResult`, `CapabilityTransitionResolver`, `CAPABILITY_TRANSITIONS`, `resolveNextCapability`)
- [ ] `src/transitions.ts` imports `stepFolderName` from `./utils` (temporary dependency on Step 3)
- [ ] `src/utils.ts` re-exports transition symbols from `./transitions` (backward-compat during migration)
- [ ] `src/utils.ts` still contains the `stepFolderName` definition (not yet extracted)
- [ ] `npm run check` reports no errors
- [ ] `transition.test.ts` imports transition symbols from `../src/transitions`, `stepFolderName` from `../src/utils`, and tests pass (`npm test __tests__/transition.test.ts`)
- [ ] `smoke.test.ts` unchanged — still imports from `../src/utils`, tests pass
- [ ] `execute-task-initial-message.test.ts` unchanged — still imports from `../src/utils`, tests pass
- [ ] `review-code-config.test.ts` unchanged — still imports from `../src/utils`, tests pass

## Risks and Edge Cases

- **Temporary import chain:** `transitions.ts` → `./utils` creates a dependency that exists only during Steps 1-2. Step 3 will flip this to `transitions.ts` ← `fs-utils.ts`. Document this clearly so the executor doesn't treat it as permanent.
- **Missing stepFolderName from transitions:** If the executor forgets that stepFolderName is NOT extracted in this step, they may break utils.ts or create a duplicate definition. The review-code resolver MUST be able to call stepFolderName — verify the import resolves at compile time.
- **Re-export syntax:** Use `export { } from "./transitions"` (not a separate import + export) to avoid duplicating bindings in `utils.ts`.
- **Test isolation:** After extraction, running `npm test __tests__/transition.test.ts` should pass — the test imports from both modules, proving the cross-module dependency works.
