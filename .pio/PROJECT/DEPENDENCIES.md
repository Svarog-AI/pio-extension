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
                   ├── setupMarkComplete()    → guards/mark-complete.ts
                   ├── setupValidation()      → guards/validation.ts
                   ├── setupSessionGuard()    → runtime/session-guard.ts (migrated from guards/)
                   ├── setupLoopEngine()      → runtime/loop-engine.ts (bounded iteration loop, replaces step nudging)
                   ├── setupDirectTools()     → direct-tools.ts (init, delete-goal, list-goals, parent, create-issue, goal-from-issue)
                   └── discoverCapabilities() → capability-discovery.ts (auto-discovers 10 directory packages + registers via registerCapability()), followed by setDiscoveredContracts() for runtime contract caching

Runtime package:
  runtime/loop-engine.ts      — Bounded iteration loop engine: resources_discover, before_agent_start, turn_end, agent_end, input handlers; ${name} template interpolation
  runtime/session-store.ts    — SessionVariableStore (two-layer variable system, setVar/getVar/listVars tools, type enforcement + coercion)
  runtime/state-persistence.ts — File-based persistence for loop engine state + writable runtime variables (load/save JSON by session ID, atomic writes)
  runtime/session-state.ts    — PioSessionState singleton (markCompleteCalled, currentPhase, iteration tracking, sessionId, store, shared by guard + engine)
  runtime/session-guard.ts    — Turn recovery + dead-turn detection (migrated from guards/)
  runtime/workflow-types.ts   — StepState, TerminationCondition, LoopWhileCondition, PhaseVariableKind, PhaseVariable types + extended WorkflowPhase fields

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

**Removed modules:** `src/frontmatter-schemas.ts` (schemas now in capability-local `schemas.ts`), `src/prompts/` directory (prompts are component files inside capability packages), `src/guards/step-nudging.ts` (replaced by `runtime/loop-engine.ts`). `src/guards/session-guard.ts` moved to `runtime/session-guard.ts`. Pio-specific skills (`pio`, `pio-planning`, `pio-project-knowledge`, `pio-jira`, `grill-me`, `write-a-skill`) moved from `src/skills/` to `src/skills.old/` (out of auto-discovery).

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
Agent calls pio_mark_complete
  → validateOutputs() checks expected files exist
  → applyMarkers() creates markers from contract.markers declarations (reads frontmatter, creates matched marker, deletes stale markers)
  → postExecute callback runs (backward compatibility for non-migrated capabilities)
  → If `stateMachineId` in session params: look up machine via `getMachine()`, dispatch explicitly against that machine. Otherwise: `dispatch(undefined, ...)` queries all registered machines
    — 1 result → auto-advance (enqueueTask) — enqueued task params include top-level `stateMachineId` from transition result
    — >1 results → recommend /pio-transition (no auto-advance)
    — 0 results → terminal state (no action)
  → recordTransition() appends to transitions.json audit log
  → writeLastTask() updates LAST_TASK.json
```
