# Architecture

## Patterns and Design Decisions

### Extension Point Architecture

pio is a **pi extension** — it registers with the pi coding agent framework via `src/index.ts`, which exports a default function `(pi: ExtensionAPI) => void`. This function:
1. Registers discoverable skills (`resources_discover` event)
2. Wires shared infrastructure (`setupCapability`, `setupValidation`, `setupTurnGuard`)
3. Registers individual capabilities (`setupInit`, `setupCreateGoal`, etc.)

### Capability Pattern

Each workflow capability follows a consistent module structure:
1. **`CAPABILITY_CONFIG: StaticCapabilityConfig`** — single source of truth for session shape (prompt, validation rules, file protections, initial message)
2. **Tool (`defineTool`)** — agent-callable with TypeBox parameter schemas
3. **Command handler** — user-callable via `/pio-*` prefix in the TUI
4. **`setup*()` function** — registers both tool and command with the pi API

### Sub-Session Lifecycle

The `session-capability.ts` module orchestrates sub-sessions:
1. **Launch:** `launchCapability()` calls `ctx.newSession()` with a custom `pio-config` entry containing prompt, working directory, validation rules, and file protections
2. **Resources discover:** Config is read, prompts loaded, `prepareSession` hooks run, session name set
3. **Before agent start:** `.pio/PROJECT/OVERVIEW.md` + `_skill-loading.md` + capability prompt are injected as a custom conversation message (preserves pi's default system prompt). Model switching occurs here if `~/.pi/pio-config.yaml` specifies per-capability models
4. **File protection:** The `tool_call` event handler enforces read-only files and write allowlists, with a default-deny policy for `.pio/` writes outside the session's own goal workspace
5. **Completion:** Agent calls `pio_mark_complete`, which validates outputs, automates review-code markers (APPROVED/REJECTED), resolves transitions, and auto-enqueues the next task

### State Management — GoalState + State Machine

- **`GoalState`** (`goal-state.ts`) provides a lazy-evaluated filesystem view over goal workspaces. Methods like `hasGoal()`, `steps()`, `currentStepNumber()` read fresh from disk on every call — no internal caching
- **Transition resolver** (`state-machine.ts`) is a pure function: given a capability name and GoalState, it returns the next capability. No filesystem I/O in the transition logic itself
- **Per-goal task queues** (`queues.ts`) use single-slot files at `.pio/session-queue/task-{goalName}.json` — one pending task per goal

### Key Design Decisions

1. **Markdown-first workflow:** GOAL.md, PLAN.md, TASK.md, TEST.md, REVIEW.md are the authoritative artifacts. No database or structured state
2. **File markers for state:** APPROVED, REJECTED, COMPLETED, BLOCKED — empty files as state indicators (checked by marker priority)
3. **Dynamic capability loading:** `resolveCapabilityConfig()` uses dynamic imports to load capability modules at runtime
4. **Callback-based config:** Validation rules and file protections can be static arrays or callbacks `(workingDir, params) => T` for step-dependent configuration
5. **No transpilation:** Runs as raw TypeScript ESM via pi's runtime — `tsconfig.json` is for type checking only

## Service Integrations

### pi Framework Integration

pio depends entirely on the pi coding agent framework (`@earendil-works/pi-coding-agent`). Key integration points:
- **ExtensionAPI:** `registerTool()`, `registerCommand()`, `on(event)`, `setModel()`
- **Session management:** `ctx.newSession()`, `ctx.sessionManager.getEntries()`, custom entries
- **Event system:** `resources_discover`, `before_agent_start`, `turn_end`, `tool_call`, `turn_start`
- **UI notifications:** `ctx.ui.notify()`
- **Message delivery:** `pi.sendUserMessage()`

### Filesystem as State Store

All workflow state is stored in the `.pio/` directory tree:
- **`.pio/goals/<name>/`** — goal workspaces with GOAL.md, PLAN.md, step folders (S01/, S02/)
- **`.pio/issues/`** — issue backlog as markdown files
- **`.pio/session-queue/task-{goalName}.json`** — per-goal task queue slots
- **`.pio/PROJECT/`** — 7-file project context (OVERVIEW.md, DEVELOPMENT.md, etc.)

### External Model Configuration

Optional `~/.pi/pio-config.yaml` allows per-capability model overrides. Resolution order: capability-specific → default → inherit parent model. Parsed at runtime by `model-config.ts`.
