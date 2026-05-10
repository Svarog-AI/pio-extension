# Plan: Fix issue removal bug in goal-from-issue

Fix the race condition where `goal-from-issue` deletes the source issue file before the create-goal sub-session reads it, by removing premature deletion and deferring cleanup to validation success.

## Prerequisites

None.

## Steps

### Step 1: Add `fileCleanup` field to `CapabilityConfig`

**Description:** Add a new optional field to the `CapabilityConfig` interface in `session-capability.ts` that declares files to be deleted when validation succeeds. This keeps cleanup metadata serializable through the JSONL session file (no functions), and lets any capability declare post-success cleanup without special-casing.

```ts
// New field on CapabilityConfig:
/** Files to delete when validation passes (absolute paths). */
fileCleanup?: string[];
```

The field is an array of absolute paths so it's forward-compatible — a future capability might want to clean up multiple files or temporary artifacts.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no TypeScript errors
- [ ] The new `fileCleanup?: string[]` field is added to the `CapabilityConfig` interface in `src/capabilities/session-capability.ts`
- [ ] No other files are modified yet (this step is purely structural)

**Files affected:**
- `src/capabilities/session-capability.ts` — add `fileCleanup` field to `CapabilityConfig` interface

### Step 2: Handle `fileCleanup` in `pio_mark_complete` validation

**Description:** In `validation.ts`, when `pio_mark_complete.execute` determines that validation has passed (before returning the success message), check whether the session config contains `fileCleanup`. If it does, delete each listed file with `fs.rmSync(path, { force: true })` and log what was cleaned up.

The relevant code block is around line 108 in `validation.ts` — inside the `if (result.passed)` branch of the tool's `execute` handler. After the auto-enqueue logic for next capability transitions, add a loop over `config.fileCleanup` that deletes each file. Use `{ force: true }` so it doesn't throw if the file is already gone.

The config shape in `pio_mark_complete.execute` already reads from `entry.data`, so this just needs a cast extension and a small cleanup block. The existing local type alias for `config` should be extended to include `fileCleanup?: string[]`.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no TypeScript errors
- [ ] When validation passes and `config.fileCleanup` is defined and non-empty, each path in the array is deleted via `fs.rmSync(path, { force: true })`
- [ ] If a file in `fileCleanup` doesn't exist, deletion is silently skipped (no error)
- [ ] The cleanup runs only when validation passes — not on failure

**Files affected:**
- `src/capabilities/validation.ts` — add cleanup logic inside `pio_mark_complete.execute`, within the `result.passed` branch

### Step 3: Wire `fileCleanup` through `resolveCapabilityConfig`

**Description:** Extend `resolveCapabilityConfig` in `utils.ts` so that when a task's params contain `fileCleanup`, it flows through to the resolved `CapabilityConfig`. Currently the function only extracts known fields (`capability`, `goalName`, `initialMessage`) from params — it needs to also forward `fileCleanup`.

The change is small: in the returned object literal, add a line that checks `Array.isArray(params?.fileCleanup)` and passes it through. This is needed for both paths:
- **Tool path:** `enqueueTask` writes `{ capability, params: { goalName, initialMessage, fileCleanup } }` → later `next-task.ts` spreads task.params into `resolveCapabilityConfig` as top-level keys
- **Command path:** `resolveCapabilityConfig(ctx.cwd, { capability: "create-goal", goalName: name, initialMessage: ..., fileCleanup: [...] })` — same pattern

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no TypeScript errors
- [ ] When params contain `fileCleanup: ["/some/absolute/path"]`, the resolved `CapabilityConfig.fileCleanup` contains that same array
- [ ] When params don't contain `fileCleanup`, `config.fileCleanup` is `undefined` (no behavior change for existing capabilities)

**Files affected:**
- `src/utils.ts` — extend `resolveCapabilityConfig` to pass through `fileCleanup` from params

### Step 4: Fix both paths in `goal-from-issue.ts`

**Description:** Remove all `fs.rmSync` calls from `goal-from-issue.ts`. The `fileCleanup` mechanism handles deletion after validation passes. Both paths need identical minimal changes:

1. **Tool path (`execute` handler):**
   - Remove the existing `fs.rmSync(validation.issuePath!, { force: true })` call
   - Keep `initialMessage` as-is (references the file path — which now stays on disk)
   - Pass `fileCleanup: [validation.issuePath!]` in the task params to `enqueueTask`

2. **Command path (`handleGoalFromIssue`):**
   - Remove the existing `fs.rmSync(validation.issuePath!, { force: true })` call
   - Keep `initialMessage` as-is (references the file path — which now stays on disk)
   - Pass `fileCleanup: [validation.issuePath!]` in the params to `resolveCapabilityConfig`

The create-goal sub-session will read the issue file from disk during its normal operation, and validation will delete it when GOAL.md is successfully produced.

**Acceptance criteria:**
- [ ] `npm run check` (`tsc --noEmit`) reports no TypeScript errors
- [ ] No `fs.rmSync` calls remain in `goal-from-issue.ts` (cleanup is fully delegated to validation via `fileCleanup`)
- [ ] Both tool and command paths keep the existing `initialMessage` that references the issue file path
- [ ] Both tool and command paths pass the issue absolute path via `fileCleanup` param

**Files affected:**
- `src/capabilities/goal-from-issue.ts` — remove `fs.rmSync` from both paths, add `fileCleanup` to params

## Notes

- The `fileCleanup` approach makes this pattern available to any capability in the future. For example, a "create PR from plan" capability could auto-delete a temporary diff file after successful session completion.
- On the tool path (via `enqueueTask`), the task is queued as JSON and later processed by `/pio-next-task`. The next-task handler already spreads `task.params` into `resolveCapabilityConfig`, so `fileCleanup` flows through automatically once Step 3 is done.
- No tests exist in this project; verification relies on `npm run check` and code review.
