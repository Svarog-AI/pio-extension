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
// idiom (zero casts live in the source). beforeEach tears down the
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

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { PioSession } from "./pio-session.ts";
import { captureError } from "./status.ts";
import {
  activeFrames,
  FrameEnvironmentError,
  installFrameEnvironment,
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
});

describe("export surface", () => {
  it("runtime export surface is EXACTLY ['FrameEnvironmentError', 'activeFrames', 'installFrameEnvironment', 'teardownFrameEnvironment'] (interfaces/types erase under erasable syntax; the createPendingLatch helper stays module-private)", async () => {
    expect(Object.keys(await import("./terminal-takeover.ts")).sort()).toEqual(
      [
        "FrameEnvironmentError",
        "activeFrames",
        "installFrameEnvironment",
        "teardownFrameEnvironment",
      ].sort(),
    );
  });
});

describe("source guards (foundation edge discipline over terminal-takeover.ts)", () => {
  const src = readFileSync(
    new URL("./terminal-takeover.ts", import.meta.url),
    "utf8",
  );

  it("ZERO static VALUE import statements — the admitted static clause set is EXACTLY the three `import type` clauses (SDK AgentSession view + sibling PioSession/SessionCounters pair + leaf-pure CapabilityResult; erased under erasable syntax — zero runtime evaluation)", () => {
    const valueSpecifiers = [
      ...src.matchAll(
        /^\s*import\s+(?!type\b)[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(valueSpecifiers).toEqual([]);
    const staticClauses = [
      ...src.matchAll(
        /^\s*import\s+(?:type\s+)?[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(staticClauses).toEqual([
      "@earendil-works/pi-coding-agent",
      "./pio-session.ts",
      "./status.ts",
    ]);
  });

  it("ZERO dynamic import( occurrences (zero runtime module evaluation — the type-only edge set admits nothing else)", () => {
    expect(src.match(/import\(/g)?.length ?? 0).toBe(0);
  });

  it("ZERO process. member accesses (no signal handlers, no exits)", () => {
    expect(/process\.[A-Za-z_$]/.test(src)).toBe(false);
  });

  it("zero occurrences of parentSession (no session lineage is minted by this module)", () => {
    expect(src.includes("parentSession")).toBe(false);
  });
});
