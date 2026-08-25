# Project Overview

**pio-extension** is an extension for the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step (goal definition → planning → specification → implementation → review → quality gate → finalization) runs in its own isolated sub-session, ensuring focused execution and verifiable outputs. A plan revision cycle (`evolve-plan → revise-plan → evolve-plan`) branches off when the specification writer detects significant divergence from the plan. Before finalization, a quality-gate checkpoint requires explicit user approval of E2E testing and code review.

Developed by Svarog AI. Licensed under MIT. Repository: `github.com:Svarog-AI/pio-extension`.

## Tech Stack

- **Language:** TypeScript 5.8+ (ES2022 target, ESNext modules)
- **Module system:** ESM (`"type": "module"`, `import.meta.url` for `__dirname`)
- **Framework:** `@earendil-works/pi-coding-agent` ^0.74.0 — extension API for tool/command registration and sub-session management
- **Validation schemas:** `typebox` ^1.1.24 — JSON Schema types for tool parameter definitions
- **YAML parsing:** `js-yaml` ^4.1.1 — parses REVIEW.md frontmatter and `~/.pi/pio-config.yaml`
- **Test runner:** Vitest 4.x — unit tests with global `describe/it/expect`, Node.js environment
- **Linter and formatter:** `@biomejs/biome` ^2.5.1 — linting (`biome check`), formatting, and import organization configured in `biome.json` (v2 format, recommended preset)
- **Git hooks:** `lefthook` ^2.1.9 — pre-commit hook runs Biome on staged `.ts`/`.json` files (config in `lefthook.yml`)
- **TypeScript config:** Strict mode, `noEmit`, bundler module resolution (`tsconfig.json`)
- **Package manager:** npm (see `package-lock.json`)

## Repository Structure

The `src/prompts/` directory was removed — prompts are now component files inside each capability directory package (`role.md`, `workflow.ts`, `guidelines.md`). Direct tools (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) are consolidated in `src/direct-tools.ts`. The `src/frontmatter-schemas.ts` module was deleted — schemas now live in capability-local `schemas.ts` files. The `src/goal-state.ts` module was deleted — replaced by `src/capability-state.ts` (CapState, contract-backed lazy file access). The `src/guards/step-nudging.ts` module was deleted — replaced by the runtime loop engine (`src/runtime/loop-engine.ts`). Session-guard moved from `src/guards/` to `src/runtime/`. Most pio-specific skills were moved out of auto-discovery to `src/skills.old/`; only `pio-git` and `test-driven-development` remain in active discovery. The `pio_mark_complete` tool was removed — session exit now runs automatically: the loop engine synthesizes a terminal code phase (`__pio-exit`) that invokes the exit lifecycle (`src/runtime/exit-lifecycle.ts`). The loop engine also supports a generic programmatic phase kind (`kind: "code"`) whose `run()` callback executes TypeScript in place of an LLM turn. It also supports `kind: "loop"` do-while loop blocks (multi-phase repeating units whose `repeatWhile` condition is evaluated at the end of each full body pass); PhaseManager flattening synthesizes branch-end/loop-end merge nodes so every branch and loop has a single well-defined exit.

