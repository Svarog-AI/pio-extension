// Terminal-takeover composition — process-scoped frame environment, the hop
// primitive, and the ordered shutdown pass. A FRAME is one composed
// capability execution held on the shared runtime under the entry's live
// terminal; the ledger tracks every depth (index 0 = outermost).
//
// Single holder per process: double-install throws loudly; an uninstalled
// read throws the pinned error; teardown is the idempotent inverse (also
// resets the top-emitter cell). Each entry carries a PendingLatch (normal
// settlement resolves it exclusively; the reject channel belongs to the
// shutdown pass; the outermost latch is minted and parked) and a LIVE
// emitter accessor (top: the attach cell; composed: the build-stage cell)
// that the pass walks for per-frame partial records.
//
// THE ordered shutdown pass (per trigger): rejects pending composed latches
// innermost-first (parked top skipped); for non-user-abort causes stops the
// mounted terminal and disposes the shared runtime (best-effort, stop-
// once); writes the per-frame PARTIALS innermost-first over the trigger-
// time snapshot (fatal excludes the top — its caller owns that record);
// drops ONE best-effort frames.json at the sessions root; lands the typed
// line on the entry's stderr sink.
//
// THE process-exit guard wraps the termination sink (rows seam it; without
// a seam it wraps IN PLACE and uninstall restores the original): fired ⇒
// every wrapper call normalizes the code regardless of the argument; not
// fired + holder installed + top unclaimed ⇒ the user-abort trigger (sync
// pass, then the mapped code); otherwise clean passthrough. One prepended
// sigterm handler fires the async pass and self-exits. No other signal
// registration; the only host reach is the exit-sink wrap plus a bare
// registration-value default.
//
// Hop mechanics (materializeFrame): synchronous dispatcher — the holder
// guard throws synchronously when uninstalled, the latch is minted first,
// and a detached continuation owns mint → switch-out → push → body →
// record → switch-back → re-arm → pop-with-resolve. The child scope dir
// mints one segment under the current frame's (no lineage options — who-
// called-whom edges live only in the ledger); the switch back lands on the
// captured parent file with no yield before the re-arm. The caller's await
// mirrors the emitted record by reference.
//
// Winds-unwound: release always runs after the staged span, so the await
// RESOLVES with a shipped result shape on every reachable fault path — it
// never hangs and never rejects in this pass (reject stays reserved for
// shutdown). Pre-push faults leave the ledger untouched; a post-attach /
// pre-record fault leaves the minted scope dir behind as accepted residue.
// Linear, non-concurrent, single-process.
//
// Stance: the module never constructs or drives the terminal. A responsive
// abort mid-hop settles through the body-fault path; a true wedge freezes
// the chain (accepted per owner-hang semantics; recovery is the pass's).

import { join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { IdSeams } from "../sandbox/layout.ts";
import { mintEngagementId } from "../sandbox/layout.ts";
import type { SessionCounters } from "./pio-session.ts";
import { PioSession } from "./pio-session.ts";
import type {
  CapabilityResult,
  KillCaptureTarget,
  SessionStatusError,
  StatusEmitter,
} from "./status.ts";
import { captureError, createStatusEmitter, writeUtf8Sync } from "./status.ts";

/** Outermost-entry stamp: audit-identity placeholder keeping the ledger
 * shape uniform across depths (the durable top record identity is owned by
 * the entry's emitter and never serializes from here). */
const TOP_FRAME_STAMP: Readonly<{
  readonly name: string;
  readonly version: string;
}> = { name: "top", version: "0.0.0" };

// Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
const NOT_INSTALLED_MESSAGE =
  "terminal-takeover: frame environment not installed \u2014 a session-absent capability can only run under the engaged entry";

const DOUBLE_INSTALL_MESSAGE =
  "terminal-takeover: frame environment already installed \u2014 single-holder doctrine; teardown before reinstalling";

// THE four pinned hop-fault messages (owner: the throw sites below);
// \u2014 escaped so the bytes survive toolkit glyph mangling.
const PARENT_UNNAMED_MESSAGE =
  "terminal-takeover: hop aborted \u2014 the parent session is unnamed; no switch source to return to";
const MINT_UNNAMED_MESSAGE =
  "terminal-takeover: hop aborted \u2014 the platform minted no session file for the child scope";
const CANCELLED_SWITCH_MESSAGE =
  "terminal-takeover: hop aborted \u2014 the switch out was cancelled; nothing was attached";
const SWITCH_BACK_FAILED_MESSAGE =
  "terminal-takeover: hop aborted \u2014 the switch back failed; the child record is durable";

// THE one fixed interruption message (owner: the FrameKillError constructor
// below); \u2014 escaped so the bytes survive toolkit glyph mangling.
const FRAME_KILL_MESSAGE =
  "terminal-takeover: frame interrupted \u2014 the ordered shutdown pass terminated the process";

/** Module-local (module-owned, not the errors.ts home). Sets NO cause —
 * bare-identity capture reduces an instance to `{ type, message }`. */
export class FrameEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameEnvironmentError";
  }
}

