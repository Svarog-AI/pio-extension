# Task: Move `validation.ts`, `turn-guard.ts` to `src/guards/` + update validation imports

Create the `src/guards/` directory and move both infrastructure files from `src/capabilities/` into it. These are event-handler modules that wire into the pi ExtensionAPI lifecycle but are not capabilities themselves — no tools or commands for agent invocation (except `pio_mark_complete` in validation). Moving `validation.ts` requires updating its imports to point to the new decomposed utility modules instead of `../utils`. Moving `turn-guard.ts` is a straight move with no internal changes.

## Context

`src/capabilities/validation.ts` (~370 lines) and `src/capabilities/turn-guard.ts` (~100 lines) are lifecycle infrastructure, not capabilities. They register event handlers (`resources_discover`, `tool_call`, `turn_end`) via the pi ExtensionAPI but don't define capability-specific tools or commands (except `pio_mark_complete`). The GOAL.md calls for a `src/guards/` directory to house these "guard" modules — separating lifecycle infrastructure from agent-invocable capabilities.

Steps 1–4 already decomposed `src/utils.ts` into four focused modules:
- `src/transitions.ts` — `resolveNextCapability`, `stepFolderName`, etc.
- `src/queues.ts` — `enqueueTask`, `writeLastTask`, etc.
- `src/fs-utils.ts` — `resolveGoalDir`, `goalExists`, etc.
- `src/capability-config.ts` — `resolveCapabilityConfig`, `StaticCapabilityConfig`

Currently, `src/utils.ts` re-exports everything from these modules for backward compatibility. `validation.ts` still imports from `../utils`. Step 5 moves validation to `src/guards/` and updates its imports to target the correct decomposed modules directly.

## What to Build

### 1. Create `src/guards/` directory

Create the directory if it doesn't exist. This is a new top-level module directory alongside `src/capabilities/`, `src/prompts/`, etc.

### 2. Move and update `src/guards/validation.ts`

Copy `src/capabilities/validation.ts` to `src/guards/validation.ts`. Update the imports that currently reference `../utils` to import from the correct decomposed modules:

**Current imports from `../utils`:**
```typescript
import { stepFolderName } from "../utils";
import { resolveNextCapability, enqueueTask, writeLastTask, resolveGoalDir } from "../utils";
```

**New imports (relative to `src/guards/validation.ts`):**
```typescript
import { resolveNextCapability, stepFolderName } from "../../transitions";
import { enqueueTask, writeLastTask } from "../../queues";
import { resolveGoalDir } from "../../fs-utils";
```

All other imports remain unchanged:
- `import type { ValidationRule } from "../types";` → stays as `../../types` (since validation is now one level deeper)

Wait — actually, `src/guards/validation.ts` is at the same depth as `src/capabilities/validation.ts` relative to `src/`. Both are inside a subdirectory of `src/`. So:
- `"../types"` becomes `"../../types"` — **NO**, they're both one level deep: `src/capabilities/` and `src/guards/` are siblings. The import `"../types"` was correct from `src/capabilities/`, and it should be the same from `src/guards/`: `"../types"` → still `"../types"`. Let me verify:
  - `src/capabilities/validation.ts` imports `"../types"` — resolves to `src/types.ts` ✓
  - `src/guards/validation.ts` imports `"../types"` — resolves to `src/types.ts` ✓

So `"../types"` stays as `"../types"`. Only the `../utils` imports change.

Additionally, validation.ts imports from `"./session-capability"` (same directory). This needs to change:
```typescript
// Current (from src/capabilities/validation.ts)
import { getSessionParams, getStepNumber } from "./session-capability";
// New (from src/guards/validation.ts)
import { getSessionParams, getStepNumber } from "../capabilities/session-capability";
```

### 3. Move `src/guards/turn-guard.ts`

Copy `src/capabilities/turn-guard.ts` to `src/guards/turn-guard.ts` as-is. This file has zero dependencies on `../utils` — its only imports are from `@earendil-works/pi-coding-agent`. No internal changes needed.

### Approach and Decisions

- **Move, don't copy (for this step):** Create the new files at `src/guards/`. The originals at `src/capabilities/` are still present but will be deleted in Step 8. During Steps 5–7, both copies coexist briefly — this is safe since no capability imports from the old paths during this window (the old capabilities/validation.ts is only imported by index.ts which gets updated in Step 7).
- **Follow existing patterns:** The import restructuring follows the same approach as Steps 1–4 — point to the correct decomposed module, preserve all exports and behavior identically.
- **No barrel/index file needed for `src/guards/`:** Unlike some projects, this codebase doesn't use barrel files. Each module is imported directly by path.

## Dependencies

- Step 1 (transitions.ts) — `validation.ts` imports `resolveNextCapability`, `stepFolderName` from `src/transitions.ts`
- Step 2 (queues.ts) — `validation.ts` imports `enqueueTask`, `writeLastTask` from `src/queues.ts`
- Step 3 (fs-utils.ts) — `validation.ts` imports `resolveGoalDir` from `src/fs-utils.ts`
- Steps 1–4 must be completed for the decomposed modules to exist

## Files Affected

- `src/guards/validation.ts` — created (moved from `src/capabilities/validation.ts`), imports updated to point to `../../transitions`, `../../queues`, `../../fs-utils`, and `../capabilities/session-capability`
- `src/guards/turn-guard.ts` — created (moved from `src/capabilities/turn-guard.ts`), no internal changes
- `__tests__/validation.test.ts` — update import: `../src/capabilities/validation` → `../src/guards/validation`; delete bad test ("non-review-code path is unaffected")
- `__tests__/turn-guard.test.ts` — update import: `../src/capabilities/turn-guard` → `../src/guards/turn-guard`

## Acceptance Criteria

- [ ] `src/guards/validation.ts` exists (moved from `src/capabilities/validation.ts`)
- [ ] `src/guards/turn-guard.ts` exists (moved from `src/capabilities/turn-guard.ts`)
- [ ] `src/guards/validation.ts` imports: `resolveNextCapability`, `stepFolderName` from `../../transitions`; `enqueueTask`, `writeLastTask` from `../../queues`; `resolveGoalDir` from `../../fs-utils`
- [ ] `src/guards/validation.ts` imports: `getSessionParams`, `getStepNumber` from `../capabilities/session-capability` (was `./session-capability`)
- [ ] `src/guards/turn-guard.ts` has unchanged internal imports (no utils dependencies)
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **Circular dependency risk:** `src/guards/validation.ts` imports from `../capabilities/session-capability`, which imports from `../fs-utils`. `fs-utils` depends on `transitions`. None of these depend back on `guards/validation`, so no cycle. However, verify that `session-capability.ts` doesn't import anything from validation (it shouldn't — it only provides `getSessionParams`/`getStepNumber`).
- **Old files still exist:** After Step 5, both `src/capabilities/validation.ts` and `src/guards/validation.ts` coexist. The old one is still imported by `src/index.ts` (updated in Step 7) and referenced by tests that haven't been updated yet. This is intentional — deletion happens in Step 8.
- **Remove bad test:** `__tests__/validation.test.ts` contains a test (`"non-review-code path is unaffected"`) that reads source code from disk to verify implementation details. Delete this test — it's not testing behavior, and it will break from any file move anyway.
