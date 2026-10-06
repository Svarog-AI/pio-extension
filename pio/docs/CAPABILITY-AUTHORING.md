# Capability Authoring Guide

Audience: authors of **built-in pio capabilities** — modules loaded through the
registry and run inside the sandbox by `pio run <name> --input k=v`, under a
TTY-required execution surface: user-run top-level invocations require an
attached interactive terminal, and every admitted run executes under its live
terminal presenting the session stream (§7.1).

This guide distills the patterns of the first shipped built-in — `research`,
`pio/src/capabilities/research.ts` — into reusable authoring knowledge. Every
pattern below names the shipped file and symbol it cites; short verbatim quotes
of shipped declarations are the pinning device, attributed to their file.
Read every claim as TRUE of the source at HEAD: the authority anchor is the
shipped surface itself, not plan history. Cut, deferred, or reserved items are
named only as boundaries with citations — never demonstrated.

Orientation (where things live):

- `pio/src/capability/` — the framework: authoring base (`base.ts`), contract
  vocabulary (`contract.ts`), the four-export error home (`errors.ts`), the
  session host + phase engine (`pio-session.ts`), the terminal record
  (`status.ts`), and the registry (`loader.ts`).
- `pio/src/capabilities/` — the built-in implementations (plural directory =
  implementations; singular `capability/` = framework). Today exactly four:
  `research.ts` (permanent), `compose-new-session-demo.ts` (TEMPORARY
  composition vehicle — removal scheduled; registry note per §10),
  `compose-same-session-demo.ts` (PERMANENT standing row-1 demo — §11; the
  operational QG E2E target), and `guards-demo.ts` (PERMANENT
  guard-demonstration home — the live exemplar of the §1.4 expectation loop;
  §10 registry note; future guard demonstrations accumulate here).
- `pio/src/sandbox/` — host-side launch mechanics: engagement layout and
  derivation helpers (`layout.ts`), profile renderer (`render.ts`), owned
  extension provisioning (`owned-extensions.ts`), and the gated host pipeline
  (`run.ts`).
- `pio/src/tools/bash/` — the command-write fence family over phase-invoked
  `bash`: the pure snapshot-to-ruleset materializer (`landlock-ruleset.ts`),
  the fail-closed fenced bash instance (`landlock-bash.ts`), and the vendored
  Landlock carrier's hermetic syscall suite (`landlock-helper.test.ts`); the
  carrier artifact itself ships at `pio/vendor/landlock-helper/` (§13).
- `pio/src/session.ts` — the session construction seam; `pio/src/run-session.ts`
  — the single-path in-namespace entry; `pio/src/constants.ts` — the package
  root constant; `pio/package.json` — the owned exact dependencies.

## 1. Loop-hook patterns

Canonical material: `pio/src/capability/pio-session.ts` +
`pio/src/capabilities/research.ts`.

### 1.1 One phase is a budgeted sequence of SETTLED runs

One awaited prompt settles a whole logical run — internal retries, compaction
continuations, and queued messages all resolve inside it — so the prompt
promise alone is the settlement authority (module header,
`pio/src/capability/pio-session.ts`). A capability gets ONE primitive to drive
phases: the base's wrapper around the session's budgeted engine —

```ts
// pio/src/capability/base.ts
async execute_phase(id: string, opts?: PhaseOptions): Promise<PhaseResult>
```

It delegates the option bag verbatim to `PioSession.execute_phase`
(`pio/src/capability/pio-session.ts`) and throws a plain `Error` while no
session is present — pinned message (`pio/src/capability/base.ts`):
`no session available: execute_phase requires in-process placement`. Session
absence at the base's `run()` seam is what hops the row-2 terminal-takeover
frame (§8) — in-process placement remains the default hosting path for every
top frame.

The marker line is composed ONCE per phase — `renderPhaseMarker`
(two U+2014 em dashes flanking the label, single spaces: `—— id ——`) — and
leads every run's text, with the optional instructions sent below the marker.
Authors never hand-stamp markers; re-runs within the phase re-stamp the
identical leading line automatically.

### 1.2 The between-runs hook and its verdict polarity

The closed option bag and the decision window, quoted verbatim:

```ts
// pio/src/capability/pio-session.ts
export interface PhaseOptions {
  /** Sent below the marker line at every run of the phase. */
  readonly instructions?: string;
  /** Floor: the phase always executes at least this many runs. */
  readonly min?: number;
  /** Ceiling: bounds execution — continuation still demanded at it ends
   * the loop; the phase resolves with the bounded result. */
  readonly max?: number;
  /** Runs after every settled run; `true` ends the phase, `false` demands another run. */
  readonly shouldStopLoop?: (ctx: IterationCtx) => Promise<boolean>;
  /** Declared deliverable PATHS the phase MUST produce before it may
   * settle (absent or empty = no expectations; presence turns enforcement
   * ON — mandatory, always on, no opt-out). Entries are paths: absolute
   * entries pass through normalized; relative entries resolve under
   * process.cwd(). Permission-neutral in THIS module — slot 9
   * (per-session-write-gate) consumes this same declaration as its
   * write-permission frame. */
  readonly write?: readonly string[];
}

export interface IterationCtx {
  /** Fresh session-cumulative snapshot taken after the settling run. */
  readonly counters: SessionCounters;
  /** Committed paths of the just-settled run — stable under repeated reads. */
  readonly filesWritten: string[];
  /** The session variable store, passed by reference. */
  readonly vars: SessionVariableStore;
}
```

Semantics: `shouldStopLoop` runs AFTER every settled run; a verdict of `true`
ends the phase, `false` demands another run. The decision happens BETWEEN
runs, never mid-run. The floor dominates early stops: even when the hook has
already returned `true`, the loop keeps settling runs until `min` of them have
completed — so `min` is an absolute guarantee (defaults and intent: §2.1).
Declaring `write` additionally turns the engine-owned settlement gate ON —
the phase cannot settle while any declared path is missing (engine retries
are capped; exhaustion throws the typed contract violation); the full
mechanic lives in §1.4.

### 1.3 The write-delta stopping rule (canonical bounded-loop pattern)

The canonical bounded loop over a durable artifact: **CONTINUE iff
`ctx.filesWritten` (the PER-RUN delta of committed `write`/`edit` TOOL paths)
contains the durable artifact's ABSOLUTE path.** The first settled run without
that write ends the phase. `research.ts` ships the predicate in its minimal
form:

```ts
// pio/src/capabilities/research.ts
shouldStopLoop: (ctx) =>
  // Write-delta stopping rule (SR4): CONTINUE iff the PER-RUN delta
  // of COMMITTED write/edit tool paths contains the ABSOLUTE report
  // path; the first settled run without a report write ends the
  // phase. Shell-redirect appends never appear in that observable.
  Promise.resolve(!ctx.filesWritten.includes(absolutePath)),
```

Note the verdict polarity: `true` = stop, so "continue on write" reads as
`!includes(...)`.

Why disk truth through one delivered observable beats the alternatives —
status-header schemas, marker parsing, transcript inspection, variables: the
observable IS the committed-write record, maintained by the engine's own event
observation, and it is stable under repeated reads (a non-consuming slice).
No extra protocol surface has to be authored, parsed, or trusted.

Pair to the stop rule (shipped in the same module): a NATURAL stop does not
silently count as success — `research` verifies the declared output slot
resolves to an EXISTING, NON-EMPTY file joined against the known project-slot
base (via the shared `classifySpec` resolver seam,
`pio/src/capability/contract.ts`); otherwise it throws
`ContractViolationError` (cause `"contract"`), so a dry-up that wrote nothing
lands in the terminal record as a typed violation, not an empty success.

### 1.4 Expectation declarations: the engine-owned settlement gate

Material: the `write` field of the §1.2 option bag plus its enforcement
internals in `pio/src/capability/pio-session.ts` (the module-header
documentation covers the settlement gate, durable retention, the
corrective-note channel, and the typed failure at the ceiling). The
declaration arms the engine's OWN settlement check over the declared paths.
Normative claims below stay at BEHAVIOR level: the module-private names
(`renderExpectationRetryLine`, `renderMissingOutputLine`,
`MAX_EXPECTATION_RETRIES`) serve as provenance for the pinned bytes only —
module-private means not public API, the standing pattern of
`PIO_CAPABILITY_CUSTOM_TYPE`.

Forward pointer: the `write` bag AND the phase's project-writes scope flag
together ARE the phase's write permissions - the unified declaration feeder
now covers BOTH dimensions (paths and scope); the full permission layering
and the write gate are documented at §12.

**Presence semantics.** Declaring `write:` turns enforcement ON — mandatory,
always on, NO kill switch, no opt-out. An absent field or an empty array is
behavior IDENTICAL to pre-declaration: byte-identical composed prompt texts
and zero gate consults.

**The join convention.** Entries are PATHS, not legacy output names:
absolute entries pass through normalized; relative entries resolve under
`process.cwd()`. Each entry resolves ONCE at phase start, and the resolved
declaration is RETAINED durably for the whole phase duration — the storage
property slot 9 (the per-session-write-gate) will consume as its
write-permission frame; permission ENFORCEMENT itself is slot 9's scope, so
intermediate/scratch writes are neither blocked nor required here. Stated
honestly, the degenerate case: an empty-string entry resolves to
`process.cwd()` (an existing directory) and passes mechanically — no
entry-validation machinery exists.

**The gate mechanic.** Every normal settlement path passes a FRESH
disk-existence check over the resolved declared paths AT THE BREAK POINTS
ONLY — the stop-rule verdict or the budget break; floor/hook continuations
before the break never see the gate. A resolvable DIRECTORY passes
mechanically; NON-EMPTINESS stays a capability-local quality bar (the engine
never reads content). The retry counter is INDEPENDENT of both the iteration
budget and the capability's stopping rule; `iterations` counts ALL settled
runs, gate retries included; `min` is consumed before any gate consult. The
stop rule and the declaration COEXIST uniformly — the hook governs
continuation between runs, the gate denies settlement while files are
missing — and a mid-run rejection escapes unwrapped exactly as today (the
gate is consulted only on the normal settlement path).

**The decision-only declaration pattern.** A phase with NO hook AND NO `max`
is LEGAL: with the floor consumed, the expectation gate plus its ceiling
become the SOLE settlement authority. The shipped exemplar — walked through
below — is `guards-demo`'s `guard-probe` phase.

**The corrective-note channel.** Gate-triggered retries ALONE append ONE
fresh deterministic MARKED BLOCK strictly AFTER the marker-leading baseline
text: a flanked em-dash delimiter line reading —— output guard —— above the
unchanged body sentence; landed paths drop off the recomputed missing set
(fresh per retry, no history), and normal budget/hook re-runs keep
byte-identical composed texts. Pinned block format (SOLE OWNER:
`renderExpectationRetryLine`, `pio/src/capability/pio-session.ts`) — the two
lines joined by a single LF with NO trailing newline; the em dashes arrive as
the literal `\u2014` escapes in the source template and are kept ESCAPED in
this quote:

```
\u2014\u2014 output guard \u2014\u2014
Required phase output(s) still missing after ${iterations} run(s): ${missing.join(", ")}. Create each listed file with the write or edit tool before you finish this run.
```

where `${iterations}` is the honest settled-run count at the denial point and
the list carries EVERY currently-missing RESOLVED path in declaration order.

**The ceiling.** Fixed module constant (value 3), shrink-only tunable,
suite-pinned behaviorally, module-private (the export surface stays at the
pinned five keys). At the ceiling with files still missing the phase THROWS
the reused `ContractViolationError` — collect-all: one deterministic line per
STILL-MISSING path, declaration order, each naming the checked RESOLVED path
and stating the ceiling was exhausted. Pinned line format (SOLE OWNER: the
same module; the em dash arrives as the literal `\u2014` escape in the
source template — kept ESCAPED in this quote; rendered value N=3):

``phase '${phaseId}' output '${entry}' missing at ${resolvedPath} \u2014 still absent after ${MAX_EXPECTATION_RETRIES} expectation re-run(s); the ceiling is exhausted``

The throw travels unwrapped through the standard containment channels on BOTH
placements: the typed `ok:false` settlement, `violations[]` surfaced by
`captureError`'s typed-first ladder, and `exitCodeFor` → exit 1.

**DIVERGENCE from the write-delta stopping rule (§1.3).** The canonical §1.3
pattern decides on the COMMITTED-WRITE OBSERVABLE — `ctx.filesWritten`, the
per-run delta of committed `write`/`edit` tool paths; the engine gate checks
DISK EXISTENCE instead. Consequence for an author choosing between the two
observables: a shell-redirection write (e.g. `echo … > file`) SATISFIES the
expectation gate but NEVER appears in the committed-write observable — it
can end a gated phase yet it CANNOT satisfy research's hook. Both
observables are real; name which one each mechanism gives.

**The shipped exemplar walkthrough — `guards-demo`.** Top to bottom through
`pio/src/capabilities/guards-demo.ts`: the FIXED project-slot artifact token
(exported const `GUARDS_DEMO_ARTIFACT`, project-slot-relative; the absolute
placement derives through the SAME state-root/project-key channels as
research — loud typed env failure escapes PRE-everything, zero prompts); the
capability-owned REPEATABLE RESET (the error-swallowed unlink of the known
artifact immediately before the guarded phase — without it a pre-existing
artifact lets the gate pass silently and the demonstration would not trigger;
a surviving stale artifact degrades to the graceful settle rather than
aborting); the DECLARATION-ONLY guarded phase (the decision-only pattern
above instantiated: instruction + `min: 1` + `write: [<absolute artifact>]`,
no hook, no `max`, awaited UNWRAPPED); ONE static instruction text teaching
BOTH passes, disambiguated solely by the presence/absence of the engine's
corrective note (the mechanic taught in-stream: first pass drafts in reply
only with no write/edit call; the corrective pass creates the file AT THE
EXACT path); the GRACEFUL SUMMARY keyed only on observables (variant
selected by observed `PhaseResult.iterations`: `>= 2` states the guard
denied first-pass settlement and forced the corrective re-run, naming the
count; `=== 1` states the loop was armed but not triggered - no local `stat`, no
third variant: disk checks are ABSENT by design (a shrunk summary narration
keyed only on the observed iteration count), and it is never a hard failure
on model non-determinism); FAULT POSTURE (the ceiling-exhaustion
`ContractViolationError` escapes `call()` VERBATIM — never wrapped or
downgraded — and the base catch-all captures it into the typed `ok:false`
settlement); OUTCOME SETTLEMENT (returns the RELATIVE token; the base settle
seam absolutizes it once at success — `status.json`'s `outputs.report`
carries the absolute placement). Standing role: future guard demonstrations
accumulate in this module — it is a PERMANENT builtin (registry note: §10).

**The superset authoring convention (documented and enforced NOWHERE).** The
contract's `outputs[]` must CONTAIN the files that phase-level declarations
can ever write to. There is NO runtime or load-time cross-check in this
goal — it is an author-side invariant, named now because slot 9's permission
frame builds on the same declaration.