/** Hop-machinery refusal: a loud typed fault at a named hop site (parent
 * unnamed, mint unnamed, cancelled switch-out, failed switch-back).
 * Module-local; sets NO cause — bare-identity capture. */
export class HopFaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HopFaultError";
  }
}

/** Module-local; exported for cross-module byte reference. Refines
 * Error.cause with the CLOSED-VOCABULARY literal (the ContractViolationError
 * refinement pattern — adopted by captureError, unlike the bare-identity hop
 * forms). ONE fixed form, no interpolation. */
export class FrameKillError extends Error {
  readonly cause: "kill";
  constructor() {
    super(FRAME_KILL_MESSAGE);
    this.name = "FrameKillError";
    this.cause = "kill";
  }
}

/** Install argument bag; process-level concerns belong ONLY to the
 * outermost entry. */
export interface FrameEnvironmentContext {
  /** The absolute --sessions-root parsed value; the outermost scope dir. */
  readonly sessionsRoot: string;
  /** The entry's PioSession BY REFERENCE (shared runtime via
   * topFrame.runtime). */
  readonly topFrame: PioSession;
  /** Process-level terminal stop (outermost-owned). */
  readonly terminalStop: () => void;
  /** The row's stderr sink: lines arrive WITHOUT trailing newline. */
  readonly stderr: (line: string) => void;
}

/** Reserved latch channel: a native promise surfaced with its settlement
 * functions (first-settlement-wins comes free from native semantics). */
export interface PendingLatch<T> {
  readonly value: Promise<T>;
  /** Normal-settlement channel (exclusive by convention). */
  resolve(value: T): void;
  /** Kill-pass channel (owned by the ordered shutdown pass). */
  reject(error: Error): void;
}

/** Module-private helper over a native promise + resolver pair. Stays
 * non-exported — the later steps extend THIS file, no cross-module
 * surface needed. */
function createPendingLatch<T>(): PendingLatch<T> {
  let resolveImpl!: (value: T) => void;
  let rejectImpl!: (reason: Error) => void;
  const value = new Promise<T>((resolve, reject) => {
    // The executor runs synchronously — both impls filled by construction.
    resolveImpl = resolve;
    rejectImpl = reject;
  });
  return { value, resolve: resolveImpl, reject: rejectImpl };
}

/** THE unified ledger entry shape (every depth identical). */
export interface ActiveFrame {
  /** 0 = outermost. */
  readonly depth: number;
  /** Stamped identity (composed frames carry their callee capability
   * stamp). */
  readonly capability: Readonly<{
    readonly name: string;
    readonly version: string;
  }>;
  /** The frame's session scope dir; records land at
   * `<scopeDir>/top/status.json` uniformly. */
  readonly scopeDir: string;
  /** LIVE accessor (fresh read per call; never a snapshot). */
  readonly sessionFile: () => string | undefined;
  /** LIVE accessor (fresh read per call). */
  readonly tokens: () => number;
  /** The swap-back subscription re-arm hook. */
  readonly rebind: (session: AgentSession) => void;
  /** The RESERVED latch channel. */
  readonly latch: PendingLatch<CapabilityResult>;
  /** LIVE accessor: the frame's record emitter (top: the attach cell;
   * composed: the build-stage cell — undefined only in the realistic-
   * impossible pre-build window; the pass skips that partial silently). */
  readonly emitter: () => StatusEmitter | undefined;
}

/** Private structural view over the captured top-frame ref — typing
 * WITHOUT a cast: the REQUIRED shared member counters() defeats weak-type
 * TS2559 rejection (an all-optional target would fail against PioSession);
 * the OPTIONAL rebind? keeps the assignment legal while PioSession does
 * not declare the method. */
interface TopFrameRebindView {
  counters(): SessionCounters;
  rebind?(session: AgentSession): void;
}

