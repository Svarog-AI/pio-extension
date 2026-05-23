---
totalSteps: 2
steps:
  - name: add-turn-threshold-config
    complexity: task
  - name: add-turn-count-detection
    complexity: task
---

# Plan: Detect Agent Refinement Loops

Extends `session-guard.ts` with a one-time turn-count nudge to detect agents stuck in refinement loops. Configuration reads from `~/.pi/pio-config.yaml` following the pattern established in `model-config.ts`.

## Prerequisites

None.

## Steps

### Step 1: Add turn threshold config reading

Add a `guards.turnThreshold` field to the config schema and provide a function to read it with a hard-coded default fallback. This follows the existing pattern in `src/model-config.ts`: read from `~/.pi/pio-config.yaml`, cache result, fall back gracefully on missing or invalid values.

**Description:**
- Extend `PioConfig` interface in `src/model-config.ts` with an optional `guards` object containing `turnThreshold?: number`.
- Add a constant `DEFAULT_TURN_THRESHOLD` (value: 12) as the hard-coded default.
- Add `readTurnThreshold(): number` that reads from config (via `readConfig()`) and returns `guards.turnThreshold` if it's a positive integer, otherwise returns the default.
- Validation: threshold must be a positive integer (`> 0`, `Number.isInteger()`). Missing, zero, negative, or non-integer values all fall back to the default.
- The function should re-use the cached config from `readConfig()` — no new file I/O.

**Acceptance Criteria:**
- `PioConfig` interface includes an optional `guards` field with optional `turnThreshold?: number`.
- `DEFAULT_TURN_THRESHOLD` is exported as a constant with value 12.
- `readTurnThreshold()` returns the configured value when `~/.pi/pio-config.yaml` contains a valid positive integer under `guards.turnThreshold`.
- `readTurnThreshold()` returns `DEFAULT_TURN_THRESHOLD` (12) when config file is missing, empty, or `turnThreshold` is absent, zero, negative, or non-integer.
- `npx tsc --noEmit` reports no errors.

**Files Affected:**
- `src/model-config.ts` — extend `PioConfig`, add `DEFAULT_TURN_THRESHOLD`, add `readTurnThreshold()`

### Step 2: Add turn-count detection to session-guard

Add the turn-count tracking logic to `session-guard.ts`. On each `turn_end` event in a pio session, increment a counter. When the counter reaches the configured threshold, send a one-time nudge via `pi.sendUserMessage()`. Reset at `before_agent_start`.

**Description:**
- Add two module-level state variables: `let turnCount = 0` and `let turnWarningFired = false`.
- On each `turn_end` event (after the existing `isActivePioSession` guard), increment `turnCount`. When `turnCount >= turnThreshold` AND `turnWarningFired` is false, call `pi.sendUserMessage()` with a nudge message and set `turnWarningFired = true`.
- The nudge message should reference the current turn count and encourage self-diagnosis: recap goal, evaluate if stuck in a loop, ship work if ready. Use `{ deliverAs: "followUp" }` consistent with existing prompts.
- At `before_agent_start` (existing handler), reset both `turnCount = 0` and `turnWarningFired = false` along with the existing `markCompleteCalled = false`.
- Read threshold via `readTurnThreshold()` from `src/model-config.ts` at setup time (inside `setupSessionGuard`) so it's evaluated once per guard initialization.
- Add `__testSetTurnCount(value?: number): number` and `__testSetTurnWarningFired(value?: boolean): boolean` test-only accessors following the existing pattern (`__testSetActiveSession`, `__testSetMarkCompleteCalled`).

**Acceptance Criteria:**
- `turnCount` increments by 1 on each `turn_end` when `isActivePioSession` is true.
- When `turnCount` reaches the threshold, `pi.sendUserMessage()` is called exactly once with a message containing the turn count and loop-detection language.
- Subsequent `turn_end` events do NOT trigger additional warnings within the same run (`turnWarningFired` prevents repeats).
- `before_agent_start` resets both `turnCount` and `turnWarningFired` when `isActivePioSession` is true.
- The guard does NOT fire in non-pio sessions (`isActivePioSession` is false).
- `npx tsc --noEmit` reports no errors.

**Files Affected:**
- `src/guards/session-guard.ts` — add state variables, modify `turn_end` handler, modify `before_agent_start` handler, import `readTurnThreshold`, add test accessors

## Notes

- The default threshold of 12 is chosen as a reasonable midpoint: low enough to catch obvious loops, high enough to not nuisance-productive sessions. This is configurable and can be adjusted by the user in `~/.pi/pio-config.yaml`.
- Step 2 imports from `src/model-config.ts`, so Step 1 must complete first (type definitions and exported function).
- The existing `_cachedConfig` in `model-config.ts` handles caching — `readTurnThreshold()` should call `readConfig()` directly without introducing a separate cache layer.
- `setupSessionGuard` is called once at extension startup; reading the threshold there means config changes require extension reload (acceptable for v1, consistent with how model config works today).
