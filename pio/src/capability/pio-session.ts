// Session host for capability authoring: wraps one constructed agent
// session runtime BY REFERENCE and feeds its counters store from the single
// instance-scoped listener threaded through the construction seam.
//
// The listener is the sole event feed: it is minted here, passed as a
// sessionListener option (attached exactly once at construction by the
// seam), and routes events into instance-owned observation state. The live
// subscription count stays at one at any instant — the construction seam
// owns the first attach, and rebind owns the re-attach on each reopened
// handle (subscriptions die with the disposed handle; the returned
// unsubscribe is dropped by design). No module-level mutable state.
//
// Composed frames ride the same instance surface: fromRuntime hosts a
// frame on a SETTLED shared runtime — the synchronous sibling of create,
// placement-blind (no frame-world imports, no placement branches, no
// placement flag). Counter continuity spans handle swaps: cumulative
// observation state lives in the persistent observer (JS heap), and
// reopened transcripts retain their sessionId while re-firing no events —
// re-arming the same observer after a swap-back yields exact continuity,
// no loss, no double count.
//
// Token aggregation is local on purpose: the platform's usage-totals helper
// is not exported from the installed package root (deep-importing it is
// blocked by its exports map), and the stats accessor aggregates on a
// different channel that cannot supply per-run deltas. The local accumulator
// mirrors the platform's five-field additive rules, and the exposed token
// scalar applies the same derivation the platform uses for its own stats
// total.
//
// Phase running drives settled agent runs through the session's prompt
// channel: one awaited prompt settles a whole logical run (internal
// retries, compaction continuations, and queued messages all resolve inside
// it), so the prompt promise alone is the settlement authority. Settled-end
// payloads are appended to a flat monotonic master list tracked by a
// baseline number — reads are non-consuming slices stable within a window,
// explicit resets move only the baseline, and nothing ever truncates a list
// or the cumulative counters. The same idiom spans both the committed-path
// list and the payload list.
//
// Capability-span marking rides a no-turn carrier: markCapability appends
// the span's section header (renderCapabilityMarker's line; customType
// PIO_CAPABILITY_CUSTOM_TYPE) as a durable custom message — never folded
// into prompt text, never a turn trigger. Phase ids stay BARE ids; the
// `capability:` prefix is reserved for that mark (no runtime enforcement).
// Only session-present runs are stamped, once per span (see base.ts).
//
// Settlement gate (write: expectations): a phase that declares deliverable
// paths cannot settle until they exist. The gate sits strictly at the normal
// settlement break (stop-rule verdict or budget break) — floor/hook
// continuations pre-break see no gate. Each settlement consults FRESH
// existsSync over the resolved declared paths: directories pass
// mechanically; non-emptiness stays a capability-local quality bar. Any
// missing path denies the settlement: a dedicated expectation-retry counter
// (independent of the iteration budget and the stopping rule) increments and
// the phase re-enters the loop body; iterations counts all settled runs,
// retries included.
//
// Durable-declaration retention: entries resolve ONCE at phase start
// (absolute normalized; relative under process.cwd()) into a list retained
// for the whole phase duration — never consumed transiently. The retained
// resolved entries arm BOTH the settlement gate (consulted at break points)
// and the execution-state feed (attached verbatim at phase start alongside
// the phase's normalized project-files scope flag, detached on every exit
// cause): the session's per-phase write permission frame rides this single
// retained list plus the flag - the phase's TWO declared permission
// dimensions.
//
// Corrective-note channel: gate-triggered retries alone append ONE fresh
// deterministic MARKED BLOCK (a flanked em-dash delimiter line labeled
// output guard above the body sentence — every currently-missing resolved
// path plus the settled-run count at that point) strictly after the
// marker-leading baseline text; landed paths drop off, no history
// accumulates, and the composition stays private to execute_phase.
//
// Typed failure at the ceiling: with MAX_EXPECTATION_RETRIES corrective
// re-runs settled and paths still missing, the phase throws the error
// home's ContractViolationError (collect-all, one line per missing path) —
// unwrapped through the finally closeout into the standard containment
// channels on both placements.
//
// Per-session write-gate producer wiring: create mints EXACTLY ONE
// SessionExecutionState over its two owned anchor channels (the
// project-slot root recovered through the base's loud state-root channel
// plus the launch cwd; the workspace cwd itself) and threads it into the
// construction seam's guard install alongside the write tool-call handler
// closure. That closure consults a FRESH snapshot through the stateless
// predicate per call, eager for every tool name: a faulty channel faults
// every call verbatim (fail-safe tail), and no containment hides it.
// fromRuntime
// discovers the state from the settled handle's symbol stamp via cast-free
// instanceof narrowing; an unstamped foreign handle carries NO state and
// every gate operation no-ops cleanly. execute_phase feeds its retained
// resolved declarations AND its normalized project-files scope flag into
// the top span strictly at phase start (a phase attaches when EITHER
// dimension is declared; neither declared attaches nothing) and detaches on
// every exit cause. rebind leaves the execution state UNTOUCHED on every
// path - span integrity belongs to the balanced enter/exit lifecycle, not
// to the swap. The enterCapability / exitCapability pair is the
// instance-level span-producer surface; no public verdict surface exists,
// verdicts firing exclusively inside the interceptor closure.
//
// Command-write fencing threads the SAME way: create builds EXACTLY ONE
// Landlock-bash instance over the SAME execution state the guard install
// stamps - BY REFERENCE, so the instance's per-invocation fresh snapshot
// consult tracks span and phase churn identically to the write-handler
// closure and late binding survives handle swaps. The entry rides the
// UNCONDITIONAL customTools slot: the stored-factory closure re-spreads
// the very same instance on every session re-creation (composed frames
// share it within one runtime; a separate process mints its own through
// its own create), so no placement adds wiring. session.ts stays the
// generic channel and is unchanged; the guard-handler list gains NO
// member, because the kernel adjudicates command writes and the tool
// renders only: a single refusal site, rendered from the pre-spawn
// consult.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { slugify } from "../sandbox/layout.ts";
import { createPioSession, EXECUTION_STATE_STAMP } from "../session.ts";
import { SessionExecutionState } from "../session-execution-state.ts";
import { createLandlockBash } from "../tools/bash/landlock-bash.ts";
import { deriveStateRootFromAgentDir } from "./base.ts";
import { ContractViolationError } from "./errors.ts";
import type { CapabilitySources } from "./guards/guard-vocabulary.ts";
import { decideWrite } from "./guards/write-gate.ts";

