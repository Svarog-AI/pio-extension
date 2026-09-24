// Behavior-matrix TDD suite for the dedicated top-session entry. Drives
// `runSession(argv, io, seams?)` with captured sinks over factory-mocked
// consumer seams (probe / loader / session) and the REAL leaf-pure status
// module — observed through a pass-through factory that forwards every
// export verbatim to importOriginal and only records construction args and
// the arm-call position (captureError and every emitter method stay the
// real implementations). Hygiene rule: every real-emitter row injects a fake
// signals target + exit sink through the seam — the suite never arms REAL
// process signal handlers. Real-FS rows land in fresh tmpdirs with forced
// teardown. Plus mechanical lazy-SDK source guards over the entry source.
//
// Factory-evaluation flags: Vitest runs a mock factory at the mocked
// module's FIRST import (registration ≠ evaluation). Row order is therefore
// load-bearing — the cheap-parse block leads (all flags genuinely
// unevaluated), the miss block is the loader's first importer, the pipeline
// block is the session's first importer, and the probe blocks lead the probe
// factory. Flag reads inside a row must PRECEDE any post-hoc module fetch by
// the same row (the fetch flips its own flag).
//
// Documented cast seams: the fake session is structurally complete for the
// entry's reach path (counters + runtime.session.sessionFile) and is cast to
// the real static ONCE per scripted site; the captured emitter options are
// read through a structural view; parsed record bytes are read through
// Record<string, unknown>. Zero casts live in the SOURCE files.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
// Type-only edges — erased under erasable syntax, zero runtime evaluation.
// They name the types for the fixture seams without touching the mocked
// modules' runtime graphs.
import type { CapabilityResolution } from "./capability/loader.ts";
import type { PioSession } from "./capability/pio-session.ts";
import { type RunSessionIO, runSession } from "./run-session.ts";

const hoisted = vi.hoisted(() => ({
  evalFlags: {
    probeEvaluated: false,
    loaderEvaluated: false,
    sessionEvaluated: false,
  },
  // Replicated single-owner miss literal (owner: capabilityRefusalLine in
  // ./capability/loader.ts) — kept meaningful for the byte-pins below.
  missLine: (name: string): string =>
    `pio: capability '${name}' is not implemented yet`,
  /** Emitter-options captures through the pass-through status factory. */
  emitterOptionsLog: [] as unknown[],
  /** Pipeline event log: constructed / armed / run-called (row order). */
  invocations: [] as string[],
  /** Fresh tmpdir bases pending forced teardown. */
  tmpBases: [] as string[],
}));

// Hermetic dispatch seams: an unmocked dispatch could drive REAL session
// construction, bwrap launches, or network in a unit suite, so the SDK-
// reaching consumer modules are factory-mocked. The replicated single-owner
// literal keeps the byte-pins below meaningful (same idiom as cli.test.ts).
vi.mock("./probe.ts", () => {
  hoisted.evalFlags.probeEvaluated = true;
  return {
    run: vi.fn(),
    TTY_REFUSAL_LINE:
      "pio: 'probe' needs an interactive terminal (TTY); headless mode lands in R4",
    isInteractiveTty: vi.fn(),
  };
});
vi.mock("./capability/loader.ts", () => {
  hoisted.evalFlags.loaderEvaluated = true;
  return { resolveCapability: vi.fn() };
});
vi.mock("./capability/pio-session.ts", () => {
  hoisted.evalFlags.sessionEvaluated = true;
  return { PioSession: { create: vi.fn() } };
});
// NOT mocked away: the status module is leaf-pure and stays REAL here. This
// pass-through factory forwards EVERY export verbatim via importOriginal —
// it only observes createStatusEmitter construction args and the
// armKillCapture call position (required by the pipeline-order inventory).
// No behavior is scripted at the leaf.
vi.mock("./capability/status.ts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./capability/status.ts")>();
  return {
    ...actual,
    createStatusEmitter: (
      ...args: Parameters<typeof actual.createStatusEmitter>
    ) => {
      hoisted.emitterOptionsLog.push(args[0]);
      const real = actual.createStatusEmitter(...args);
      const originalArm = real.armKillCapture;
      real.armKillCapture = (): void => {
        hoisted.invocations.push("armed");
        originalArm.call(real);
      };
      return real;
    },
  };
});

const U = "pio-run-session <capability> --sessions-root <dir>";

