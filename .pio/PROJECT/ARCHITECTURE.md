# Architecture

## Patterns and Design Decisions

### Extension Point Architecture

pio is a **pi extension** — it registers with the pi coding agent framework via `src/index.ts`, which exports an `async` default function `(pi: ExtensionAPI) => void`. This function:
1. Registers discoverable skills (`resources_discover` event)
2. Wires shared infrastructure: `setupSessionInfrastructure()`, `setupMarkComplete()`, `setupValidation()`, `setupSessionGuard()`, `setupStepNudging()`, `setupDirectTools()`
3. **Auto-discovers** AI-driven capabilities via `discoverCapabilities(__dirname)` which scans `src/capabilities/` for directories containing `config.ts`, then calls `registerCapability(pi, descriptor)` for each
4. Registers non-AI tools (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) via `setupDirectTools(pi)` — consolidated in `src/direct-tools.ts`
5. Explicitly imports and registers state machines (e.g., `state-machines/pio-workflow-machine`) to ensure machines are available before mark-complete dispatches transitions

Test fixtures (`test-*` prefixed directories) are automatically filtered out from the discovery loop.

### Skill Auto-Discovery

Skills are auto-discovered from the filesystem — no hardcoded registration list. The `setupSkills()` function in `src/index.ts` scans `SKILLS_DIR` at startup using `fs.readdirSync()`, filtering directories by `SKILL.md` existence. To add a new skill, create its directory and `SKILL.md` file under `src/skills/`; it will be registered automatically on next startup. If `SKILLS_DIR` doesn't exist or is unreadable, the scan silently produces an empty array rather than crashing.

### Capability Package Pattern

Each AI-driven capability is a **directory package** under `src/capabilities/<name>/` with structured component files:
1. **`config.ts`** — default exports `CapabilityPackageConfig` (session shape: validation, file protections, skills, frontmatterSchemas). Named export `register(pi)` registers tool + command with the pi API
2. **`role.md`** — Role description (prompt component)
3. **`workflow.ts`** — default exports `WorkflowStep[]`, each step can declare `skills: { mandatory?: string[], recommended?: ... }`
4. **`guidelines.md`** — Guidelines (prompt component)
5. **`callbacks.ts`** *(optional)* — Lifecycle callbacks: validation, file protection resolvers
6. **`schemas.ts`** *(optional)* — Capability-local TypeBox frontmatter schemas for output validation
7. **`config.test.ts`** — Colocated tests

Prompts are **compiled at runtime** by `prompt-compiler.ts` (`compilePrompt()`) from component files instead of reading single `.md` files. The old `src/prompts/` directory was removed.

**Non-AI capabilities** (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) are consolidated in `src/direct-tools.ts` — they have no prompts, no sub-sessions, no validation hooks.

**Registration:** `discoverCapabilities()` auto-discovers directory packages; `registerCapability(pi, descriptor)` calls the `register(pi)` named export from each `config.ts`. No hardcoded per-capability imports in `index.ts`.

**Project-scoped capabilities:** Capabilities that read/write `.pio/PROJECT/*.md` files (e.g., `project-context`, `finalize-goal`) use `projectRelative: true` on `MarkdownFileSpec` entries. This flag resolves paths from the global `pioRootDir` (`<cwd>/.pio/`) instead of the capability's workspace directory. Combined with the validation guard's `allowProjectWrites` opt-in, these capabilities can freely write to PROJECT files without workarounds.

### Sub-Session Lifecycle

