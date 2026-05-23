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
index.ts ────┬── setupCapability()    → session-capability.ts
             ├── setupValidation()    → guards/validation.ts
             ├── setupSessionGuard()  → guards/session-guard.ts
             ├── setupInit()          → capabilities/init.ts
             ├── setupCreateGoal()    → capabilities/create-goal.ts
             ├── setupDeleteGoal()    → capabilities/delete-goal.ts
             ├── setupCreatePlan()    → capabilities/create-plan.ts
             ├── setupEvolvePlan()    → capabilities/evolve-plan.ts
             ├── setupExecuteTask()   → capabilities/execute-task.ts
             ├── setupReviewCode()    → capabilities/review-code.ts
             ├── setupExecutePlan()   → capabilities/execute-plan.ts
             ├── setupNextTask()      → capabilities/next-task.ts
             ├── setupProjectContext()→ capabilities/project-context.ts
             ├── setupCreateIssue()   → capabilities/create-issue.ts
             ├── setupGoalFromIssue() → capabilities/goal-from-issue.ts
             ├── setupFinalizeGoal()  → capabilities/finalize-goal.ts
             ├── setupRevisePlan()    → capabilities/revise-plan.ts
             └── setupListGoals()     → capabilities/list-goals.ts

Shared modules (used by capabilities and guards):
  fs-utils.ts          — resolveGoalDir, stepFolderName, discoverNextStep, issues helpers
  types.ts             — CapabilityConfig, ValidationRule, PrepareSessionCallback
  capability-config.ts — resolveCapabilityConfig() (dynamic imports)
  goal-state.ts        — createGoalState(), StepStatus, GoalState interface
  state-machine.ts     — resolveTransition(), recordTransition()
  queues.ts            — enqueueTask, readPendingTask, writeLastTask
  model-config.ts      — resolveModelForCapability(), reads ~/.pi/pio-config.yaml
```

**Circular dependency note:** `types.ts` was created specifically to break circular dependencies between `utils.ts` ↔ `validation.ts` ↔ `session-capability.ts`. The refactor decomposed the monolithic `utils.ts` into focused modules.

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
  → resolveTransition() determines next capability
  → enqueueTask() writes next task to per-goal queue slot
  → recordTransition() appends to transitions.json audit log
  → writeLastTask() updates LAST_TASK.json
```