/** Per-row mocked references into the probe seam (types from the real module). */
type ProbeModule = typeof import("./probe.ts");
let probeModulePromise: Promise<ProbeModule> | undefined;
async function probeModule(): Promise<ProbeModule> {
  probeModulePromise ??= import("./probe.ts");
  return probeModulePromise;
}

/** Memoized accessor for the mocked loader module. Deliberately LAZY: the
 * first fetch runs the loader factory (process-first import) and flips its
 * eval flag, so it must happen only in rows that tolerate/assert loader
 * evaluation. Nothing at file scope imports a consumer module, so cheap-path
 * rows observe genuinely unevaluated modules. */
type LoaderModule = typeof import("./capability/loader.ts");
let loaderModulePromise: Promise<LoaderModule> | undefined;
async function loaderModule(): Promise<LoaderModule> {
  loaderModulePromise ??= import("./capability/loader.ts");
  return loaderModulePromise;
}

/** Same lazy doctrine for the session seam. */
type SessionModule = typeof import("./capability/pio-session.ts");
let sessionModulePromise: Promise<SessionModule> | undefined;
async function sessionModule(): Promise<SessionModule> {
  sessionModulePromise ??= import("./capability/pio-session.ts");
  return sessionModulePromise;
}

/** Per-row mocked references into the probe seam. */
async function probeMocks() {
  const probe = await probeModule();
  return {
    run: vi.mocked(probe.run),
    isInteractiveTty: vi.mocked(probe.isInteractiveTty),
  };
}

function collectErr(): { io: RunSessionIO; err: string[] } {
  const err: string[] = [];
  return {
    io: { stderr: (line) => err.push(line) },
    err,
  };
}

function resetHoistedState(): void {
  hoisted.evalFlags.probeEvaluated = false;
  hoisted.evalFlags.loaderEvaluated = false;
  hoisted.evalFlags.sessionEvaluated = false;
  hoisted.invocations.length = 0;
  hoisted.emitterOptionsLog.length = 0;
}

