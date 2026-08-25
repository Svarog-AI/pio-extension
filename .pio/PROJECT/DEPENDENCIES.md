# Dependencies

## External APIs

No external HTTP APIs or third-party services are integrated at runtime. All I/O is local filesystem operations. The extension communicates with the pi framework through its ExtensionAPI (in-process, not network-based).

Model switching (`~/.pi/pio-config.yaml`) references LLM providers (e.g., Anthropic, OpenAI) but only configures which model pi uses — pio itself makes no direct API calls to any provider.

## Third-Party Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| `@earendil-works/pi-coding-agent` | ^0.74.0 (devDep) | Core framework: ExtensionAPI, `defineTool()`, session management, event system |
| `typebox` | ^1.1.24 (devDep) | JSON Schema type builders for tool parameter definitions |
| `typescript` | ^5.8.0 (devDep) | Type checking via `npm run check` (`tsc --noEmit`) |
| `vitest` | ^4.1.6 (devDep) | Test runner: unit tests with global `describe/it/expect` |
| `@types/node` | ^25.7.0 (devDep) | Node.js type definitions |
| `@types/js-yaml` | ^4.0.9 (devDep) | TypeScript declarations for js-yaml |
| `js-yaml` | ^4.1.1 (dep) | YAML parsing: REVIEW.md frontmatter, `~/.pi/pio-config.yaml` |
| `pi-ask-user` | ^0.10.0 (devDep) | Provides the `ask-user` skill for decision handshakes in pio sub-sessions |
| `@biomejs/biome` | ^2.5.1 (devDep) | Linter and formatter — recommended preset with test file overrides (config in `biome.json`) |
| `lefthook` | ^2.1.9 (devDep) | Git hook manager — pre-commit Biome check on staged `.ts`/`.json` files (config in `lefthook.yml`) |

All devDependencies run at development time or via pi's TypeScript runtime. The only production dependency is `js-yaml`.

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