**The research migration record.** The guarded-phase pattern is now
capability-owned rather than engine-owned: `research` declares its report
path in the phase's `write` bag AND keeps its stopping hook - the
DOUBLE-DUTY declaration (bag = file appearance + write permission frame;
hook = content-convergence stop policy). Exact-equality refinement:
research's expectation gate now fires on EXACTLY the declared file (the
legacy existence-scan over the slot root retired with the slot 9 work).
The first-miss corner flips from silent to LOUD: when a pass ends without
materializing the declared deliverable, the engine re-enters the phase with a
corrective note up to the module-private retry ceiling, at which point the
run ends as a typed CEILING FAILURE (`ok:false`, exit 1) instead of settling
silently - a quality-gate live leg that hits this corner is therefore a
REGRESSION SIGNAL, not normal behavior. Unchanged: SR4, min/max budgets,
resume-session semantics, fingerprinting, and the post-phase local sanity
check (the hook encodes a per-run WRITE-DELTA policy, strictly finer than
the gate's disk-existence check).

### 1.5 What each `IterationCtx` observable means — and the wrong-observable trap

```ts
// pio/src/capability/pio-session.ts
export interface SessionCounters {
  /** Committed successful write/edit end count; equals the master path-list length. */
  readonly filesWritten: number;
  /** Tool executions started under the matched ask-user name. */
  readonly askUserCalls: number;
  /** Per-name count of started tool executions, failures included. */
  readonly toolUses: Record<string, number>;
  /** Sum of observed assistant usages: input + output + cacheRead + cacheWrite. */
  readonly tokens: number;
}
```

- `counters` — a FRESH SESSION-CUMULATIVE snapshot taken after the settling
  run (new object per call). It is reporting/context material: totals across
  the whole session lifetime.
- `filesWritten` — the PER-RUN delta of committed paths; STABLE under repeated
  reads (the window closes only at phase end). THIS is the loop-decision
  observable.
- `vars` — the per-instance `SessionVariableStore`, passed BY REFERENCE
  (`get`/`set`/`list` over a Map). Today nothing writes into it mid-run — see
  §1.7.

The canonical mistake is deciding a per-run question off a cumulative counter.
`counters.filesWritten` tells you how many writes committed over the ENTIRE
session; it cannot tell you whether the just-settled run wrote your artifact.
Cumulative monotonically grows — use the delta for decisions, the counters for
reporting.

### 1.6 Only committed TOOL writes are visible — the tool mandate is functional

Only COMMITTED `write`/`edit` TOOL executions enter the observable. Mechanism
(prose, from `pio/src/capability/pio-session.ts`): the observer records the
start event's `path` argument at tool-execution start for those two tool names
(module-private `FILE_TOOL_NAMES`), correlated by `toolCallId`; a matching
successful end event commits that path — the end carries no args, and failed
ends exclude the path; dangling starts from interrupted executions are drained
at each run start.

Shell-redirect appends (`echo`, `tee`, …) NEVER enter the observable — they are
not `write`/`edit` tool executions. Consequence: the instruction's tool
mandate (§3.3) is FUNCTIONAL, not stylistic — a shell-appending model can
never end the loop through the completion signal. When the cap then binds,
the phase RESOLVES at the bound and the capability settles its annotated
report `ok: true` (the note rides any cap-ended phase — §2.4); there is NO
failing-breach exit left.

### 1.7 Off-limits until the shared-vars spine lands

- Steering the loop by parsing transcripts or message payloads is fragile
  coupling to platform shape. The delivered steering channels are the three
  `IterationCtx` observables (§1.5); the payload list behind
  `PhaseResult.messages` is outcome data, not a decision input.
- Mid-run variable WRITES are not yet part of the protocol:
  `PhaseResult.varsDelta` is EMPTY BY CONSTRUCTION ("no mid-run variable writes
  occur yet" — `pio/src/capability/pio-session.ts`).
- The idle `customTools` slot on `CreatePioSessionOptions`
  (`pio/src/session.ts`) is RESERVED for the future `setVar` family. Name the
  boundary; do not teach a nonexistent API.
- Framework-level output validation is DEFERRED to a follow-up goal —
  `research` is its named consumer, and the file-slot declaration plus the
  `classifySpec` seam hand over intact.

## 2. Budget choices

Material: `pio-session.ts` `execute_phase` + `research.ts` (the tunable
constants + the bound-hit settlement).

### 2.1 `min` floor vs `max` backstop

Delivered defaults, quoted:

```ts
// pio/src/capability/pio-session.ts
const min = opts?.min ?? 1;
const max = opts?.max ?? Infinity;
```

- `min` — the FLOOR: the phase always settles at least N runs, and the floor
  overrides early stop verdicts (§1.2). It documents intent. `research.ts`
  passes `min: 1` explicitly because the floor is what makes the first run
  happen in a no-report-start world (nothing exists on disk, so any
  "artifact written?" test would already answer no — the first run must still
  happen, and the loop structure guarantees it before any hook evaluates).
- `max` — the BACKSTOP: it BOUNDS EXECUTION. At the ceiling with continuation
  still demanded the loop ends THERE and the phase RESOLVES with the bounded
  result (`done: true`, `iterations === <ceiling>`) — no rejection surface.
  Settling non-convergence is a CAPABILITY-LAYER decision (§2.4).

An unbounded phase (`max` omitted ⇒ `Infinity`) is LEGAL but rarely right: a
model that rambles without writing then runs the engagement down with no bound
on cost or wall-clock. The cap, not any stall counter, bounds the worst case.

### 2.2 Picking `max`: the batching-aware heuristic

Expected questions ÷ questions-per-run, rounded UP with margin. Worked
example — `research.ts` passes `max: RESEARCH_MAX_RUNS` (the ceiling constant
quoted in §2.3, set to 10). The instructions batch several questions into a
single run (§3.4), so ten runs covers a long-tail topic while bounding a model
that rambles without writing. If you change the batching guidance in your
template, recompute the ceiling.

### 2.3 Tunable constants at file top (shrink-only)

Knobs are NAMED CONSTANTS at the top of the capability module — quote, don't
paraphrase:

```ts
// pio/src/capabilities/research.ts
/** Run ceiling — the backstop bounding rambling-without-writing loops. */
export const RESEARCH_MAX_RUNS = 10;
/** Fingerprint width: the first N sha256-hex chars of the trimmed topic. */
export const REPORT_FINGERPRINT_LENGTH = 12;
```

Their adjustment posture is shrink-only — bounds tighten, they do not loosen.
`research` exposes NO env var, CLI flag, or other knob surface of its own:
none exist. Adding any knob surface requires a constraint-5 decisions-log
entry (closeout knowledge record) first; the default posture is zero knobs.

### 2.4 Bound behavior: detect → annotate → settle `ok` (the no-silent-skip rule)

No silent skip. Budget exhaustion is not a run failure: the loop breaks at
the cap (§2.1) and the CAPABILITY decides what a cap-ended phase means. The
shipped pattern (`research.ts`):

1. DETECT the cap-ended phase off the RESOLVED `PhaseResult` alone:
   `iterations === <ceiling>` — the stop rule guarantees every below-cap exit
   is a natural convergence, so the cap equality IS the trigger; no closure
   bookkeeping, no engine API addition.
2. ANNOTATE the durable artifact: append the pinned truncation note via a
   filesystem append, so a reader of the PARTIAL FILE ALONE learns the run
   was cut. The append CREATES the degenerate note-only file if the model
   never wrote (coherent beats elaborate).
3. SETTLE `ok` with the frozen slot-relative token — the outcome model is
   unchanged (in-stream statement + machine-ledger token, §8.4). The
   no-silent-skip property rides the truncation note PLUS the
   transcript/ledger records instead of a failing outcome.

WHEN THE NOTE LANDS. Every phase ending AT the cap takes the note — clipped
mid-answer or converging on the final permitted run alike; a cap-reached
loop by construction committed the artifact write on runs 1..cap−1 (a quiet
run would have ended it earlier), so the note always lands on substantial
content. Below the cap the outcomes are byte-identical to the pre-bound
behavior. Non-bound faults propagate untouched, unqualified.

The pinned note bytes (`truncationNote`, module-private in `research.ts`;
`<N>` = the iteration count at the cap exit):

```
## Truncated at run budget

Stopped after <N> runs: the run budget was hit before the topic ran dry. Sections above cover answered questions only.
```

## 3. Instruction phrasing

Material: the per-run template distilled from the shipped
`composeInstructions`/`resumeLine` functions (module-private,
`pio/src/capabilities/research.ts`). The shipped template, quoted with
placeholders substituted for readability (`<topic>`, `<absolutePath>`; the
`<RESUME>` line is filled by the resume variant, §3.2):

```text
You are researching the topic: <topic>

Report file (absolute path): <absolutePath>
<RESUME>

How to work:
1. Keep a running list of open questions about the topic; start broad, then refine and advance them as you learn.
2. Answer questions using the web_search and web_fetch tools; batch several questions into a single run.
3. Each answered question gets its OWN markdown section APPENDED to the report with the write or edit tool: a "## <question>" heading, then the answer with the source URLs cited inline. Append only — never rewrite, reorder, or delete earlier sections.
4. Only updates committed by the write/edit tool count. Appending with shell redirection (echo, tee, ...) is invisible to the completion check and will never end this loop.
5. When no useful open questions remain, finish the run WITHOUT touching the report file — ending a run without a report write is how you signal completion.
Work autonomously; do not ask the user anything during the run.
```

### 3.1 Point the model at disk truth

Name the ABSOLUTE durable-artifact path in the instructions (`Report file
(absolute path): <absolutePath>`). In-bubble paths ARE host-joined absolutes —
they are derived on the host before launch and are addressable inside the
bubble — and the model has no other channel to learn where the artifact lives.

### 3.2 Resume variants (files over memory, no cursor machinery)

Continuity is FILES OVER MEMORY: the existing artifact steers the next run,
and there is no cursor or state machinery. Derive the resume line from a
filesystem check (research: a `stat` presence probe) and inject the conditional
variant. The two shipped variants (pinned bytes, `resumeLine`):

- Existing artifact ⇒

  ```text
  The report already exists. Read it FIRST: every existing section is an answered question — do not duplicate or repeat it; continue from the first question that is still open or unanswered.
  ```

- Absent ⇒

  ```text
  The report does not exist yet. Create it on your first write, starting with the heading "# Research: <topic>".
  ```

Distilled pattern: existing ⇒ read first, treat every existing section as
answered, do not duplicate, continue from the first OPEN unit of work; absent
⇒ create on the first write, starting with the identifying heading. Because
re-runs of the same input land on the same path (§3.7), the pointer stays
valid across SIGTERM-and-restart cycles.

### 3.3 Incremental-append discipline

One section per unit of work; APPEND via the write/edit tool; NEVER rewrite,
reorder, or delete earlier sections. This is what makes a SIGTERM mid-work
leave a coherent partial (everything through the last committed section
survives; the kill-capture partial terminal record pairs with it) and what
makes a plain re-run resume cleanly (§3.2 picks up at the first open unit). It
also pairs with the post-phase sanity of §1.3: a natural stop that produced
nothing becomes a typed contract violation, not a silent success.

### 3.4 Batch, but keep each append self-contained

Batch several units of work into a single run — this is what feeds the §2.2
ceiling heuristic — while keeping each appended section self-contained so a
mid-run death loses at most the in-flight unit (kill-safety).

### 3.5 "Finish naturally" is the stop signal

Ending a run WITHOUT writing the artifact IS the stop signal (§1.3). Instruct
the model explicitly, because the loop's termination depends on it — and pair
it with the tool-committed-only caveat (§1.6) so "invisible" shell appends
cannot spoof completion. The shipped template says both, in one place: item 4
(tell the model shell redirection will never end the loop) immediately
precedes item 5 (ending without a write signals completion).

### 3.6 Work autonomously during the run

The shipped tail: `Work autonomously; do not ask the user anything during the
run.` Capability instructions must not solicit the operator mid-run. Mid-run
prompting is NOT formally adjudicated for this artifact — the goal does not
deliver the final product (owner ruling 2026-09-26, R-V4); operator-typed
input while a run is active is mechanically tolerated through pi's native
pending-input queueing (mechanics in §7.2) — named as a boundary without
support or promise. The question relay remains a frozen boundary (there is
no question relay).

### 3.7 Naming durable artifacts across re-runs (fingerprint idiom)

Deterministic fingerprint: the filename is a PURE FUNCTION of the input
identity. `research` ships

```ts
// pio/src/capabilities/research.ts
export function reportFingerprint(topic: string): string
```

sha256 of the TRIMMED topic, first `REPORT_FINGERPRINT_LENGTH` (12) lowercase
hex characters — trim is the sole normalization (distinct text yields distinct
fingerprints). Same topic ⇒ same file, which is what continuity requires, with
zero discovery machinery.

The filename is IDENTITY, not documentation: the full content-derived string
persists durably INSIDE the artifact (the report's opening heading
`# Research: <topic>`), plus the transcript and the terminal record.

STANDING RULE: a future human-derived global destination (human-readable slug
instead of hash) lands ONE generic helper `slugText(text, { maxLength,
fallback })` in `pio/src/sandbox/layout.ts` (BOTH options required; the hazard
taxonomy stays module-owned) plus caller policy constants. Per-destination
slug functions are the anti-pattern (§5.5): capped slugs keep the collision
liability while losing readability. `layout.ts` today ships
`deriveProjectKey`/`slugify`/`LayoutError` — durability-frozen; cite, don't
extend.

## 4. Web-tools provisioning pattern

Material: `pio/package.json` + `pio/src/sandbox/owned-extensions.ts` +
`pio/src/sandbox/render.ts` + the preflight in
`pio/src/capabilities/research.ts`. This section teaches the SHIPPED pattern:
user-scope LOCAL-SOURCE registration plus read-only identity binds. No copy,
no symlink, no registry, no network at launch.

### 4.1 Owned exact dependency, one roster constant

The web tools ship as an OWNED EXACT dependency beside the exact-pinned SDK:

```json
// pio/package.json
"dependencies": {
  "@earendil-works/pi-coding-agent": "0.85.1",
  "pi-ask-user": "0.15.0",
  "pi-native-search": "0.1.0"
}
```

The version rides the artifact lockfile — pin-policy consistent. The SAME
roster constant drives BOTH provisioning consumers:

```ts
// pio/src/sandbox/owned-extensions.ts
export const OWNED_EXTENSION_PACKAGES: readonly string[] = [
  "pi-native-search",
  "pi-ask-user",
];
```

`ensureOwnedExtensions` (same file) reads it for settings registration, and the
renderer's vendored-bind members default from it
(`RenderInput.vendoredExtensions`, `pio/src/sandbox/render.ts`). It is
deliberately NOT derived from the manifest — the pi SDK itself is a dependency
and must never be registered. Adding a package later = exact-pinned owned dep
line + roster entry + suite rows, each carrying its own constraint-5 approval.
The roster today carries a second, non-web-tools package (`pi-ask-user`) alongside
`pi-native-search`; its availability mechanics §7.3 teaches.

### 4.2 LOCAL-SOURCE registration (not copy, not materialize)

The vendored tree's ABSOLUTE PATH — `<PIO_PACKAGE_ROOT>/node_modules/<name>`
(module-private `sourceDirOf` in `owned-extensions.ts`; the root comes from
`PIO_PACKAGE_ROOT`, `pio/src/constants.ts`) — is UPSERTED verbatim into the
`packages` array of the isolated agent dir's `settings.json`: no `npm:` prefix,
no normalization. Pi's loader then loads each vendored tree IN PLACE through
ordinary disk-backed extension loading — no copy, no symlink, no registry, no
network at launch. The upserted settings file is the BUBBLE SESSIONS' GLOBAL
SETTINGS: `getSettingsPath()` = `join(getAgentDir(), "settings.json")` and
`getAgentDir()` honors `$PI_CODING_AGENT_DIR` at call time, which the renderer
assigns unconditionally (§4.5/§4.8).

### 4.3 Idempotency is a steady-state TOTAL NO-OP

```ts
// pio/src/sandbox/owned-extensions.ts
export async function ensureOwnedExtensions(
  piTree: string,
  seams?: OwnedExtensionSeams,
): Promise<void>
```

Two phases. GUARD-ALL first: one stat per roster package (kind classified via
`FsEntryKind`), ALL guards precede ANY registration, fail-fast. Then
REGISTER-ONE-WRITE: a single read-modify-write on the settings file — missing
file ⇒ minimal shape; everything else (keys, entry order, foreign values)
preserved verbatim; appends EXACTLY the missing entries in roster order,
deduplicated by strict identity; NOTHING missing ⇒ NO write at all. Steady
state therefore performs zero writes (per-package stats + one settings read).

Failure semantics: every trip writes NOTHING before the fault, so a failure is
retryable on the next launch (idempotent self-heal). The settings write is
ATOMIC — unique same-directory temp sibling, parent mkdir -p first, then
rename over the final name. A CORRUPT settings file refuses loud and
BYTE-UNTOUCHED — the pinned refusal line names why (module-private
composition, `owned-extensions.ts`):

```
settings file is malformed JSON — refusing to clobber it: <settingsPath> (repair the file by hand; it is an accumulated configuration future features may extend)
```

It is an accumulated config, not a pure function of pio's inputs. Existence-
only guard (owner ruling): the module never reads ANY manifest or version at
launch — fidelity is the artifact layer's job (exact dependency + committed
lockfile), deliberately NOT re-mechanized per launch.

Placement in the pipeline: `runCapability` (`pio/src/sandbox/run.ts`) runs the
strict gate order — capability admission → input gates → TTY → nesting → bwrap
pre-flight — and invokes `ensureOwnedExtensions` PAST all gates, BEFORE
rendering; a provisioning fault lands in the layout-refusal handler with no
profile, no print, no spawn.

### 4.4 Why symlinks are refused (the shipped anti-symlink story)

Under bwrap, mounts are identity binds of real paths — a link pointing outside
the namespace is invisible inside it. An identity bind of a SYMLINK therefore
dangles in-bubble wherever the link target is unmounted. pnpm-style symlinked
`node_modules` are refused with a DISTINCT actionable line (pinned,
`guardSources` in `owned-extensions.ts`):

```
owned extension source is a symlink: <sourceDir> — symlinked node_modules layouts (pnpm et al.) are unsupported for vendored trees (an identity bind of the link would dangle in the bubble); install with npm using the committed lockfile
```

The anti-symlink concern survives in shipped form as this refusal — distinct
from the ordinary "missing / not a directory" remedy lines.

### 4.5 Measured loader-resolution rules (measurement over citation)

Measured against the exact-pinned 0.85.1 dist under `pio/node_modules/…`
(2026-09-26 — measurement over citation) and recorded in the header notes
block of `pio/src/sandbox/owned-extensions.ts`:

- `parseSource`: any string that is neither `npm:` nor a git URL falls through
  to a local source — RAW ABSOLUTE paths are admitted verbatim (a direct
  settings write bypasses any interactive normalization).
- `install()` local branch: the ENTIRE behavior is an existence check — no
  copy/symlink/materialization.
- `resolveLocalExtensionSource`: an ABSENT resolved path is a SILENT SKIP
  (offline-safe by construction — the loud preflight, §4.7, is the gap
  detector); a DIRECTORY runs resource collection against its `pi.*` manifest.
- Update reconciliation short-circuits local/pinned entries — no drift
  attempts ever against them (the exact pin rides the lockfile).
- `getSettingsPath()` honors `$PI_CODING_AGENT_DIR` AT CALL TIME, and the
  renderer assigns that variable UNCONDITIONALLY to `<stateRoot>/.pi/agent` —
  so the upserted file IS the bubble sessions' global settings.

### 4.6 Mount side: read-only identity binds

The vendored trees ride the rendered profile as READ-ONLY identity binds —
section C of `renderProfile` (`pio/src/sandbox/render.ts`), placed AFTER the
writable `.pi` overlay (pio-state trio order: state root ro → own project slot
rw → isolated `.pi` config dir rw → vendored trees ro). Bind ORDERING IS
SECURITY: cwd is bound rw LAST (later binds overlay earlier ones — the
blast-radius lever). Effect: in-bubble extensions are readable but not
writable. That containment backstop holds while the LOGICAL write gate is
deferred to the later guards step. A missing vendored path is a NORMATIVE
refusal (`SandboxRenderError`), not a silent skip — the production flow is
existence-guarded right before render.

### 4.7 The loud preflight (consumption side)

Provisioning can silently miss; consumption detects it LOUDLY before any run
burns. Shipped pattern (`research.ts`): before ANY prompt fires, the
capability reads BOTH tool definitions off the constructed session — the
in-bubble reach path is `this.s.runtime.session.getToolDefinition(...)`
applied to `"web_search"` and then `"web_fetch"` (`this.s` is the base's
placement handle).

(`getToolDefinition(name): ToolDefinition | undefined` is registry-backed at
the pinned dist; a missing session yields both-missing by construction.) On a
miss: ONE capability-owned stderr line NAMING THE MISSING PROVISIONING
(pinned, `preflightStderrLine`, module-private in `research.ts`):

```
pio research: web tools unavailable (missing: <names>) — expected from the isolated agent dir's pi-native-search provisioning
```

followed by a TYPED throw (`WebToolsMissingError`) ⇒ base catch-all ⇒
`ok: false`, exit 1, ZERO prompts fired. Teach yourself the total-absence
signature: session construction SUCCEEDS and BOTH lookups come back
`undefined`. A provisioning gap is NOT a construction failure — there is no
loud failure to piggyback on, which is exactly why the preflight exists.

### 4.8 State-root inversion in-bubble (anchored note)

The profile's ENTIRE env section is EXACTLY HOME / PATH / `PI_SANDBOX` /
`PI_CODING_AGENT_DIR` — the four `--setenv` pairs built by the renderer's
module-private `buildEnv` (`pio/src/sandbox/render.ts`). Pio emits no other
env assignment: `PIO_STATE_DIR` is NOT propagated into the bubble.
Consequences for in-bubble derivation (`research.ts`):

- In-bubble, `PI_CODING_AGENT_DIR` is the ONLY state-root channel. Derive the
  state root with the shipped pure helper:

  ```ts
  // pio/src/capability/base.ts
  export function deriveStateRootFromAgentDir(
    agentDir: string | undefined,
  ): string
  ```

  It inverts the renderer's UNCONDITIONAL `PI_CODING_AGENT_DIR =
  <stateRoot>/.pi/agent` assignment (exactly the two levels the renderer
  appends) and fails LOUD and typed on an unset/malformed value —
  `CapabilityEnvError` (messages prefixed `capability:`), NO silent fallback,
  ever. The pair rides with the authoring base rather than a sandbox leaf —
  a capability-layer concern per the placement ruling documented in the
  `base.ts` header — and `research.ts` imports and re-exports it from there.
- NEVER derive via `resolveStateRoot` (`pio/src/sandbox/layout.ts`) in-bubble:
  its `PIO_STATE_DIR`/HOME fallback is a HOST-SIDE expression that would
  silently target the host's `~/.pio`.
- Project key = `deriveProjectKey(process.cwd())` (`pio/src/sandbox/layout.ts`)
  because the in-bubble cwd IS the host launch cwd (the renderer chdir'd
  there) — matching the host-side derivation.

## 5. Anti-patterns

Each item names its positive exemplar from shipped code.

### 5.1 Swallowing typed errors (catch-and-degrade)

Degrading a typed failure to a soft success loses the cause classification
and the operator signal. Exemplar: the `research.ts` loud web-tools preflight
(§4.7) — refuse with the capability-owned stderr line, then THROW THE TYPED
`WebToolsMissingError` — keeps the typed identity in the terminal record
(`{ type: "WebToolsMissingError", message }`; the env-defect pair likewise
rides `CapabilityEnvError`'s typed capture alone — the §5.2 pairing rule).
If you catch a typed error, your last act must be throwing it back out
(possibly annotated) — the base catch-all + `captureError` own the
serialization.

### 5.2 Silent degradation on missing tools

Absence without a human-facing name. Inside the namespace, failures otherwise
surface only through `status.json` + the exit code. Capability-owned process-
stream stderr lines are the DELIBERATE mechanism for naming — cite the
preflight line of §4.7: a human operator is expected to fix provisioning, so
the line NAMES what is missing and where it comes from. Pairing rule: env
defects may surface via the TYPED CAPTURE ALONE (no redundant line) when the
typed capture IS the surfacing channel — `research` throws
`CapabilityEnvError` before anything else and the captured record carries the
message — but tool absence OWES a line because the remedy is a provisioning
fix, not a re-read of the record.

### 5.3 Adding CLI forms, env vars, or flags without a decisions-log entry

Shrink-only. `research` exposes NO knob — the tunables are named constants at
file top (§2.3), and adding a CLI form, env var, or flag requires a
constraint-5 decisions-log entry first. The exemplar IS the absence: one
capability, zero surfaces.

### 5.4 Crossing the capability IO-discipline boundary

Where a capability MAY own lines versus where the entry/emitter owns them:

- CAPABILITY-owned: pre-run REFUSAL stderr lines fired before any prompt (the
  narrow surviving exception to the sole-writer rule — the web-tools preflight
  line of §4.7 is today's sole survivor; static-idle-frame timing per §7.1) +
  the RETURNED VALUES OBJECT'S serialization form. Under the
  terminal-ownership doctrine (§7.1) capability CODE performs NO raw
  process-stream writes while the live terminal renders (the constructor bag
  is FROZEN by the `CapabilityConstructor` type — `pio/src/capability/loader.ts`
  — so no io seam can be added; suites spy the streams). `research` exemplifies
  the outcome model: it RETURNS the slot-relative report token
  (`{ report: "research/<fingerprint>.md" }`); the base's settle seam then
  transforms FILE-MODE output slots ONCE at success settlement to this
  bubble's ABSOLUTE placement (`settleFileModeOutputs`,
  `pio/src/capability/base.ts`; result channels per §8) while VALUE slots pass
  through untransformed — alongside the in-stream statement the live terminal
  presents: naming rides the agent's own words plus the settled ledger values.
  Deterministic delivery receipts beyond the in-stream
  statement are the future default capability's territory — named once as a
  boundary; nothing built, wired, or promised. The `StatusEmitter` publishes
  `outputs` byte-unmodified — expect NO `pio/src/capability/status.ts` edits
  for naming.
- ENTRY/EMITTER-owned: dispatch + refusal lines (host gates in
  `pio/src/sandbox/run.ts`, loader refusals in `pio/src/capability/loader.ts`),
  the terminal record EXACTLY ONCE (placement/serialization/kill-capture in
  `pio/src/capability/status.ts`: `createStatusEmitter` / `serializeStatus` /
  `captureError` / `exitCodeFor`), and the exit-code map (success 0, failure 1).

Never route CODE-emitted lines through the session or the transcript — that
couples the capability to `status.ts` internals it does not own. The in-stream
statement is different: it is the model's own narration presented by the live
terminal, not a capability-code channel into session or status internals.

### 5.5 Per-destination slug functions

The standing rule in one line: one generic `slugText(text, { maxLength,
fallback })` in `pio/src/sandbox/layout.ts` (both options required) + caller
policy constants — never a new per-destination slug function (§3.7).

### 5.6 Placing a built-in anywhere but `capabilities/`

Built-in capability modules live at `pio/src/capabilities/<name>.ts` — the
dedicated subpackage (owner directive): singular `capability/` = framework,
plural `capabilities/` = implementations, and the registry thunks uniformly as
`../capabilities/<name>.ts` (`pio/src/capability/loader.ts`). The retired
probe precedent (a root-level module directly under `src/`) is NOT the pattern
to copy — it is gone for a reason.

### 5.7 Writing to the process streams while the live terminal actively renders

Garbles frames — nondeterministic and un-pin-able. Exemplar: the
`pio/src/run-session.ts` header doctrine (the live terminal is the SOLE writer
to the process streams while actively rendering, §7.1) and the entry's
zero-stdout-on-every-row surface (suite-spied). Contrast the sanctioned
exception — pre-run REFUSAL stderr lines fire on the terminal's static initial
frame BEFORE any prompt (§4.7; timing and nuance per §7.1) — never a license
to print during a run.

### 5.8 Making termination depend on operator action

Completion must hold with NO human present. Exemplar: the write-delta stopping
rule + the `max` budget backstop — `shouldStopLoop` decides off the
`IterationCtx` observable alone and the cap ends the loop at the ceiling
regardless; neither
consults the operator (§1.3/§2.1; the hard guardrail per §7.2).

### 5.9 Constructing a second terminal or a competing process-stream writer

One engagement / one process / one terminal. Exemplar: the entry's SINGLE
mount of `InteractiveMode` over the engagement's `session.runtime` BY
REFERENCE at one explicit pipeline step — idempotence by construction (one
linear flow, one process, one mount; `pio/src/run-session.ts`).

### 5.10 Capturing a session object in presentation/entry code

Violates the end-state binding discipline: the presentation follows the
RUNTIME, never a session — a captured session pins the end-state and closes
the door the later composition goal walks through (§7.1). Exemplar: the
`pio/src/run-session.ts` mount and teardown regions reference the runtime
only — `new InteractiveMode(session.runtime)` at the mount, the runtime's
`dispose()` at teardown.

### 5.11 Reading process-stream state to infer session progress

Disk truth + delivered observables ONLY, restated against the new surface:
the live terminal DISPLAYS the session stream — it is not a data channel.
Read the `IterationCtx` observables and the committed-write record; never
parse rendered frames to drive loop decisions (§1.5/§3.1 standing doctrine).

## 6. Registering a new built-in (checklist)

Every element below is shipped machinery, anchored to the `research` landing:

1. **Module** — `pio/src/capabilities/<name>.ts`: a DEFAULT-EXPORT class
   extending `PioCapability` (`pio/src/capability/base.ts`) with the
   `contract` literal assigned and `call()` implemented. Quote the shipped
   shape (`research.ts`):

   ```ts
   readonly contract: Contract = {
     name: "research",
     version: "0.1.0",
     inputs: [{ name: "topic" }],
     outputs: [{ name: "report", paramKey: "report" }],
     writes: ["research/*.md"],
     allowProjectWrites: true,
   };
   ```

   Returning from `call()` IS completion — the base's sole-seam `run()`
   (never overridden) validates the caller's value object against the contract
   before the body runs and assembles the observed outcome.
2. **Registry entry** — add the lazy factory to `CAPABILITY_TABLE`
   (`pio/src/capability/loader.ts`): a zero-arg thunk issuing a literal
   dynamic import, uniform form
   `{ <name>: () => import("../capabilities/<name>.ts") }`. Nothing registered
   evaluates until its exact name resolves. Resolution enforces integrity: the
   loaded default export must descend STRICTLY from the bundled base by
   reference, and the class's own declared contract passes the load-time
   `checkContract` (`pio/src/capability/contract.ts`) — every miss RESOLVES as
   a single-owned refusal line, never a rejection.
3. **Help-section maintenance** — list the capability in the Built-in
   capabilities block of `HELP_LINES` (`pio/src/cli.ts`): one description line
   plus the canonical invocation line (`pio run <name> --input k=v` form).
4. **Colocated hermetic suite** — `pio/src/capabilities/<name>.test.ts` per the
   fixture-harness doctrine established in
   `pio/src/capability/base.test.ts` and extended by
   `pio/src/capabilities/research.test.ts`: the vi.mock factory fakes EXACTLY
   the five SDK value symbols reachable through the construction seam
   (`getAgentDir`, `SessionManager`, `createAgentSessionServices`,
   `createAgentSessionFromServices`, `createAgentSessionRuntime` —
   `pio/src/session.ts`), so the real SDK graph is never evaluated; scripted
   prompt resolutions emit SYNTHETIC EVENTS ONLY and observe — they write
   nothing to disk (rows needing real file content seed the fixture tree
   themselves); stream spies pin the capability-owned lines; expectations
   derive fingerprints/keys through the imported public helpers instead of
   hardcoding digests.

## 7. Execution presence and the runtime contract

Material: `pio/src/run-session.ts` (module header + mount/teardown regions) ·
`pio/src/sandbox/launcher.ts` + `pio/src/sandbox/run.ts` ·
`pio/src/capability/base.ts` · `pio/src/capability/pio-session.ts` ·
`pio/src/capability/status.ts` · `pio/src/sandbox/owned-extensions.ts` ·
`pio/package.json` · the vendored `pio/node_modules/pi-ask-user/` tree.

Every admitted capability run executes with its live terminal UP — the SDK's
`InteractiveMode` class (re-exported from the pinned package root;
`pio/node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts` exports it
from `"./modes/index.ts"`) bound to the engagement's session RUNTIME by
reference. This section covers the runtime contract that entails — the
terminal-ownership rules (§7.1), operator interjection semantics (§7.2), the
provisioned structured-feedback tool (`ask_user`, §7.3) — and binds ALL future
built-ins: they inherit the contract WITHOUT further plumbing and respect what
this section teaches.

### 7.1 Execution presence and terminal ownership

Material: `pio/src/run-session.ts` (module header doctrine + mount/teardown
regions) · `pio/src/sandbox/launcher.ts` + `pio/src/sandbox/run.ts` (gate order
+ host refusal literal) · `pio/src/capabilities/research.ts` (header
outcome-model block) · `pio/src/capability/base.ts`.

**Presence.** Every admitted capability run executes with its live terminal
UP — the SDK's `InteractiveMode` bound to the engagement's session RUNTIME by
reference, mounted as the process-lifetime terminal at one explicit pipeline
step. The entry's module header states the full presence contract verbatim
(`pio/src/run-session.ts`):

```
// pio/src/run-session.ts (module header)
Every admitted run executes with its live terminal up: ONE terminal per
engagement, constructed exactly once at the explicit mount step (after
kill-capture arming, before the run) over the engagement's RUNTIME —
never a session object — and torn down (best-effort stop, then runtime
dispose; every secondary fault swallowed) on EVERY exit path, natural
completion AND escaping rejection, BEFORE any terminal-record emission or
degrade-line write.
```

Lineage (of record): this is the same construction the retired probe
diagnostic target proved end-to-end inside a sandbox earlier in this goal's
life — the probe was excised once real capabilities landed and no probe
symbol survives in the citation universe; the terminal is now the
presentation layer for EVERY capability run, not a diagnostic vehicle.

Shipped mechanics, each anchored to the entry:

- **Constructed EXACTLY ONCE at the explicit mount step** — after
  kill-capture arming, before the run, over the engagement's runtime BY
  REFERENCE (idempotence by construction — "one linear flow, one process,
  one mount"):

  ```ts
  // pio/src/run-session.ts (mount step)
  const { InteractiveMode } = await import("@earendil-works/pi-coding-agent");
  terminal = new InteractiveMode(session.runtime);
  void terminal.run().catch(() => {
    // Secondary fault — swallowed (never log — terminal ownership).
  });
  ```

  One engagement / one process / one runtime / one terminal. That dynamic
  import is the entry's ONE SDK specifier occurrence (source-guard pinned in
  the suite); the cheap paths — parse errors, the loader miss, the TTY
  refusal — never evaluate the SDK graph, which evaluates exactly once on the
  proceeding path.
- **Render loop started un-awaited**, with a swallowing rejection handler —
  secondary-fault discipline: a terminal-loop fault must never mask the
  PRIMARY capability fault and is never logged (terminal ownership).
- **Arm-before-mount ordering** — `emitter.armKillCapture()` precedes the
  mount ("Arm BEFORE the mount: kill-capture precedes the terminal's own
  signal"); the prepend-ordering interplay with the terminal's handlers is a
  quality-gate measurement point, not a redesign.
- **Teardown** — the probe-native best-effort `[stop → runtime.dispose]`
  pair on EVERY exit path (natural completion AND escaping rejection),
  completing BEFORE any out-of-window write ("Guaranteed on every exit path
  and completing BEFORE any out-of-window write") — cooked mode restored
  before the terminal record or the degrade line touches the process streams;
  every secondary fault is swallowed so the primary always survives. The
  SIGTERM kill path releases via OS death rather than this pair — the
  kill-capture handler settles the record and force-exits
  (`handleSigterm`, `pio/src/capability/status.ts`); cooked-mode recovery
  there is a quality-gate measurement point, not asserted here.

**End-state binding — effect only.** Mount and teardown reference the
RUNTIME, never a session object — so the presentation follows whatever
session the runtime currently holds natively, and surfacing other sessions
rides the runtime's own session machinery with zero presentation changes.
That territory HAS SHIPPED under the terminal-takeover composition: the
pinned dist exposes `switchSession` publicly (measured), and the row-2 hop
rides it with the single live terminal following every swap
(`pio/src/capability/terminal-takeover.ts`; §8). The end-state-binding
doctrine — presentation follows the RUNTIME, never a session — is UNCHANGED
and is exactly what makes the swap presentation-free.

**TTY-required execution surface.** User-run top-level capability invocations
REQUIRE an attached TTY. Two enforced sites, both pre-construction fast-fails
— refusal = one physical line + exit 1 + ZERO construction (no session, no
emitter, no terminal; the SDK graph unevaluated on those paths):

(a) The host pipeline's strict-gate-order gate. `runCapability`
(`pio/src/sandbox/run.ts`) runs capability admission → input gates → TTY →
nesting → bwrap pre-flight and consumes the host-neutral literal at the TTY
position — AFTER loader admission, BEFORE nesting/bwrap/side effects:

```ts
// pio/src/sandbox/launcher.ts
export const TTY_REFUSAL_LINE =
  "pio: running a capability needs an interactive terminal (TTY); piped invocations are refused";
```

where `isInteractiveTty(input, output)` (`pio/src/sandbox/launcher.ts`) is
true iff BOTH streams are TTYs.

(b) The standalone entry's IN-NAMESPACE fast-fail. The standalone
`pio-run-session` entry bypasses the host gates entirely, so the analogous
depth lives there: a module-private counterpart line with its own product
prefix, consumed behind a leaf-pure (SDK-free) launcher thunk — piped
invocations refuse pre-construction: no session, no emitter, no terminal, the
SDK graph unevaluated. Two owners, two byte forms — the house
replicated-literal doctrine, documented in the `run-session.ts` comment
("the host gate's neutral launcher literal (two owners, two byte forms)"):

```ts
// pio/src/run-session.ts
const TTY_REFUSAL_LINE =
  "pio-run-session: running a capability needs an interactive terminal (TTY); piped invocations are refused";
```

**Terminal-ownership contract.** The heart of the section — the shipped
doctrine, key sentences verbatim from the `run-session.ts` header:

```
// pio/src/run-session.ts (module header)
Terminal-ownership doctrine: while the terminal is actively rendering it
is the SOLE writer to the process streams. Human-facing entry lines land
OUTSIDE its active window — pre-run refusals print on the terminal's
STATIC initial frame (default rendering is event-dirty with no idle
repaint timer, so the frame stays static until stop) or before the
terminal exists at all (the loader miss prints pre-launch), and post-run
lines (the degrade line) print only after teardown restored cooked mode.
```

Author's formulation of the contract: capability CODE performs NO raw
process-stream writes while the live terminal renders. The SHIPPED NARROW
EXCEPTION is named precisely: pre-run REFUSAL stderr lines remain
capability-owned — the web-tools preflight line of §4.7 is today's sole
survivor — firing on the terminal's STATIC initial frame BEFORE any prompt,
with their bytes, check order, and typed captures untouched. The
static-idle-frame safety is MEASURED (event-dirty default rendering, no idle
repaint timer); whether a refusal renders cleanly on that frame is live-
confirmed by the quality gate's presence legs — stated, not asserted. Teach
the exception WITH the nuance: settled doctrine for pre-run refusals, never a
general license to print during a run.

Success naming under the outcome model (cross-ref the corrected §5.4): the
capability states its deliverable in the SESSION STREAM — the agent's own
words, exactly what the live terminal presents — and the machine ledger
carries WHAT THE BASE SETTLED: `serializeStatus` publishes `outputs`
byte-unmodified (`pio/src/capability/status.ts`) — the settled absolute
placement for FILE-MODE slots (the `settleFileModeOutputs` transform,
`pio/src/capability/base.ts`), verbatim passthrough for VALUE slots; result
channels per §8. Shipped header block, verbatim
(`pio/src/capabilities/research.ts`):

```
// pio/src/capabilities/research.ts (module header)
Outcome model: the capability states its deliverable
through the SESSION STREAM — what the live terminal presents — and the
machine ledger (the terminal record's `outputs`) carries the frozen
project-slot-relative token. Capability code performs NO raw terminal
writes: preflight/env REFUSAL stderr lines remain capability-owned and
byte-stable (their bytes, check order, and typed captures are untouched).
```

and the entry side, also verbatim (`pio/src/run-session.ts` module header):

```
// pio/src/run-session.ts (module header)
The entry composes NO product-outcome bytes on ANY path — zero stdout
writes on every row (suite-spied); the capability states its deliverable
in the session stream (which is what the terminal presents) and the
machine ledger carries the frozen project-slot-relative token.
```

Failure surfacing is mechanically unchanged: the actionable text rides the
TYPED ERROR'S MESSAGE into the terminal record (`captureError` typing,
`pio/src/capability/status.ts`) + the post-teardown degrade line — the
pairing rule per §5.2 stands.

**Anti-assert list (quality-gate boundary).** DO NOT assert any of the
following — all four are measurement points landing in the next quality
gate, not claims of this document: the idle-frame visual confirmation; TUI
startup side effects (changelog/version checks, telemetry attempts over the
shared net); SIGTERM-handler interplay and cooked-mode recovery on the kill
path; native-quit status-record consequences.

### 7.2 Operator interjection semantics

Material: `pio/src/capability/pio-session.ts` (module-header settlement
sentence + the `execute_phase` prompt site) · `pio/src/run-session.ts` · the
shipped research template tail (`pio/src/capabilities/research.ts`).

**Mechanics.** Messages the operator types while a phase run is active queue
in the session (pi's native pending-input machinery) and settle through the
session's turns. Because one awaited prompt settles a whole logical run —
the settlement sentence §1.1 teaches from the `pio-session.ts` module header:
queued messages resolve INSIDE the settling run — operator input lands either
inside the settling run or, between runs, as plain in-session turns BETWEEN
the phase loop's own iterations — OUTSIDE `execute_phase` bookkeeping (the
marker/instructions wrap only the capability's own runs), bounded by the
phase `max` backstop REGARDLESS (§2.1). The actor driving phase turns stays
the prompt call at the `execute_phase` loop site — "execute_phase's prompts
are the turn actors":

```ts
// pio/src/capability/pio-session.ts (execute_phase loop site)
await this.runtime.session.prompt(text);
```

Operator messages enter the SAME prompt channel — they do not become steering
inputs; the delivered steering channels remain the three `IterationCtx`
observables (§1.7).

**HARD GUARDRAIL.** A capability's completion MUST hold with NO human
present — the write-delta stop and budget backstops never depend on an
operator response (§1.3/§2.1/§3.5). A run with an operator watching and a
solo run reach identical completion determinations.

**Boundary status (R-V4).** Mid-run prompting is NOT formally adjudicated for
this artifact — the goal does not deliver the final product (owner ruling
2026-09-26, R-V4). Typing while a run is active is mechanically tolerated
(native input queueing); this document names the boundary without supporting
or promising it. Cross-ref the corrected §3.6.

**Anti-assert.** DO NOT assert worst-case interleaving or attribution
specifics (for example, how operator turns interact with the per-run
`filesWritten` delta windows) — that is a quality-gate measurement point;
the ONLY sanctioned claim is the `max` bound.

### 7.3 Structured feedback: the provisioned `ask_user` tool

Material: `pio/src/sandbox/owned-extensions.ts` (roster) · `pio/package.json`
· the vendored `pio/node_modules/pi-ask-user/` package (`package.json`,
`README.md`, `index.ts`) · `pio/src/capabilities/research.ts`
(instructions).

**Availability mechanics.** The tool reaches every sandboxed session through
the EXISTING owned-extension roster mechanism — the roster quoted in §4.1 now
carries the second entry (`pi-ask-user` appends after `pi-native-search`); the
SAME constant still drives both the settings registration and the renderer's
ro identity-bind members, and the steady-state total-no-op semantics extend
to the second entry automatically. The manifest registers the extension
entrypoint (`pio/node_modules/pi-ask-user/package.json`):

```json
// pio/node_modules/pi-ask-user/package.json
"pi": {
  "extensions": [
    "./index.ts"
  ],
  "skills": [
    "./skills"
  ]
}
```

The registered tool name is `ask_user` (Tool-name section,
`pio/node_modules/pi-ask-user/README.md`):

```text
// pio/node_modules/pi-ask-user/README.md
The registered tool name is:

- `ask_user`
```

**Rendering.** Package-DECLARED behavior, attributed to the vendored package
— NOT observed live behavior; the first live exercise of the overlay
in-bubble is a quality-gate leg. Under the live TUI the package declares a
rich interactive UI — searchable option selection, multi-select, freeform
responses, configurable display modes `overlay` (modal, default) vs `inline`
(Features list, `pio/node_modules/pi-ask-user/README.md`):

```text
// pio/node_modules/pi-ask-user/README.md
- Searchable single-select option lists with wrapped titles and descriptions
- Responsive split-pane details preview on wide terminals, with a persistent single-column preference
- Multi-select option lists
- Optional freeform responses
```

```text
// pio/node_modules/pi-ask-user/README.md
- Configurable display mode: `overlay` (modal, default) or `inline` (rendered directly in the flow)
```

plus custom TUI rendering of tool calls and results (same README):

```text
// pio/node_modules/pi-ask-user/README.md
- Custom TUI rendering for tool calls and results
```

**Headless/RPC fallback.** ONE line, cited — the package degrades gracefully
when interactive UI is unavailable: in RPC/headless mode it falls back to
dialog methods (select/input) instead of the rich overlay
(`pio/node_modules/pi-ask-user/index.ts`):

```ts
// pio/node_modules/pi-ask-user/index.ts
RPC/headless fallback: use dialog methods (select/input) instead of the rich TUI overlay.
ctx.ui.custom() returns undefined in RPC mode, so we degrade gracefully.
```

**Availability ≠ instruction.** Provisioning makes the tool AVAILABLE; a
capability OPTS INTO asking via its authored instructions — nothing is
solicited by default. No capability consumes it today: `research` ships the
autonomous tail (§3.6) and its instructions changed NOTHING — availability
delivered without usage, so the ticket's frozen non-goals stay intact apart
from R-V4's record.

**Bundled-skill fact (boundary — named, not taught).** The manifest resource
collection also ships a bundled skill directory (`pi.skills: ["./skills"]` —
`pio/node_modules/pi-ask-user/skills/ask-user/SKILL.md` in the vendored tree);
whether it surfaces as a discoverable skill in bubble sessions is a benign
availability side-channel the quality gate observes live — this document does
not teach it.

## 8. Composed execution: the row-2 terminal-takeover frame

Material: `pio/src/capability/base.ts` (header placement clause, the `run()`
dispatch, the settle seam) · `pio/src/capability/terminal-takeover.ts`
(frame environment, hop primitive, ordered shutdown pass) ·
`pio/src/capability/pio-session.ts` (`fromRuntime` / `rebind`) ·
`pio/src/capability/status.ts` (per-frame terminal records) ·
`pio/src/run-session.ts` (entry mount + frame-environment install) ·
`pio/src/capabilities/compose-new-session-demo.ts` (shipped exercise vehicle
— TEMPORARY, §10) · the installed dist `@earendil-works/pi-coding-agent`
0.85.1 (`dist/core/agent-session-runtime.d.ts`,
`dist/core/agent-session-runtime.js`, `dist/modes/interactive/interactive-mode.js`,
`dist/core/session-manager.js`).

Placement taxonomy of record: **row 1** — shared-conversation composition
(SHIPPED — §11); **row 2** — the
terminal-takeover frame (this section); **row 3** — headless process spawning
(slot 8, DECLARED-BUT-UNBOUND — boundary only, §9). Row 2 is this goal's
landing: a capability invoked WITHOUT a session takes over the operator's
live terminal under a fresh session hosted on the caller's runtime.

### 8.1 Placement: a separate-context frame inside the caller's process

A capability invoked without a session runs a SEPARATE-context, sequential
(caller awaits), single-process FRAME — the terminal-takeover frame — INSIDE
THE CALLER'S PROCESS. No spawn, no second terminal, no second process: one
engagement / one process / one terminal (§5.9 stands), and zero orphans by
construction. The binding clause, verbatim (`pio/src/capability/base.ts`
module header):

```
// pio/src/capability/base.ts (module header)
Session placement binds at construction: a provided session runs in
process; an ABSENT session hops the row-2 terminal-takeover frame under
a fresh child host (lazy import, evaluated on that path only; the await
payload is the primary channel, the per-frame record the secondary).
```

The dispatch seam — `validateInputs` stays placement-AGNOSTIC at its current
position (a violation settles the capture BEFORE any hop side effect — zero
switches, mints, or scope dirs), then session-absent hops through the lazy
literal thunk; session-present executions never evaluate the takeover module
(eval-flag pin, suite-proven):

```ts
// pio/src/capability/base.ts (run() placement branch)
      validateInputs(this.contract, values);
      if (this.s === undefined) {
        // Row-2 frame: the body closure adopts the child host into the
        // slot (the takeover module never assigns the slot itself).
        const takeover = await import("./terminal-takeover.ts");
        return await takeover.materializeFrame({
          capability: {
            name: this.contract.name,
            version: this.contract.version,
          },
          body: async (
            childFrame: PioSession,
          ): Promise<Record<string, unknown>> => {
            // Unstamped on purpose: the child's own status record names it.
            this.s = childFrame;
            // The capability-source window over the ADOPTED host: opened
            // strictly post-adoption, before the body can issue any phase
            // prompt; closed at settlement on success AND the catch-all
            // (no-op-safe over stateless instances; a platform-minted
            // handle carries no execution state).
            childFrame.enterCapability({
              name: this.contract.name,
              writes: this.contract.writes,
              allowProjectWrites: Boolean(this.contract.allowProjectWrites),
            });
            try {
              return settle(await this.call(values));
            } finally {
              childFrame.exitCapability();
            }
          },
        });
      }
```

The entire hop sits inside the base catch-all — machinery faults settle as
the shipped `{ ok: false, errors: [capture] }` shape, and `run` NEVER
rejects on either placement:

```ts
// pio/src/capability/base.ts (run() JSDoc)
  /**
   * The sole composition seam — never overridden. Validates inputs before
   * the placement branch (a violation settles the capture with zero hop
   * side effects), then hops the row-2 frame (session absent) or runs the
   * body in place (session present). The session-present branch stamps its
   * span header once at span start (post-validation/pre-body); the row-2
   * hop body carries none (the child's own record covers identity). Success
   * settles ONCE at this seam: file-mode output slots transform to the
   * bubble's absolute placement —
   * in-place directly, and on the hop path inside the body so the single
   * payload serves the child record and the caller's await identically.
   * A conversion fault escapes into THIS capability's catch-all after the
   * terminal ownership is restored on every reachable path. The catch-all
   * spans both placements: this method never rejects.
   */
```

`materializeFrame` is a SYNCHRONOUS dispatcher on purpose (D-sync doctrine):
the holder guard throws out of the function synchronously when the frame
environment is uninstalled (the base catch-all captures it), the latch is
minted BEFORE any mutation, a detached continuation owns the remaining
stages, and the caller receives the latch value immediately:

```ts
// pio/src/capability/terminal-takeover.ts (materializeFrame JSDoc)
/**
 * THE row-2 composition entry. Synchronous on purpose: the holder guard
 * throws OUT of this function when uninstalled (base-level catch-all
 * captures it), the latch is minted before any mutation, a detached
 * continuation owns the remaining stages, and the caller receives the
 * latch value immediately. Settlement uses `resolve` exclusively — the
 * `reject` channel is reserved for the ordered shutdown pass.
 */
```

### 8.2 Actor split: the caller merely invokes

- **The caller MERELY invokes** — construct the callee WITHOUT a session param
  and `await` its `run(inputs)` (`new B({})` + `await b.run(values)`). It
  never touches hop machinery: no ledger, no switch, no re-arm.
- **The frame is MATERIALIZED BY THE CALLEE'S BASE-PROVIDED `run()`** — the
  never-overridden composition seam (§8.1) — the analogue of a function
  prologue/epilogue written by neither author. Both sides see ordinary
  promise semantics; the takeover is an implementation detail of the
  callee's base.
- **The callee's fresh session is hosted under the CALLER-SIDE runtime host**
  via the runtime's NATIVE session machinery — `switchSession` onto a
  freshly-minted platform-named transcript (§8.5) — NOT a second constructed
  runtime.
- **The session always flows INTO the capability instance.** Shipped
  precedent: the entry constructs the top frame's `PioSession` and injects it
  at construction (`pio/src/run-session.ts`):

  ```ts
  // pio/src/run-session.ts (pipeline)
  const instance = new resolution.capability.ctor({ session });
  ```

  Same flow, relocated frame site: composed frames are constructed bare
  (`{}`) and their base materializes the frame instead.

### 8.3 The shipped example: `compose-new-session-demo.ts`

The shipped demonstration (TEMPORARY — §10) composes `research` as a
co-shipping sibling. The invocation idiom, VERBATIM:

```ts
// pio/src/capabilities/compose-new-session-demo.ts (import clauses)
import ResearchCapability from "./research.ts";
```

```ts
// pio/src/capabilities/compose-new-session-demo.ts (call(), stage 2)
    const child = new ResearchCapability({});
    const outcome = await child.run({ topic: DEMO_TOPIC });
```

Direct static DEFAULT sibling import + session-absent construction + awaited
`run({ topic })`. Co-shipping builtins compose over each other's shipped
modules DIRECTLY — the loader's dispatch machinery stays RESERVED for
startup/top-level resolution (stage-2 comment, quoted verbatim):

```
// pio/src/capabilities/compose-new-session-demo.ts (stage-2 comment)
2. Composition — co-shipping builtins compose over EACH OTHER'S shipped
modules directly (the loader's dispatch machinery is reserved for
startup/top-session resolution). Constructed WITHOUT a session param,
so the child's OWN base dispatch hops the terminal-takeover frame
while it runs and hands the terminal back on return — this module
never touches hop machinery.
```

The demo's THREE-PHASE shape is the canonical illustration of "the caller
frame owns the terminal around the hop": greeting on the caller's OWN session
BEFORE the hop → the composition (the child takes and returns the terminal)
→ post-return summary ON THE PARENT FRAME (reading the settled report value
and stating the findings through the session stream).

### 8.4 Result channels: live await payload primary, per-frame record secondary

PRIMARY channel = the LIVE `CapabilityResult` returned at the caller's
`await` — in-process, the caller genuinely RECEIVES the typed payload (settled
outputs on success; captured errors on failure). SECONDARY/durable channel =
the callee's PER-FRAME terminal record, written UNCONDITIONALLY before the
frame releases — one authoritative write per session scope, canonical bytes
(`pio/src/capability/status.ts`):

```ts
// pio/src/capability/status.ts (emit contract)
  /** One authoritative write per emitter; losers await the winner's result. */
  emit(result: CapabilityResult): Promise<StatusEmissionResult>;
```

(one emitter per frame scope — the hop builds the child's own emitter rooted
at the child scope dir, stamped from the callee's identity; the entry owns
the outermost scope's emitter.)

Settle-seam consequence (taught once, binds both placements): FILE-MODE
output slots transform ONCE at the base's success settlement to this
bubble's ABSOLUTE placement — `settleFileModeOutputs`
(`pio/src/capability/base.ts`):

```ts
// pio/src/capability/base.ts (settleFileModeOutputs JSDoc)
/**
 * Settle FILE-MODE contract output slots to this bubble's ABSOLUTE
 * placement — the single site where "where do my file deliverables live"
 * is answered. Pure over explicit arguments: the `placementProvider`
 * defers the derivation to the CALLER's seam and is invoked LAZILY (memoized
 * per call) only when a file-mode slot actually carries a relative string.
 * Value-mode slots, non-string or missing values, and already-absolute
 * values pass through untouched; the static-file form reports the
 * contract-declared location under the slot name. When nothing transforms,
 * the INPUT record survives by reference.
 */
```

ONE settled payload serves the child record AND the caller's await
IDENTICALLY (on the hop path the transform runs inside the body — §8.1
`run()` JSDoc). Capabilities EMIT slot-relative tokens; consumers TAKE
settled values VERBATIM — no consumer-side path math (the demo reads the
child's report at the settled ABSOLUTE path it receives and performs zero
derivation).

Caller-OWNED cause attribution — the await surface authors program against:

- SUCCESS ⇒ the composed await RESOLVES with `ok: true` (+ the child record
  landed at `<childScope>/top/status.json`).
- OPERATOR ABORT ⇒ the shutdown pass REJECTS the pending composed latch with
  `FrameKillError` at trigger time (§8.7); the base catch-all — spanning the
  hop — converts that rejection, so the caller's `run()` await settles
  RESOLVED with the kill capture: closed vocabulary `cause: "kill"`; `run`
  never rejects. Hermetically observable; in production the exit follows
  immediately.

  ```ts
  // pio/src/capability/terminal-takeover.ts
  export class FrameKillError extends Error {
    readonly cause: "kill";
    constructor() {
      super(FRAME_KILL_MESSAGE);
      this.name = "FrameKillError";
      this.cause = "kill";
    }
  }
  ```

  with the fixed message (pinned bytes, source-literal escape rendered here
  as the character):

  ```ts
  // pio/src/capability/terminal-takeover.ts
  const FRAME_KILL_MESSAGE =
    "terminal-takeover: frame interrupted — the ordered shutdown pass terminated the process";
  ```

- CALLEE THROW ⇒ the typed capture PROPAGATES THROUGH THE AWAIT
  (`{ ok: false, errors: [capture] }` — contract violations settle BEFORE any
  hop side effect: zero switches/mints/scope dirs; body faults — closed-
  vocabulary adopted causes included — mirror IDENTICALLY into the child
  record and the await).
- COMPOSITION-LEVEL WALL-CLOCK BREACH ⇒ DEFERRED boundary — `timeoutMs` stays
  RESERVED-UNENFORCED (§9); the parked design names the breach shape (an error
  carrying the closed-vocabulary `cause: "budget"` — adopted by `captureError`
  — along with the frame's PARTIAL record at the caller's
  await) and lands AFTER the stuck-session proof — named only, never
  demonstrated.

### 8.5 Terminal physics (measured)

Design basis OUTCOME A — ONE live `InteractiveMode` follows native session
replacement — measured against the pinned 0.85.1 dist and proven by the
scripted rows; OUTCOME B (per-frame IM fallback) remained the DOCUMENTED
FALLBACK and was NOT needed (coverage boundary: §8.8).

- ONE live `InteractiveMode` per process lifetime, mounted by the entry at
  the explicit mount step (§7.1 quote). The SAME live IM follows EVERY
  native session replacement automatically: the dist constructor wires
  `setBeforeSessionInvalidate` / `setRebindSession` on the runtime host
  (`dist/modes/interactive/interactive-mode.js` L313-317 region), so a
  `switchSession` re-renders the newly held session's transcript with zero
  presentation changes.
- `AgentSessionRuntime.switchSession(sessionPath)` is PUBLICLY exposed
  (`dist/core/agent-session-runtime.d.ts`): it opens the target via
  `SessionManager.open(path)`, tears down the outgoing session
  (`abort()` + persist → `session_shutdown` event → `dispose()`,
  `teardownCurrent` in `dist/core/agent-session-runtime.js`), then re-runs
  the STORED factory — pi's own `/resume` flow.
- Hop switch args EXACTLY `[childFile, parentFile]`, each
  `cwdOverride`-pinned to the runtime cwd (shipped call sites):

  ```ts
  // pio/src/capability/terminal-takeover.ts (#attachChildFrame)
  const switched = await runtime.switchSession(scoped.childFile, {
    cwdOverride: runtime.cwd,
  });
  ```

  ```ts
  // pio/src/capability/terminal-takeover.ts (#restoreParent)
  await runtime.switchSession(attached.parentFile, {
    cwdOverride: runtime.cwd,
  });
  ```

- Child anchoring WITHOUT SDK file-format duplication in pio code: the
  platform-named file comes from standalone `SessionManager.create(cwd,
  childTopDir)`; `SessionManager.open` PRESERVES the explicit path — an
  absent file is minted anchored at exactly that path
  (`dist/core/session-manager.js`):

  ```ts
  // pio/src/capability/terminal-takeover.ts (#mintChildScope)
  const manager = SessionManager.create(
    this.#topFrame.runtime.cwd,
    childTopDir,
  );
  const childFile = manager.getSessionFile();
  ```

- Reopened transcripts RETAIN their file-backed `sessionId` with FRESH
  handles (the old handle is disposed by the switch's teardown —
  `_setSessionFile → _loadEntries → header.id`,
  `dist/core/session-manager.js`).
- Per-session subscriptions DIE with the disposed session ⇒ each frame
  RE-ARMS its own listener after switch-back via `PioSession.rebind`
  (identity-gated + no-op-gated, `pio/src/capability/pio-session.ts`); a
  foreign handle refuses LOUDLY with the pinned form (source-literal escape
  rendered as the character):

  ```ts
  // pio/src/capability/pio-session.ts (rebind)
  if (session.sessionId !== this.id) {
    throw new SessionHandleRefusalError(
      `pio-session: rebind refused — handle '${session.sessionId}' is not this frame's session ('${this.id}')`,
    );
  }
  ```

- Cumulative counters SURVIVE in the JS heap across swaps, and loaded
  transcripts RE-FIRE NO events (no double count) — counter continuity is
  scripted-row-proven (P-row block in `pio/src/capability/pio-session.test.ts`
  + H4 rows in `pio/src/capability/terminal-takeover.test.ts`); the
  rationale rides the `pio-session.ts` header (persistent observer in the JS
  heap, reopened-transcript identity retention).

### 8.6 Scope layout & audit

- Child scopes nest ONE SEGMENT PER HOP under the CURRENT frame's scope dir —
  `<engagement>/.sessions/{top/, <B>/, <B>/<C>/}/top/`; flat siblings ⇒ one
  directory tree = the complete audit trail. The inner `top/` is the
  universal convention (root session of the given scope); records land at
  `<scopeDir>/top/status.json` uniformly. Grandchildren MINT further segments
  regardless of depth:

  ```ts
  // pio/src/capability/terminal-takeover.ts (#mintChildScope JSDoc)
  /** Mint half of the attach span: scope dir one segment under the parent
   * frame's scope dir (grandchildren mint further segments regardless of
   * depth); the platform-named file comes through the module's SOLE SDK
   * value reach — the hop-time thunk (no lineage options; the file may not
   * exist yet — the open preserves the explicit path). */
  ```

- Engagement root: `<stateRoot>/projects/<projectKey>/engagements/<id>/`
  (`pio/src/sandbox/layout.ts`: `deriveProjectKey` over the slugified launch
  cwd, `ensureEngagementLayout`); in-bubble the state root rides the
  `PI_CODING_AGENT_DIR` channel ONLY (§4.8).
- NO SESSION LINEAGE IS EVER MINTED: the dist `parentSession` genealogy
  linkage is UNUSED on this substrate — who-called-whom edges live ONLY in
  the runtime ledger + the abnormal-exit `frames.json` snapshot (§8.7). Clean
  completion writes NO snapshot: the per-scope record set is already
  complete, and success-path edge reconstruction has no named consumer in
  v1 — accepted boundary.
- Depth: no explicit nesting cap in v1 (a constant would be a knob with no
  named consumer); practical ceiling = per-hop latency × depth +
  parked-session RAM.

### 8.7 Clean death: the ordered shutdown pass (what authors see)

ONE ordered shutdown pass OWNED BY THE OUTERMOST FRAME fires on any of: double
Ctrl-C raw-mode bytes, external SIGTERM, fatal faults at entry/frame
boundaries. An IDEMPOTENT process-exit guard normalizes whichever termination
path runs the pass EXACTLY ONCE — user-abort exits 130, SIGTERM/fatal 1:

```ts
// pio/src/capability/terminal-takeover.ts
/** THE normalized exit-code map (idempotent under the wrapper — applied
 * regardless of the incoming argument once fired). 130 matches the host-
 * side child-exit passthrough. */
const EXIT_CODES: Record<ShutdownCause, number> = {
  "user-abort": 130,
  sigterm: 1,
  fatal: 1,
};
```

Boundary note (measured deviation vs the GOAL narrative, one line): there is
NO native 130 path anywhere in the pinned dist — the IM self-exits 0
INTERNALLY on double Ctrl-C (`interactive-mode.js`: double-hit `handleCtrlC`
⇒ `shutdown()` ⇒ `stop()` ⇒ `runtimeHost.dispose()` ⇒ `process.exit(0)`
before any pio consumer); the normalized 130 + the typed line arrive SOLELY
via the pass. Single Ctrl-C clears the editor ONLY (turn abort is bound to
Escape / `"app.interrupt"`), and external SIGINT kills by signal — hence NO
SIGINT handler anywhere (raw-mode doctrine unchanged).

Pass legs (shipped ordering, `pio/src/capability/terminal-takeover.ts`
module header):

```
// pio/src/capability/terminal-takeover.ts (module header)
THE ordered shutdown pass (per trigger): rejects pending composed latches
innermost-first (parked top skipped); for non-user-abort causes stops the
mounted terminal and disposes the shared runtime (best-effort, stop-
once); writes the per-frame PARTIALS innermost-first over the trigger-
time snapshot (fatal excludes the top — its caller owns that record);
drops ONE best-effort frames.json at the sessions root; lands the typed
line on the entry's stderr sink.
```

- Pending COMPOSED latches REJECT with `FrameKillError` first
  (innermost-first; the parked top latch is skipped — no consumer).
- The mounted terminal is stopped for non-user-abort causes (stop-once; the
  user-abort path is IM-owned internally) — cooked mode restored EITHER WAY.
- Per-frame PARTIAL records INNERMOST-FIRST, claim-AWARE — a completed
  frame's terminal record is NEVER overwritten. Two shipped variants
  (`pio/src/capability/status.ts`): the synchronous claim-aware write for
  the exit-intercepted path (async work cannot complete after a delegated
  termination) and the async grace-window settle — pinned default bound:

  ```ts
  // pio/src/capability/status.ts
  /** Pinned default settlement bound: balances settle odds against exit latency. */
  export const DEFAULT_KILL_GRACE_MS: number = 250;
  ```

- ONE compact ENGAGEMENT-LEVEL LEDGER SNAPSHOT at `<sessionsRoot>/frames.json`
  — abnormal-exit ONLY (shape per the goal's closing decisions record;
  every fault swallowed — best-effort sync writer):

  ```ts
  // pio/src/capability/terminal-takeover.ts (writeLedgerSnapshot JSDoc)
  /** Leg (e): ONE best-effort SYNCHRONOUS ledger snapshot at
   * `<sessionsRoot>/frames.json` — the frame tree (who-called-whom nesting
   * edges durable on abnormal exit ONLY), the INNERMOST active scope, and the
   * cause token. Canonical key order (cause → activeScope → frames; per node
   * depth → capability → scopeDir → sessionFile → children; sessionFile
   * ABSENT when the live accessor is unnamed — never null); 2-space indent +
   * trailing newline (same discipline as serializeStatus). Written ONLY on
   * pass triggers; every fault swallowed (the writer swallows). */
  ```

- THEN the typed exit line, AFTER cooked-mode restore, on the entry's stderr
  sink (lines WITHOUT trailing newline — the sink appends them):

  ```ts
  // pio/src/capability/terminal-takeover.ts (emitTypedLine)
  stderr(
    `terminal-takeover: shutdown — frame '${frame.capability.name}@${frame.capability.version}' (depth ${frame.depth}) ended by ${cause}`,
  );
  ```

  Byte form: `` terminal-takeover: shutdown — frame '<name>@<version>'
  (depth <N>) ended by <cause> `` (`stderr` sink).

Author rules (binding):

- NEVER construct a second terminal or a competing process-stream writer (one
  engagement / one process / one terminal — anti-pattern §5.9 stands).
- NEVER depend on KEEPING the terminal: take-and-return semantics — the hop
  takes the terminal while the child runs and hands it back on return (or the
  death pass restores cooked mode before the typed line).
- Completion determinations hold with NO human present (§5.8 stands) — the
  pass makes clean death independent of the operator too.
- Zero survivors by physics: the kernel reclaims the shared heap on exit —
  no leaked listeners/timers/tools; zero orphans BY CONSTRUCTION (one
  process — nothing to orphan).

### 8.8 Coverage boundary (anti-assert)

Hermetic rows prove PIO-SIDE mechanics over SCRIPTED SDK fakes — consequences
of ordering, bytes, placement, counter arithmetic, IM counts — NOT dist-side
realities. The following are OBSERVED in the manual E2E legs (quality gate),
named here and NEVER asserted in this document: IM rebind RENDERING (takeover
render / return render), reopen-from-transcript FIDELITY, and
abort-settlement visuals. A HARD seam mismatch localizes to the NAMED attach
seam (runtime-host attach via the `switchSession` / `rebind` wiring), is
reported with measured evidence, and BLOCKS per constraint. Accepted
carry-overs (consistent with rulings, stay approved): flicker-per-hop
(twice total: take + return); bounded race window (keystrokes strictly
between yield and attach DROP; post-handover input reaches the child).

## 9. Reserved constructor parameters (frozen bindings)

Material: `pio/src/capability/base.ts` (`CapabilityParams` + the retained
fields) · `pio/src/run-session.ts` (the session-injection precedent) ·
`pio/src/capabilities/compose-new-session-demo.ts` (the `tty` exercise).

The constructor bag is SHRINK-ONLY FROZEN: no NEW constructor parameters are
added to it — the three meanings below freeze NOW, and implementations arrive
PER SLOT. Quoted verbatim (`pio/src/capability/base.ts`):

```ts
// pio/src/capability/base.ts
/** Constructor parameters for one capability engagement. */
export interface CapabilityParams {
  /** Present = same placement (in-process); absent = cross-process marker. */
  session?: PioSession;
  /** Reserved — binds on the cross-process path, unenforced here. */
  tty?: boolean;
  /** Reserved — binds on the cross-process path, unenforced here. */
  timeoutMs?: number;
}
```

- **`session` PRESENT = same placement (in-process)** — how EVERY top frame is
  hosted today (the entry constructs the `PioSession` and passes it in,
  §8.2). Shared-conversation composition (row 1) is IMPLEMENTED: the
  shared-conversation placement invoked with the session-param idiom of §11
  (construct the callee with the caller's session INSTANCE, await `run()`);
  exercise vehicle: `compose-same-session-demo` (§11.8).
- **`session` ABSENT = row 2** — the terminal-takeover frame (§8), this
  goal's landing.
- **`tty` defaults TRUE = interactive sequential frame** — takes the terminal
  while it runs, hands it back on exit. The meaning NOW BINDS: the shipped
  demo exercises it (the bare invocation takes the operator's terminal for
  the whole composed run, §8.3).
- **`tty: false` headless = DECLARED-BUT-UNBOUND** until slot 8: row-3
  process spawning lands together with that meaning — NOTHING from row 3
  leaks into row 2 today (boundary only).
- **`timeoutMs` RESERVED + UNENFORCED** — the wall-clock cap is deferred by
  owner ruling; the PARKED DESIGN (compact block, boundary phrasing only):

  - Caller-side per-frame timer (opt-in per call; ABSENT = no cap).
  - Responsive breach = the SHIPPED teardown primitive + an error carrying
    the closed-vocabulary `cause: "budget"` (adopted by `captureError`) at
    the caller's await with the frame's PARTIAL record.
  - Wedged run (sync loop / hung tool) = whole-process death — the typed
    line + records drive re-entry.
  - Row-3 headless frames (slot 8) INHERIT the same param + primitive — no
    operator present there to abort.
  - Disposition: lands AFTER the stuck-session proof as a small follow-up
    feeding slot 8's headless-watchdog need.

## 10. Temporary built-ins (registry note)

Material: `pio/src/capabilities/compose-new-session-demo.ts` ·
`pio/src/capability/loader.ts` (`CAPABILITY_TABLE`) · `pio/src/cli.ts`
(`HELP_LINES`).

The registry carries ONE temporary builtin: `compose-new-session-demo`. Its
header carries the uppercase TEMPORARY marker AND the removal-schedule
sentence, both quoted VERBATIM — the phrase is mechanically greppable and
PINNED by the suite's source guards; KEEP IT STABLE:

```
// pio/src/capabilities/compose-new-session-demo.ts (module header)
The compose-new-session-demo capability — TEMPORARY.
```

```
// pio/src/capabilities/compose-new-session-demo.ts (module header)
TEMPORARY removal schedule: this registration exists solely to exercise the terminal-takeover composition end-to-end, and it is REMOVED at the bulk-migration cutover.
```

That registration exists SOLELY to exercise the terminal-takeover composition
end-to-end and is REMOVED at the bulk-migration cutover. Registration surface
(insertion order pinned in the suite):

```ts
// pio/src/capability/loader.ts
export const CAPABILITY_TABLE: CapabilityTable = {
  research: () => import("../capabilities/research.ts"),
  "compose-new-session-demo": () =>
    import("../capabilities/compose-new-session-demo.ts"),
  "compose-same-session-demo": () =>
    import("../capabilities/compose-same-session-demo.ts"),
  "guards-demo": () => import("../capabilities/guards-demo.ts"),
};
```

```ts
// pio/src/cli.ts (HELP_LINES built-in block)
  "  compose-new-session-demo — TEMPORARY: greets the operator, runs research in the taken-over terminal, then reports the top 3 findings",
  "  pio run compose-new-session-demo",
  "  compose-same-session-demo — greets the operator, runs research in the same session, then reports the top 3 findings",
  "  pio run compose-same-session-demo",
```

Author guidance: do NOT pattern-match it as a permanent builtin — its
zero-input contract and hard-coded `DEMO_TOPIC` are DEMO FIXTURES, not a
recommended authoring posture:

```ts
// pio/src/capabilities/compose-new-session-demo.ts
export const DEMO_TOPIC = "Gnosticism in Barcelona";
```

```ts
// pio/src/capabilities/compose-new-session-demo.ts (contract literal)
readonly contract: Contract = {
  name: "compose-new-session-demo",
  version: "0.1.0",
  inputs: [],
  outputs: [{ name: "report" }],
  writes: [],
};
```

PERMANENT REGISTRATION: `guards-demo`. Its module header carries the
PERMANENT marker and the registration-contrast statement — five complete
physical source lines, quoted VERBATIM with their `// ` prefixes stripped per
this section's sibling quote convention:

```
// pio/src/capabilities/guards-demo.ts (module header)
The guards-demo capability — PERMANENT: the standing home for guard
demonstrations (future guard tests accumulate here). Registration contrast:
its row-2 sibling compose-new-session-demo is a temporary demonstration
whose removal is scheduled at the bulk-migration cutover; this module stays
registered.
```

This registration STAYS — unlike the TEMPORARY sibling above, whose removal
is scheduled, its removal is never scheduled. Standing role: the permanent
home for guard demonstrations, the operational target of the quality gate's
manual live-run leg, and the live exemplar walked through in §1.4.
Registration surface — fourth `CAPABILITY_TABLE` entry appended last (the
table quote above now closes on it), and the appended two-line `HELP_LINES`
pair, verbatim (raw U+2014, two-space content indent, trailing commas — the
canonical line is the BARE form; the demo takes nothing):

```ts
// pio/src/cli.ts (HELP_LINES built-in block, appended pair)
  "  guards-demo — PERMANENT guard demonstration: first pass skips the declared write, the expectation guard denies settlement with a corrective note naming the exact path, the compliant re-run settles, then a summary states the outcome",
  "  pio run guards-demo",
```

The §6 checklist applies to every NON-temporary builtin UNCHANGED.

## 11. Composed execution: the row-1 same-session composition

Material: `pio/src/capabilities/compose-same-session-demo.ts` (module header
contrast block, stage-2 construction, contract literal) ·
`pio/src/capability/base.ts` (header span-stamp block, `CapabilityParams`,
`run()` seam + stamp site, `settleFileModeOutputs`) ·
`pio/src/capability/pio-session.ts` (header no-turn-carrier note,
`renderCapabilityMarker`, `PIO_CAPABILITY_CUSTOM_TYPE`, `markCapability`,
`SessionVariableStore`) · `pio/src/capability/contract.ts`
(`validateInputs`) · `pio/src/capability/errors.ts`
(`ContractViolationError`) · `pio/src/capability/status.ts`
(`serializeStatus`, `exitCodeFor`, `CapabilityResult`) ·
`pio/src/capability/loader.ts` (`CAPABILITY_TABLE`) · `pio/src/cli.ts`
(`HELP_LINES`) · `pio/src/run-session.ts` (top-frame construction) ·
`pio/src/capabilities/compose-new-session-demo.ts` (temporary sibling header
and stage-2 contrast) · `src/guards/validation.ts` (root-tree `tool_call`
refusal precedent) · `pio/src/capability/base.test.ts` +
`pio/src/capabilities/compose-same-session-demo.test.ts` +
`pio/src/capabilities/research.test.ts` (evidence rows).

Placement taxonomy of record (§8 opening): **row 1** is this section — one
capability runs another INSIDE THE CALLER'S OWN SESSION. The callee is
constructed holding the caller's existing `PioSession` INSTANCE by reference,
driven through ITS OWN base-provided `run()`, and the `CapabilityResult`
settles at the caller's AWAIT. No new process, no hand-off, no terminal
change: to the operator the same conversation simply keeps going. The
exercise vehicle is the standing demo `compose-same-session-demo` (§11.8);
the manual E2E leg is DEFINED at §11.9 and the acceptance-evidence map sits
at §11.10.

### 11.1 Invocation idiom: the caller's session INSTANCE by reference

The idiom, VERBATIM from the shipped exercise vehicle (stage 2 of
`pio/src/capabilities/compose-same-session-demo.ts`):

```ts
// pio/src/capabilities/compose-same-session-demo.ts (call(), stage 2)
    const child = new ResearchCapability({ session: this.s });
    const outcome = await child.run({ topic: DEMO_TOPIC });
```

Construct the callee WITH the caller's session INSTANCE, drive it through
ITS OWN base-provided `run()` (never overridden — §6 step 1), and receive
the typed result inline AT THE AWAIT: `ok` / `outputs` on success, `errors`
on failure — the settled `CapabilityResult` channels of §8.4, quoted for
this placement (`pio/src/capability/status.ts`):

```ts
// pio/src/capability/status.ts
export interface CapabilityResult {
  readonly ok: boolean;
  readonly outputs?: Record<string, unknown>;
  /** Non-empty when ok is false. */
  readonly errors?: SessionStatusError[];
}
```

No process spawn, no IPC, no terminal change: the session-present branch
runs the body IN PLACE, and the row-2 lazy import (`./terminal-takeover.ts`)
is NEVER evaluated on this path (eval-flag pin, suite-proven — the B8 row in
`pio/src/capability/base.test.ts`; cross-ref §8.1).

THE DELIBERATE CONTRAST with §8.2/§8.3: there the callee is constructed
WITHOUT a session param to select the row-2 hop —

```ts
// pio/src/capabilities/compose-new-session-demo.ts (call(), stage 2)
    const child = new ResearchCapability({});
    const outcome = await child.run({ topic: DEMO_TOPIC });
```

— while here `{ session }` selects row 1. One bag difference decides the
placement: absent ⇒ hop the terminal-takeover frame (§8); present ⇒ run in
the caller's own session (this section).

WHY instance identity — and NOT a `fromRuntime` sibling over the same
runtime: observation state (the listener feeding the counters store) and the
vars store are PER INSTANCE (`pio/src/capability/pio-session.ts` module
header):

```
// pio/src/capability/pio-session.ts (module header)
Session host for capability authoring: wraps one constructed agent
session runtime BY REFERENCE and feeds its counters store from the single
instance-scoped listener threaded through the construction seam.
```

One instance ⇒ ONE observer plus ONE `SessionVariableStore` — continuous
shared counters AND bidirectional variable sharing hold BY CONSTRUCTION
(§11.4). A `fromRuntime` sibling would mint a SECOND observer and a SECOND
store (a fresh accumulation start point; "No module-level mutable state"
separates instances), needing bridging machinery that does not exist before
slot 11 (named boundary — never demonstrated).

Grounding clauses, already pinned verbatim elsewhere: the `base.ts` header
placement clause (§8.1 — "a provided session runs in process; an ABSENT
session hops the row-2 terminal-takeover frame") and
`CapabilityParams.session`'s JSDoc (§9 — "Present = same placement
(in-process); absent = cross-process marker.").

Direct-import pattern: co-shipping builtins compose over EACH OTHER'S shipped
modules DIRECTLY — stage 2 imports the `research` default export statically
(`import ResearchCapability from "./research.ts"`) rather than resolving
through the loader; the loader's dispatch machinery stays RESERVED for
startup/top-session resolution (consistent with §5.6/§6). The stage-2
comment, quoted verbatim:

```
// pio/src/capabilities/compose-same-session-demo.ts (stage-2 comment)
2. Composition — co-shipping builtins compose over EACH OTHER'S shipped
modules directly (the loader's dispatch machinery is reserved for
startup/top-session resolution). Constructed WITH the caller's OWN
session instance BY REFERENCE (nothing else crosses the boundary), so
the child's OWN base dispatch runs its body IN THIS SAME SESSION
(no spawn, no terminal change) — this module never touches hop
machinery.
```

### 11.2 Ownership doctrine: what crosses the boundary

The settled doctrine, stated once: the callee and the caller share ONLY the
session context (conversation/transcript, cumulative counters) and the
variables — everything else is isolated. Nothing from the caller's declared
scope, no second vars object, no caller contract crossing.

What crosses, mechanically — EXACTLY `{ session }` at construction. The bag
carries nothing else (the suite pins the construction bag DEEP-EQUAL to
`{ session }` — C2/A1 rows, §11.10); beyond it, only the validated inputs
record handed to `run()` — here `{ topic: DEMO_TOPIC }`. Each capability
instance carries its OWN `contract`:

```ts
// pio/src/capability/base.ts
  /** Authored identity plus IO vocabulary — supplied by every concrete subclass. */
  declare readonly contract: Contract;
```

`declare readonly` — the base never crosses contracts between instances.
Observation state is instance-owned with NO module-level linking ("No
module-level mutable state" — `pio-session.ts` header); the rebind/handle-
swap mechanics of §8.5 are UNUSED on this path — one handle throughout, so
there is no switch whose re-arm could matter.

Consequence: the callee's phases ride the CALLER'S conversation — same
session stream, same cumulative counters, one engagement / one process /
one terminal (§5.9 stands unchanged).

### 11.3 Span markers: form, reserved grammar, no-turn carrier, placement policy

FORM + OWNER. The marker line is `—— capability: <label> ——` (two U+2014 em
dashes flanking the label, single spaces; label = the OWNING capability's
`contract.name`). Sole owner `renderCapabilityMarker`, quoted verbatim — the
source escapes the glyph so editor/toolkit mangling cannot rot the bytes:

```ts
// pio/src/capability/pio-session.ts
/** Capability-span marker: the `capability:` prefix inside the dash flank
 * of the phase-marker layout (U+2014 x2, single spaces). No input
 * validation; no trailing newline. */
export function renderCapabilityMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 capability: ${label} \u2014\u2014`;
}
```

RESERVED LABEL GRAMMAR. Phase ids stay BARE ids; the `capability:` prefix is
reserved for the span mark (no runtime enforcement). The module header names
both rules together with the carrier doctrine:

```
// pio/src/capability/pio-session.ts (module header)
Capability-span marking rides a no-turn carrier: markCapability appends
the span's section header (renderCapabilityMarker's line; customType
PIO_CAPABILITY_CUSTOM_TYPE) as a durable custom message — never folded
into prompt text, never a turn trigger. Phase ids stay BARE ids; the
`capability:` prefix is reserved for that mark (no runtime enforcement).
Only session-present runs are stamped, once per span (see base.ts).
```

CARRIER — what actually ships. The marker is a NO-TURN DURABLE CUSTOM
MESSAGE: never folded into prompt text, never a turn trigger. `markCapability`,
quoted verbatim:

```ts
// pio/src/capability/pio-session.ts
  async markCapability(label: string): Promise<void> {
    await this.runtime.session.sendCustomMessage({
      customType: PIO_CAPABILITY_CUSTOM_TYPE,
      content: renderCapabilityMarker(label),
      display: true,
      details: undefined,
    });
  }
```

Mechanics: NO options object = the SDK's append-only idle branch — one
durable transcript entry, zero LLM turns (method JSDoc, same file: "no
options object = the SDK's append-only idle branch"); `display: true` makes
the entry visible in the session stream; `details: undefined` keeps it plain
content. The namespace constant identifies the mark among foreign custom
messages — MODULE-PRIVATE on purpose (cite it via its owner; do not
reconstruct the bytes at other call sites):

```ts
// pio/src/capability/pio-session.ts
const PIO_CAPABILITY_CUSTOM_TYPE = "pio-capability";
```

PLACEMENT — ONCE PER `run()` SPAN. The base `run()` session-present branch
stamps EXACTLY ONCE, strictly AFTER `validateInputs` / BEFORE `call()` — the
sole call site in the artifact (source-guard pinned, `base.test.ts`):

```ts
// pio/src/capability/base.ts (run() session-present branch)
      // Span stamp: settled before the body can issue any phase prompt.
      await this.s.markCapability(this.contract.name);
```

Awaited ⇒ the header SETTLES ABOVE the span's first phase line in transcript
order. Observable manifestation: the marker MESSAGE precedes the span's
FIRST phase prompt. Contrast the phase markers, which lead every run's
PROMPT TEXT (§1.1) — different carrier (durable custom message vs prompt
line), different granularity (once per span vs every run).

POLICY EDGES, each exactly as the shipped pins define them:

- Floor-driven re-runs and later phases of the same span carry NO FURTHER
  header — once per `run()`; nothing in the phase path knows the channel
  exists (span-stamp matrix, `base.test.ts`; the phase-side restamping
  contrast per §1.1).
- Span RETURNS are IMPLICIT — section-header scoping: a header scopes
  everything until the next header appears. There is no close-mark and no
  stamp state to unwind (base.ts header: "span return is implicit
  (section-header scoping); no stamp state exists").
- A SECOND `run()` on the same instance re-stamps — a fresh span; no state
  exists to re-arm (one call site per branch per run).
- A ZERO-PHASE `run()` persists a bare header — one stamp, zero prompts
  (documented accepted edge).
- A CONTRACT-VIOLATING run stamps NOTHING — validation precedes the stamp
  site, so a violating run settles with zero side effects (typed capture;
  no marker, no body).

TOP-LEVEL UNIFORMITY. The entry constructs EVERY top frame WITH `{ session }`
—

```ts
// pio/src/run-session.ts (pipeline)
    const instance = new resolution.capability.ctor({ session });
```

— so every admitted run stamps its own capability header; transcripts audit
END-TO-END, including the top capability's scope opening.

ROW-2 EXCLUSION. The hop BODY is unstamped ON PURPOSE — the child
engagement's own terminal record already names the callee (per-frame records,
§8.4). Pinned as ABSENCE rows in `base.test.ts` (row-2 uniformity) and
commented at the adoption site (refreshed §8.1 dispatch quote).

AUDIENCE. After-the-fact transcript readers — the operator's audit, the QG
session, the future slot-10 per-span attribution (§11.7) — NOT the model:
prompt text never carries the mark. The terminal record stamps only the TOP
capability's identity (the emitter's identity is stamped from the resolved
top contract — entry wiring, `pio/src/run-session.ts`), so this is the
cheapest durable proof that a composed callee ran at all.

### 11.4 Shared variables until the wrapping layer lands (slot-11 handoff)

Operational meaning AT THIS RUNG: the SAME `SessionVariableStore` object via
session-instance identity. One instance ⇒ ONE store reachable from BOTH
vantage points, so callee `set` → caller `get` AND caller `set` → callee
`get` hold over one raw Map with ZERO new machinery. Bidirectional
visibility holds BY CONSTRUCTION; the VAR-FREE suite row A2 asserts exactly
this (the caller-side seed is visible INSIDE the callee's span and the
callee-side write is visible AFTER the run — §11.10).

WHAT DOES NOT LAND HERE. No new API, coercion, or validation — `set` is RAW:

```ts
// pio/src/capability/pio-session.ts
  /** Raw assignment — value-shape coercion belongs to the wrapping layer. */
  set(name: string, value: unknown): void {
    this.#entries.set(name, value);
  }
```

NO MODEL-SIDE WRITER exists and none is added: `PhaseResult.varsDelta` stays
EMPTY BY CONSTRUCTION and the idle `customTools` slot stays RESERVED
(boundary per §1.7 — cross-referenced, not restated).

WRAP-NOT-RENAME HANDOFF. The store's own JSDoc states the inheritance rule
verbatim — "later work wraps this same store rather than renaming it":

```ts
// pio/src/capability/pio-session.ts
/**
 * Minimal instance variable store (get/set/list over a Map). Deliberately
 * distinct from the root tree's richer same-named class (different
 * package, different surface); later work wraps this same store rather
 * than renaming it.
 */
export class SessionVariableStore {
```

— the wrapping layer (slot 11: the single validated entry point plus
`varsDelta`) WRAPS this same store and inherits the sharing automatically.
Named boundary — not demonstrated at this rung.

### 11.5 Pre-call enforcement placement (the base-seam `validateInputs`)

NO NEW GATE. The base-seam `validateInputs(this.contract, values)` — at its
position relative to the placement branch shown in the refreshed §8.1
dispatch quote — remains the SOLE pre-execution enforcement point for either
placement. Because composition drives the callee THROUGH ITS OWN `run()`, the
callee's inputs are ALWAYS validated against the CALLEE'S contract before
`call()` executes — the same preflight a standalone launch gets.

Violation behavior: a typed `ContractViolationError` (collect-all violations,
cause `"contract"` — thrown by `validateInputs`,
`pio/src/capability/contract.ts`) settles as
`{ ok: false, errors: [capture] }` AT THE CALLER'S AWAIT:

```ts
// pio/src/capability/errors.ts
export class ContractViolationError extends Error {
  /** Every collected violation — the defining datum. */
  readonly violations: string[];
  /** Refines built-in Error.cause?: unknown; always "contract". */
  readonly cause: CapabilityErrorCause;

  constructor(violations: string[], message?: string) {
    super(message ?? `Contract violation: ${violations.join("; ")}`);
    this.name = "ContractViolationError";
    this.violations = violations;
    this.cause = "contract";
  }
}
```

The callee body NEVER runs and NO span stamp occurs — validation precedes
the stamp site, so a violating run is a ZERO-side-effect settlement (the
suite's three A3 variants evidence this, incl. zero `sendCustomMessage`
calls — §11.10).

Discovery-placement invariance: the check lives in the BASE SEAM, not the
loader — direct-instantiation composition (import the class, construct, await
`run()`) gets the identical preflight. Static load-time `checkContract`
continues to apply ONLY to loader-table registrations (cross-ref §6 step 2).

### 11.6 Frame governance settlement (D2): self-containment, structural return, no blocking machinery

CALLEE SELF-CONTAINMENT. Composition hands the callee only `{ session }` +
its validated inputs. The callee never receives, inherits, or borrows any of
the caller's declared scope — its OWN contract IS its whole frame. The
session-present branch invokes the body with no scope plumbing beyond the
inputs record (quoted verbatim — the entire composed-run body):

```ts
// pio/src/capability/base.ts (run() session-present branch)
      // Span stamp: settled before the body can issue any phase prompt.
      await this.s.markCapability(this.contract.name);
      const outputs = await this.call(values);
      return { ok: true, outputs: settle(outputs) };
```

The suite A1 row pins the isolation: the bag carries NO caller-contract/scope
keys, the stub callee carries the REAL research contract (not the caller's),
and the caller's declared contract is UNCHANGED after the call.

"CALLER'S RULES RETURN" IS STRUCTURAL, NOT MECHANICAL. After `run()` settles
— SUCCESS OR FAILURE: every reachable path RESOLVES, the catch-all spans both
placements, `run` never rejects (the §8.4 doctrine stands) — the caller's
remaining phases continue under the caller's OWN contract. Nothing ever
changed mid-call ⇒ no residue, nothing to restore. A1 structural-resume
evidence: the post-call continuation runs under caller-only references, and
the marker channel attributes each transcript segment to its OWNING
capability in call order.

PHYSICAL WRITE BOUNDARY AT THIS STEP. It remains the SANDBOX MOUNT PROFILE —
project-slot rw LAST bind ordering (§4.6), system ro: the ACCEPTED BACKSTOP
spanning this window, roadmap-recorded risk. Contract `writes` /
`allowProjectWrites` stay DECLARED-UNENFORCED
(`pio/src/capability/contract.ts`); they name intent, not enforcement.

THE NO-BLOCKING-MACHINERY RULING — stated explicitly: ZERO runtime
write-blocking machinery lands at this step — no frame-stack push/pop around
calls, no in-bubble tool-call guard, no refusal/retry dynamic. Rationale in
one sentence: a refused-but-instructed write would loop the model against
the budget BOUND (the infinite-loop trap), and the owner rejected such a gate.
The refused-with-readable-reason half rides slot 10 (§11.7).

### 11.7 Slot-10 boundary (explicit)

Boundary voice throughout — named, cited, never demonstrated.

The per-write BLOCKING half — a write the callee's contract denies is
REFUSED with a READABLE REASON under the callee's frame — lands together with
SLOT 10's guard layer. Slot 10 BUILDS ON — extends, not reinvents — the frame
semantics and marker attribution pinned in this section
(callee-frame-is-its-own-contract; per-span frame attribution via the
capability header of §11.3). THIS STEP SHIPS NO BLOCKING MECHANISM.

SDK facts shaping the boundary (measured against owned pin 0.85.1 —
GOAL-measured grounding, recorded as measured fact):

- The SDK session EVENT channel is PASSIVE — subscribe delivers events to a
  void-returning listener; it CANNOT refuse a tool call.
- The extension-API `tool_call` handler (`{ block: true, reason }`) is the
  identified in-process refusal path. Precedent: the legacy root-tree guard
  `src/guards/validation.ts` — `pi.on("tool_call", …)` with `block: true`
  write refusals for paths outside its allowlist.
- In-bubble pi loads extensions from the isolated agent dir — the
  owned-extension provisioning of §4 stands, so an extension-installed guard
  reaches bubble sessions.

WHICH concrete install mechanism slot 10 uses (owned-extension registration
vs inline extension vs other) is slot-10 planning territory — deliberately
left open here.

### 11.8 Fixture registry note

Registry state: FOUR builtins — `research` (permanent),
`compose-new-session-demo` (TEMPORARY — §10's note stands unchanged),
`compose-same-session-demo` (PERMANENT standing row-1 demo — the operational
QG E2E target, §11.9), and `guards-demo` (PERMANENT guard-demonstration home
— §10). The registration surface (four-entry table, uniform lazy-thunk form;
insertion order research → compose-new-session-demo →
compose-same-session-demo → guards-demo pinned in the loader suite; the
`HELP_LINES` two-line idiom pairs with it) is pinned at HEAD in the
refreshed §10 quotes.

THE SINGLE STANDING DEMO. `compose-same-session-demo` — PERMANENT, REGISTERED
— is a STRUCTURAL MIRROR of the temporary row-2 demo differing ONLY in
placement: the same-session callee construction (`{ session: this.s }` here
vs session-absent `{}` there). Same contract shape — zero inputs, a single
`report` output (a VALUE slot passing through the settled research report
token), empty `writes`:

```ts
// pio/src/capabilities/compose-same-session-demo.ts (contract literal)
  readonly contract: Contract = {
    name: "compose-same-session-demo",
    version: "0.1.0",
    inputs: [],
    outputs: [{ name: "report" }],
    writes: [],
  };
```

Same three-phase flow (greeting → the awaited composition → summary), same
fault vocabulary: verbatim fault forwarding (re-project the child's first
capture — type + message; no new types minted), the one fixed sentence for
the successful-but-unreadable report, kill/empty variants carried
identically.

THE CONTRAST STATEMENT LIVES IN BOTH MODULES' HEADERS. The permanent
module's, quoted verbatim:

```
// pio/src/capabilities/compose-same-session-demo.ts (module header)
Permanent registration: unlike its sibling `compose-new-session-demo` — a
temporary demonstration removed at the bulk-migration cutover — this
module stays registered. The single placement difference between the two
is the callee construction: WITH the caller's session instance by
reference here, session-absent in the sibling.
```

The sibling's uppercase `TEMPORARY removal schedule` line is already pinned
byte-intact in §10. Prose about the permanent demo uses lowercase
"temporary" ONLY — the uppercase token is the deletion-sweep grep signature
of the row-2 module (zero occurrences in this module's source — suite-guard-
pinned).

WITHDRAWAL NOTE. The goal-proposed leaf-callee fixture
(`compose-same-session-callee` — tiny, unregistered, import-direct) is
WITHDRAWN: the planning-phase owner directive superseded the two-asset shape
with this single standing demo subsuming its role.

AUTHOR POSTURE (carrying §10's guidance over to both demos). Zero-input
contracts plus hard-coded `DEMO_TOPIC` constants are DEMO FIXTURES, not a
recommended authoring posture:

```ts
// pio/src/capabilities/compose-same-session-demo.ts
export const DEMO_TOPIC = "Gnosticism in Belgrade, Serbia";
```

The §6 checklist governs every non-demo builtin unchanged.

### 11.9 Quality-gate manual E2E leg (definition)

Anti-assert voice (§7.1/§8.8): the items below are EXPECTED OBSERVATIONS
defined for the owner-run measurement — measurement points, NOT document
assertions.

Framing: OWNER-RUN on a provisioned host (live model + state root). This
goal builds ZERO E2E machinery — the leg is DEFINED here and feeds the
quality-gate session directly (QG precedent of the last three rungs: manual
E2E leg + PR code review vs `experimental`; QG approval = completion
confirmation).

LEG: `pio run compose-same-session-demo` under an attached TTY. The
TTY-required surface of §7.1 applies (both enforced sites stand); zero
declared inputs ⇒ no `--input` needed.

EXPECTED TRANSCRIPT MARKER ORDERING — durable capability custom messages plus
phase prompt markers, in this order:

1. `—— capability: compose-same-session-demo ——` PRECEDES the greeting
   phase's `—— greeting ——` marker;
2. `—— capability: research ——` PRECEDES the FIRST run's `—— research ——`
   phase marker of the research loop — and multi-run loops stamp NO FURTHER
   capability headers (once-per-run ruling, §11.3);
3. the `—— summary ——` phase carries NO capability header — it resumes the
   demo's scope; no second demo header appears ANYWHERE.

RUN-SHAPE VARIANCE (acceptance-driven). The leg cannot force how many runs
the research loop takes — the owner's topic may converge early or exhaust
the cap — so TWO VALID SHAPES are documented, and either is a correct
observation:

- **(a) EARLY CONVERGENCE** — fewer than `RESEARCH_MAX_RUNS`
  (`pio/src/capabilities/research.ts`) research-phase prompts; the report
  ends WITHOUT the truncation note.
- **(b) FULL BUDGET CONSUMPTION** — exactly `RESEARCH_MAX_RUNS`
  research-phase prompts followed by the summary resuming; the report
  CONTAINS the pinned truncation note (`## Truncated at run budget`, §2.4)
  appended after the seeded sections.

THE BOUND EVENT RIDES BOTH RECORD CHANNELS IN SHAPE (b): IN-STREAM — the
transcript carries the full-budget shape (exactly the cap's research-phase
prompts, then the annotated report content the summary reads); IN-LEDGER —
the settled `outputs.report` token RESOLVES to the annotated artifact. NO
NEW STREAM MACHINERY ships with this definition: the outcome-model
constraint of §7.1 — capability code performs NO raw terminal writes — is
untouched. Both shapes settle `ok: true`, NO `errors`, EXIT 0.

EXPECTED TERMINAL `status.json` (placement `<engagement>/.sessions/top/status.json`;
canonical serialized shape per `serializeStatus`, quoted for the key order —
`ok → capability{name, version, source} → outputs → [errors?] →
[transcriptRef?] → tokens → durationMs`, 2-space indent + trailing newline):

```ts
// pio/src/capability/status.ts
export function serializeStatus(status: SessionStatus): string {
  const record: Record<string, unknown> = {
    ok: status.ok,
    capability: {
      name: status.capability.name,
      version: status.capability.version,
      source: status.capability.source,
    },
    outputs: status.outputs,
    ...(status.errors !== undefined ? { errors: status.errors } : {}),
    ...(status.transcriptRef !== undefined
      ? { transcriptRef: status.transcriptRef }
      : {}),
    tokens: status.tokens,
    durationMs: status.durationMs,
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}
```

The expected field-by-field observations:

- `ok: true`;
- `capability: { name: "compose-same-session-demo", version: "0.1.0", source: "builtin" }`;
- `outputs.report` = the BUBBLE-ABSOLUTE report path — the callee's FILE-MODE
  slot settled to absolute placement during its awaited run (same bubble ⇒
  same project-slot placement), and the demo's own `report` slot is a VALUE
  slot that passes the settled value through UNTRANSFORMED
  (`settleFileModeOutputs` touches file-mode slots only — §8.4);
- NUMERIC `tokens`; NUMERIC `durationMs`; optional `transcriptRef`; NO
  `errors`.

EXIT CODE 0 — the exit-code map (`pio/src/capability/status.ts`):

```ts
// pio/src/capability/status.ts
export function exitCodeFor(status: SessionStatus): number {
  return status.ok ? 0 : 1;
}
```

FAILURE POSTURE: any deviation FROM THE CORRECTED EXPECTATIONS ABOVE (a
failing outcome, an `errors` array, a nonzero exit, a marker-ordering
violation, or a bound event missing its record channels in shape (b)) ⇒ the
leg FAILS with MEASURED evidence (reported, blocks per constraint — the
§8.8 hard-seam discipline).

### 11.10 Acceptance-evidence map (closeout trace)

Every ticket AC (#1–#6) mapped to its named evidence at this rung, so a
reader (or the QG session) verifies completeness without re-deriving it:

- **#1 — parent calls callee with the session param; inline `Outcome`; parent
  continues.** `compose-same-session-demo.test.ts` **C2** (full happy path —
  the exact five-event sequence on the ONE shared handle; construction-bag +
  reference-identity pins; inline settled `CapabilityResult`; zero demo-side
  writes) + the live QG leg (§11.9).
- **#2 — mid-span gating (settled by D2: frame governance now, per-write
  blocking later).** **A1** (callee-isolation + structural resume); the
  blocking half is the §11.7 slot-10 boundary — NO machinery shipped.
- **#3 — shared variables both directions.** **A2** (VAR-FREE store identity
  over the single instance — sharing holds by construction under D1).
- **#4 — contract violation rejected before execution.** **A3** ×3 variants
  (typed `ContractViolationError` capture at the await; callee body never ran;
  zero span stamp).
- **#5 — transcript shows both capabilities' segment markers in call order.**
  **C2** interleaving pins (once-per-span counts) + the `base.test.ts`
  present-branch span-stamp matrix (exactly-one-per-run, log-order precedence,
  floor/multi-run no-further-stamps, second-`run()` fresh span, zero-phase
  bare header, violating-run zero side effects, row-2 ABSENCE uniformity) +
  the `research.test.ts` stamp-evidence row + the live QG-leg ordering
  expectation (§11.9).
- **#6 — nested same-session calls complete with correct frame restoration.**
  NOT exercised at this rung — the hermetic three-instance nesting was dropped
  during planning (synthetic doubles exercise no shipped code path; no real
  nested capability exists yet). Named as a boundary; re-proven when the first
  real nested capability lands. Section-header scoping makes nesting read
  naturally in transcripts — the scheme requires no per-nesting-level
  machinery.

The fault-forwarding families ground the §11.1/§11.6 forwarding claims:
**C3** ×2 (verbatim child-fault), **C4** ×2 (malformed-success fixed
sentence), **C5** ×2 (settle-time conversion fault).

## 12. Permission layers and the write gate

Material: `pio/src/capability/guards/write-gate.ts` (the stateless
predicate - `decideWrite`, the re-exported `matchesAnchoredGlob`,
`WriteGateVerdict`, and the module-private pinned line shapes - the
universal no-permission tail constant and the phase-line renderer - whose
bytes the suite goldens mirror byte-for-byte) · `pio/src/session-execution-state.ts`
(the dedicated per-session execution state at package TOP LEVEL, sibling of
`session.ts` - LIFO span layers, the scalar phase slot, the owned anchor
channels, fresh-per-call `snapshot()`) ·
`pio/src/capability/guards/guard-vocabulary.ts` (the shared decision
vocabulary - `CapabilitySources`, `PhasePermission`, `PathAnchors`; types
only, imports nothing) · `pio/src/sandbox/string-match-helpers.ts` (the
anchored-glob matcher DIALECT HOME behind the `write-gate.ts` re-export) ·
`pio/src/capability/pio-session.ts` (`PhaseOptions.write` plus
`PhaseOptions.allowProjectWrites` plus the phase-only
`PhaseOptions.tmpDirAllowed` - the phase's THREE declared permission
dimensions, fed verbatim at phase start and detached on every exit cause) ·
`pio/src/session.ts` (the interceptor runner - the write tool-call handler
closure threaded through the construction seam, consulting a FRESH snapshot
per call and returning the structural `{ block: true, reason }` shape the
SDK's `ToolCallEventResult` accepts) · `pio/src/capability/base.ts` (the
span window in BOTH `run()` branches - session-present: enter strictly
post-validation at the stamp site; row-2: enter strictly
post-adoption/pre-body in the hop body over the adopted host; exit at
settlement on success AND the catch-all in both; `CapabilityEnvError`, the
loud env-root failure) ·
`pio/src/capabilities/guards-demo.ts` (the standing LIVE demonstration -
six PLAIN-PHASE gate probes under ONE span: the same-target contrasts -
workspace pair and scratch pair - plus the declared-scratch probe and its
silent-window refusal twin included) +
its colocated suite (the first home of the denial-line goldens, the mid-pass
real-predicate consults, and the module-driven shape rows).

### 12.1 Unified declaration doctrine

Permission derives from EXACTLY TWO declared sources: the ACTIVE
CAPABILITY'S CONTRACT and the ACTIVE PHASE'S DECLARATION. The phase
declaration carries THREE DIMENSIONS - concrete PATHS (the `write` bag),
the project-files SCOPE flag (`allowProjectWrites`), and the phase-only
SCRATCH flag (`tmpDirAllowed`). Paths AND the scope flag are CLAMPED by the
running capability's contract flag AT DECISION TIME: a phase admits the
workspace-cwd scope only while the phase declares the flag AND the contract
flag is true. Unbacked flags and uncovered paths are INVISIBLE - never
granted, never listed: an over-declared, contract-uncovered path disappears
from the effective allowlist at the decision point, and a flag with no
contract backing confers NOTHING (the refusal reads byte-identically to the
no-phase reading - the universal no-permission byte - the suite's pure
plain-data unbacked-flag fixture row pins the clamp at the source). The
scratch dimension has NO contract-side counterpart (single-flag doctrine -
there is nothing to clamp). Mandated corollary: the SPAN SITE ADMITS
NOTHING - phase confirmation is the SOLE admitting authority for
contract-covered files. And the HONEST-LISTING RULE: listings show the
MOMENT'S effective set - never raw contract patterns, never what is
refused.

### 12.2 Empty-contract corollary

Nothing in the contract ⇒ nothing allowed: TOTAL DEFAULT-DENY, genuinely
total. A capability with EMPTY `writes` and NO scope flag admits no slot or
project-scope write ANYWHERE - the only grant that can exist under such a
span is a phase-DECLARED scratch declaration, which lives in the PHASE, not
in the contract. A DEPTH-0 turn (no capability span at all) runs the
IDENTICAL code path - null sources COALESCE onto the empty base inside the
predicate, one code path, no special cases; depth-0, no-phase, and
flag-less silent windows refuse EVERYTHING including scratch. The refusal
never "switches" between tail lines: EVERY non-governing window emits the
SINGLE universal no-permission byte, span-present and span-absent readings
byte-identical - the depth-0 uniformity is pinned by the no-span golden and
its convergence companions.

### 12.3 Singular enforcement at decision time

ONE effective allowlist materializes FRESH at EVERY tool-call decision - no
cached set, no attach-time confirmation, no second judgment site. The
singular effective-set formula is `(declared ∩ contract-covered) ∪
(phaseFlag ∧ contractFlag ⇒ cwd-scope class) ∪ (phase.tmpDirAllowed ⇒ /tmp/
prefix class)`, recomputed per call. Phase declarations are RECORDED
VERBATIM at attach (raw resolved paths plus the raw scope and scratch flags,
zero-copy trust boundary) and JUDGED at DECISION TIME - lazy by the standing
owner requirement that a phase's write declarations EXIST in the running
capability contract. An EMPTY effective construction confers NO phase
governance: the NON-ADMITTING TAIL refuses with the universal no-permission
byte (span admission RETIRED - the span supplies the filter-site clamp
ceiling and the scope-class second flag ONLY; one code path - a fully-
uncovered phase and an unbacked flag-only phase are judged exactly as if no
phase were attached). The newly-refused corners, each with its live
demonstration: SILENT or INERT phases under ANY contract - flag-true or
flag-false alike (the reshaped `project-file-not-allowed` probe refuses the
SAME workspace target the flag-declaring `project-file` probe admits, and
the declare-nothing `deny` probe refuses its contract-covered stray alike -
hermetic twin: the module-driven inverted `inherited` row) and UNDECLARED
scratch at EVERY depth (the redefined `tmp-parity` probe DECLARES the flag
for its GRANTED-scratch pass, while the undeclared-window contrast over the
SAME real pinned path is pinned suite-side - hermetic twins: the module-
driven scratch-class rows).

### 12.4 The two-component shape (shipped homes)

The gate is TWO components plus a shared vocabulary - never a monolith:

- THE PDP (policy decision point) - the STATELESS PREDICATE
  `pio/src/capability/guards/write-gate.ts`. `decideWrite(snapshot,
  toolName, input)` answers ONE tool call over GIVEN plain values; it stores
  nothing, owns no lifecycle, reads no env or disk (channel-free by
  construction). Coverage is EXACTLY `write`/`edit` via string `input.path`;
  bash stays UNGATED (ungated by silence - any other tool yields no target:
  no consultation, no side effect). Verdict order, pinned, one pass per
  target: extract the target, then the active phase's EFFECTIVE construction
  governs EXCLUSIVELY while it is non-empty (surviving paths plus the scope
  class plus the scratch class, all judged at decision time), then deny - the
  SPAN SITE is documented as NON-ADMITTING (it supplies the clamp ceiling and
  the scope-class second flag ONLY; its name renders in NO refusal; the
  layer's name rides the transcript's durable span-marker channel).
- THE RECORDER - the DEDICATED PER-SESSION EXECUTION STATE at
  `pio/src/session-execution-state.ts` (package TOP LEVEL, sibling of
  `session.ts`): records WHAT IS EXECUTING RIGHT NOW (the LIFO capability
  SPAN layers plus the one executing phase in the top layer's SCALAR slot),
  owns the session's PATH CHANNELS exclusively, and supplies fresh
  `snapshot()` readings - both closures resolve FRESH on every call, nothing
  past this module ever sees a closure.
- THE SHARED VOCABULARY - `pio/src/capability/guards/guard-vocabulary.ts`
  (types only, imports nothing): `CapabilitySources` (the running
  capability's contract values as-is), `PhasePermission` (the phase's FULL
  RECORD verbatim - paths plus the scope and scratch flags), `PathAnchors`
  (plain resolved strings, session-invariant).
- THE MATCHER DIALECT HOME - `matchesAnchoredGlob` lives in
  `pio/src/sandbox/string-match-helpers.ts` and is RE-EXPORTED by
  `write-gate.ts`, so the gate's boundary stays name-stable. Out-of-dialect
  pattern text FAILS CLOSED (no match, never throws); wildcard-free,
  brace-free segments compare by SEGMENT-WISE STRING EQUALITY - the literal
  fast path (a dialect PROPERTY; pattern coverage feeds the decision-time
  filter ONLY, never any span-site admission).

PEP framing: the INTERCEPTOR RUNNER is the PEP (policy enforcement point) -
`pio/src/session.ts`, the write tool-call handler closure consulted PER CALL
over a FRESH snapshot; the stateless predicate above is the PDP (policy
decision point); and the execution state is the RECORDER - the PIP (policy
information point), supplying the plain facts the PDP judges. The REJECTED-ALTERNATIVES record stands: subscribe
listeners CANNOT BLOCK a tool call (observation plane only - verdicts need a
tool-call interception point); customTools overrides CHANGE ROSTER IDENTITY
(foreign shadowing of the platform's own write/edit tools defeats the
roster-level guarantees); the PROCESS-GLOBAL SINGLETON carried the eliminated
clobbering hazard (two capabilities' spans interleaving on one object - the
per-session state removes it by construction); and out-of-PROJECT-ROOT writes
are DENIED at every layer rather than legacy fall-through allowed - an
ACCEPTED DIVERGENCE from the root-tree behavior, named here as settled
policy, not an accident.

### 12.5 Layer vocabulary

Capability SPANS stack LIFO with SUSPEND/RESTORE semantics: the outer layer
suspends (never destroys) and GOVERNS AGAIN once the inner pops - mandatory
for row-1 nesting (§11) AND carried by the row-2 composed frames (§8), whose
hop body BRACKETS the callee's span over the shared stack discovered by the
adopted host (`base.ts` `run()` row-2 branch - enter strictly
post-adoption/pre-body through the adopted host's `enterCapability`, exit at
settlement on success AND the catch-all through `exitCapability`; no-op-safe
over stateless instances). On EITHER placement the RUNNING CALLEE governs
EXCLUSIVELY for its span and the parent suspends behind it, resuming
governing when the callee's span pops (the COMPOSE DEMOS remain the standing
living proof of the nesting story, §11; the guards-demo transcript shows
EXACTLY ONE span marker - the vehicle composes no nested span).
The PHASE is a SCALAR SLOT holding the RAW declaration - the FULL RECORD
stored VERBATIM (paths plus the scope and scratch flags), judged ONLY at
decision time; attaching while a phase is already attached OVERWRITES
(last-wins), and detach runs on EVERY exit cause.
"FRAME" stays RESERVED for composed-execution units (§8); the stack entries
are LAYERS.

### 12.6 Durable-shape standard (validated, not retrofitted)

Parents declare `writes: []` and let children SELF-DECLARE; orchestrators
declare ONLY THEIR OWN artifacts - and now: orchestrator PHASES wanting the
cwd scope DECLARE THE FLAG. Cite the shipped shapes: `research` (slot-
pattern `writes`, no scope flag - the patterns-only reader),
`compose-same-session-demo` and `compose-new-session-demo` (`writes: []`
value passthroughs - the empty-contract readers), and `guards-demo` (the
demo pattern PLUS the scope flag TRUE, exercised by its flag-declaring
`project-file` phase and REFUSED at its flag-less SILENT `project-file-
not-allowed` phase - the exact case the ruling retired, demonstrated live).
Listings follow the MOMENT-SET DOCTRINE: the universal no-permission byte
where no phase governs (listing nothing, naming nothing); phase lines list
RESOLVED survivors plus the scope element iff the class is active plus the
scratch element iff the flag is active. RAW CONTRACT PATTERNS appear in NO
listing - do NOT normalize either direction.

### 12.7 The phase-declared scratch class

Scratch (/tmp/) admission is NOT AMBIENT at any depth: the EXACT PREFIX
`/tmp/` is admitted ONLY while the ACTIVE PHASE declares `tmpDirAllowed:
true` - a SINGLE phase flag with NO contract-side counterpart (scratch is
private to the phase - the v1 `Contract` shape is byte-untouched). Depth-0,
no-span, and flag-less silent/inert windows REFUSE scratch (total
default-deny, genuinely total). On the phase line the SCRATCH ELEMENT is
APPENDED LAST - after the scope element, whenever the flag is active (same
sentence shape as the scope element: `scratch files under /tmp/`). The
VEHICLE'S STANDING LIVE DEMONSTRATION is the same-target scratch PAIR:
`tmp-parity` (scratch ADMITTED by the phase-declared flag) AND
`tmp-negative` (the SAME target REFUSED on the universal byte by the silent
window that declares NOTHING - the SCRATCH-FLAG INVERSION demonstrated LIVE
in BOTH directions; previously the refused direction existed only
hermetically and as wording inside `tmp-parity`'s template). The hermetic
twins remain cited at their tiers. SCRATCH-RESIDUE DOCTRINE: the end-of-run
scratch state is ABSENT BY DESIGN (the `tmp-negative` probe's pre-phase
sweep removes the admitted residue WITHIN the run; unique pinned basename,
error-swallowed pre-phase SWEEPS self-heal across runs; the capability
performs NO disk checks; suite-side post-run readings land ABSENT).

### 12.8 Structural denial facts

Out-of-project-root writes are DENIED at EVERY LAYER: slot anchoring is
STRICT (a slot-relative target outside the slot root never matches even when
the suffix textually fits; `target === root` itself is no match), and the
workspace scope is STRICTLY UNDER the launch cwd (the cwd ITSELF is not
admitted). ROOT-MISSING is STRUCTURALLY UNREACHABLE as a silent path: the
env-root channel is VERIFIED PRE-EVERYTHING by the loud typed failure
(`CapabilityEnvError` in `pio/src/capability/base.ts` - `PI_CODING_AGENT_DIR`
unset or malformed escapes with ZERO prompts), and a faulty anchor channel
FAULTS LOUDLY at snapshot time (fresh resolution, first fault escapes
verbatim) instead of denying by mistake.

Refusals RETURN EXACTLY TWO line shapes system-wide: the PHASE line (named
by the phase id, listing the MOMENT'S effective set - surviving paths in
declaration order, then the scope element while the class is active, then
the scratch element while the flag is active) and the UNIVERSAL NO-
PERMISSION BYTE (ONE parameter-free pinned constant emitted for EVERY
non-governing window regardless of span presence). The capability-named and
no-span shapes are RETIRED by the merge ruling (post-retirement both stated
the SAME permission state - "nothing is permitted"; the capability NAME is
metadata the transcript's durable span markers already carry - the refusal
line names the governing STATE, the marker channel names the LAYER); and the
uniform `/tmp/` closing clause dies with the total principle (it was false
wherever scratch is refused).

### 12.9 Documented boundary: foreign-runtime hosts

`PioSession.fromRuntime` hosting an UNSTAMPED FOREIGN HANDLE discovers NO
execution state - every gate operation NO-OPS CLEANLY on such instances
(mount BACKSTOP: compositions mounted outside pio's construction seam run
UNGATED BY CONSTRUCTION). This is DOCUMENTED, not silently patched: the
gate's producer wiring rides the `create`-seam symbol stamp (plus the
guard-install threading), and a foreign mount neither claims nor can claim
that stamp - the no-op behavior IS the boundary.

### 12.10 No-refusal-cycle property

The governing laws: NO ADAPTIVE DENIAL CYCLE - a refusal NEVER mutates any
permission state; every permission fact is fixed at span entry and phase
attach. TOTAL PRINCIPLES - contract-EMPTY spans grant NOTHING beyond what
phases declare; scratch is granted ONLY by the declaring phase itself. The
SILENT-PHASE LIVE CONTRAST stands beside the scope contrast above: the SAME
target refused on the universal byte INSIDE its own flag-true span is the
confirmation principle made visible at the source. Demanded ⊆ declared =
GRANTED: because the gate judges the EFFECTIVE set (demand intersected with
declaration), a demand for something the phase legitimately declares can never
loop on REFUSAL - `guards-demo`'s probes keep their demands aligned with
their declarations: the silent `project-file-not-allowed` probe and the
REFUSAL-ONLY `deny` probe DEMAND nothing of their own (both declare NOTHING -
the former attempts one workspace write it expects to be rejected; the latter
performs ONLY the refused attempt on the stray, containing no write of any
kind, so its single settled run ends exactly as instructed; the silent
`tmp-negative` probe declares NOTHING likewise and its single settled run
ends as instructed), while the EXPECTATION-GATE corrective re-run (which
demands EXACTLY the declared file) converges. The gate is a SYNCHRONOUS PER-CALL INTERCEPT, NOT A LOOP: the
denial line is the ONLY feedback, and denials converge on INFORMATION within
the model's OWN turn (the model reads the reason, adapts the plan, finishes
the turn). From this step forward, ANY live `pio run guards-demo`
engagement IS the standing end-to-end demonstration: expectation guard plus
all six PLAIN-PHASE gate probes in one run.

## 13. Command-write fence: Landlock over phase-invoked bash

Material: `pio/src/tools/bash/landlock-bash.ts` (the fenced bash instance —
`createLandlockBash` + `createLandlockBashOperations`, the PROBE-ONCE latch,
the uniform-band settlement, and the module-pinned `STANDING_NOTE_TEMPLATE`
— the family's SOLE new voice artifact) · `pio/src/tools/bash/landlock-ruleset.ts`
(the pure snapshot-to-ruleset materializer — `composeKernelWritableSet`, the
`LANDLOCK_FAULT_CODES` / `LANDLOCK_FAULT_BAND` vocabulary, `classifyLandlockExit`,
the `renderMechanismRefusal` refusal family, `parseProbeReport`, and the
`checkLandlockHelper` resolver/classify) · `pio/vendor/landlock-helper/` (the
self-authored statically-linked C carrier — argv protocol, fault-code table,
ABI-8 exact-identity pin, committed x86_64 static prebuild) ·
`pio/src/capability/pio-session.ts` (the UNCONDITIONAL single-entry
`customTools` threading at the `create` seam, beside the `guardInstall` stamp)
· `pio/src/capabilities/guards-demo.ts` (the standing quality-gate LIVE
vehicle — the bash probe family under the same single span) + its colocated
suite · cross-referenced homes: `pio/src/session-execution-state.ts` (the
shared per-session execution state and its fresh `snapshot()` channel) and the
§12 layer-vocabulary homes (`write-gate.ts`, `session.ts`, and the
`guards-demo.ts` write-tool probe family).

This section documents ALREADY-SHIPPED machinery: every mechanism below is
live in the source at HEAD, and **NO NEW CAPABILITY IS REGISTERED** — the
loader table (`pio/src/capability/loader.ts` `CAPABILITY_TABLE`) and the CLI
`--help` listing are UNCHANGED by the fence, so registry sweeps find nothing
to register. It corrects the guide for the shipped command-write surface: §12
chartered the agent-hook write gate over `write`/`edit` (the interceptor path,
§12.4); the command fence is its SIBLING mechanism by doctrine — the kernel
adjudicates phase-invoked `bash` at hook time, and the tool renders only
(single refusal site, §13.6). The two mechanisms share the write gate's layer
vocabulary term-for-term — declaration IS permission, the innermost ACTIVE
layer governs exclusively, phases narrow, never widen (§12.1, §12.3) — and the
fence composes from the SAME effective construction the live gate judges,
recomputed FRESH at every spawn over the shared execution state's
`materializeEffectiveSet` core (`pio/src/permission-mechanics.ts`; no
cached set, no second judgment site, §12.3).

### 13.1 Enforcement model: one fresh kernel frame per spawn

Per INVOCATION, not per session: each fenced `bash` invocation builds a NEW
kernel ruleset from the live execution state and applies it over its WHOLE
PROCESS TREE before the command starts. The pre-spawn sequence in
`landlock-bash.ts` is: fresh `executionState.snapshot()` consult over the
shared state held BY REFERENCE (the very same `ExecutionSnapshot` record the
write gate consumes — `pio/src/session-execution-state.ts`; no per-guard fork,
nothing cached) → static `checkLandlockHelper` classify →
`composeKernelWritableSet(snapshot)` → the PROBE-ONCE applicability proof →
shell-config resolution and serialized carrier invocation → delegated spawn
(§13.5). Declaration IS the permission carried into the frame: the composer's
input is the MOMENT'S effective allowlist — the innermost active layer's
declaration clamped by the running capability's contract — so the fence rides
the gate's unified doctrine unchanged (§12.1): phases narrow, never widen, and
a flag-less SILENT window degrades to the minimum fence. The WHOLE PROCESS
TREE inherits enforcement: the carrier restricts self BEFORE `execve`
(`prctl(PR_SET_NO_NEW_PRIVS, 1)` → `landlock_restrict_self` → `execve`,
`landlock-helper.c`), so shell → interpreter → make children all ride the same
frame; the complete mutation-right vocabulary INCLUDING `REFER` (the
rename/move/link/symlink escape hatch) ships pinned as mask `0x7FF2` (vendor
README mutation-word record, asserted in the C and mirrored lockstep by the
suite). The AGENT/SESSION PROCESS STAYS UNRESTRICTED: the ratchet is ONE-WAY
AND SELF-SCOPING (README safety note — rights can only shrink, once, for the
restricted process and its descendants), restricted lineages are short leaves
born inside one stable frame, and the long-lived host keeps serving later
frames and transcripts unrestricted — fences never STACK on it. Scope is
PREEMPTIVE-ONLY with respect to the real environment: off-list writes die
EPERM at ATTEMPT TIME against the bubble environment, and no post-hoc/
detective regime forms part of the guarantee (recorded constraint,
`.pio/issues/bash-command-write-gating.md` owner constraints).

### 13.2 Concrete-only allowlists: what the kernel sees, and the two documented divergences

Open patterns (`research/*.md`) are NOT expressible as kernel rules.
`composeKernelWritableSet` applies a STRICTLY-CONCRETE filter — absolute, free
of ALL SIX matcher-dialect metacharacters `* ? [ ] { }` — over the
COVERAGE-FILTERED SURVIVORS of the moment's effective construction: uncovered
declarations are KERNEL-INVISIBLE, INCLUDING DIRECTORIES (a directory
declaration rides the kernel vector only if it matches a contract write
pattern), and wildcard entries contribute NOTHING to the kernel set while still
appearing in the write gate's listings — DIVERGENCE 1, listed-but-not-granted
(the gate's moment-set listings name what the model sees, §12.6; the kernel
set names what the kernel grants). Assembly order is pinned: declared concrete
survivors → `/dev` (the ALWAYS-present machinery allowance — ubiquitous
`/dev/null` writes under the bubble's fresh `--dev` mount) → `/tmp` (iff the
effective scratch proposition holds) → `workspaceCwd` (iff the dual project
flags agree), with global first-occurrence dedupe; the MINIMUM fence over ANY
window is exactly `["/dev"]` — never an empty vector. DIVERGENCE 2: a
declared DIRECTORY grants its WHOLE SUBTREE under the carrier's PATH_BENEATH
rule (vendor README x86_64 record: `PATH_BENEATH = 1`) while the write gate
admits the EXACT declared path only — the anchored-glob dialect matches the
declared token, not the descent below it (§12.4). Authoring guidance for the
dominant case (the corrected truth, not any earlier plan text): declare the
CONTAINING DIRECTORY when commands create artifacts. A FILE-LEAF declaration
is refused PRE-CHILD with the add-rule-failure machinery fault (code 102):
the carrier opens every `--write` entry `O_PATH | O_CLOEXEC | O_DIRECTORY`
(`landlock-helper.c`), and a regular file faults there before any child exists
— this corrects any earlier reading that a concrete artifact FILE leaf is the
normal declaration shape. The mkdir corner follows from the strict grants:
there is NO implicit ancestor promotion, so when a command must CREATE an
artifact whose enclosing directories do not yet exist, declare the nearest
existing ancestor (or the topmost created directory) in the phase `write` bag
as well. The demo-local `.md`-directory device is deliberately kept OUT of
this general guidance — its disclosure lives in §13.8, where it is named for
what it is: an artifact of the demo's own coverage-pattern intersection, not
practice.

### 13.3 The scratch class: /tmp exact-prefix only

The fence's scratch class is EXACT-PREFIX ONLY: `/tmp` enters the kernel
writable set iff the active phase's scratch proposition is effective — the
same single-flag doctrine with NO contract-side counterpart the gate enforces
(§12.7). This is coherent with the write gate's NEGATIVE-SCRATCH direction:
stray tmp-scratch writes in SILENT out-of-span windows are refused by BOTH
mechanisms — the gate renders its universal no-permission byte over
`write`/`edit`, and the kernel denies the command's attempt at hook time with
the standing note appended (§13.6). The bubble's `/tmp` is a FRESH tmpfs mount
(the profile renderer's base flags carry `--tmpfs /tmp` beside `--dev /dev`,
`pio/src/sandbox/render.ts`), so end-of-run scratch state is ABSENT BY
DESIGN: whatever a scratch-admitting phase wrote there dies with the bubble,
and the standing demonstration's sweeps additionally remove admitted residue
WITHIN the run and self-heal cross-run leftovers (§13.8 hygiene).

### 13.4 Long-lived writers: accept-and-document

Stance: ACCEPT AND DOCUMENT. A background writer spawned under a fence
FREEZES at its spawn-frame until death — a RUNNING lineage CANNOT be
re-restricted (the ratchet is one-way: restriction only ever shrinks rights,
once, for the process and its descendants — README safety note), and there is
NO kill-on-frame-pop: when the governing frame pops, the writer keeps its
frozen spawn-frame rights until it exits on its own. Exposure is capped by
BUBBLE TEARDOWN — the namespace's lifetime bounds how long any frozen writer
can act. Authoring guidance: capabilities do NOT spawn persistent writers via
`bash`; a genuine need for a background writer is a design conversation, not a
fence tuning — the v1 fence ships no knob to extend a frozen frame.

### 13.5 Fail-closed posture: machinery faults, PROBE-ONCE, and unsupported hosts

Fail-closed is the SOUNDNESS NON-NEGOTIABLE: every machinery fault class maps
to a TYPED COMMAND REFUSAL thrown BEFORE any child exists — NEVER an unfenced
execution (`landlock-bash.ts` header doctrine: every machinery fault maps to a
typed refusal thrown pre-child, never an unfenced run). The single-source
fault-code vocabulary (`landlock-ruleset.ts`) pins the five machinery codes,
quoted verbatim from `LANDLOCK_FAULT_CODES`:

`malformedSpec: 100`, `abiMissingOrBlocked: 101`, `addRuleFailure: 102`,
`restrictSelfFailure: 103`, `execveFailure: 104`

over the reserved band `LANDLOCK_FAULT_BAND` = `[100, 199]` (codes 105..199
stay reserved and classify as the explicit `band-reserved` conservative
reading). Every code is issued strictly PRE-EXECEVE by construction, so an
in-band completed exit interprets CONSERVATIVELY as a machinery fault —
enforcement was active throughout; only the refusal text could mislabel the
cause. The ABI pin is **8** with an EXACT-IDENTITY lock: the probe verdict is
strict (`status=ok` ⇔ discovered == pin) and BOTH directions refuse as fault
101 — below-pin (capability gap) and above-pin alike (unmeasured
forward-compatibility claims do not cross the security boundary; README
discovery policy). Settlement semantics (shipped): IN-BAND completed exits
(post-spawn 100–199) THROW the rendered mechanism refusal under the uniform
conservative band rule; OUT-OF-BAND exits RESOLVE normally; a NULL exit
resolves `{ exitCode: null }` and formats SUCCESS-SHAPED (builtin parity),
with timeout/abort/cwd error shapes preserved byte-for-byte.

Why a probe exists at all: Landlock exposes NO simulation/dry-run mode —
enforcement surfaces only as hook-time denials — so "will THIS spawn stay
enforceable?" is unanswerable without running; the throwaway `--probe`
applicability check is the ONLY non-committing dynamic evaluation available.
It applies the restriction sequence over a trivial zero-rule ruleset WITHOUT
execve, and it is NEVER applied to the long-lived agent process — the ratchet
is one-way (README probe-mode record). Applicability probing is PROBE-ONCE
(the shipped ruling, supersedes the older per-spawn text): the proof is LAZY
and CACHED PER FENCED INSTANCE — a PASS latches closure-scoped on the ops
instance (the `probePassed` latch inside `createLandlockBashOperations`; later
invocations skip the fork entirely, zero extra spawns), and a FAILED verdict
is NEVER latched — each subsequent invocation retries the probe pre-child and
refuses until it passes (self-heals on environment recovery; no invalidation
hooks owed, because the proven property — kernel Landlock usable ∧ ABI
exact-identity — is independent of execution state). Per probe the carrier
prints exactly one pinned report line, quoted verbatim (vendor README /
`emit_probe_line` in `landlock-helper.c`):

`landlock-helper probe abi=<DISCOVERED_MAX|0> pin=<PINNED_ABI> status=<ok|fail>`

TOCTOU note (shrunk form): the soundness predicate is authoritative AT THE
SPAWN SITE — state can shift between probe and spawn; the state-dependent
parts (paths, writable set) flow per spawn through the composer, and the
uniform in-band rule absorbs hypothetical mid-frame machinery faults at
settlement (they surface as the typed refusal instead of pre-child).
Unsupported hosts: the Landlock kernel floor (ABI support since 5.13; the
pinned ABI-8 mutation vocabulary requires a newer host) is an EXPLICIT HOST
REQUIREMENT, not an incidental property. On an unprovisioned host the
observable shapes are: the fault-101 typed refusal lines on every fenced
invocation (nothing runs unfenced — the `probe-refused` /
`abi-missing-or-blocked` family, §13.6); the positive-enforcement suite rows
SKIPPING WITH SURFACED REASON while the classification and fault-class rows
STILL HOLD (the carrier's hermetic syscall suite degrades honestly,
`pio/src/tools/bash/landlock-helper.test.ts`); and the failed-probe
self-healing retry keeping the door open — a recovered environment passes its
next probe and the fence resumes. Never a silent unfenced fallback.

### 13.6 Single-refusal-site doctrine and the standing restriction note

This section's organizing doctrine is the settled three-layer voice channel for
command-write denials (owner-committed 2026-10-08): LAYER 1 — kernel enforcement
(unchanged, complete, attempt-time — the §13.1 model holds in every scenario the
settlement introduced); LAYER 2 — the proleptic phase-permission disclosure (the
up-front preventive listing folded into EVERY phase prompt); LAYER 3 — the retained
standing note (documented below, exactly as shipped). The single-refusal-site
doctrine STANDS beside the channel: adjudication is the KERNEL's, the
`renderMechanismRefusal` ELEVEN-LINE FAMILY remains the SOLE machinery-refusal
voice, and the write/edit gate's decision-time refusal is EXPLICITLY PRESERVED —
owner confirmation recorded: "better to leave the write tool message, as it's working well".

PHASE-PERMISSION DISCLOSURE (LAYER 2 — what lands in the transcript). Every
`execute_phase` prompt ENDS with a curated listing of what THIS PHASE may write —
unconditional (silent phases included), placed after the marker line and any
instructions, so it rides EVERY observed run of the phase, corrective
expectation-guard re-runs included. ONE line per present entry, minimal message,
zero terminators, no trailing newline:

```
—— phase permissions ——
/abs/path/declared-a.md, /abs/path/declared-b.md
project files at /abs/workspace/cwd
scratch files at /tmp
```

- The delimiter line — ALWAYS present; a phase declaring NOTHING renders this line
  ALONE (no `none` placeholder; silence is not a fault).
- The FILES line — the phase's surviving declared paths VERBATIM, comma-joined
  (declaration order, first-occurrence dedupe; unsupported shapes ride along raw,
  unfiltered), present iff at least one path qualifies. Pattern tokens ride along:
  this line is what TOOLS see.
- The class lines — `project files at <absolute workspace cwd>` iff the scope class
  is decision-time active; `scratch files at /tmp` iff the scratch flag is active.
  Byte owner for traceability: `renderPhasePermissionDisclosure`
  (`pio/src/capability/pio-session.ts`).

READING THE TWO CHANNELS APART. The disclosure lists the DECLARED set at phase
start; the note lists the CONCRETE kernel set the specific spawn rode. Such a
negative-phase transcript can carry the two listings side by side — the
disclosure's DECLARED-set listing up front and the note's CONCRETE-KERNEL-set
listing on failure — DIFFERENT PROJECTIONS of the same moment (strictly-concrete
survivors only; `/dev` absent; `under`-worded class elements; universal `none` on
the note side — §13.2 divergences: patterns listed-but-not-granted, a declared
directory granting its WHOLE SUBTREE to commands while the gate admits the exact
path only; divergence annotations themselves stay OUT OF THE TRANSCRIPT —
docs-only). Both channels are ADVISORY context: the kernel enforces at ATTEMPT
TIME regardless, so the deviated-attempt corner — the model ignoring the listed
context — still dies at attempt time, correctly noted IF the exit is non-zero and
correctly NOT on exit 0, with enforcement UNAFFECTED.

Bash adds NO `GuardHandler` member: the handler list threaded at the
construction seam remains EXACTLY `[writeToolCallHandler]` (`pio/src/capability/pio-session.ts`
— `guardInstall: { executionState, handlers: [writeToolCallHandler] }`; the
`GuardHandler` type and the interceptor runner live in `pio/src/session.ts`).
Adjudication of command writes is the KERNEL'S — the fence applies and the
kernel denies at hook time — and the optional CONSULT-TIME MIRROR (a second
judgment site over the command's predicted writes) was evaluated and DECLINED,
so the single refusal site stands. Voice: denials render from the SHARED byte
family. The `renderMechanismRefusal` ELEVEN-LINE FAMILY (`landlock-ruleset.ts`)
is the SOLE machinery-refusal voice — one owner of all its bytes, one escaped
em dash per line, one physical line, a trailing period, measured details in
parentheses; every line carries the fixed head `Command execution refused —`
and ten of the eleven close on the shared `refusing to run unfenced` clause
(the conservative in-band reading closes with the enforcement-was-active-
throughout clause instead).

THE RETAINED STANDING NOTE (LAYER 3) — the material below stands exactly as shipped:

The fence family's SOLE new voice artifact is the
pinned standing-note template, quoted verbatim from `STANDING_NOTE_TEMPLATE`
(`landlock-bash.ts`) — the pinned constant ends in a trailing space after
`Allowed targets:` (one extra space sits before the closing backtick below so
the rendered span keeps exactly one; the listing joins the trailing period at
the render site):

`Note: a per-phase Landlock write restriction is in effect and denied writes surface as permission errors in the command's own output. Landlock may be blocking changes to certain files due to lack of permissions in the current phase. Allowed targets:  `

Standing-note mechanics (shipped, including the unconditional-framing
amendment): fires ONLY on resolved NON-ZERO out-of-band exits — exit 0 and
kill/abort/timeout paths carry NOTHING (those propagate the delegate's bare
contract bytes verbatim). The trigger is the delegated EXIT CODE ALONE — the
annotation is CONTENT-INDEPENDENT: no output-content consult anywhere in the
module. One framed append rides the SAME data channel strictly AFTER all raw
chunks (delegation sequencing makes this airtight): payload = unconditional
leading LF + the pinned template + the model-facing listing + `.` +
unconditional trailing LF. The UNCONDITIONAL framing buys two product-facing
corners, both accepted and pinned: a blank line between cleanly-ended output
and the note (the dominant failing-command case), and a phantom first line
when a printing-nothing command fails. Listing projection (the reading key
for transcripts): strictly-concrete survivors ride RAW; the ALWAYS-present
`/dev` machinery allowance is ABSENT from the model-facing listing by identity
classification (`renderAllowedTargetsClause` skips the class tokens), so a
SILENT window's empty remainder degrades to the universal `none` form —
byte-consistent with the no-permission shape: a silent window reads
`Allowed targets: none.`; `/tmp` names as `scratch files under /tmp/`; the
workspace cwd names as `project files under <cwd>`; elements join with `, `.
Fire/miss vocabulary (measured; replaces the retired marker-sniffing
attribution design): guaranteed-fire shapes under bash/sh (dash), python3
(`PermissionError: [Errno 13] Permission denied`), perl ($! strerror), and
coreutils cp/rm; measured MISS classes: node/bun/deno lowercase `EACCES:
permission denied`, java (`java.nio.file.AccessDeniedException`),
go/localized/custom-phrasing (open set). JS runtimes are the stack's dominant
programmatic-write surface, so text-sniffing attribution was systematically
blind exactly where it mattered most — which is why the shipped surface is
the content-independent note, not a sniffed attribution. Doctrine:
ENFORCEMENT-VS-ADVISORY — the kernel denial is COMPLETE and attempt-time (it
holds regardless of what the output says); any output-text channel is
ADVISORY-ONLY. Two documented mute corners stay SILENT in v1: the
masked-exit-0 case (a command that hides a failed write behind exit 0 carries
no note — the trigger is the exit code alone) and the pre-child window
(SIGNAL-BLIND before the spawn — no stream exists yet to annotate).

EXIT-0 CORNER — PARTIALLY REMEDIATED. By shipped doctrine the note stays SILENT
on masked-exit-0 — the trigger is the exit code alone (owner:
"we could also leave the exit 1 message") — and the readable context for such
invocations is the raw `Permission denied` diagnostic in the command's OWN output
PLUS the up-front disclosure (settlement record:
partially remediated). The exit-0 compound remains an ENFORCEMENT-LIVENESS probe
shape — provable by diagnostic + file-absence without any note; the pre-child
window corner is UNCHANGED.

SUPERSEDE NOTE (history of record). The pre-settlement plan had committed a
marker-evidence UNION TRIGGER for the note; it was superseded before shipping —
never shipped — because the up-front disclosure attacks the problem upstream of
action and dissolves the trigger-timing problem class (no stream tee, no
vocabulary table, no false-positive class). No trigger machinery exists in HEAD;
the revision's only shipped-module change is the disclosure itself, self-owned in
`pio-session.ts`. Under the additive-to-goal reading, deliverable 1(c) —
post-execution refusal-voice rendering — ships INTACT and `GOAL.md` is unamended.
Full verbatim chain: the goal-workspace decision logs
(`.pio/goals/command-write-fence/` — PLAN.md settled-voice-channel entry;
`S05/DECISIONS.md` P-A / P-B / P-C; `S08/SUMMARY.md` "Records annotations").

### 13.7 Both placement modes: composition tracks mechanically

Composition tracks AUTOMATICALLY: the fence bag is minted ONCE per
`PioSession` INSTANCE and held BY REFERENCE (`pio/src/capability/pio-session.ts`
builds the single `createLandlockBash(cwd, executionState)` instance over the
SAME execution state the guard install stamps), and the per-invocation FRESH
snapshot consult gives late binding across spans/phases/rebind — span or phase
churn between two consults flips the consulted snapshot over the SAME threaded
instance (the instance may persist while the frames it consults churn). A
CHILD'S fence tracks the CHILD'S frame, and the PARENT's own writes are
unaffected by a child's fence — each consult reads the state's innermost
active layer at its own moment. Row-1 (same-session composition, §11):
composed frames share the registry AND the shared state mechanically — the
stored-factory closure re-spreads `customTools` AND re-stamps the shared state
on EVERY handle re-creation, so a composed callee's phases consult the same
stamped state through the same threaded instance. Row-2 (terminal-takeover,
separate process, §8): the composed frame runs its OWN `create` ⇒ its own
frame AND its own fence. Every SHIPPED session carries the fence by
CONSTRUCTION — the threading is UNCONDITIONAL at the `create` seam (mirroring
the `guardInstall` threading; no placement adds wiring). Boundary, stated for
completeness: a FOREIGN un-stamped handle (the §12.9 case) carries neither
fence nor state and no-op gates — compositions mounted outside the
construction seam run ungated BY CONSTRUCTION.

### 13.8 guards-demo bash probe family: the standing quality-gate live vehicle

The LIVE demonstration rides the permanent `guards-demo` home
(`pio/src/capabilities/guards-demo.ts`, contract 0.5.0 — the SOLE
contract-literal difference vs the pre-family 0.4.0). The canonical
QUALITY-GATE SCENARIO ROW — replaced by the 2026-10-08 voice-channel settlement
(Step 9 acceptance criterion #5; the goal's `S09/DECISIONS.md` entry 5) and quoted
verbatim:

"Guards-demo bash chain — `pio run guards-demo`: the six write probes PLUS the bash probe family — each phase's disclosure block lists the correct per-frame writable set (none in silent windows; the granted directory in the allow window; scope/scratch classes flip between adjacent windows); the three negative probes' prescribed bare-invocation attempts die non-zero with the diagnostic + the trailing note (NONE listing); bash-deny additionally runs the exit-0 compound shape (diagnostic visible, note correctly silent, file NEVER LANDS in either shape); on-list artifacts land plainly — ok:true, exit 0"

Read the row's "(none in silent windows …)" phrasing PER THE SHIPPED FORM: a
silent window's disclosure block carries NO writable-target lines (the delimiter
line alone — the literal `none` belongs to the RETAINED NOTE's listing
exclusively). Hermetic nets stand unchanged in character; the live evidence is
the gate's standard provisioned-host leg (proof-layer ruling, not a plan-step
obligation). SUPERSEDED HISTORY — the pre-repin row, kept readable as the
pre-repin vehicle:

*"Guards-demo bash chain — `pio run guards-demo`: the six write probes PLUS the bash probe family — off-list command refusal with the standing note + kernel-set listing, on-list artifact landed, the scope/scratch pairs flip — ok:true, exit 0."*
Six phase ids in FIXED ORDER after the existing six write-tool probes and
before `summary`, under the SAME single span, each driving ONLY a `bash` tool
call (no write/edit usage; the ids above are the module's phase calls in
source order):

- `bash-deny` — the SILENT window (options exactly `{ instructions, min,
  max }`) over the SHARED stray target the write gate already REFUSED on the same
  path (the module reuses the write-tool deny probe's absolute stray verbatim):
  the agent attempts the target in TWO PRESCRIBED shapes, each exactly once in
  the SAME settled run. SHAPE 1 — the bare off-list redirect AS THE WHOLE COMMAND
  (a bare invocation such as `echo x > <target>`): non-zero exit, the command's
  own permission diagnostic, and the trailing note whose listing degrades to
  `none` (FULL VOICE, byte-exact as shipped). SHAPE 2 — the SAME redirect joined
  by a SEMICOLON with a trailing successful statement (such as `echo x >
  <target>; echo ok` — the failed redirection fails only its own statement, so
  the compound exits zero; `&&` would short-circuit on the refusal and defeat the
  liveness proof): diagnostic VISIBLE, exit 0, note CORRECTLY SILENT (the shipped
  corner), the file NEVER LANDS in EITHER shape. The expectation references the
  phase-permissions context CONCEPTUALLY ("names NO writable targets") and
  POSITION-NEUTRALLY (shipped placement is trailing). This IS the live
  OFF-LIST-REFUSAL leg AND the ENFORCEMENT-LIVENESS sub-case proving the original
  gate shape is closed enforcement-side.
- `bash-allow` — declares the artifact's CONTAINING DIRECTORY (options
  `{ instructions, min, max, write: [absDir, absArtifact] }`); the fenced
  command writes in TWO shapes (a plain shell redirection, then a program
  opening the path for write — coreutils-steered, interpreter-avoided); exit
  ok, file present, transcript CLEAN — no standing note, since neither
  command hits a denial (live ON-LIST-COMPLETION leg). At phase start, the
  admitting window's disclosure block NAMES the grant: its files line carries
  the very directory the artifact lands in. DISCLOSED DEVICE: the
  directory token `guards-demo/bash-allow.md` is a DIRECTORY whose basename
  satisfies the demo's OWN `guards-demo/*.md` coverage pattern — a DEMO-LOCAL
  pattern-intersection artifact, NOT general authoring guidance (the general
  truth lives in §13.2). The UNCOVERED inner artifact
  (`guards-demo/bash-allow.md/bash-allow-artifact.txt`) matches no contract
  pattern: it is KERNEL-INVISIBLE (it never survives coverage into the vector,
  so it can never fault a spawn — unlike a file-leaf survivor, which would die
  pre-child at the carrier's `O_DIRECTORY` open, §13.2) yet ARMS the engine
  settlement gate raw over the exact path the command must land. Break mode
  is FAIL-LOUD: a coverage-pattern edit that admitted the inner file leaf into
  the kernel vector would surface as the add-rule-failure machinery fault
  (code 102) as a typed pre-child refusal — never a silent misgrant (verified
  against `composeKernelWritableSet` + the carrier: the only route in is
  coverage-survivor + strictly-concrete, and the carrier's `O_DIRECTORY` open
  kills the file leaf).
- `bash-project-file` / `bash-project-file-not-allowed` — the PROJECT-FILES
  SCOPE pair over the SAME shared workspace-cwd target: ADMITTED under the
  flag-declaring phase (`allowProjectWrites: true` — the `workspaceCwd`
  class; SELF-CLEANING post-rm) and REFUSED by the flag-less SILENT phase
  INSIDE the demo's own flag-TRUE contract (the same silence the write-tool
  twin proves with the gate's universal byte, now proven with the kernel's
  denial — the standing note's listing reads `none`). Shape prescription (Step 9 repin): the negative template now carries
  EXACTLY ONE inserted sentence between imperative and expectation —
  `Issue the redirection AS THE WHOLE COMMAND (a bare invocation).` —
  guaranteeing the note-bearing tail rather than leaving it to the agent's
  trailing-statement habit (proven at the rejected gate); the rest of that
  pinned expectation stands (the SILENT window leaves the kernel set at the
  machine allowance — hence the `none` listing; the do-not-retry mandate; the
  adjacent-probe admission contrast). Disclosure fact: at phase start the
  admitting window's block NAMES the grant on its `project files at <workspace cwd>` class line.
- `bash-tmp-parity` / `bash-tmp-negative` — the SCRATCH pair over the SAME
  shared `/tmp` target: ADMITTED under the scratch-flag phase
  (`tmpDirAllowed: true`) and REFUSED by the SILENT window (the
  negative-scratch direction, live both ways; the `bash-tmp-negative`
  pre-phase sweep removes the admitted residue WITHIN the run). Shape prescription (Step 9 repin): the `bash-tmp-negative`
  template gains the same inserted sentence between imperative and expectation —
  `Issue the redirection AS THE WHOLE COMMAND (a bare invocation).` —
  guaranteeing the note-bearing tail for the same reason (the rejected gate
  proved the agent's trailing-statement habit); the rest of its pinned
  expectation stands (the SILENT window leaves the kernel set at the machine
  allowance — hence the `none` listing; the do-not-retry mandate; the
  adjacent-probe admission contrast). Disclosure fact: at phase start the
  scratch-flag window's block NAMES the grant on its `scratch files at /tmp` class line.

How to READ the transcripts: the fence's feedback channel is NOW the
three-layer trio (§13.6) — the up-front disclosure block at EVERY phase start
(both positive and negative windows), the command's own diagnostic on any
denial, and the trailing standing note on NON-ZERO exits only; on-list
completion produces NEITHER note NOR diagnostic. HOW TO READ A DISCLOSURE
BLOCK: the delimiter line ALONE is a silent window (nothing writable beyond
the invisible machine allowance); the files line lists the phase's surviving
declared paths; the `project files at …` / `scratch files at …` lines name
the active CLASSES.
The DOCUMENTED-DIVERGENCE readings appear live here: WILDCARD ENTRIES
LISTED-BUT-NOT-GRANTED (the demo's `guards-demo/*.md` pattern admits the
model-facing voice while contributing NOTHING to the kernel set — §13.2
divergence 1), and a DECLARED DIRECTORY GRANTING ITS WHOLE SUBTREE while the
gate admits the exact declared path only (§13.2 divergence 2 — a
`write`/`edit` demand beneath the declared directory would meet the gate's
token-only admission; the kernel grants the descent). LAYER TRACKING falls
out of the FIXED-ORDER alternating sequence: adjacent frames flip the verdict
over SAME-KIND targets with no session restart between frames, crossing the
TOOL/KERNEL boundary — the shared stray is refused by the GATE and by the
KERNEL over the same path, and the cwd and /tmp targets each play
admit/refuse quadruples (write-tool twin, then bash twin) — and the
SCOPE/SCRATCH flip readings now ALSO come from the ADJACENT DISCLOSURE BLOCKS
at phase starts: the admitting window's block NAMES the class, the silent
window's lists nothing, beside the note-bearing refused attempts, with no
session restart between frames. Hygiene facts:
the module's own pre-phase unlink-reset sweeps are error-swallowed WRITES
executing in the SESSION PROCESS — unfenced, since the ratchet is one-way and
the module's own unlink/mkdir never consult the kernel fence; end-of-run state
is /tmp scratch ABSENT BY DESIGN, the cwd target SELF-CLEANED (post-rm), and
the project slot KEEPS the `bash-allow` directory + inner artifact (the
admission showcase — the recursive reset self-heals across runs). Additive-
only bar: the existing six write probes stay BYTE-STABLE beside the new
family (the summary's probe-naming line extends lockstep to name the TWELVE
gate probes; the loader table, CLI `--help`, and `pio/src/session.ts` stay
byte-diff empty — §13.10).

### 13.9 Designated upgrade rung: overlay preview (recorded, not designed)

The OVERLAY-PREVIEW family is recorded as the DESIGNATED UPGRADE RUNG for a
later goal. The issue ticket (`.pio/issues/bash-command-write-gating.md`,
"Designated upgrade rung" section) records it thus:

Run the command on a throwaway fs (overlay upperdir / CoW replica) → observed change set is judged AGAINST THE FULL FRAME (patterns included — lifts the concrete-only limitation) → commit-if-allowed / discard.

Costs carried from day one: double execution & non-fs side effects (network/daemons run twice), output divergence (time/random-dependent names), merge-down tail (overlay loses rename metadata — mv ≈ create+delete), noise filtering (caches/locks), TOCTOU between verdict and commit, per-call mount/userns plumbing + launcher anti-nesting doctrine.

Prior art: `m-bartlett/sandboxfs`, Arcturn dry-run/diff/apply-discard UX, ephemeral-overlay multi-agent workspace projects. Optional hybrid: Landlock denies normally; ONLY on denial run a bounded best-effort preview pass to reconstruct "what you actually tried" for a richer message.

Boundary, per this guide's cut/deferred convention: NOT DESIGNED HERE — no
overlay mechanism, mount plumbing, or userns interaction exists in the shipped
surface; the rung is a record, not a commitment.

### 13.10 Records and boundaries: no new capability, superseded spec surfaces, carrier visibility

No-new-capability boundary (restated beside the first-paragraph statement so
both stay greppable): NO NEW CAPABILITY IS REGISTERED — the loader table
(`loader.ts` `CAPABILITY_TABLE`) and the CLI `--help` lines are UNCHANGED by
the fence, and registry sweeps find nothing to register; the guards-demo
accumulation rides the EXISTING registration byte-stably (§13.8 additive-only
bar).

Carrier visibility (no delivery mechanism) — recorded so future readers do
not re-introduce a perceived gap: section A of the profile renderer ALWAYS
binds the running node's own prefix ro (`pio/src/sandbox/render.ts` —
`defaultRuntimeDir()` = `dirname(dirname(process.execPath))`, the always-ro
system set entry over `runtimeDir`), and npm installs global packages UNDER
the running node's prefix — so the ENTIRE pio package tree (the target
executable, the SDK `node_modules`, AND `vendor/landlock-helper/`) sits inside
the namespace BY CONSTRUCTION in every launchable topology. Safety is
UNAFFECTED by absence: the fence machinery consults the carrier path PER SPAWN
(`checkLandlockHelper` stat classify over the resolver path) and refuses
CLOSED with a readable typed line on any absence — an in-bubble absence never
yields an unfenced execution (§13.5). OUT-OF-SCOPE POINTER: prefixes decoupled
from the node binary (custom npm `--prefix`, relocated node trees) break TARGET
EXECUTABLE resolution too — a pre-existing, launch-level availability gap
belonging to mount-inventory evolution, not a fence defect; do not patch it ad
hoc here.

Superseded spec surfaces (records note for readers cross-referencing older
specification artifacts of this mechanism): five corrections where spec-time
text no longer matches the shipped bytes — (i) WRAP-DESIGN SUPERSEDURE: the
exec DELEGATES the spawn to the SDK's exported `createLocalBashOperations`
rather than a mirrored ~70-LOC supervision body (grace-idle wait, group-kill,
pid ledger — unmodified SDK code by delegation; the spec-time two-symbol
construction pin is stale — the shipped consumption is FOUR SDK value
symbols: `createBashToolDefinition`, `createLocalBashOperations`, `defineTool`,
`getShellConfig`); (ii) ANNOTATION-SURFACE SUPERSEDURE: the
content-independent standing note REPLACED marker-sniffing attribution
(including the unconditional-LF framing amendment, §13.6) — the
marker-sniffed refusal lines were never the shipped surface; (iii)
PROBE-FREQUENCY SUPERSEDURE: PROBE-ONCE replaced per-spawn probing (lazy,
cached per fenced instance; failures retry pre-child — §13.5); (iv) THE
REGISTRATION-LANDING CONTAINMENT WIDENING: five sibling test suites gained
PURELY-ADDITIVE construction-time mock extensions (test-mock hygiene only —
registration mechanics unchanged); (v) THE SIBLING-SUITE SYMBOL FLOOR: THREE
symbols — `createBashToolDefinition` + `defineTool` +
`createLocalBashOperations` — for any future suite co-importing the
Landlock-bash modules under an SDK-mocked context (missing symbols fail LOUD
and deterministic at construction — never a silent degradation). Frame as
HISTORY OF RECORD: the shipped code at HEAD is the authority, and where this
guide and any older artifact disagree, the quotes extracted from HEAD win.

VOICE-CHANNEL SUPERSEDE HISTORY (this revision's addition). The planning-round-1
UNION TRIGGER (the exit-code arm PLUS advisory marker evidence via a forward-only
stream tee) was committed in round 1 and never shipped — SUPERSEDED UNSHIPPED:
the proleptic disclosure attacks the problem upstream of action and dissolves the
entire trigger-timing problem class (no stream tee, no vocabulary table, no
false-positive class), and no shipped trigger machinery existed to reconcile — the
revision's only shipped-module change is the disclosure itself, self-owned in
`pio-session.ts`. The PROLEPTIC DISCLOSURE LANDED (step 8); the STANDING NOTE was
RETAINED exactly as shipped (zero machinery change); the WRITE/EDIT gate's
decision-time refusal was PRESERVED untouched (owner directive); and under the
additive-to-goal reading deliverable 1(c) (post-execution refusal-voice rendering)
is INTACT and shipping, with `GOAL.md` unamended.

Open-assumption verification: the referenced ninth knowledge entry
(`KNOWLEDGE.md`) was NOT FOUND on disk at planning; the issue ticket and the
goal input were verified at planning to carry the surviving closed-envelope
decisions and cost lists VERBATIM (every correction above and the §13.9 cost
list trace to the ticket and to the shipped sources) — no extra constraint was
lost.
