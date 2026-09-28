// Holder-unit rows for the terminal-takeover foundation module. Pure-unit
// suite over the REAL module — zero runtime imports mean structurally-
// complete fakes suffice (the fake top frame covers the module's reach
// path only: runtime.session.sessionFile, counters(), a rebind spy, id);
// the cast at each scripted site mirrors the run-session suite's single
// documented cast idiom (zero casts live in the source). beforeEach tears
// down the process-scoped holder so no row leaks state into the next. No
// stdout spy: the module composes no stream bytes (stderr is
// caller-supplied).

import { readFileSync } from "node:fs";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { PioSession } from "./pio-session.ts";
import { captureError } from "./status.ts";
import {
  activeFrames,
  FrameEnvironmentError,
  installFrameEnvironment,
  teardownFrameEnvironment,
} from "./terminal-takeover.ts";

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
