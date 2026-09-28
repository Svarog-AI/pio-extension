// Terminal-takeover composition — process-scoped frame environment. A
// FRAME is one composed capability execution held on the shared runtime
// under the entry's live terminal; the ledger tracks every depth (index 0
// = outermost, last = innermost).
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
// Type-only edge set: this module imports NOTHING at runtime (no SDK
// value reach, no dynamic thunks), so the holder suite runs over the real
// module with structural fakes and no SDK mock.
//
// Accepted edge: the top entry's rebind closure performs a SOFT OPTIONAL
// CALL through TopFrameRebindView (the required counters() member defeats
// weak-type TS2559; the optional rebind? keeps the assignment legal while
// PioSession does not declare the method). A missing rebind at call time
// would skip the re-arm silently — cannot occur in the shipped sequence;
// downstream suites carry the tripwires.

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { PioSession, SessionCounters } from "./pio-session.ts";
import type { CapabilityResult } from "./status.ts";

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

/** Module-local (module-owned, not the errors.ts home). Sets NO cause —
 * bare-identity capture reduces an instance to `{ type, message }`. */
export class FrameEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameEnvironmentError";
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
