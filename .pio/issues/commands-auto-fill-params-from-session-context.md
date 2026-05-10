# Commands should auto-fill required parameters from session context

# Commands should auto-fill required parameters from session context

Currently all pio commands require explicit arguments — e.g. `/pio-create-plan <name>` always demands a goal name even when it's obvious from the current session context. This creates friction for both human users and agents who have to repeat information that's already available in the runtime environment.

## Examples of the problem

1. **Just finished a create-goal session, now want to plan:**
   - User runs `/pio-create-plan` — currently fails: `"Usage: /pio-create-plan <goal-name>"`
   - The goal name is trivially derivable from the current session's `pio-config.capability === "create-goal"` + `workingDir`

2. **Inside an execute-task session, want to evolve the next step:**
   - Agent runs `/pio-evolve-plan` — fails without goal name
   - Goal name is in the current `pio-config`

3. **Inside any goal-scoped session, want to mark complete and move on:**
   - The auto-transition in `validation.ts` already handles this by reading config from `sessionManager.getEntries()`
   - But command handlers don't leverage the same mechanism

4. **Just finished a plan step, running `/pio-execute-plan`:**
   - Should default to the current goal without needing to repeat it

## Proposed approach

### 1. Derive "current goal" from session config

Every pio capability session stores a `pio-config` custom entry with `capability`, `goalName` (via params), and `workingDir`. Command handlers should check this before requiring explicit args:

```ts
function getCurrentGoal(ctx: ExtensionCommandContext): string | undefined {
  const entries = ctx.sessionManager.getEntries();
  const entry = entries.find(e => e.type === "custom" && e.customType === "pio-config");
  if (!entry) return undefined;
  const config = entry.data as { workingDir?: string };
  if (config.workingDir) {
    return extractGoalName(config.workingDir); // already exists in validation.ts
  }
  return undefined;
}
```

### 2. Per-command resolution strategy

| Command | Parameter | Auto-fill source | Fallback |
|---|---|---|---|
| `/pio-create-plan` | `<name>` | Current session's goal name | Require explicit arg |
| `/pio-evolve-plan` | `<name>` | Current session's goal name | Require explicit arg |
| `/pio-execute-task` | `<name> [step]` | Current session's goal name + step number from config | Require explicit arg |
| `/pio-execute-plan` | `<name>` | Current session's goal name | Require explicit arg |
| `/pio-delete-goal` | `<name>` | **Never auto-fill** (dangerous operation) | Always require explicit arg |
| `/pio-create-goal` | `<name>` | N/A — always needs a new name | No auto-fill |

### 3. Notification when auto-filling

When a command infers a parameter from context, it should notify the user so the behavior is transparent:

```ts
ctx.ui.notify(`Using current goal "${name}" (auto-detected from session)`, "info");
```

This lets the user know what happened and provides a mental model for when args are optional.

### 4. Implementation options

**Option A:** Modify each command handler individually — check for `args`, fall back to `getCurrentGoal(ctx)`. Simple, explicit, no shared infrastructure needed.

**Option B:** Create a shared wrapper/middleware that injects default params before the handler runs. More DRY but adds abstraction layers.

**Option C:** Add a helper to `utils.ts` (e.g., `resolveCommandParams`) that encapsulates the current-goal lookup and per-command resolution rules. Middle ground — reusable without over-engineering.

## Scope

- All command handlers that accept `<name>` (goal name) as a required parameter
- Primarily: `create-plan.ts`, `evolve-plan.ts`, `execute-task.ts`, `execute-plan.ts`
- Explicitly excluded: `delete-goal.ts` (safety), `create-goal.ts` (always needs new input)

## Open questions

- Should auto-detection work across *all* sessions (including non-pio ones that happen to be in a goal directory), or only within pio-managed sessions?
- What if the current session's goal doesn't match the user's intent? (e.g., user is in execute-task for goal A but wants to create-plan for goal B) — explicit arg should always override, which is already handled.
- Should commands that operate on step numbers also auto-fill the step number from context (e.g., if current session is evolve-plan for step 3, `/pio-execute-task` defaults to step 3)?
- Do we want a flag like `/pio-create-plan --current` for explicit opt-in, or should it be automatic when no args are provided?

## Category

improvement

## Context

Relevant files:
- `src/capabilities/create-plan.ts` — `handleCreatePlan` requires `args`, shows usage on empty
- `src/capabilities/evolve-plan.ts` — `handleEvolvePlan` requires `args`, shows usage on empty
- `src/capabilities/execute-task.ts` — `handleExecuteTask` requires `args`, shows usage on empty
- `src/capabilities/execute-plan.ts` — `handleExecutePlan` requires `args`, shows usage on empty
- `src/capabilities/validation.ts` — `extractGoalName` helper and `sessionManager.getEntries()` pattern already exist here
- `src/capabilities/session-capability.ts` — `pio-config` custom entry with session params
- `src/types.ts` — `CapabilityConfig` interface with `workingDir`, `capability`


## Category

improvement
