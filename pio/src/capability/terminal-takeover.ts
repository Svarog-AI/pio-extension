// Terminal-takeover composition — process-scoped frame environment + the
// hop primitive. A FRAME is one composed capability execution held on the
// shared runtime under the entry's live terminal; the ledger tracks every
// depth (index 0 = outermost, last = innermost).
//
// Single holder per process: a double-install throws LOUDLY without
// mutating state; an uninstalled read throws the pinned not-installed
// error (loud failure over quiet mis-layout); teardownFrameEnvironment()
// is the idempotent inverse. Every ledger entry carries a PendingLatch
// over a native promise: normal settlement resolves it exclusively, the
// reject channel belongs to the ordered shutdown pass; the outermost
// entry's latch is minted and PARKED (never settled — process death
// reclaims it).
//
// Hop mechanics (materializeFrame): the caller's promise identity is fixed
// EARLY — the holder guard runs SYNCHRONOUSLY (an uninstalled read throws
// the pinned error out of the function before any mutation), the latch is
// minted before any other step, and a detached continuation owns the rest.
// The continuation captures the parent transcript PRE-HOP, mints the child
// scope dir one segment under the CURRENT frame's scope dir, computes the
// child's platform-named file through the module's SOLE SDK value reach
// (a hop-time thunk over the SDK root; NO lineage options are ever passed
// — who-called-whom edges live ONLY in the runtime ledger), switches the
// shared runtime onto the child, pushes the ledger entry, hosts a fresh
// composed session while the child handle is current, emits the UNCOND-
// ITIONAL child record from the settled payload BEFORE settling, switches
// back, re-arms the parent's persistent observer on the freshly reopened
// handle with NO yield in between, and pops the entry while resolving the
// latch in ONE synchronous gesture. The caller's await receives the
// settled payload BY REFERENCE.
//
// Winds-unwound: everything from the ledger push onward sits in the
// orchestrator's try/finally — release ALWAYS runs (pop + latch resolve,
// guarded to exactly once per hop), so the caller's await RESOLVES with a
// shipped result shape on every reachable fault path: it never hangs and
// never rejects in this pass (reject stays reserved for the ordered
// shutdown pass). Pre-push faults leave the ledger untouched; the sole
// post-attach/pre-record fault case leaves any minted scope dir behind as
// ACCEPTED RESIDUE — never rmdir a scope the platform may have touched.
// Linear, non-concurrent, single-process.
//
// Stance: this module NEVER constructs or drives the process terminal and
// attaches NO process handlers of any kind — terminal and signal concerns
// belong to the outermost entry alone; composed-frame emitters skip kill-
// capture arming entirely. Edge behavior: a responsive abort while a child
// owns the terminal settles through the body-fault path (typed capture,
// record, switch-back proceeds normally); a true wedge freezes the call
// chain — accepted per the owner hang semantics; recovery belongs to the
// ordered death pass.
//
// Accepted edge: the top entry's rebind closure performs a SOFT OPTIONAL
// CALL through TopFrameRebindView (the required counters() member defeats
// weak-type TS2559; the optional rebind? keeps the assignment legal while
// PioSession does not declare the method). A missing rebind at call time
// would skip the re-arm silently — cannot occur in the shipped sequence;
// downstream suites carry the tripwires.