/** THE single process-scoped holder binding (context + live ledger);
 * one binding, never stacked. */
interface FrameHolder {
  readonly context: FrameEnvironmentContext;
  /** The live internal array — consumers never mutate; composed-frame
   * push/pop operate on it in place internally. */
  readonly frames: ActiveFrame[];
}

let holder: FrameHolder | undefined;

/** Module cell: the top frame's record emitter (filled first-wins by
 * attachTopEmitter; torn down with the holder). */
let topEmitterCell: StatusEmitter | undefined;

/** THE installed holder (loud fail when absent) — the module-private read
 * site for installed-state consumers. */
function requireInstalled(): FrameHolder {
  if (holder === undefined) {
    throw new FrameEnvironmentError(NOT_INSTALLED_MESSAGE);
  }
  return holder;
}

/** Installs the SINGLE holder (single-holder doctrine); derives the entry's
 * top frame as the FIRST ledger entry. LOUD throw on double-install — no
 * partial state mutation on the failed attempt. */
export function installFrameEnvironment(
  context: FrameEnvironmentContext,
): void {
  if (holder !== undefined) {
    throw new FrameEnvironmentError(DOUBLE_INSTALL_MESSAGE);
  }
  const topFrame = context.topFrame;
  const view: TopFrameRebindView = topFrame;
  holder = {
    context,
    frames: [
      {
        depth: 0,
        capability: TOP_FRAME_STAMP,
        scopeDir: context.sessionsRoot, // byte-equal echo
        // LIVE closures over the captured reference — a post-install state
        // change is reflected in the next read (mirror the entry's own
        // emitter wiring in run-session.ts).
        sessionFile: (): string | undefined =>
          topFrame.runtime.session.sessionFile,
        tokens: (): number => topFrame.counters().tokens,
        // Call-time delegation: the property lookup happens INSIDE the
        // closure body (soft optional call — see header).
        rebind: (session: AgentSession): void => {
          view.rebind?.(session);
        },
        // Minted at install, PARKED.
        latch: createPendingLatch<CapabilityResult>(),
        // THE top-emitter cell (attachTopEmitter fills it first-wins;
        // teardown resets it with the holder).
        emitter: (): StatusEmitter | undefined => topEmitterCell,
      },
    ],
  };
}

/** The idempotent inverse: nulls the holder + the top-emitter cell (a
 * second call is a silent no-op; no production caller exists). */
export function teardownFrameEnvironment(): void {
  holder = undefined;
  topEmitterCell = undefined;
}

/** Index 0 = outermost, last = innermost. Returns the LIVE internal array
 * (by reference, readonly-typed). THROWS the pinned not-installed error
 * when no holder is installed. */
export function activeFrames(): readonly ActiveFrame[] {
  if (holder === undefined) {
    throw new FrameEnvironmentError(NOT_INSTALLED_MESSAGE);
  }
  return holder.frames;
}

/** Bind the entry's emitter to the OUTERMOST ledger entry's LIVE accessor
 * cell. FIRST-WINS: a second attach is a silent no-op (the entry attaches
 * exactly once per process). Uninstalled ⇒ the pinned not-installed error
 * (requireInstalled doctrine — reuse, don't invent bytes). */
export function attachTopEmitter(emitter: StatusEmitter): void {
  requireInstalled();
  if (topEmitterCell === undefined) {
    topEmitterCell = emitter;
  }
}

/** Non-throwing holder predicate (the entry boundary branches on it). */
export function isFrameEnvironmentInstalled(): boolean {
  return holder !== undefined;
}

/** Input bag for ONE hop: the callee's capability stamp plus the body
 * closure executed over the adopted child frame. Seams thread into the
 * engagement-id mint (deterministic ids); production omits them. */
export interface MaterializeFrameInput {
  /** The CALLEE's identity stamp (stamped into the child frame's ledger
   * entry and its record; same house name the downstream fields carry).
   * Deliberately NOT the full Contract — lineage-free, IO-vocabulary-free. */
  readonly capability: Readonly<{
    readonly name: string;
    readonly version: string;
  }>;
  /** Runs over the ADOPTED child frame; its return value is the outputs
   * payload (faults become the captured failure payload). */
  readonly body: (childFrame: PioSession) => Promise<Record<string, unknown>>;
  /** Test seams (clock + entropy) threaded into the id mint; absent in
   * production. */
  readonly idSeams?: IdSeams;
}

/** THE attached-span bundle flowing between the groups (scope + files +
 * the pushed entry + the pre-hop parent transcript). */