/** Tool names whose successful executions commit a file path. */
const FILE_TOOL_NAMES: ReadonlySet<string> = new Set(["write", "edit"]);

/** Exact tool name matched for the ask-user counter. */
const ASK_USER_TOOL_NAME = "ask_user";

/** Transcript segment marker: two em dashes flanking the label (U+2014 x2, single spaces). */
export function renderPhaseMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 ${label} \u2014\u2014`;
}

/** Capability-span marker: the `capability:` prefix inside the dash flank
 * of the phase-marker layout (U+2014 x2, single spaces). No input
 * validation; no trailing newline. */
export function renderCapabilityMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 capability: ${label} \u2014\u2014`;
}

/** The customType namespace identifying pio capability markers among
 * foreign custom messages. Module-private on purpose: an entry-filtering
 * tag, not consumer API. */
const PIO_CAPABILITY_CUSTOM_TYPE = "pio-capability";

/** Ceiling for corrective expectation re-runs (shrink-only, no per-phase
 * override; module-private — the export surface stays at the pinned five
 * keys and the suite pins the ceiling behaviorally). */
const MAX_EXPECTATION_RETRIES = 3;

/** One corrective MARKED BLOCK for a gate-triggered retry: the flanked
 * em-dash delimiter line (U+2014-escaped like every other pinned byte in
 * this module) labeled output guard above the body sentence — every
 * currently-missing resolved path (declaration order) plus the settled-run
 * count at the denial point; fresh per retry, so landed paths drop off.
 * Two lines joined by a single LF; no trailing newline. */
