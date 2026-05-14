# Refactor Module Boundaries

Decompose `src/utils.ts` (a ~370-line catch-all containing 7 unrelated subsystems) into focused single-responsibility modules, and move infrastructure files (`validation.ts`, `turn-guard.ts`) out of `src/capabilities/` where they don't belong. The result is a clean `src/guards/` for event-handler infrastructure and a flat set of focused utility modules at the `src/` root — no behavioral changes, purely structural.

## Current State

### `src/capabilities/validation.ts` (~370 lines)
Contains three unrelated concerns mashed together:
- **Validation engine**: `ValidationRule` type (re-exported from `../types`), `validateOutputs()` that checks expected files exist on disk.
- **File protection layer**: `readOnlyFilePaths` / `writeAllowlistPaths` module-level state, enforced in the `tool_call` event handler (default-deny for `.pio/` writes, allowlist/blocklist enforcement).
- **`pio_mark_complete` tool**: Registers via `defineTool()`, runs validation on call, handles review-code automation (YAML frontmatter parsing, marker file creation), and auto-enqueues next task via the transition system.
- **Exit-gate logic**: Commented-out `session_before_switch` handler that would block session switches when outputs are missing (one-shot warning with hard cap of 3).

Currently lives in `capabilities/` but is primarily infrastructure consumed by all session capabilities, not itself a capability (tools+commands the agent invokes for a workflow step). Only registered via `setupValidation()` from `src/index.ts`.

### `src/capabilities/turn-guard.ts` (~100 lines)
Pure session management infrastructure:
- Tracks `isActivePioSession` module-level flag, set on `resources_discover`.
- Detects "dead turns" (thinking-only content with no tool execution) on `turn_end`.
- Sends recovery prompt via `pi.sendUserMessage()` to nudge the agent forward.
- Exports `isThinkingOnlyTurn()` (pure function) and `__testSetActiveSession()` (test helper).

No tools or commands defined. Registered via `setupTurnGuard()` from `src/index.ts`.

### `src/utils.ts` (~370 lines, 7 unrelated subsystems)

1. **Transition system** — `TransitionContext`, `TransitionResult`, `CapabilityTransitionResolver`, `CAPABILITY_TRANSITIONS`, `resolveNextCapability()`. Governs deterministic workflow state machines (create-goal → create-plan → evolve-plan → execute-task → review-code → loop). Used by `validation.ts` for auto-enqueuing next tasks and by the transition system itself.

2. **Session queue utilities** — `SessionQueueTask`, `queueDir()`, `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`. File operations on `.pio/session-queue/` for FIFO task management. Used by 10+ capability files.

3. **Issue utilities** — `issuesDir()`, `findIssuePath()`, `readIssue()`. Path resolution and file reading for `.pio/issues/`. Used by `create-issue.ts` and `goal-from-issue.ts`.

4. **Goal directory helpers** — `resolveGoalDir()`, `goalExists()`. Simple path construction for `.pio/goals/<name>`. Used by 9 capability files.

5. **Step folder helpers** — `stepFolderName()`, `discoverNextStep()`. Step numbering and discovery logic. `stepFolderName` used by 6 files across capabilities and validation. `discoverNextStep` used by `evolve-plan.ts` and `session-capability.ts`.

6. **Session name derivation** — `deriveSessionName()`. Formatting utility for sub-session naming conventions. Used only within `resolveCapabilityConfig()`.

7. **Capability config resolution** — `resolveCapabilityConfig()`, `StaticCapabilityConfig` re-export. Dynamic module loading (`import('./capabilities/${cap}')`) + config assembly. Framework-level infrastructure used by 8 capability files to resolve session configs. Imported via `../utils`.

