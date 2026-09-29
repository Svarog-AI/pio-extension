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
  implementations; singular `capability/` = framework). Today exactly two:
  `research.ts` (permanent) and `compose-new-session-demo.ts` (TEMPORARY
  composition vehicle — removal scheduled; registry note per §10).
- `pio/src/sandbox/` — host-side launch mechanics: engagement layout and
  derivation helpers (`layout.ts`), profile renderer (`render.ts`), owned
  extension provisioning (`owned-extensions.ts`), and the gated host pipeline
  (`run.ts`).
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
  /** Ceiling: demanding continuation past it rejects the phase. */
  readonly max?: number;
  /** Runs after every settled run; `true` ends the phase, `false` demands another run. */
  readonly shouldStopLoop?: (ctx: IterationCtx) => Promise<boolean>;
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

### 1.4 What each `IterationCtx` observable means — and the wrong-observable trap

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
  §1.6.

The canonical mistake is deciding a per-run question off a cumulative counter.
`counters.filesWritten` tells you how many writes committed over the ENTIRE
session; it cannot tell you whether the just-settled run wrote your artifact.
Cumulative monotonically grows — use the delta for decisions, the counters for
reporting.

### 1.5 Only committed TOOL writes are visible — the tool mandate is functional

Only COMMITTED `write`/`edit` TOOL executions enter the observable. Mechanism
(prose, from `pio/src/capability/pio-session.ts`): the observer records the
start event's `path` argument at tool-execution start for those two tool names
(module-private `FILE_TOOL_NAMES`), correlated by `toolCallId`; a matching
successful end event commits that path — the end carries no args, and failed
ends exclude the path; dangling starts from interrupted executions are drained
at each run start.

Shell-redirect appends (`echo`, `tee`, …) NEVER enter the observable — they are
not `write`/`edit` tool executions. Consequence: the instruction's tool
mandate (§3.3) is FUNCTIONAL, not stylistic. A shell-appending model burns the
whole budget and exits on the loud typed breach (§2.4), never on a clean stop.

### 1.6 Off-limits until the shared-vars spine lands

- Steering the loop by parsing transcripts or message payloads is fragile
  coupling to platform shape. The delivered steering channels are the three
  `IterationCtx` observables (§1.4); the payload list behind
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

Material: `pio-session.ts` `execute_phase` + `pio/src/capability/errors.ts` +
`research.ts` constants/span.

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
- `max` — the BACKSTOP: demanding continuation past it rejects the phase with
  the TYPED `PhaseBudgetError(iterations)` — thrown after the Nth settled run
  when continuation is still demanded (`pio/src/capability/errors.ts`:
  `readonly iterations: number` — the datum that reaches the terminal record).

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

### 2.4 Breach behavior: catch → annotate → re-throw (the fail-meaning rule)

No silent skip. The shipped pattern (`research.ts` budget span) catches
`PhaseBudgetError` NARROWLY around `execute_phase` — only that class is
annotated; every other error propagates untouched — and then:

1. ANNOTATE the durable artifact: append a pinned truncation note via
   filesystem append, so a reader of the PARTIAL FILE ALONE learns the run was
   cut. The append CREATES the degenerate note-only file if the model never
   wrote (coherent beats elaborate).
2. RE-THROW THE SAME error so its typed identity + `iterations` datum reach
   the terminal record through the base's catch-all: `captureError`
   (`pio/src/capability/status.ts`) maps it to
   `{ type: "PhaseBudgetError", cause: "budget" }`, the record lands
   `ok: false`, and `exitCodeFor` maps failure to exit 1. Surface, don't
   swallow.

The pinned note bytes (`truncationNote`, module-private in `research.ts`;
`<N>` = the breached iteration count):

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
it with the tool-committed-only caveat (§1.5) so "invisible" shell appends
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
and the operator signal. Exemplar: the `research.ts` budget span — catch
narrowly → annotate the partial artifact → RE-THROW THE SAME error (§2.4) —
keeps the typed identity + `iterations` datum in the terminal record
(`{ type: "PhaseBudgetError", cause: "budget" }`). If you catch a typed error,
your last act must be throwing it back out (possibly annotated) — the base
catch-all + `captureError` own the serialization.

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
`IterationCtx` observable alone and the cap rejects regardless; neither
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
parse rendered frames to drive loop decisions (§1.4/§3.1 standing doctrine).

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
observables (§1.6).

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
(DECLARED, next slot, unimplemented — boundary only, §9); **row 2** — the
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
            this.s = childFrame;
            return settle(await this.call(values));
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
   * body in place (session present). Success settles ONCE at this seam:
   * file-mode output slots transform to the bubble's absolute placement —
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
  hop side effect: zero switches/mints/scope dirs; budget breaches and body
  faults mirror IDENTICALLY into the child record and the await).
- COMPOSITION-LEVEL WALL-CLOCK BREACH ⇒ DEFERRED boundary — `timeoutMs` stays
  RESERVED-UNENFORCED (§9); the parked design names the breach shape (typed
  `cause: "budget"` error carrying the frame's PARTIAL record at the caller's
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
  §8.2). Shared-conversation composition (row 1) is the NEXT slot —
  DECLARED, UNIMPLEMENTED: named as a boundary only, nothing demonstrated.
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
  - Responsive breach = the SHIPPED teardown primitive + a typed
    `cause: "budget"` error at the caller's await carrying the frame's
    PARTIAL record.
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
};
```

```ts
// pio/src/cli.ts (HELP_LINES built-in block)
  "  compose-new-session-demo — TEMPORARY: greets the operator, runs research in the taken-over terminal, then reports the top 3 findings",
  "  pio run compose-new-session-demo",
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

The §6 checklist applies to every NON-temporary builtin UNCHANGED.
