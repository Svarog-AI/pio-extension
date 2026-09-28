// Terminal-takeover composition — process-scoped frame environment + the
// hop primitive. A FRAME is one composed capability execution held on the
// shared runtime under the entry's live terminal; the ledger tracks every
// depth (index 0 = outermost).
//
// Single holder per process: double-install throws loudly without mutating;
// an uninstalled read throws the pinned error; teardown is the idempotent
// inverse. Each ledger entry carries a PendingLatch over a native promise:
// normal settlement resolves it exclusively; the reject channel belongs to
// the ordered shutdown pass; the outermost latch is minted and parked
// (process death reclaims it).
//
// Hop mechanics (materializeFrame): synchronous dispatcher — the holder
// guard throws synchronously when uninstalled, the latch is minted first,
// and a detached continuation owns mint → switch-out → push → body →
// record → switch-back → re-arm → pop-with-resolve. It captures the parent
// transcript pre-hop, mints the child scope dir one segment under the
// current frame's scope dir (no lineage options ever — who-called-whom
// edges live only in the ledger), and switches back onto the captured file
// with no yield before the re-arm. The caller's await mirrors the emitted
// record by reference.
//
// Winds-unwound: release always runs after the staged span (pop-if-pushed +
// latch resolve, once per hop), so the await RESOLVES with a shipped result
// shape on every reachable fault path — it never hangs and never rejects in
// this pass (reject stays reserved for shutdown). Pre-push faults leave the
// ledger untouched; a post-attach/pre-record fault leaves the minted scope
// dir behind as accepted residue (never rmdir a scope the platform may have
// touched). Linear, non-concurrent, single-process.
//
// Stance: this module never constructs or drives the terminal and attaches
// no signal handlers — those belong to the outermost entry alone. A
// responsive abort mid-hop settles through the body-fault path; a true
// wedge freezes the chain (accepted per owner-hang semantics; recovery is
// the death pass's).
//
// Accepted edge: the top entry's rebind closure performs a soft optional
// call through TopFrameRebindView (required counters() defeats weak-type
// TS2559; optional rebind? keeps the assignment legal while PioSession does
// not declare the method). A missing rebind would skip the re-arm silently —
// cannot occur in the shipped sequence; downstream suites carry tripwires.

import { join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { IdSeams } from "../sandbox/layout.ts";
import { mintEngagementId } from "../sandbox/layout.ts";
import type { SessionCounters } from "./pio-session.ts";
import { PioSession } from "./pio-session.ts";
import type { CapabilityResult, StatusEmitter } from "./status.ts";
import { captureError, createStatusEmitter } from "./status.ts";

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
  /** Stamped identity (composed frames carry their callee contract). */
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
      },
    ],
  };
}

/** The idempotent inverse: nulls the holder (a second call is a silent
 * no-op; no production caller exists). */
export function teardownFrameEnvironment(): void {
  holder = undefined;
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

/** Input bag for ONE hop: the callee's contract stamp plus the body
 * closure executed over the adopted child frame. Seams thread into the
 * engagement-id mint (deterministic ids); production omits them. */
export interface MaterializeFrameInput {
  /** The CALLEE's identity stamp (stamped into the child frame's ledger
   * entry and its record). */
  readonly contract: Readonly<{
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
        name: this.#input.contract.name,
        version: this.#input.contract.version,
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
    };
    frames.push(entry);
    this.#pushed = entry;
    return { ...scoped, parentFile, entry };
  }

  /** Host attach + child-emitter wiring WHILE the child handle is current
   * (no yield between the swap and the subscription landing). Composed
   * emitters never arm signal handling — that stays entry-owned. The
   * record roots at the child scope dir, stamped from the input contract;
   * composed emitters take no clock seam (module defaults apply). */
  #buildChildFrame(attached: AttachedFrame): BuiltFrame {
    const childHost = PioSession.fromRuntime(this.#topFrame.runtime);
    this.#childHost = childHost;
    const childEmitter = createStatusEmitter({
      sessionsRoot: attached.childScopeDir,
      capability: {
        name: this.#input.contract.name,
        version: this.#input.contract.version,
      },
      // Fresh read at emit time over the adopted host.
      tokens: (): number => childHost.counters().tokens,
      // Captured constant (see the ledger entry wiring above).
      sessionFile: (): string | undefined => attached.childFile,
    });
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
