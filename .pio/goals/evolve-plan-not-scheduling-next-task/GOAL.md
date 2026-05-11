# Fix step-dependent validation for capabilities launched via /pio-next-task

When `evolve-plan`, `execute-task`, or `review-code` sessions are launched via `/pio-next-task` (processing a queued task), the config is missing `validation`, `readOnlyFiles`, and `writeAllowlist`. This causes `pio_mark_complete` to return "No validation rules configured for this session." — no file checking, no auto-enqueue of the next workflow task. The fix makes step-dependent configuration resolvable in `resolveCapabilityConfig()` so it works regardless of whether a session is launched via direct command or via the queue.

## Current State

There are two ways capability sessions are launched:

1. **Direct commands** (e.g., `/pio-evolve-plan <name>`): The command handler calls `resolveCapabilityConfig()` to get base config, then mutates it with step-dependent fields before calling `launchCapability()`. For example, `src/capabilities/evolve-plan.ts` (line ~145) does:
   - `config.validation = { files: [`${folderName}/TASK.md`, `${folderName}/TEST.md`] }` — validation depends on `stepNumber` to derive the folder name (`S01/`, `S02/`, etc.)
   - `config.writeAllowlist = [...]` — restricts writes to step spec files

2. **Queued tasks** (`/pio-next-task`): In `src/capabilities/next-task.ts`, `launchAndCleanup()` calls `resolveCapabilityConfig()` directly and passes the result to `launchCapability()` without any capability-specific overrides. The command handlers are never invoked.

Capabilities fall into two patterns:

- **Static config** — `create-goal` and `create-plan` define `validation`, `readOnlyFiles`, and `writeAllowlist` directly in `CAPABILITY_CONFIG` (see `src/capabilities/create-goal.ts`, `src/capabilities/create-plan.ts`). These work correctly via both paths because `resolveCapabilityConfig()` reads from `CAPABILITY_CONFIG`.

- **Step-dependent config** — `evolve-plan`, `execute-task`, and `review-code` cannot declare static validation because the expected files depend on `stepNumber` (e.g., `S01/TASK.md` vs `S02/TASK.md`). These capabilities set validation dynamically in their command handlers only:
  - `src/capabilities/evolve-plan.ts`: Sets `config.validation = { files: [`${folderName}/TASK.md`, `${folderName}/TEST.md`] }` and `config.writeAllowlist` (lines ~145-152)
  - `src/capabilities/execute-task.ts`: Sets `config.validation = { files: [`${folderName}/SUMMARY.md`] }` and `config.readOnlyFiles` (lines ~287-293)
  - `src/capabilities/review-code.ts`: Sets `config.validation = { files: [`${folderName}/REVIEW.md`] }`, `config.readOnlyFiles`, and `config.writeAllowlist` (lines ~313-327)

The consequence: when any of the three step-dependent capabilities is launched via `/pio-next-task`, `config.validation` is `undefined`. The auto-enqueue logic in `src/capabilities/validation.ts` (line ~100) checks `if (!rules || !dir)` and returns early with "No validation rules configured for this session." This breaks the workflow chain — after completing a step via queue, the user must manually launch the next capability.

The function `resolveCapabilityConfig()` in `src/utils.ts` (line ~160) builds config from `CAPABILITY_CONFIG` but has no mechanism to apply step-dependent overrides. The `CAPABILITY_TRANSITIONS` map (line ~200) handles capability chaining but not validation resolution.

## To-Be State

Step-dependent capabilities (`evolve-plan`, `execute-task`, `review-code`) will resolve correct `validation`, `readOnlyFiles`, and `writeAllowlist` regardless of whether launched via direct command or via `/pio-next-task`. This is achieved by:

1. Adding a mechanism to compute step-dependent config fields outside of command handlers. The most targeted approach: add a function (e.g., `resolveStepConfig(capability, params)`) in `src/utils.ts` that returns the dynamic overrides per capability based on `stepNumber` and `goalName`. This mirrors what each command handler currently does but in a centralized place.

2. Calling this new function inside `resolveCapabilityConfig()` (in `src/utils.ts`) so the returned config already includes validation rules. Alternatively, calling it in `next-task.ts` before `launchCapability()`, though resolving inside `resolveCapabilityConfig` is cleaner since all launch paths go through it.

3. Removing or simplifying the duplicate override logic in each command handler (`evolve-plan.ts`, `execute-task.ts`, `review-code.ts`). After the fix, these handlers should either:
   - Rely entirely on `resolveCapabilityConfig()` to produce correct config (preferred — single source of truth), OR
   - Keep overrides only if they need behavior different from the queue path

4. The `CAPABILITY_CONFIG` exports in the three affected capabilities may also need updating to provide default/static portions, but step-dependent fields should be resolved dynamically.

**Files to modify:**
- `src/utils.ts` — add `resolveStepConfig()` or similar; integrate into `resolveCapabilityConfig()`
- `src/capabilities/evolve-plan.ts` — remove inline `config.validation = ...` and `config.writeAllowlist = ...` overrides (or keep only if needed for command-specific behavior)
- `src/capabilities/execute-task.ts` — remove inline `config.validation = ...` and `config.readOnlyFiles = ...` overrides
- `src/capabilities/review-code.ts` — remove inline `config.validation = ...`, `config.readOnlyFiles = ...`, and `config.writeAllowlist = ...` overrides

**Verification:**
- Running `/pio-evolve-plan <goal>`, completing the session, and calling `pio_mark_complete` should validate outputs AND auto-enqueue `execute-task` (existing behavior — must not regress)
- Queueing an evolve-plan task via the tool (`pio_evolve_plan`), then running `/pio-next-task`, completing the session, and calling `pio_mark_complete` should now validate outputs AND auto-enqueue `execute-task` (previously broken)
- Same for execute-task → review-code → evolve-plan transitions
- `npm run check` passes (type correctness)

Related issues: `.pio/issues/evolve-plan-not-scheduling-next-task.md`, `.pio/issues/next-task-missing-validation-config.md`.
