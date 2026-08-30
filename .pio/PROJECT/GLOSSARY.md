# Glossary

## Terms

- **Capability** — An AI-driven workflow unit (e.g., `create-goal`, `execute-task`, `quality-gate`) implemented as a directory package under `src/capabilities/<name>/`. Exposes an agent-callable tool (`pio_<name>`). Each has a `CapabilityPackageConfig` (default export from `config.ts`) defining its session shape.
- **Capability Package** — Directory-based capability structure: `config.ts`, `role.md`, `workflow.ts`, `guidelines.md`, optional `callbacks.ts` and `schemas.ts`. Auto-discovered by `discoverCapabilities()`.
- **Goal / Goal workspace** — A directory under `.pio/goals/<name>/` containing all artifacts for a single feature/fix: `GOAL.md`, `PLAN.md`, step folders (`S01/`, `S02/`), and state markers.
- **Step folder** — A zero-padded directory inside a goal workspace (`S01/`, `S02/`) containing `TASK.md`, `TEST.md`, `SUMMARY.md`, `REVIEW.md`, `DECISIONS.md`, and optionally a `subgoals/` subdirectory. **Distinct from a workflow "phase".**
- **Sub-session** — An isolated pi agent session spawned by `launchCapability()`. Runs one capability per session with a custom prompt, working directory, validation rules, and file protections.
- **Subgoal** — A child goal workspace spawned by a plan step with `complexity: "subgoal"` in PLAN.md frontmatter, under `S{NN}/subgoals/<name>/`; runs the full pio lifecycle recursively.
- **Phase** — A unit of workflow execution within a capability session (kind: `"standard"`, `"variable-definition"`, `"branch:if"`, `"branch:switch"`, `"loop"`, `"code"`). Not to be confused with a plan "step".
- **Transition** — Resolution of "what runs next" after a capability completes, handled by the declarative state machine framework (`state-machines.ts`).
- **StateMachine / TransitionEdge / TransitionResult** — The declarative transition framework: `StateMachine<C>` (id, name, edges), `TransitionEdge<C>` (`{ from, to, resolve }`), and `TransitionResult` (`{ capability, stateMachineId, params? }`).
- **Validation gate / Exit lifecycle** — Engine-side validation at session exit: the synthesized `__pio-exit` terminal code phase runs `runExitLifecycle()` which validates outputs (`validateOutputs`) before applying markers, dispatching transitions, and enqueuing the next task.
- **CapState** — Contract-backed lazy file access (`capability-state.ts`). API: `.input<T>(name)`, `.output<T>(name)`, `.undeclared(path)`, `.resolvePath(spec)`. Replaced the deleted `GoalState`.
- **CapabilityContract** — The unified contract type (`types.ts`) mandatory on all capability configs: `inputs[]`, `outputs[]`, `markers[]`, `excludedFiles[]`.
- **MarkdownFileSpec** — A declared contract file entry: `{ name, file?, paramKey?, schema?, requiredWhen?, projectRelative? }`.
- **OneOfGroup / OutputEntry** — `OneOfGroup` is a mutual-exclusion group in `contract.outputs[]`; `OutputEntry` is the recursive union `MarkdownFileSpec | OneOfGroup | OutputEntry[]` with implicit AND-groups.
- **Runtime Loop Engine** — `src/runtime/loop-engine.ts`; executes each workflow phase as bounded agent runs (`minIterations`/`maxIterations`, `terminateWhen`, `loopWhile`, `kind: "loop"` blocks). Replaced prompt-based step nudging.
- **PhaseManager** — `src/runtime/phase-manager.ts`; string-ID phase registry and next-phase resolution (`getPhase`, `resolveNext`, `listIds`, `getFirstPhaseId`).
- **PioSessionState** — Shared session-state singleton (`src/runtime/session-state.ts`) persisting across phases for a capability session.
- **SessionVariableStore** — `src/runtime/session-store.ts`; two-layer variable system (read-only session params + writable runtime vars) with `${name}` interpolation. Exposes `setVar`/`getVar`/`listVars`.
- **Write Gate** — Phase-level write restriction enforced by the loop engine at `tool_call` events (phases declare `write: [output-names]`; `allowProjectWrites` opt-in). Complements capability-level `allowProjectWrites`.
- **File protection** — Read-only files + write allowlist enforced via the `tool_call` event handler, with default-deny for `.pio/` writes outside the session's goal workspace.
- **Session queue** — Per-goal task slots at `.pio/session-queue/task-{queueKey}.json`; consumed (deleted) on launch by `/pio-next-task`.
- **MarkerDeclaration / markers** — Declarative marker config (`outputFile`, `field`, `values`) managed by the framework (`applyMarkers`/`cleanupMarkers` in `guards/mark-complete.ts`).
- **pioRootDir** — Constant `<cwd>/.pio` used for `projectRelative` path resolution.
- **Model config** — Optional `~/.pi/pio-config.yaml` overriding which model a capability uses (resolution: per-capability → default → inherit parent).
- **DECISIONS.md** — Accumulated architectural decisions per step; read by the Finalize Goal agent to update project documentation.
- **Prompt Compiler** — `prompt-compiler.ts` `compilePrompt()` assembles the final prompt from `role.md`, `workflow.ts`, `guidelines.md`.
- **Code phase** — A programmatic `WorkflowPhase` with `kind: "code"` whose `run(ctx: CodeStepContext)` callback executes TypeScript instead of an LLM turn.
- **`__pio-exit`** — Synthesized terminal code phase that runs the exit lifecycle automatically when workflow traversal ends.
- **additionalContext** — Optional session-specific context injected into the system prompt (formerly `initialMessage`).
- **Ad-hoc mode** — When the user sends a message mid-execution, the loop engine pauses for free conversation; `/continue` resumes.
- **CustomMessage injection** — Delivering phase content as user messages (not system prompt) for KV-cache stability.

