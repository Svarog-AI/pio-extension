# Task: Change `resolveNextCapability()` return type and fix review-code transitions

Update the capability transition system in `src/utils.ts` so that `resolveNextCapability()` returns `{ capability, params? }` instead of a plain string, enabling transition callbacks to propagate adjusted parameters (e.g., incremented `stepNumber`) downstream.

## Context

When `pio_mark_complete` auto-enqueues the next task, `stepNumber` can be missing or incorrect. The root cause: transitions like `review-code → evolve-plan` need to increment `stepNumber` (approving step N means evolving step N+1), but the old transition system returned plain strings with no way to carry adjusted params. Fixing this requires a richer return type from `resolveNextCapability()`.

## What to Build

### 1. New interface: `TransitionResult`

Add a new exported interface in `src/utils.ts`:

```ts
export interface TransitionResult {
  capability: string;
  params?: Record<string, unknown>;
}
```

This replaces the bare-string return for transitions. When `params` is present, it contains adjusted values (e.g., incremented stepNumber). When omitted, callers should fall back to `ctx.params`.

### 2. Update `CapabilityTransitionResolver` type

Change the existing type in `src/utils.ts`:

```ts
export type CapabilityTransitionResolver = (ctx: TransitionContext) => string | TransitionResult | undefined;
```

This allows callbacks to return either a plain string (backward compat for non-step-aware transitions) or a `TransitionResult` with adjusted params.

### 3. Update `resolveNextCapability()` return type and implementation

Change `resolveNextCapability(capability, ctx)` from returning `string | undefined` to returning `TransitionResult | undefined`.

Implementation logic:
- When the transition value is a plain string (e.g., `"create-goal": "create-plan"`), wrap it as `{ capability: value, params: ctx.params }` so callers always get a consistent shape.
- When the transition value is a callback, invoke it with `ctx`. If it returns a `TransitionResult`, pass through. If it returns a plain string, wrap in `{ capability: result, params: ctx.params }`.
- Return `undefined` if no transition exists or the callback returns `undefined`.

### 4. Update `CAPABILITY_TRANSITIONS["review-code"]` callback

The existing callback checks for an `APPROVED` file to distinguish approval from rejection paths. Update it so both branches return `TransitionResult`:

**Approval path** (APPROVED file exists):
- Read current `stepNumber` from `ctx.params?.stepNumber`
- If stepNumber is a number, return `{ capability: "evolve-plan", params: { goalName: ctx.params?.goalName, stepNumber: stepNumber + 1 } }`
- Use the existing `stepFolderName(stepNumber)` helper to construct the path to check for `APPROVED`

**Rejection path** (no APPROVED file):
- If stepNumber is a number, return `{ capability: "execute-task", params: { goalName: ctx.params?.goalName, stepNumber } }` — re-execute the same step.
- If no stepNumber, fall back to the plain string `"execute-task"`.

### 5. Update `CAPABILITY_TRANSITIONS["evolve-plan"]` and `["execute-task"]`

Both are currently plain strings but need to preserve `stepNumber` through unchanged for step-aware transitions:

**`"evolve-plan"`:**
- If `ctx.params?.stepNumber` is a number, return `{ capability: "execute-task", params: { goalName: ctx.params?.goalName, stepNumber } }`
- Otherwise fall back to plain `"execute-task"`

**`"execute-task"`:**
- If `ctx.params?.stepNumber` is a number, return `{ capability: "review-code", params: { goalName: ctx.params?.goalName, stepNumber } }`
- Otherwise fall back to plain `"review-code"`

### 6. Non-step-aware transitions remain unchanged

`"create-goal": "create-plan"` and `"create-plan": "evolve-plan"` stay as plain strings. The updated `resolveNextCapability()` will wrap them automatically.

## Code Components

| Component | Location | Change |
|-----------|----------|--------|
| `TransitionResult` interface | `src/utils.ts` | New exported interface |
| `CapabilityTransitionResolver` type | `src/utils.ts` | Updated to allow `string \| TransitionResult \| undefined` |
| `CAPABILITY_TRANSITIONS["evolve-plan"]` | `src/utils.ts` | Converted from string to callback returning `TransitionResult` with stepNumber preserved |
| `CAPABILITY_TRANSITIONS["execute-task"]` | `src/utils.ts` | Converted from string to callback returning `TransitionResult` with stepNumber preserved |
| `CAPABILITY_TRANSITIONS["review-code"]` | `src/utils.ts` | Updated callback to return `TransitionResult` with incremented stepNumber on approval |
| `resolveNextCapability()` | `src/utils.ts` | Changed return type and wrapping logic for all transition types |

## Approach and Decisions

- **Use existing `stepFolderName()` helper** from utils.ts to construct the APPROVED file path in the review-code callback. Do not duplicate this logic.
- **Preserve backward compatibility:** The `CapabilityTransitionResolver` still accepts plain string returns from callbacks. The wrapping logic in `resolveNextCapability()` handles both shapes transparently.
- **Keep `ctx.params` as fallback:** When transitions don't explicitly set `params`, pass through `ctx.params` so downstream consumers get the original session params.
- **No changes to validation.ts yet** — that's Step 4's scope. This step focuses on making the correct data available from `resolveNextCapability()`.

## Dependencies

None. This is Step 1 with no prerequisite steps.

## Files Affected

- `src/utils.ts` — new interface, updated types, updated transitions, updated `resolveNextCapability()` return type and logic

## Acceptance Criteria

- [ ] `resolveNextCapability()` returns an object `{ capability, params? }` for all transitions (string and callback entries)
- [ ] Calling with capability `"review-code"` and params `{ stepNumber: 3 }` on approval returns `{ capability: "evolve-plan", params: { stepNumber: 4 } }`
- [ ] Calling with capability `"review-code"` and params `{ stepNumber: 3 }` on rejection returns `{ capability: "execute-task", params: { stepNumber: 3 } }`
- [ ] Non-step-aware transitions (`"create-goal": "create-plan"`, `"create-plan": "evolve-plan"`) still resolve correctly with the new return shape
- [ ] `npx tsc --noEmit` reports no type errors after changes

## Risks and Edge Cases

- **Callers of `resolveNextCapability()`:** Any code that calls this function (e.g., `validation.ts`) will need updating to handle the new object return type instead of a string. This step only changes the return type — downstream consumers are updated in later steps (Step 4). The executor should verify no other callers exist outside utils.ts and validation.ts.
- **`stepFolderName` availability:** The review-code callback uses `stepFolderName()` which must already be defined earlier in utils.ts (it's defined at the module level, not inside resolveNextCapability). Ensure proper ordering.
- **Type narrowing:** After changing the return type, TypeScript may require explicit narrowing in callers that previously expected `string | undefined`. This is expected and will be addressed by callers in subsequent steps.
