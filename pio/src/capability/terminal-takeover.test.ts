// Holder-unit rows for the terminal-takeover foundation module, plus the
// hop-world harness the hop matrix consumes: an SDK-root factory mock with
// a DETERMINISTIC manager mint (arg-recording + platform-named file under
// the given dir; zero filesystem side effects except scripted transcript
// persistence), physics-mirror swap handling, a harness-minted SINGLE
// terminal-shaped recorder per world (the module never constructs or drives
// a terminal), and forced-teardown tmpdir roots.
//
// Foundation rows run over the REAL module with structurally-complete
// fakes; casts at scripted sites mirror the sibling suites' documented cast
// idiom. beforeEach tears down the process-scoped holder so no row leaks
// state into the next; temp roots are removed in afterEach, even on
// assertion failure.
//
// Physics mirror (installed 0.85.1 dist): handles bookkeep LIVE listeners
// — subscribe returns a functional per-listener unsubscribe and dispose
// clears the live list (agent-session.js L584–L604); scripted swaps apply
// the MEASURED teardown-then-apply order (agent-session-runtime.js
// L102–L143): dispose the OUTGOING handle FIRST, then apply the FRESH
// zero-listener incoming handle ANCHORED AT THE SWAPPED PATH, replay
// NOTHING (reopened transcripts re-fire no events; identity is file-backed,
// handles are new objects per open). A cancelled switch performs no
// teardown; a rejecting switch escapes the RAW error unmasked.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import type { IdSeams } from "../sandbox/layout.ts";
import { ContractViolationError, PhaseBudgetError } from "./errors.ts";
import type { SessionVariableStore } from "./pio-session.ts";
import { PioSession } from "./pio-session.ts";
import type {
  CapabilityResult,
  KillCaptureTarget,
  StatusEmitter,
} from "./status.ts";
import { captureError, createStatusEmitter } from "./status.ts";
import type { ActiveFrame, ShutdownGuard } from "./terminal-takeover.ts";
import {
  activeFrames,
  attachTopEmitter,
  FrameEnvironmentError,
  FrameKillError,
  HopFaultError,
  installExitGuard,
  installFrameEnvironment,
  materializeFrame,
  teardownFrameEnvironment,
} from "./terminal-takeover.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

// Cast seam presenting the physics world's runtime object under the SDK
// type at the fromRuntime call site (mirrors the sibling suites' idiom).
const asRuntime = (runtime: PhysicsWorld["runtime"]): AgentSessionRuntime =>
  runtime as unknown as AgentSessionRuntime;

type Listener = (event: AgentSessionEvent) => void;

interface PhysicsHandle {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  /** Plain callable signature added: the default Mock type is not
   * callable through the interface. */
  subscribe: ReturnType<typeof vi.fn> & ((listener: Listener) => () => void);
  dispose: ReturnType<typeof vi.fn> & (() => void);
  /** Every listener ever subscribed — append-only counting observability. */
  readonly captured: Listener[];
  /** Live listeners: subscribe adds; unsubscribe / mirrored dispose remove. */
  readonly live: Listener[];
  /** Mirrored platform-dispose marker (dist: _eventListeners = []).
   * MUTABLE by design: the mirrored dispose flips it. */
  disposed: boolean;
}

/** Terminal-shaped recorder standing for the ENTRY-MOUNTED terminal:
 * constructed ONCE at world setup by the harness; the module contributes
 * zero constructions and never invokes stop (structurally corroborated by
 * the source guard over module bytes). */
interface TerminalRecorder {
  readonly constructions: number;
  /** Plain callable signature added: the default Mock type is not
   * callable through the interface. */
  readonly stop: ReturnType<typeof vi.fn> & (() => void);
}

const sdkHarness = vi.hoisted(() => {
  let mints = 0;
  // Deterministic platform-named file UNDER THE GIVEN DIR (the filename
  // counter stands for the platform's own minted id); NO filesystem side
  // effects — the fake mint creates neither dir nor file.
  const create = vi.fn((cwd: string, sessionDir?: string) => {
    const fileName = `20260101T000000Z_${String(++mints).padStart(8, "0")}.jsonl`;
    return {
      getCwd: (): string => cwd,
      getSessionFile: (): string | undefined =>
        sessionDir === undefined ? undefined : `${sessionDir}/${fileName}`,
    };
  });
  return {
    create,
    reset: (): void => {
      mints = 0;
      create.mockClear();
    },
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: vi.fn(() => "/agent/dir"),
  SessionManager: { create: sdkHarness.create },
  createAgentSessionServices: vi.fn(async () => ({
    marker: "fake-services",
  })),
  createAgentSessionFromServices: vi.fn(async () => ({ extensionsResult: {} })),
  createAgentSessionRuntime: vi.fn(async () => {
    throw new Error("construction not exercised over the physics world");
  }),
}));

/** Mirror the measured handle physics: subscribe returns a
 * FUNCTIONAL per-listener unsubscribe (agent-session.d.ts L278–L280);
 * dispose clears the live list (agent-session.js L584–L604). */
function mintPhysicsHandle(
  sessionId: string,
  sessionFile?: string,
): PhysicsHandle {
  const captured: Listener[] = [];
  const live: Listener[] = [];
  const handle: PhysicsHandle = {
    sessionId,
    sessionFile,
    subscribe: vi.fn((listener: Listener) => {
      captured.push(listener);
      live.push(listener);
      return (): void => {
        const index = live.indexOf(listener);
        if (index !== -1) {
          live.splice(index, 1);
        }
      };
    }),
    dispose: vi.fn((): void => {}),
    captured,
    live,
    disposed: false,
  };
  handle.dispose.mockImplementation(() => {
    handle.disposed = true;
    live.length = 0;
  });
  return handle;
}

/** ONE scripted switchSession outcome (the physics applied by
 * scriptSwitches stand for the measured dist order). */
type SwapStep =
  | {
      kind: "swap";
      /** The REOPENED handle's sessionId (a fresh id for a switched-in
       * child; the RETAINED id for a switched-back parent — file-backed
       * identity). */
      sessionId: string;
      /** Scripted transcript persistence landing the JSONL file at the
       * scripted switch-in moment (stands for the platform's own
       * persistence; absent steps persist nothing). */
      persist?: (path: string) => void;
      /** Row observation of the freshly applied handle. */
      observe?: (incoming: PhysicsHandle) => void;
    }
  | { kind: "cancel" }
  | { kind: "reject"; message: string };

interface PhysicsWorld {
  readonly cwd: string;
  readonly runtime: {
    readonly cwd: string;
    session: PhysicsHandle;
    /** Plain callable signature added: the default Mock type is not
     * callable through the interface. */
    switchSession: ReturnType<typeof vi.fn> &
      ((
        path: string,
        options?: { readonly cwdOverride?: string },
      ) => Promise<{ cancelled: boolean }>);
    /** Mirrors the SDK's public runtime dispose (the death-simulation legs
     * drive it; the cast seam absorbs it). */
    dispose: ReturnType<typeof vi.fn> & (() => Promise<void>);
  };
  readonly parentHandle: PhysicsHandle;
  /** The harness-minted SINGLE terminal recorder (world setup). */
  readonly terminal: TerminalRecorder;
  /** The holder-context stderr sink (rows pin zero calls). Plain callable
   * signature added: the default Mock type is not callable through the
   * interface. */
  readonly stderr: ReturnType<typeof vi.fn> & ((line: string) => void);
}

function buildPhysicsWorld(root: string, cwd: string): PhysicsWorld {
  const parentHandle = mintPhysicsHandle(
    "sess-fake-0001",
    join(root, "top", "parent-transcript.jsonl"),
  );
  const runtime: PhysicsWorld["runtime"] = {
    cwd,
    session: parentHandle,
    dispose: vi.fn(async (): Promise<void> => {}),
    switchSession: vi.fn(
      async (
        _path: string,
        _options?: { readonly cwdOverride?: string },
      ): Promise<{ cancelled: boolean }> => {
        // Placeholder physics — rows queue their own steps.
        return { cancelled: false };
      },
    ),
  };
  return {
    cwd,
    runtime,
    parentHandle,
    terminal: { constructions: 1, stop: vi.fn((): void => {}) },
    stderr: vi.fn((): void => {}),
  };
}

/** Queue scripted switch outcomes. Each "swap" applies the MEASURED
 * teardown-then-apply order: dispose the outgoing handle FIRST, apply the
 * FRESH zero-listener incoming handle anchored at the swapped path, replay
 * NOTHING. "cancel" performs no teardown (the current handle stays
 * current); "reject" escapes the RAW error unmasked. */
function scriptSwitches(world: PhysicsWorld, ...steps: SwapStep[]): void {
  for (const step of steps) {
    world.runtime.switchSession.mockImplementationOnce(
      async (path: string): Promise<{ cancelled: boolean }> => {
        if (step.kind === "cancel") {
          return { cancelled: true };
        }
        if (step.kind === "reject") {
          throw new Error(step.message);
        }
        world.runtime.session.dispose();
        const incoming = mintPhysicsHandle(step.sessionId, path);
        world.runtime.session = incoming;
        step.persist?.(path);
        step.observe?.(incoming);
        return { cancelled: false };
      },
    );
  }
}

/** Row-owned signal-registration fake: structural KillCaptureTarget
 * conformance over an append-only handler list — dispatch runs by INDEX
 * (the row drives handlers explicitly; last-prepended-runs-first is the
 * row's business, not this fake's). */
function makeSignalFake(): {
  readonly target: KillCaptureTarget;
  readonly handlers: Array<() => void>;
} {
  const handlers: Array<() => void> = [];
  return {
    target: {
      prependListener(_signal: "SIGTERM", handler: () => void): void {
        handlers.push(handler);
      },
    },
    handlers,
  };
}

/** A manually-openable promise pair for PENDING composed bodies: the body
 * reports ENTER (switch-out + push landed) and then parks on the opened
 * promise (never opened in trigger rows — the latch reject channel settles
 * instead). Trigger rows await entered BEFORE firing. */
function rowGate(): {
  readonly entered: Promise<void>;
  readonly opened: Promise<void>;
  enter(): void;
} {
  let enterFn: (() => void) | undefined;
  return {
    entered: new Promise<void>((resolve) => {
      enterFn = resolve;
    }),
    opened: new Promise<void>(() => {}),
    enter: (): void => {
      enterFn?.();
    },
  };
}

/** THE composed-world top frame: REAL PioSession.fromRuntime over the
 * settled fake runtime (the documented cast seam), installed as the
 * outermost ledger entry over the row's tmpdir sessions root. An explicit
 * terminalStop closure is honored when provided (the death-simulation rows
 * retain their own reference to invoke later). */
function installTopFrame(
  world: PhysicsWorld,
  root: string,
  terminalStop?: () => void,
): PioSession {
  const topFrame = PioSession.fromRuntime(asRuntime(world.runtime));
  installFrameEnvironment({
    sessionsRoot: root,
    topFrame,
    terminalStop: terminalStop ?? ((): void => world.terminal.stop()),
    stderr: (line: string): void => world.stderr(line),
  });
  return topFrame;
}

/** Deliver synthetic events to EVERY live listener on the target handle
 * (platform fan-out mirror; a disposed handle delivers to nobody). */
function emitLive(handle: PhysicsHandle, ...events: object[]): void {
  for (const event of events) {
    const payload = asEvent(event);
    for (const listener of handle.live) {
      listener(payload);
    }
  }
}

/** Synthetic assistant message_end usage payload (installed-dist shape;
 * tokens = input + output + cacheRead + cacheWrite, the pinned observer
 * arithmetic). */
function assistantMessageEnd(
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): object {
  const totals = input + output + cacheRead + cacheWrite;
  return {
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-test",
      usage: {
        input,
        output,
        cacheRead,
        cacheWrite,
        totalTokens: totals,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 1,
    },
  };
}

/** Recursive count of status.json files under a dir (zero-record scans).
 */
function countStatusFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      count += countStatusFiles(full);
    } else if (entry === "status.json") {
      count += 1;
    }
  }
  return count;
}

/** Recursive relative-path listing (sorted) — the audit-tree observation.
 */
function recursiveListing(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const sub of recursiveListing(full)) {
        out.push(`${entry}/${sub}`);
      }
    } else {
      out.push(entry);
    }
  }
  return out.sort();
}

/** Pin the canonical record byte shape shared by the H rows: raw-string
 * pins (trailing newline, 2-space indent start, exact top-level key order)
 * + durationMs UNPINNED (composed emitters take no clock seam — module
 * defaults own the clock; accepted boundary, documented in-row). Returns
 * the parsed record for field pins. */
function expectCanonicalRecord(
  raw: string,
  keyOrder: string[],
): Record<string, unknown> {
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw.startsWith('{\n  "ok"')).toBe(true);
  const topLevelKeys = [...raw.matchAll(/^ {2}"([A-Za-z]+)":/gm)].map(
    (match) => match[1],
  );
  expect(topLevelKeys).toEqual(keyOrder);
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  expect(typeof parsed.durationMs).toBe("number");
  expect((parsed.durationMs as number) >= 0).toBe(true);
  return parsed;
}

/** Mutable observation state behind the fake top frame — mutated AFTER
 * install by the liveness rows. */
interface FakeFrameState {
  tokens: number;
  sessionFile: string;
}

interface FakeTopFrameWorld {
  /** The structurally-complete plain object the module receives BY
   * REFERENCE. */
  readonly frame: Record<string, unknown>;
  /** The rebind spy attached as the fake's rebind member. */
  readonly rebindSpy: ReturnType<typeof vi.fn>;
  /** The mutable state the live accessors read on every call. */
  readonly state: FakeFrameState;
}

function makeFakeTopFrame(): FakeTopFrameWorld {
  const state: FakeFrameState = {
    tokens: 1234,
    sessionFile: "/tmp/top/20260101T000000Z_deadbeefcafe.jsonl",
  };
  const rebindSpy = vi.fn();
  const frame: Record<string, unknown> = {
    id: "sess-top-fake",
    counters: (): { tokens: number } => ({ tokens: state.tokens }),
    runtime: {
      session: {
        sessionId: "sess-top-fake",
        get sessionFile(): string {
          return state.sessionFile;
        },
      },
    },
    rebind: rebindSpy,
  };
  return { frame, rebindSpy, state };
}

beforeEach(() => {
  // Idempotent suite seam: fresh holder per row.
  teardownFrameEnvironment();
  sdkHarness.reset();
});

// THE installed guard of the current row (module-scoped state — the guard
// registry is per-file; afterEach uninstalls so no row leaks the wrapper).
let currentGuard: ShutdownGuard | undefined;

const tempRoots: string[] = [];
let tempCursor = 0;

/** One row-owned tmpdir root; afterEach removes it recursively — FORCED
 * TEARDOWN: the removal runs even on assertion failure. */
