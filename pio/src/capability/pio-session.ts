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
// Capability-span marking rides a dedicated NO-TURN carrier: markCapability
// appends the owning capability's section header (renderCapabilityMarker's
// pinned line; customType PIO_CAPABILITY_CUSTOM_TYPE) as a durable custom
// message — never folded into prompt text and never an LLM-turn trigger.
// Reserved-label grammar: phase ids stay BARE ids; the `capability:` prefix
// is RESERVED for that mark (documentation only — no runtime enforcement).
// This host merely exposes the generic seam; the OWNING base's
// SESSION-PRESENT run() seam drives it (exactly one header per such span;
// session-absent runs stay unstamped — the child's own record covers
// identity — see capability/base.ts).

import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { createPioSession } from "../session.ts";
import { PhaseBudgetError } from "./errors.ts";

/** Tool names whose successful executions commit a file path. */
const FILE_TOOL_NAMES: ReadonlySet<string> = new Set(["write", "edit"]);

/** Exact tool name matched for the ask-user counter. */
const ASK_USER_TOOL_NAME = "ask_user";

/** Transcript segment marker: two em dashes flanking the label (U+2014 x2, single spaces). */
export function renderPhaseMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 ${label} \u2014\u2014`;
}

/**
 * Capability-span marker: the reserved `capability:` prefix INSIDE the dash
 * flank of the phase-marker layout (U+2014 x2, single spaces). SOLE OWNER
 * of the pinned capability-line bytes — suites replicate them behind named
 * constants citing this owner. No input validation (the renderer is dumb);
 * no trailing newline.
 */
export function renderCapabilityMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 capability: ${label} \u2014\u2014`;
}

/** The customType namespace identifying pio capability markers among
 * foreign custom messages. Module-private on purpose: an entry-filtering
 * tag, not consumer API. */
const PIO_CAPABILITY_CUSTOM_TYPE = "pio-capability";

/** Closed option bag for one phase execution. */
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
  /** True on every normal return; a budget breach throws instead. */
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

  private constructor(runtime: AgentSessionRuntime, observer: SessionObserver) {
    this.id = runtime.session.sessionId;
    this.#lastBound = runtime.session;
    this.runtime = runtime;
    this.vars = new SessionVariableStore();
    this.#observer = observer;
  }

  /**
   * The only standalone construction path: mints the observer and its
   * single instance-scoped listener, threads the listener through the
   * construction seam (exactly one live subscription at any instant), and
   * returns the ready instance. The composed-frame sibling (fromRuntime)
   * hosts an already-settled runtime instead.
   */
  static async create(cwd: string, sessionsRoot?: string): Promise<PioSession> {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    const runtime = await createPioSession(cwd, sessionsRoot, {
      sessionListener: listener,
    });
    return new PioSession(runtime, observer);
  }

  /**
   * Synchronous factory over an ALREADY-SETTLED runtime — the composed-
   * frame sibling of create (cf. dist SessionManager.create/open/inMemory).
   * Mints a fresh observer and listener routed to it, subscribes EXACTLY
   * ONCE on the runtime's CURRENT handle, and constructs through the same
   * private constructor. Zero SDK-construction reach; no defensive input
   * validation — the type contract carries the guarantee.
   */
  static fromRuntime(runtime: AgentSessionRuntime): PioSession {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    runtime.session.subscribe(listener);
    return new PioSession(runtime, observer);
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
   * (construction-seam doctrine). Never reads this.runtime.session — the
   * explicit argument is the seam.
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
   * THE capability-span header seam: appends the owning capability's
   * section header as a DURABLE custom message and NEVER triggers an LLM
   * turn — no options object, so on this session's idle plane the SDK's
   * append-only branch applies (agent state + session entry, no turn).
   * Same handle reach as execute_phase (the runtime's CURRENT handle):
   * one handle, one transcript, counter/observer continuity by
   * construction. Positioned in transcript order relative to whatever
   * prompt FOLLOWS the call site: the owning base's run() awaits this
   * before the body can act, so the header persists above the span's
   * first phase line. The audience is after-the-fact transcript readers
   * (operator / quality-gate audit), not the model.
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
   * session's prompt channel. The marker line composed once per phase leads
   * every run's text; the between-runs hook observes each settling run's
   * fresh counters and stable per-run window. Every exit — a normal return
   * or a propagated budget breach / hook / prompt rejection — closes both
   * windows so a finished phase leaks nothing into the next one on the
   * same instance.
   */
  async execute_phase(id: string, opts?: PhaseOptions): Promise<PhaseResult> {
    const min = opts?.min ?? 1;
    const max = opts?.max ?? Infinity;
    // Composed once per phase: re-runs re-stamp the identical leading line.
    const text =
      renderPhaseMarker(id) +
      (opts?.instructions ? `\n${opts.instructions}` : "");
    let iterations = 0;
    try {
      for (;;) {
        // Close the previous run's window before this run's can open.
        this.resetFilesWrittenDelta();
        iterations += 1;
        await this.runtime.session.prompt(text);
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
        if (!proceed) break;
        if (iterations >= max) {
          throw new PhaseBudgetError(iterations);
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
    }
  }
}
