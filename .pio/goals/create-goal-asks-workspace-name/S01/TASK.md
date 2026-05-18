# Task: Update defaultInitialMessage to include goal name as a given fact

Change `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/create-goal.ts` so it explicitly states the goal name rather than just the directory path, eliminating the need for the Goal Definition Assistant to ask the user for confirmation.

## Context

Currently, the initial message sent to the create-goal sub-session is `"Created goal workspace at ${goalDir}"`, which only provides a directory path like `/project/.pio/goals/my-feature`. The create-goal prompt then instructs the assistant to "always confirm with the user" about the goal name. This creates redundant friction — the goal name was already supplied by the user via the `pio_create_goal` tool parameter and should be treated as a known fact.

The `goal-from-issue` capability demonstrates a better pattern: it passes a descriptive `initialMessage` that gives clear context upfront without requiring confirmation.

## What to Build

Modify the `defaultInitialMessage` function in `CAPABILITY_CONFIG` so it uses `params.goalName` (already available as the second argument) to construct a message that states the goal name explicitly as a given fact, and frames the assistant's role clearly.

### Code Components

#### Updated `defaultInitialMessage` signature

Current:
```typescript
defaultInitialMessage: (goalDir) => `Created goal workspace at ${goalDir}`,
```

The function receives `(workingDir: string, params?: Record<string, unknown>)`. The `params` argument already contains `goalName` (set in `enqueueTask()` as `{ goalName: params.name }`). Update the function to use `params?.goalName` when available.

### Approach and Decisions

- Extract `goalName` from `params` using a type-safe check (`typeof params?.goalName === "string"`)
- If `goalName` is available, use it directly in the message instead of deriving from directory path
- If `goalName` is not available (edge case), fall back to the current behavior (directory path) so nothing breaks
- The new message should be concise and directive — something like `"Goal workspace created: <name>\n\nWrite GOAL.md in this workspace."`
- Follow the existing pattern: keep it as a single-line arrow function on the `defaultInitialMessage` property

## Dependencies

None. This is Step 1 of the plan with no prerequisites.

## Files Affected

- `src/capabilities/create-goal.ts` — change `CAPABILITY_CONFIG.defaultInitialMessage` to include `params.goalName` as a given fact
- `src/capabilities/create-goal.test.ts` — created: new test file to verify the initial message contains the goal name

## Acceptance Criteria

- [ ] `CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { goalName: "my-feature" })` returns a string containing `"my-feature"` (the goal name, not just the directory path)
- [ ] The returned message frames the goal name as a known fact (does not ask the user to confirm it)
- [ ] `npx tsc --noEmit` reports no errors
- [ ] Tests in `src/capabilities/create-goal.test.ts` pass: `npm test` includes the new tests

## Risks and Edge Cases

- When `goal-from-issue` invokes create-goal, it passes a custom `initialMessage` via params. In `resolveCapabilityConfig`, explicit `params.initialMessage` takes priority over `defaultInitialMessage`. Verify this path is unaffected — our change only affects the default path when no custom message is provided.
- The command handler (`handleCreateGoal`) calls `launchCapability` directly (not via queue). It passes `goalName` through `resolveCapabilityConfig` → `sessionParams`. Ensure the initial message still includes the goal name in this flow as well.
