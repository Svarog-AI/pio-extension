---
name: capability-design
description: Turns narrative, prose capability phase descriptions (a capability's workflow.ts instructions plus role.md/guidelines.md intent) into structured loop-engine WorkflowPhase[] graphs with explicit loop bounds, steering, termination conditions, phase kinds, and write gates. Use when designing, migrating, or re-deriving pio capability workflows for the loop engine — turning narrative capability descriptions into structured loop-engine workflows, adding iteration, branching, or code phases to a workflow.ts, or reviewing a phase graph against loop-engine semantics.
---

# Capability Design

## Overview

This skill is the methodology for turning a **vague, narrative capability phase description** — the prose "algorithm" of what a capability should do — into a **structured loop-engine `WorkflowPhase[]` graph** with explicit iteration bounds, steering, termination conditions, phase kinds, and write gates.

It applies whenever you are:

- **Designing** a new pio capability for the loop engine,
- **Migrating** an existing narrative-shaped workflow (plain phases, no loop fields) to the loop-engine shape,
- **Re-deriving** a capability's phase graph from its narrative during a co-design session.

The loop engine (`src/runtime/`) is feature-complete; the skill documents its exact semantics so a designed workflow is structurally valid on the first run. The worked example `src/capabilities/workflow-playground/workflow.ts` exercises every field and `kind` in action.

## Inputs

The methodology starts from two inputs:

1. **The narrative workflow description** — the capability's `workflow.ts` prose instructions plus the intent of its `role.md` / `guidelines.md`. This is the algorithm in prose: what the agent does, in what order, with what quality bar, and where it asks the user.
2. **The capability's contract** — its declared inputs, expected outputs, and `excludedFiles` from its `config.ts`. The contract defines what the capability reads and must produce; the exit lifecycle validates outputs against it.

The pre-migration production workflows share a recognizable shape: prose `instructions` per phase, no loop fields, and a trailing `signal-completion` phase that the migration removes.

## Structured output

A finished design is a `WorkflowPhase[]` graph. Every phase has required `id`/`title` and, where used, **explicit** loop semantics, a non-standard `kind` with its own fields, and `write`/`allowProjectWrites` gates on output-writing phases. Source of truth for all field definitions: `src/runtime/workflow-types.ts`.

### Loop semantics (per phase, all optional)

| Field | Meaning |
|-------|---------|
| `minIterations` | Minimum iterations before termination conditions are evaluated |
| `maxIterations` | Hard limit on iterations regardless of termination conditions. With `kind: "loop"` it counts **full body passes**, not single-phase iterations |
| `loopMessage` | Steering text sent as a follow-up when the phase replays — tells the LLM what to focus on for the retry |
| `terminateWhen` | **Callback-only** conditions: `{ type: "callback", callback: (state) => boolean }[]`. **AND logic** — all conditions must pass to advance |
| `loopWhile` | **OR-logic complement** of `terminateWhen`: any passing condition keeps the phase looping (replay). `loopWhile(a)` is equivalent to `terminateWhen(¬a)` |

**Every loop field omitted = the phase runs once and advances.** That is the default and the lean shape — see Decision rules.

### Phase kinds and their own fields

`kind` defaults to `"standard"`. Non-standard kinds and the fields that go with them:

- **`"standard"`** (default) — a normal LLM phase with `instructions`.
- **`"variable-definition"`** — declares `variables: PhaseVariable[]`. Each entry: `name`, `type` (e.g. `"string"`, `"number"`, `"boolean"`), `kind: "static" | "llm" | "computed"`, plus `value` (static), `description` (llm — what the agent should determine and set via `setVar`), or `compute(state)` (computed — callback at `agent_end`). `instructions` is ignored; the engine generates the phase's instructions from the `variables` array. A variable-definition phase declaring **only `static`/`computed` variables (no `llm`) is purely programmatic** — it runs inline with no agent turn.
- **`"branch:if"`** — `condition(state)` (truthy selects `then`, falsy selects `else`), `then: WorkflowPhase[]`, `else: WorkflowPhase[]`. A missing `else` arm **skips** (jumps to the post-branch phase).
- **`"branch:switch"`** — `on`: either a callback `(state) => unknown` or a `"$varName"` string resolved via `state.store`; `cases: Record<string, WorkflowPhase[]>` keyed against the `on` result; `defaultBranch` fallback when no case matches (or `on` throws). A missing `defaultBranch` skips.
- **`"code"`** — `run(ctx: CodeStepContext)` executes **TypeScript in place of an LLM turn**. Everything is reached through `ctx.state`: variables via `state.store`, contract I/O via `state.capState`, identifiers via `state.sessionId` / `state.projectRoot`. `run` must be present for `kind: "code"` and absent for all other kinds (enforced at `PhaseManager` construction). A throwing `run()` never blocks traversal — it is caught, warned, logged, and traversal continues.
- **`"loop"`** — a do-while block: `body: WorkflowPhase[]` (the repeating unit) + `repeatWhile(state)` evaluated **at the end of each full body pass** (do-while — never pre-checked, so ≥1 pass is guaranteed). `maxIterations` on the block counts full body passes. The container itself never receives an agent turn and requires no `instructions` (the prompt compiler's top-level validation exempts programmatic kinds).

### Write gates (per phase)

- **`write[]`** lists contract output **names** only (resolved to paths via `CapState` during `resources_discover`). Gating is **restricted-by-default**: an absent or empty `write[]` blocks **all** contract-output writes from that phase.
- **`allowProjectWrites`** (default `false`) governs **non-contract** project-root file writes. Contract outputs listed in `write[]` pass regardless of this flag.
- **`/tmp/` paths bypass all write gating** (scratch space).

## Capability-level contract design (general methodology)

Phase design is only part of the picture — the capability's overall shape and permissions are designed from its contract:

- **Inputs/outputs ordering.** Each expected output is produced where it is validated; inputs feed the phases that consume them. The exit lifecycle validates expected outputs against the contract, so every output must be explicit and produced by some phase.
- **Capability-level permissions.** `readOnlyFiles` (inputs the session must not modify) and `writeAllowlist` (which files the session may write) in the capability's `config.ts`, enforced via the `tool_call` handler.
- **Per-phase write gates.** A phase writes only what it owns (its `write[]`); read-only phases do not modify inputs.
- **Mutual coherence.** The phase graph, the contract (inputs/outputs), and the capability/per-phase permissions must be mutually consistent: **every expected output is written by some phase under the right permission, and no phase writes outside its gates.**

## Decomposition methodology (core)

Start from a **single-phase assumption** — "do X" — then iterate through the decomposition questions below. Each question splits or structures the graph:

0. **Phase = micro-task.** Split until each phase carries **one small, verifiable objective**. A checklist-shaped mega-prompt (LLM-responsibility for many items in one turn, with no per-item validation) is an anti-pattern. Prefer disk-observable, per-item validation where available so each item's completion is mechanically verifiable rather than self-reported. Because the engine re-serves a phase's full `instructions` on **every** entry and replay (`loopMessage` is only an addendum), instructions must stay short and valid on every entry — static lookup data (e.g. a per-theme method map) is fine, long action lists are not.

1. **Validation points → phases.** How many validation points does "X" have? Y validation points → Y phase boundaries: each validation point becomes a phase boundary, so work is verifiable per phase.
2. **Pure-code logic → `kind: "code"` phases.** Is there logic that needs no LLM judgment (setting variables, checking files, counting passes, preparing routing data)? That logic becomes a programmatic `kind: "code"` phase whose `run()` executes inline — not an LLM turn.
3. **Iteration → bounded validation loops.** Which phases benefit from several iterations (retry until tests pass, refine until quality bar met)? Those get `minIterations`/`maxIterations` bounds plus `loopMessage` steering and a termination condition (`terminateWhen` or `loopWhile`) — a validation loop.
4. **Conditional branches → branch phases.** Are there conditional branches in "X"? Translate them to `kind: "branch:if"` (two arms) or `kind: "branch:switch"` (multi-way, keyed by a callback or a `"$varName"` string) with arms.
5. **Iterative-refinement groups → do-while `kind: "loop"` blocks.** Are there groups of phases that need iterative refinement and validation together? Wrap them in a do-while `kind: "loop"` block (`body` + `repeatWhile`, `maxIterations` counting passes).

Work the questions in order: split by validation points first (phase count), extract code phases, add iteration to the phases that need it, translate conditionals to branches, then wrap refinement groups in do-while blocks.

## Decision rules

**Genuinely iterative vs. single-pass.** A phase is genuinely iterative when the narrative implies retry or refinement — "keep going until the tests pass", "review and fix issues", "clarify until there are no gaps". Single-pass work has a natural end in one turn. When the narrative is ambiguous, do not guess — confirm with the user via the co-design protocol.

**Choosing the termination signal** (the `terminateWhen`/`loopWhile` callback reads `PioSessionState`):

- **Prefer `filesWritten`-based callbacks** when the phase's success is observable as file writes — e.g. `state.filesWritten.some((f) => f.endsWith("TEST.md"))`.
- **`askUserCalled` — exhaustion loops.** For interview/clarify/Q&A phases where **silence is a legitimate end state**, use `loopWhile(askUserCalled)`: a run that contained questions may have more un-exhausted, so keep running; the first silent run terminates the phase. **Stall warning:** `terminateWhen(askUserCalled)` on such phases makes no-ask runs replay to `maxIterations` and then idle-pause (the engine does not force-advance at the cap) because the flag resets per run. Reserve `terminateWhen(askUserCalled)` for **mandatory gates** where every run must ask (e.g. manual testing/review checkpoints).
- **Variable-definition phases** (with their variables) for non-file judgments — declare the judgment as an `llm` variable and branch on it (`on: "$varName"`) or loop on it (`state.store?.get(...)`).
- `currentIteration` (per-phase, 1-based) for iteration-count logic; `state.store` for variables set in earlier phases.

**Lean by design.** Omitted loop fields = one run and advance. Do **not** bolt `minIterations: 1` onto single-pass phases — a lean phase has no loop fields at all. Add loop fields only where the decomposition (or the user) identifies real iteration.

**Seeded discovery loop — THE standard research-loop pattern.** The canonical shape for *any* research/refinement capability (project analysis, dependency research, anything whose job is to discover unknowns and then answer them).

1. **Seed — `kind: "code"` phase.** Seeds a store **array variable** (e.g. `questions`) with a **default open-question set** — an explicit coverage floor that cannot be skipped — and sets up the session-scoped scratch area. No file parsing determines open questions: the queue lives entirely in session variables. Each question gets its **own dedicated answer file** (`answers/q-<n>.md`), indexed by an `answer_index` store number that advances **only on pop**; a `notes_path` store variable points at the accumulating notes file. Scratch paths are **session-scoped** (`/tmp/<capability>/<sessionId>/...`), exposed to LLM phases via store variables + `${var}` interpolation. Session scoping is mandatory: concurrent sessions of the same capability must not share a backlog.
2. **Inner loop — `kind: "loop"` block that drains the queue one question per pass** (do-while, ~30-pass cap). Body:
   - **reset-vars** — `variable-definition` phase with `static` variables that reset per-pass state (`questionAnswered` → `false`, `nextQuestion` → empty) at the start of every pass, so no stale value leaks from the prior iteration.
   - **get-next-question** — `kind: "code"` phase that **peeks** the front of `questions` into `nextQuestion` and derives this question's **dedicated answer file** `answer_path` from `answer_index` (does **not** pop — the pop is conditional on a satisfactory answer).
   - **answer-question** — LLM phase that researches and **writes the answer to its dedicated `${answer_path}` file**, with a mechanical **non-empty-existence `loopWhile`** (`!answerFileWritten` — file exists and is non-empty; total, never throws; `maxIterations: 2`). Because each question owns its file, a plain existence check is unambiguous — no shared-file size-baseline or substring detection needed. User-only questions are resolved **inline** via `ask_user` and captured.
   - **validate-answer** — LLM-judgment `variable-definition` phase that sets `questionAnswered` (`llm` boolean) — a judgment of satisfactory-vs-gaps, not a mechanical disk-evidence check.
   - **branch:if `questionAnswered`** — **then**: `pop-question` (shift the queue, advancing `answer_index` to the next dedicated file); **else**: `refine-answer` (LLM phase that reads the draft at `${answer_path}`, improves it, and rewrites the **same file** — `loopWhile: !answerFileWritten`, `maxIterations: 2`; the index hasn't advanced, so the second-chance rewrite targets the same file) **then** `pop-question`. A satisfactory answer pops; an unsatisfactory one is refined in place before popping.
   The inner loop's `repeatWhile`: queue non-empty — it drains the queue, exiting when empty (or at the pass cap).
3. **Merge-notes — `kind: "code"` phase** immediately after the inner loop (before generate): concatenates every per-question answer file (`q-<n>.md`) in numeric order into the single notes file, preserving its header. **Best-effort and total** — unreadable/missing files are skipped, never throws. This consolidates the per-question drafts into the durable notes source the output-writing phases consult.
4. **Generate — LLM `variable-definition` phase**: reflects on what was answered and sets `new_questions` (`llm` array); before concluding it **verifies complete architecture coverage** — every component/area of the architecture (per the accumulated findings) is covered by an answered question, with genuinely new questions generated to close any gaps and only then stopping. A following `kind: "code"` `merge-questions` phase folds them into the queue. Write each seeded question to be **self-guiding** about where to look rather than attaching a separate lookup table or checklist (instructions re-serve on every entry).
5. **Outer loop — do-while `kind: "loop"`** around [inner loop, merge-notes, generate, merge-questions]; `repeatWhile`: queue non-empty (repeat only while discovery produced new questions).

**Notes file as the write reference.** The merged Q&A notes file (consolidated from the per-question answer files) replaces a parsed backlog as the source the output-writing phases consult for content.

**Why variables for the queue, a file for the notes:** the queue's open/answered state is *control flow* driven by per-pass LLM judgment and lives naturally in session variables; the **accumulated content** (the Q&A notes) is *monotonic across runs* — `filesWritten`/`askUserCalled` reset per run in `setupTurn`, so durable research output belongs in a file, not in per-run engine signals.

**Inline user clarification.** User-only questions are resolved inline in the answer phase via `ask_user` — no `[needs-user]` backlog handoff to a later clarify phase.

**Total-callback rule.** A throwing loop callback is treated as *not passing* at `agent_end`. Callbacks must catch internally and return the fail-safe value — for `loopWhile`: `true` (keep looping on unreadable input); for `terminateWhen`: `false` (do not advance).

**Single-output write phases.** One phase per contract output, gated to exactly that output (`write: [name]`), with a **total disk-existence/non-emptiness `loopWhile`** (missing or empty file → `true`, keep looping; fail-safe on any error, bounded by `maxIterations`). The anti-pattern is one phase writing many large files in a single turn — split it so each output gets its own phase, its own gate, and its own mechanical completeness check.

## User co-design protocol

Each capability is designed **together with the user** during its evolve-plan (specification) session, not in isolation:

1. **Present** the narrative→structured transformation: the two inputs, the decomposition walkthrough, and the candidate loop fields (which phases iterate, bounds, termination signals, steering messages).
2. **Confirm** the loop decisions via `ask_user` with `displayMode: "inline"` so the surrounding context stays visible.
3. **Probe** the tricky cases (probe loops, dual-mode capabilities, ambiguous iteration) with the grill-me probing technique — challenge assumptions before committing a shape.

The **user's intent — not the agent's guess — drives per-capability loop-field choices.** This is a required step of the workflow, not an afterthought.

## Delivery to co-design sessions

Co-design sessions run on the **separate, currently-running pio**, which does **not** auto-discover this repo's new skill: `setupSkills()` in `src/index.ts` scans this repo's `src/skills/*/SKILL.md` only at extension load of **builds of this repo**. Each co-design session therefore references the skill folder by **explicit path** — e.g. `src/skills/capability-design/` in this repo — rather than relying on discovery.

## Anti-patterns

- **No expression-type `terminateWhen`.** Termination conditions are callback-only; there is no expression type. If expression-like conditions are needed, declare a variable-definition phase (and branch/loop on the variable) or read `state.store` inside a callback.
- **No `setVar` instructions outside `kind: "variable-definition"` phases.** `setVar` is hard-gated — calling it from any other phase returns an error. Programmatic variable writes belong in `kind: "code"` phases via `ctx.state.store`.
- **No changes to state-machine edges, contracts (inputs/outputs/`excludedFiles`), or marker declarations/behavior.** The phase graph is freely re-derived; the contract and dispatch are not.
- **No `signal-completion` phase and no `pio_mark_complete` instruction** in any designed workflow — exit is automatic (see below).
- **No `minIterations: 1` on single-pass phases** — lean by design.

## Reference material

- **`src/capabilities/workflow-playground/workflow.ts`** — the worked example of every field and `kind` in action: loops with bounds/steering/termination (`minIterations`, `maxIterations`, `loopMessage`, `terminateWhen`, `loopWhile`), `variable-definition` phases (static/llm/computed), `branch:if` and `branch:switch` (callback and `"$varName"` forms), `kind: "code"` steps, do-while `kind: "loop"` blocks, and the **verify-phase pattern** (an LLM phase after programmatic work that checks variables/files and reports).
- **`src/runtime/workflow-types.ts`** — the source of truth for all `WorkflowPhase` field and `kind` definitions.
- Supporting sources: `src/runtime/session-state.ts` (termination signals on `PioSessionState`), `src/runtime/loop-engine.ts` (`__pio-exit` synthesis, write gating), `src/runtime/session-store.ts` (`setVar` gating).

## Automatic exit

Session exit is **fully automatic**: the engine synthesizes a terminal `__pio-exit` code phase (appended to the phase list in `src/runtime/loop-engine.ts`) that runs the exit lifecycle — validate outputs → postValidate → markers/dispatch/enqueue — with no agent action. No `signal-completion` phase and no `pio_mark_complete` instruction belongs in any workflow; migrations must never re-introduce either.