afterEach(() => {
  // Forced teardown: no base survives a failed row.
  for (const base of hoisted.tmpBases.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

describe("runSession (strict two-value parse — cheap paths, ZERO module evaluation)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  const errors: ReadonlyArray<[argv: readonly string[], message: string]> = [
    [[], `expected capability name (usage: ${U})`],
    [[""], `expected capability name (usage: ${U})`],
    [["-h"], `unknown option: -h (usage: ${U})`],
    [["--huh"], `unknown option: --huh (usage: ${U})`],
    [["probe"], `expected --sessions-root <dir> after 'probe' (usage: ${U})`],
    [["probe", "--detach"], `unknown option: --detach (usage: ${U})`],
    [["probe", "positional"], `unexpected argument: positional (usage: ${U})`],
    [
      ["probe", "--sessions-root"],
      `expected a value for --sessions-root (usage: ${U})`,
    ],
    [
      ["probe", "--sessions-root", ""],
      `expected a value for --sessions-root (usage: ${U})`,
    ],
    [["probe", "--sessions-root", "-x"], `unknown option: -x (usage: ${U})`],
    [
      ["probe", "--sessions-root", "/x", "extra"],
      `unexpected argument: extra (usage: ${U})`,
    ],
    [
      ["probe", "--sessions-root", "/x", "--more"],
      `unknown option: --more (usage: ${U})`,
    ],
    [
      ["probe", "--sessions-root", "/x", "--sessions-root", "/y"],
      `unknown option: --sessions-root (usage: ${U})`,
    ],
    // Reordered flag rejected: no flag-position flexibility — the dash in the
    // capability slot is an unknown option.
    [
      ["--sessions-root", "/x", "probe"],
      `unknown option: --sessions-root (usage: ${U})`,
    ],
  ];
  for (const [argv, message] of errors) {
    it(`${JSON.stringify(argv)} -> exact prefixed error naming the offending token; ALL THREE consumer modules remain unevaluated`, async () => {
      const { io, err } = collectErr();
      const code = await runSession(argv, io);
      expect(code).toBe(1);
      expect(err).toEqual([`pio-run-session: ${message}`]);
      expect(hoisted.evalFlags.probeEvaluated).toBe(false);
      expect(hoisted.evalFlags.loaderEvaluated).toBe(false);
      expect(hoisted.evalFlags.sessionEvaluated).toBe(false);
    });
  }
});

describe("runSession (non-probe arm — loader gate fires before ANY session construction)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("unresolvable name: the LOADER'S miss line arrives verbatim on stderr + 1; the session/status thunks never fire, PioSession.create uncalled, probe untouched", async () => {
    const loaderMod = await loaderModule();
    const resolveMock = vi.mocked(loaderMod.resolveCapability);
    resolveMock.mockReset();
    resolveMock.mockResolvedValue({
      ok: false,
      refusal: hoisted.missLine("alpha"),
    });
    const { io, err } = collectErr();
    const code = await runSession(["alpha", "--sessions-root", "/x"], io);
    expect(code).toBe(1);
    expect(err).toEqual([hoisted.missLine("alpha")]);
    // Flag reads precede the post-hoc session-module fetch below (that fetch
    // would flip its own eval flag — row-order doctrine).
    expect(hoisted.evalFlags.loaderEvaluated).toBe(true);
    expect(hoisted.evalFlags.sessionEvaluated).toBe(false);
    expect(hoisted.evalFlags.probeEvaluated).toBe(false);
    expect(resolveMock).toHaveBeenCalledWith("alpha");
    // Post-hoc fetch (module identity stable): proves create was NEVER called.
    const { PioSession } = await sessionModule();
    expect(vi.mocked(PioSession.create)).not.toHaveBeenCalled();
  });

  // Sentinel passthrough battery: the gate prints whatever the loader decided
  // UNMODIFIED (byte-ownership of these families lives in the loader's own
  // suite) and still honors the pre-session guarantee.
  const sentinelFamilies: ReadonlyArray<
    readonly [family: string, refusal: string]
  > = [
    ["identity", "SENTINEL identity refusal (bytes owned by the loader suite)"],
    ["contract", "SENTINEL contract refusal (bytes owned by the loader suite)"],
    [
      "load-fault",
      "SENTINEL load-fault refusal (bytes owned by the loader suite)",
    ],
  ];
  for (const [family, refusal] of sentinelFamilies) {
    it(`${family}-refusal sentinel: printed VERBATIM + 1, pre-session (create uncalled, zero construction)`, async () => {
      const loaderMod = await loaderModule();
      const resolveMock = vi.mocked(loaderMod.resolveCapability);
      resolveMock.mockReset();
      resolveMock.mockResolvedValue({ ok: false, refusal });
      const { io, err } = collectErr();
      const code = await runSession(["alpha", "--sessions-root", "/x"], io);
      expect(code).toBe(1);
      expect(err).toEqual([refusal]);
      // Flag reads precede the post-hoc session-module fetch below.
      expect(hoisted.evalFlags.sessionEvaluated).toBe(false);
      expect(hoisted.evalFlags.probeEvaluated).toBe(false);
      const { PioSession } = await sessionModule();
      expect(vi.mocked(PioSession.create)).not.toHaveBeenCalled();
    });
  }
});

describe("runSession (TTY preflight — refusal before any construction)", () => {
  // Flag zeroing BEFORE the lazy fetch: the fetch may run the probe factory
  // (process-first import); the preflight row below reads that first-run
  // signal, so it must survive the hook.
  beforeEach(async () => {
    resetHoistedState();
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    runMock.mockReset();
    ttyMock.mockReset();
  });

  it("non-TTY stdin/stdout: byte-identical TTY refusal line, exit 1, ZERO construction past the refusal (the session thunk never fires for a probe refusal)", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(false);
    const { io, err } = collectErr();
    const code = await runSession(["probe", "--sessions-root", "/x"], io);
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio: 'probe' needs an interactive terminal (TTY); headless mode lands in R4",
    ]);
    expect(runMock).not.toHaveBeenCalled(); // zero construction past the refusal
    expect(hoisted.evalFlags.probeEvaluated).toBe(true);
    expect(hoisted.evalFlags.sessionEvaluated).toBe(false);
  });
});