### Import map (what imports from `../utils`)
- `create-goal.ts`: `enqueueTask`, `goalExists`, `resolveGoalDir`, `resolveCapabilityConfig`, `StaticCapabilityConfig`
- `create-issue.ts`: `issuesDir`
- `create-plan.ts`: `enqueueTask`, `resolveGoalDir`, `resolveCapabilityConfig`, `StaticCapabilityConfig`
- `delete-goal.ts`: `resolveGoalDir`, `goalExists`
- `evolve-plan.ts`: `enqueueTask`, `resolveGoalDir`, `resolveCapabilityConfig`, `stepFolderName`, `discoverNextStep`, `StaticCapabilityConfig`
- `execute-plan.ts`: `resolveGoalDir`, `resolveCapabilityConfig`, `StaticCapabilityConfig`
- `execute-task.ts`: `enqueueTask`, `resolveGoalDir`, `resolveCapabilityConfig`, `stepFolderName`, `StaticCapabilityConfig`
- `goal-from-issue.ts`: `enqueueTask`, `findIssuePath`, `goalExists`, `resolveGoalDir`, `resolveCapabilityConfig`
- `list-goals.ts`: `resolveGoalDir`, `SessionQueueTask`
- `next-task.ts`: `resolveCapabilityConfig`, `queueDir`, `readPendingTask`, `listPendingGoals`, `SessionQueueTask`
- `project-context.ts`: `resolveCapabilityConfig`, `StaticCapabilityConfig`
- `review-code.ts`: `enqueueTask`, `resolveGoalDir`, `resolveCapabilityConfig`, `stepFolderName`, `StaticCapabilityConfig`
- `session-capability.ts`: `discoverNextStep`
- `validation.ts`: `stepFolderName`, `resolveNextCapability`, `enqueueTask`, `writeLastTask`, `resolveGoalDir`

### `src/types.ts`
Already exists as a shared type hub (`ValidationRule`, `CapabilityConfig`, `StaticCapabilityConfig`, `ConfigCallback`, `PrepareSessionCallback`). Created specifically to break circular dependencies between utils, validation, and session-capability.

## To-Be State

### New directory: `src/guards/`
Event-handler infrastructure that wires into the pi ExtensionAPI lifecycle but is not itself a capability (no tools or commands registered for agent invocation). Two modules, both fitting the "guard" pattern:

#### `src/guards/validation.ts` (moved from `src/capabilities/validation.ts`)
Entire file moved, no internal restructuring needed — it's a single coherent lifecycle module:
- **Validation engine**: `validateOutputs()` checks expected files exist on disk.
- **File protection layer**: `tool_call` handler enforces read-only/write-allowlist/dot-pio-block rules.
- **`pio_mark_complete` tool**: validates outputs, handles review-code automation (frontmatter parsing, marker creation), auto-enqueues next task via transitions, and terminates the session.

These three concerns share module-level state (`validationRules`, `baseDir`, `readOnlyFilePaths`, `writeAllowlistPaths`) populated on `resources_discover` and consumed throughout the session lifecycle. Splitting `pio_mark_complete` into its own module would either duplicate the validation call or invert dependency directions (tool importing guard infrastructure). Keeping them together preserves the discover → enforce → validate → enqueue flow as one unit.

Imports updated to point to new locations of decomposed utils:
- `resolveNextCapability`, `enqueueTask`, `writeLastTask` → from new queue/transitions modules
- `stepFolderName` → from new transitions module
- `resolveGoalDir` → from new fs-utils module

#### `src/guards/turn-guard.ts` (moved from `src/capabilities/turn-guard.ts`)
Moved as-is. No dependencies on utils — zero import changes needed internally.

### Decomposed utilities

#### `src/transitions.ts` (new, extracted from utils.ts)
Coherent subsystem: workflow state machine and transitions.
- **Types**: `TransitionContext`, `TransitionResult`, `CapabilityTransitionResolver`
- **Data**: `CAPABILITY_TRANSITIONS` (the transition map)
- **Functions**: `resolveNextCapability()`
- **Also includes**: `stepFolderName()` — used by `CAPABILITY_TRANSITIONS["review-code"]` to resolve step folder paths, and consumed by 6 other files that already need transitions. Co-locating avoids an extra import for all those callers.

