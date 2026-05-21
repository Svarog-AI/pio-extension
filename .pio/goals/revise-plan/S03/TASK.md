# Task: Create revise-plan capability implementation

Create `src/capabilities/revise-plan.ts` implementing the plan-revision capability following the established capability pattern.

## Context

The pio workflow currently has no way to restructure a plan mid-execution. When decisions during specification (evolve-plan) or implementation reveal that remaining steps are invalid, there is no mechanism to archive the old plan and write a fresh one while preserving completed work. This capability fills that gap — it archives `PLAN.md`, cleans up incomplete step folders, and launches a new planning session to write a corrected plan from scratch.

## What to Build

A complete capability module at `src/capabilities/revise-plan.ts` following the established pattern:

1. **`CAPABILITY_CONFIG`** — static config exporting prompt filename (`"revise-plan.md"`), validation rules, file protections, default initial message, and the `prepareSession` lifecycle hook.
2. **Tool (`pio_revise_plan`)** — registered via `defineTool`, validates goal state, enqueues a revise-plan task via `enqueueTask()`.
3. **Command (`/pio-revise-plan <goal-name>`)** — validates goal state, resolves capability config, and launches the sub-session via `launchCapability()`.
4. **`setupRevisePlan()`** — registers the tool and command with the pi extension API.

### Code Components

#### Validation Function (inline, before queuing/launching)

`async function validateRevisePlan(name: string, cwd: string): Promise<{ goalDir: string; ready: boolean; error?: string }>`

Module-private inline validation — not a lifecycle hook.

Validates preconditions for running revise-plan:
- Goal workspace directory exists (use `resolveGoalDir`)
- `GOAL.md` exists in the goal directory
- `PLAN.md` exists in the goal directory

This is called inline by both the tool (`defineTool.execute`) and command handler, before any sub-session is queued or launched. Not a lifecycle hook on `CAPABILITY_CONFIG` — just a convention (see `validateGoal` in `create-plan.ts`, `validateAndFindNextStep` in `evolve-plan.ts`).

#### CAPABILITY_CONFIG

Follow the `StaticCapabilityConfig` interface from `src/types.ts`:

```typescript
export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "revise-plan.md",
  validation: { files: ["PLAN.md"] },  // new PLAN.md must exist before mark_complete passes
  readOnlyFiles: (workingDir, params) => [...],  // completed step folders are read-only
  writeAllowlist: (workingDir, params) => [...],  // permit creating new PLAN.md and PLAN_ARCHIVE/ files
  defaultInitialMessage: (workingDir, params) => "...",
  prepareSession: async (workingDir, params) => { ... },  // archive + cleanup
};
```

