# Dependencies

## External APIs

No external HTTP APIs or third-party services are integrated at runtime. All I/O is local filesystem operations. The extension communicates with the pi framework through its ExtensionAPI (in-process, not network-based).

Model switching (`~/.pi/pio-config.yaml`) references LLM providers (e.g., Anthropic, OpenAI) but only configures which model pi uses — pio itself makes no direct API calls to any provider.

## Third-Party Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| `@earendil-works/pi-coding-agent` | ^0.74.0 (devDep) | Core framework for the TUI-loaded extension: ExtensionAPI, `defineTool()`, session management, event system |
| `@earendil-works/pi-coding-agent` | 0.85.1 (**exact-pinned**, dep of the standalone `pio/` package) | Owned runtime of the `pio` executable — the exact pin tracks upstream independently of the root devDependency and host pi (self-contained artifact policy; evidence in commit messages) |
| `pi-native-search` | 0.1.0 (**exact-pinned**, dep of the standalone `pio/` package) | Web-tools extension PROVISIONED into every sandboxed session — provides `web_search`/`web_fetch` (goal `web-research-capability`: owned exact dependency + local-source registration of the vendored tree into the isolated agent dir + ro identity bind; loaded IN PLACE — no copy, no symlink, no network at launch; zero operator obligations) |
| `pi-ask-user` | 0.15.0 (**exact-pinned**, dep of the standalone `pio/` package) | Structured `ask_user` FEEDBACK TOOL vendored into every sandboxed session via the same owned-extension roster (goal `web-research-capability`). MIT, ZERO runtime dependencies — peers (`pi-coding-agent`, `pi-tui`, `typebox`) host-provided inside the pi process; the loader's alias bridge resolves the heavy `pi-tui`/typebox imports from the SDK's nested copies (measured — the documented mitigation gate never engaged). AVAILABILITY ≠ USAGE: no capability consumes it yet. DISTINCT from the ROOT devDependency `pi-ask-user` ^0.10.0 listed below — different tree, different revision, different consumer (root serves the ask-user SKILL to pio sub-sessions) |
| `typebox` | ^1.1.24 (devDep) | JSON Schema type builders for tool parameter definitions |
| `typescript` | ^5.8.0 (devDep) | Type checking via `npm run check` (`tsc --noEmit`) |
| `vitest` | ^4.1.6 (devDep) | Test runner: unit tests with global `describe/it/expect` |
| `@types/node` | ^25.7.0 (devDep) | Node.js type definitions |
| `@types/js-yaml` | ^4.0.9 (devDep) | TypeScript declarations for js-yaml |
| `js-yaml` | ^4.1.1 (dep) | YAML parsing: REVIEW.md frontmatter, `~/.pi/pio-config.yaml` |
| `pi-ask-user` | ^0.10.0 (devDep) | Provides the `ask-user` skill for decision handshakes in pio sub-sessions |
| `@biomejs/biome` | 2.5.13 (**exact-pinned**, devDep in BOTH trees) | Linter and formatter — recommended preset with test file overrides (single shared root `biome.json`; both manifests pin identically so the lefthook pre-commit hook and the per-tree gates share ONE engine — owner-directed cross-tree alignment during goal `capability-base` after the stale range-resolution skew silently re-flipped a committed layout) |
| `lefthook` | ^2.1.9 (devDep) | Git hook manager — pre-commit Biome check on staged `.ts`/`.json` files (config in `lefthook.yml`) |

