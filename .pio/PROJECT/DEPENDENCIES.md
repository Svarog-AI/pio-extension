# Dependencies

## External APIs

The project has **no direct external API or service integrations.** It is a pi extension that runs inside the pi coding agent and makes no direct HTTP/API calls (no `fetch`/`axios`/websocket usage in source; no database, message broker, or cache).

- **GitHub** — used only as the git remote (`github.com:Svarog-AI/pio-extension.git`) and as the CI runner (`.github/workflows/ci.yml`). No GitHub API integration in the source.
- **LLM model providers** (Anthropic, OpenAI, etc.) — accessed **through the pi host**, not directly. `src/model-config.ts` only parses/validates `{ provider, modelId }` config strings and resolves which model a capability uses; it never calls a provider API.
- **Retired:** a Jira integration exists only under `src/skills.old/pio-jira/` (archived skill using the `acli` CLI); it is not an active dependency.

No endpoints, versions, or authentication methods apply to the current codebase.

## Third-Party Libraries

### Runtime dependencies (`dependencies`)

| Package | Version | Purpose |
|---------|---------|---------|
| `js-yaml` | 4.1.1 | YAML parsing for markdown frontmatter and `~/.pi/pio-config.yaml` |

### Dev dependencies (`devDependencies`)

| Package | Version | Purpose |
|---------|---------|---------|
| `@earendil-works/pi-coding-agent` | 0.74.0 | The pi host framework — extension API for tool/command registration and sub-session management |
| `pi-ask-user` | 0.10.0 | Provides the `ask-user` skill for decision handshakes in pio sub-sessions |
| `typescript` | 5.9.3 (declared `^5.8.0`) | Type checking (`npm run check` → `tsc --noEmit`) |
| `vitest` | 4.1.6 | Unit test runner (node environment, globals) |
| `@biomejs/biome` | 2.5.1 | Linting + formatting + import organization (`biome.json`) |
| `lefthook` | 2.1.9 | Git hooks — pre-commit Biome check on staged files |
| `typebox` | 1.1.38 (declared `^1.1.24`) | JSON-Schema types for tool parameters and frontmatter validation |
| `@types/node` | 25.7.0 | TypeScript types for Node.js |
| `@types/js-yaml` | 4.0.9 | TypeScript types for js-yaml |

*(Versions are the resolved versions from `package-lock.json`.)*

## Internal Package Graph

This is **not a monorepo** — there are no internal packages. It is a single extension package. The internal module structure (from `src/`) is:

```
src/index.ts (entry — registers everything)
├── capability-discovery.ts  → scans src/capabilities/*/config.ts (auto-discovery)
├── capability-package.ts    → CapabilityPackageConfig types
├── capability-session.ts    → sub-session launch/orchestration
├── capability-state.ts      → CapState (contract-backed file access)
├── capability-utils.ts      → mergeCapabilitySkills (leaf)
├── capability-config.ts     → resolveCapabilityConfig (dynamic loading)
├── model-config.ts          → reads ~/.pi/pio-config.yaml (models, guards, loop, workspace)
├── prompt-compiler.ts       → compilePrompt() from role.md/workflow.ts/guidelines.md (leaf)
├── state-machines.ts        → StateMachine framework + dispatch() + recordTransition()
├── state-machines/          → pio-workflow-machine.ts (resolve* edges)
├── direct-tools.ts          → non-AI tools (init, delete-goal, list-goals, parent, create-issue, goal-from-issue)
├── guards/                  → validation.ts (file protection), mark-complete.ts (marker engine)
├── runtime/                 → loop-engine.ts, phase-manager.ts, session-state.ts, session-store.ts,
│                              session-guard.ts, state-persistence.ts, exit-lifecycle.ts, workflow-types.ts
├── queues.ts                → .pio/session-queue task slots
├── fs-utils.ts              → goal workspace / .pio path helpers (pioRootDir)
├── capabilities/            → per-capability packages (config.ts, workflow.ts, role.md, guidelines.md)
├── skills/                  → bundled skills (capability-design, pio-git, tdd)
└── types.ts                 → shared types (CapabilityContract, etc.)
```

**Design discipline:** leaf modules (`capability-discovery`, `capability-utils`, `prompt-compiler`) are documented as "leaf" modules that must not import from `capability-session`, `index.ts`, or capability modules, to avoid circular dependencies.

## Data Flow Between Services

Since there are no external services, "data flow" is the internal goal-driven workflow pipeline across pio capabilities, coordinated by the declarative state machine and the filesystem-as-state-store (`.pio/`):

```
pio_init
  │  (creates .pio/)
  ▼
create-goal ──▶ create-plan ──▶ evolve-plan ──▶ execute-task ──▶ review-task ──▶ quality-gate ──▶ finalize-goal
  │  GOAL.md        PLAN.md         TASK.md         code+TDD         REVIEW.md        QUALITY_GATE.md     updates .pio/PROJECT/
  │                S{NN}/          +DECISIONS.md   TEST.md          (approve/reject)  (approved/rejected)   documentation
  │                   │              │              │
  │                   │              └─▶ revise-plan (on divergence; archives PLAN.md, rewrites)
  │                   └───────── subgoal (complexity: "subgoal") → full lifecycle recursively
  │
  └─▶ every capability completion: __pio-exit → runExitLifecycle()
         → validate outputs → dispatch transition → enqueueTask(.pio/session-queue/) → applyMarkers → recordTransition(transitions.json)
```

**State artifacts moved between steps** (via `MarkdownFileSpec` contract entries, resolved through CapState):
- `GOAL.md` — goal definition → consumed by create-plan.
- `PLAN.md` — plan (frontmatter `steps[]`) → consumed by evolve-plan/execute-task; archived to `PLAN_ARCHIVE/` on revision.
- `TASK.md` — step spec → consumed by execute-task/review-task.
- `TEST.md` / `SUMMARY.md` — step outputs → consumed by review-task.
- `REVIEW.md` — review decision (`approved`/`rejected`) → routes next transition.
- `QUALITY_GATE.md` — quality decision → routes to finalize-goal or revise-plan.
- `COMPLETION_SUMMARY.md` / `REVISE_PLAN_NEEDED.md` — mutually exclusive outputs (via `OneOfGroup`) → route completion vs. revision.
- `transitions.json` — append-only audit log of every transition.

Data moves across the **sub-session boundary** via contract-declared markdown files in the goal workspace and the session-queue JSON task slots (`.pio/session-queue/task-{key}.json`), each carrying `{ capability, params }` for the next step.