interface AttachedFrame {
  readonly childScopeDir: string;
  readonly childFile: string;
  readonly parentFile: string;
  readonly entry: ActiveFrame;
}

/** THE built-frame bundle (host + child emitter). */
interface BuiltFrame {
  readonly childHost: PioSession;
  readonly childEmitter: StatusEmitter;
}

/** Per-hop orchestration: a thin sequencer whose grouped internals each
 * own one forced-order span (mint / attach / build / record / restore /
 * release). */
class HopOrchestrator {
  #input: MaterializeFrameInput;
  #latch: PendingLatch<CapabilityResult>;
  /** Shared runtime reach path via topFrame.runtime. */
  #topFrame: PioSession;
  /** The frame this hop attaches UNDER; its rebind re-arms the parent. */
  #parentEntry: ActiveFrame;
  /** Set at the build stage; the ledger accessors close over it and are
   * first invoked strictly after the build. */
  #childHost: PioSession | undefined;
  /** Set at the build stage (the ledger entry's emitter accessor closes
   * over it — mirrors the #childHost precedent). */
  #childEmitter: StatusEmitter | undefined;
  /** Set at the ledger push; cleared at the release. */
  #pushed: ActiveFrame | undefined;

  constructor(
    input: MaterializeFrameInput,
    latch: PendingLatch<CapabilityResult>,
    topFrame: PioSession,
    parentEntry: ActiveFrame,
  ) {
    this.#input = input;
    this.#latch = latch;
    this.#topFrame = topFrame;
    this.#parentEntry = parentEntry;
  }

  /** Detached continuation: the staged span never escapes (every machinery
   * fault converts to the typed capture); release then runs once, so the
   * latch settles on every reachable fault path. */
  async run(): Promise<void> {
    let released = false;
    const settled = await (async (): Promise<CapabilityResult> => {
      const attached = await this.#attachChildFrame();
      const built = this.#buildChildFrame(attached);
      const record = await this.#runBodyAndRecord(built);
      await this.#restoreParent(attached);
      return record;
    })().catch((error: unknown): CapabilityResult => {
      // Pre-push (nothing pushed), post-attach (accepted residue), or post-
      // record (the record stands) — the await receives THIS fault's typed
      // capture, never the body's payload.
      return { ok: false, errors: [captureError(error)] };
    });
    if (!released) {
      released = true;
      this.#releaseFrame(settled);
    }
  }