All devDependencies run at development time or via pi's TypeScript runtime. Production dependencies: `js-yaml` (root); the `pio/` package EXACT-pins THREE runtime deps — `@earendil-works/pi-coding-agent` 0.85.1 (owned pi runtime) plus `pi-native-search` 0.1.0 and `pi-ask-user` 0.15.0 (owned extensions provisioned into every sandboxed session via the `OWNED_EXTENSION_PACKAGES` roster; goal `web-research-capability`) — versions ride the artifact lockfile, never ranges.

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
  src/cli.ts             — strict argument parser (pure) + main(argv, io?) dispatch; host grammar = R1 forms + unified run path: ONE hoisted lazy import("./sandbox/run.ts") — the only SDK path (dynamic set exactly {"./sandbox/run.ts"}, static set exactly {"./version.ts"}); EVERY name delegates onward to the single `runCapability(name, out)` arm — the probe fast-case was excised with the probe target (goal `web-research-capability`); the `--input k=v` grammar is parsed host-side with pre-launch strictness refusals (cli owns zero refusal bytes); help lists ALL THREE built-ins — `research` + the TEMPORARY `compose-new-session-demo` (goal `terminal-takeover-composition`) + the PERMANENT `compose-same-session-demo` (goal `same-session-composition`; two-line idiom per built-in)
  src/probe.ts           — *DELETED* (goal `web-research-capability`): was the built-in diagnostic target (NOT a capability: TTY preflight, frozen PROBE_OPENING_TEXT constant, InteractiveMode host over inherited stdio, stop()/dispose() teardown, single-source TTY_REFUSAL_LINE); the launch-discipline trio (`TtyStream`, `isInteractiveTty`, neutral `TTY_REFUSAL_LINE`) relocated to `sandbox/launcher.ts`, and the probe's `InteractiveMode` construction became the shipped execution-presence mechanism (entry-owned TUI mount — Key Design Decision #26)
  src/run-session.ts     — dedicated top-session entry runSession(argv?, io?): SYNTACTIC-ONLY parse <capability> --sessions-root <dir> [--input k=v …]; SINGLE-PATH loader-gated pipeline (goal `web-research-capability` excised the probe arm): loader admission → RESTORED in-namespace TTY fast-fail (pre-construction; module-private pinned refusal line — runs REQUIRE a TTY) → PioSession.create → instantiate → emitter + armKillCapture → ENTRY-OWNED InteractiveMode TUI mount over session.runtime BY REFERENCE (un-awaited render loop; [stop → dispose] teardown before record emission on every exit path; ZERO entry stdout on every path — terminal-ownership doctrine) → instance.run(parsed.inputs by reference) → mapped exit code, under its last-resort boundary; ZERO static VALUE imports (thunks: ../capability/loader.ts, ../capability/pio-session.ts, ./capability/status.ts, ./sandbox/launcher.ts [type-only static], @earendil-works/pi-coding-agent — the entry's ONE SDK specifier occurrence, the mount thunk; goal `terminal-takeover-composition` inserts the frame-environment install thunk strictly between the mounted TUI and `instance.run` (single holder context `{sessionsRoot, topFrame, terminalStop, stderr}`) and grows the SAME `./capability/terminal-takeover.ts` thunk destructuring for `attachTopEmitter` + `installExitGuard` wiring — the merged last-resort boundary routes into the ordered shutdown pass (`holder armed ∧ guard bound` ⇒ `guard.trigger("fatal")`; pre-holder faults degrade plain as before))
  src/session.ts         — createPioSession(cwd, sessionsRoot?, opts?): the durable pi SDK session wiring (SessionManager.create(cwd[, sessionDir]) -> stored factory -> services -> from-services -> runtime), generalized by goal capability-base with optional CreatePioSessionOptions {sessionListener? (one-time subscribe attach outside the factory closure), customTools? (reserved identity-threaded slot, key-absent default)} — RENAMED from createProbeSession/CreateProbeSessionOptions (behavior-neutral; goal `web-research-capability`); one of two modules importing the pinned SDK directly
  src/capability/        — capability authoring surface (goal capability-base; colocated hermetic suites per module — pure-fake SDK seam, tmpdirs, injected signal/exit seams): errors.ts (THREE-export error home since goal `same-session-composition`: CapabilityErrorCause [closed five-member union — "budget" retained, reachable post-retirement only via ES Error.cause adoption] · standalone ContractViolationError{violations[]} auto cause "contract" · SessionStatusError JSON-safe capture shape; zero imports — PhaseBudgetError RETIRED outright with the budget-semantics rework; captureError ladder = typed-branch → closed-vocabulary adoption → bare identity fallback) · contract.ts (v1 Contract {name, version, inputs, outputs, writes, allowProjectWrites?} — NO sandbox field; LOCAL MarkdownFileSpec/ValueSpec/ContractSpec re-declarations since pio cannot import root types; classifySpec sole shared 4-mode resolver [value/file/missing-value/unresolvable; paramKey beats file]; validateInputs pre-spawn collect-all single-throw; checkContract non-throwing load-time) · pio-session.ts (PioSession host: static create + private ctor, one instance-scoped subscriber feeding toolUses/filesWritten/askUserCalls/tokens [local 5-field usage accumulator — addUsageToTotals not root-exported], minimal Map-backed SessionVariableStore, execute_phase(id, {instructions?, min?, max?, shouldStopLoop?: (ctx)=>Promise<boolean>}) with run-ended=done semantics, exported renderPhaseMarker; goal `same-session-composition` adds the CAPABILITY-SPAN MARKER channel (exported pure renderer `renderCapabilityMarker` — SOLE OWNER of the pinned `—— capability: <label> ——` bytes · module-private `customType "pio-capability"` · host seam `markCapability(label)` = ONE no-options `sendCustomMessage`, a NO-TURN durable transcript entry) and the BUDGET-BOUND SEMANTICS (the `max` ceiling BOUNDS execution — a looped phase whose stop rule still demands continuation at `iterations >= max` breaks and RESOLVES the bounded `PhaseResult` `done: true` / `iterations === max` with both observation windows closed — the retired `PhaseBudgetError` was the engine's only budget throw site); goal `terminal-takeover-composition` adds the additive COMPOSED-HOST SURFACE: `static fromRuntime(runtime)` [synchronous sibling factory over a SETTLED runtime — fresh observer + one post-attach subscription, fresh vars store; `create` stays the sole standalone-construction path, byte-stable] + `rebind(session)` [gate order FIXED: identity gate first — foreign handle ⇒ module-local EXPORTED `SessionHandleRefusalError`, pinned rendered bytes, side-effect-free — then same-handle no-op gate vs the last-bound marker — then bind: fresh listener closure routed to the PERSISTENT observer]; FRAME-IGNORANT by structural criterion (sole new field = last-bound marker; zero frame-world imports; no placement branches; no `isComposed` flag)] · base.ts (PioCapability abstract class: declare readonly contract, abstract call(), base-provided never-overridden run() composition seam, catch-all never rejects; ALSO hosts the in-bubble STATE-ROOT CHANNEL since goal `web-research-capability`: `deriveStateRootFromAgentDir` + `CapabilityEnvError` (loud typed failure, `capability:` message prefix, NO silent fallback — `PI_CODING_AGENT_DIR` is the only in-bubble state-root channel) moved here from `capabilities/research.ts` per the capability-layer placement ruling; ALSO hosts the ROW-2 TERMINAL-TAKEOVER DISPATCH since goal `terminal-takeover-composition` [session-absent `run()` delegates through the sole new dynamic literal thunk — `./terminal-takeover.ts`, never evaluated on session-present executions — to `materializeFrame`, the ENTIRE hop inside the existing catch-all: masking policy permanent, "run never rejects", kills surface at the caller's await as resolved typed captures] + the settle seam `settleFileModeOutputs` [file-mode output slots transform to bubble-absolute placement ONCE at success settlement; value slots / non-string / missing / already-absolute pass through untouched; input record survives by reference when nothing transforms; ONE settled payload serves the child record AND the caller's await identically] + the SESSION-PRESENT SPAN STAMP since goal `same-session-composition` [exactly ONE `markCapability(contract.name)` call site in the `run()` session-present branch, strictly after `validateInputs` / before the body — the row-2 hop body is UNSTAMPED on purpose (the child engagement's own `status.json` already names the callee)]) · loader.ts (capabilities-only: static name→factory table holding the THREE built-ins since goal `same-session-composition` — `research` THEN the TEMPORARY `compose-new-session-demo` THEN the PERMANENT `compose-same-session-demo` (insertion order pinned) — thunks uniformly `../capabilities/<name>.ts` — prototype-chain identity check vs bundled base, load-time contract check, single-owned refusal lines, lazy-import discipline) · status.ts (SessionStatus declared HERE ONLY + terminal emitter: status.json once-per-process at <engagement>/.sessions/top/status.json, single-write guard, exit-code map ok→0 / typed failure→1 / SIGTERM partial capture cause "kill"→exit 1; goal `terminal-takeover-composition` adds the CLAIM-AWARE PARTIAL-EMISSION surface `hasClaimed()` / `emitPartial()` [async, grace-window settle] / `emitPartialSync()` [sync best-effort for the exit-intercepted path] — a frame that already wrote its terminal record is NEVER overwritten (claimed ⇒ delegates the winner's result) — + the exported swallow-all sync writer `writeUtf8Sync` the shutdown pass's `frames.json` snapshot rides) · terminal-takeover.ts (goal `terminal-takeover-composition`: frame-environment holder `installFrameEnvironment`/`teardownFrameEnvironment` [single-holder, loud double-install; `FrameEnvironmentContext {sessionsRoot, topFrame, terminalStop, stderr}`] + `activeFrames()` ledger over `ActiveFrame {depth, capability, scopeDir, sessionFile, tokens, rebind, emitter, latch}` [`PendingLatch<T>` — reserved reject channel] + module-local `FrameEnvironmentError` [pinned message] + the SYNCHRONOUS `materializeFrame` hop dispatcher [D-sync — latch minted pre-mutation; six module-private grouped internals; try/finally winds-unwound; `HopFaultError` four pinned forms; SINGLE SDK value reach = the hop-time `SessionManager` thunk] + the ONE ordered shutdown pass + idempotent `installExitGuard` process-exit guard [`ShutdownCause` closed vocabulary user-abort/sigterm/fatal; `EXIT_CODES` 130/1/1; innermost-first claim-aware partials; `frames.json` abnormal-exit ledger snapshot; typed exit line; `attachTopEmitter`/`isFrameEnvironmentInstalled`; `FrameKillError` cause `kill`]; type-only edge set otherwise; zero SIGINT occurrences [raw-mode doctrine])
  src/capabilities/      — BUILT-IN CAPABILITY IMPLEMENTATIONS (goal `web-research-capability`; goal `terminal-takeover-composition` adds the TEMPORARY second built-in; goal `same-session-composition` adds the PERMANENT row-1 third; distinct from singular `capability/` authoring FRAMEWORK): research.ts (default export `ResearchCapability extends PioCapability` — the FIRST real built-in: bounded web-research loop over `execute_phase` with the write-delta stopping rule [continue iff the per-run filesWritten delta contains the absolute report path], min 1 / max RESEARCH_MAX_RUNS=10, goal `same-session-composition` budget rework [the try/catch budget span is REMOVED — nothing budget-shaped is thrown anymore; a bound hit (the phase RESOLVING at exactly `RESEARCH_MAX_RUNS` — cap equality alone per owner ruling) settles `ok: true` with the PINNED truncation note appended to the retained partial report [appendFile creates the degenerate note-only file when nothing was written]; non-bound faults propagate untouched], loud web-tools preflight (WebToolsMissingError, zero prompts), post-phase sanity via the classifySpec seam against the known project-slot base; value input `topic`, paramKey-driven FILE output `report`, `writes: ["research/*.md"]` + `allowProjectWrites`; report at `<projectSlot>/research/<fingerprint>.md` — fingerprint = sha256(trimmed topic) first 12 lowercase hex, deterministic re-run continuity; named exports exactly five: `CapabilityEnvError` (consolidation re-export) · `RESEARCH_MAX_RUNS` · `REPORT_FINGERPRINT_LENGTH` · `WebToolsMissingError` · `reportFingerprint`, plus the default class) + colocated hermetic research.test.ts; goal `terminal-takeover-composition` adds compose-new-session-demo.ts (TEMPORARY second built-in — removal scheduled at the bulk-migration cutover; pinned header token keeps the phrase stable): no-inputs contract [inputs [], outputs [{name:"report"}] value-slot passthrough of research's settled report token, writes []], three-phase shape — greeting turn → row-2 handover to `research` on hard-coded `DEMO_TOPIC = "Gnosticism in Barcelona"` (direct co-shipping static sibling import + session-absent construction + awaited `run()`) → post-return top-3-findings summary turn through the session stream (success-gated, stream-only); export surface exactly ['DEMO_TOPIC', 'default'] + colocated hermetic suite); goal `same-session-composition` adds compose-same-session-demo.ts (PERMANENT THIRD built-in — the standing row-1 same-session demo): structural mirror of the sibling differing ONLY in placement — no-inputs contract [inputs [], outputs [{name:"report"}] value-slot passthrough of research's settled report token, writes []], three-phase shape — greeting turn → research run INSIDE THE SAME SESSION on hard-coded `DEMO_TOPIC = "Gnosticism in Belgrade, Serbia"` (direct co-shipping static sibling import + construction WITH the caller's session instance BY REFERENCE + awaited `run()` — no spawn, no terminal change) → post-success top-3-findings summary turn through the session stream (success-only continuation behind the verbatim fault-forwarding gate; the gate keys only on `ok` — bound-settled callees continue by construction); export surface exactly ['DEMO_TOPIC', 'default'] + colocated hermetic suite over ONE shared handle carrying the ticket-acceptance evidence
  src/version.ts         — PIO_VERSION constant (single --version source)
  src/sandbox/           — R2 sandbox launch path (HOST-SIDE ONLY; colocated hermetic descriptor-table suites): profile.ts (shape types + compiled conservative-default mount table), render.ts (pure renderProfile -> SandboxProfile; ordered mounts, cwd rw LAST, env quartet HOME/PATH/PI_SANDBOX/PI_CODING_AGENT_DIR), fsview.ts (FsView seam + hasWildcard; node:fs globSync worker), profile-serializer.ts (buildArgv, serializeProfile, writeProfileFile, formatProfileLines — generic over profile contents), owned-extensions.ts (goal `web-research-capability`: `OWNED_EXTENSION_PACKAGES = ["pi-native-search", "pi-ask-user"]` — the SOLE entry point for vendored extension packages [constraint-5 per package]; existence-guard-all + ONE atomic user-scope LOCAL-SOURCE settings upsert into the isolated agent dir [vendored ABSOLUTE PATH verbatim, strict-string dedup, roster order, preserve-everything, canonical serialization, temp+rename, corrupt-file refusal, STEADY-STATE TOTAL NO-OP]; NO manifest reads; the same constant drives the renderer's vendored ro identity binds — loaded in place, no copy/symlink/network), layout.ts (resolveStateRoot / deriveProjectKey / mintEngagementId / ensureEngagementLayout / ensurePiTree mkdir-only), launcher.ts (constructive bwrap pre-flight classifier MIN_BWRAP_VERSION 0.12.0 non-setuid, typed refusals naming the failing layer, anti-nesting guard, superviseSpawn stdio-inherit + exit map; RECEIVES the relocated launch-discipline trio TtyStream/isInteractiveTty/neutral TTY_REFUSAL_LINE from the retired probe — goal `web-research-capability`), run.ts (runCapability orchestrator: Gate 1 LOADER-BASED via ../capability/loader.ts — EVERY name resolves first and misses refuse BEFORE any side effect (the probe fast-path was excised; the loader owns the refusal line) → INPUTS gates (goal `web-research-capability`: undeclared-key / missing-required-input refusals, post-admission, pre-TTY/pre-bwrap, zero side effects) → TTY/nesting/bwrap gates -> ensures (incl. owned-extension provisioning) -> render (incl. vendored ro binds) -> buildArgv -> writeProfileFile -> printout -> superviseSpawn)
  Deps: @earendil-works/pi-coding-agent 0.85.1 + pi-native-search 0.1.0 + pi-ask-user 0.15.0 (ALL exact-pinned dependencies in the isolated pio/node_modules — the two extension packages enter the sandbox via roster/local-source provisioning + ro binds, never via node resolution from the bubble; goal `web-research-capability`) · host runtime prerequisite for `pio run`: bwrap >= 0.12.0 non-setuid, constructively usable (fail-loud typed refusal when absent/unusable — a system binary, not an npm dependency)
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

### In-Bubble Composition (terminal takeover, goal `terminal-takeover-composition`)

In-process data/control flow when a built-in capability invokes another WITHOUT a session (row-2 placement — no spawn; one namespace, one process, one live `InteractiveMode`):

```
top frame (entry: PioSession.create → base run())
  │  execute_phase(...) settles on the top session — operator sees the greeting while the terminal belongs to it
  ▼
session-absent callee run()  [base dispatch: validateInputs placement-agnostic FIRST]
  └─► materializeFrame({capability, body})  — synchronous D-sync dispatcher (latch minted pre-mutation; returns latch.value immediately)
        ② capture parent session file  →  ④ mint child scope (.sessions/<B>/top/) + child file via SessionManager.create
        ⑤ switchSession(childFile)      →  ⑥ push ActiveFrame  →  ⑦ fromRuntime + child-scope status emitter
        ⑧ body executes on the CHILD session — the SAME live InteractiveMode now presents it (terminal visibly handed over)
        ⑨ settled payload assembled once → child status.json emitted UNCONDITIONALLY  →  ⑩ switch-back  →  ⑪ parentEntry.rebind()
        ⑫ pop + latch.resolve(settled)   ──────────────►  LIVE Outcome at the CALLER'S await (by reference)
                                                            parent transcript re-renders; caller continues on the top frame
abort / fault path (ordered shutdown pass — outermost-frame-owned, exactly once per process):
  trigger ∈ {double Ctrl-C [intercepted IM exit(0)], SIGTERM [own prepended handler], fatal boundary}
    → composed latches rejected innermost-first (FrameKillError cause "kill" — base masking converts to RESOLVED typed capture at the await)
    → stop/dispose legs (non-user-abort) → partial records innermost-first (claim-aware) → frames.json snapshot (abnormal exits only)
    → typed exit line → normalized exit code (user-abort 130 · sigterm/fatal 1)
```

One settled payload serves both durable channels: the per-frame `status.json` (secondary) and the caller's await (primary) are IDENTICAL objects — the base settle seam transforms file-mode outputs to bubble-absolute placement exactly once. Who-called-whom edges persist ONLY in the runtime ledger (transient) + the `frames.json` snapshot (abnormal exits only); no session lineage is ever minted.

### In-Bubble Composition (same-session, row-1, goal `same-session-composition`)

In-process, IN-SESSION data/control flow when a built-in capability invokes another WITH the caller's session instance BY REFERENCE (row-1 placement — no spawn, no terminal change, no IPC; MANDATORY single-process; one namespace, one process, one live `InteractiveMode`):

```
top frame (entry: PioSession.create → base run())
  │  execute_phase(...) settles on the top session — operator sees the greeting
  ▼
session-PRESENT callee run()  [base dispatch: validateInputs against the CALLEE'S contract FIRST
                               — a violation settles {ok:false, errors:[capture]} with ZERO side effects]
  └─► span stamp: markCapability(callee.contract.name) — ONE no-options sendCustomMessage
      (durable `—— capability: <name> ——` entry, customType "pio-capability")
      settled STRICTLY BEFORE the callee's first phase prompt in observation order
  └─► callee.call() executes ON THE SAME SESSION INSTANCE (by reference — D1 identity):
        one observer ⇒ continuous shared counters · one vars store ⇒ bidirectional visibility
        each callee phase carries its own phase markers UNDER the capability marker
        the callee is governed EXCLUSIVELY by ITS OWN contract for the span (ownership doctrine
        — composition hands it only {session, inputs}; nothing borrowed, nothing to restore)
  ▼
inline typed Outcome at the CALLER'S await (PRIMARY channel, by reference — success-only
continuation behind the verbatim fault-forwarding gate: a FAILED callee is forwarded VERBATIM,
type + message, no new error types minted; a BOUND-SETTLED callee settles ok:true with the
annotated partial and continues by construction — the gate keys ONLY on ok)
  caller's remaining phases continue under the caller's own contract — STRUCTURAL return
  (nothing ever changed mid-call; no residue, no restore machinery; slot-10 guard layer owns
  the future per-write blocking — none lands in this placement)
```

The TOP frame's `status.json` is the SINGLE durable record for the whole run — row 1 mints NO child scope dirs, NO per-frame emissions, NO session lineage (there is no hop; the row-2 machinery stays unevaluated on session-present executions). One composed session = one engagement = one transcript marked per capability in call order (`capability: P / phase x / capability: C / phase y …`); counter/variable continuity across the boundary falls out of instance identity (D1/D4). Bound-event observables ride the same two channels as any outcome — IN-STREAM (the annotated partial the summary turn reads back) and IN-LEDGER (the `outputs.report` token resolving to the artifact containing the pinned truncation note); NO new stream machinery (terminal-ownership doctrine untouched).
