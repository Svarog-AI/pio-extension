# Architecture

## Patterns and Design Decisions

### Extension Point Architecture

pio is a **pi extension** — it registers with the pi coding agent framework via `src/index.ts`, which exports an async default function `(pi: ExtensionAPI) => void`. This function:
1. Registers discoverable skills (`resources_discover` event)
2. Wires shared infrastructure: `setupSessionInfrastructure()`, `setupValidation()`, `setupSessionGuard()`, `setupDirectTools()`
3. **Auto-discovers** AI-driven capabilities via `discoverCapabilities(__dirname)` which scans `src/capabilities/` for directories containing `config.ts`, then calls `registerCapability(pi, descriptor)` for each
4. Registers non-AI tools (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) via `setupDirectTools(pi)` — consolidated in `src/direct-tools.ts`
5. Explicitly registers the state machine (`state-machines/pio-workflow-machine`) so machines are available before the exit lifecycle (`runExitLifecycle`) dispatches transitions

Test fixtures (`test-*` prefixed directories) are filtered out of the discovery loop. **Tool-only architecture**: capabilities register tools via `defineTool()` only — no command handlers. Users interact via `pio_*` tools (agent-callable) and TUI commands (`/pio-next-task`, `/pio-parent`, `/goto`, `/continue`).

### Capability Package Pattern

Each AI-driven capability is a **directory package** under `src/capabilities/<name>/` with structured component files:
1. **`config.ts`** — default exports `CapabilityPackageConfig`; named export `register(pi)` registers the tool
2. **`role.md`** — role description (prompt component)
3. **`workflow.ts`** — default exports `WorkflowPhase[]`; each phase can declare `skills: { mandatory?: string[], recommended?: ... }`
4. **`guidelines.md`** — guidelines (prompt component)
5. **`callbacks.ts`** *(optional)* — lifecycle callbacks (validation, file protection resolvers)
6. **`schemas.ts`** *(optional)* — capability-local TypeBox frontmatter schemas
7. **`config.test.ts`** — colocated tests

Prompts are **compiled at runtime** by `prompt-compiler.ts` (`compilePrompt()`) from component files instead of reading single `.md` files. Non-AI capabilities are consolidated in `src/direct-tools.ts`.

### Sub-Session Lifecycle (`capability-session.ts`)

Each capability runs in its own isolated pi sub-session:
1. **Launch:** `launchCapability()` calls `ctx.newSession()` with a custom `pio-config` entry (prompt, working directory, validation rules, file protections).
2. **Resources discover:** config read, prompts loaded, `prepareSession` hooks run (e.g., execute-task/review-task read per-step skills from TASK.md frontmatter and merge via `mergeCapabilitySkills()`). Workspace directory injected into session inputs.
3. **Before agent start:** compiled capability prompt + `.pio/PROJECT/OVERVIEW.md` injected; model switch occurs if `~/.pi/pio-config.yaml` specifies per-capability models; skills loaded via `buildSkillLoadingSection()` (mandatory wrapped in `<skill>` XML, recommended listed as instructions).
4. **File protection:** `tool_call` event handler enforces read-only files and write allowlists, with default-deny for `.pio/` writes outside the session's own goal workspace.
5. **Plan revision trigger:** evolve-plan writes `REVISE_PLAN_NEEDED.md` when divergence detected; transition resolver routes to `revise-plan`.
6. **Completion (automatic):** when traversal reaches workflow end, the engine runs the synthesized `__pio-exit` terminal code phase → `runExitLifecycle()`: validate outputs, dispatch transitions, enqueue next task, apply markers, postExecute, fileCleanup.

### State Management — CapState + Contract Caching

- **CapState** (`capability-state.ts`): contract-backed lazy file access (`.input(name)`, `.output(name)`, `.undeclared(path)`, `.resolvePath(spec)`), with `paramKey` dynamic path resolution and `projectRelative` resolution from `pioRootDir` (`<cwd>/.pio/`). Replaced the deleted `GoalState`.
- Contracts cached at startup via `setDiscoveredContracts()` / `getCapState()` for synchronous resolve-function lookup.

### Declarative State Machine Framework (`state-machines.ts`)

Replaces imperative `switch`-based resolvers. Generic `StateMachine<C>` with `edges: TransitionEdge<C>[]`, each `{ from, to, resolve }` combining condition check + param computation. `dispatch()` iterates edges, auto-injects `stateMachineId`, supports multi-machine dispatch and resolver-declared `cleanup[]` (declarative signal-file deletion). The `pio-workflow-machine.ts` exports `resolve<From>To<To>` functions; edge priority is array order (higher-priority conditions first).

### Runtime Loop Engine (`src/runtime/loop-engine.ts`)