  /** Mint half of the attach span: scope dir one segment under the parent
   * frame's scope dir (grandchildren mint further segments regardless of
   * depth); the platform-named file comes through the module's SOLE SDK
   * value reach — the hop-time thunk (no lineage options; the file may not
   * exist yet — the open preserves the explicit path). */
  async #mintChildScope(): Promise<{
    childScopeDir: string;
    childFile: string;
  }> {
    const childId = mintEngagementId(this.#input.idSeams);
    const childScopeDir = join(this.#parentEntry.scopeDir, childId);
    const childTopDir = join(childScopeDir, "top");
    // The module's ONLY SDK value reach — fires only inside the detached
    // continuation (module load stays SDK-value-free).
    const { SessionManager } = await import("@earendil-works/pi-coding-agent");
    const manager = SessionManager.create(
      this.#topFrame.runtime.cwd,
      childTopDir,
    );
    const childFile = manager.getSessionFile();
    if (childFile === undefined) {
      // Defensive: the platform always names a file for a persisted dir.
      throw new HopFaultError(MINT_UNNAMED_MESSAGE);
    }
    return { childScopeDir, childFile };
  }

  /** Switch-out + ledger push (the mint nested for the fixed internal
   * order). The parent transcript is captured pre-hop (absent is a guard,
   * not a path); the entry is pushed only AFTER the switch-out succeeds —
   * a cancelled switch pushes nothing with the parent still current; a raw
   * rejection escapes unmasked into the catch-all. */
  async #attachChildFrame(): Promise<AttachedFrame> {
    const runtime = this.#topFrame.runtime;
    const parentFile = runtime.session.sessionFile;
    if (parentFile === undefined) {
      throw new HopFaultError(PARENT_UNNAMED_MESSAGE);
    }
    const scoped = await this.#mintChildScope();
    const switched = await runtime.switchSession(scoped.childFile, {
      cwdOverride: runtime.cwd,
    });
    if (switched.cancelled) {
      // Nothing pushed — the parent is still the runtime's current handle.
      throw new HopFaultError(CANCELLED_SWITCH_MESSAGE);
    }
    const frames = requireInstalled().frames;
    const entry: ActiveFrame = {
      depth: frames.length, // top entry is depth 0 → first composed push = 1
      capability: {
        name: this.#input.capability.name,
        version: this.#input.capability.version,
      },
      scopeDir: scoped.childScopeDir,
      // CAPTURED CONSTANT — never a live read of the shared runtime's
      // current handle (post-switch-back that handle is the parent's).
      sessionFile: (): string | undefined => scoped.childFile,
      // LIVE over the child host. The narrowing cast is sound: the host
      // attaches at the next stage and the accessor is first invoked after
      // it. A closure (not a bare method ref) so `this` survives strict
      // mode; the same latch the dispatcher minted lets the shutdown pass
      // find pending composed frames.
      tokens: (): number => (this.#childHost as PioSession).counters().tokens,
      rebind: (session: AgentSession): void =>
        (this.#childHost as PioSession).rebind(session),
      latch: this.#latch,
      // THE build-stage cell — undefined only in the realistic-impossible
      // push-before-build window (the pass skips that partial silently).
      emitter: (): StatusEmitter | undefined => this.#childEmitter,
    };
    frames.push(entry);
    this.#pushed = entry;
    return { ...scoped, parentFile, entry };
  }

  /** Host attach + child-emitter wiring WHILE the child handle is current
   * (no yield between the swap and the subscription landing). Composed
   * emitters never arm signal handling — that stays entry-owned. The
   * record roots at the child scope dir, stamped from the input capability;
   * composed emitters take no clock seam (module defaults apply). */
  #buildChildFrame(attached: AttachedFrame): BuiltFrame {
    const childHost = PioSession.fromRuntime(this.#topFrame.runtime);
    this.#childHost = childHost;
    const childEmitter = createStatusEmitter({
      sessionsRoot: attached.childScopeDir,
      capability: {
        name: this.#input.capability.name,
        version: this.#input.capability.version,
      },
      // Fresh read at emit time over the adopted host.
      tokens: (): number => childHost.counters().tokens,
      // Captured constant (see the ledger entry wiring above).
      sessionFile: (): string | undefined => attached.childFile,
    });
    this.#childEmitter = childEmitter;
    return { childHost, childEmitter };
  }

  /** Body → settled → unconditional record emission before the group
   * resolves. One payload serves both channels (outputs by reference, or
   * the shipped capture ladder); the body's fault is the captured payload,
   * never an escape. */
  async #runBodyAndRecord(built: BuiltFrame): Promise<CapabilityResult> {
    let settled: CapabilityResult;
    try {
      const outputs = await this.#input.body(built.childHost);
      settled = { ok: true, outputs };
    } catch (error) {
      settled = { ok: false, errors: [captureError(error)] };
    }
    await built.childEmitter.emit(settled);
    return settled;
  }

  /** Switch back onto the CAPTURED parent file, then re-arm with no yield
   * in between. A rejecting switch-back settles as the pinned switch-back
   * fault — the record already stands; the measured physics keeps the
   * reopened parent's retained identity past the rebind gate. */
  async #restoreParent(attached: AttachedFrame): Promise<void> {
    const runtime = this.#topFrame.runtime;
    try {
      await runtime.switchSession(attached.parentFile, {
        cwdOverride: runtime.cwd,
      });
    } catch (_error) {
      // The record is durable; the raw rejection is deliberately masked.
      throw new HopFaultError(SWITCH_BACK_FAILED_MESSAGE);
    }
    // No await between the switch-back resolution and this call.
    this.#parentEntry.rebind(runtime.session);
  }

  /** Pop (only if this hop pushed) + latch resolve — one synchronous
   * gesture; repeated settlement is inert (first-settlement-wins). */
  #releaseFrame(settled: CapabilityResult): void {
    if (this.#pushed !== undefined) {
      const frames = requireInstalled().frames;
      if (frames[frames.length - 1] === this.#pushed) {
        frames.pop();
      }
      this.#pushed = undefined;
    }
    this.#latch.resolve(settled);
  }
}

/**
 * THE row-2 composition entry. Synchronous on purpose: the holder guard
 * throws OUT of this function when uninstalled (base-level catch-all
 * captures it), the latch is minted before any mutation, a detached
 * continuation owns the remaining stages, and the caller receives the
 * latch value immediately. Settlement uses `resolve` exclusively — the
 * `reject` channel is reserved for the ordered shutdown pass.
 */