#### `src/queues.ts` (new, extracted from utils.ts)
Coherent subsystem: session queue file operations.
- **Type**: `SessionQueueTask`
- **Functions**: `queueDir()`, `enqueueTask()`, `readPendingTask()`, `listPendingGoals()`, `writeLastTask()`

#### `src/fs-utils.ts` (new, extracted from utils.ts)
Coherent subsystem: filesystem path helpers and issue utilities.
- **Goal directory**: `resolveGoalDir()`, `goalExists()`
- **Issue utilities**: `issuesDir()`, `findIssuePath()`, `readIssue()`
- **Step discovery**: `discoverNextStep()` (uses `stepFolderName` from transitions — creates a dependency: fs-utils → transitions)
- **Session naming**: `deriveSessionName()` (used only by `resolveCapabilityConfig`)

#### `src/capability-config.ts` (new, extracted from utils.ts)
Framework infrastructure: dynamic capability module loading and config assembly.
- **Function**: `resolveCapabilityConfig()` — handles `import('./capabilities/${cap}')`, derives `workingDir`, resolves step-dependent config callbacks.
- **Re-export**: `StaticCapabilityConfig` (from `./types`)
- **Dependencies**: imports `resolveGoalDir` from `fs-utils.ts`, `deriveSessionName` from `fs-utils.ts`

### Removed files
- `src/utils.ts` — deleted entirely after all symbols extracted
- `src/capabilities/validation.ts` — deleted after move to `src/guards/`
- `src/capabilities/turn-guard.ts` — deleted after move to `src/guards/`

### Import updates across the codebase
Every file importing from `../utils` or `./validation` / `./turn-guard` must be updated to import from the correct new module. Each capability will typically need 2-3 imports instead of one large `../utils` import, but each import targets a single-responsibility module.

### `__tests__/` updates (13 of 14 test files)
All tests importing from the moved/decomposed modules must have their import paths updated:

- **`transition.test.ts`**: imports from `../src/utils` → split across `../src/transitions` and `../src/queues`
- **`utils.test.ts`**: imports from `../src/utils` → split across `../src/transitions`, `../src/queues`, `../src/fs-utils`, `../src/capability-config`
- **`validation.test.ts`**: imports from `../src/capabilities/validation` → `../src/guards/validation`
- **`turn-guard.test.ts`**: imports from `../src/capabilities/turn-guard` → `../src/guards/turn-guard`
- **`capability-config.test.ts`**: imports from `../src/utils` → `../src/capability-config`
- **`evolve-plan.test.ts`**: imports from `../src/capabilities/validation` → `../src/guards/validation`, and from `../src/utils` → `../src/capability-config`
- **`execute-task-initial-message.test.ts`**: imports from `../src/utils` → `../src/transitions`
- **`review-code-config.test.ts`**: imports from `../src/utils` → `../src/transitions`
- **`session-capability.test.ts`**: imports from `../src/utils` → `../src/capability-config`
- **`smoke.test.ts`**: imports from `../src/utils` → `../src/transitions`
- **`step-discovery.test.ts`**: imports from `../src/utils` → `../src/fs-utils` and `../src/transitions`
- **`types.test.ts`**: imports from `../src/utils` → `../src/capability-config`
- **`next-task.test.ts`**: no changes needed (imports only from `session-capability`)

### `src/index.ts` updates
- `import { setupValidation } from "./capabilities/validation"` → `"./guards/validation"`
- `import { setupTurnGuard } from "./capabilities/turn-guard"` → `"./guards/turn-guard"`

### Backward compatibility
- All exported types and functions retain identical names and signatures
- `src/types.ts` remains unchanged (shared type hub)
- No public API surface changes — this is purely internal restructuring

### Verification
- `npm run check` must pass with zero errors
- All 14 existing tests in `__tests__/` must continue to compile and produce identical results
- No behavioral changes: identical runtime behavior before and after refactoring
