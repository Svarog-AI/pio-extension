# Task: Move `pio_mark_complete` from `validation.ts` to `session-capability.ts`

Move the `pio_mark_complete` tool registration and execution logic into `session-capability.ts`, where it orchestrates the full capability exit lifecycle (file validation → postValidate → transition routing → task enqueuing → postExecute → cleanup).

## Context

Currently, `pio_mark_complete` lives in `src/guards/validation.ts` alongside file protection handlers (`tool_call`, `resources_discover`). This mixes cross-cutting concerns (read-only/write-allowlist enforcement) with capability lifecycle management (transition routing, marker creation). After Steps 1–5, the `postValidate` and `postExecute` hooks are wired through `capability-config.ts`, but there's no centralized orchestrator — `pio_mark_complete` still runs inline validation without calling these hooks.

This step centralizes exit orchestration in `session-capability.ts`, which already owns session startup (`resources_discover`) and prompt injection (`before_agent_start`). The mark-complete tool now becomes the exit counterpart to session startup.

## What to Build

### 1. `pio_mark_complete` tool in `session-capability.ts`

Create a new tool definition using `defineTool` from `@earendil-works/pi-coding-agent`. Parameters: `Type.Object({})` (no params). The execute handler reads the `pio-config` custom entry and orchestrates the full exit flow:

1. **Read config** — find the `pio-config` custom entry, extract `CapabilityConfig`. If no config exists (not a capability session), return success with `terminate: true` and a message indicating no validation configured.
2. **File-existence validation** — call `validateOutputs(config.validation, config.workingDir)` from `validation.ts`. On failure, return error listing missing files without terminating (agent stays in session).
3. **PostValidate hook** — if `config.postValidate` is defined, call `postValidate(config.workingDir!, config.sessionParams)`. On failure (`success: false`), return the error message to the agent without terminating. On success, continue.
4. **Transition routing + task enqueuing** — create `GoalState` from `workingDir`, resolve `stepNumber` from session params (same logic as current validation.ts: explicit stepNumber first, then `state.currentStepNumber()` fallback). Call `resolveTransition(capability, state, { goalName, stepNumber, _sessionContext })`. On success, enqueue via `enqueueTask()`, record audit via `recordTransition()`, and write last task via `writeLastTask()`.
5. **PostExecute hook** — if `config.postExecute` is defined, call `postExecute(config.workingDir!, config.sessionParams)`. Await if async. Errors here are caught/logged but don't block termination (side effects after validation).
6. **Cleanup** — delete files in `config.fileCleanup` (same as current behavior).
7. **Return success with `terminate: true`**.

### 2. Register the tool inside `setupCapability`

Inside the existing `setupCapability(pi: ExtensionAPI)` function, add `pi.registerTool(markCompleteTool)` at the top of the function (before the event handler registrations). This is where all capability lifecycle handlers are registered — mark-complete fits naturally here.

### 3. Remove mark-complete from `validation.ts`

From `src/guards/validation.ts`:
- Remove the `markCompleteTool` definition entirely (the full `defineTool({...})` block and the `execute` handler)
- Remove `pi.registerTool(markCompleteTool)` from `setupValidation`
- Remove unused imports: `defineTool`, `Type`, `resolveTransition`, `recordTransition`, `createGoalState`, `enqueueTask`, `writeLastTask`, `resolveGoalDir`
- Keep `setupValidation` but it now only registers event handlers (`resources_discover` for config loading, `turn_start` for counter reset, `tool_call` for file protection)
- Keep `validateOutputs` and `extractGoalName` — these are still used (validateOutputs is called by the new mark-complete tool in session-capability.ts; extractGoalName may be needed for validation.test.ts or future use)

### 4. Import dependencies into `session-capability.ts`

The new mark-complete tool needs:
- `defineTool`, `Type` from `@earendil-works/pi-coding-agent`
- `validateOutputs` from `../guards/validation`
- `resolveTransition`, `recordTransition` from `../state-machine`
- `createGoalState` from `../goal-state`
- `enqueueTask`, `writeLastTask` from `../queues`

### Code Components

#### `markCompleteTool` (in session-capability.ts)

A tool definition matching the current shape in validation.ts but with the enhanced lifecycle flow. Key structural difference: instead of inline review-task automation, it calls `config.postValidate` and `config.postExecute` from the resolved `CapabilityConfig`.