export function materializeFrame(
  input: MaterializeFrameInput,
): Promise<CapabilityResult> {
  // Synchronous holder guard + current-frame read.
  const installed = requireInstalled();
  const frames = installed.frames;
  const latch = createPendingLatch<CapabilityResult>();
  const orchestrator = new HopOrchestrator(
    input,
    latch,
    installed.context.topFrame,
    frames[frames.length - 1],
  );
  // THE detached continuation (fire-and-forget): it settles the latch
  // from INSIDE run() on every reachable fault path; the net covers a
  // theoretical executor fault so the caller's await can never hang.
  void orchestrator.run().catch((error: unknown): void => {
    latch.resolve({ ok: false, errors: [captureError(error)] });
  });
  return latch.value;
}

// ── THE ordered shutdown pass + process-exit guard ───────────────────────

/** Closed trigger vocabulary (erased type alias). */
export type ShutdownCause = "user-abort" | "sigterm" | "fatal";

/** THE per-cause record literals (the sigterm form is the BYTES-STABLE
 * shipped pin; the others are the pass's own closed forms). */
const CAUSE_LITERALS: Record<ShutdownCause, SessionStatusError> = {
  "user-abort": { type: "user-abort", cause: "kill" },
  sigterm: { type: "SIGTERM", cause: "kill" },
  fatal: { type: "fatal", cause: "kill" },
};

/** THE normalized exit-code map (idempotent under the wrapper — applied
 * regardless of the incoming argument once fired). 130 matches the host-
 * side child-exit passthrough. */
const EXIT_CODES: Record<ShutdownCause, number> = {
  "user-abort": 130,
  sigterm: 1,
  fatal: 1,
};

export interface ShutdownGuardSeams {
  /** Underlying termination sink. Default: the native exit. */
  readonly exit?: (code: number) => void;
  /** Signal-registration target. Default: the bare process value (structural
   * conformance — no member access beyond the exit seam itself). */
  readonly signals?: KillCaptureTarget;
}

export interface ShutdownGuard {
  /** THE wrapped termination sink (rows invoke it to simulate an in-
   * terminal exit). */
  readonly exit: (code?: number) => void;
  /** Run the pass NOW (first trigger wins; later calls no-op). Resolves when
   * the pass completes (through the typed line). The sigterm variant
   * self-exits through the wrapped sink at that point; the fatal variant
   * does NOT — its caller continues and rides the resolution channel. */
  trigger(cause: ShutdownCause): Promise<void>;
  /** Idempotent disable: the wrapper degrades to raw passthrough, the
   * handler no-ops, and the native sink is restored when it was wrapped.
   * No listener removal required — a stale handler on a dead target is
   * inert. */
  uninstall(): void;
}

/** Pass state lives on the GUARD (not the holder) so the uninstalled window
 * can still normalize: silent death = cause recorded + code normalized, NO
 * legs run (there is nothing to describe). */
interface GuardState {
  cause: ShutdownCause | undefined;
  fired: boolean;
  /** Stop-once flag over the terminal-stop leg. */
  stoppedOnce: boolean;
  disabled: boolean;
}

/** Leg (a): reject the pending COMPOSED latches INNERMOST-FIRST with the
 * pinned FrameKillError. The PARKED top latch is skipped (no consumer —
 * rejecting it would raise an unhandled-rejection hazard; process death
 * reclaims it). */
function rejectComposedLatches(frames: readonly ActiveFrame[]): void {
  for (let i = frames.length - 1; i >= 1; i -= 1) {
    frames[i].latch.reject(new FrameKillError());
  }
}

/** Legs (b)+(c) — NON-user-abort triggers only (the in-terminal path owns
 * both on the user-abort leg): stop the mounted terminal (stop-once), then
 * dispose the shared runtime. Every secondary fault swallowed — a dying
 * process yields to the primary death, and racing duplicates arrive
 * tolerated. */
async function stopAndDispose(
  context: FrameEnvironmentContext,
  state: GuardState,
): Promise<void> {
  if (!state.stoppedOnce) {
    state.stoppedOnce = true;
    try {
      context.terminalStop();
    } catch {
      // Secondary fault — swallowed.
    }
  }
  try {
    await context.topFrame.runtime.dispose();
  } catch {
    // Secondary fault — swallowed.
  }
}