function renderExpectationRetryLine(
  iterations: number,
  missing: readonly string[],
): string {
  return `\u2014\u2014 output guard \u2014\u2014\nRequired phase output(s) still missing after ${iterations} run(s): ${missing.join(", ")}. Create each listed file with the write or edit tool before you finish this run.`;
}

/** One collect-all violation line per still-missing declared path at the
 * exhausted ceiling (<entry> raw, <resolvedPath> resolved; the em dash is
 * U+2014-escaped like every other pinned byte in this module). */
function renderMissingOutputLine(
  phaseId: string,
  entry: string,
  resolvedPath: string,
): string {
  return `phase '${phaseId}' output '${entry}' missing at ${resolvedPath} \u2014 still absent after ${MAX_EXPECTATION_RETRIES} expectation re-run(s); the ceiling is exhausted`;
}

/** Closed option bag for one phase execution. */
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
   * process.cwd(). Non-empty retained entries additionally feed the
   * session's execution state (attached verbatim at phase start), arming
   * the per-phase write permission frame. */
  readonly write?: readonly string[];
  /** The phase's project-files (workspace-cwd) SCOPE declaration:
   * CLAMPED at decision time against the running capability's contract
   * flag - an unbacked flag is INVISIBLE (never granted, never listed).
   * With the `write` bag and the scratch flag it forms the phase's THREE
   * declared permission dimensions (all feed the session's execution state
   * verbatim); absent means false. */
  readonly allowProjectWrites?: boolean;
  /** The phase's SCRATCH (/tmp/) declaration: a SINGLE phase flag with NO
   * contract-side counterpart - judged only at decision time (there is no
   * clamp to speak of - single-flag doctrine). With the `write` bag and
   * the scope flag it forms the phase's THREE declared permission
   * dimensions (all feed the session's execution state verbatim); absent
   * means false. */
  readonly tmpDirAllowed?: boolean;
}

/** Decision window handed to the between-runs hook. */
export interface IterationCtx {
  /** Fresh session-cumulative snapshot taken after the settling run. */
  readonly counters: SessionCounters;
  /** Committed paths of the just-settled run — stable under repeated reads. */
  readonly filesWritten: string[];
  /** The session variable store, passed by reference. */
  readonly vars: SessionVariableStore;
}

/** Outcome of a completed phase. */
export interface PhaseResult {
  /** True on every return. */
  readonly done: boolean;
  /** Settled runs executed. */
  readonly iterations: number;
  /** Concatenated settled-end payloads of the phase, in event order. */
  readonly messages: unknown[];
  /** Empty by construction: no mid-run variable writes occur yet. */
  readonly varsDelta: Record<string, unknown>;
  /** One fresh cumulative snapshot taken after the final run settles. */
  readonly counters: SessionCounters;
  /** Always equals counters.tokens. */
  readonly tokens: number;
}

/** Cumulative run-observation counters over one session lifetime. */
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

/**
 * Minimal instance variable store (get/set/list over a Map). Deliberately
 * distinct from the root tree's richer same-named class (different
 * package, different surface); later work wraps this same store rather
 * than renaming it.
 */
export class SessionVariableStore {
  #entries: Map<string, unknown> = new Map();

  /** Stored value, or undefined when the name is absent. */
  get(name: string): unknown {
    return this.#entries.get(name);
  }

  /** Raw assignment — value-shape coercion belongs to the wrapping layer. */
  set(name: string, value: unknown): void {
    this.#entries.set(name, value);
  }