```
pio-extension/
├── src/
│   ├── capabilities/          # AI-driven capability directory packages + direct tools
│   │   ├── <name>/            # 11 capability packages (create-goal, create-plan, evolve-plan, quality-gate, workflow-playground, etc.)
│   │   │   ├── config.ts        — CapabilityPackageConfig default export + register(pi) named export
│   │   │   ├── role.md          — Role description (prompt component)
│   │   │   ├── workflow.ts      — WorkflowPhase[] with per-phase skill declarations + loop fields (minIterations, maxIterations, terminateWhen, body, repeatWhile, write, allowProjectWrites)
│   │   │   ├── guidelines.md    — Guidelines (prompt component)
│   │   │   ├── callbacks.ts     — Lifecycle callbacks (validation, file protections) [optional]
│   │   │   ├── schemas.ts       — Capability-local frontmatter TypeBox schemas [optional]
│   │   │   └── config.test.ts   — Colocated tests
│   │   ├── direct-tools.ts      # Non-AI tools: init, delete-goal, list-goals, parent, create-issue, goal-from-issue
│   │   └── next-task.ts         # /pio-next-task command (legacy single-file module)
│   ├── guards/                # Event-handling guards (file protection, session lifecycle)
│   │   ├── validation.ts        — File protection + frontmatter validation (readOnly/writeAllowlist)
│   │   └── mark-complete.ts     — Marker engine: applyMarkers/cleanupMarkers for declarative contract.markers (invoked from runtime/exit-lifecycle.ts)
│   ├── runtime/               # Runtime loop engine + shared session state
│   │   ├── loop-engine.ts       — Bounded iteration loop: resources_discover, before_agent_start, turn_end, agent_end, input handlers; /goto and /continue commands; ${name} template interpolation; kind: "code" programmatic phases; synthesizes the __pio-exit terminal exit phase
│   │   ├── loop-engine.test.ts  — Colocated tests for loop engine
│   │   ├── exit-lifecycle.ts    — runExitLifecycle(): engine-side capability exit (validate → postValidate → dispatch/enqueue/record + cleanup → markers → postExecute → fileCleanup); invoked by __pio-exit
│   │   ├── exit-lifecycle.test.ts — Colocated tests for the exit lifecycle
│   │   ├── session-state.ts     — PioSessionState singleton (markCompleteCalled, currentPhase, currentPhaseId, phaseManager, iteration tracking; in-memory-only programmaticLog/lastLlmPhaseId/exitOutcome/exitFailureMessage; required loopPasses do-while repeat counters)
│   │   ├── phase-manager.ts     — PhaseManager: phase registry by string ID, resolveNext (sequential order, conditional branching + do-while loop routing), branch-end/loop-end merge node synthesis, listIds
│   │   ├── session-state.test.ts
│   │   ├── session-store.ts     — SessionVariableStore: two-layer variable system (${name} interpolation, setVar/getVar/listVars tools)
│   │   ├── session-store.test.ts
│   │   ├── state-persistence.ts     — File-based persistence for loop engine state (includes currentPhaseId) + writable runtime variables
│   │   ├── state-persistence.test.ts
│   │   ├── session-guard.ts         — Turn recovery + dead-turn detection (migrated from guards/)
│   │   ├── session-guard.test.ts
│   │   └── workflow-types.ts        — StepState, TerminationCondition, LoopWhileCondition, PhaseVariable, CodeStepContext types + extended WorkflowPhase fields (kind includes "code"/"loop", plus body/repeatWhile/synthetic; BranchRouting union includes LoopBackRouting)
│   ├── skills/                # Active discoverable skills (pio-git and test-driven-development only)
│   │   ├── pio-git/SKILL.md     — Git operations for pio agents
│   │   └── test-driven-development/SKILL.md — TDD methodology guide
│   ├── skills.old/            # Archived skills (moved out of auto-discovery, preserved for restoration)
│   │   ├── pio/, pio-planning/, pio-project-knowledge/, pio-jira/, grill-me/, write-a-skill/
│   ├── index.ts               # Extension entry point — auto-discovers capabilities via discoverCapabilities()
│   ├── types.ts               # Shared type definitions (CapabilityConfig, ValidationRule, etc.)
│   ├── capability-package.ts  # CapabilityPackageConfig, WorkflowPhase, FrontmatterSchemaDeclaration types + layout constants
│   ├── capability-discovery.ts # discoverCapabilities() — scans capabilities/ for directory packages
│   ├── capability-config.ts   # resolveCapabilityConfig() — resolves config from directory packages
│   ├── capability-session.ts  # Sub-session orchestration: launch, CustomMessage injection, model switching (was session-capability.ts)
│   ├── capability-utils.ts    # Leaf utility: mergeCapabilitySkills()
│   ├── prompt-compiler.ts     # compilePrompt() — assembles prompts from component files (role.md, workflow.ts, guidelines.md)
│   ├── fs-utils.ts            # Filesystem helpers (resolveGoalDir, stepFolderName, prepareGoal)
│   ├── capability-state.ts    # CapState — contract-backed lazy file access (replaces GoalState)
│   ├── goal-state.ts          # DELETED — replaced by capability-state.ts
│   ├── state-machines/        # Declarative state machine framework
│   │   ├── pio-workflow-machine.ts  # pio workflow machine config (12 edges, resolve functions)
│   ├── state-machines.ts      # Framework types (StateMachine<C>, TransitionEdge<C>) + dispatch API
│   ├── queues.ts              # Session task queue (enqueueTask, readPendingTask, per-goal slots)
│   └── model-config.ts        # Per-capability model config from ~/.pi/pio-config.yaml
├── .pio/                      # Runtime workspace (goals, issues, session queue)
│   ├── goals/<name>/          # Per-goal workspaces: GOAL.md, PLAN.md, PLAN_ARCHIVE/, S01/, nested subgoals under S{NN}/subgoals/<name>/, transitions.json
│   ├── issues/                # Issue backlog as markdown files
│   ├── PROJECT/               # 7-file project context (loaded by sub-sessions)
│   └── session-queue/         # Per-goal task slots (task-{key}.json, hierarchical keys for nested subgoals)
├── .github/workflows/ci.yml   # CI: type check + Vitest tests on push/PR to main
├── docs/                      # Empty — no documentation files yet
├── package.json               # Dependency manifest + pi extension config (pi.extensions[0])
├── tsconfig.json              # TypeScript compiler options (strict, noEmit)
├── biome.json                 # Biome v2 config: linting, formatting, import organization
├── lefthook.yml               # lefthook pre-commit hook config (Biome on staged .ts/.json)
├── vitest.config.ts           # Vitest config: Node.js env, globals, src/**/*.test.ts
├── LICENSE                    # MIT (c) 2026 Svarog AI
└── README.md                  # Project documentation with tools and commands reference
```