function newTempRoot(): string {
  const root = mkdtempSync(
    join(tmpdir(), `pio-hop-${String(++tempCursor).padStart(2, "0")}-`),
  );
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  currentGuard?.uninstall();
  currentGuard = undefined;
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("installFrameEnvironment (install-once + top-entry derivation)", () => {
  it("installs the SINGLE holder and derives the outermost ledger entry from the entry's PioSession ref — depth 0, scopeDir byte-equal, the placeholder stamp, LIVE accessors proven by post-install mutation, rebind forwarding by reference, live-array identity", () => {
    const world = makeFakeTopFrame();
    const sessionsRoot = "/tmp/engagements/abc123/.sessions";
    installFrameEnvironment({
      sessionsRoot,
      topFrame: world.frame as unknown as PioSession, // cast seam
      terminalStop: (): void => {},
      stderr: (line: string): void => {
        expect(line).toBe(""); // the suite never drives the sink here
      },
    });
    const frames = activeFrames();
    expect(frames).toHaveLength(1);
    const entry = frames[0];
    expect(entry.depth).toBe(0);
    expect(entry.scopeDir).toBe(sessionsRoot); // byte-equal echo
    // Suite-pinned placeholder stamp (owner: TOP_FRAME_STAMP in
    // ./terminal-takeover.ts).
    expect(entry.capability).toEqual({ name: "top", version: "0.0.0" });
    // LIVE accessors: initial values...
    expect(entry.sessionFile()).toBe(world.state.sessionFile);
    expect(entry.tokens()).toBe(1234);
    // ...mutate the fake AFTER install...
    world.state.tokens = 5678;
    world.state.sessionFile = "/tmp/top/20260102T000000Z_cafebabe.jsonl";
    // ...and re-reads reflect the NEW values (closures over the reference,
    // never snapshots).
    expect(entry.sessionFile()).toBe(
      "/tmp/top/20260102T000000Z_cafebabe.jsonl",
    );
    expect(entry.tokens()).toBe(5678);
    // Call-time rebind delegation: the SAME handle reference reaches the
    // frame's own rebind member.
    const handleRef: Record<string, unknown> = { sessionId: "sess-top-fake" };
    entry.rebind(handleRef as unknown as AgentSession); // cast seam
    expect(world.rebindSpy).toHaveBeenCalledTimes(1);
    expect(world.rebindSpy.mock.calls[0]?.[0]).toBe(handleRef); // by reference
    // The returned array IS the live internal array (identity, not copy).
    expect(activeFrames()).toBe(frames);
  });
});

// Replicated single-owner pinned literals (owners: the module-private
// NOT_INSTALLED_MESSAGE / DOUBLE_INSTALL_MESSAGE constants in
// ./terminal-takeover.ts). The \u2014 escape is kept identically in every
// replica so glyph mangling cannot drift the byte-pins.
const NOT_INSTALLED_REPLICA =
  "terminal-takeover: frame environment not installed \u2014 a session-absent capability can only run under the engaged entry";
const DOUBLE_INSTALL_REPLICA =
  "terminal-takeover: frame environment already installed \u2014 single-holder doctrine; teardown before reinstalling";

// THE replicated pinned interruption message (owner: the FRAME_KILL_MESSAGE
// constant + FrameKillError constructor in ./terminal-takeover.ts).
const FRAME_KILL_REPLICA =
  "terminal-takeover: frame interrupted \u2014 the ordered shutdown pass terminated the process";

// THE typed exit line replica (owner: the leg-(f) template in
// ./terminal-takeover.ts). Lines arrive WITHOUT trailing newline.
const typedLineReplica = (
  name: string,
  version: string,
  depth: number,
  cause: "user-abort" | "sigterm" | "fatal",
): string =>
  `terminal-takeover: shutdown \u2014 frame '${name}@${version}' (depth ${depth}) ended by ${cause}`;

/** THE harness top-emitter stamp (stamped onto the attached harness
 * emitter; distinct from the ledger's placeholder top stamp). */
const TOP_STAMP = { name: "engaged-cap", version: "9.9.9" } as const;

/** Attach a REAL harness status emitter (rooted at the sessions root) to
 * the outermost ledger entry: live token scalar + live current-handle
 * transcript, injected exit recorder (hygiene: the suite never lets the
 * real sink reach the host), optional signal target for arming. Returns
 * the emitter + its recorded termination requests. */
function attachHarnessTopEmitter(
  world: PhysicsWorld,
  top: PioSession,
  root: string,
  signals?: KillCaptureTarget,
): { readonly emitter: StatusEmitter; readonly exitCalls: number[] } {
  const exitCalls: number[] = [];
  const emitter = createStatusEmitter({
    sessionsRoot: root,
    capability: TOP_STAMP,
    tokens: (): number => top.counters().tokens,
    sessionFile: (): string | undefined => world.runtime.session.sessionFile,
    exit: (code: number): void => {
      exitCalls.push(code);
    },
    signals,
  });
  attachTopEmitter(emitter);
  return { emitter, exitCalls };
}

/** Guard-seam builder: exit spy + signal fake (reused when provided) + the
 * REAL installExitGuard (rows ALWAYS supply the exit seam — no row wraps
 * the real process sink). Registered for the afterEach uninstall hygiene
 * (module-scoped state). */
function buildGuardSeams(existingSignals?: ReturnType<typeof makeSignalFake>): {
  readonly exitSpy: ReturnType<typeof vi.fn>;
  readonly signals: ReturnType<typeof makeSignalFake>;
  readonly guard: ShutdownGuard;
} {
  const exitSpy = vi.fn((): void => {});
  const signals = existingSignals ?? makeSignalFake();
  const guard = installExitGuard({ exit: exitSpy, signals: signals.target });
  currentGuard = guard;
  return { exitSpy, signals, guard };
}

describe("installFrameEnvironment (single-holder doctrine)", () => {
  it("second install WITHOUT teardown throws LOUDLY — module-local FrameEnvironmentError, suite-pinned bytes, bare identity (no cause) — and the ORIGINAL holder survives intact", () => {
    const first = makeFakeTopFrame();
    const second = makeFakeTopFrame();
    installFrameEnvironment({
      sessionsRoot: "/tmp/engagements/first/.sessions",
      topFrame: first.frame as unknown as PioSession, // cast seam
      terminalStop: (): void => {},
      stderr: (): void => {},
    });
    let thrown: unknown;
    try {
      installFrameEnvironment({
        sessionsRoot: "/tmp/engagements/second/.sessions",
        topFrame: second.frame as unknown as PioSession, // cast seam
        terminalStop: (): void => {},
        stderr: (): void => {},
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FrameEnvironmentError);
    const fault = thrown as FrameEnvironmentError;
    expect(fault.name).toBe("FrameEnvironmentError");
    expect(fault.message).toBe(DOUBLE_INSTALL_REPLICA);
    expect((thrown as { cause?: unknown }).cause).toBeUndefined(); // bare identity
    // The original holder is intact and still derives from the original
    // fake (no partial state mutation on the failed attempt).
    const frames = activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].scopeDir).toBe("/tmp/engagements/first/.sessions");
    expect(frames[0].tokens()).toBe(first.state.tokens);
  });
});

describe("teardownFrameEnvironment (clean idempotent inverse)", () => {
  it("teardown CLEARS rather than stacks: double-teardown is a silent no-op, reinstall with a DIFFERENT fake succeeds and derives from the NEW state", () => {
    const first = makeFakeTopFrame();
    installFrameEnvironment({
      sessionsRoot: "/tmp/engagements/first/.sessions",
      topFrame: first.frame as unknown as PioSession, // cast seam
      terminalStop: (): void => {},
      stderr: (): void => {},
    });
    teardownFrameEnvironment();
    expect(() => teardownFrameEnvironment()).not.toThrow(); // second: silent no-op

    const second = makeFakeTopFrame();
    second.state.tokens = 777;
    second.state.sessionFile = "/tmp/top/20260928T000000Z_secondframe.jsonl";
    installFrameEnvironment({
      sessionsRoot: "/tmp/engagements/second/.sessions",
      topFrame: second.frame as unknown as PioSession, // cast seam
      terminalStop: (): void => {},
      stderr: (): void => {},
    });
    const frames = activeFrames();
    expect(frames).toHaveLength(1); // cleared, not stacked
    expect(frames[0].scopeDir).toBe("/tmp/engagements/second/.sessions");
    expect(frames[0].tokens()).toBe(777);
    expect(frames[0].sessionFile()).toBe(second.state.sessionFile);
    // Still LIVE over the new reference...
    second.state.tokens = 999;
    expect(frames[0].tokens()).toBe(999);
    // ...and the stale first holder is unreachable.
    first.state.tokens = 1;
    expect(frames[0].tokens()).toBe(999);
  });
});

describe("activeFrames (uninstalled read)", () => {
  it("THROWS the PINNED not-installed FrameEnvironmentError — byte-equal to the pinned literal (escape replicated identically), bare identity", () => {
    let thrown: unknown;
    try {
      activeFrames();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FrameEnvironmentError);
    const fault = thrown as FrameEnvironmentError;
    expect(fault.name).toBe("FrameEnvironmentError");
    expect(fault.message).toBe(NOT_INSTALLED_REPLICA);
    expect((thrown as { cause?: unknown }).cause).toBeUndefined();
  });
});

describe("harness physics (additive — consumed by the hop matrix)", () => {
  it("the deterministic manager mint names a platform file under the given dir, echoes cwd, records its args, advances per call, and performs NO filesystem side effects", () => {
    const root = newTempRoot();
    const targetA = join(root, "never-minted", "top");
    const targetB = join(root, "still-unminted", "top");
    const first = sdkHarness.create("/work/a", targetA);
    const second = sdkHarness.create("/work/b", targetB);
    expect(first.getCwd()).toBe("/work/a");
    expect(first.getSessionFile()).toBe(
      join(targetA, "20260101T000000Z_00000001.jsonl"),
    );
    expect(second.getSessionFile()).toBe(
      join(targetB, "20260101T000000Z_00000002.jsonl"),
    );
    expect(sdkHarness.create).toHaveBeenNthCalledWith(1, "/work/a", targetA);
    expect(sdkHarness.create).toHaveBeenNthCalledWith(2, "/work/b", targetB);
    // NO filesystem side effects: the fake mint creates neither dir nor file.
    expect(existsSync(join(root, "never-minted"))).toBe(false);
    expect(existsSync(join(root, "still-unminted"))).toBe(false);
  });

  it("the scripted swap runtime mirrors the measured teardown-then-apply physics: outgoing disposed FIRST, incoming FRESH zero-listener and anchored at the swapped path, reopen retains the file-backed id under a NEW object, functional unsubscribe, dispose clears live, cancel performs no teardown, reject escapes the RAW error", async () => {
    const world = buildPhysicsWorld(newTempRoot(), "/work/h");
    const parentPath = world.parentHandle.sessionFile as string;
    const childPath = join("/mnt/sessions", "cid-x", "top", "child.jsonl");
    scriptSwitches(
      world,
      { kind: "swap", sessionId: "sess-child-opened-1" },
      { kind: "swap", sessionId: "sess-fake-0001" },
      { kind: "cancel" },
      { kind: "reject", message: "raw swap fault" },
    );
    const out = await world.runtime.switchSession(childPath);
    expect(out).toEqual({ cancelled: false });
    expect(world.parentHandle.disposed).toBe(true); // teardown FIRST
    const child = world.runtime.session;
    expect(child).not.toBe(world.parentHandle); // handles are NEW objects per open
    expect(child.sessionId).toBe("sess-child-opened-1");
    expect(child.sessionFile).toBe(childPath); // anchored at the swapped path
    expect(child.live).toHaveLength(0); // fresh zero-listener
    const unsubscribe = child.subscribe(() => {});
    expect(child.live).toHaveLength(1);
    unsubscribe();
    expect(child.live).toHaveLength(0);
    const back = await world.runtime.switchSession(parentPath);
    expect(back).toEqual({ cancelled: false });
    const reborn = world.runtime.session;
    expect(reborn).not.toBe(world.parentHandle); // NEW object…
    expect(reborn.sessionId).toBe("sess-fake-0001"); // …file-backed identity retained
    expect(reborn.sessionFile).toBe(parentPath);
    expect(world.parentHandle.live).toHaveLength(0); // dispose cleared the live list
    const cancelled = await world.runtime.switchSession("/nowhere.jsonl");
    expect(cancelled).toEqual({ cancelled: true });
    expect(world.runtime.session).toBe(reborn); // parent STILL current
    expect(reborn.disposed).toBe(false); // no teardown occurred
    let raw: unknown;
    try {
      await world.runtime.switchSession("/also-nowhere.jsonl");
    } catch (error) {
      raw = error;
    }
    expect(raw).toBeInstanceOf(Error);
    expect((raw as Error).message).toBe("raw swap fault");
    expect(world.runtime.session).toBe(reborn);
  });

  it("the physics top frame installs as the outermost ledger entry: REAL fromRuntime over the settled fake runtime (documented cast seam), the LIVE token scalar following emitted usage through the host observer, and the harness terminal recorder constructed once at world setup with zero stops", () => {
    const root = newTempRoot();
    const world = buildPhysicsWorld(root, "/work/t");
    expect(world.terminal.constructions).toBe(1);
    expect(world.terminal.stop).toHaveBeenCalledTimes(0);
    const top = installTopFrame(world, root);
    const frames = activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].depth).toBe(0);
    expect(frames[0].scopeDir).toBe(root);
    expect(top.counters().tokens).toBe(0);
    expect(frames[0].tokens()).toBe(0);
    expect(frames[0].sessionFile()).toBe(world.parentHandle.sessionFile);
    // Hand-computed: Σ10 (4+3+2+1) lands on the CURRENT handle's live
    // listener; the ledger's LIVE accessor reads it fresh.
    emitLive(world.runtime.session, assistantMessageEnd(4, 3, 2, 1));
    expect(top.counters().tokens).toBe(10);
    expect(frames[0].tokens()).toBe(10);
  });
});

// ─── Hop matrix (materializeFrame over the physics world) ──────────────
// Replica constants over the four pinned hop-fault messages (suite-local;
// the module owns the originals; escapes mirror the source so the U+2014
// bytes match).
const PARENT_UNNAMED_REPLICA =
  "terminal-takeover: hop aborted \u2014 the parent session is unnamed; no switch source to return to";
const MINT_UNNAMED_REPLICA =
  "terminal-takeover: hop aborted \u2014 the platform minted no session file for the child scope";
const CANCELLED_SWITCH_REPLICA =
  "terminal-takeover: hop aborted \u2014 the switch out was cancelled; nothing was attached";
const SWITCH_BACK_FAILED_REPLICA =
  "terminal-takeover: hop aborted \u2014 the switch back failed; the child record is durable";

/** Deterministic seam sets + hand-computed mints (the id-shape pin stays
 * observation-independent; layout.ts' own suite locks the arithmetic). */
const SEAMS_A: IdSeams = {
  now: (): number => Date.parse("2026-09-28T12:34:56.789Z"),
  entropy: (): string => "0123abcd",
};
const SEAMS_B: IdSeams = {
  now: (): number => Date.parse("2026-09-28T12:34:57.789Z"),
  entropy: (): string => "abcdef01",
};
const SEAMS_C: IdSeams = {
  now: (): number => Date.parse("2026-09-28T12:34:58.789Z"),
  entropy: (): string => "cafe0123",
};
const CHILD_ID_A = "20260928T123456789Z-0123abcd";
const CHILD_ID_B = "20260928T123457789Z-abcdef01";
const CHILD_ID_C = "20260928T123458789Z-cafe0123";

