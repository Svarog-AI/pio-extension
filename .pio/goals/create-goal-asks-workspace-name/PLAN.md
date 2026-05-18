# Plan: Fix create-goal asking for workspace name

Update the create-goal initial message and prompt so the Goal Definition Assistant knows the workspace name without asking, eliminating redundant friction in the `pio_create_goal` → `/pio-next-task` flow.

## Prerequisites

None.

## Steps

### Step 1: Update defaultInitialMessage to include goal name as a given fact

**Description:** Change `CAPABILITY_CONFIG.defaultInitialMessage` in `src/capabilities/create-goal.ts` so it explicitly states the goal name rather than just the directory path. The `params` argument is already available and includes `goalName`. The new message should frame the goal name as a known fact (e.g., `"Goal workspace created: <name>\n\nWrite GOAL.md in this workspace."`) so the assistant doesn't need to confirm it with the user.

**Acceptance criteria:**
- [ ] `CAPABILITY_CONFIG.defaultInitialMessage(goalDir, { goalName: "my-feature" })` returns a string containing `"my-feature"` (the goal name, not just the directory path)
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/capabilities/create-goal.ts` — change `defaultInitialMessage` to include `params.goalName` and frame it as a given fact

### Step 2: Update create-goal prompt to remove "ask for workspace name" instructions

**Description:** Modify `src/prompts/create-goal.md` so the assistant does not ask the user to confirm the workspace/goal name. Specifically:
- In the Setup section, clarify that the goal name is provided by the session (from the initial message) and should be used directly without asking.
- In Step 1 ("Understand the goal"), remove or rephrase the "always confirm with the user" language about the goal name. The assistant should derive the name from the initial message and proceed to ask about the goal's purpose, scope, and requirements instead.
- Clarify that if the `initialMessage` provides additional context (e.g., issue content from `goal-from-issue`), the assistant should use those directly.

**Acceptance criteria:**
- [ ] `src/prompts/create-goal.md` no longer instructs the assistant to "always confirm" or ask the user about the workspace/goal name
- [ ] The Setup section explicitly states that the goal name is provided by the session and should not be asked for
- [ ] Step 1 focuses on understanding the goal's purpose, scope, and requirements — not confirming the name
- [ ] `npx tsc --noEmit` reports no errors

**Files affected:**
- `src/prompts/create-goal.md` — rewrite Setup section and Step 1 to remove "always confirm" language; clarify that goal name is provided

## Notes

- The `goal-from-issue` flow passes a custom `initialMessage` (e.g., `"Convert the following issue into a goal:\n\nIssue file: <path>"`). In `resolveCapabilityConfig`, explicit `params.initialMessage` takes priority over `defaultInitialMessage`. This means the changes in Step 1 only affect the default path and do not break the `goal-from-issue` integration.
- Both steps are independent and could be executed in parallel, but Step 2 references the improved initial message format from Step 1 for clarity — execute sequentially for safety.