The `capability-session.ts` module (renamed from `session-capability.ts`) orchestrates sub-sessions:
1. **Launch:** `launchCapability()` calls `ctx.newSession()` with a custom `pio-config` entry containing prompt, working directory, validation rules, and file protections
2. **Resources discover:** Config is read, prompts loaded, `prepareSession` hooks run, session name set. New-style capabilities (directory packages) use `compilePrompt()` to assemble prompts from component files; old-style falls back to reading `.md` files directly. Capabilities can define `prepareSession` callbacks (e.g., `execute-task`, `review-task`) that execute here — before `before_agent_start`. This allows runtime config enrichment: execute-task and review-task use `prepareSession` to read per-step skills from TASK.md frontmatter and merge them into the capability config via `mergeCapabilitySkills()` from `capability-utils.ts`.
2b. **Workspace metadata injection:** `normalizePackageConfig()` (`capability-config.ts`) auto-prepends workspace directory metadata to every initial message: `Workspace directory: <absolute-path>\n\n<message-body>`. This single enrichment point covers all three message sources (tool params, state machine transitions, default fallbacks) and applies unconditionally. Downstream command handlers and state-machine resolve functions provide only the message body — workspace context comes from this prefix. State-machine messages include file-reading guidance (which files to read, where to write) and goal names where appropriate.
3. **Before agent start:** `.pio/PROJECT/OVERVIEW.md` + compiled capability prompt are injected as a custom conversation message (preserves pi's default system prompt). Model switching occurs here if `~/.pi/pio-config.yaml` specifies per-capability models. Skill loading runs via `buildSkillLoadingSection()`: mandatory skills from the config are frontmatter-stripped and wrapped in `<skill>` XML tags; recommended skills listed as instructions. Global defaults (`pio`, `ask-user`) are always prepended.
4. **File protection:** The `tool_call` event handler enforces read-only files and write allowlists, with a default-deny policy for `.pio/` writes outside the session's own goal workspace
5. **Plan revision trigger:** During evolve-plan, if the specification writer detects significant divergence from the plan, it writes a `REVISE_PLAN_NEEDED` marker in the step folder. The transition resolver checks for this marker and routes to `revise-plan` instead of continuing normally
6. **Completion:** Agent calls `pio_mark_complete`, which validates outputs, automates review-code markers (APPROVED/REJECTED), dispatches transitions via `dispatch()` on registered state machines (handles single/multiple/no matches), and auto-enqueues the next task

### State Management — CapState + Contract Caching

- **`CapState`** (`capability-state.ts`) provides contract-backed lazy file access. Wraps a `CapabilityContract` with a base directory and params. Core accessors:
  - **`.input<T>(name)`** — looks up by `name` in `contract.inputs`, resolves placeholders, validates against schema
  - **`.output<T>(name)`** — looks up by `name` in `contract.outputs` (including inside OneOfGroup entries)
  - **`.undeclared(path)`** — for marker files not in any contract (no placeholder resolution, no schema validation; passes explicit `projectRelative: false`)
  - **`.resolvePath(entry: MarkdownFileSpec)`** — unified path resolution method. All internal accessors (`input`, `output`) and external consumers flow through this single method. Handles `projectRelative` entries (resolves from global `pioRootDir`), placeholder resolution, and workspace prefix injection.
  Entry maps store full `MarkdownFileSpec` references (not copies) — new fields on the spec are automatically available. Public `.contract` getter exposes the wrapped contract. Every `MarkdownFileSpec` requires a `name: string`. Duplicate names across inputs/outputs within a single contract throw at construction. Replaces the old `GoalState` (deleted).
- **Contract caching at startup:** `index.ts` calls `setDiscoveredContracts()` after `discoverCapabilities()` to build a name-to-contract map. `getCapState(capabilityName, baseDir, params?)` (in `state-machines/utils.ts`) provides synchronous lookup for resolve functions — no dynamic imports needed at runtime.
- **Resolve function pattern:** All resolve functions in `pio-workflow-machine.ts` accept minimal `{ workspaceDir: string }` context and call `getCapState()` with capability names to perform file reads. `workspaceDir` is already the resolved directory (includes workspace prefix). No intermediate context object (PioWorkflowContext removed). No cross-capability schema imports from capabilities — framework code imports capability CONTRACTs directly.

**Removed:** `GoalState` (`goal-state.ts`, deleted), `PioWorkflowContext` and `buildPioWorkflowContext()` (removed from `pio-workflow-machine.ts`). Dead filesystem utilities in `state-machines/utils.ts` (`isGoalComplete`, `findCurrentStepNumber`, `SimpleStepStatus`) were also removed — the module now houses only `setDiscoveredContracts` / `getCapState`.
- **Declarative state machine framework** (`state-machines.ts`) replaces the old imperative `switch`-based resolver (`state-machine.ts`, deleted). The framework is built on three generic types:
  - **`StateMachine<C>`:** Named config with `id`, `name`, `description`, and `edges: TransitionEdge<C>[]`
  - **`TransitionEdge<C>`:** Directed edge `{ from, to, resolve }` — each edge carries its own `resolve(context, params) → TransitionResult | undefined` that combines condition check + param computation. No separate `condition` field.
  - **`ResolverResult`:** `Omit<TransitionResult, "stateMachineId">` — the type resolvers return; `stateMachineId` is stripped from the resolver contract since dispatch auto-injects it
  - **`TransitionResult`:** `{ capability, stateMachineId, params? }` — identifies which machine produced the result for multi-machine tracking
- **Dispatch mechanism:** `dispatch(machine, currentNode, context, params)` iterates outgoing edges and collects all non-undefined results. No switch statements. When `machine` is `undefined`, iterates all registered machines (multi-machine dispatch). Each resolve call is wrapped in try/catch — one bad machine doesn't block others.
- **Registration:** `registerMachine(machine)` / `unregisterMachine(id)` manage the machine registry. Machines are registered explicitly via named setup functions called from `index.ts` (e.g., `setupPioWorkflowMachine()`) — no auto-registration at module load.
- **Machine lookup:** `_machinesById` (`Map<string, StateMachine<unknown>>`) is the single internal storage structure. Public API: `getMachine(id)` for O(1) lookup by ID, `getRegisteredMachines()` returns a snapshot array. The old `_registeredMachines` array was removed.
- **Multi-machine dispatch:** When `machine` is `undefined`, `dispatch()` calls `getRegisteredMachines()` (not a private variable). For explicit dispatch, `mark-complete.ts` reads `stateMachineId` from session params, looks up the machine via `getMachine()`, and passes it to `dispatch(machine, ...)`. Falls back to `dispatch(undefined, ...)` if ID is absent or unknown — preserving backward compatibility.
- **Dispatch auto-injects `stateMachineId`:** Every returned `TransitionResult` carries `stateMachineId: m.id`, injected by `dispatch()` via `{ ...result, stateMachineId: m.id }`. Resolvers return `ResolverResult` (which omits `stateMachineId`) — the framework guarantees the ID, not individual resolvers. This eliminated 14 manual `stateMachineId` assignments in `pio-workflow-machine.ts` resolver returns.
- **`stateMachineId` propagation:** Included at top level in enqueued task params (spread after `_sessionContext`) so it persists through sub-session launches. Matches the existing `stepNumber` propagation pattern.
- **Enriched audit logging:** `recordTransition()` accepts an optional fourth parameter (`actualParams`) to record enriched params (with `stateMachineId`, `_sessionContext`, explicit `stepNumber`) instead of raw edge resolver params. When omitted, falls back to `toResult.params` for backward compatibility. Mark-complete passes the same `enrichedParams` object to both `enqueueTask()` and `recordTransition()`, ensuring transitions.json mirrors exactly what was dispatched.
- **Workflow machine** (`state-machines/pio-workflow-machine.ts`) — exports 11 resolve functions (one per edge) with explicit naming convention: `resolve<From>To<To>` (e.g., `resolveCreateGoalToCreatePlan`). Ported from old `transition*` functions in deleted `state-machine.ts`. No longer exports `recordTransition()` — that function lives in `state-machines.ts`. Resolver return types changed to `ResolverResult` (no manual `stateMachineId`) after dispatch auto-injection was added.
- **Edge priority:** Edges are evaluated in array order. Conditional edges guard against higher-priority conditions to prevent duplicate results (e.g., evolve-plan → execute-task returns `undefined` if revision needed or subgoal present). Higher-priority conditions must appear earlier in the edges array.
- **Per-goal task queues** (`queues.ts`) use single-slot files at `.pio/session-queue/task-{key}.json` — one pending task per goal. For flat goals, `key` is the goal name basename. For nested subgoals, `deriveQueueKey(goalDir, cwd)` produces hierarchical keys (e.g., `parent__S03__nested`) using `__` as delimiter. On completion, `pio_mark_complete` uses the transition's adjusted `params.goalName` to determine which queue slot to enqueue into, enabling parent queue slot restoration when a subgoal completes.
- **Manual override:** `pio_transition` tool and `/pio-transition` command (in `direct-tools.ts`) allow users to manually select transitions — useful when multiple edges match or the auto-resolution is undesirable.

### Nested Subgoals

Plan steps declared with `complexity: "subgoal"` in the PLAN.md frontmatter `steps` array spawn child goal workspaces under `S{NN}/subgoals/<name>/`. These subgoals run through the full pio lifecycle recursively:

1. **Spawning:** `transitionEvolvePlan` detects `complexity === "subgoal"` via `state.steps()[n].getMetadata()` and routes to `create-goal` with parent context (`parentGoalName`, `parentStepNumber`, `workspaceDir`) and an `initialMessage` containing a relative path to the parent step's TASK.md
2. **Directory structure:** Subgoal workspace lives at `.pio/goals/<parent>/S{NN}/subgoals/<name>/` — nested inside the parent step folder, not at the top-level goals directory
3. **Path resolution:** `resolveGoalDir(cwd, name, parentStepDir?)` supports an optional `parentStepDir` for nested subgoal paths; backward compatible with flat goals
4. **Completion propagation:** `transitionFinalizeGoal` routes subgoals back to the parent's `evolve-plan` (restoring the parent queue slot). Top-level goals return `undefined` (terminal)
5. **Detection mechanism:** Frontmatter-only — no regex heading parsing or `[subgoal]` body annotations. The `steps` array in PLAN.md frontmatter is the single source of truth
6. **Universal TASK.md:** Both `execute-task` and subgoal `create-goal` read TASK.md. Evolve-plan produces only TASK.md; tests are derived at execute-time by the executor using the `test-driven-development` skill
7. **Backward compatible:** Flat goals without subgoal metadata function identically — `planMetadata()` returns null for old plans, `getMetadata()` defaults `complexity` to `"task"`

### Skill Injection Architecture

Skills are loaded dynamically at session startup, replacing the old static `_skill-loading.md` approach. Resolution order (highest priority first):

1. **Per-step skills** — Declared in TASK.md YAML frontmatter (`skills.mandatory`, `skills.recommended`) or in capability `workflow.ts` step declarations. Read during `prepareSession`. Merged with base config skills via `mergeCapabilitySkills()` from `capability-utils.ts` (Set-based dedup for mandatory, Map-based first-seen-wins for recommended).
2. **Base capability skills** — Declared in each capability's `CapabilityPackageConfig.skills` field. Propagated through `resolveCapabilityConfig()` into runtime `CapabilityConfig`.
3. **Global mandatory skills** — `pio` and `ask-user` are always injected by `buildSkillLoadingSection()`, regardless of capability config.

Mandatory skills are force-injected (content read from disk, frontmatter stripped, wrapped in `<skill>` XML tags). Recommended skills are listed as loading instructions (LLM decides whether to load based on condition).

### Key Design Decisions

1. **Markdown-first workflow:** GOAL.md, PLAN.md, TASK.md, TEST.md, REVIEW.md are the authoritative artifacts. No database or structured state
2. **Completion signal:** `COMPLETION_SUMMARY.md` replaces the empty `COMPLETED` marker at the goal level. Written by evolve-plan with YAML frontmatter (`status: "complete"`) and a markdown body explaining why the goal is complete. All completion checks updated: `validateOutputs()` short-circuit, `finalize-goal` validation, state machine resolve functions.
3. **File markers for step state:** APPROVED, REJECTED, BLOCKED — empty files as state indicators (checked by marker priority)
4. **Auto-generated step markers (execute-task):** Step-level COMPLETED/BLOCKED markers are auto-generated from SUMMARY.md YAML frontmatter (`status: "completed" | "blocked"`) by the `postExecuteExecute` hook in execute-task's `callbacks.ts`. Agents no longer create marker files manually — they write SUMMARY.md with frontmatter, commit changes, and call `pio_mark_complete`. The framework validates frontmatter against `EXECUTION_SUMMARY_SCHEMA`, then the post-execute hook creates the appropriate empty marker file. The state machine guard on `execute-task → review-task` reads SUMMARY.md frontmatter directly (not the marker file) due to mark-complete ordering: dispatch transitions runs before postExecute hooks.
3. **Capability package system:** AI-driven capabilities are directory packages (`src/capabilities/<name>/`) with component files: `config.ts` (default export + `register(pi)`), `role.md`, `workflow.ts`, `guidelines.md`, optional `callbacks.ts` and `schemas.ts`. Prompts compiled at runtime by `prompt-compiler.ts` from component files
4. **Auto-discovery:** `discoverCapabilities()` scans `src/capabilities/` for directory packages containing `config.ts`; `registerCapability(pi, descriptor)` handles registration — no hardcoded imports in `index.ts`
5. **Direct tools consolidation:** Non-AI capabilities (init, delete-goal, list-goals, parent, create-issue, goal-from-issue, pio_transition) consolidated in `src/direct-tools.ts` — single module for simple tool/command registrations
6. **Mandatory contracts:** Every capability declares a `CONTRACT: CapabilityContract` at module level (mandatory on both `CapabilityConfig` and `CapabilityPackageConfig`). Validation functions (`validateOutputs`, `validateFrontmatter`, `validateInputs`) accept only `CapabilityContract` — old types (`FrontmatterSchemaDeclaration`, `ValidationRule`, `InputValidationSpec`) deleted. The contract is consumed by callbacks, CapState, tests, and the auto-discovery cache.
7. **Automated input validation:** `launchCapability()` performs contract-based input validation automatically — eliminated redundant `validateInputs()` calls from ~8 call sites across capability callbacks and config files
8. **Input frontmatter validation:** `validateInputs()` validates frontmatter schemas when declared on input entries (e.g., evolve-plan imports PLAN.md with `PLAN_FRONTMATTER_SCHEMA`). Output validation (`validateOutputs()`) also validates frontmatter — standalone `validateFrontmatter()` preserved as export but called only internally.
8. **Declarative state machines:** Transition resolution uses the generic `StateMachine<C>` framework (`state-machines.ts`) — edges with `resolve` functions replace imperative `switch` statements. Machine registry backed by `_machinesById` Map with O(1) lookup via `getMachine(id)`. Machines register explicitly via named setup functions from `index.ts`. Mark-complete dispatches against the correct machine by reading `stateMachineId` from session params (multi-machine aware). Fallback to `dispatch(undefined, ...)` for backward compatibility. 
9. **Step nudging:** `workflow-step-finish` tool + `turn_end` nudge injection guides agents through multi-step workflows. State tracked in `step-nudging.ts`, injected via `pi.sendMessage({ deliverAs: "steer" })`. The `turn_end` handler checks `event.message.stopReason === "aborted"` to skip nudges when the user cancels (Esc/Ctrl+C) — `stopReason` on message objects is the authoritative source, set by the agent loop.
10. **Abort detection in session guards:** Both `step-nudging.ts` (`turn_end`) and `session-guard.ts` (`turn_end` + `agent_end`) detect user aborts via `stopReason` on event messages instead of `ctx.signal?.aborted` (unreliable — `activeRun` is cleared before events fire). The `turn_end` handler in `session-guard.ts` returns early on abort to skip turn counting and recovery prompts; `agent_end` checks the last message's `stopReason` to suppress completion warnings.
11. **Prompt compilation:** `compilePrompt()` reads component files (`role.md`, `workflow.ts`, `guidelines.md`) and assembles the final prompt — replaces monolithic `.md` prompts (old `src/prompts/` directory removed)
12. **Dynamic capability loading:** `resolveCapabilityConfig()` uses dynamic imports to load capability modules at runtime
13. **Callback-based config:** Validation rules and file protections can be static arrays or callbacks `(workspaceDir, params) => T` for step-dependent configuration
14. **No transpilation:** Runs as raw TypeScript ESM via pi's runtime — `tsconfig.json` is for type checking only

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

### Jira Integration (Skill-Only)

Jira operations are handled entirely through the `pio-jira` skill (`src/skills/pio-jira/`) — no TypeScript capability code exists for Jira. Agents invoke the Atlassian CLI (`acli`) via `bash` tool calls, guided by protocol instructions in SKILL.md and REFERENCE.md.

**Config file:** `.pio/jira-config.yaml` (optional) — stores `site`, `projectKey`, and `defaultType`. Created by `src/skills/pio-jira/scripts/setup-config.sh` (POSIX shell, invoked via `bash` tool). Triggered before any Jira operation when the config is missing.

**Workflow:** Jira ticket → pull to local issue (`pio_create_issue`) → create goal from issue (`pio_goal_from_issue`) → full pio lifecycle.

**Skill-only rationale:** Avoids TypeScript capability overhead for CLI-driven workflows. The skill delegates all command construction and error handling to agents at runtime.