import { join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { IdSeams } from "../sandbox/layout.ts";
import { mintEngagementId } from "../sandbox/layout.ts";
import type { SessionCounters } from "./pio-session.ts";
import { PioSession } from "./pio-session.ts";
import type { CapabilityResult, StatusEmitter } from "./status.ts";
import { captureError, createStatusEmitter } from "./status.ts";

/** Outermost-entry stamp: AUDIT-IDENTITY ONLY — the install context
 * carries no capability identity, so a self-evidently-placeholder stamp
 * keeps the ledger shape uniform across depths. The durable top-frame
 * record identity is owned by the entry's status emitter; this never
 * serializes into a status.json. */
const TOP_FRAME_STAMP: Readonly<{
  readonly name: string;
  readonly version: string;
}> = { name: "top", version: "0.0.0" };

// Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
const NOT_INSTALLED_MESSAGE =
  "terminal-takeover: frame environment not installed \u2014 a session-absent capability can only run under the engaged entry";

const DOUBLE_INSTALL_MESSAGE =
  "terminal-takeover: frame environment already installed \u2014 single-holder doctrine; teardown before reinstalling";

// THE four pinned hop-fault messages (owner: the HopFaultError throw sites
// below). Escaped so the U+2014 bytes survive editor and toolkit glyph
// mangling.
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

/** Per-hop orchestration state: the thin sequencer plus the six grouped
 * internals (grouped-methods doctrine — a forced-order unit lives INSIDE
 * one method so misordering is unrepresentable; the group boundaries are
 * the mint / attach / build / record / restore / release spans). */
class HopOrchestrator {
  #input: MaterializeFrameInput;
  #latch: PendingLatch<CapabilityResult>;
  /** Reach path: the shared runtime via topFrame.runtime. */
  #topFrame: PioSession;
  /** THE frame this hop attaches UNDER (the current frame at dispatch
   * time); its rebind closure re-arms the parent after the switch-back. */
  #parentEntry: ActiveFrame;
  /** Assigned at the build stage; the ledger accessors close over it and
   * are first invoked strictly after the build (body → record / re-arm). */
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

  /** THE detached continuation: sequences the groups under the
   * winds-unwound obligation — release ALWAYS runs after the staged span
   * (pop + latch resolve, exactly once per hop), so the latch settles on
   * every reachable fault path. The staged span never escapes: every
   * reachable machinery fault converts to the typed capture payload,
   * and the unwind-completed payload IS the record (same-payload dual
   * channels). */
  async run(): Promise<void> {
    let released = false;
    const settled = await (async (): Promise<CapabilityResult> => {
      const attached = await this.#attachChildFrame();
      const built = this.#buildChildFrame(attached);
      const record = await this.#runBodyAndRecord(built);
      await this.#restoreParent(attached);
      return record;
    })().catch((error: unknown): CapabilityResult => {
      // EVERY reachable machinery fault lands here: pre-push (nothing
      // pushed), post-attach/pre-record (accepted residue), or post-
      // record (the record stands). The await receives the typed capture
      // of THIS fault — never the body's payload.
      return { ok: false, errors: [captureError(error)] };
    });
    // THE release gesture — guarded to exactly once per hop (belt-and-
    // suspenders over the linear single-process flow; a repeated settle
    // would be inert under native first-settlement-wins anyway).
    if (!released) {
      released = true;
      this.#releaseFrame(settled);
    }
  }

  /** THE child scope + platform-named file (the mint half of the attach
   * span). Scope dirs nest ONE SEGMENT PER HOP under the parent frame's
   * scope dir (grandchildren mint further segments regardless of depth);
   * the platform-named file is computed through the module's SOLE SDK
   * value reach — the hop-time thunk. NO lineage options are ever passed:
   * who-called-whom edges live ONLY in the ledger. The file may not yet
   * exist — the open preserves the explicit path. */
  async #mintChildScope(): Promise<{
    childScopeDir: string;
    childFile: string;
  }> {
    const childId = mintEngagementId(this.#input.idSeams);
    const childScopeDir = join(this.#parentEntry.scopeDir, childId);
    const childTopDir = join(childScopeDir, "top");
    // THE module's ONLY SDK value reach — fires only inside the detached
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

  /** THE switch-out + ledger push (with the mint nested for the fixed
   * internal order). The parent transcript is captured PRE-HOP — absent
   * is a guard, not a path. The entry is pushed ONLY after the switch-out
   * succeeds; a cancelled switch leaves NOTHING pushed with the parent
   * still current (no teardown occurred); a raw rejection escapes
   * UNMASKED into the catch-all. */
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
      // Nothing pushed, no teardown occurred — the parent is still the
      // runtime's current handle.
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
      // THE CAPTURED CONSTANT — never a live read of the shared runtime's
      // current handle (post-switch-back that handle is the PARENT's and a
      // live read would stamp the parent's transcript into this frame's
      // record).
      sessionFile: (): string | undefined => scoped.childFile,
      // LIVE over the child host. The host attaches at the NEXT stage; the
      // narrowing cast is sound because the accessor is first invoked
      // strictly after it (body → record / re-arm).
      tokens: (): number => (this.#childHost as PioSession).counters().tokens,
      // Closure capturing the child host: a bare method reference would
      // detach `this` under strict mode and crash at the re-arm.
      rebind: (session: AgentSession): void =>
        (this.#childHost as PioSession).rebind(session),
      // THE SAME latch the dispatcher minted — the kill pass finds pending
      // composed frames through it.
      latch: this.#latch,
    };
    frames.push(entry);
    this.#pushed = entry;
    return { ...scoped, parentFile, entry };
  }

  /** THE host attach + child-emitter wiring, performed WHILE the child
   * handle is current (adjacency-protected: no yield between the
   * switch-out resolution and the subscription landing on the child
   * handle). Composed-frame emitters NEVER arm kill capture — signal
   * handling stays entry-owned. The child's record lands at
   * `<childScopeDir>/top/status.json` through the existing top-slot
   * derivation (rooted at the child scope dir, stamped from the input
   * contract; grace/now defaults apply — composed emitters take no clock
   * seam; no settlement hook). */
  #buildChildFrame(attached: AttachedFrame): BuiltFrame {
    const childHost = PioSession.fromRuntime(this.#topFrame.runtime);
    this.#childHost = childHost;
    const childEmitter = createStatusEmitter({
      sessionsRoot: attached.childScopeDir,
      capability: {
        name: this.#input.contract.name,
        version: this.#input.contract.version,
      },
      // LIVE over the child host (fresh read at emit time).
      tokens: (): number => childHost.counters().tokens,
      // THE CAPTURED CONSTANT (see the ledger entry wiring above).
      sessionFile: (): string | undefined => attached.childFile,
    });
    return { childHost, childEmitter };
  }

  /** THE body → settled → UNCONDITIONAL record emission, BEFORE the group
   * resolves. The settled payload is assembled IDENTICALLY for both
   * channels — success: the outputs by reference; fault: the SAME
   * capture ladder the shipped paths use — and emitted one-shot per
   * session scope through the emitter's claim discipline. Never throws:
   * the body's fault IS the captured payload, not an escape. */
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

  /** THE switch-back + parent re-arm with NO yield between them (the
   * re-arm must land before anything else can observe the swap). The
   * parent transcript is the CAPTURED pre-hop value, not a re-read. A
   * rejecting switch-back settles as the pinned switch-back hop fault —
   * the child record already stands and the re-arm is skipped. By the
   * measured physics the reopened parent retains its file-backed identity
   * (the identity gate passes) and is a FRESH handle (the no-op gate
   * cannot fire). */
  async #restoreParent(attached: AttachedFrame): Promise<void> {
    const runtime = this.#topFrame.runtime;
    try {
      await runtime.switchSession(attached.parentFile, {
        cwdOverride: runtime.cwd,
      });
    } catch (_error) {
      // The record (emitted before the switch-back) is durable; the raw
      // rejection is DELIBERATELY masked by the pinned typed fault.
      throw new HopFaultError(SWITCH_BACK_FAILED_MESSAGE);
    }
    // NO await between the switch-back resolution and this call.
    this.#parentEntry.rebind(runtime.session);
  }

  /** THE pop + latch resolution — ONE synchronous gesture. The pop is
   * conditional on the push having happened (pre-push faults leave the
   * ledger untouched); repeated settlement is inert (native first-
   * settlement-wins). */
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
 * THE row-2 composition entry: takes the terminal for one composed frame
 * and returns the caller's settlement promise immediately.
 *
 * SYNCHRONOUS dispatcher (D-sync refinement, NOT a plain async function):
 * the holder guard runs SYNCHRONOUSLY — an uninstalled read throws the
 * pinned not-installed error OUT of this function (the base-level catch-
 * all captures it; "run never rejects" holds). The latch is minted BEFORE
 * any mutation (the caller's promise identity is fixed early), a DETACHED
 * continuation owns the remaining stages, and the dispatcher RETURNS the
 * latch value. Normal settlement uses `resolve` EXCLUSIVELY — the `reject`
 * channel is reserved for the ordered shutdown pass and is never called
 * from this pass. Native promise semantics provide first-settlement-wins
 * and microtask resumption — no custom promise machinery.
 */
export function materializeFrame(
  input: MaterializeFrameInput,
): Promise<CapabilityResult> {
  // THE synchronous holder guard + current-frame read (throws the pinned
  // not-installed error synchronously when uninstalled).
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