  /** Insertion-ordered, deduplicated key list. */
  list(): string[] {
    return [...this.#entries.keys()];
  }
}

// Additive usage totals mirroring the platform's five-field struct. Cost is
// tracked to keep the struct shape identical, though nothing exposes it yet.
interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

// Instance-owned observation state fed exclusively by the single
// instance-scoped listener. Owns the per-tool start counts, the
// toolCallId-correlated pending-path map (interrupted starts are drained at
// each run start), the monotonic committed-path master list with its
// baseline cursor, the monotonic settled-payload master list with its
// baseline cursor, and the assistant usage accumulator.
class SessionObserver {
  #toolUses: Record<string, number> = {};
  #askUserCalls = 0;
  #pendingPaths: Map<string, string> = new Map();
  #masterList: string[] = [];
  #pathBaseline = 0;
  #payloadMaster: unknown[] = [];
  #messageBaseline = 0;
  #usageTotals: UsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        // An interrupted execution's dangling start must not leak into a
        // later run's committed-path partition.
        this.#pendingPaths.clear();
        break;
      case "tool_execution_start": {
        const { toolCallId, toolName, args } = event;
        this.#toolUses[toolName] = (this.#toolUses[toolName] ?? 0) + 1;
        if (toolName === ASK_USER_TOOL_NAME) {
          this.#askUserCalls += 1;
        }
        if (FILE_TOOL_NAMES.has(toolName)) {
          // Optional chaining keeps this null-safe; duplicate call ids
          // overwrite.
          const path = args?.path;
          if (typeof path === "string" && path.length > 0) {
            this.#pendingPaths.set(toolCallId, path);
          }
        }
        break;
      }
      case "tool_execution_end":
        // The end event carries no args: the path came from the matching
        // start, and the outcome decides whether it commits.
        this.#resolveEnd(event.toolCallId, event.isError);
        break;
      case "message_end": {
        // Only assistant persistence carries main-LLM usage; tool results
        // carry their own tool-execution accounting and must stay out.
        const message = event.message;
        if (message.role === "assistant") {
          const totals = this.#usageTotals;
          totals.input += message.usage.input;
          totals.output += message.usage.output;
          totals.cacheRead += message.usage.cacheRead;
          totals.cacheWrite += message.usage.cacheWrite;
          totals.cost += message.usage.cost.total;
        }
        break;
      }
      case "agent_end": {
        // Per-attempt payloads are disjoint, so appending composes across
        // internal retries; the retry flag is deliberately unread — the
        // prompt promise owns settlement.
        for (const payload of event.messages) {
          this.#payloadMaster.push(payload);
        }
        break;
      }
      default:
        // Everything else — tool_execution_update, turn_*, agent_settled,
        // queue/compaction/retry/summarization events — is
        // observation-neutral.
        break;
    }
  }

  /** Fresh snapshot object; callers may retain or mutate it freely. */
  snapshot(): SessionCounters {
    const totals = this.#usageTotals;
    return {
      // Derived from the master list: the invariant "count equals
      // committed paths" holds by construction.
      filesWritten: this.#masterList.length,
      askUserCalls: this.#askUserCalls,
      toolUses: { ...this.#toolUses },
      tokens:
        totals.input + totals.output + totals.cacheRead + totals.cacheWrite,
    };
  }

  /** Non-consuming slice of committed paths since the last baseline advance. */
  filesWrittenDelta(): string[] {
    return this.#masterList.slice(this.#pathBaseline);
  }

  /** Move the path baseline past every committed observation. */
  resetPathBaseline(): void {
    this.#pathBaseline = this.#masterList.length;
  }

  /** Non-consuming slice of recorded payloads since the last baseline advance. */
  runMessages(): unknown[] {
    return this.#payloadMaster.slice(this.#messageBaseline);
  }

  /** Move the payload baseline past every recorded observation. */
  resetMessageBaseline(): void {
    this.#messageBaseline = this.#payloadMaster.length;
  }

  #resolveEnd(toolCallId: string, isError: boolean): void {
    // Commit first, drop after: a fault between the two leaves the entry
    // replayable (a later end commits it exactly once) rather than lost,
    // and no duplicate commit is possible because a dropped id finds no
    // entry on any later end.
    const path = this.#pendingPaths.get(toolCallId);
    if (!isError && path !== undefined) {
      this.#masterList.push(path);
    }
    this.#pendingPaths.delete(toolCallId);
  }
}

/**
 * Refusal raised when rebind is handed a FOREIGN handle — its sessionId
 * differs from this frame's identity. The message is constructed at the
 * throw site over the two session ids (claim first, frame second). Bare
 * identity capture reduces via captureError to {type, message}; NO cause.
 */
export class SessionHandleRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionHandleRefusalError";
  }
}

