# Dependencies

## External APIs

No external HTTP APIs or third-party services are integrated at runtime. All I/O is local filesystem operations. The extension communicates with the pi framework through its ExtensionAPI (in-process, not network-based).

Model switching (`~/.pi/pio-config.yaml`) references LLM providers (e.g., Anthropic, OpenAI) but only configures which model pi uses — pio itself makes no direct API calls to any provider.

## Third-Party Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| `@earendil-works/pi-coding-agent` | ^0.74.0 (devDep) | Core framework for the TUI-loaded extension: ExtensionAPI, `defineTool()`, session management, event system |
| `@earendil-works/pi-coding-agent` | 0.85.1 (**exact-pinned**, dep of the standalone `pio/` package) | Owned runtime of the `pio` executable — the exact pin tracks upstream independently of the root devDependency and host pi (self-contained artifact policy; evidence in commit messages) |
| `typebox` | ^1.1.24 (devDep) | JSON Schema type builders for tool parameter definitions |
| `typescript` | ^5.8.0 (devDep) | Type checking via `npm run check` (`tsc --noEmit`) |
| `vitest` | ^4.1.6 (devDep) | Test runner: unit tests with global `describe/it/expect` |
| `@types/node` | ^25.7.0 (devDep) | Node.js type definitions |
| `@types/js-yaml` | ^4.0.9 (devDep) | TypeScript declarations for js-yaml |
| `js-yaml` | ^4.1.1 (dep) | YAML parsing: REVIEW.md frontmatter, `~/.pi/pio-config.yaml` |
| `pi-ask-user` | ^0.10.0 (devDep) | Provides the `ask-user` skill for decision handshakes in pio sub-sessions |
| `@biomejs/biome` | 2.5.13 (**exact-pinned**, devDep in BOTH trees) | Linter and formatter — recommended preset with test file overrides (single shared root `biome.json`; both manifests pin identically so the lefthook pre-commit hook and the per-tree gates share ONE engine — owner-directed cross-tree alignment during goal `capability-base` after the stale range-resolution skew silently re-flipped a committed layout) |
| `lefthook` | ^2.1.9 (devDep) | Git hook manager — pre-commit Biome check on staged `.ts`/`.json` files (config in `lefthook.yml`) |

All devDependencies run at development time or via pi's TypeScript runtime. Production dependencies: `js-yaml` (root) and `@earendil-works/pi-coding-agent` 0.85.1 (`pio/`).

**Dual pi copies are a structural property of this packaging:** the root devDependency (^0.74.0-line) serves the TUI-loaded extension from root `node_modules`; the exact-pinned 0.85.1 in `pio/node_modules` is the executable's owned runtime. In a live probe session the extension bound exclusively to the pinned copy — root `src/index.ts` imports the SDK type-only (erased at load), so the devDependency copy never entered the process (verified 2026-09-16). If mixed-copy behavior ever misbehaves, the documented escape hatch is the public `extensionsOverride` discovery-filtering seam.

## Internal Module Graph

