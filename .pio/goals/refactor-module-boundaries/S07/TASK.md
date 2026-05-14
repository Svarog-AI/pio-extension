# Task: Update `src/index.ts` imports

Update the extension entry point to import guard modules from their new `src/guards/` location instead of `src/capabilities/`.

## Context

Steps 1–4 extracted `src/utils.ts` into focused modules. Step 5 moved `validation.ts` and `turn-guard.ts` from `src/capabilities/` to `src/guards/`. Step 6 updated all capability files. Now the extension entry point (`src/index.ts`) still references the old paths — the final piece before old files can be deleted in step 8.

## What to Build

Two import path changes in `src/index.ts`:

1. `import { setupValidation } from "./capabilities/validation"` → `import { setupValidation } from "./guards/validation"`
2. `import { setupTurnGuard } from "./capabilities/turn-guard"` → `import { setupTurnGuard } from "./guards/turn-guard"`

No other changes — function calls, exports, and all other imports remain identical.

### Code Components

No new functions, types, or modules. Pure import path update.

### Approach and Decisions

- Locate lines 19–20 of `src/index.ts` (the two infrastructure imports near the top).
- Replace `"./capabilities/validation"` with `"./guards/validation"`.
- Replace `"./capabilities/turn-guard"` with `"./guards/turn-guard"`.
- Verify no other references to the old paths exist in `index.ts`.

## Dependencies

- **Step 5** (move validation.ts and turn-guard.ts to `src/guards/`) — must be completed so the new paths resolve.

## Files Affected

- `src/index.ts` — modified: update two import paths

## Acceptance Criteria

- [ ] `setupValidation` imported from `"./guards/validation"` (was `"./capabilities/validation"`)
- [ ] `setupTurnGuard` imported from `"./guards/turn-guard"` (was `"./capabilities/turn-guard"`)
- [ ] `npm run check` reports no errors

## Risks and Edge Cases

- **No behavioral impact:** This is a pure import path change. The exported functions (`setupValidation`, `setupTurnGuard`) retain identical signatures.
- **Verify no other references:** Ensure `index.ts` contains no remaining references to `"./capabilities/validation"` or `"./capabilities/turn-guard"` (e.g., in comments or strings).