describe("runSession (valid forms + builtin dispatch)", () => {
  // Flag zeroing BEFORE the lazy fetch: the fetch may run the probe factory
  // (process-first import); the dispatch rows read that first-run signal, so
  // it must survive the hook.
  beforeEach(async () => {
    resetHoistedState();
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    runMock.mockReset();
    ttyMock.mockReset();
  });

  it("accepts the renderer-emitted triple VERBATIM (cross-step continuity — data literal of the post-repoint buildTarget grammar [capability, --sessions-root, <engagementDir>/.sessions]; the producer pin lives in render.test.ts, the composer pin in TEST.md) and dispatches to the probe builtin with (the injected sink, { sessionsRoot }); exit 0 propagates; the session thunk never fires for probe", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(true);
    runMock.mockImplementation(async (sink) => {
      sink?.stderr("threaded-line");
      return 0;
    });
    const { io, err } = collectErr();
    const code = await runSession(
      ["probe", "--sessions-root", "/st/projects/k/engagements/e1/.sessions"],
      io,
    );
    expect(code).toBe(0);
    expect(runMock).toHaveBeenCalledTimes(1);
    const args = runMock.mock.calls[0];
    expect(args[0]).toBe(io); // first arg IS the injected sink — stderr routing proven by the line below
    expect(args[1]).toEqual({
      sessionsRoot: "/st/projects/k/engagements/e1/.sessions",
    });
    expect(err).toEqual(["threaded-line"]);
    expect(hoisted.evalFlags.sessionEvaluated).toBe(false); // probe name never fires the session thunk
  });

  it("relative value accepted verbatim (syntactic-only parser: consumers own validity)", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(true);
    runMock.mockResolvedValue(0);
    const { io, err } = collectErr();
    const code = await runSession(["probe", "--sessions-root", "rel/path"], io);
    expect(code).toBe(0);
    expect(runMock).toHaveBeenCalledWith(io, { sessionsRoot: "rel/path" });
    expect(err).toEqual([]);
  });

  it("exit code 1 from the builtin propagates unchanged", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(true);
    runMock.mockResolvedValue(1);
    const { io, err } = collectErr();
    const code = await runSession(["probe", "--sessions-root", "/x"], io);
    expect(code).toBe(1);
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(err).toEqual([]);
  });
});

// ---- Non-probe arm: pipeline wiring against factory-mocked loader/session
// seams and the REAL leaf-pure status module. Every real-emitter row injects
// a fake signals target + exit spy (hygiene: the suite never arms the real
// process). Row order is load-bearing — this block is the session module's
// first importer.

/** Structural view of the captured emitter options (assertion surface). */
interface CapturedEmitterOptions {
  readonly sessionsRoot: string;
  readonly capability: Readonly<{
    readonly name: string;
    readonly version: string;
  }>;
  readonly tokens: () => number;
  readonly sessionFile: () => string | undefined;
  readonly now?: () => number;
  readonly exit?: (code: number) => void;
  readonly signals?: unknown;
  readonly graceMs?: number;
  readonly settleLiveRun?: () => Promise<void>;
}

/** Kill-capture registration target shape (mirrors the status leaf's
 * canonical interface structurally — no import needed at the test level). */
interface SignalsTarget {
  prependListener(signal: "SIGTERM", handler: () => void): void;
}

/** One fixture instance as observed by the row. */
interface HarnessInstance {
  readonly paramsBag: { readonly session: unknown };
  readonly runArgs: unknown[];
}

interface PipelineWorld {
  readonly base: string;
  readonly sessionsRoot: string;
  readonly transcriptPath: string;
  readonly fake: Record<string, unknown>;
  readonly signalsTarget: SignalsTarget;
  readonly handlers: Array<() => void>;
  readonly exitCalls: number[];
  readonly exitSink: (code: number) => void;
  readonly instances: Array<HarnessInstance>;
  /** Inline fixture ctor handed to the mocked resolution descriptor. */
  readonly ctor: new (params: {
    session: unknown;
  }) => unknown;
  /** Resolves when the entry reaches the fixture's run() body. */
  readonly runStarted: Promise<void>;
}