```
index.ts (async) ──┬── setupSkills()          → skills auto-discovery (filesystem scan)
                   ├── setupSessionInfrastructure() → capability-session.ts (was session-capability.ts)
                   ├── setupValidation()      → guards/validation.ts
                   ├── setupSessionGuard()    → runtime/session-guard.ts (migrated from guards/)
                   ├── setupLoopEngine()      → runtime/loop-engine.ts (bounded iteration loop, replaces step nudging)
                   ├── setupDirectTools()     → direct-tools.ts (init, delete-goal, list-goals, parent, create-issue, goal-from-issue)
                   └── discoverCapabilities() → capability-discovery.ts (auto-discovers 10 directory packages + registers via registerCapability()), followed by setDiscoveredContracts() for runtime contract caching

Runtime package:
  runtime/loop-engine.ts      — Bounded iteration loop engine: resources_discover (creates PhaseManager; synthesizes __pio-exit terminal exit phase), before_agent_start, turn_end, agent_end, input handlers; /goto and /continue commands; ${name} template interpolation; kind: "code" programmatic phase execution
  runtime/exit-lifecycle.ts   — runExitLifecycle(config): engine-side capability exit lifecycle (validateOutputs → postValidate → dispatch/enqueueTask/recordTransition + cleanup[] deletion → applyMarkers → postExecute → fileCleanup); stateless — owns no session state; invoked by the __pio-exit wrapper
  runtime/session-store.ts    — SessionVariableStore (two-layer variable system, setVar/getVar/listVars tools, type enforcement + coercion)
  runtime/phase-manager.ts    — PhaseManager: depth-first tree flattening, phase registry (id → phase), resolveNext (sequential via `_routing`, conditional via `_conditionalRouting` for branch:if/branch:switch + loop-end `LoopBackRouting` entries), synthesizes synthetic merge nodes (`__branch-end-*` / `__loop-end-*`) so every branch and loop has a single exit, listIds, getFirstPhaseId

  runtime/state-persistence.ts — File-based persistence for loop engine state + writable runtime variables + currentPhaseId (load/save JSON by session ID, atomic writes)
  runtime/session-state.ts    — PioSessionState singleton (markCompleteCalled, currentPhase, currentPhaseId, phaseManager, iteration tracking, sessionId, store, shared by guard + engine; in-memory-only programmaticLog/lastLlmPhaseId/exitOutcome/exitFailureMessage; required in-memory-only `loopPasses` do-while repeat counters)
  runtime/session-guard.ts    — Turn recovery + dead-turn detection (migrated from guards/)
  runtime/workflow-types.ts   — StepState, TerminationCondition, LoopWhileCondition, PhaseVariableKind, PhaseVariable, CodeStepContext types + extended WorkflowPhase fields (kind includes `branch:if`/`branch:switch`/`code`/`loop`, plus loop block fields `body`/`repeatWhile` and the engine-injected-node `synthetic` flag) + branch routing types (IfBranchRouting, SwitchBranchRouting, LoopBackRouting, BranchRouting)

Capability infrastructure:
  capability-package.ts  — CapabilityPackageConfig, WorkflowPhase (extended with minIterations, maxIterations, terminateWhen, loopMessage, write), FrontmatterSchemaDeclaration types + layout constants
  capability-discovery.ts — discoverCapabilities(), registerCapability() (scans capabilities/ for config.ts)
  capability-config.ts   — resolveCapabilityConfig() (dynamic imports, prefers default exports from directory packages)
  capability-session.ts  — Sub-session orchestration: launch, prompt injection, model switching (renamed from session-capability.ts)
  capability-utils.ts    — Leaf utility: mergeCapabilitySkills()
  prompt-compiler.ts     — compilePrompt(), readWorkflowPhases() (assembles prompts from component files)

Shared modules:
  fs-utils.ts            — resolveGoalDir, stepFolderName, discoverNextStep, prepareGoal, issues helpers
  types.ts               — CapabilityConfig, CapabilityContract, MarkdownFileSpec, PrepareSessionCallback, PreValidateCallback
  capability-state.ts    — CapState class, FileState interface, createCapState factory (contract-backed lazy file access)
  goal-state.ts          — DELETED (replaced by capability-state.ts)
  state-machines.ts      — StateMachine<C>, TransitionEdge<C>, TransitionResult, ResolverResult types + dispatch/getOutgoingEdges/registerMachine/unregisterMachine/getMachine/getRegisteredMachines/recordTransition with optional actualParams (leaf module, no internal imports)
  state-machines/        — pio-workflow-machine.ts (goalDrivenDevelopment machine config, resolve functions using getCapState), utils.ts (setDiscoveredContracts/getCapState contract caching only)
  queues.ts              — enqueueTask, readPendingTask, writeLastTask
  model-config.ts        — resolveModelForCapability(), readTurnThreshold(), readPioWorkspaceDir(). Reads ~/.pi/pio-config.yaml

pio/ package (standalone executable — separate project with its own node_modules, manifest, tsconfig, vitest config; purely additive — recorded sanctioned exception: the two root tooling files exact-pin @biomejs/biome 2.5.13 for cross-tree parity):
  bin/pio                — thin ESM JS delegator (committed mode 100755): one dynamic import("../src/cli.ts") + process.exitCode sink; no re-exec/bootstrap layer (runtime floor Node >= 23.6 native type stripping)
  bin/pio-run-session    — dedicated top-session entry delegator (mode 100755; NOT registered in package.json bin — invoked by absolute path from inside the bubble)
  src/cli.ts             — strict argument parser (pure) + main(argv, io?) dispatch; host grammar = R1 forms + unified run path: ONE hoisted lazy import("./sandbox/run.ts") — the only SDK path (dynamic set exactly {"./sandbox/run.ts"}, static set exactly {"./version.ts"}); probe fast-case byte-identical, every other name delegates onward so the loader gate decides (cli owns zero refusal bytes; help advisory line)
  src/probe.ts           — built-in diagnostic target (NOT a capability): TTY preflight, frozen PROBE_OPENING_TEXT constant, InteractiveMode host over inherited stdio, stop()/dispose() teardown; exports run(io?, { sessionsRoot? }): Promise<number> + single-source TTY_REFUSAL_LINE; BYTE-STABLE through goal capability-base (probe arms untouched; produces no status.json)
  src/run-session.ts     — dedicated top-session entry runSession(argv?, io?): strict two-value syntactic-only parse <capability> --sessions-root <dir>; capability gate BEFORE TTY preflight; probe arm direct-dispatches (byte-stable); non-probe arm drives the full pipeline (loader resolve → PioSession.create → instantiate → base run() → status emission → mapped exit code) under its last-resort boundary; ZERO static VALUE imports (dynamic thunks exactly ./probe.ts, ./capability/loader.ts, ./capability/pio-session.ts, ./capability/status.ts)
  src/session.ts         — createProbeSession(cwd, sessionsRoot?, opts?): the durable pi SDK session wiring (SessionManager.create(cwd[, sessionDir]) -> stored factory -> services -> from-services -> runtime), generalized by goal capability-base with optional CreateProbeSessionOptions {sessionListener? (one-time subscribe attach outside the factory closure), customTools? (reserved identity-threaded slot, key-absent default)}; one of two modules importing the pinned SDK directly
  src/capability/        — capability authoring surface (goal capability-base; colocated hermetic suites per module — pure-fake SDK seam, tmpdirs, injected signal/exit seams): errors.ts (four-export error home: CapabilityErrorCause · standalone ContractViolationError{violations[]} auto cause "contract" · PhaseBudgetError{iterations} · SessionStatusError JSON-safe capture shape; zero imports) · contract.ts (v1 Contract {name, version, inputs, outputs, writes, allowProjectWrites?} — NO sandbox field; LOCAL MarkdownFileSpec/ValueSpec/ContractSpec re-declarations since pio cannot import root types; classifySpec sole shared 4-mode resolver [value/file/missing-value/unresolvable; paramKey beats file]; validateInputs pre-spawn collect-all single-throw; checkContract non-throwing load-time) · pio-session.ts (PioSession host: static create + private ctor, one instance-scoped subscriber feeding toolUses/filesWritten/askUserCalls/tokens [local 5-field usage accumulator — addUsageToTotals not root-exported], minimal Map-backed SessionVariableStore, execute_phase(id, {instructions?, min?, max?, shouldStopLoop?: (ctx)=>Promise<boolean>}) with run-ended=done semantics, exported renderPhaseMarker) · base.ts (PioCapability abstract class: declare readonly contract, abstract call(), base-provided never-overridden run() composition seam, catch-all never rejects) · loader.ts (capabilities-only: EMPTY static name→factory table, prototype-chain identity check vs bundled base, load-time contract check, single-owned refusal lines, lazy-import discipline) · status.ts (SessionStatus declared HERE ONLY + terminal emitter: status.json once-per-process at <engagement>/.sessions/top/status.json, single-write guard, exit-code map ok→0 / typed failure→1 / SIGTERM partial capture cause "kill"→exit 1)
  src/version.ts         — PIO_VERSION constant (single --version source)
  src/sandbox/           — R2 sandbox launch path (HOST-SIDE ONLY; colocated hermetic descriptor-table suites): profile.ts (shape types + compiled conservative-default mount table), render.ts (pure renderProfile -> SandboxProfile; ordered mounts, cwd rw LAST, env quartet HOME/PATH/PI_SANDBOX/PI_CODING_AGENT_DIR), fsview.ts (FsView seam + hasWildcard; node:fs globSync worker), profile-serializer.ts (buildArgv, serializeProfile, writeProfileFile, formatProfileLines — generic over profile contents), layout.ts (resolveStateRoot / deriveProjectKey / mintEngagementId / ensureEngagementLayout / ensurePiTree mkdir-only), launcher.ts (constructive bwrap pre-flight classifier MIN_BWRAP_VERSION 0.12.0 non-setuid, typed refusals naming the failing layer, anti-nesting guard, superviseSpawn stdio-inherit + exit map), run.ts (runCapability orchestrator: Gate 1 now LOADER-BASED via ../capability/loader.ts — probe fast-path short-circuits before the thunk fires, every other name resolves first and misses refuse BEFORE any side effect (CAPABILITY_NOT_IMPLEMENTED deleted; the loader owns the refusal line) — then TTY/nesting/bwrap gates -> ensures -> render -> buildArgv -> writeProfileFile -> printout -> superviseSpawn)
  Deps: @earendil-works/pi-coding-agent 0.85.1 (exact-pinned dependency, isolated pio/node_modules) · host runtime prerequisite for `pio run`: bwrap >= 0.12.0 non-setuid, constructively usable (fail-loud typed refusal when absent/unusable — a system binary, not an npm dependency)
```