Interface signature for reference only:
```typescript
const markCompleteTool = defineTool({
  name: "pio_mark_complete",
  label: "Pio Mark Complete",
  description: "...",
  promptSnippet: "Signal that your work is done. Validates expected output files.",
  parameters: Type.Object({}),
  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) { ... }
});
```

#### Updated `setupCapability` in session-capability.ts

Add tool registration at the top of the function:
```typescript
export function setupCapability(pi: ExtensionAPI) {
  pi.registerTool(markCompleteTool);
  // existing resources_discover handler...
  // existing before_agent_start handler...
}
```

#### Updated `setupValidation` in validation.ts

After removing mark-complete, the function registers only event handlers:
- `resources_discover` — load config (validation rules, working dir, capability name, file protection paths)
- `turn_start` — reset one-shot gate counters
- `tool_call` — file protection (default-deny .pio/ writes + allowlist + read-only blocklist)

### Approach and Decisions

- **Follow existing mark-complete logic closely.** The execute handler should preserve the same param propagation, step number derivation, and task enqueuing logic from validation.ts. This is a move-and-enhance, not a rewrite.
- **`validateOutputs` stays in `validation.ts`.** It's a pure utility — no capability-specific logic. Moving it to `fs-utils.ts` is optional (Step 8 considers this). Keep it where it is for now to minimize change surface.
- **Extract goal name from `workingDir`.** Use the existing `extractGoalName` function from `validation.ts`. Import it into `session-capability.ts` for the mark-complete handler. Alternatively, use `path.basename(goalDir)` since goal dirs follow `<cwd>/.pio/goals/<name>` pattern — but using the existing function avoids introducing subtle differences.
- **Error handling in postExecute:** Catch and log errors from `postExecute` but don't block termination. postExecute runs after validation and transitions are complete — its errors are non-fatal side effects.
- **No changes to `src/index.ts`.** The wiring imports `setupValidation` and `setupCapability` by function name — no tool-level imports needed. After this change, `setupValidation` still exists (just registers fewer things) and `setupCapability` now also registers the mark-complete tool.

## Dependencies

- **Step 1:** `src/frontmatter.ts` must exist with `extractFrontmatter` and `validateAndCoerce`.
- **Step 2:** `review-task.ts` must export `applyReviewDecision`, `REVIEW_OUTPUT_SCHEMA`, `ReviewOutputs`.
- **Step 3:** `goal-state.ts` must have `getReviewOutputs()`.
- **Step 4:** `types.ts` must define `PostValidateCallback` and `PostExecuteCallback`.
- **Step 5:** `capability-config.ts` must pass through `postValidate` and `postExecute` into resolved `CapabilityConfig`, and `review-task.ts` CAPABILITY_CONFIG must define `postValidate`.

## Files Affected

- `src/capabilities/session-capability.ts` — gain `pio_mark_complete` tool definition + registration inside `setupCapability`; gain imports for validation, state-machine, queues, goal-state
- `src/guards/validation.ts` — remove `markCompleteTool` definition, remove `pi.registerTool(markCompleteTool)`, remove unused imports (`defineTool`, `Type`, transition/queue imports). Keep `validateOutputs`, `extractGoalName`, and file protection handlers.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` reports no errors
- [ ] `pio_mark_complete` tool is registered by `session-capability.ts` (not `validation.ts`)
- [ ] Tool execution flow: validateOutputs → postValidate → resolveTransition → enqueueTask → recordTransition → postExecute → cleanup → terminate
- [ ] For review-task capability, valid frontmatter creates markers and enqueues correct next task
- [ ] For non-review capabilities, tool passes file validation and resolves transition without postValidate/postExecute
- [ ] `validation.ts` no longer registers any tools (only event handlers for file protection)
- [ ] Existing test suite passes with no regressions

## Risks and Edge Cases

- **Module loading order:** `session-capability.ts` imports from `validation.ts` (for `validateOutputs`). Ensure no circular dependency: session-capability → validation, but validation doesn't import from session-capability. Current imports confirm this is safe.
- **`extractGoalName` import from validation.ts:** This creates a new dependency direction (session-capability → validation). Verify no cycle: validation imports only from `typebox`, `node:fs`, `node:path`, `../types`, and itself. Safe.
- **Behavioral equivalence:** The mark-complete flow must produce identical results for non-review capabilities. Test that execute-task, create-plan, etc. still enqueue correct transitions without postValidate/postExecute hooks.
- **postExecute errors are non-fatal:** If a capability's `postExecute` throws, the session should still terminate successfully. Wrap in try/catch with `console.warn`.
