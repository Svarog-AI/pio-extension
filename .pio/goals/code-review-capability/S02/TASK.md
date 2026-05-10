# Task: Update validation.ts to use conditional transitions and propagate params

Replace the hardcoded `{ goalName }` in validation.ts with `config.sessionParams` so that downstream capabilities receive full context (stepNumber, etc.), enabling conditional transition callbacks like `review-code` to make correct routing decisions.

## Context

Step 1 added `sessionParams` to `CapabilityConfig` and made `resolveCapabilityConfig` store it. However, validation.ts still passes only `{ goalName }` to both `resolveNextCapability` and `enqueueTask`. This means:

- The `"review-code"` transition callback (which needs `ctx.params.stepNumber`) always receives `undefined` for stepNumber
- Enqueued tasks lose params like `stepNumber`, so downstream capabilities don't know which step they're working on

Step 1 already changed the import and replaced the direct map lookup with `resolveNextCapability`. Step 2 completes the wiring by propagating sessionParams.

## What to Build

Two targeted changes inside the `pio_mark_complete` tool's `execute` function in `src/capabilities/validation.ts`:

### A. Pass sessionParams to resolveNextCapability

Replace:
```ts
resolveNextCapability(capability, { capability, workingDir: dir, params: { goalName } })
```

With:
```ts
resolveNextCapability(capability, { capability, workingDir: dir, params: config.sessionParams || {} })
```

This gives the transition callback full access to session context. The review-code callback reads `ctx.params.stepNumber` to construct `S{NN}/APPROVED` and check file existence. Without stepNumber it falls through to the default `"execute-task"` path, breaking the approve flow.

### B. Spread sessionParams into enqueued task params

Replace:
```ts
enqueueTask(cwd, { capability: nextCapability, params: { goalName } });
```

With:
```ts
enqueueTask(cwd, { capability: nextCapability, params: { goalName, ...(config.sessionParams || {}) } });
```

This preserves `stepNumber` and any other fields from the completing session. When a downstream capability's command handler reads `params.stepNumber`, it will find the correct value instead of `undefined`.

### C. Update the type cast to include sessionParams

The `config` variable is currently cast as:
```ts
const config = entry.data as { capability?: string; workingDir?: string; validation?: ValidationRule; fileCleanup?: string[] };
```

This needs to include `sessionParams` so the compiler knows it exists:
```ts
const config = entry.data as { capability?: string; workingDir?: string; validation?: ValidationRule; fileCleanup?: string[]; sessionParams?: Record<string, unknown> };
```

Alternatively, import `type { CapabilityConfig } from "../types"` and cast as `CapabilityConfig` directly. Either approach is acceptable — the inline type avoids adding a new import but duplicates part of the interface. The executor should pick whichever keeps the file's dependency graph cleanest.

### Code Components

| Change | Location | What it does |
|--------|----------|--------------|
| Type cast expansion (C) | `validation.ts` execute function, ~line 97 | Exposes `sessionParams` on the config object |
| resolveNextCapability call (A) | `validation.ts` execute function, ~line 108 | Passes full session params to transition resolver |
| enqueueTask call (B) | `validation.ts` execute function, ~line 113 | Spreads sessionParams into enqueued task params |

### Approach and Decisions

- **Minimal change scope.** Only the auto-enqueue block inside `if (result.passed)` is modified. The type cast, resolveNextCapability call, and enqueueTask call are the only lines that change.
- **No import changes needed.** `resolveNextCapability` is already imported (done in Step 1). If the executor casts as inline type rather than importing `CapabilityConfig`, no new imports are required at all.
- **GoalName duplication is acceptable.** Spreading `sessionParams` (which may contain `goalName`) alongside explicit `{ goalName }` means the last value wins in JS object spread. Since both would be the same value, this is harmless. The PLAN.md notes explicitly approve this pattern.
- **Backwards compatibility preserved.** Existing capabilities that don't set extra params are unaffected — `config.sessionParams` will contain at minimum `{ goalName }` from the command handler that launched the session.

## Dependencies

- **Step 1 must be completed first** — `resolveNextCapability`, `sessionParams` on `CapabilityConfig`, and `TransitionContext` are all needed
- Specifically depends on: `resolveNextCapability` export in utils.ts, `sessionParams` field in CapabilityConfig, `resolveCapabilityConfig` storing `sessionParams: params`

## Files Affected

- `src/capabilities/validation.ts` — modified: update type cast to include sessionParams, pass config.sessionParams to resolveNextCapability, spread config.sessionParams into enqueueTask params

## Acceptance Criteria

- [ ] Auto-enqueue calls `resolveNextCapability(capability, { capability, workingDir: dir, params: config.sessionParams || {} })` instead of `params: { goalName }`
- [ ] Enqueued task params include both explicit `goalName` and spread `sessionParams`: `{ goalName, ...(config.sessionParams || {}) }`
- [ ] The config type cast includes `sessionParams?: Record<string, unknown>` (either via inline type or CapabilityConfig import)
- [ ] Existing capabilities transition unchanged — string entries resolve identically through the same code path
- [ ] `npm run check` passes (zero type errors)

## Risks and Edge Cases

- **sessionParams could be undefined** on very old sessions or hand-queued tasks. The `|| {}` fallback handles this — but verify the cast allows it as optional.
- **If importing CapabilityConfig** creates a cycle: validation.ts already imports from utils.ts, and types.ts has no imports (explicitly cycle-safe). Importing from types.ts should be safe, but verify with `npm run check`.
- **goalName source of truth:** After the spread `{ goalName, ...(config.sessionParams || {}) }`, if sessionParams also contains goalName, the explicit goalName is overwritten by the spread. Both should be identical (same session), so this is safe. If they ever diverge, the last-value wins semantics are predictable.
