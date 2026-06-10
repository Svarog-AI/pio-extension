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

All devDependencies run at development time or via pi's TypeScript runtime. The only production dependency is `js-yaml`.

## Internal Module Graph

```
index.ts (async) ──┬── setupSkills()          → skills auto-discovery (filesystem scan)
                   ├── setupSessionInfrastructure() → capability-session.ts (was session-capability.ts)
                   ├── setupMarkComplete()    → guards/mark-complete.ts
                   ├── setupValidation()      → guards/validation.ts
                   ├── setupSessionGuard()    → guards/session-guard.ts
                   ├── setupStepNudging()     → guards/step-nudging.ts
                   ├── setupDirectTools()     → direct-tools.ts (init, delete-goal, list-goals, parent, create-issue, goal-from-issue)
                   └── discoverCapabilities() → capability-discovery.ts (auto-discovers 9 directory packages + registers via registerCapability())

Capability infrastructure:
  capability-package.ts  — CapabilityPackageConfig, WorkflowStep, FrontmatterSchemaDeclaration types + layout constants
  capability-discovery.ts — discoverCapabilities(), registerCapability() (scans capabilities/ for config.ts)
  capability-config.ts   — resolveCapabilityConfig() (dynamic imports, prefers default exports from directory packages)
  capability-session.ts  — Sub-session orchestration: launch, prompt injection, model switching (renamed from session-capability.ts)
  capability-utils.ts    — Leaf utility: mergeCapabilitySkills()
  prompt-compiler.ts     — compilePrompt(), readWorkflowSteps() (assembles prompts from component files)

Shared modules:
  fs-utils.ts            — resolveGoalDir, stepFolderName, discoverNextStep, prepareGoal, issues helpers
  types.ts               — CapabilityConfig, ValidationRule, PrepareSessionCallback, InputValidationSpec, PreValidateCallback
  goal-state.ts          — createGoalState(), StepStatus, GoalState interface
  state-machines.ts      — StateMachine<C>, TransitionEdge<C>, TransitionResult, ResolverResult types + dispatch/getOutgoingEdges/registerMachine/unregisterMachine/getMachine/getRegisteredMachines/recordTransition with optional actualParams (leaf module, no internal imports)
  state-machines/        — pio-workflow-machine.ts (goalDrivenDevelopment machine config, resolve functions)
  queues.ts              — enqueueTask, readPendingTask, writeLastTask
  model-config.ts        — resolveModelForCapability(), readTurnThreshold(). Reads ~/.pi/pio-config.yaml
```

**Removed modules:** `src/frontmatter-schemas.ts` (schemas now in capability-local `schemas.ts`), `src/prompts/` directory (prompts are component files inside capability packages).

## Data Flow Between Services

### pio Workflow Pipeline (data flow)

```
create-goal ──GOAL.md──→ create-plan ──PLAN.md──→ evolve-plan ──S01/TASK.md──→ execute-task ──S01/COMPLETED+SUMMARY.md──→ review-code ──(goal complete)──→ finalize-goal
                                    ↑                                                      │                                  │         ↑
                                    │           (significant divergence,                   │         APPROVED                 │         │
                                    │            REVISE_PLAN_NEEDED written)               │                              ↓         │
                                    └──── revise-plan ←──────── evolve-plan ←──────────────┘                       S01/APPROVED  │
                                                                                                            REJECTED → re-exec │
```

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
  → If review-code: parseReviewFrontmatter(), applyReviewDecision() (create APPROVED/REJECTED markers)
  → If `stateMachineId` in session params: look up machine via `getMachine()`, dispatch explicitly against that machine. Otherwise: `dispatch(undefined, ...)` queries all registered machines
    — 1 result → auto-advance (enqueueTask) — enqueued task params include top-level `stateMachineId` from transition result
    — >1 results → recommend /pio-transition (no auto-advance)
    — 0 results → terminal state (no action)
  → recordTransition() appends to transitions.json audit log
  → writeLastTask() updates LAST_TASK.json
```
