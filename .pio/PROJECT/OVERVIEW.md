# Project Overview

**pio-extension** is an extension for the [pi](https://github.com/earendil-works/pi-coding-agent) coding agent framework that provides a goal-driven project management workflow. It enables developers and AI agents to break complex work into structured sub-sessions with validation gates, prompt templates, and explicit output requirements. Each workflow step (goal definition → planning → specification → implementation → review → quality gate → finalization) runs in its own isolated sub-session, ensuring focused execution and verifiable outputs. A plan revision cycle (`evolve-plan → revise-plan → evolve-plan`) branches off when the specification writer detects significant divergence from the plan. Before finalization, a quality-gate checkpoint requires explicit user approval of E2E testing and code review.

Developed by Svarog AI. Licensed under MIT. Repository: `github.com:Svarog-AI/pio-extension`.

## Tech Stack

- **Language:** TypeScript 5.8+ (ES2022 target, ESNext modules)
- **Module system:** ESM (`"type": "module"`, `import.meta.url` for `__dirname`)
- **Framework:** `@earendil-works/pi-coding-agent` ^0.74.0 — extension API for tool/command registration and sub-session management
- **Standalone executable runtime:** Node.js ≥ 23.6 native TypeScript type stripping — the separate in-repo `pio/` package ships a zero-build `pio` executable that exact-pins `@earendil-works/pi-coding-agent` 0.85.1 as its own owned dependency (self-contained artifact; decoupled from the root devDependency and host pi)
- **Namespace sandbox (pio executable):** `bwrap` (bubblewrap) ≥ 0.12.0 non-setuid — host-side single-user-namespace isolation for the `pio` executable's `run` launch path; constructive usability probe (not just binary presence) and fail-loud typed refusal when absent/unusable — never a silent unsandboxed run
- **Validation schemas:** `typebox` ^1.1.24 — JSON Schema types for tool parameter definitions
- **YAML parsing:** `js-yaml` ^4.1.1 — parses REVIEW.md frontmatter and `~/.pi/pio-config.yaml`
- **Test runner:** Vitest 4.x — unit tests with global `describe/it/expect`, Node.js environment
- **Linter and formatter:** `@biomejs/biome` 2.5.13 — exact-pinned in BOTH trees' manifests (owner-directed cross-tree alignment after a formatter-engine skew incident; single shared root `biome.json`, v2 format, recommended preset) — linting (`biome check`), formatting, and import organization
- **Git hooks:** `lefthook` ^2.1.9 — pre-commit hook runs Biome on staged `.ts`/`.json` files (config in `lefthook.yml`)
- **TypeScript config:** Strict mode, `noEmit`, bundler module resolution (`tsconfig.json`)
- **Package manager:** npm (see `package-lock.json`)

## Repository Structure

The `src/prompts/` directory was removed — prompts are now component files inside each capability directory package (`role.md`, `workflow.ts`, `guidelines.md`). Direct tools (init, delete-goal, list-goals, parent, create-issue, goal-from-issue) are consolidated in `src/direct-tools.ts`. The `src/frontmatter-schemas.ts` module was deleted — schemas now live in capability-local `schemas.ts` files. The `src/goal-state.ts` module was deleted — replaced by `src/capability-state.ts` (CapState, contract-backed lazy file access). The `src/guards/step-nudging.ts` module was deleted — replaced by the runtime loop engine (`src/runtime/loop-engine.ts`). Session-guard moved from `src/guards/` to `src/runtime/`. Most pio-specific skills were moved out of auto-discovery to `src/skills.old/`; only `pio-git` and `test-driven-development` remain in active discovery. The `pio_mark_complete` tool was removed — session exit now runs automatically: the loop engine synthesizes a terminal code phase (`__pio-exit`) that invokes the exit lifecycle (`src/runtime/exit-lifecycle.ts`). The loop engine also supports a generic programmatic phase kind (`kind: "code"`) whose `run()` callback executes TypeScript in place of an LLM turn. It also supports `kind: "loop"` do-while loop blocks (multi-phase repeating units whose `repeatWhile` condition is evaluated at the end of each full body pass); PhaseManager flattening synthesizes branch-end/loop-end merge nodes so every branch and loop has a single well-defined exit.

The repo additionally hosts a standalone `pio/` npm package (sibling of `src/`, added by goal `pio-r1-probe-sdk-session`, R1) — purely additive with zero modified or deleted root files — containing the `pio` executable that drives pi agent sessions through the pi SDK (`pio run probe`). It owns its own manifest/lockfile/tsconfig/vitest config, its own exact-pinned pi runtime (0.85.1), and runs on Node's native type stripping (zero build step; `erasableSyntaxOnly` enforces strippable syntax). Goal `pio-r2-sandbox-environment` (R2) extended it with the sandboxed launch path: `pio run <capability>` now resolves → renders ONE self-contained mount/env profile → writes a retained `profile.json` into the engagement dir (`~/.pio/projects/<projectKey>/engagements/<id>/`) → prints the mount list pre-exec → spawns a SINGLE bwrap namespace whose top process is the artifact's own dedicated entry `bin/pio-run-session`. The bubble's pi operates on a fully isolated, pio-owned pi configuration under `~/.pio/.pi` via the `PI_CODING_AGENT_DIR` env relocation — host `~/.pi` is fully decoupled (no bind in any mode, pristine start, owner ruling at the 2026-09-22 quality gate). Goal `capability-base` then landed the TypeScript **capability authoring surface** under `pio/src/capability/`: contracts with pre-spawn input validation, the `PioSession.execute_phase` iteration engine with run-observation counters, the abstract `PioCapability` base class (base-provided `run()` composition seam), a four-export error home, unconditional terminal `status.json` emission, and a capabilities-only loader wired into all three entry points. The loader table ships EMPTY by design — no capability is created in that goal; non-probe names meet the loader's cheap pre-launch refusal line, and `probe` remains the only resolvable end-to-end CLI target until a real capability registers.

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
├── pio/                       # Standalone pio executable — self-contained npm package (goals pio-r1-probe-sdk-session R1 + pio-r2-sandbox-environment R2 + capability-base; purely additive — recorded sanctioned exception: the two root manifest files exact-pin @biomejs/biome 2.5.13 for cross-tree parity)
│   ├── bin/pio                # Thin ESM JS delegator (shebang, mode 100755): one dynamic import("../src/cli.ts") + process.exitCode sink; no re-exec/bootstrap layer
│   ├── bin/pio-run-session    # Dedicated top-session entry delegator (mode 100755; NOT registered in package.json bin — invoked by absolute path from inside the bubble)
│   ├── src/
│   │   ├── cli.ts             # Strict argument parser (pure) + main(argv, io?) dispatch: ONE hoisted lazy import("./sandbox/run.ts") over the whole run path (sole static import = version constant); probe fast-case byte-identical, every other name delegates onward so the loader gate decides (cli owns zero refusal bytes); help carries the no-capabilities-yet advisory line; last-resort error boundary
│   │   ├── probe.ts           # Built-in diagnostic target (NOT a capability): TTY preflight before any SDK construction, frozen PROBE_OPENING_TEXT, InteractiveMode host over inherited stdio, stop()/dispose() teardown, resolves exit code 0/1
│   │   ├── run-session.ts     # Dedicated top-session entry runSession(argv?, io?): strict two-value syntactic-only parse `<capability> --sessions-root <dir>`; capability gate before TTY preflight; probe arm direct-dispatches (byte-stable — the in-namespace process carries PI_SANDBOX=1); non-probe arm drives the full pipeline (loader resolve → fresh PioSession → instantiate → base run() → status.json emission → mapped exit code) under its last-resort boundary; ZERO static VALUE imports (thunks: ./probe.ts, ../capability/loader.ts, ./capability/pio-session.ts, ./capability/status.ts)
│   │   ├── session.ts         # Durable pi SDK session wiring: SessionManager.create(cwd[, sessionDir]) (engagement .sessions/top slot in-namespace) → stored runtime factory → createAgentSessionServices (defaults-only; agentDir honors PI_CODING_AGENT_DIR) → createAgentSessionFromServices → createAgentSessionRuntime (mirrors pi's own CLI seam verbatim); optional third param CreateProbeSessionOptions {sessionListener?, customTools?} — one-time subscribe attach outside the factory closure + reserved key-absent customTools slot (generalized, not forked, by goal capability-base)
│   │   ├── version.ts         # PIO_VERSION constant — single source of --version output
│   │   ├── capability/        # Capability authoring surface (goal capability-base) — the TypeScript contract future capabilities are written against; loader table ships EMPTY (zero entries) until the first real capability
│   │   │   ├── errors.ts        — Shared error home (four exports): CapabilityErrorCause union, standalone ContractViolationError (violations[] + auto cause "contract"), PhaseBudgetError{iterations}, SessionStatusError JSON-safe capture shape
│   │   │   ├── contract.ts      — v1 Contract {name, version, inputs, outputs, writes, allowProjectWrites?} (NO sandbox field) + LOCAL ValueSpec/MarkdownFileSpec/ContractSpec (pio package cannot import root types); classifySpec (sole shared 4-mode resolver: value/file/missing-value/unresolvable; paramKey beats file), validateInputs (pre-spawn, collect-all, one throw), checkContract (non-throwing load-time)
│   │   │   ├── pio-session.ts   — PioSession host: static create(cwd, sessionsRoot?) + private ctor; one instance-scoped subscriber feeding counters (toolUses/filesWritten/askUserCalls/tokens via local usage accumulator); minimal vars store; execute_phase(id, {instructions?, min?, max?, shouldStopLoop?: (ctx)=>Promise<boolean>}) — one iteration = one observed agent run (run-ended = done); renderPhaseMarker (── <id> ── leading line, U+2014×2)
│   │   │   ├── base.ts          — PioCapability abstract class: declare readonly contract, abstract call(inputs), base-provided never-overridden run(inputs?) = THE composition seam (pre-spawn validateInputs → call → SessionStatus; catch-all never rejects)
│   │   │   ├── loader.ts        — Capabilities-only loading: hardcoded name→factory table (ships EMPTY), prototype-chain identity check vs the bundled base, load-time contract check, single-owned refusal lines, lazy-import discipline
│   │   │   ├── status.ts        — SessionStatus interface (declared here ONLY) + terminal emitter: status.json written EXACTLY ONCE at process exit to <engagement>/.sessions/top/status.json; single-write guard; exit-code map (ok→0, typed failure→1, SIGTERM partial capture cause "kill"→exit 1)
│   │   │   └── *.test.ts        — Colocated hermetic suites (six modules × suite): pure-fake SDK seam (exactly five faked value symbols), mkdtemp tmpdirs, injected signal/exit seams
│   │   ├── sandbox/           # R2 sandbox launch path (HOST-SIDE ONLY — the in-namespace top process knows nothing about sandboxes): profile.ts (shape types + compiled conservative-default mount table), render.ts (pure renderProfile → SandboxProfile; ordered mounts, cwd rw LAST; env quartet HOME/PATH/PI_SANDBOX/PI_CODING_AGENT_DIR), fsview.ts (FsView seam + hasWildcard; node:fs glob worker), profile-serializer.ts (buildArgv + serializeProfile + writeProfileFile + formatProfileLines; generic over profile contents), layout.ts (state root, project key = slugified launch cwd, engagement id, ensureEngagementLayout, ensurePiTree mkdir-only), launcher.ts (constructive bwrap pre-flight classifier, fail-loud typed refusals, anti-nesting guard, superviseSpawn stdio-inherit), run.ts (runCapability orchestrator: strict gate order → ensures → render → argv → profile.json → printout → spawn)
│   │   ├── cli.test.ts        # Colocated hermetic tests (injectable IO sinks; mechanical no-SDK/net-shrink guards in cli.ts)
│   │   ├── probe.test.ts      # Colocated hermetic tests (vi.mock seam on session.ts; opening-text char-equality; TTY preflight table)
│   │   ├── run-session.test.ts # Colocated hermetic descriptor-table suite (factory-mocked seams; lazy-SDK discipline mechanically provable)
│   │   └── sandbox/*.test.ts  # Colocated hermetic descriptor-table suites (fake FsView / mkdtemp tmpdirs; zero real bwrap/SDK/fs-$HOME access)
│   ├── package.json           # name "pio", private, ESM, bin.pio → ./bin/pio; pi-coding-agent 0.85.1 exact-pinned dep; check/test/lint scripts mirroring root naming
│   ├── tsconfig.json          # Root compiler options + erasableSyntaxOnly + allowImportingTsExtensions (mechanical zero-build guard)
│   └── vitest.config.ts       # Node env, globals, include src/**/*.test.ts relative to pio/ (root vitest never picks these up)
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