Each workflow phase executes as bounded agent runs (`minIterations`/`maxIterations` via `resolveMaxIterations()`, `terminateWhen` conditions, `loopWhile`, do-while `kind: "loop"` blocks). PhaseManager (`phase-manager.ts`) provides string-ID phase registry and next-phase resolution (`getPhase`, `resolveNext`, `listIds`); `/goto <phase-id>` for manual jumps. Phase content delivered via CustomMessage injection (KV-cache stable). Abort detection uses `stopReason` on event messages (reliable), not `ctx.signal`.

### Nested Subgoals

Plan steps with `complexity: "subgoal"` in PLAN.md frontmatter spawn child goal workspaces under `S{NN}/subgoals/<name>/` that run the full pio lifecycle recursively. Detection is frontmatter-only; completion propagates back to the parent's evolve-plan (restoring the parent queue slot).

### Skill Injection Architecture

Skills loaded dynamically at session startup: per-step skills (TASK.md frontmatter) → base capability skills → global mandatory (`pio`, `ask-user`). Mandatory skills force-injected as `<skill>` XML; recommended listed as loading instructions.

### Key Design Decisions

1. **Markdown-first workflow** — GOAL.md/PLAN.md/TASK.md/TEST.md/REVIEW.md are authoritative artifacts; no database or structured state (filesystem-as-state-store).
2. **Completion signal** — `COMPLETION_SUMMARY.md` (with `status: "complete"` frontmatter) replaces the empty `COMPLETED` marker, enforced via `OneOfGroup` mutual-exclusion contract entries (either completion or `REVISE_PLAN_NEEDED.md`).
3. **File markers for step state** — APPROVED/REJECTED/BLOCKED empty files as state indicators.
4. **Declarative markers (`contract.markers`)** — `MarkerDeclaration` maps frontmatter values → marker filenames; the framework (`applyMarkers`/`cleanupMarkers` in `guards/mark-complete.ts`) handles creation/cleanup, replacing per-capability `postExecute` callbacks.
5. **Mandatory contracts** — every capability declares a `CONTRACT: CapabilityContract`; validation functions accept only contracts.
6. **Recursive output tree (`OutputEntry`)** — `MarkdownFileSpec | OneOfGroup | OutputEntry[]` with implicit AND-groups; `OneOfGroup` for mutual exclusion.
7. **Automated input + frontmatter validation** — contract-based validation in `launchCapability()`; CapState-aware `requiredWhen` predicates make output requirements dynamic.
8. **Declarative state machines** — edges with `resolve` functions replace switch statements.
9. **Runtime Loop Engine** — bounded iteration loops replace prompt-based step nudging.
10. **Session Variable System** — `SessionVariableStore` with `${name}` interpolation, `setVar`/`getVar`/`listVars`.
11. **Abort detection** via `stopReason` on event messages.
12. **Prompt compilation** from component files.
13. **Dynamic capability loading** via dynamic imports.
14. **Callback-based config** — validation/file protections can be static or callbacks.
15. **No transpilation** — raw TypeScript ESM run by pi; `tsconfig.json` is type-checking only.

### ADRs (Architecture Decision Records)

**No ADRs exist.** Decision records are captured informally in per-goal `DECISIONS.md` files (accumulated architectural decisions documented during specification) and consolidated in this file and CONVENTIONS.md.

## Service Integrations

The project is a **pi extension** — it does not run as a standalone service and has **no direct external service integrations** (no database, message broker, cache, or third-party API SDKs). All LLM/model interaction happens **through the pi host** (`@earendil-works/pi-coding-agent`), which this extension registers with via `ExtensionAPI`. `src/model-config.ts` only parses/validates `{ provider, modelId }` config strings and resolves which model a capability uses; it does not call any model provider API directly.

- **GitHub** — used only as the git remote (`github.com:Svarog-AI/pio-extension.git`) and as the CI runner (`.github/workflows/ci.yml`). No GitHub API integration in the source.
- **`pi-ask-user`** — in-process skill dependency for decision handshakes (not an external service).
- **`js-yaml`** — local YAML parsing library.
- **Retired:** Jira integration exists only in `src/skills.old/pio-jira/` (archived skill); not an active integration.

### Deployment topology

There is **no deployment topology**. This is a developer tool distributed as a git repository and loaded directly by the pi coding agent — the extension directory is registered in `~/.pi/config.yaml`, and pi loads `./src/index.ts` at runtime. No server-side component, no environments (dev/staging/prod), no Docker/infra config.

### Ecosystem context

The project fits into the **pi coding-agent ecosystem** as a workflow extension: it adds a goal-driven project-management workflow (goals → plans → steps → sub-sessions → review → quality gate → finalize) on top of pi's sub-session, tool, and skill infrastructure. Its runtime state is the `.pio/` directory (filesystem-as-state-store): goal workspaces, session queue, per-session loop-engine state, and `transitions.json` audit log.