## Acronyms

| Acronym | Expansion |
|---------|-----------|
| pio | Pi Goal-Driven Workflow (the extension/project name) |
| LLM | Large Language Model |
| TDD | Test-Driven Development |
| ADR | Architecture Decision Record (referenced; none currently exist in the repo) |
| CI/CD | Continuous Integration / Continuous Deployment |
| PR | Pull Request |
| YAML | YAML Ain't Markup Language |
| acli | Atlassian CLI (Jira tool — only in retired `skills.old/pio-jira`) |
| DCO | Developer Certificate of Origin (not used in this project) |
| GPG | GNU Privacy Guard (commit signing — not used in this project) |

## Business Concepts

- **Goal-driven workflow** — The core concept: complex work is structured as goals, each decomposed into a plan of ordered steps. Each step is specified (TASK.md), implemented test-first, and reviewed (approve/reject) in isolated sub-sessions. Complex steps can be further decomposed via nested subgoals.
- **Specification-driven implementation** — `evolve-plan` produces TASK.md (what to build, with acceptance criteria) before any code is written; `execute-task` derives tests from the acceptance criteria using TDD and writes tests first, then implements. Separates planning from execution.
- **Subgoal lifecycle** — Steps marked `complexity: "subgoal"` spawn a child goal that runs the full pio lifecycle independently; on completion, finalize-goal propagates back to the parent's evolve-plan.
- **Review gate** — After implementation, `review-task` evaluates quality, coverage, and alignment. Approval advances; rejection sends the step back with REVIEW.md feedback.
- **Quality gate** — Before finalization, `quality-gate` performs two user-decided checkpoints (E2E testing, code review), producing QUALITY_GATE.md with `status: approved | rejected`. Approved → finalize-goal; rejected → revise-plan.
- **DECISIONS.md carryover** — Architectural decisions documented during specification and read by subsequent steps to maintain consistency.
- **Transition audit trail** — `transitions.json` records every capability completion (from → to with timestamps and params), providing observability into workflow progress.
- **Finalization gate** — `finalize-goal` reads accumulated decisions and updates `.pio/PROJECT/*.md` documentation so future goals benefit from accumulated knowledge.