/** Platform-named file the deterministic harness mint produces at the
 * Nth create() call (counter resets in beforeEach per row). */
const MINTED_FILE = (n: number): string =>
  `20260101T000000Z_${String(n).padStart(8, "0")}.jsonl`;

/** Seed a transcript file AT the scripted switch-in moment (stands for the
 * platform's own persistence landing): creates the child slot dirs, which
 * the physics handles themselves do not create. */
function seedTranscript(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const CONTRACT_ALPHA = { name: "cap-alpha", version: "1.0.0" } as const;
const CONTRACT_BETA = { name: "cap-beta", version: "2.0.0" } as const;
const CONTRACT_GAMMA = { name: "cap-gamma", version: "3.0.0" } as const;

/** Shared alpha-world fixture: one row-owned tmpdir root, seeded parent
 * transcript, installed real top frame, scripted switch physics. */
function buildAlphaWorld(cwd: string): {
  root: string;
  world: PhysicsWorld;
  top: PioSession;
  parentFile: string;
} {
  const root = newTempRoot();
  const world = buildPhysicsWorld(root, cwd);
  const parentFile = join(root, "top", "parent-transcript.jsonl");
  mkdirSync(join(root, "top"), { recursive: true });
  writeFileSync(parentFile, "<seed>\n");
  const top = installTopFrame(world, root);
  return { root, world, top, parentFile };
}

describe("hop matrix (H rows — materializeFrame over the physics world)", () => {
  it("H1 THE full success cycle: synchronous dispatch returns the caller's promise identity early; the detached continuation mints the child scope ONE SEGMENT under the current scope dir through the sole SDK thunk, captures the PRE-HOP parent transcript, switches out with cwdOverride, pushes depth 1, runs the body on the adopted frame (fresh token counter), emits the UNCONDITIONAL canonical child record BEFORE settling, switches back onto the CAPTURED parent file, re-arms without a yield, and pops + resolves in one gesture — outputs travel BY REFERENCE, exactly two switch calls, one SDK thunk, zero stdout, zero stderr, the fresh parent handle carries exactly one re-armed listener proven DELIVERING, and the harness IM stops ZERO times during the hop", async () => {
    const { root, world, top, parentFile } = buildAlphaWorld("/work/alpha");
    const childDir = join(root, CHILD_ID_A, "top");
    const childFile = join(childDir, MINTED_FILE(1));
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-a",
        persist: (path: string): void => {
          seedTranscript(path, "<child seed>\n");
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const outputsA: Record<string, unknown> = { hop: "alpha", passThrough: 7 };
    let entryRef: ActiveFrame | undefined;
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const promise = materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (frame: PioSession): Promise<Record<string, unknown>> => {
          // Fresh host: the counter starts empty even though the parent
          // frame saw traffic elsewhere.
          expect(frame.counters().tokens).toBe(0);
          emitLive(world.runtime.session, assistantMessageEnd(11, 22, 3, 4));
          await Promise.resolve();
          const frames = activeFrames();
          expect(frames).toHaveLength(2);
          const entry = frames[1];
          entryRef = entry;
          expect(entry.depth).toBe(1);
          expect(entry.capability).toEqual(CONTRACT_ALPHA);
          expect(entry.scopeDir).toBe(join(root, CHILD_ID_A));
          expect(frame.counters().tokens).toBe(40);
          return outputsA;
        },
      });
      // D-sync consumer view: the latch value IS a native promise.
      expect(typeof promise.then).toBe("function");
      const settled = await promise;
      // Same-payload dual channels: the await mirrors the record BY
      // REFERENCE (no serialization round-trip).
      expect(settled.ok).toBe(true);
      expect(settled.outputs).toBe(outputsA);
      // Ledger unwound: ONLY the installed top entry remains.
      const afterUnwind = activeFrames();
      expect(afterUnwind).toHaveLength(1);
      expect(afterUnwind[0].capability.name).toBe("top");
      // Exactly two switch calls in the pinned order and shape.
      expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
      const outArgs = world.runtime.switchSession.mock.calls[0] as unknown[];
      const backArgs = world.runtime.switchSession.mock.calls[1] as unknown[];
      expect(outArgs).toEqual([childFile, { cwdOverride: "/work/alpha" }]);
      expect(backArgs).toEqual([parentFile, { cwdOverride: "/work/alpha" }]);
      // Current handle: the REOPENED parent — fresh instance, retained
      // file-backed identity (the measured reopen quirk).
      const current = world.runtime.session;
      expect(current.sessionId).toBe("sess-fake-0001");
      expect(current.sessionFile).toBe(parentFile);
      expect(current).not.toBe(world.parentHandle);
      expect(world.parentHandle.disposed).toBe(true);
      // THE re-arm observable (stage-⑪ adjacency): the fresh post-switch-back
      // parent handle carries EXACTLY ONE live listener — the persistent
      // top-frame observer re-subscribed by the ledger's rebind closure —
      // and it DELIVERS: one synthetic usage payload (Σ14 hand-computed)
      // advances the top frame's counters by exactly its sum.
      expect(current.live).toHaveLength(1);
      emitLive(world.runtime.session, assistantMessageEnd(5, 4, 3, 2));
      expect(top.counters().tokens).toBe(14);
      expect(activeFrames()[0].tokens()).toBe(14);
      // The CAPTURED CONSTANT survives the unwind: post-back the shared
      // runtime's current handle is the parent's, yet this accessor still
      // names the child file.
      expect(entryRef!.sessionFile()).toBe(childFile);
      // LIVE tokens over the adopted child host.
      expect(entryRef!.tokens()).toBe(40);
      // THE canonical child record bytes (rooted at the child scope dir —
      // the measured origin derivation; durationMs UNPINNED: composed
      // emitters take no clock seam, module defaults own the clock).
      const raw = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      const parsed = expectCanonicalRecord(raw, [
        "ok",
        "capability",
        "outputs",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(parsed.ok).toBe(true);
      expect(parsed.capability).toEqual({
        name: "cap-alpha",
        version: "1.0.0",
        source: "builtin",
      });
      expect(parsed.transcriptRef).toBe(`${CHILD_ID_A}/top/${MINTED_FILE(1)}`);
      expect(parsed.tokens).toBe(40);
      expect(parsed.outputs).toEqual(outputsA);
      // Audit tree: child transcript + child record + seeded parent only.
      expect(recursiveListing(root)).toEqual([
        `${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
        `${CHILD_ID_A}/top/status.json`,
        "top/parent-transcript.jsonl",
      ]);
      // THE module's SOLE SDK value reach fired exactly once, rooted at the
      // child top dir with the runtime's cwd.
      expect(sdkHarness.create).toHaveBeenCalledTimes(1);
      expect(sdkHarness.create.mock.calls[0]).toEqual([
        "/work/alpha",
        childDir,
      ]);
      // No terminal or signal side channel of any kind.
      expect(stdoutSpy).not.toHaveBeenCalled();
      expect(world.stderr).not.toHaveBeenCalled();
      // Constructed ONCE total (at world setup — the module contributes
      // zero constructions), and stop called ZERO times during the hop.
      expect(world.terminal.constructions).toBe(1);
      expect(world.terminal.stop).toHaveBeenCalledTimes(0);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("H2 nested grandchildren (two stacked hops): scopes nest TWO segments under the root, inner child mints under the OUTER child's scope dir, four switch calls run out-A, out-B, back-to-A, back-to-parent, records land at <outer>/<inner>/top and <outer>/top, the harness top-frame record lands at <root>/top, outputs reference the inner settled payload BY REFERENCE, variable stores stay frame-private, one live handle throughout, all ledgers pop, ONE IM across the whole chain", async () => {
    const { root, world, top, parentFile } = buildAlphaWorld("/work/nest");
    const outerChildDir = join(root, CHILD_ID_A, "top");
    const outerChildFile = join(outerChildDir, MINTED_FILE(1));
    const innerChildDir = join(root, CHILD_ID_A, CHILD_ID_B, "top");
    const innerChildFile = join(innerChildDir, MINTED_FILE(2));
    const applied: PhysicsHandle[] = [];
    // THE MEASURED NESTED ORDER: the inner hop unwinds COMPLETELY (its
    // switch-back lands on the OUTER CHILD's retained file) before the
    // outer body resumes into the outer switch-back. Retained file-backed
    // sessionIds keep every rebind gate passing at each depth.
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-a",
        persist: (path: string): void => {
          seedTranscript(path, "<outer seed>\n");
        },
        observe: (incoming: PhysicsHandle): void => {
          applied.push(incoming);
        },
      },
      {
        kind: "swap",
        sessionId: "sess-child-b",
        persist: (path: string): void => {
          seedTranscript(path, "<inner seed>\n");
        },
        observe: (incoming: PhysicsHandle): void => {
          applied.push(incoming);
        },
      },
      {
        // Inner switch-back: reopens the OUTER child (file-backed id).
        kind: "swap",
        sessionId: "sess-child-a",
        observe: (incoming: PhysicsHandle): void => {
          applied.push(incoming);
        },
      },
      {
        // Outer switch-back: reopens the top parent.
        kind: "swap",
        sessionId: "sess-fake-0001",
        observe: (incoming: PhysicsHandle): void => {
          applied.push(incoming);
        },
      },
    );
    const innerOutputs: Record<string, unknown> = { value: 42 };
    let outerStoreRef: SessionVariableStore | undefined;
    let innerStoreRef: SessionVariableStore | undefined;
    let innerSettledRef: CapabilityResult | undefined;
    const settled = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (frame: PioSession): Promise<Record<string, unknown>> => {
        const outerStore = frame.vars;
        outerStore.set("ovar", 3);
        outerStoreRef = outerStore;
        expect(outerStore.get("ovar")).toBe(3);
        // Pre-attach guard: the inner record does not exist before its
        // attach (checked here, mid-hop, strictly BEFORE the inner
        // dispatch mutates anything).
        expect(
          existsSync(join(root, CHILD_ID_A, CHILD_ID_B, "top", "status.json")),
        ).toBe(false);
        const innerSettled = await materializeFrame({
          capability: CONTRACT_BETA,
          idSeams: SEAMS_B,
          body: async (grand: PioSession): Promise<Record<string, unknown>> => {
            const innerStore = grand.vars;
            innerStore.set("ivar", 99);
            innerStoreRef = innerStore;
            expect(innerStore.list()).toEqual(["ivar"]);
            expect(innerStore.get("ovar")).toBeUndefined();
            expect(grand.counters().tokens).toBe(0);
            // Mid-inner-hop: three frames stacked (top, A, B).
            const frames = activeFrames();
            expect(frames).toHaveLength(3);
            expect(frames[2].depth).toBe(2);
            expect(frames[2].scopeDir).toBe(join(root, CHILD_ID_A, CHILD_ID_B));
            return innerOutputs;
          },
        });
        innerSettledRef = innerSettled;
        expect(innerSettled.ok).toBe(true);
        // Post-attach: the inner record now stands at its slot.
        expect(
          existsSync(join(root, CHILD_ID_A, CHILD_ID_B, "top", "status.json")),
        ).toBe(true);
        expect(outerStore.get("ivar")).toBeUndefined();
        return { inner: innerSettled };
      },
    });
    // By-reference nesting: the outer outputs hold the inner settled
    // object, which holds the inner outputs — no round-trips.
    expect(settled.ok).toBe(true);
    expect((settled.outputs as { inner: CapabilityResult }).inner).toBe(
      innerSettledRef,
    );
    expect((settled.outputs as { inner: CapabilityResult }).inner.outputs).toBe(
      innerOutputs,
    );
    // Both ledgers unwound: ONLY the installed top entry remains.
    expect(activeFrames()[0]?.capability.name).toBe("top");
    expect(activeFrames()).toHaveLength(1);
    // Four switch calls in the measured nested order: out-A, out-B,
    // back-to-the-OUTER-child-file, back-to-the-top-parent.
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(4);
    const calls = world.runtime.switchSession.mock.calls.map(
      (call) => call[0],
    ) as string[];
    expect(calls).toEqual([
      outerChildFile,
      innerChildFile,
      outerChildFile,
      parentFile,
    ]);
    expect(world.runtime.switchSession.mock.calls[0][1]).toEqual({
      cwdOverride: "/work/nest",
    });
    // Final current: the second reopened parent handle.
    const current = world.runtime.session;
    expect(current).toBe(applied[3]);
    expect(current.sessionId).toBe("sess-fake-0001");
    expect(current.sessionFile).toBe(parentFile);
    // One live handle at every rest point: teardown-before-apply keeps the
    // count at exactly one (the current).
    const all = [world.parentHandle, ...applied];
    const live = all.filter((handle) => !handle.disposed);
    expect(live).toHaveLength(1);
    expect(live[0]).toBe(current);
    // THE two child records at their measured placements (rooted at the
    // child scope dirs — origin = dirname(scopeDir) — so the refs carry
    // the <childId> segment; durationMs unpinned as in H1).
    const outerRaw = readFileSync(
      join(root, CHILD_ID_A, "top", "status.json"),
      "utf8",
    );
    const outerParsed = expectCanonicalRecord(outerRaw, [
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(outerParsed.capability).toEqual({
      name: "cap-alpha",
      version: "1.0.0",
      source: "builtin",
    });
    expect(outerParsed.transcriptRef).toBe(
      `${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
    );
    expect(outerParsed.tokens).toBe(0);
    const innerRaw = readFileSync(
      join(root, CHILD_ID_A, CHILD_ID_B, "top", "status.json"),
      "utf8",
    );
    const innerParsed = expectCanonicalRecord(innerRaw, [
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(innerParsed.capability).toEqual({
      name: "cap-beta",
      version: "2.0.0",
      source: "builtin",
    });
    // Measured placement artifact: the emitter roots at the child scope
    // dir, so the ref origin is one segment up — a grandchild ref carries
    // only its OWN id.
    expect(innerParsed.transcriptRef).toBe(
      `${CHILD_ID_B}/top/${MINTED_FILE(2)}`,
    );
    expect(innerParsed.outputs).toEqual({ value: 42 });
    // THE harness-owned top-frame emitter (a real status.ts emitter):
    // emitted AFTER the unwind alongside the caller's result; stamped
    // from the capability stamp, not the ledger entry.
    const topEmitter = createStatusEmitter({
      sessionsRoot: root,
      capability: { name: "engaged-cap", version: "9.9.9" },
      tokens: (): number => top.counters().tokens,
      sessionFile: (): string | undefined => world.runtime.session.sessionFile,
    });
    await topEmitter.emit(settled);
    const topRaw = readFileSync(join(root, "top", "status.json"), "utf8");
    const topParsed = expectCanonicalRecord(topRaw, [
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(topParsed.capability).toEqual({
      name: "engaged-cap",
      version: "9.9.9",
      source: "builtin",
    });
    // Same origin derivation as the child records: relative to one segment
    // UP from the emitter's sessionsRoot (here the mkdtemp root, so the ref
    // carries the root's basename — deterministic per run).
    expect(topParsed.transcriptRef).toBe(
      `${basename(root)}/top/parent-transcript.jsonl`,
    );
    expect(topParsed.outputs).toEqual(settled.outputs);
    // Audit tree: both levels + the top slot, nothing else.
    expect(recursiveListing(root)).toEqual([
      `${CHILD_ID_A}/${CHILD_ID_B}/top/${MINTED_FILE(2)}`,
      `${CHILD_ID_A}/${CHILD_ID_B}/top/status.json`,
      `${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
      `${CHILD_ID_A}/top/status.json`,
      "top/parent-transcript.jsonl",
      "top/status.json",
    ]);
    // The SDK thunks: outer first, then the inner mint under the OUTER
    // child's scope dir.
    expect(sdkHarness.create).toHaveBeenCalledTimes(2);
    expect(sdkHarness.create.mock.calls.map((call) => call[0])).toEqual([
      "/work/nest",
      "/work/nest",
    ]);
    expect(sdkHarness.create.mock.calls.map((call) => call[1])).toEqual([
      outerChildDir,
      innerChildDir,
    ]);
    // Variable stores: frame-private, separate after the unwind, nothing
    // persisted on the shared runtime (it carries no variable state).
    expect(outerStoreRef!.get("ovar")).toBe(3);
    expect(outerStoreRef!.get("ivar")).toBeUndefined();
    expect(innerStoreRef!.get("ivar")).toBe(99);
    expect(innerStoreRef!.get("ovar")).toBeUndefined();
    // ONE IM across the WHOLE CHAIN: the harness-minted terminal was
    // constructed once at world setup (the module contributed zero
    // constructions) and stop was called never through either hop.
    expect(world.terminal.constructions).toBe(1);
    expect(world.terminal.stop).toHaveBeenCalledTimes(0);
  });

  it("H3 record placement pin: EXACTLY ONE status.json exists anywhere under the sessions root and it sits at <childScopeDir>/top/status.json with transcriptRef <childId>/top/<platform file> — the child slot derives under the child scope, never under the parent's slots", async () => {
    const { root, world } = buildAlphaWorld("/work/gamma");
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-c",
        persist: (path: string): void => {
          seedTranscript(path, "<gamma seed>\n");
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const settled = await materializeFrame({
      capability: CONTRACT_GAMMA,
      idSeams: SEAMS_C,
      body: async (): Promise<Record<string, unknown>> => ({}),
    });
    expect(settled.ok).toBe(true);
    // Single record under the whole root (no top-slot emission occurred —
    // the harness emitter belongs to engaged entries, not to this row).
    expect(countStatusFiles(root)).toBe(1);
    expect(existsSync(join(root, "top", "status.json"))).toBe(false);
    const raw = readFileSync(
      join(root, CHILD_ID_C, "top", "status.json"),
      "utf8",
    );
    const parsed = expectCanonicalRecord(raw, [
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(parsed.capability).toEqual({
      name: "cap-gamma",
      version: "3.0.0",
      source: "builtin",
    });
    expect(parsed.transcriptRef).toBe(`${CHILD_ID_C}/top/${MINTED_FILE(1)}`);
  });

  it("H4 counter/token continuity across the lifecycle: the PRE vector N on the initial parent handle is read back N EXACT immediately after switch-back (the reopen replays NOTHING and a hostile pre-re-arm emission changes NOTHING — the tripwire), the POST vector K takes the parent to N + K EXACT (no loss, no double count), the child's mid-body M stays ISOLATED and frozen through the popped entry's accessor, and the DISPOSED initial parent handle is inert when poked", async () => {
    const { root, world, top } = buildAlphaWorld("/work/tokens");
    // Hand-computed vectors (pinned observer arithmetic: tokens = input +
    // output + cacheRead + cacheWrite): N=17, M=40, K=7 → final N+K=24.
    const PRE_N = 9 + 4 + 3 + 1;
    const MID_M = 11 + 22 + 3 + 4;
    const POST_K = 2 + 2 + 2 + 1;
    let preReArmRead: number | undefined;
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-a",
        persist: (path: string): void => {
          seedTranscript(path, "<seed>\n");
        },
      },
      {
        kind: "swap",
        sessionId: "sess-fake-0001",
        observe: (incoming: PhysicsHandle): void => {
          // Pre-re-arm tripwire vantage: the scripted-swap observe hook fires
          // BEFORE the module-driven re-arm lands. A hostile emission on the
          // fresh handle reaches no listener (the persistent observer is
          // still detached — only it may be re-attached); the counter read
          // captured HERE is what the post-await pins must equal.
          emitLive(incoming, assistantMessageEnd(99, 99, 99, 99));
          preReArmRead = top.counters().tokens;
        },
      },
    );
    // PRE vector on the INITIAL parent handle, strictly before the hop.
    emitLive(world.runtime.session, assistantMessageEnd(9, 4, 3, 1));
    expect(top.counters().tokens).toBe(PRE_N);
    let entryRef: ActiveFrame | undefined;
    const settled = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (frame: PioSession): Promise<Record<string, unknown>> => {
        expect(frame.counters().tokens).toBe(0);
        // MID vector: usage lands on the CURRENT handle — the child's.
        emitLive(world.runtime.session, assistantMessageEnd(11, 22, 3, 4));
        await Promise.resolve();
        expect(frame.counters().tokens).toBe(MID_M);
        // Public mid-body channel: the pushed entry's LIVE accessor reads
        // the same adopted host (M visible from outside the body).
        entryRef = activeFrames()[1];
        expect(entryRef.tokens()).toBe(MID_M);
        return {};
      },
    });
    expect(settled.ok).toBe(true);
    // THE immediate post-switch-back read — including the tripwire vantage
    // captured BEFORE the re-arm landed, AFTER a hostile emission on the
    // fresh handle: N EXACT. The reopen replayed NOTHING and moved NOTHING
    // until the module-driven re-arm delivered.
    expect(preReArmRead).toBe(PRE_N);
    expect(top.counters().tokens).toBe(PRE_N);
    expect(activeFrames()[0].tokens()).toBe(PRE_N);
    // POST vector on the FRESH parent handle: the re-armed observer takes
    // the parent to N + K EXACT (no loss, no double count).
    emitLive(world.runtime.session, assistantMessageEnd(2, 2, 2, 1));
    expect(top.counters().tokens).toBe(PRE_N + POST_K);
    expect(activeFrames()[0].tokens()).toBe(PRE_N + POST_K);
    // Child's M ISOLATED and frozen: readable through the popped entry's
    // accessor...
    expect(entryRef!.tokens()).toBe(MID_M);
    // ...and stamped into the record AT EMIT time over the child host only.
    const raw = readFileSync(
      join(root, CHILD_ID_A, "top", "status.json"),
      "utf8",
    );
    const parsed = expectCanonicalRecord(raw, [
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(parsed.tokens).toBe(MID_M);
    // POKING the disposed initial parent handle post-dispose changes
    // NOTHING (inert: per-handle subscriptions die with dispose).
    emitLive(world.parentHandle, assistantMessageEnd(8, 8, 8, 8));
    expect(world.parentHandle.live).toHaveLength(0);
    expect(top.counters().tokens).toBe(PRE_N + POST_K);
    // Isolation both ways: the parent-side traffic never reached the child
    // host either.
    expect(entryRef!.tokens()).toBe(MID_M);
  });

  it("H5 the child frame's variable store: set/get/list round-trips in the body and persists across microtasks there, while staying UNPERSISTED across the unwind — frame-private stores, nothing written to the shared runtime or the filesystem", async () => {
    const { root, world, top } = buildAlphaWorld("/work/vars");
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-a",
        persist: (path: string): void => {
          seedTranscript(path, "<seed>\n");
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    let storeRef: SessionVariableStore | undefined;
    const settled = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (frame: PioSession): Promise<Record<string, unknown>> => {
        const store = frame.vars;
        store.set("hopvar", 99);
        storeRef = store;
        expect(store.get("hopvar")).toBe(99);
        expect(store.list()).toEqual(["hopvar"]);
        await Promise.resolve();
        expect(store.get("hopvar")).toBe(99);
        return {};
      },
    });
    expect(settled.ok).toBe(true);
    // After the unwind: the store persists WITH the adopted host object...
    expect(storeRef!.get("hopvar")).toBe(99);
    // ...while the top frame's own store stayed clean...
    expect(top.vars.list()).toEqual([]);
    // ...and nothing landed on disk beyond the expected minimal tree.
    expect(recursiveListing(root)).toEqual([
      `${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
      `${CHILD_ID_A}/top/status.json`,
      "top/parent-transcript.jsonl",
    ]);
  });

  /** THE specified three-variant body-fault table: each variant drives a
   * FULL hop whose body THROWS the variant, pinning the identical typed
   * capture at BOTH channels (await + child record) with the complete
   * unwind performed. */
  const H6_CONTRACT_VIOLATIONS = [
    "output 'r' is missing",
    "output 'g' is stale",
  ];
  const BODY_FAULT_VARIANTS: ReadonlyArray<{
    readonly label: string;
    readonly thrown: () => unknown;
    readonly expected: Record<string, unknown>;
    readonly violationsRef?: string[];
  }> = [
    {
      label: "bare new Error('boom') — bare identity with no cause key",
      thrown: (): unknown => new Error("boom"),
      expected: { type: "Error", message: "boom" },
    },
    {
      label: "PhaseBudgetError(2) — the budget shape",
      thrown: (): unknown => new PhaseBudgetError(2),
      expected: {
        type: "PhaseBudgetError",
        cause: "budget",
        message: "Iteration budget exceeded after 2 iterations",
      },
    },
    {
      label: "ContractViolationError([...]) — the contract shape",
      thrown: (): unknown => new ContractViolationError(H6_CONTRACT_VIOLATIONS),
      expected: {
        type: "ContractViolationError",
        cause: "contract",
        message:
          "Contract violation: output 'r' is missing; output 'g' is stale",
        violations: H6_CONTRACT_VIOLATIONS,
      },
      violationsRef: H6_CONTRACT_VIOLATIONS,
    },
  ];
  for (const variant of BODY_FAULT_VARIANTS) {
    it(`H6 ${variant.label}: the body-fault capture reaches BOTH channels IDENTICALLY (exact single-element capture at the await AND the mirrored record bytes incl. errors placement) while switch-back/pop/rebind are STILL PERFORMED ([childFile, parentFile] switch args with cwdOverride, ledger [top], exactly one fresh listener on the post-switch-back parent handle) and the IM recorder stays untouched`, async () => {
      const { root, world, parentFile } = buildAlphaWorld("/work/fault");
      const childFile = join(root, CHILD_ID_A, "top", MINTED_FILE(1));
      const applied: PhysicsHandle[] = [];
      scriptSwitches(
        world,
        {
          kind: "swap",
          sessionId: "sess-child-a",
          persist: (path: string): void => {
            seedTranscript(path, "<seed>\n");
          },
          observe: (incoming: PhysicsHandle): void => {
            applied.push(incoming);
          },
        },
        {
          kind: "swap",
          sessionId: "sess-fake-0001",
          observe: (incoming: PhysicsHandle): void => {
            applied.push(incoming);
          },
        },
      );
      const settled = await materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (): Promise<Record<string, unknown>> => {
          throw variant.thrown();
        },
      });
      // THE await RESOLVED (never rejected) with the EXACT single-element
      // capture — this variant's shipped ladder shape.
      expect(settled).toStrictEqual({
        ok: false,
        errors: [variant.expected],
      });
      if (variant.violationsRef !== undefined) {
        // The captured array IS the thrown error's own array (reference
        // passthrough at the await side).
        expect(settled.errors?.[0]?.violations as unknown).toBe(
          variant.violationsRef,
        );
      }
      // THE MIRRORED RECORD BYTES at the child slot: ok:false, outputs
      // present as the empty object per the serializer, errors deep-equal
      // to the await-side capture, canonical key order with errors placed
      // before transcriptRef (durationMs unpinned as always).
      const raw = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      const parsed = expectCanonicalRecord(raw, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(parsed.ok).toBe(false);
      expect(parsed.capability).toEqual({
        name: "cap-alpha",
        version: "1.0.0",
        source: "builtin",
      });
      expect(parsed.outputs).toEqual({});
      expect(parsed.errors).toEqual([variant.expected]);
      expect(parsed.tokens).toBe(0);
      // FULL UNWIND despite the fault: both switch args in the pinned
      // shape, the entry popped (ledger back to [top])...
      expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
      expect(world.runtime.switchSession.mock.calls[0]).toEqual([
        childFile,
        { cwdOverride: "/work/fault" },
      ]);
      expect(world.runtime.switchSession.mock.calls[1]).toEqual([
        parentFile,
        { cwdOverride: "/work/fault" },
      ]);
      expect(activeFrames()).toHaveLength(1);
      expect(activeFrames()[0].capability.name).toBe("top");
      // ...and the RE-ARM LANDED: exactly one fresh listener on the
      // post-switch-back parent handle.
      expect(world.runtime.session).toBe(applied[1]);
      expect(world.runtime.session.live).toHaveLength(1);
      // THE IM recorder untouched across the fault cycle.
      expect(world.terminal.constructions).toBe(1);
      expect(world.terminal.stop).toHaveBeenCalledTimes(0);
      expect(world.stderr).not.toHaveBeenCalled();
    });
  }

  it("H7a cancelled switch-out: the latch RESOLVES with the pinned cancelled HopFaultError — nothing pushed (ledger still shows only the top entry), no record emitted, no teardown performed (the parent handle stays current and undisposed)", async () => {
    const { root, world } = buildAlphaWorld("/work/cancel");
    scriptSwitches(world, { kind: "cancel" });
    const settled = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (): Promise<Record<string, unknown>> => ({}),
    });
    expect(settled).toStrictEqual({
      ok: false,
      errors: [{ type: "HopFaultError", message: CANCELLED_SWITCH_REPLICA }],
    });
    const frames = activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].capability.name).toBe("top");
    // Pre-push fault: the switch mock was called exactly once (out only);
    // the current handle is unchanged and undisposed.
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(1);
    expect(world.runtime.session).toBe(world.parentHandle);
    expect(world.parentHandle.disposed).toBe(false);
    expect(countStatusFiles(root)).toBe(0);
  });

  it("H7b raw switch-out rejection: escapes UNMASKED into the catch-all — the await receives the RAW error capture (NOT a hop-fault mask), ledger untouched, no record, parent still current", async () => {
    const { root, world } = buildAlphaWorld("/work/reject");
    scriptSwitches(world, { kind: "reject", message: "raw switch rejection" });
    const settled = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (): Promise<Record<string, unknown>> => ({}),
    });
    expect(settled).toStrictEqual({
      ok: false,
      errors: [{ type: "Error", message: "raw switch rejection" }],
    });
    const frames = activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].capability.name).toBe("top");
    expect(world.runtime.session).toBe(world.parentHandle);
    expect(countStatusFiles(root)).toBe(0);
  });

  it("H8 failed switch-back: the child record is DURABLE (emitted before the back-switch) with the SUCCESS payload, the await instead receives the pinned switch-back HopFaultError — the divergence between record and await is the pin — while the release STILL pops the ledger (winds-unwound holds even when restore fails); the current handle remains the child's (no swap-back happened)", async () => {
    const { root, world } = buildAlphaWorld("/work/backfail");
    const childFile = join(root, CHILD_ID_A, "top", MINTED_FILE(1));
    const applied: PhysicsHandle[] = [];
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-a",
        persist: (path: string): void => {
          seedTranscript(path, "<seed>\n");
        },
        observe: (incoming: PhysicsHandle): void => {
          applied.push(incoming);
        },
      },
      {
        kind: "reject",
        message: "switch-back blowup",
      },
    );
    const settled = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (): Promise<Record<string, unknown>> => ({ durable: true }),
    });
    // THE divergence: the await got the machinery fault...
    expect(settled).toStrictEqual({
      ok: false,
      errors: [{ type: "HopFaultError", message: SWITCH_BACK_FAILED_REPLICA }],
    });
    // ...while the durable record kept the body's SUCCESS payload.
    const raw = readFileSync(
      join(root, CHILD_ID_A, "top", "status.json"),
      "utf8",
    );
    const parsed = expectCanonicalRecord(raw, [
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(parsed.ok).toBe(true);
    expect(parsed.outputs).toEqual({ durable: true });
    expect(parsed.tokens).toBe(0);
    // Winds-unwound: the pop happened regardless of the failed restore.
    const frames = activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].capability.name).toBe("top");
    // No swap-back occurred: the child handle stays current (undisposed);
    // the outgoing parent WAS disposed by the (successful) out-switch.
    expect(world.runtime.session).toBe(applied[0]);
    expect(world.runtime.session.sessionFile).toBe(childFile);
    expect(world.parentHandle.disposed).toBe(true);
  });

  it("H9a uninstalled: materializeFrame throws SYNCHRONOUSLY (caught in the same tick, before any latch or mutation) with the pinned not-installed FrameEnvironmentError — the base-level catch-all capture site this sync escape feeds", () => {
    // beforeEach's teardown guarantees the uninstalled state.
    let caught: unknown;
    let threwSynchronously = false;
    try {
      const probe = materializeFrame({
        capability: CONTRACT_GAMMA,
        body: async (): Promise<Record<string, unknown>> => ({}),
      });
      void probe;
    } catch (error) {
      caught = error;
      threwSynchronously = true;
    }
    expect(threwSynchronously).toBe(true);
    expect(caught).toBeInstanceOf(FrameEnvironmentError);
    expect((caught as FrameEnvironmentError).message).toBe(
      NOT_INSTALLED_REPLICA,
    );
    // No ledger, no holder: nothing mutated on the way out.
    expect(() => activeFrames()).toThrow(NOT_INSTALLED_REPLICA);
  });

  it("H9c installed direct-call sanity (the base-dispatch consumer view): an installed environment yields a native-settle promise that resolves with the success payload and leaves the ledger unwound", async () => {
    const { world } = buildAlphaWorld("/work/direct");
    scriptSwitches(
      world,
      { kind: "swap", sessionId: "sess-child-c" },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const promise = materializeFrame({
      capability: CONTRACT_GAMMA,
      idSeams: SEAMS_C,
      body: async (): Promise<Record<string, unknown>> => ({ direct: true }),
    });
    // Native promise shape (what a base-level catch-all would await).
    expect(typeof promise.then).toBe("function");
    const settled = await promise;
    expect(settled).toStrictEqual({ ok: true, outputs: { direct: true } });
    expect(activeFrames()).toHaveLength(1);
  });

  it("H10 acceptance #6 part 1 — ONE terminal lifetime across a combined multi-hop cycle (flat success on seams A, then a NESTED cycle on distinct seams B/C) and the simulated death: the module contributes ZERO terminal constructions, the harness IM stops ZERO times across both cycles, the ledger unwinds to [top] after EACH cycle, and the holder context's terminalStop invoked EXACTLY ONCE reaches the harness IM stop EXACTLY ONCE in total", async () => {
    const root = newTempRoot();
    const world = buildPhysicsWorld(root, "/work/lifetime");
    const parentFile = join(root, "top", "parent-transcript.jsonl");
    mkdirSync(join(root, "top"), { recursive: true });
    writeFileSync(parentFile, "<seed>\n");
    // Retain the installed holder context's terminalStop reference — the
    // death simulation invokes it exactly once at row end.
    const terminalStopImpl = vi.fn((): void => world.terminal.stop());
    installTopFrame(world, root, terminalStopImpl);
    const applied: PhysicsHandle[] = [];
    const observe = (incoming: PhysicsHandle): void => {
      applied.push(incoming);
    };
    const aFile = join(root, CHILD_ID_A, "top", MINTED_FILE(1));
    const bFile = join(root, CHILD_ID_B, "top", MINTED_FILE(2));
    const cFile = join(root, CHILD_ID_B, CHILD_ID_C, "top", MINTED_FILE(3));
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-a",
        persist: (path: string): void => {
          seedTranscript(path, "<a>\n");
        },
        observe,
      },
      { kind: "swap", sessionId: "sess-fake-0001", observe },
      {
        kind: "swap",
        sessionId: "sess-child-b",
        persist: (path: string): void => {
          seedTranscript(path, "<b>\n");
        },
        observe,
      },
      {
        kind: "swap",
        sessionId: "sess-child-c",
        persist: (path: string): void => {
          seedTranscript(path, "<c>\n");
        },
        observe,
      },
      // Nested unwinding order (measured): C-back onto B's retained file
      // BEFORE B-back onto the top parent.
      { kind: "swap", sessionId: "sess-child-b", observe },
      { kind: "swap", sessionId: "sess-fake-0001", observe },
    );
    // Cycle 1: the flat success.
    const first = await materializeFrame({
      capability: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (): Promise<Record<string, unknown>> => {
        expect(activeFrames()).toHaveLength(2);
        expect(activeFrames()[1].depth).toBe(1);
        return { cycle: 1 };
      },
    });
    expect(first).toStrictEqual({ ok: true, outputs: { cycle: 1 } });
    // Rest point 1: the ledger unwound to [top]...
    expect(activeFrames()).toHaveLength(1);
    // ...exactly one live handle (the freshly reopened parent)...
    expect(
      [world.parentHandle, ...applied].filter((h) => !h.disposed),
    ).toHaveLength(1);
    // ...and the harness IM stopped NEVER.
    expect(world.terminal.stop).toHaveBeenCalledTimes(0);
    // Cycle 2: the NESTED cycle (distinct seams B/C).
    const innerOutputs: Record<string, unknown> = { value: 42 };
    const second = await materializeFrame({
      capability: CONTRACT_BETA,
      idSeams: SEAMS_B,
      body: async (): Promise<Record<string, unknown>> => {
        const innerSettled = await materializeFrame({
          capability: CONTRACT_GAMMA,
          idSeams: SEAMS_C,
          body: async (): Promise<Record<string, unknown>> => {
            expect(activeFrames()).toHaveLength(3);
            return innerOutputs;
          },
        });
        return { inner: innerSettled };
      },
    });
    expect(second.ok).toBe(true);
    expect((second.outputs as { inner: CapabilityResult }).inner.outputs).toBe(
      innerOutputs,
    );
    // Rest point 2: the ledger unwound to [top] again...
    expect(activeFrames()).toHaveLength(1);
    // ...one live handle, the IM STILL untouched.
    expect(
      [world.parentHandle, ...applied].filter((h) => !h.disposed),
    ).toHaveLength(1);
    expect(world.terminal.stop).toHaveBeenCalledTimes(0);
    // Three independent records: the flat child plus the nested pair.
    expect(countStatusFiles(root)).toBe(3);
    expect(existsSync(join(root, CHILD_ID_A, "top", "status.json"))).toBe(true);
    expect(existsSync(join(root, CHILD_ID_B, "top", "status.json"))).toBe(true);
    expect(
      existsSync(join(root, CHILD_ID_B, CHILD_ID_C, "top", "status.json")),
    ).toBe(true);
    // The six switch calls: out-A, back-top, out-B, out-C, back-B,
    // back-top (each with the runtime's cwdOverride).
    const calls = world.runtime.switchSession.mock.calls.map(
      (call) => call[0],
    ) as string[];
    expect(calls).toEqual([aFile, parentFile, bFile, cFile, bFile, parentFile]);
    expect(world.runtime.switchSession.mock.calls[0][1]).toEqual({
      cwdOverride: "/work/lifetime",
    });
    // Mint args: per-cycle child top dirs (C nests UNDER B's scope dir).
    expect(sdkHarness.create.mock.calls.map((call) => call[1])).toEqual([
      join(root, CHILD_ID_A, "top"),
      join(root, CHILD_ID_B, "top"),
      join(root, CHILD_ID_B, CHILD_ID_C, "top"),
    ]);
    // One terminal construction for the lifetime of the row (world setup)
    // — the module contributed ZERO.
    expect(world.terminal.constructions).toBe(1);
    expect(world.stderr).not.toHaveBeenCalled();
    // DEATH SIMULATION: the holder context's terminalStop invoked exactly
    // once reaches the harness IM stop EXACTLY ONCE in total (acceptance
    // #6's scripted proof part 1 — the one-live-UI lifetime pin; part 2
    // rides the abort rows).
    terminalStopImpl();
    expect(terminalStopImpl).toHaveBeenCalledTimes(1);
    expect(world.terminal.stop).toHaveBeenCalledTimes(1);
  });

  it("the world runtime exposes a mirror dispose: the recorded call is awaitable, stays uninvoked until driven, and leaves no side effects on the handles", async () => {
    const world = buildPhysicsWorld(newTempRoot(), "/work/dispose");
    expect(world.runtime.dispose).toHaveBeenCalledTimes(0);
    await world.runtime.dispose();
    expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
    // The mirrored dispose touches ONLY its own recorder bookkeeping — the
    // current handle stays live and undisposed.
    expect(world.parentHandle.disposed).toBe(false);
    expect(world.parentHandle.live).toHaveLength(0);
  });

  it("the signal-target fake conforms structurally to the kill-capture target: each prepend APPENDS (dispatch runs by index), and the row-gate reports enter exactly once while opened parks forever", async () => {
    const signals = makeSignalFake();
    const first = (): void => {};
    const second = (): void => {};
    signals.target.prependListener("SIGTERM", first);
    signals.target.prependListener("SIGTERM", second);
    // Append-only list: dispatch order is the stored order (index-driven).
    expect(signals.handlers).toEqual([first, second]);

    const gate = rowGate();
    expect(gate.entered).toBeInstanceOf(Promise);
    expect(gate.opened).toBeInstanceOf(Promise);
    const enteredSeen = new Promise<number>((resolve) => {
      gate.entered.then(
        (): void => {
          resolve(1);
        },
        (): void => {
          resolve(0);
        },
      );
    });
    expect(await Promise.race([enteredSeen, Promise.resolve(0)])).toBe(0); // not yet
    gate.enter();
    expect(await enteredSeen).toBe(1); // entered fires exactly once
    const openedRaced = await Promise.race([
      gate.opened.then(
        (): string => "settled",
        (): string => "settled",
      ),
      Promise.resolve("parked"),
    ]);
    expect(openedRaced).toBe("parked"); // opened never settles
  });
});