/** Leg (d) SYNC walk: the per-frame PARTIALS innermost-first over the
 * trigger-time snapshot; the fatal walk EXCLUDES the top (its caller owns
 * the captured-error record there); a missing frame emitter skips silently
 * (realistic-impossible pre-build window). Claim-respecting throughout — a
 * completed frame's terminal record is NEVER overwritten. */
function emitPartialsSync(
  frames: readonly ActiveFrame[],
  cause: ShutdownCause,
): void {
  const literal = CAUSE_LITERALS[cause];
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    // THE fatal-top exclusion mirrors the async walk: today's sync
    // triggers are user-abort only, so this branch stays dormant — but
    // both walks stay uniform so any future sync cause inherits the
    // boundary's top-record ownership rule instead of drifting from it.
    if (cause === "fatal" && frame.depth === 0) {
      continue;
    }
    const emitter = frame.emitter();
    if (emitter !== undefined) {
      emitter.emitPartialSync(literal);
    }
  }
}

/** Leg (d) ASYNC walk: the same shape AWAITED sequentially — each honors
 * its emitter's grace window (resolves immediately in practice: no live-run
 * settle hook exists past the entry). */
async function emitPartialsAsync(
  frames: readonly ActiveFrame[],
  cause: ShutdownCause,
): Promise<void> {
  const literal = CAUSE_LITERALS[cause];
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (cause === "fatal" && frame.depth === 0) {
      continue;
    }
    const emitter = frame.emitter();
    if (emitter !== undefined) {
      await emitter.emitPartial(literal);
    }
  }
}

/** Leg (e): ONE best-effort SYNCHRONOUS ledger snapshot at
 * `<sessionsRoot>/frames.json` — the frame tree (who-called-whom nesting
 * edges durable on abnormal exit ONLY), the INNERMOST active scope, and the
 * cause token. Canonical key order (cause → activeScope → frames; per node
 * depth → capability → scopeDir → sessionFile → children; sessionFile
 * ABSENT when the live accessor is unnamed — never null); 2-space indent +
 * trailing newline (same discipline as serializeStatus). Written ONLY on
 * pass triggers; every fault swallowed (the writer swallows). */
function writeLedgerSnapshot(
  sessionsRoot: string,
  frames: readonly ActiveFrame[],
  cause: ShutdownCause,
): void {
  let subtree: unknown[] = [];
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    const node: Record<string, unknown> = {
      depth: frame.depth,
      capability: {
        name: frame.capability.name,
        version: frame.capability.version,
      },
      scopeDir: frame.scopeDir,
    };
    const file = frame.sessionFile();
    if (file !== undefined) {
      node.sessionFile = file;
    }
    node.children = subtree;
    subtree = [node];
  }
  const innermost = frames[frames.length - 1];
  writeUtf8Sync(
    join(sessionsRoot, "frames.json"),
    `${JSON.stringify(
      { cause, activeScope: innermost.scopeDir, frames: subtree },
      null,
      2,
    )}\n`,
  );
}

/** Leg (f): THE typed exit line — AFTER cooked-mode restore, through the
 * holder's stderr sink (lines arrive WITHOUT trailing newline; the sink
 * appends). Best-effort: a faulting sink loses to the primary death. */
function emitTypedLine(
  stderr: (line: string) => void,
  frame: ActiveFrame,
  cause: ShutdownCause,
): void {
  try {
    stderr(
      `terminal-takeover: shutdown \u2014 frame '${frame.capability.name}@${frame.capability.version}' (depth ${frame.depth}) ended by ${cause}`,
    );
  } catch {
    // Best-effort — a faulting sink must never mask the primary death.
  }
}

/** THE synchronous pass (user-abort — everything completes before the
 * wrapper delegates to the original sink): legs (a), (d-sync), (e), (f).
 * Legs (b)/(c) are IM-owned on this path; NO awaits anywhere (structurally
 * enforced: the sync writers return void). Holder data is read at execution
 * time; an uninstalled holder runs NO legs (nothing to describe). */
function runPassSync(cause: ShutdownCause, state: GuardState): void {
  state.cause = cause;
  state.fired = true;
  const installed = holder;
  if (installed === undefined) {
    return; // silent death: cause + code normalized, no legs
  }
  const frames = installed.frames.slice(); // trigger-time snapshot
  rejectComposedLatches(frames);
  emitPartialsSync(frames, cause);
  writeLedgerSnapshot(installed.context.sessionsRoot, frames, cause);
  emitTypedLine(installed.context.stderr, frames[frames.length - 1], cause);
}