/**
 * Host for one capability engagement: owns the constructed session runtime
 * by reference plus the run observation fed by its single attached
 * listener, and runs budgeted phase engines over the session's prompt
 * channel. Construction settles before an instance is ever handed out.
 */
export class PioSession {
  /** Identity of the settled session handle. */
  readonly id: string;
  /** Constructed runtime by reference — reach path for runs and teardown. */
  readonly runtime: AgentSessionRuntime;
  /** Fresh per-instance variable store (hooks consume it by reference). */
  readonly vars: SessionVariableStore;

  #observer: SessionObserver;
  /** Last-bound handle MARKER — rebind's same-handle comparison only. */
  #lastBound: AgentSession;
  /** Execution state minted by create or discovered through the settled
   * handle's symbol stamp (fromRuntime); ABSENT means no state — every
   * gate operation on such an instance no-ops cleanly. */
  #executionState: SessionExecutionState | undefined;

  private constructor(
    runtime: AgentSessionRuntime,
    observer: SessionObserver,
    executionState: SessionExecutionState | undefined = undefined,
  ) {
    this.id = runtime.session.sessionId;
    this.#lastBound = runtime.session;
    this.runtime = runtime;
    this.vars = new SessionVariableStore();
    this.#observer = observer;
    this.#executionState = executionState;
  }

  /**
   * The only standalone construction path: mints the observer and its
   * single instance-scoped listener PLUS the one per-session execution
   * state over the owned anchor channels, threads the listener and the
   * UNCONDITIONAL guard install (state + write tool-call handler closure)
   * through the construction seam (exactly one live subscription at any
   * instant), and returns the ready instance. The composed-frame sibling
   * (fromRuntime) hosts an already-settled runtime instead.
   */
  static async create(cwd: string, sessionsRoot?: string): Promise<PioSession> {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    // THE one per-session execution state: minted over the two owned anchor
    // channels (storage ONLY — resolution defers to snapshot(), zero env/
    // fs at construction).
    const executionState = new SessionExecutionState({
      projectSlotRoot: () =>
        join(
          deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
          "projects",
          slugify(cwd),
        ),
      workspaceCwd: () => resolve(cwd),
    });
    // THE write tool-call handler closure: every tool-call verdict consults
    // a FRESH snapshot through the stateless predicate — late binding
    // survives rebind swaps and span churn; no containment anywhere.
    const writeToolCallHandler = (toolName: string, input: unknown) =>
      decideWrite(executionState.snapshot(), toolName, input);
    // THE one fenced bash instance: built over the SAME execution state the
    // guard install stamps BY REFERENCE - the per-invocation fresh snapshot
    // consult makes late binding sufficient (identical doctrine to the
    // closure above); the instance may persist while the frames it consults
    // churn.
    const landlockBash = createLandlockBash(cwd, executionState);
    const runtime = await createPioSession(cwd, sessionsRoot, {
      sessionListener: listener,
      customTools: [landlockBash],
      guardInstall: { executionState, handlers: [writeToolCallHandler] },
    });
    return new PioSession(runtime, observer, executionState);
  }

  /**
   * Synchronous factory over an ALREADY-SETTLED runtime — the composed-
   * frame sibling of create (cf. dist SessionManager.create/open/inMemory).
   * Mints a fresh observer and listener routed to it, subscribes EXACTLY
   * ONCE on the runtime's CURRENT handle, DISCOVERS the execution state
   * from that handle's symbol stamp (cast-free narrowing; absent for a
   * foreign handle), and constructs through the same private constructor.
   * Zero SDK-construction reach; no defensive input validation — the type
   * contract carries the guarantee.
   */
  static fromRuntime(runtime: AgentSessionRuntime): PioSession {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    runtime.session.subscribe(listener);
    // Cast-free discovery over the settled handle's symbol stamp: the
    // Reflect.get read lands in an unknown local, narrowed by instanceof.
    // A pio-constructed shared handle FINDS THE EXACT object minted at
    // create (composed frames share it by handle identity); an unstamped
    // foreign handle resolves undefined — no execution state, every gate
    // operation below no-ops.
    const stamped: unknown = Reflect.get(
      runtime.session,
      EXECUTION_STATE_STAMP,
    );
    const executionState =
      stamped instanceof SessionExecutionState ? stamped : undefined;
    return new PioSession(runtime, observer, executionState);
  }