function makePipelineWorld(options: {
  readonly runBehavior: () => Promise<unknown>;
  /** Extra termination-sink observer (fired alongside the internal log). */
  readonly onExit?: (code: number) => void;
}): PipelineWorld {
  const base = mkdtempSync(join(os.tmpdir(), "pio-runsess-"));
  hoisted.tmpBases.push(base);
  const sessionsRoot = join(base, ".sessions");
  // Plausible production placement: the top transcript sits beside the
  // terminal record under the sessions root.
  const transcriptPath = join(
    sessionsRoot,
    "top",
    "20260101T000000Z_deadbeefcafe.jsonl",
  );
  const fake: Record<string, unknown> = {
    id: "sess-fake",
    counters: (): { tokens: number } => ({ tokens: 42 }),
    runtime: {
      session: { sessionId: "sess-fake", sessionFile: transcriptPath },
    },
  };
  const handlers: Array<() => void> = [];
  const signalsTarget: SignalsTarget = {
    prependListener: (_signal, handler) => {
      handlers.push(handler);
    },
  };
  const exitCalls: number[] = [];
  const exitSink = (code: number): void => {
    exitCalls.push(code);
    options.onExit?.(code);
  };
  const instances: Array<HarnessInstance> = [];
  let runStartResolve: (() => void) | undefined;
  const runStarted = new Promise<void>((resolve) => {
    runStartResolve = resolve;
  });
  // Inline FIXTURE class: records construction args and the run() argument
  // list; the run payload is scripted per row via options.runBehavior.
  class HarnessCtor {
    readonly paramsBag: { session: unknown };
    // Reassigned when the entry invokes run() — not readonly.
    runArgs: unknown[];
    constructor(params: { session: unknown }) {
      this.paramsBag = params;
      this.runArgs = [];
      instances.push(this);
      hoisted.invocations.push("constructed");
    }
    run(...args: unknown[]): Promise<unknown> {
      this.runArgs = args;
      hoisted.invocations.push("run-called");
      runStartResolve?.();
      return options.runBehavior();
    }
  }
  return {
    base,
    sessionsRoot,
    transcriptPath,
    fake,
    signalsTarget,
    handlers,
    exitCalls,
    exitSink,
    instances,
    ctor: HarnessCtor,
    runStarted,
  };
}

/** Script the mocked loader hit + session creation against a world. */
async function scriptHitPipeline(world: PipelineWorld): Promise<void> {
  const loaderMod = await loaderModule();
  const resolveMock = vi.mocked(loaderMod.resolveCapability);
  resolveMock.mockReset();
  resolveMock.mockResolvedValue(
    // Cast seam: the fixture descriptor is structural (the real identity/
    // integrity checks never run against mocked loaders).
    {
      ok: true,
      capability: {
        contract: { name: "alpha", version: "9.9.9-sentinel" },
        ctor: world.ctor,
      },
    } as unknown as CapabilityResolution,
  );
  const { PioSession } = await sessionModule();
  const createMock = vi.mocked(PioSession.create);
  createMock.mockReset();
  // Cast seam: the fake session is structurally complete for the entry's
  // reach path (see file header).
  createMock.mockResolvedValue(world.fake as unknown as PioSession);
}

