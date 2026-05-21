# Task: Add revise-plan transitions in state-machine.ts

Add two transition cases to `resolveTransition()` in `src/state-machine.ts`: evolve-plan → revise-plan (when a step signals plan revision is needed) and revise-plan → evolve-plan (after revision completes).

## Context

The pio state machine (`src/state-machine.ts`) routes capabilities through a pure switch statement via `resolveTransition()`. Currently it handles: `create-goal → create-plan → evolve-plan → execute-task → review-task → (evolve-plan)`, with `finalize-goal` as the terminal state.

Step 2 added `revisionNeeded()` to `StepStatus` (in `src/goal-state.ts`) which returns `true` when a step folder contains a `REVISE_PLAN_NEEDED` marker. Step 3 created the revise-plan capability (`src/capabilities/revise-plan.ts`). Now we need the state machine to know how to route traffic through revise-plan: detect when evolve-plan signals revision is needed, and route revise-plan back to evolve-plan after completion.

## What to Build

Modify `resolveTransition()` in `src/state-machine.ts` to handle two new transitions:

### 1. evolve-plan → revise-plan (conditional)

When evolve-plan completes but the current evolving step has `revisionNeeded() === true`, route to `"revise-plan"` instead of the normal `execute-task`. This indicates that decisions during specification require restructuring the entire plan.

**Guard:** Check `state.steps()` for the current step, then call `.revisionNeeded()` on it. The current step number comes from params (authoritative session param) or falls back to `state.currentStepNumber()`.

**Params:** Pass `revisionTriggerStep` set to the current step number. This tells revise-plan which step triggered the revision — used for validation boundaries and marker cleanup.

**Fall-through:** When `revisionNeeded()` is `false`, fall through to normal evolve-plan routing: if all steps are complete, route to `finalize-goal`; otherwise route to `execute-task`.

### 2. revise-plan → evolve-plan (unconditional)

After revise-plan successfully completes (archives old plan, cleans up incomplete steps, writes fresh PLAN.md), route back to `evolve-plan` so the Specification Writer can generate specs for the next incomplete step in the revised plan.

**Params:** Preserve `goalName`. Do NOT pass an explicit `stepNumber` — let evolve-plan discover the next step via `state.currentStepNumber()` (since revise-plan cleaned up non-APPROVED folders and wrote a fresh plan). However, if `revisionTriggerStep` was present in params, include it to preserve provenance.

## Code Components

### Modified: `transitionEvolvePlan()` 

Insert the revision check at the top of the function, before the existing `goalCompleted()` guard:

1. Determine the current step number (from params or state fallback)
2. Look up this step in `state.steps()` 
3. If found and `revisionNeeded()` returns `true`, return `{ capability: "revise-plan", params: { goalName, revisionTriggerStep: <currentStep> } }`
4. If not needed, fall through to existing logic (goalCompleted check → execute-task)

The function signature remains unchanged: `function transitionEvolvePlan(state: GoalState, params?)`.

### New: `transitionRevisePlan()` 

A new private helper function following the existing pattern:

```typescript
function transitionRevisePlan(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult {
  // Route to evolve-plan so next incomplete step gets specified.
}
```

Extract `goalName` from params. Build result with `capability: "evolve-plan"`. Preserve `goalName` and optionally forward `revisionTriggerStep` if present (for downstream provenance). Do NOT pass explicit `stepNumber` — let evolve-plan discover it.

### Modified: `resolveTransition()` switch statement

Add a new case for `"revise-plan"` that calls `transitionRevisePlan(state, params)`.

## Approach and Decisions

- **Follow existing helper function pattern:** Each transition has its own private function (`transitionCreateGoal`, `transitionEvolvePlan`, etc.). Add `transitionRevisePlan()` following this convention.
- **Use StepStatus.revisionNeeded():** Access via `state.steps()[N].revisionNeeded()` — already implemented in Step 2. No filesystem I/O in the state machine; all queries go through `GoalState` methods.
- **Handle missing step gracefully:** If `state.steps()` doesn't contain a matching step for the current stepNumber, treat revision as not needed and fall through to normal routing. This prevents crashes when params reference a step number that was already cleaned up.
- **revisionTriggerStep is a new param field:** It coexists with existing params (`goalName`, `stepNumber`). Downstream capabilities check for it via `typeof params?.revisionTriggerStep === "number"`. The revise-plan capability (Step 3) already handles this parameter in `prepareSession` and `defaultInitialMessage`.
- **Test using mockState:** Follow the existing test pattern — `mockState()` with `overrides`, `mockStep(stepNumber, statusValue)` for steps. Override `steps()` to return mock steps with `revisionNeeded: () => true/false` as needed.

## Dependencies

- **Step 2 (required):** `revisionNeeded()` method on `StepStatus` interface in `src/goal-state.ts`. Must be implemented and working.
- **Step 3 (context only):** `src/capabilities/revise-plan.ts` consumes `revisionTriggerStep` from params, but the state machine changes don't depend on its implementation — they only need to produce the correct transition result.

## Files Affected

- `src/state-machine.ts` — modified: add `transitionRevisePlan()` helper and revise-plan case in `resolveTransition()`, modify `transitionEvolvePlan()` to check `revisionNeeded()`
- `src/state-machine.test.ts` — modified: add test cases for evolve-plan → revise-plan and revise-plan → evolve-plan transitions

## Acceptance Criteria

- [ ] `resolveTransition("evolve-plan", state, params)` checks `revisionNeeded()` on the current step when stepNumber is available in params
- [ ] When `revisionNeeded()` returns `true`, routes to `"revise-plan"` with `revisionTriggerStep` set to the current step number in params
- [ ] When `revisionNeeded()` returns `false`, normal evolve-plan routing still works (execute-task / finalize-goal) — no regression
- [ ] `resolveTransition("evolve-plan", state, params)` handles missing stepNumber gracefully (falls through to existing behavior without crashing)
- [ ] `resolveTransition("revise-plan", state, params)` routes to `"evolve-plan"` preserving `goalName`
- [ ] Normal evolve-plan routing with `goalCompleted()` still routes to `finalize-goal` when no revision needed and all steps done — no regression
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **stepNumber missing from params:** When stepNumber is undefined, we can't look up the specific step to check `revisionNeeded()`. Fall through to existing behavior (derive from state). This is correct — without a stepNumber, there's no specific step that could have triggered revision.
- **Step not found in state.steps():** The current step number might reference a folder that was deleted or never existed. Use optional chaining / safe access: if the step doesn't exist, treat as "no revision needed" and continue normal routing.
- **Concurrent markers:** Multiple steps could theoretically have `REVISE_PLAN_NEEDED`. We check only the current step (matching stepNumber). This is correct behavior — we handle one revision trigger at a time.
- **Revision loop prevention:** If revise-plan itself triggers another revision, the state machine would route revise-plan → evolve-plan → revise-plan infinitely. However, this is prevented by design: revise-plan's `prepareSession` deletes non-APPROVED step folders (which contain markers), and evolve-plan checks the current evolving step — after revision, there's no marker to find.
