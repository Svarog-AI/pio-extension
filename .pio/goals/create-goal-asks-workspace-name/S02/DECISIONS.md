# Accumulated Decisions (through Step 1)

## Plan Deviations

- **`prepareGoal` exported publicly** — `src/capabilities/create-goal.ts` (line ~38). Originally, TEST.md expected dynamic imports for testing. Instead, `prepareGoal` was made a public export (`export async function`). This is a permanent API surface change: downstream code or tests can now call `prepareGoal` directly without imports tricks.

## Implementation Details with Downstream Impact

- **`defaultInitialMessage` returns goal name as fact** — Step 1 updated `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/create-goal.ts` to produce `"Goal workspace created: <name>\n\nWrite GOAL.md in this workspace."` when `params.goalName` is present. Step 2's prompt rewrite should reference this format so the Setup section aligns with what the assistant actually receives.

- **`goal-from-issue` custom `initialMessage` still takes priority** — In `src/capability-config.ts` (line ~66), explicit `params.initialMessage` overrides `defaultInitialMessage`. Step 2 must preserve this: the prompt should not assume a specific initial message format — it should instruct the assistant that *whatever* the initial message says about the goal name, accept it as given.