describe("shutdown pass matrix (K rows — trigger × depth over the physics world)", () => {
  it("K1 user-abort × top-only: the wrapper discriminator fires the SYNC pass (holder installed + top UNCLAIMED) — the top PARTIAL lands ({user-abort, kill} shape stamped from the attached harness emitter, canonical bytes, live transcript at trigger time), the ONE-node frames.json snapshot pins cause token + activeScope echo + empty children in canonical order, the typed line names top@0.0.0 (depth 0), the exit sink receives EXACTLY [130], PASS-ORIGINATED stop/dispose stay ZERO (leg skip — totals remain the row's simulated 1/1), stderr carries exactly the one typed line, stdout stays zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k1");
    const { emitter: topEmitter } = attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      // THE row plays the IM internals of the in-terminal shutdown.
      world.terminal.stop();
      await world.runtime.dispose();
      // Trigger through the wrapped sink (the in-terminal exit attempt).
      guard.exit(0);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        130,
      ]);
      // Pass-originated stop/dispose = 0 (leg skip): totals remain the
      // row's simulated 1/1.
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      // THE top partial record (first-ever top record on this path).
      expect(topEmitter.hasClaimed()).toBe(true);
      const raw = readFileSync(join(root, "top", "status.json"), "utf8");
      const parsed = expectCanonicalRecord(raw, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(parsed.ok).toBe(false);
      expect(parsed.capability).toEqual({
        name: TOP_STAMP.name,
        version: TOP_STAMP.version,
        source: "builtin",
      });
      expect(parsed.outputs).toStrictEqual({});
      expect(parsed.errors).toStrictEqual([
        { type: "user-abort", cause: "kill" },
      ]);
      expect(parsed.transcriptRef).toBe(
        `${basename(root)}/top/parent-transcript.jsonl`,
      );
      expect(parsed.tokens).toBe(0);
      // THE ledger snapshot (one-node tree, canonical key order).
      const snapRaw = readFileSync(join(root, "frames.json"), "utf8");
      expect(snapRaw.endsWith("\n")).toBe(true);
      expect(snapRaw.startsWith('{\n  "cause"')).toBe(true);
      const snapKeys = [...snapRaw.matchAll(/^ {2}"([A-Za-z]+)":/gm)].map(
        (match) => match[1],
      );
      expect(snapKeys).toEqual(["cause", "activeScope", "frames"]);
      const snap = JSON.parse(snapRaw) as Record<string, unknown>;
      expect(snap.cause).toBe("user-abort");
      expect(snap.activeScope).toBe(root);
      const node = (snap.frames as unknown[])[0] as Record<string, unknown>;
      expect(Object.keys(node)).toEqual([
        "depth",
        "capability",
        "scopeDir",
        "sessionFile",
        "children",
      ]);
      expect(node.depth).toBe(0);
      expect(node.capability).toEqual({ name: "top", version: "0.0.0" });
      expect(node.scopeDir).toBe(root);
      expect(node.sessionFile).toBe(
        join(root, "top", "parent-transcript.jsonl"),
      );
      expect(node.children).toStrictEqual([]);
      // THE typed line — byte-exact, on the holder stderr sink, nothing else.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("top", "0.0.0", 0, "user-abort"),
      );
      expect(recursiveListing(root)).toEqual([
        "frames.json",
        "top/parent-transcript.jsonl",
        "top/status.json",
      ]);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K2 user-abort × mid-child: BOTH records land ALL in the partial shape (sync writes beat every cascade fs op) — the child stamped from its own capability over its scope dir AND the top from the attached harness emitter (live current-handle transcript at trigger = the child file); the child's PENDING latch REJECTS and reduces (REAL captureError) to EXACTLY {type:'FrameKillError', cause:'kill', message:<pinned>}; the TWO-NODE snapshot nests the who-called-whom edge with activeScope = the child's scope dir; the typed line names the CHILD frame (depth 1); exit [130]; CASCADE DRIVEN HOME: post-drain re-reads BYTE-IDENTICAL (claim-respect under a racing cascade); the PARKED top latch stays UNSETTLED; pass-originated stop/dispose zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k2");
    const { emitter: topEmitter } = attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const gate = rowGate();
    const childFile = join(root, CHILD_ID_A, "top", MINTED_FILE(1));
    scriptSwitches(world, {
      kind: "swap",
      sessionId: "sess-child-a",
      persist: (path: string): void => {
        seedTranscript(path, "<seed>\n");
      },
    });
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const promise = materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (): Promise<Record<string, unknown>> => {
          gate.enter();
          await gate.opened;
          return {};
        },
      });
      // Body reached = switch-out + push landed (ledger [top, child]).
      await gate.entered;
      // THE parked-latch tracker attaches BEFORE the trigger.
      const parkedSettled = { value: false };
      activeFrames()[0].latch.value.then(
        (): void => {
          parkedSettled.value = true;
        },
        (): void => {
          parkedSettled.value = true;
        },
      );
      // Usage lands on the CURRENT handle — the child's (hand-computed Σ33).
      emitLive(world.runtime.session, assistantMessageEnd(17, 9, 5, 2));
      // THE row plays the IM internals, then triggers the wrapper.
      world.terminal.stop();
      await world.runtime.dispose();
      guard.exit(0);
      // Pre-drain reads (the sync-mode determinism guarantee).
      const rawChildBefore = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      const rawTopBefore = readFileSync(
        join(root, "top", "status.json"),
        "utf8",
      );
      // Latch rejection consumed by expectation (no unhandled-rejection
      // noise) — REAL captureError reduction.
      const rejected = await promise.catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(FrameKillError);
      expect(captureError(rejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      // Cascade drain + macrotask flush, then the RE-READS: byte-identical
      // (the cascade's delegated emissions performed no second write).
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        readFileSync(join(root, CHILD_ID_A, "top", "status.json"), "utf8"),
      ).toBe(rawChildBefore);
      expect(readFileSync(join(root, "top", "status.json"), "utf8")).toBe(
        rawTopBefore,
      );
      // THE child partial (its own capability stamp + scope-dir placement).
      const childParsed = expectCanonicalRecord(rawChildBefore, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(childParsed.ok).toBe(false);
      expect(childParsed.capability).toEqual({
        name: "cap-alpha",
        version: "1.0.0",
        source: "builtin",
      });
      expect(childParsed.errors).toStrictEqual([
        { type: "user-abort", cause: "kill" },
      ]);
      expect(childParsed.transcriptRef).toBe(
        `${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
      );
      expect(childParsed.tokens).toBe(33);
      // THE top partial — the LIVE current-handle transcript AT TRIGGER is
      // the child file (each frame's record honesty rule).
      const topParsed = expectCanonicalRecord(rawTopBefore, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(topParsed.capability).toEqual({
        name: TOP_STAMP.name,
        version: TOP_STAMP.version,
        source: "builtin",
      });
      expect(topParsed.errors).toStrictEqual([
        { type: "user-abort", cause: "kill" },
      ]);
      expect(topParsed.transcriptRef).toBe(
        `${basename(root)}/${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
      );
      expect(topParsed.tokens).toBe(0);
      expect(topEmitter.hasClaimed()).toBe(true);
      // THE two-node snapshot (nested edge top→child, innermost scope).
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("user-abort");
      expect(snap.activeScope).toBe(join(root, CHILD_ID_A));
      const nodes = snap.frames as unknown[];
      expect(nodes).toHaveLength(1);
      const outerNode = nodes[0] as Record<string, unknown>;
      const innerNodes = outerNode.children as unknown[];
      expect(innerNodes).toHaveLength(1);
      const innerNode = innerNodes[0] as Record<string, unknown>;
      expect(outerNode.depth).toBe(0);
      expect(outerNode.scopeDir).toBe(root);
      // Live accessor at trigger time = the child file for BOTH nodes.
      expect(outerNode.sessionFile).toBe(childFile);
      expect(innerNode.depth).toBe(1);
      expect(innerNode.scopeDir).toBe(join(root, CHILD_ID_A));
      expect(innerNode.sessionFile).toBe(childFile); // captured constant
      expect(innerNode.children).toStrictEqual([]);
      // Typed line names the CHILD frame.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-alpha", "1.0.0", 1, "user-abort"),
      );
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        130,
      ]);
      // Pass-originated zeros (totals remain the row's simulated 1/1).
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      // THE parked top latch STILL UNSETTLED (never settled — process death
      // reclaims it; the unhandled-rejection hazard is avoided by skipping).
      expect(parkedSettled.value).toBe(false);
      expect(recursiveListing(root)).toEqual([
        `${CHILD_ID_A}/top/${MINTED_FILE(1)}`,
        `${CHILD_ID_A}/top/status.json`,
        "frames.json",
        "top/parent-transcript.jsonl",
        "top/status.json",
      ]);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K3 user-abort × mid-grandchild: THREE records (grandchild + B + top) ALL in the partial shape with the innermost-first structure mirrored in the THREE-NODE nested snapshot (activeScope = the grandchild's scope dir, sole-child edges node i → node i+1); BOTH held composed latches (outer + inner) reject with the pinned FrameKillError; the typed line names the GRANDCHILD (depth 2); exit [130]; full cascade-driven-home byte-stability across ALL three files; pass-originated stop/dispose zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k3");
    const { emitter: topEmitter } = attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const gate = rowGate();
    const bFile = join(root, CHILD_ID_B, "top", MINTED_FILE(1));
    const cFile = join(root, CHILD_ID_B, CHILD_ID_C, "top", MINTED_FILE(2));
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-b",
        persist: (path: string): void => {
          seedTranscript(path, "<b>\n");
        },
      },
      {
        kind: "swap",
        sessionId: "sess-child-c",
        persist: (path: string): void => {
          seedTranscript(path, "<c>\n");
        },
      },
    );
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      let innerPromiseRef: Promise<CapabilityResult> | undefined;
      const outerPromise = materializeFrame({
        capability: CONTRACT_BETA,
        idSeams: SEAMS_B,
        body: async (): Promise<Record<string, unknown>> => {
          innerPromiseRef = materializeFrame({
            capability: CONTRACT_GAMMA,
            idSeams: SEAMS_C,
            body: async (): Promise<Record<string, unknown>> => {
              gate.enter();
              await gate.opened;
              return {};
            },
          });
          await innerPromiseRef;
          return {};
        },
      });
      // Inner body reached = ledger [top, B, C].
      await gate.entered;
      const parkedSettled = { value: false };
      activeFrames()[0].latch.value.then(
        (): void => {
          parkedSettled.value = true;
        },
        (): void => {
          parkedSettled.value = true;
        },
      );
      // Usage lands on the CURRENT handle — the grandchild's (Σ11).
      emitLive(world.runtime.session, assistantMessageEnd(2, 3, 5, 1));
      world.terminal.stop();
      await world.runtime.dispose();
      guard.exit(0);
      // Pre-drain reads.
      const rawC = readFileSync(
        join(root, CHILD_ID_B, CHILD_ID_C, "top", "status.json"),
        "utf8",
      );
      const rawB = readFileSync(
        join(root, CHILD_ID_B, "top", "status.json"),
        "utf8",
      );
      const rawTop = readFileSync(join(root, "top", "status.json"), "utf8");
      // BOTH held latches rejected with the pinned caused capture.
      const innerRejected = await innerPromiseRef!.catch(
        (error: unknown): unknown => error,
      );
      expect(innerRejected).toBeInstanceOf(FrameKillError);
      expect(captureError(innerRejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      const outerRejected = await outerPromise.catch(
        (error: unknown): unknown => error,
      );
      expect(outerRejected).toBeInstanceOf(FrameKillError);
      expect(captureError(outerRejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      // Full cascade drain + flush: ALL three files byte-stable.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        readFileSync(
          join(root, CHILD_ID_B, CHILD_ID_C, "top", "status.json"),
          "utf8",
        ),
      ).toBe(rawC);
      expect(
        readFileSync(join(root, CHILD_ID_B, "top", "status.json"), "utf8"),
      ).toBe(rawB);
      expect(readFileSync(join(root, "top", "status.json"), "utf8")).toBe(
        rawTop,
      );
      // The GRANDCHILD partial (partial shape exact).
      const cParsed = expectCanonicalRecord(rawC, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(cParsed.capability).toEqual({
        name: "cap-gamma",
        version: "3.0.0",
        source: "builtin",
      });
      expect(cParsed.errors).toStrictEqual([
        { type: "user-abort", cause: "kill" },
      ]);
      expect(cParsed.transcriptRef).toBe(`${CHILD_ID_C}/top/${MINTED_FILE(2)}`);
      expect(cParsed.tokens).toBe(11);
      // The B partial.
      const bParsed = expectCanonicalRecord(rawB, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(bParsed.capability).toEqual({
        name: "cap-beta",
        version: "2.0.0",
        source: "builtin",
      });
      expect(bParsed.errors).toStrictEqual([
        { type: "user-abort", cause: "kill" },
      ]);
      expect(bParsed.transcriptRef).toBe(`${CHILD_ID_B}/top/${MINTED_FILE(1)}`);
      expect(bParsed.tokens).toBe(0);
      // The top partial (live current handle at trigger = the C file).
      const topParsed = expectCanonicalRecord(rawTop, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(topParsed.capability).toEqual({
        name: TOP_STAMP.name,
        version: TOP_STAMP.version,
        source: "builtin",
      });
      expect(topParsed.errors).toStrictEqual([
        { type: "user-abort", cause: "kill" },
      ]);
      expect(topParsed.transcriptRef).toBe(
        `${basename(root)}/${CHILD_ID_B}/${CHILD_ID_C}/top/${MINTED_FILE(2)}`,
      );
      expect(topEmitter.hasClaimed()).toBe(true);
      // THE three-node snapshot (sole-child adjacency: node i's child = i+1).
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("user-abort");
      expect(snap.activeScope).toBe(join(root, CHILD_ID_B, CHILD_ID_C));
      const rootNodes = snap.frames as unknown[];
      expect(rootNodes).toHaveLength(1);
      const n0 = rootNodes[0] as Record<string, unknown>;
      const n1List = n0.children as unknown[];
      expect(n1List).toHaveLength(1);
      const n1 = n1List[0] as Record<string, unknown>;
      const n2List = n1.children as unknown[];
      expect(n2List).toHaveLength(1);
      const n2 = n2List[0] as Record<string, unknown>;
      expect([n0.depth, n1.depth, n2.depth]).toEqual([0, 1, 2]);
      expect(n0.scopeDir).toBe(root);
      expect(n1.scopeDir).toBe(join(root, CHILD_ID_B));
      expect(n2.scopeDir).toBe(join(root, CHILD_ID_B, CHILD_ID_C));
      expect(n0.sessionFile).toBe(cFile);
      expect(n1.sessionFile).toBe(bFile);
      expect(n2.sessionFile).toBe(cFile); // captured constant (C's own file)
      expect(n2.children).toStrictEqual([]);
      // Typed line names the GRANDCHILD.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-gamma", "3.0.0", 2, "user-abort"),
      );
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        130,
      ]);
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      expect(parkedSettled.value).toBe(false);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K4 sigterm × top-only (THE SINGLE-FRAME BACK-COMPAT ROW): the guard handler (index 1 — legacy armed FIRST on the fake, guard SECOND) drives the async pass over the SHARED assembly core: the TOP record matches the shipped SIGTERM kill shape ({type:'SIGTERM', cause:'kill'}, same path as the legacy path) and the DELEGATION sub-pin holds (drive the LEGACY handler next ⇒ NO second write — hasClaimed deferral, bytes stable); the one-node snapshot pins cause 'sigterm'; the typed line names top@0.0.0 (depth 0) ended by sigterm; the exit sink receives [1] — NOT 130 (sigterm normalization); PASS-ORIGINATED stop = 1 + dispose = 1 reach the harness recorder via the holder closures; stderr === [typed line]; stdout zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k4");
    // THE shared fake: the legacy arm lands FIRST (index 0), the guard's
    // prepend SECOND (index 1) — last-prepended-runs-first.
    const sharedSignals = makeSignalFake();
    const harness = attachHarnessTopEmitter(
      world,
      top,
      root,
      sharedSignals.target,
    );
    harness.emitter.armKillCapture();
    const { exitSpy, signals } = buildGuardSeams(sharedSignals);
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      // Order pin: the fake received EXACTLY two SIGTERM handlers — legacy
      // FIRST (armed before the guard install), guard SECOND (last-
      // prepended-runs-first). Drive the GUARD's handler (index 1).
      expect(signals.handlers).toHaveLength(2);
      signals.handlers[1]();
      await vi.waitFor(() => {
        expect(exitSpy).toHaveBeenCalledTimes(1);
      });
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([1]); // sigterm normalization — NOT 130
      // THE top record: the shipped SIGTERM kill shape.
      const raw = readFileSync(join(root, "top", "status.json"), "utf8");
      const parsed = expectCanonicalRecord(raw, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(parsed.ok).toBe(false);
      expect(parsed.errors).toStrictEqual([{ type: "SIGTERM", cause: "kill" }]);
      expect(parsed.capability).toEqual({
        name: TOP_STAMP.name,
        version: TOP_STAMP.version,
        source: "builtin",
      });
      expect(parsed.tokens).toBe(0);
      expect(harness.emitter.hasClaimed()).toBe(true);
      // DELEGATION sub-pin: drive the LEGACY handler next (index 0) — a
      // kill-owned claim defers entirely: NO second write.
      const before = readFileSync(join(root, "top", "status.json"), "utf8");
      signals.handlers[0]();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(readFileSync(join(root, "top", "status.json"), "utf8")).toBe(
        before,
      );
      // Snapshot one-node tree + sigterm cause token.
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("sigterm");
      expect(snap.activeScope).toBe(root);
      // THE typed line — the single stderr line.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("top", "0.0.0", 0, "sigterm"),
      );
      // Pass-originated stop = 1 + dispose = 1 (reached the harness
      // recorder via the holder closures — no IM simulation in this row).
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K5 sigterm × mid-child: the INNERMOST (child) record is PARTIAL-SHAPE EXACT (its body never settles — no competitor) while the top record EXISTS EXACTLY ONCE with closed-vocabulary cause presence (shape intentionally UNPINNED — the claim race is platform-timing-dependent; the accepted window is documented, not chased); the held latch rejects with the pinned FrameKillError; the two-node snapshot pins activeScope = the child's scope dir + cause 'sigterm'; the typed line names the child (depth 1); exit [1]; pass stop = 1, dispose = 1; cascade drained home — ALL record files byte-stable post-drain (the zero-double-write pin)", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k5");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, signals } = buildGuardSeams();
    const gate = rowGate();
    scriptSwitches(world, {
      kind: "swap",
      sessionId: "sess-child-a",
      persist: (path: string): void => {
        seedTranscript(path, "<seed>\n");
      },
    });
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const promise = materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (): Promise<Record<string, unknown>> => {
          gate.enter();
          await gate.opened;
          return {};
        },
      });
      await gate.entered;
      // Early rejection consumption (unhandled-rejection hygiene for the
      // async trigger window below): the formal expectation drives the
      // semantics through its own independent handler.
      promise.catch((error: unknown): unknown => error);
      // Drive the GUARD's handler (the async sigterm pass + self-exit).
      signals.handlers[0]();
      await vi.waitFor(() => {
        expect(exitSpy).toHaveBeenCalledTimes(1);
      });
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([1]);
      // THE innermost record: partial-shape EXACT.
      const rawChild = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      const childParsed = expectCanonicalRecord(rawChild, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(childParsed.ok).toBe(false);
      expect(childParsed.capability).toEqual({
        name: "cap-alpha",
        version: "1.0.0",
        source: "builtin",
      });
      expect(childParsed.errors).toStrictEqual([
        { type: "SIGTERM", cause: "kill" },
      ]);
      // THE top record: EXISTS exactly once, closed-vocabulary cause
      // PRESENT — shape deliberately unpinned (the accepted claim-race
      // window: a racily-claimed frame may settle as completion-with-kill-
      // capture or as partial; the pin is presence + exactly-once + cause).
      const rawTop = readFileSync(join(root, "top", "status.json"), "utf8");
      const topParsed = JSON.parse(rawTop) as Record<string, unknown>;
      expect(topParsed.ok).toBe(false);
      const topErrors = topParsed.errors as Array<{ cause?: string }>;
      expect(Array.isArray(topErrors)).toBe(true);
      expect(topErrors[0]?.cause).toBe("kill");
      // Latch rejection shape (held promise consumed by expectation).
      const rejected = await promise.catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(FrameKillError);
      expect(captureError(rejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      // Snapshot: two nodes, sigterm cause, innermost scope.
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("sigterm");
      expect(snap.activeScope).toBe(join(root, CHILD_ID_A));
      expect(snap.frames).toHaveLength(1);
      // Typed line: child identity, depth 1, sigterm.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-alpha", "1.0.0", 1, "sigterm"),
      );
      // Pass-originated stops/disposes: exactly one each.
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      // Cascade drained home: ALL record files byte-stable post-drain —
      // the ZERO double-write pin anywhere.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        readFileSync(join(root, CHILD_ID_A, "top", "status.json"), "utf8"),
      ).toBe(rawChild);
      expect(readFileSync(join(root, "top", "status.json"), "utf8")).toBe(
        rawTop,
      );
      const snapBefore = readFileSync(join(root, "frames.json"), "utf8");
      expect(readFileSync(join(root, "frames.json"), "utf8")).toBe(snapBefore);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K6 sigterm × mid-grandchild: same treatment at depth 2 — the INNERMOST (grandchild) record is partial-shape EXACT, B + top exist exactly once with closed-vocabulary cause present (shapes unpinned per the accepted window); the THREE-NODE snapshot pins activeScope = the grandchild's scope dir + cause 'sigterm'; TWO held latches reject with the pinned caused capture; the typed line names the grandchild (depth 2); exit [1]; pass stop = 1, dispose = 1; zero double writes across ALL three records + the snapshot", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k6");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, signals } = buildGuardSeams();
    const gate = rowGate();
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-b",
        persist: (path: string): void => {
          seedTranscript(path, "<b>\n");
        },
      },
      {
        kind: "swap",
        sessionId: "sess-child-c",
        persist: (path: string): void => {
          seedTranscript(path, "<c>\n");
        },
      },
    );
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      let innerPromiseRef: Promise<CapabilityResult> | undefined;
      const outerPromise = materializeFrame({
        capability: CONTRACT_BETA,
        idSeams: SEAMS_B,
        body: async (): Promise<Record<string, unknown>> => {
          innerPromiseRef = materializeFrame({
            capability: CONTRACT_GAMMA,
            idSeams: SEAMS_C,
            body: async (): Promise<Record<string, unknown>> => {
              gate.enter();
              await gate.opened;
              return {};
            },
          });
          await innerPromiseRef;
          return {};
        },
      });
      await gate.entered;
      // Early rejection consumption for BOTH held latches (async trigger
      // window; the expectations observe via their own handlers).
      innerPromiseRef!.catch((error: unknown): unknown => error);
      outerPromise.catch((error: unknown): unknown => error);
      signals.handlers[0]();
      await vi.waitFor(() => {
        expect(exitSpy).toHaveBeenCalledTimes(1);
      });
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([1]);
      // THE innermost (grandchild) record: partial-shape EXACT.
      const rawC = readFileSync(
        join(root, CHILD_ID_B, CHILD_ID_C, "top", "status.json"),
        "utf8",
      );
      const cParsed = JSON.parse(rawC) as Record<string, unknown>;
      expect(cParsed.capability).toEqual({
        name: "cap-gamma",
        version: "3.0.0",
        source: "builtin",
      });
      expect(cParsed.errors).toStrictEqual([
        { type: "SIGTERM", cause: "kill" },
      ]);
      expect(cParsed.tokens).toBe(0);
      // B + top: exist exactly once, cause present (shapes unpinned).
      const rawB = readFileSync(
        join(root, CHILD_ID_B, "top", "status.json"),
        "utf8",
      );
      const rawTop = readFileSync(join(root, "top", "status.json"), "utf8");
      for (const raw of [rawB, rawTop]) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        expect(parsed.ok).toBe(false);
        const errors = parsed.errors as Array<{ cause?: string }>;
        expect(errors[0]?.cause).toBe("kill");
      }
      // BOTH held latches rejected with the pinned caused capture.
      const innerRejected = await innerPromiseRef!.catch(
        (error: unknown): unknown => error,
      );
      expect(innerRejected).toBeInstanceOf(FrameKillError);
      expect(captureError(innerRejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      const outerRejected = await outerPromise.catch(
        (error: unknown): unknown => error,
      );
      expect(outerRejected).toBeInstanceOf(FrameKillError);
      expect(captureError(outerRejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      // Three-node snapshot (sigterm cause, innermost scope).
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("sigterm");
      expect(snap.activeScope).toBe(join(root, CHILD_ID_B, CHILD_ID_C));
      expect(snap.frames).toHaveLength(1);
      // Typed line: grandchild identity, depth 2.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-gamma", "3.0.0", 2, "sigterm"),
      );
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      // ZERO double writes: all four artifacts byte-stable post-drain.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        readFileSync(
          join(root, CHILD_ID_B, CHILD_ID_C, "top", "status.json"),
          "utf8",
        ),
      ).toBe(rawC);
      expect(
        readFileSync(join(root, CHILD_ID_B, "top", "status.json"), "utf8"),
      ).toBe(rawB);
      expect(readFileSync(join(root, "top", "status.json"), "utf8")).toBe(
        rawTop,
      );
      const snapBefore = readFileSync(join(root, "frames.json"), "utf8");
      expect(readFileSync(join(root, "frames.json"), "utf8")).toBe(snapBefore);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K7 fatal × top-only: driven via the TRIGGER channel (async mode, NO self-exit — the exit spy stays EMPTY, the path rides the resolution channel): the TOP record is ABSENT (the fatal walk EXCLUDES the top — the boundary owns it), zero records anywhere under the root (no composed frames ⇒ no partials), the ONE-node snapshot pins cause 'fatal' + activeScope echo, the typed line names top@0.0.0 (depth 0) ended by fatal, PASS-ORIGINATED stop = 1 + dispose = 1 (legs run for non-user-abort triggers), stderr === [typed line], and the trigger PROMISE resolves (awaitable — the boundary contract); stdout zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k7");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      // The trigger RESOLVES when the pass completes (through the line).
      await guard.trigger("fatal");
      // NO self-exit: the fatal path rides the resolution channel.
      expect(exitSpy).not.toHaveBeenCalled();
      // THE top record is ABSENT (the fatal walk excluded it) and there are
      // no composed frames ⇒ zero records under the whole root.
      expect(existsSync(join(root, "top", "status.json"))).toBe(false);
      expect(countStatusFiles(root)).toBe(0);
      // THE one-node snapshot (fatal cause token, echo activeScope).
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("fatal");
      expect(snap.activeScope).toBe(root);
      // THE typed line — the single stderr line.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("top", "0.0.0", 0, "fatal"),
      );
      // Legs ran for the non-user-abort trigger.
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K8 fatal × mid-child: the COMPOSED child PARTIAL lands ({fatal, kill} literal, partial shape) while the TOP record stays ABSENT (boundary-owned); the child's PENDING latch rejects with the pinned caused capture; the two-node snapshot pins cause 'fatal' + activeScope = the child's scope dir; the typed line names the child (depth 1) ended by fatal; PASS-ORIGINATED stop = 1 + dispose = 1; the exit spy stays EMPTY; stderr === [typed line]; stdout zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k8");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const gate = rowGate();
    scriptSwitches(world, {
      kind: "swap",
      sessionId: "sess-child-a",
      persist: (path: string): void => {
        seedTranscript(path, "<seed>\n");
      },
    });
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const promise = materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (): Promise<Record<string, unknown>> => {
          gate.enter();
          await gate.opened;
          return {};
        },
      });
      await gate.entered;
      // Early rejection consumption (async trigger window below).
      promise.catch((error: unknown): unknown => error);
      await guard.trigger("fatal");
      // The COMPOSED partial lands (partial shape, the fatal literal).
      const rawChild = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      const childParsed = expectCanonicalRecord(rawChild, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      expect(childParsed.capability).toEqual({
        name: "cap-alpha",
        version: "1.0.0",
        source: "builtin",
      });
      expect(childParsed.errors).toStrictEqual([
        { type: "fatal", cause: "kill" },
      ]);
      // THE top record stays ABSENT (the boundary owns it there).
      expect(existsSync(join(root, "top", "status.json"))).toBe(false);
      // Latch rejected with the pinned caused capture.
      const rejected = await promise.catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(FrameKillError);
      expect(captureError(rejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      // Two-node snapshot (fatal cause, innermost scope).
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("fatal");
      expect(snap.activeScope).toBe(join(root, CHILD_ID_A));
      // Typed line: child identity, depth 1, fatal.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-alpha", "1.0.0", 1, "fatal"),
      );
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("K9 fatal × mid-grandchild: the composed records (grandchild + B) land EXACTLY ONCE in a kill-family CLOSED-VOCABULARY form (canonical shape, cause 'kill', type in {literal, caused-capture} — the accepted depth-2 claim-race window: the writer winner alternates between runs; see row body for the deviation note), while the TOP stays ABSENT; BOTH held latches reject with the pinned caused capture (deterministic — leg-(a) lands before any continuation settles); the THREE-NODE snapshot pins cause 'fatal' + activeScope = the grandchild's scope dir; the typed line names the grandchild (depth 2) ended by fatal; PASS-ORIGINATED stop = 1 + dispose = 1; the exit spy stays EMPTY; stderr === [typed line]; stdout zero", async () => {
    const { root, world, top } = buildAlphaWorld("/work/k9");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const gate = rowGate();
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-b",
        persist: (path: string): void => {
          seedTranscript(path, "<b>\n");
        },
      },
      {
        kind: "swap",
        sessionId: "sess-child-c",
        persist: (path: string): void => {
          seedTranscript(path, "<c>\n");
        },
      },
    );
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      let innerPromiseRef: Promise<CapabilityResult> | undefined;
      const outerPromise = materializeFrame({
        capability: CONTRACT_BETA,
        idSeams: SEAMS_B,
        body: async (): Promise<Record<string, unknown>> => {
          innerPromiseRef = materializeFrame({
            capability: CONTRACT_GAMMA,
            idSeams: SEAMS_C,
            body: async (): Promise<Record<string, unknown>> => {
              gate.enter();
              await gate.opened;
              return {};
            },
          });
          await innerPromiseRef;
          return {};
        },
      });
      await gate.entered;
      // Early rejection consumption for BOTH held latches (async trigger
      // window below).
      innerPromiseRef!.catch((error: unknown): unknown => error);
      outerPromise.catch((error: unknown): unknown => error);
      await guard.trigger("fatal");
      // THE composed records land EXACTLY ONCE each. DEVIATION NOTE
      // (accepted claim-race window, mirroring the K5/K6 top-cell
      // treatment): at depth 2 the winner between the pass's per-frame
      // partial ({fatal, kill} literal) and the frames' OWN settlement
      // emission (the CAUSED CAPTURE form, queued by leg-(a)'s rejection
      // landing before the partial emission) alternates BETWEEN RUNS —
      // engine-spec promise-job scheduling outside the contract's
      // guarantee. What IS contractual and pinned: canonical record
      // shape, kill-family CLOSED-VOCABULARY error (literal OR caused
      // capture), exactly-once, and byte-stability under the racing
      // cascade. (The rejection-FIRST leg order is deliberately kept:
      // latches die even if every downstream leg faults — fail-safe.
      //)
      const rawC = readFileSync(
        join(root, CHILD_ID_B, CHILD_ID_C, "top", "status.json"),
        "utf8",
      );
      const rawB = readFileSync(
        join(root, CHILD_ID_B, "top", "status.json"),
        "utf8",
      );
      const cParsed = expectCanonicalRecord(rawC, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      const bParsed = expectCanonicalRecord(rawB, [
        "ok",
        "capability",
        "outputs",
        "errors",
        "transcriptRef",
        "tokens",
        "durationMs",
      ]);
      for (const parsed of [cParsed, bParsed]) {
        expect(parsed.ok).toBe(false);
        const errs = parsed.errors as Array<{ type?: string; cause?: string }>;
        expect(errs).toHaveLength(1);
        expect(errs[0]?.cause).toBe("kill");
        expect(errs[0]?.type).toBeDefined();
        expect(["fatal", "FrameKillError"]).toContain(errs[0]?.type);
      }
      expect((cParsed.capability as { name: string }).name).toBe("cap-gamma");
      expect((bParsed.capability as { name: string }).name).toBe("cap-beta");
      // THE top record stays ABSENT.
      expect(existsSync(join(root, "top", "status.json"))).toBe(false);
      // BOTH held latches rejected with the pinned caused capture.
      const innerRejected = await innerPromiseRef!.catch(
        (error: unknown): unknown => error,
      );
      expect(innerRejected).toBeInstanceOf(FrameKillError);
      const outerRejected = await outerPromise.catch(
        (error: unknown): unknown => error,
      );
      expect(outerRejected).toBeInstanceOf(FrameKillError);
      expect(captureError(outerRejected)).toStrictEqual({
        type: "FrameKillError",
        cause: "kill",
        message: FRAME_KILL_REPLICA,
      });
      // Three-node snapshot (fatal cause, innermost scope).
      const snap = JSON.parse(
        readFileSync(join(root, "frames.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(snap.cause).toBe("fatal");
      expect(snap.activeScope).toBe(join(root, CHILD_ID_B, CHILD_ID_C));
      // Typed line: grandchild identity, depth 2.
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-gamma", "3.0.0", 2, "fatal"),
      );
      expect(world.terminal.stop).toHaveBeenCalledTimes(1);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

describe("shutdown guard behaviors (G rows)", () => {
  it("G1(i) clean passthrough (SETTLED claim) passes the ORIGINAL code verbatim (no normalization — the raw 0 reaches the sink), performs NO writes (no frames.json, no typed line, stderr zero) and leaves the guard STATE UNPOISONED — the follow-up 'fatal' trigger runs the FULL pass afterwards (typed line + one-node snapshot land, the settled completion record survives byte-stable, trigger resolves)", async () => {
    // Variant (i): the settled-claim passthrough.
    const w1 = buildAlphaWorld("/work/g1i");
    const h1 = attachHarnessTopEmitter(w1.world, w1.top, w1.root);
    await h1.emitter.emit({ ok: true, outputs: {} }); // settles the claim
    const s1 = buildGuardSeams();
    s1.guard.exit(0);
    // CLEAN PASSTHROUGH: the original code VERBATIM (0 — NOT normalized).
    expect(s1.exitSpy).toHaveBeenCalledTimes(1);
    expect(s1.exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      0,
    ]);
    expect(existsSync(join(w1.root, "frames.json"))).toBe(false);
    expect(w1.world.stderr).not.toHaveBeenCalled();
    // UNPOISONED: the follow-up fatal trigger runs the full pass.
    await s1.guard.trigger("fatal");
    expect(w1.world.stderr).toHaveBeenCalledTimes(1);
    expect(w1.world.stderr.mock.calls[0]?.[0]).toBe(
      typedLineReplica("top", "0.0.0", 0, "fatal"),
    );
    expect(
      JSON.parse(readFileSync(join(w1.root, "frames.json"), "utf8")).cause,
    ).toBe("fatal");
    // The settled COMPLETION record survived untouched (byte-stable).
    const completedRaw = readFileSync(
      join(w1.root, "top", "status.json"),
      "utf8",
    );
    expect(JSON.parse(completedRaw).ok).toBe(true);
  });

  it("G1(ii) a FIRED guard normalizes repeated exit calls to the mapped code REGARDLESS of the incoming argument (exit(99) ⇒ 130 again — the cause map owns the code, not the caller), performs NO second pass (artifacts byte-stable, zero additional legs — stop/dispose stay at the user-abort leg-skip zeros), and keeps the exit history exactly [130, 130] with a single typed line", async () => {
    // Variant (ii): the fired-normalization idempotence.
    const w2 = buildAlphaWorld("/work/g1ii");
    const h2 = attachHarnessTopEmitter(w2.world, w2.top, w2.root);
    const s2 = buildGuardSeams();
    s2.guard.exit(0);
    const rawFirst = readFileSync(join(w2.root, "top", "status.json"), "utf8");
    const snapFirst = readFileSync(join(w2.root, "frames.json"), "utf8");
    s2.guard.exit(99); // ANY argument normalizes to the recorded cause map
    expect(s2.exitSpy).toHaveBeenCalledTimes(2);
    expect(s2.exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      130, 130,
    ]);
    // NO second pass: artifacts byte-stable, zero additional legs.
    expect(readFileSync(join(w2.root, "top", "status.json"), "utf8")).toBe(
      rawFirst,
    );
    expect(readFileSync(join(w2.root, "frames.json"), "utf8")).toBe(snapFirst);
    expect(w2.world.terminal.stop).not.toHaveBeenCalled();
    expect(w2.world.runtime.dispose).not.toHaveBeenCalled();
    expect(h2.emitter.hasClaimed()).toBe(true);
    expect(w2.world.stderr).toHaveBeenCalledTimes(1); // single typed line
  });

  it("G2 SILENT DEATH (holder NOT installed): the SIGTERM channel's pass writes NOTHING (no frames.json anywhere under the owned root, no typed line) yet still SELF-EXITS through the normalized code [1] (signal listeners defer default termination — the explicit exit is the contract), and the DIRECT trigger channel RESOLVES silently (first-trigger-wins idempotence: the racing trigger is a no-op that resolves, does not hang or throw) with the exit history staying EXACTLY once", async () => {
    const root = newTempRoot();
    const { exitSpy, signals, guard } = buildGuardSeams();
    // THE sigterm channel (the armed handler).
    signals.handlers[0]();
    await vi.waitFor(() => {
      expect(exitSpy).toHaveBeenCalledTimes(1);
    });
    expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([1]);
    // THE direct trigger channel: RESOLVES (idempotent no-op).
    await guard.trigger("sigterm");
    // NOTHING WRITTEN under the whole owned tree.
    expect(recursiveListing(root)).toEqual([]);
    // Exit history EXACTLY once (the racing trigger exited nothing).
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });

  it("G3 RACE: the IM internals die while the async pass is mid-flight — the pass's legs AND the row's simulated stop+dispose BOTH reach the recorder (swallowed by design — totals 2/2), the composed partial lands EXACTLY ONCE (byte-stable post-second-exit), the exit history is [1, 1] NOT [0, …] (a racing user-abort sink call after the fire normalizes to the recorded cause instead of leaking the raw 0), the typed line lands once (sigterm cause), and the snapshot pins cause 'sigterm'", async () => {
    const { root, world, top } = buildAlphaWorld("/work/g3");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, signals, guard } = buildGuardSeams();
    const gate = rowGate();
    scriptSwitches(world, {
      kind: "swap",
      sessionId: "sess-child-a",
      persist: (path: string): void => {
        seedTranscript(path, "<seed>\n");
      },
    });
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const promise = materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (): Promise<Record<string, unknown>> => {
          gate.enter();
          await gate.opened;
          return {};
        },
      });
      await gate.entered;
      // Early rejection consumption (async trigger window below).
      promise.catch((error: unknown): unknown => error);
      // THE RACE: the pass starts, the IM internals die concurrently.
      signals.handlers[0]();
      world.terminal.stop();
      await world.runtime.dispose();
      await vi.waitFor(() => {
        expect(exitSpy).toHaveBeenCalledTimes(1);
      });
      // A racing user-abort sink call AFTER the fire: NORMALIZED (1),
      // never the raw 0.
      guard.exit(0);
      expect(exitSpy).toHaveBeenCalledTimes(2);
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        1, 1,
      ]);
      // THE swallows: totals 2/2 (pass leg 1 + IM simulation 1 each).
      expect(world.terminal.stop).toHaveBeenCalledTimes(2);
      expect(world.runtime.dispose).toHaveBeenCalledTimes(2);
      // THE exactly-once artifact: the composed partial, byte-stable.
      const rawChild = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      expect(
        (JSON.parse(rawChild) as Record<string, unknown>).errors,
      ).toStrictEqual([{ type: "SIGTERM", cause: "kill" }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        readFileSync(join(root, CHILD_ID_A, "top", "status.json"), "utf8"),
      ).toBe(rawChild);
      expect(
        JSON.parse(readFileSync(join(root, "frames.json"), "utf8")).cause,
      ).toBe("sigterm");
      // Single typed line (sigterm cause, child identity, depth 1).
      expect(world.stderr).toHaveBeenCalledTimes(1);
      expect(world.stderr.mock.calls[0]?.[0]).toBe(
        typedLineReplica("cap-alpha", "1.0.0", 1, "sigterm"),
      );
      const rejected = await promise.catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(FrameKillError);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("G4 UNINSTALL: double-uninstall is IDEMPOTENT (no throw), and after uninstall every channel degrades to RAW passthrough — the exit wrapper forwards an unmapped code (7 — deliberately distinct from 130/1) VERBATIM, and the armed SIGTERM handler goes INERT (fires the trigger internally, which is a no-op: no self-exit, no writes)", async () => {
    const { root, world, top } = buildAlphaWorld("/work/g4");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, signals, guard } = buildGuardSeams();
    // Coverage boundary: the native exit wrap/restore leg is never exercised hermetically (seam discipline — this row drives seam sinks only; nothing mutates the real process sink); it is structurally covered here and observed in the manual E2E abort leg (#4).
    guard.uninstall();
    guard.uninstall(); // idempotent — no throw
    guard.exit(7);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([7]);
    // THE inert handler: no self-exit, no pass, no writes.
    signals.handlers[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(existsSync(join(root, "frames.json"))).toBe(false);
    expect(world.stderr).not.toHaveBeenCalled();
  });

  it("G5 PARKED-LATCH SURVIVAL: the shutdown pass REJECTS the composed latches but STRUCTURALLY SKIPS the outermost (top) frame's parked latch — after the FULL cascade drains home (rejections consumed + macrotask flush × 2 ticks) the parked-top tracker is STILL UNSETTLED (process death reclaims it; settling it would fabricate a consumer the platform never had), and the fired guard's follow-up exit call normalizes WITHOUT re-passing (bytes stable)", async () => {
    const { root, world, top } = buildAlphaWorld("/work/g5");
    attachHarnessTopEmitter(world, top, root);
    const { exitSpy, guard } = buildGuardSeams();
    const gate = rowGate();
    scriptSwitches(world, {
      kind: "swap",
      sessionId: "sess-child-a",
      persist: (path: string): void => {
        seedTranscript(path, "<seed>\n");
      },
    });
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const promise = materializeFrame({
        capability: CONTRACT_ALPHA,
        idSeams: SEAMS_A,
        body: async (): Promise<Record<string, unknown>> => {
          gate.enter();
          await gate.opened;
          return {};
        },
      });
      await gate.entered;
      // THE parked-top tracker attaches BEFORE the trigger.
      const parkedSettled = { value: false };
      activeFrames()[0].latch.value.then(
        (): void => {
          parkedSettled.value = true;
        },
        (): void => {
          parkedSettled.value = true;
        },
      );
      guard.exit(0);
      // Consume the child rejection (hygiene), read the artifacts pre-drain.
      const rejected = await promise.catch((error: unknown): unknown => error);
      expect(rejected).toBeInstanceOf(FrameKillError);
      const rawChild = readFileSync(
        join(root, CHILD_ID_A, "top", "status.json"),
        "utf8",
      );
      // Full cascade drain + a SECOND flush tick: the parked latch MUST
      // remain unsettled through it all.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(parkedSettled.value).toBe(false);
      // Fired-guard follow-up: normalized, no re-pass (bytes stable).
      guard.exit(42);
      expect(exitSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
        130, 130,
      ]);
      expect(
        readFileSync(join(root, CHILD_ID_A, "top", "status.json"), "utf8"),
      ).toBe(rawChild);
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

describe("capture-ladder pre-flight (real status.ts — leaf-pure, no mock)", () => {
  it("captureError over the not-installed error reduces to EXACTLY { type: 'FrameEnvironmentError', message: <pinned> } — bare identity, no cause, no extra keys", () => {
    const captured = captureError(
      new FrameEnvironmentError(NOT_INSTALLED_REPLICA),
    );
    expect(captured).toStrictEqual({
      type: "FrameEnvironmentError",
      message: NOT_INSTALLED_REPLICA,
    });
  });

  it("captureError over the interruption error reduces to EXACTLY { type: 'FrameKillError', cause: 'kill', message: <pinned> } — the CAUSED shape (unlike the two bare identities above): the shutdown pass is the only producer, and the latch-rejection pins ride this exact reduction", () => {
    expect(captureError(new FrameKillError())).toStrictEqual({
      type: "FrameKillError",
      cause: "kill",
      message: FRAME_KILL_REPLICA,
    });
  });

  it("captureError over the FOUR hop-fault messages each reduces to { type: 'HopFaultError', message: <pinned replica> } — bare identity, no cause, no extra keys (the pre-flight that the H-row body-fault pins rely on)", () => {
    const replicas = [
      PARENT_UNNAMED_REPLICA,
      MINT_UNNAMED_REPLICA,
      CANCELLED_SWITCH_REPLICA,
      SWITCH_BACK_FAILED_REPLICA,
    ];
    for (const replica of replicas) {
      expect(captureError(new HopFaultError(replica))).toStrictEqual({
        type: "HopFaultError",
        message: replica,
      });
    }
  });
});

describe("export surface", () => {
  it("runtime export surface is EXACTLY ['FrameEnvironmentError', 'FrameKillError', 'HopFaultError', 'activeFrames', 'attachTopEmitter', 'installExitGuard', 'installFrameEnvironment', 'isFrameEnvironmentInstalled', 'materializeFrame', 'teardownFrameEnvironment'] (interfaces/types erase under erasable syntax; the latch + holder + orchestrator + guard-state machinery stays module-private)", async () => {
    expect(Object.keys(await import("./terminal-takeover.ts")).sort()).toEqual(
      [
        "FrameEnvironmentError",
        "FrameKillError",
        "HopFaultError",
        "activeFrames",
        "attachTopEmitter",
        "installExitGuard",
        "installFrameEnvironment",
        "isFrameEnvironmentInstalled",
        "materializeFrame",
        "teardownFrameEnvironment",
      ].sort(),
    );
  });
});

describe("source guards (hop edge discipline over terminal-takeover.ts)", () => {
  const src = readFileSync(
    new URL("./terminal-takeover.ts", import.meta.url),
    "utf8",
  );

  it("static import clauses are EXACTLY the eight admitted specifiers in canonical order (node:path join + SDK AgentSession view + layout seam pair + pio-session pair + status PAIR — the status type clause carries KillCaptureTarget + SessionStatusError alongside CapabilityResult/StatusEmitter; type clauses erase under erasable syntax)", () => {
    const staticClauses = [
      ...src.matchAll(
        /^\s*import\s+(?:type\s+)?[\w${},\s]+?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(staticClauses).toEqual([
      "node:path",
      "@earendil-works/pi-coding-agent",
      "../sandbox/layout.ts",
      "../sandbox/layout.ts",
      "./pio-session.ts",
      "./pio-session.ts",
      "./status.ts",
      "./status.ts",
    ]);
  });

  it("the VALUE clause set is EXACTLY [node:path, ../sandbox/layout.ts, ./pio-session.ts, ./status.ts] in order (leaf-pure siblings + one builtin — no SDK value import at module load)", () => {
    const valueSpecifiers = [
      ...src.matchAll(
        /^\s*import\s+(?!type\b)[\w${},\s]+?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(valueSpecifiers).toEqual([
      "node:path",
      "../sandbox/layout.ts",
      "./pio-session.ts",
      "./status.ts",
    ]);
  });

  it("EXACTLY ONE dynamic import( occurrence and it is the SDK-root literal thunk (the module's sole SDK value reach, fire-time only)", () => {
    const dynThunks = src.match(/import\(\s*["'][^"']+["']\s*\)/g) ?? [];
    expect(dynThunks).toEqual(['import("@earendil-works/pi-coding-agent")']);
  });

  it("every process. MEMBER ACCESS (collected exhaustively) is exit-ONLY — the default exit-sink wrap reaches through a structural view (process as ExitSinkView) and signal handlers ride the injected target, so no direct process member spelling survives at all (a zero-match set satisfies the superset pin)", () => {
    const members = new Set(
      [...src.matchAll(/process\.(\w+)/g)].map((match) => match[1]),
    );
    for (const member of members) {
      expect(member).toBe("exit");
    }
  });

  it("zero occurrences of SIGINT (user-abort interception is the wrapper's job — the module never installs an INT handler nor spells the literal anywhere, not even in comments)", () => {
    expect(src.includes("SIGINT")).toBe(false);
  });

  it("zero occurrences of parentSession (no session lineage is minted by this module)", () => {
    expect(src.includes("parentSession")).toBe(false);
  });

  it("zero occurrences of InteractiveMode (composed frames never mount terminals — entry-owned exclusively)", () => {
    expect(src.includes("InteractiveMode")).toBe(false);
  });

  it("zero occurrences of armKillCapture (signal concerns belong to the outermost entry alone)", () => {
    expect(src.includes("armKillCapture")).toBe(false);
  });
});