**Removed modules:** `src/frontmatter-schemas.ts` (schemas now in capability-local `schemas.ts`), `src/prompts/` directory (prompts are component files inside capability packages), `src/guards/step-nudging.ts` (replaced by `runtime/loop-engine.ts`). `src/guards/session-guard.ts` moved to `runtime/session-guard.ts`. Pio-specific skills (`pio`, `pio-planning`, `pio-project-knowledge`, `pio-jira`, `grill-me`, `write-a-skill`) moved from `src/skills/` to `src/skills.old/` (out of auto-discovery). The `pio_mark_complete` tool (definition, `setupMarkComplete` registration, and step-position guard) was removed from `src/guards/mark-complete.ts` — the module now holds only the marker engine (`applyMarkers`, `cleanupMarkers`; name kept as a live import path); session exit runs engine-side via `runtime/exit-lifecycle.ts` invoked by the synthesized `__pio-exit` terminal code phase.

## Data Flow Between Services

### pio Workflow Pipeline (data flow)

```
create-goal ──GOAL.md──→ create-plan ──PLAN.md──→ evolve-plan ──S01/TASK.md──→ execute-task ──S01/SUMMARY.md──→ review-task ──(goal complete)──→ quality-gate ──QUALITY_GATE.md(approved)──→ finalize-goal
                                    ↑                                                      │                              │          │     ↑
                                    │           (significant divergence,                    │    APPROVED                │     rejected  │
                                    │            REVISE_PLAN_NEEDED.md at workspace root)   ├──────────────┐             ↓              │
                                    └──── revise-plan ←──────── evolve-plan ←───────────────┘        revise-plan ◄────┘
```