Key decisions for the config:
- **validation:** Requires `PLAN.md` to exist — the agent must produce a new PLAN.md before `pio_mark_complete` passes. This is correct because `prepareSession` archives the old one, leaving no current PLAN.md. The agent writes a fresh one during its session.
- **readOnlyFiles callback:** All remaining `S{NN}/` folders (those with `APPROVED` markers) are read-only. These contain completed work that must not be modified. Use `createGoalState(workingDir).steps()` to find all approved steps and build paths like `[`${folderName}/*`]`.
- **writeAllowlist callback:** Permits writing `PLAN.md` (the new plan) and files inside `PLAN_ARCHIVE/` (archives are created by prepareSession, but the agent may reference them). Return `["PLAN.md", "PLAN_ARCHIVE/*"]`.
- **defaultInitialMessage:** Inform the agent that revision is happening, goal workspace path, and that they should read archived plans and completed step folders. Include context about `revisionTriggerStep` if provided in params.

#### prepareSession Lifecycle Hook

`async function prepareSession(workingDir: string, params?: Record<string, unknown>): Promise<void>`

Handles all mechanical filesystem cleanup before the agent starts:

1. **Archive current PLAN.md:**
   - Create `PLAN_ARCHIVE/` directory if it doesn't exist (`fs.mkdirSync(dir, { recursive: true })`)
   - Generate timestamped filename: `PLAN-{YYYYMMDDTHHMMSSZ}.md` using `new Date().toISOString().replace(/[:.]/g, "")` or similar deterministic format (e.g., `Date.now()` for milliseconds-based uniqueness)
   - Copy current `PLAN.md` to the archive path using `fs.copyFileSync(source, dest)` followed by `fs.unlinkSync(source)` (copy-then-delete is safe — if delete fails after copy, we still have both files)
   
2. **Delete non-APPROVED step folders:**
   - Use `createGoalState(workingDir).steps()` to enumerate all step folders
   - For each step where `status() !== "approved"`, recursively delete the folder using `fs.rmSync(dir, { recursive: true, force: true })`

3. **Clean up REVISE_PLAN_NEEDED marker (if revisionTriggerStep provided):**
   - If `params?.revisionTriggerStep` is a number, resolve the corresponding step folder using `stepFolderName(revisionTriggerStep)` and delete the marker file at `S{NN}/REVISE_PLAN_NEEDED` (if it exists)
   - Note: if the triggering step was non-APPROVED, its entire folder was already deleted in step 2 above. This cleanup handles the case where the trigger came from an APPROVED step (whose folder survives).

#### Tool Definition

Register via `defineTool()` with:
- **name:** `"pio_revise_plan"`
- **label:** `"Pio Revise Plan"`
- **description:** Describes that it archives the current plan, cleans up incomplete steps, and launches a planning session to write a fresh plan. Queues the task — user runs `/pio-next-task` to start.
- **parameters:** `Type.Object({ name: Type.String(...) })` — goal workspace name
- **execute:** Call `validateRevisePlan()`, return error if not ready, otherwise call `enqueueTask(ctx.cwd, params.name, { capability: "revise-plan", params: { goalName: params.name, ... } })`. Forward any existing session params (like `revisionTriggerStep`) from the current context.

#### Command Handler

`async function handleRevisePlan(args: string | undefined, ctx: ExtensionCommandContext)`

- Parse `<goal-name>` from args, warn if missing
- Call `validateRevisePlan()` to validate
- On success: resolve config via `resolveCapabilityConfig(ctx.cwd, { capability: "revise-plan", goalName: name })`
- Launch sub-session via `launchCapability(ctx, config)`

#### Setup Function

`export function setupRevisePlan(pi: ExtensionAPI)` — register tool and command following the exact pattern of `setupCreatePlan()` and `setupEvolvePlan()`.

### Approach and Decisions

- Follow the capability pattern exactly as established in `create-plan.ts` (tool + command + config + setup) and `evolve-plan.ts` (callbacks for step-dependent config).
- Use `resolveGoalDir(cwd, name)` from `src/fs-utils.ts` for path resolution.
- Use `createGoalState(goalDir)` from `src/goal-state.ts` for goal state queries (hasGoal, hasPlan, steps enumeration, status checking).
- Use `stepFolderName(n)` from `src/fs-utils.ts` to format step folder names.
- Use `enqueueTask()` from `src/queues.ts` to queue the task.
- Use `launchCapability()` from `src/capabilities/session-capability.ts` to launch the sub-session.
- Use `resolveCapabilityConfig()` from `src/capability-config.ts` — it will dynamically import `./capabilities/revise-plan` based on the capability name `"revise-plan"`. This convention (capability name = module filename) is critical for config resolution to work.
- The shared planning skill lives at `src/skills/pio-planning/SKILL.md` (Step 1 plan deviation — actual path differs from original PLAN.md). Steps 5 and 7 will reference this; no action needed in Step 3 itself, but be aware the revise-plan prompt (Step 5) must reference this correct path.
- `prepareSession` is async (`async/await`) to accommodate potential async filesystem operations. It receives `(workingDir, params)` — access `params?.revisionTriggerStep` for marker cleanup.
- Archive timestamp format: use `new Date().toISOString().replace(/[:.]/g, "")` to produce safe filenames like `PLAN-2026-05-21T143022Z.md`. This is deterministic and sortable.

## Dependencies

- **Step 1 (shared planning skill):** Must be completed so the planning skill exists at `src/skills/pio-planning/SKILL.md`. The revise-plan prompt (Step 5) will reference it, but this step (3) only needs to know the capability pattern is stable.
- **Step 2 (`revisionNeeded()` on StepStatus):** Must be completed so that `state.steps()[N].revisionNeeded()` works. Used indirectly — the state machine (Step 4) uses this method to detect when to route to revise-plan. The revise-plan capability itself does not call `revisionNeeded()`, but the infrastructure depends on Step 2.

## Files Affected

- `src/capabilities/revise-plan.ts` — **created**: full capability implementation (CAPABILITY_CONFIG, validation, tool, command, setup)

## Acceptance Criteria

- [ ] `src/capabilities/revise-plan.ts` exists with exports matching capability pattern: `CAPABILITY_CONFIG`, `setupRevisePlan()`
- [ ] Tool registered as `pio_revise_plan`, command as `/pio-revise-plan <goal-name>`
- [ ] Validation rejects if goal workspace, `GOAL.md`, or `PLAN.md` is missing
- [ ] `prepareSession` archives PLAN.md to timestamped file in `PLAN_ARCHIVE/` and deletes non-APPROVED step folders
- [ ] `CAPABILITY_CONFIG` uses prompt `"revise-plan.md"`, validation for `PLAN.md`, writeAllowlist for `PLAN.md` only
- [ ] `npx tsc --noEmit` reports no errors

## Risks and Edge Cases

- **Archive filename collisions:** If revise-plan runs multiple times rapidly, filenames could collide. Using ISO timestamp with seconds precision may not be sufficient — consider appending milliseconds or using a counter from existing archive count.
- **PLAN.md already missing (edge case):** If someone manually deleted PLAN.md before revision, `fs.copyFileSync` will throw. Guard with an `fs.existsSync` check before archiving.
- **prepareSession errors are non-fatal:** The session-capability framework catches and logs prepareSession errors (wraps in try/catch with `console.warn`). Ensure critical operations (like archiving) don't silently fail — log meaningful errors if they do throw.
- **writeAllowlist callback needs workingDir:** When using callbacks for writeAllowlist/readOnlyFiles, ensure the callback signature matches `(workingDir: string, params?: Record<string, unknown>) => T` as defined in `types.ts`.
- **Validation vs prepareSession separation:** `validateRevisePlan` is called inline by the tool/command before queuing/launching. The actual filesystem work (archive, cleanup) happens later in `prepareSession` during session startup (`resources_discover`). This split — validate first, then prepare — matches every other capability.