describe("runSession (non-probe arm — pipeline order and status emission)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("success pipeline: gate → session (EXACT (cwd, sessionsRoot)) → instantiate ({ session } identity) → arm (ONCE, indexed between construction and run) → run() (NO arguments) → emit (payload deep-equal) → mapped exit 0; the terminal record is canonical (key order, nullish dropped, source builtin, token scalar, transcriptRef relative to the engagement dir)", async () => {
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: true, outputs: { answer: 42 } }),
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink },
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const loaderMod = await loaderModule();
    const resolveMock = vi.mocked(loaderMod.resolveCapability);
    expect(resolveMock).toHaveBeenCalledWith("alpha");
    const { PioSession } = await sessionModule();
    const createMock = vi.mocked(PioSession.create);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(process.cwd(), world.sessionsRoot);
    expect(world.instances).toHaveLength(1);
    const inst = world.instances[0];
    expect(inst.paramsBag).toEqual({ session: world.fake });
    expect(inst.paramsBag.session).toBe(world.fake); // the CREATED instance, by reference
    expect(hoisted.invocations).toEqual(["constructed", "armed", "run-called"]);
    expect(inst.runArgs).toStrictEqual([]); // run() invoked with NO arguments
    expect(world.handlers).toHaveLength(1); // armKillCapture installed exactly once

    // Emitter options (captured through the pass-through seam): identity
    // stamped from the RESOLVED contract, LIVE accessors wired through the
    // created session, forwarded seam fields, module defaults untouched.
    expect(hoisted.emitterOptionsLog).toHaveLength(1);
    const opts = hoisted.emitterOptionsLog[0] as CapturedEmitterOptions;
    expect(opts.sessionsRoot).toBe(world.sessionsRoot);
    expect(opts.capability).toEqual({
      name: "alpha",
      version: "9.9.9-sentinel",
    });
    expect(opts.tokens()).toBe(42);
    expect(opts.sessionFile()).toBe(world.transcriptPath);
    expect(opts.signals).toBe(world.signalsTarget);
    expect(opts.exit).toBe(world.exitSink);
    expect(opts.now).toBeUndefined();
    expect(opts.graceMs).toBeUndefined();
    expect(opts.settleLiveRun).toBeUndefined();

    // Terminal record: canonical shape at the pinned placement.
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(record)).toEqual([
      "ok",
      "capability",
      "outputs",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(record.ok).toBe(true);
    expect(record.capability).toEqual({
      name: "alpha",
      version: "9.9.9-sentinel",
      source: "builtin",
    });
    expect(record.outputs).toEqual({ answer: 42 });
    // transcriptRef is RELATIVE TO THE ENGAGEMENT DIR (dirname of the
    // sessions root) — hence the leading .sessions/ hop.
    expect(record.transcriptRef).toBe(
      ".sessions/top/20260101T000000Z_deadbeefcafe.jsonl",
    );
    expect(record.tokens).toBe(42);
    expect(typeof record.durationMs).toBe("number");
    expect(world.exitCalls).toEqual([]); // completion path never force-exits
  });

  it("typed-failure pipeline: run() resolves an ok:false payload → mapped exit 1 and the terminal record carries the PAYLOAD'S errors verbatim (outputs default to {}, no ad-hort enrichment)", async () => {
    const payloadErrors = [
      {
        type: "PhaseBudgetError",
        cause: "budget",
        message: "phase budget exceeded",
      },
    ];
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: false, errors: payloadErrors }),
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink },
    );

    expect(code).toBe(1);
    expect(err).toEqual([]);
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(record)).toEqual([
      "ok",
      "capability",
      "outputs",
      "errors",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual(payloadErrors);
    expect(record.outputs).toEqual({});
    expect(record.tokens).toBe(42);
    expect(world.exitCalls).toEqual([]);
  });
});

describe("runSession (non-probe arm — SIGTERM partial capture through the entry)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("the kill handler armed BEFORE run() (via the forwarded signals target) writes the PARTIAL record and terminates through the forwarded exit sink (1) — the suite touches no real process handlers", async () => {
    let exitResolve: ((code: number) => void) | undefined;
    const exited = new Promise<number>((resolve) => {
      exitResolve = resolve;
    });
    const world = makePipelineWorld({
      // Pending: the run never settles; the kill interrupts it mid-flight.
      runBehavior: () => new Promise<never>(() => {}),
      onExit: (code: number): void => {
        exitResolve?.(code);
      },
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const sessionPromise = runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink },
    );
    // The entry reached instance.run() — arming strictly preceded it.
    await world.runStarted;
    expect(hoisted.invocations).toEqual(["constructed", "armed", "run-called"]);
    expect(world.handlers).toHaveLength(1);
    // Manual dispatch of the CAPTURED listener — hermetic: no real signal.
    world.handlers[0]();
    const exitCode = await exited;
    expect(exitCode).toBe(1);
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([{ type: "SIGTERM", cause: "kill" }]);
    expect(record.outputs).toEqual({});
    expect(record.tokens).toBe(42); // as-is snapshot at signal time
    expect(record.transcriptRef).toBe(
      ".sessions/top/20260101T000000Z_deadbeefcafe.jsonl",
    );
    expect(err).toEqual([]);
    // The pending run never settles — silence the dangling promise.
    void sessionPromise.catch(() => {});
  });
});

