# Task: Include goal name in defaultInitialMessage

Update `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/finalize-goal.ts` to extract the human-readable goal name from params and include it in the kickoff message sent to finalize-goal sub-sessions.

## Context

The `finalize-goal` capability's `defaultInitialMessage` callback currently builds a message using only `params.goalDir` (a raw filesystem path). It never includes the human-readable goal name. When the finalization agent receives this message, it cannot clearly identify which goal it is working on — it sees only a path like `/home/user/project/.pio/goals/my-feature/`. Other capabilities reference the goal workspace but `finalize-goal` should go further by naming the goal explicitly so the agent knows what project artifact it's finalizing.

Currently:
```typescript
defaultInitialMessage: (workingDir, params) => {
  const goalDir = typeof params?.goalDir === "string" ? params.goalDir : "";
  return `Finalize the completed goal workspace at ${goalDir}. ...`;
}
```

## What to Build

Modify `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/finalize-goal.ts` to:

1. Extract `params.goalName` alongside `params.goalDir`, using the same defensive pattern (`typeof params?.goalName === "string" ? params.goalName : ""`)
2. When `goalName` is present (non-empty string), include it in the message so the kickoff reads like: `"Finalize the completed goal 'my-feature' at /path/to/goal."`
3. When `goalName` is absent or empty, degrade gracefully — the message should still be valid and reference `goalDir` as before

### Code Components

**Modified: `defaultInitialMessage` callback** (in `CAPABILITY_CONFIG`)

- Extract `goalName` from `params` using defensive type guard
- Interpolate `goalName` into the message string when available
- When `goalName` is present, phrase should be: `"Finalize the completed goal '<goalName>' at <goalDir>."`
- When `goalName` is absent, phrase should remain similar to current behavior (still reference `goalDir`)

### Approach and Decisions

- Follow the existing defensive extraction pattern already used for `goalDir`: `typeof params?.goalName === "string" ? params.goalName : ""`
- Do NOT change the function signature — it's `(workingDir: string, params?: Record<string, unknown>) => string` per `types.ts` line 108
- The rest of the message body (instructions about reading DECISIONS.md, PLAN.md, SUMMARY.md and updating PROJECT files) remains unchanged
- Keep the message concise — don't add fluff. Include goal name as a natural part of the opening sentence

## Dependencies

None. This is Step 1 with no prerequisites.

## Files Affected

- `src/capabilities/finalize-goal.ts` — modify `CAPABILITY_CONFIG.defaultInitialMessage` to extract and include `goalName` from params

## Acceptance Criteria

- [ ] `defaultInitialMessage` produces a string containing both the goal name and goal directory path when called with `{ goalName: "test-goal", goalDir: "/some/path" }`
- [ ] Existing test `CAPABILITY_CONFIG.defaultInitialMessage` still passes (message non-empty, contains goal directory)
- [ ] `npm run check` reports no type errors

## Risks and Edge Cases

- `params.goalName` may be absent (manual invocation via tool only sends `goalDir`). Handle gracefully — don't break when it's missing.
- `params` itself may be `undefined`. The existing code already handles this with optional chaining (`params?.goalDir`). Apply the same pattern for `goalName`.
- Ensure the message is still meaningful when `goalName` is empty but `goalDir` is present (backward compat with tool invocation path).