  /**
   * Re-arm the persistent observer on a freshly applied handle after a
   * platform session replacement. Gates, fixed order: IDENTITY — a claimed
   * handle whose sessionId differs from this frame's id refuses LOUDLY
   * and mutates nothing; NO-OP — the already-bound handle (by reference)
   * never double-subscribes. Otherwise a FRESH listener closure routed to
   * the SAME persistent observer subscribes on the claimed handle and the
   * last-bound marker moves. Accepted edge: rearms assume the previously
   * bound handle died via platform dispose (switchSession tears down
   * first). The returned unsubscribe is deliberately dropped
   * (construction-seam doctrine). The execution state is left INTACT
   * across the swap on purpose: span layers belong to the balanced
   * enter/exit lifecycle and survive a handle replacement. Never reads
   * this.runtime.session — the explicit argument is the seam.
   */
  rebind(session: AgentSession): void {
    if (session.sessionId !== this.id) {
      throw new SessionHandleRefusalError(
        `pio-session: rebind refused \u2014 handle '${session.sessionId}' is not this frame's session ('${this.id}')`,
      );
    }
    if (session === this.#lastBound) {
      return;
    }
    const listener: AgentSessionEventListener = (event) => {
      this.#observer.handle(event);
    };
    session.subscribe(listener);
    this.#lastBound = session;
  }

  /** Push the running capability's sources as a span layer on the session's
   * execution state. No-op when the instance carries no execution state. */
  enterCapability(sources: CapabilitySources): void {
    this.#executionState?.enterCapability(sources);
  }

  /** Pop the session's execution-state span layer (span settlement).
   * No-op when the instance carries no execution state. */
  exitCapability(): void {
    this.#executionState?.exitCapability();
  }

  /** Session-cumulative snapshot (fresh object per call). */
  counters(): SessionCounters {
    return this.#observer.snapshot();
  }

  /** Committed write/edit paths since the last reset — stable under repeated calls. */
  getFilesWrittenDelta(): string[] {
    return this.#observer.filesWrittenDelta();
  }

  /** Advance the delta baseline past all committed paths; cumulative counter untouched. */
  resetFilesWrittenDelta(): void {
    this.#observer.resetPathBaseline();
  }

  /** Recorded settled-end payloads since the last reset — stable under repeated calls. */
  getRunMessages(): unknown[] {
    return this.#observer.runMessages();
  }

  /** Advance the message baseline past all recorded payloads. */
  resetRunMessages(): void {
    this.#observer.resetMessageBaseline();
  }

  /**
   * Append the span's section header as a durable custom message WITHOUT
   * triggering an LLM turn (no options object = the SDK's append-only idle
   * branch). Same handle reach as execute_phase (the runtime's CURRENT
   * handle). Awaited before the body acts, so the header precedes the
   * span's first phase prompt in transcript order.
   */
  async markCapability(label: string): Promise<void> {
    await this.runtime.session.sendCustomMessage({
      customType: PIO_CAPABILITY_CUSTOM_TYPE,
      content: renderCapabilityMarker(label),
      display: true,
      details: undefined,
    });
  }