/** THE asynchronous pass (sigterm / fatal): leg (a) sync, legs (b)/(c)
 * awaited best-effort, leg (d) AWAITED innermost-first, legs (e)/(f) sync.
 * Same silent-death behavior for the uninstalled window. */
async function runPassAsync(
  cause: ShutdownCause,
  state: GuardState,
): Promise<void> {
  state.cause = cause;
  state.fired = true;
  const installed = holder;
  if (installed === undefined) {
    return;
  }
  const frames = installed.frames.slice();
  rejectComposedLatches(frames);
  if (cause !== "user-abort") {
    await stopAndDispose(installed.context, state);
  }
  await emitPartialsAsync(frames, cause);
  writeLedgerSnapshot(installed.context.sessionsRoot, frames, cause);
  emitTypedLine(installed.context.stderr, frames[frames.length - 1], cause);
}

/** Structural view over the native termination sink (the in-place wrap
 * needs a cast: the host type admits wider codes than the house signature).
 */
interface ExitSinkView {
  exit: (code?: number) => void;
}

/** Install the process-exit guard and return its handle. Does THREE things:
 * wraps the underlying sink (rows supply a seam — the suite never wraps the
 * real process sink; with NO seam the wrap lands IN PLACE over the native
 * one and uninstall restores it), prepends ONE sigterm handler (last
 * prepended ⇒ first to run — ahead of the entry's own kill capture), and
 * exposes the handle. */
export function installExitGuard(seams?: ShutdownGuardSeams): ShutdownGuard {
  const nativeView = process as ExitSinkView;
  // The seam signature takes a REQUIRED code; the house signature widens
  // it optional (0 when absent) — adapt without inventing new bytes.
  const seamExit = seams?.exit;
  const original: (code?: number) => void =
    seamExit === undefined
      ? nativeView.exit
      : (code?: number): void => {
          seamExit(code ?? 0);
        };
  const signals: KillCaptureTarget = seams?.signals ?? process;
  const state: GuardState = {
    cause: undefined,
    fired: false,
    stoppedOnce: false,
    disabled: false,
  };

  /** THE wrapper (the discrimination crux): FIRED ⇒ the code is NORMALIZED
   * by the recorded cause — idempotent regardless of the incoming argument
   * (repeated wrapper calls re-normalize). NOT fired + holder INSTALLED +
   * the top record UNCLAIMED (an absent attach cell counts as unclaimed —
   * defensive) ⇒ THE USER-ABORT TRIGGER: sync pass, then the mapped code.
   * Otherwise CLEAN PASSTHROUGH — success OR degraded failure, both of
   * which settled the top claim before exiting: no writes, no typed line,
   * no state mutation (structurally unreachable pass). */
  const wrapper: (code?: number) => void = (code = 0): void => {
    if (state.disabled) {
      original(code);
      return;
    }
    if (state.cause !== undefined) {
      original(EXIT_CODES[state.cause]);
      return;
    }
    const installed = holder;
    if (installed !== undefined) {
      const top = installed.frames[0];
      const topEmitter = top === undefined ? undefined : top.emitter();
      if (topEmitter === undefined || !topEmitter.hasClaimed()) {
        runPassSync("user-abort", state);
        original(EXIT_CODES["user-abort"]);
        return;
      }
    }
    original(code);
  };

  const wrappedNative = seamExit === undefined;
  if (wrappedNative) {
    nativeView.exit = wrapper;
  }

  async function triggerInternal(cause: ShutdownCause): Promise<void> {
    if (state.disabled || state.fired) {
      return; // first trigger wins; later calls no-op
    }
    await runPassAsync(cause, state);
    if (cause === "sigterm") {
      // Signal listeners defer default termination — without an explicit
      // exit the process hangs: self-exit through the guard's OWN wrapped
      // sink (wrapper ⇒ original, normalized).
      wrapper();
    }
  }

  /** THE sigterm handler: fire the async pass (self-exit variant), swallow
   * EVERY fault (a signal handler must never throw into runtime dispatch).
   */
  const handler = (): void => {
    try {
      void triggerInternal("sigterm");
    } catch {
      // Silent — the trigger path is async; nothing escapes here.
    }
  };
  signals.prependListener("SIGTERM", handler);

  return {
    exit: wrapper,
    trigger: (cause: ShutdownCause): Promise<void> => triggerInternal(cause),
    uninstall: (): void => {
      state.disabled = true;
      if (wrappedNative) {
        nativeView.exit = original; // restore the saved native sink
      }
    },
  };
}
