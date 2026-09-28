// Holder-unit rows for the terminal-takeover foundation module, plus the
// hop-world harness the hop matrix consumes: an SDK-root factory mock with
// a DETERMINISTIC manager mint (arg-recording + a platform-named file under
// the given dir, ZERO filesystem side effects — platform dir/file creation
// is NOT simulated except SCRIPTED TRANSCRIPT PERSISTENCE driven by the
// swap script), physics-mirror swap handling, the harness-minted SINGLE
// terminal-shaped recorder per world (standing for the entry-mounted
// terminal; the module never constructs or drives a terminal), and
// forced-teardown tmpdir roots.
//
// Foundation rows run over the REAL module with structurally-complete
// fakes (the fake top frame covers the module's reach path only:
// runtime.session.sessionFile, counters(), a rebind spy, id); the cast at
// each scripted site mirrors the sibling suites' single documented cast
// idiom. beforeEach tears down the
// process-scoped holder so no row leaks state into the next; temp roots
// are removed in afterEach, even on assertion failure.
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
import { ContractViolationError } from "./errors.ts";
import type { SessionVariableStore } from "./pio-session.ts";
import { PioSession } from "./pio-session.ts";
import type { CapabilityResult } from "./status.ts";
import { captureError, createStatusEmitter } from "./status.ts";
import type { ActiveFrame } from "./terminal-takeover.ts";
import {
  activeFrames,
  FrameEnvironmentError,
  HopFaultError,
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

/** Mirror the measured handle physics (S02 idiom): subscribe returns a
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

/** THE composed-world top frame: REAL PioSession.fromRuntime over the
 * settled fake runtime (the documented cast seam), installed as the
 * outermost ledger entry over the row's tmpdir sessions root. */
function installTopFrame(world: PhysicsWorld, root: string): PioSession {
  const topFrame = PioSession.fromRuntime(asRuntime(world.runtime));
  installFrameEnvironment({
    sessionsRoot: root,
    topFrame,
    terminalStop: (): void => {
      world.terminal.stop();
    },
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

// ─── Hop matrix (step 3 — materializeFrame over the physics world) ─────
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
  it("H1 THE full success cycle: synchronous dispatch returns the caller's promise identity early; the detached continuation mints the child scope ONE SEGMENT under the current scope dir through the sole SDK thunk, captures the PRE-HOP parent transcript, switches out with cwdOverride, pushes depth 1, runs the body on the adopted frame (fresh token counter), emits the UNCONDITIONAL canonical child record BEFORE settling, switches back onto the CAPTURED parent file, re-arms without a yield, and pops + resolves in one gesture — outputs travel BY REFERENCE, exactly two switch calls, one SDK thunk, zero stdout, zero stderr", async () => {
    const { root, world, parentFile } = buildAlphaWorld("/work/alpha");
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
        contract: CONTRACT_ALPHA,
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
      expect(world.terminal.constructions).toBe(1);
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("H2 nested grandchildren (two stacked hops): scopes nest TWO segments under the root, inner child mints under the OUTER child's scope dir, four switch calls run out-A, out-B, back-to-A, back-to-parent, records land at <outer>/<inner>/top and <outer>/top, the harness top-frame record lands at <root>/top, outputs reference the inner settled payload BY REFERENCE, variable stores stay frame-private, one live handle throughout, all ledgers pop", async () => {
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
      contract: CONTRACT_ALPHA,
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
          contract: CONTRACT_BETA,
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
    // THE measured placement artifact: the emitter roots at the child
    // scope dir, so the ref origin is ONE SEGMENT UP (dirname of the
    // scope dir) — a grandchild ref therefore carries only its OWN id.
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
    // Same origin derivation as the child records: relative to ONE SEGMENT
    // UP from the emitter's sessionsRoot (here the mkdtemp root itself, so
    // the ref carries the root's basename — deterministic per run).
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
      contract: CONTRACT_GAMMA,
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

  it("H4 token continuity across the lifecycle: usage landing on the CURRENT (child) handle during the body advances the adopted frame's LIVE counters into the record AND stays readable through the popped ledger entry's accessor after the unwind — freshness proven, no double-counting against the parent", async () => {
    const { root, world } = buildAlphaWorld("/work/tokens");
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
    let entryRef: ActiveFrame | undefined;
    const settled = await materializeFrame({
      contract: CONTRACT_ALPHA,
      idSeams: SEAMS_A,
      body: async (frame: PioSession): Promise<Record<string, unknown>> => {
        expect(frame.counters().tokens).toBe(0);
        // Usage lands on the CURRENT handle — the child's.
        emitLive(world.runtime.session, assistantMessageEnd(11, 22, 3, 4));
        await Promise.resolve();
        expect(frame.counters().tokens).toBe(40);
        entryRef = activeFrames()[1];
        return { atBodyEnd: frame.counters().tokens };
      },
    });
    expect((settled.outputs as { atBodyEnd: number }).atBodyEnd).toBe(40);
    // Live read AT EMIT time: the record stamps the advanced counter.
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
    expect(parsed.tokens).toBe(40);
    // The popped entry's accessor still reads the SAME adopted host.
    expect(entryRef!.tokens()).toBe(40);
    // Parent untouched: its handle saw no events (disposed anyway — the
    // original counter lives nowhere shared).
    expect(world.parentHandle.live).toHaveLength(0);
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
      contract: CONTRACT_ALPHA,
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

  it("H6 body fault: a throwing body settles as the typed CAPTURE (never a rejection of the caller's promise), emits the failure record BEFORE switching back, and the unwind still completes — switch-back proceeds, the ledger pops, the re-arm lands; the record's ok:false + outputs:{} + captured error are the pins", async () => {
    const { root, world } = buildAlphaWorld("/work/fault");
    const applied: PhysicsHandle[] = [];
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-b",
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
      contract: CONTRACT_BETA,
      idSeams: SEAMS_B,
      body: async (): Promise<Record<string, unknown>> => {
        throw new ContractViolationError(["body fault"]);
      },
    });
    // THE await RESOLVED (not rejected) with the typed capture ladder.
    expect(settled).toStrictEqual({
      ok: false,
      errors: [
        {
          type: "ContractViolationError",
          cause: "contract",
          message: "Contract violation: body fault",
          violations: ["body fault"],
        },
      ],
    });
    // The failure record stands at the child slot: ok:false, outputs
    // always serialized as {}, errors BEFORE transcriptRef in the canonical
    // order, the captured error pinned.
    const raw = readFileSync(
      join(root, CHILD_ID_B, "top", "status.json"),
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
      name: "cap-beta",
      version: "2.0.0",
      source: "builtin",
    });
    expect(parsed.outputs).toEqual({});
    expect(parsed.errors).toEqual([
      {
        type: "ContractViolationError",
        cause: "contract",
        message: "Contract violation: body fault",
        violations: ["body fault"],
      },
    ]);
    expect(parsed.tokens).toBe(0);
    // Unwind completed despite the fault: switched back, composed entry popped (top remains).
    expect(world.runtime.session).toBe(applied[1]);
    expect(world.runtime.session.sessionFile).toBe(
      join(root, "top", "parent-transcript.jsonl"),
    );
    expect(activeFrames()).toHaveLength(1);
  });

  it("H7a cancelled switch-out: the latch RESOLVES with the pinned cancelled HopFaultError — nothing pushed (ledger still shows only the top entry), no record emitted, no teardown performed (the parent handle stays current and undisposed)", async () => {
    const { root, world } = buildAlphaWorld("/work/cancel");
    scriptSwitches(world, { kind: "cancel" });
    const settled = await materializeFrame({
      contract: CONTRACT_ALPHA,
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
      contract: CONTRACT_ALPHA,
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
      contract: CONTRACT_ALPHA,
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
        contract: CONTRACT_GAMMA,
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
      contract: CONTRACT_GAMMA,
      idSeams: SEAMS_C,
      body: async (): Promise<Record<string, unknown>> => ({ direct: true }),
    });
    // Native promise shape (what a base-level catch-all would await).
    expect(typeof promise.then).toBe("function");
    const settled = await promise;
    expect(settled).toStrictEqual({ ok: true, outputs: { direct: true } });
    expect(activeFrames()).toHaveLength(1);
  });

  it("H10 two sequential hops over ONE world (one terminal lifetime): distinct child scopes per hop, four switch calls alternating child/parent files, two independent records, the same reopened-parent identity each cycle, the module contributes ZERO terminal constructions and the live-handle count stays exactly one at every rest point", async () => {
    const { root, world, parentFile } = buildAlphaWorld("/work/seq");
    const applied: PhysicsHandle[] = [];
    const observe = (incoming: PhysicsHandle): void => {
      applied.push(incoming);
    };
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
      { kind: "swap", sessionId: "sess-fake-0001", observe },
    );
    const runCycle = (idSeams: IdSeams, cycle: number) =>
      materializeFrame({
        contract: CONTRACT_ALPHA,
        idSeams,
        body: async (): Promise<Record<string, unknown>> => {
          expect(activeFrames()).toHaveLength(2);
          expect(activeFrames()[1].depth).toBe(1);
          return { cycle };
        },
      });
    const first = await runCycle(SEAMS_A, 1);
    // Rest point 1: exactly one live handle (the reopened parent #1).
    expect(
      [world.parentHandle, ...applied].filter((h) => !h.disposed),
    ).toHaveLength(1);
    expect(world.runtime.session).toBe(applied[1]);
    const second = await runCycle(SEAMS_B, 2);
    // Rest point 2: same invariant, freshly reopened parent #2.
    expect(
      [world.parentHandle, ...applied].filter((h) => !h.disposed),
    ).toHaveLength(1);
    expect(world.runtime.session).toBe(applied[3]);
    expect(second.ok).toBe(true);
    expect(first).toStrictEqual({ ok: true, outputs: { cycle: 1 } });
    expect(second).toStrictEqual({ ok: true, outputs: { cycle: 2 } });
    // Two distinct child scopes, two independent records.
    expect(countStatusFiles(root)).toBe(2);
    const aParsed = expectCanonicalRecord(
      readFileSync(join(root, CHILD_ID_A, "top", "status.json"), "utf8"),
      ["ok", "capability", "outputs", "transcriptRef", "tokens", "durationMs"],
    );
    const bParsed = expectCanonicalRecord(
      readFileSync(join(root, CHILD_ID_B, "top", "status.json"), "utf8"),
      ["ok", "capability", "outputs", "transcriptRef", "tokens", "durationMs"],
    );
    expect(aParsed.outputs).toEqual({ cycle: 1 });
    expect(bParsed.outputs).toEqual({ cycle: 2 });
    // Switch pattern: out-A, back, out-B, back (file-based targets).
    const calls = world.runtime.switchSession.mock.calls.map(
      (call) => call[0],
    ) as string[];
    expect(calls).toEqual([
      join(root, CHILD_ID_A, "top", MINTED_FILE(1)),
      parentFile,
      join(root, CHILD_ID_B, "top", MINTED_FILE(2)),
      parentFile,
    ]);
    // Mint args: both roots' cwd, per-cycle child top dirs.
    expect(sdkHarness.create.mock.calls.map((call) => call[1])).toEqual([
      join(root, CHILD_ID_A, "top"),
      join(root, CHILD_ID_B, "top"),
    ]);
    // One terminal for the lifetime of the row.
    expect(world.terminal.constructions).toBe(1);
    expect(world.stderr).not.toHaveBeenCalled();
    expect(activeFrames()).toHaveLength(1);
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
  it("runtime export surface is EXACTLY ['FrameEnvironmentError', 'HopFaultError', 'activeFrames', 'installFrameEnvironment', 'materializeFrame', 'teardownFrameEnvironment'] (interfaces/types erase under erasable syntax; the latch + holder + orchestrator machinery stays module-private)", async () => {
    expect(Object.keys(await import("./terminal-takeover.ts")).sort()).toEqual(
      [
        "FrameEnvironmentError",
        "HopFaultError",
        "activeFrames",
        "installFrameEnvironment",
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

  it("static import clauses are EXACTLY the seven admitted specifiers in order (node:path join + SDK AgentSession view + layout seam pair + pio-session pair + status pair — type clauses erase under erasable syntax)", () => {
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

  it("ZERO process. member accesses (no signal handlers, no exits)", () => {
    expect(/process\.[A-Za-z_$]/.test(src)).toBe(false);
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
