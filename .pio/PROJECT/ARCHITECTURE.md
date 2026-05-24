# Architecture

## Patterns and Design Decisions

### Extension Point Architecture

pio is a **pi extension** — it registers with the pi coding agent framework via `src/index.ts`, which exports a default function `(pi: ExtensionAPI) => void`. This function:
1. Registers discoverable skills (`resources_discover` event)
2. Wires shared infrastructure (`setupCapability`, `setupValidation`, `setupSessionGuard`)
3. Registers individual capabilities (`setupInit`, `setupCreateGoal`, etc.)

### Skill Auto-Discovery

Skills are auto-discovered from the filesystem — no hardcoded registration list. The `setupSkills()` function in `src/index.ts` scans `SKILLS_DIR` at startup using `fs.readdirSync()`, filtering directories by `SKILL.md` existence. To add a new skill, create its directory and `SKILL.md` file under `src/skills/`; it will be registered automatically on next startup. If `SKILLS_DIR` doesn't exist or is unreadable, the scan silently produces an empty array rather than crashing.

### Capability Pattern

Each workflow capability follows a consistent module structure:
1. **`CAPABILITY_CONFIG: StaticCapabilityConfig`** — single source of truth for session shape (prompt, validation rules, file protections, initial message)
2. **Tool (`defineTool`)** — agent-callable with TypeBox parameter schemas
3. **Command handler** — user-callable via `/pio-*` prefix in the TUI
4. **`setup*()` function** — registers both tool and command with the pi API

**Project-scoped capabilities:** When a capability writes to `.pio/PROJECT/*.md` (repo-root paths, not goal workspace), pass `goalDir` in enqueue params instead of `goalName`. This keeps `workingDir` as `cwd` so the writeAllowlist resolves relative to repo root. Capabilities like `project-context` and `finalize-goal` follow this pattern.

### Sub-Session Lifecycle

The `session-capability.ts` module orchestrates sub-sessions:
1. **Launch:** `launchCapability()` calls `ctx.newSession()` with a custom `pio-config` entry containing prompt, working directory, validation rules, and file protections
2. **Resources discover:** Config is read, prompts loaded, `prepareSession` hooks run, session name set
3. **Before agent start:** `.pio/PROJECT/OVERVIEW.md` + `_skill-loading.md` + capability prompt are injected as a custom conversation message (preserves pi's default system prompt). Model switching occurs here if `~/.pi/pio-config.yaml` specifies per-capability models
4. **File protection:** The `tool_call` event handler enforces read-only files and write allowlists, with a default-deny policy for `.pio/` writes outside the session's own goal workspace
5. **Plan revision trigger:** During evolve-plan, if the specification writer detects significant divergence from the plan, it writes a `REVISE_PLAN_NEEDED` marker in the step folder. The transition resolver checks for this marker and routes to `revise-plan` instead of continuing normally
6. **Completion:** Agent calls `pio_mark_complete`, which validates outputs, automates review-code markers (APPROVED/REJECTED), resolves transitions, and auto-enqueues the next task

### State Management — GoalState + State Machine

- **`GoalState`** (`goal-state.ts`) provides a lazy-evaluated filesystem view over goal workspaces. Methods like `hasGoal()`, `steps()`, `currentStepNumber()` read fresh from disk on every call — no internal caching
- **Transition resolver** (`state-machine.ts`) is a pure function: given a capability name and GoalState, it returns the next capability. No filesystem I/O in the transition logic itself
- **Per-goal task queues** (`queues.ts`) use single-slot files at `.pio/session-queue/task-{key}.json` — one pending task per goal. For flat goals, `key` is the goal name basename. For nested subgoals, `deriveQueueKey(goalDir, cwd)` produces hierarchical keys (e.g., `parent__S03__nested`) using `__` as delimiter. On completion, `pio_mark_complete` uses the transition's adjusted `params.goalName` to determine which queue slot to enqueue into, enabling parent queue slot restoration when a subgoal completes.

### Nested Subgoals

Plan steps declared with `complexity: "subgoal"` in the PLAN.md frontmatter `steps` array spawn child goal workspaces under `S{NN}/subgoals/<name>/`. These subgoals run through the full pio lifecycle recursively:

1. **Spawning:** `transitionEvolvePlan` detects `complexity === "subgoal"` via `state.steps()[n].getMetadata()` and routes to `create-goal` with parent context (`parentGoalName`, `parentStepNumber`, `workingDir`) and an `initialMessage` containing a relative path to the parent step's TASK.md
2. **Directory structure:** Subgoal workspace lives at `.pio/goals/<parent>/S{NN}/subgoals/<name>/` — nested inside the parent step folder, not at the top-level goals directory
3. **Path resolution:** `resolveGoalDir(cwd, name, parentStepDir?)` supports an optional `parentStepDir` for nested subgoal paths; backward compatible with flat goals
4. **Completion propagation:** `transitionFinalizeGoal` routes subgoals back to the parent's `evolve-plan` (restoring the parent queue slot). Top-level goals return `undefined` (terminal)
5. **Detection mechanism:** Frontmatter-only — no regex heading parsing or `[subgoal]` body annotations. The `steps` array in PLAN.md frontmatter is the single source of truth
6. **Universal TASK.md:** Both `execute-task` and subgoal `create-goal` read TASK.md. Evolve-plan produces only TASK.md; tests are derived at execute-time by the executor using the `test-driven-development` skill
7. **Backward compatible:** Flat goals without subgoal metadata function identically — `planMetadata()` returns null for old plans, `getMetadata()` defaults `complexity` to `"task"`

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
- **`.pio/goals/<name>/`** — goal workspaces with GOAL.md, PLAN.md, `PLAN_ARCHIVE/` (timestamped archived plans), step folders (S01/, S02/), and optional nested subgoal workspaces under `S{NN}/subgoals/<name>/`
- **`.pio/issues/`** — issue backlog as markdown files
- **`.pio/session-queue/task-{key}.json`** — per-goal task queue slots (key is goal basename for flat goals, hierarchical `parent__S03__nested` for subgoals)
- **`.pio/PROJECT/`** — 7-file project context (OVERVIEW.md, DEVELOPMENT.md, etc.)

### External Model Configuration

Optional `~/.pi/pio-config.yaml` allows per-capability model overrides. Resolution order: capability-specific → default → inherit parent model. Parsed at runtime by `model-config.ts`.