**Quality-gate:** Sits between review-task completion and finalize-goal. Requires explicit user approval of E2E testing and code review. On rejection, routes to revise-plan with QUALITY_GATE.md as revision context. PR creation (if configured) occurs in quality-gate before the manual gates.

**Blocked-step transitions** (additional paths, not shown in diagram for clarity):
- `execute-task → evolve-plan` — when SUMMARY.md `status: "blocked"`, routes back to evolve-plan for the same step number so the spec can be adapted
- `review-task → evolve-plan` — when REVIEW.md `decision: "BLOCKED"`, routes back to evolve-plan for the same step number (shared edge with APPROVED transition, differentiated by resolver logic)
- `evolve-plan → quality-gate` — fires when all plan steps are complete (COMPLETION_SUMMARY.md exists); replaced the old direct `evolve-plan → finalize-goal` edge

### Session Queue Flow (control flow)

```
Tool call (pio_create_goal, etc.)
  → enqueueTask() writes .pio/session-queue/task-{goalName}.json
  → User runs /pio-next-task
  → readPendingTask() reads queue file
  → resolveCapabilityConfig() loads capability module
  → launchCapability() creates sub-session with pio-config entry
  → Queue file deleted on launch (success or failure)
```

### Validation Completion Flow

```
Traversal reaches workflow end → synthesized `__pio-exit` terminal code phase runs automatically
(replaces the removed pio_mark_complete tool — no agent action required)
  → runExitLifecycle(config) in runtime/exit-lifecycle.ts, fixed step order:
    1. validateOutputs() checks expected files exist — failure returns immediately (no side effects); session pauses in ad-hoc mode
    2. postValidate hook (can fail to keep the session alive)
    3. Transition routing: if `stateMachineId` in session params, look up machine via `getMachine()` and dispatch explicitly; otherwise `dispatch(undefined, ...)` queries all registered machines
       — 1 result → auto-advance (enqueueTask) — enqueued task params include top-level `stateMachineId` from transition result
       — >1 results → recommend /pio-transition (no auto-advance)
       — 0 results → normal success (terminal capability; tail steps still run)
       recordTransition() appends to transitions.json audit log (same enrichedParams object as enqueueTask); resolver-declared `cleanup[]` inputs are deleted
    4a. applyMarkers() creates markers from contract.markers declarations (reads frontmatter, creates matched marker, deletes stale markers)
    4b. postExecute hook runs (non-fatal — errors warn and continue)
    5. fileCleanup deletes declared absolute paths
  Failure recovery: NO automatic retry — ad-hoc pause with `Session validation failed: <msg>`;
  user `/continue` (or restart into paused mode) re-runs __pio-exit → re-validates → enqueues on success
```