describe("runSession (last-resort boundary — non-probe arm)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("pre-emitter fault (PioSession.create rejecting): PLAIN degrade — the exact unexpected-error line + 1, and NO status.json anywhere under the sessions root (no ad-hoc emitter mint)", async () => {
    const base = mkdtempSync(join(os.tmpdir(), "pio-runsess-"));
    hoisted.tmpBases.push(base);
    const sessionsRoot = join(base, "sessions");
    const loaderMod = await loaderModule();
    const resolveMock = vi.mocked(loaderMod.resolveCapability);
    resolveMock.mockReset();
    class StubCtor {}
    resolveMock.mockResolvedValue(
      // Cast seam: structural fixture descriptor (see file header).
      {
        ok: true,
        capability: {
          contract: { name: "alpha", version: "1.0.0" },
          ctor: StubCtor,
        },
      } as unknown as CapabilityResolution,
    );
    const { PioSession } = await sessionModule();
    const createMock = vi.mocked(PioSession.create);
    createMock.mockReset();
    createMock.mockRejectedValue(new Error("session construction fault"));
    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", sessionsRoot],
      io,
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: session construction fault",
    ]);
    expect(hoisted.emitterOptionsLog).toHaveLength(0); // emitter never constructed
    expect(readdirSync(base)).toEqual([]); // nothing materialized under the root
  });

  it("post-emitter fault (fixture run() REJECTING): the captured record IS written — the REAL captureError ladder (identity fallback: type = error.name + message) — AND the degraded line + 1 still land", async () => {
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => {
        const boom = new Error("pipeline exploded");
        boom.name = "BoomFault";
        throw boom;
      },
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: pipeline exploded",
    ]);
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "BoomFault", message: "pipeline exploded" },
    ]);
    expect(record.outputs).toEqual({});
    // The kill sink stays idle — this is the boundary capture, not the kill path.
    expect(world.exitCalls).toEqual([]);
  });

  it("doubly-faulting sink with a rejecting run: resolves 1 silently (the best-effort emit still lands; the degrade degrades silently)", async () => {
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => {
        throw new Error("pipeline exploded");
      },
    });
    await scriptHitPipeline(world);
    const faulting: RunSessionIO = {
      stderr: () => {
        throw new Error("sink fallen");
      },
    };
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      faulting,
      { signals: world.signalsTarget, exit: world.exitSink },
    );
    expect(code).toBe(1);
  });
});

describe("export surface", () => {
  it("runtime export surface is exactly ['runSession'] (both IO and seams interfaces erase under erasable syntax)", async () => {
    expect(Object.keys(await import("./run-session.ts"))).toEqual([
      "runSession",
    ]);
  });
});

describe("delegator mechanics (bin/pio-run-session)", () => {
  const delegator = readFileSync(
    new URL("../bin/pio-run-session", import.meta.url),
    "utf8",
  );

  it("shebang on line 1", () => {
    expect(delegator.split("\n")[0]).toBe("#!/usr/bin/env node");
  });

  it("statement-for-statement mirror of bin/pio: exactly ONE dynamic import of ../src/run-session.ts + the process.exitCode sink (the two-arg call stays valid — the seam parameter is optional)", () => {
    expect(delegator).toContain('await import("../src/run-session.ts")');
    expect(delegator.match(/import\(/g)?.length).toBe(1);
    expect(delegator).toContain(
      "process.exitCode = await runSession(process.argv.slice(2));",
    );
  });

  it("zero occurrences of process.exit (natural drain preserved)", () => {
    expect(delegator).not.toContain("process.exit(");
  });
});

describe("source guards (lazy-SDK discipline over run-session.ts)", () => {
  const src = readFileSync(
    new URL("./run-session.ts", import.meta.url),
    "utf8",
  );

  it("ZERO static VALUE import statements (pure `import type` clauses admitted: erased under erasable syntax — zero runtime module evaluation; the permitted clause is exactly the status type pair, and SDK reach stays separately pinned)", () => {
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
    expect(staticClauses).toEqual(["./capability/status.ts"]);
  });

  it("dynamic specifier set is EXACTLY {'./capability/loader.ts', './capability/pio-session.ts', './capability/status.ts', './probe.ts'} — ALL literal, no interpolation (the ./sandbox/run.ts thunk is GONE; status appears twice: pipeline + boundary)", () => {
    const literal = [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map(
      (match) => match[1],
    );
    const total = src.match(/import\(/g)?.length ?? 0;
    expect([...new Set(literal)].sort()).toEqual(
      [
        "./capability/loader.ts",
        "./capability/pio-session.ts",
        "./capability/status.ts",
        "./probe.ts",
      ].sort(),
    );
    expect(total).toBe(literal.length); // no template-literal (interpolated) imports
  });

  it("zero occurrences of the retired CAPABILITY_NOT_IMPLEMENTED identifier (the loader's capabilityRefusalLine owns the miss line now)", () => {
    expect(src.includes("CAPABILITY_NOT_IMPLEMENTED")).toBe(false);
  });

  it("zero occurrences of the SDK specifier in run-session.ts source", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});