  /**
   * One phase = a budgeted sequence of settled agent runs driven through the
   * session's prompt channel; the once-composed marker line leads every
   * run's text and the between-runs hook observes each settling run.
   * Declared deliverable paths (write) arm the settlement gate: every
   * normal break point passes a fresh existence consult before settling —
   * a denial burns one corrective re-run (max MAX_EXPECTATION_RETRIES) and
   * the ceiling throws the error home's ContractViolationError. Every exit
   * closes both windows so the phase leaks nothing into the next one.
   */
  async execute_phase(id: string, opts?: PhaseOptions): Promise<PhaseResult> {
    const min = opts?.min ?? 1;
    const max = opts?.max ?? Infinity;
    // Composed once per phase: re-runs re-stamp the identical leading line.
    const text =
      renderPhaseMarker(id) +
      (opts?.instructions ? `\n${opts.instructions}` : "");
    // Resolved once at phase start and retained for the whole duration:
    // the settlement gate, the ceiling failure, and the execution-state
    // feed all consult this same retained list.
    const declarations = (opts?.write ?? []).map((entry) => ({
      entry,
      resolved: resolve(entry),
    }));
    // Normalized primitives (absent implies false) fed VERBATIM beside the
    // retained list: the phase's project-files scope declaration (judged
    // only at decision time - clamped there against the contract flag) and
    // its scratch declaration (judged only at decision time, never clamped
    // - no contract-side counterpart exists).
    const allowProjectWrites = Boolean(opts?.allowProjectWrites);
    const tmpDirAllowed = Boolean(opts?.tmpDirAllowed);
    // The retained resolved entries AND both normalized class flags feed the
    // execution state VERBATIM when ANY dimension is declared (paths, the
    // scope flag, or the scratch flag): attach STRICTLY AT PHASE START
    // (outside the try block, so a loud bookkeeping fault escapes with no
    // finally-side bookkeeping to untangle); the attached flags keep the
    // closeout detach symmetric over every exit cause. No dimension
    // declared attaches NOTHING - the span sources supply the clamp ceiling
    // unchanged (they admit nothing on their own).
    const declaredPaths = declarations.map(
      (declaration) => declaration.resolved,
    );
    let attached = false;
    if (
      this.#executionState !== undefined &&
      (declaredPaths.length > 0 || allowProjectWrites || tmpDirAllowed)
    ) {
      this.#executionState.attachPhase(
        id,
        declaredPaths,
        allowProjectWrites,
        tmpDirAllowed,
      );
      attached = true;
    }
    let iterations = 0;
    // Independent of budget and stop rule; never surfaced on PhaseResult.
    let expectationRetries = 0;
    // Next run's corrective block: set only at a gate denial, consumed once —
    // floor/hook continuations re-send the untouched baseline.
    let pendingNote: string | undefined;
    try {
      for (;;) {
        // Close the previous run's window before this run's can open.
        this.resetFilesWrittenDelta();
        iterations += 1;
        const outgoing =
          pendingNote !== undefined ? `${text}\n${pendingNote}` : text;
        pendingNote = undefined;
        await this.runtime.session.prompt(outgoing);
        const counters = this.counters();
        const filesWritten = this.getFilesWrittenDelta();
        let proceed = iterations < min;
        const shouldStopLoop = opts?.shouldStopLoop;
        if (shouldStopLoop) {
          const verdict = await shouldStopLoop({
            counters,
            filesWritten,
            vars: this.vars,
          });
          proceed = proceed || !verdict;
        }
        if (!proceed || iterations >= max) {
          // Settlement gate — this break path only: fresh existsSync over
          // the retained resolved declarations (declaration order); an
          // absent/empty declaration settles identically to the ungated case.
          const missing = declarations.filter(
            (declaration) => !existsSync(declaration.resolved),
          );
          if (missing.length > 0) {
            if (expectationRetries >= MAX_EXPECTATION_RETRIES) {
              // Ceiling exhausted: collect-all typed failure.
              throw new ContractViolationError(
                missing.map((declaration) =>
                  renderMissingOutputLine(
                    id,
                    declaration.entry,
                    declaration.resolved,
                  ),
                ),
              );
            }
            expectationRetries += 1;
            pendingNote = renderExpectationRetryLine(
              iterations,
              missing.map((declaration) => declaration.resolved),
            );
            continue; // denied settlement: re-enter the loop body
          }
          break;
        }
      }
      const messages = this.getRunMessages();
      const finalSnapshot = this.counters();
      return {
        done: true,
        iterations,
        messages,
        varsDelta: {},
        counters: finalSnapshot,
        tokens: finalSnapshot.tokens,
      };
    } finally {
      // Windows never leak into the next phase regardless of the exit cause.
      this.resetFilesWrittenDelta();
      this.resetRunMessages();
      if (attached) this.#executionState?.detachPhase();
    }
  }
}
