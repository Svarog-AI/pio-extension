// Behavior-matrix TDD suite for the dedicated top-session entry. Drives
// `runSession(argv, io, seams?)` with captured sinks over factory-mocked
// consumer seams (loader / session) and the REAL leaf-pure status
// module — observed through a pass-through factory that forwards every
// export verbatim to importOriginal and only records construction args plus
// the arm/emit call positions (captureError and every emitter method stay
// the real implementations). The launcher is likewise pass-through-mocked
// ONLY to flip its thunk's eval flag (leaf-pure and SDK-free — the REAL
// isInteractiveTty predicate runs against the row's injected descriptors).
// The SDK package ROOT is mocked with a recorder fake over the
// interactive-terminal class (per-instance ctor args + run/stop call
// observables, per-row scripted behaviors, fail-loud). Hygiene rule: every
// real-emitter row injects a fake signals target + exit sink through the
// seam — the suite never arms REAL process signal handlers — and every
// pipeline-bound row injects TTY-TRUE terminal descriptors through the seam
// (the real process streams are piped under the runner — without injection
// the in-namespace fast-fail would refuse everything). Real-FS rows land in
// fresh tmpdirs with forced teardown. Plus mechanical lazy-SDK source
// guards over the entry source.
//
// Factory-evaluation flags: Vitest runs a mock factory at the mocked
// module's FIRST import (registration ≠ evaluation). Row order is therefore
// load-bearing — the cheap-parse block leads (ALL FIVE flags genuinely
// unevaluated), the miss block is the FIRST importer of the loader (via each
// row's direct `loaderModule()` thunk) and of the session (via the post-hoc
// `sessionModule()` fetch its create-uncalled proof performs — that fetch
// runs the session factory BEFORE the pipeline block executes), the TTY
// refusal block is the FIRST importer of the launcher (the entry thunk), and
// the FIRST PIPELINE row is the first importer of BOTH the SDK root (the
// mount thunk) and the frame-environment module (the post-mount install
// thunk) — every cheap/refusal/construction-fault row above it pins
// sdkEvaluated === false. Because a factory runs exactly ONCE per file, a
// flag-read of `true` is load-bearing only in the row that triggers the
// first-ever evaluation; later rows (post reset) legitimately read `false`
// for an already-evaluated module and pin the behavioral consequences
// instead. Flag reads inside a row must PRECEDE any post-hoc module fetch
// by the same row (the fetch flips its own flag).
//
// Lifecycle observables ride a SEPARATE hoisted channel (armed / mounted /
// run-called / stopped / disposed / emitted) fed by the pass-through emit
// wrapper, the SDK recorder (constructor = mounted, stop = stopped), the
// world's runtime-dispose wrapper (disposed), and the fixture's run()
// (run-called) — the legacy `invocations` exact-match pins (constructed /
// armed / run-called) stay byte-stable beside it. The shutdown-guard
// observations ride ANOTHER channel (attach/install positions recorded as
// lifecycle cursor reads, never pushes) so that inventory stays untouched.
// A process.stdout spy
// asserts the entry performs ZERO stdout writes on EVERY row (outcome-model
// pin — the presence-only terminal never composes product content).
//
// Documented cast seams: the fake session is structurally complete for the
// entry's reach path (counters + runtime.session.sessionFile + runtime
// dispose) and is cast to the real static ONCE per scripted site; the
// captured emitter options and the recorded install context are read
// through structural views; parsed record bytes are read through
// Record<string, unknown>. Zero casts live in the SOURCE files.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
// Type-only edges — erased under erasable syntax, zero runtime evaluation.
// They name the types for the fixture seams without touching the mocked
// modules' runtime graphs.
import type { CapabilityResolution } from "./capability/loader.ts";
import type { PioSession } from "./capability/pio-session.ts";
import type {
  CapabilityResult,
  StatusEmissionResult,
} from "./capability/status.ts";
import { type RunSessionIO, runSession } from "./run-session.ts";

const hoisted = vi.hoisted(() => {
  const evalFlags = {
    loaderEvaluated: false,
    sessionEvaluated: false,
    launcherEvaluated: false,
    sdkEvaluated: false,
    takeoverEvaluated: false,
  };
  /** Emitter-options captures through the pass-through status factory. */
  const emitterOptionsLog: unknown[] = [];
  /** Legacy pipeline event log: constructed / armed / run-called (row
   * order) — the byte-stable exact-match pins. */
  const invocations: string[] = [];
  /** Separate lifecycle channel: armed / mounted / run-called / stopped /
   * disposed / emitted — the cross-cutting order inventory. */
  const lifecycle: string[] = [];
  /** Recorder instances behind the SDK-root fake terminal class. */
  const tuiInstances: Array<{
    ctorArgs: unknown[];
    runCalls: number;
    stopCalls: number;
  }> = [];
  /** Per-row scripted behaviors for the terminal (fail-loud: unscripted
   * calls throw — every proceeding row scripts its own world). */
  const tuiScripts: {
    construct?: (...args: unknown[]) => void;
    run?: () => Promise<unknown>;
    stop?: () => void;
  } = {};
  /** Recorded frame-environment install contexts (recording stub — see the
   * module mock below; the raw bags land here verbatim). */
  const installCalls: unknown[] = [];
  /** Emitter instances through the pass-through status factory (identity
   * pins for the attach observation). */
  const emitterInstances: unknown[] = [];
  /** Shutdown-guard observations on a SEPARATE channel — positions ride
   * lifecycle CURSOR reads (never pushes), so the byte-stable lifecycle
   * inventory stays untouched. */
  const guardObservations = {
    attachCalls: [] as Array<{ emitter: unknown; lifecycleCursor: number }>,
    installBags: [] as Array<{ bag: unknown; lifecycleCursor: number }>,
    handles: [] as Array<Record<string, unknown>>,
  };
  /** Per-row scripts over the stubbed guard: marker handler prepend
   * (absent ⇒ nothing prepended) + trigger-legs override (absent ⇒ the
   * default simulated legs below). */
  const guardScripts: {
    marker?: () => void;
    legs?: (ctx: {
      stderr: (line: string) => void;
      terminalStop: () => void;
    }) => Promise<void>;
  } = {};
  /** Row-registered dispose thunks (one per pipeline world — consumed by
   * the default trigger legs at the trigger point). */
  const disposeHooks: Array<() => Promise<void>> = [];
  /** Predicate stub over the installed-state read (DEFAULTS FALSE — rows
   * script true where they need the fatal routing; reset per row). */
  const installedPredicate = vi.fn((): boolean => false);
  /** Per-row scripted behaviors for the install thunk (absent => clean
   * install; the install-fault row scripts a throw). */
  const envScripts: { install?: (ctx: unknown) => void } = {};
  /** Fresh tmpdir bases pending forced teardown. */
  const tmpBases: string[] = [];

  class FakeInteractiveMode {
    readonly ctorArgs: unknown[];
    runCalls = 0;
    stopCalls = 0;
    constructor(...args: unknown[]) {
      tuiScripts.construct?.(...args);
      this.ctorArgs = args;
      tuiInstances.push(this);
      lifecycle.push("mounted");
    }
    run(): Promise<unknown> {
      this.runCalls += 1;
      if (tuiScripts.run === undefined) {
        throw new Error(
          "unscripted terminal run() — every proceeding row scripts its own world",
        );
      }
      return tuiScripts.run();
    }
    stop(): void {
      this.stopCalls += 1;
      lifecycle.push("stopped");
      if (tuiScripts.stop === undefined) {
        throw new Error(
          "unscripted terminal stop() — every proceeding row scripts its own world",
        );
      }
      tuiScripts.stop();
    }
  }

  return {
    evalFlags,
    // Replicated single-owner miss literal (owner: capabilityRefusalLine in
    // ./capability/loader.ts) — kept meaningful for the byte-pins below.
    missLine: (name: string): string =>
      `pio: capability '${name}' is not implemented yet`,
    emitterOptionsLog,
    emitterInstances,
    invocations,
    lifecycle,
    tuiInstances,
    tuiScripts,
    installCalls,
    envScripts,
    tmpBases,
    guardObservations,
    guardScripts,
    disposeHooks,
    installedPredicate,
    FakeInteractiveMode,
  };
});

// Hermetic dispatch seams: an unmocked dispatch could drive REAL session
// construction, bwrap launches, or network in a unit suite, so the SDK-
// reaching consumer modules are factory-mocked. The replicated single-owner
// literal keeps the byte-pins below meaningful (same idiom as cli.test.ts).
vi.mock("./capability/loader.ts", () => {
  hoisted.evalFlags.loaderEvaluated = true;
  return { resolveCapability: vi.fn() };
});
vi.mock("./capability/pio-session.ts", () => {
  hoisted.evalFlags.sessionEvaluated = true;
  return { PioSession: { create: vi.fn() } };
});
// Pass-through over the leaf-pure launcher (SDK-free): the REAL
// isInteractiveTty predicate runs against the row's injected descriptors;
// the mock exists ONLY to flip the thunk's eval flag (registration ≠
// evaluation doctrine extends to the cheap-path sharpness pins).
vi.mock("./sandbox/launcher.ts", async (importOriginal) => {
  hoisted.evalFlags.launcherEvaluated = true;
  return importOriginal<typeof import("./sandbox/launcher.ts")>();
});
// NOT mocked away: the status module is leaf-pure and stays REAL here. This
// pass-through factory forwards EVERY export verbatim via importOriginal —
// it only observes createStatusEmitter construction args and the arm/emit
// call positions (required by the pipeline-order inventory), forwarding
// both through the separate lifecycle channel. No behavior is scripted at
// the leaf.
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
      hoisted.emitterInstances.push(real);
      const originalArm = real.armKillCapture.bind(real);
      const originalEmit = real.emit.bind(real);
      real.armKillCapture = (): void => {
        hoisted.invocations.push("armed");
        hoisted.lifecycle.push("armed");
        originalArm();
      };
      real.emit = (result: CapabilityResult): Promise<StatusEmissionResult> => {
        hoisted.lifecycle.push("emitted");
        return originalEmit(result);
      };
      return real;
    },
  };
});
// Recording STUB over the frame-environment module (NOT pass-through: the
// real holder's process-scoped state would double-install from the second
// pipeline row on). The shutdown-guard surface is recorded additively:
// attachTopEmitter / installExitGuard observe their call POSITION via a
// lifecycle cursor read (the byte-stable inventory itself never grows), the
// exit-guard handle is a pure stub whose trigger legs are SCRIPTED (default:
// typed line first, then stop + the world's runtime dispose — identical
// tokens to the legacy teardown), and the installed-state predicate defaults
// FALSE (pre-holder drift shield).
vi.mock("./capability/terminal-takeover.ts", () => {
  hoisted.evalFlags.takeoverEvaluated = true;
  return {
    installFrameEnvironment: (ctx: unknown): void => {
      hoisted.installCalls.push(ctx);
      hoisted.lifecycle.push("env-installed");
      hoisted.envScripts.install?.(ctx);
    },
    attachTopEmitter: (emitter: unknown): void => {
      hoisted.guardObservations.attachCalls.push({
        emitter,
        lifecycleCursor: hoisted.lifecycle.length,
      });
    },
    installExitGuard: (
      bag: unknown,
    ): {
      exit: (code?: number) => void;
      trigger: (cause: string) => Promise<void>;
      uninstall: () => void;
    } => {
      hoisted.guardObservations.installBags.push({
        bag,
        lifecycleCursor: hoisted.lifecycle.length,
      });
      const signalsView = bag as
        | {
            signals?: {
              prependListener: (signal: string, h: () => void) => void;
            };
          }
        | undefined;
      if (
        hoisted.guardScripts.marker !== undefined &&
        signalsView?.signals !== undefined
      ) {
        signalsView.signals.prependListener(
          "SIGTERM",
          hoisted.guardScripts.marker,
        );
      }
      const handle = {
        exit: vi.fn((): void => {}),
        trigger: vi.fn(async (_cause: string): Promise<void> => {
          const ctx = hoisted.installCalls.at(-1) as
            | { stderr: (line: string) => void; terminalStop: () => void }
            | undefined;
          if (ctx === undefined) {
            throw new Error(
              "unscripted guard trigger without an install context",
            );
          }
          const legs =
            hoisted.guardScripts.legs ??
            (async (context: typeof ctx): Promise<void> => {
              // Default scripted legs (fatal rows consume these): the
              // typed line FIRST, then the stop leg + the world's runtime
              // dispose (identical tokens the legacy teardown pushed).
              try {
                context.stderr(
                  `terminal-takeover: shutdown \u2014 frame 'top@0.0.0' (depth 0) ended by fatal`,
                );
              } catch {
                // Best-effort line leg — a faulting sink loses to the
                // primary death (mirrors the module's swallow).
              }
              context.terminalStop();
              for (const hook of hoisted.disposeHooks.splice(0)) {
                await hook();
              }
            });
          await legs(ctx);
        }),
        uninstall: vi.fn((): void => {}),
      };
      hoisted.guardObservations.handles.push(handle);
      return handle;
    },
    isFrameEnvironmentInstalled: hoisted.installedPredicate,
  };
});
// SDK package ROOT: the entry's ONE and ONLY SDK touchpoint is the mount
// thunk, and the sole value it consumes is the interactive-terminal class.
// Recorder fake: per-instance ctor args + run/stop counters, per-row
// scripted behaviors (fail-loud), eval flag flipped by factory evaluation.
vi.mock("@earendil-works/pi-coding-agent", () => {
  hoisted.evalFlags.sdkEvaluated = true;
  return { InteractiveMode: hoisted.FakeInteractiveMode };
});

const U = "pio-run-session <capability> --sessions-root <dir> [--input k=v …]";

/** TTY-TRUE injected descriptors (production process streams are piped
 * under the runner — every pipeline-bound row hands these in so the
 * in-namespace fast-fail admits the run). */
const TTY_TRUE = { input: { isTTY: true }, output: { isTTY: true } };

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

/** Structural hit descriptor for a fixture ctor (cast seam: the real
 * identity/integrity checks never run against mocked loaders). */
function hitResolution(
  ctor: new (params: { session: unknown }) => unknown,
): CapabilityResolution {
  return {
    ok: true,
    capability: {
      contract: { name: "alpha", version: "9.9.9-sentinel" },
      ctor,
    },
  } as unknown as CapabilityResolution;
}

function collectErr(): { io: RunSessionIO; err: string[] } {
  const err: string[] = [];
  return {
    io: { stderr: (line) => err.push(line) },
    err,
  };
}

function resetHoistedState(): void {
  hoisted.evalFlags.loaderEvaluated = false;
  hoisted.evalFlags.sessionEvaluated = false;
  hoisted.evalFlags.launcherEvaluated = false;
  hoisted.evalFlags.sdkEvaluated = false;
  hoisted.evalFlags.takeoverEvaluated = false;
  hoisted.invocations.length = 0;
  hoisted.lifecycle.length = 0;
  hoisted.installCalls.length = 0;
  hoisted.emitterInstances.length = 0;
  hoisted.guardObservations.attachCalls.length = 0;
  hoisted.guardObservations.installBags.length = 0;
  hoisted.guardObservations.handles.length = 0;
  hoisted.guardScripts.marker = undefined;
  hoisted.guardScripts.legs = undefined;
  hoisted.disposeHooks.length = 0;
  hoisted.installedPredicate.mockReset();
  hoisted.installedPredicate.mockReturnValue(false);
  hoisted.envScripts.install = undefined;
  hoisted.emitterOptionsLog.length = 0;
  hoisted.tuiInstances.length = 0;
  hoisted.tuiScripts.construct = undefined;
  hoisted.tuiScripts.run = undefined;
  hoisted.tuiScripts.stop = undefined;
}

// Outcome-model pin, applied UNIFORMLY: the entry performs ZERO stdout
// writes on every row (the presence-only terminal never composes product
// content; restore runs BEFORE the assert so a failing row cannot leak the
// spy forward).
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write");
});

afterEach(() => {
  const captured = stdoutSpy.mock.calls;
  stdoutSpy.mockRestore();
  expect(captured).toHaveLength(0);
  // Forced teardown: no base survives a failed row.
  for (const base of hoisted.tmpBases.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

describe("runSession (strict positional parse — cheap paths, ZERO module evaluation)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  const errors: ReadonlyArray<[argv: readonly string[], message: string]> = [
    [[], `expected capability name (usage: ${U})`],
    [[""], `expected capability name (usage: ${U})`],
    [["-h"], `unknown option: -h (usage: ${U})`],
    [["--huh"], `unknown option: --huh (usage: ${U})`],
    [["cap"], `expected --sessions-root <dir> after 'cap' (usage: ${U})`],
    [["cap", "--detach"], `unknown option: --detach (usage: ${U})`],
    [["cap", "positional"], `unexpected argument: positional (usage: ${U})`],
    [
      ["cap", "--sessions-root"],
      `expected a value for --sessions-root (usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", ""],
      `expected a value for --sessions-root (usage: ${U})`,
    ],
    [["cap", "--sessions-root", "-x"], `unknown option: -x (usage: ${U})`],
    [
      ["cap", "--sessions-root", "/x", "extra"],
      `unexpected argument: extra (usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--more"],
      `unknown option: --more (usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--sessions-root", "/y"],
      `unknown option: --sessions-root (usage: ${U})`,
    ],
    // Reordered flag rejected: no flag-position flexibility — the dash in the
    // capability slot is an unknown option.
    [
      ["--sessions-root", "/x", "cap"],
      `unknown option: --sessions-root (usage: ${U})`,
    ],
    // Trailing `--input k=v` tail edges (first violation wins — the SAME
    // strict grammar as the host CLI's run position): dangling flag / no '='
    // / empty key => malformed naming the token; duplicated key => duplicate
    // naming the key; the glued form and unknown dashes stay UNKNOWN_OPTION;
    // an unflagged pair stays a POSITIONAL surplus.
    [
      ["cap", "--sessions-root", "/x", "--input"],
      `malformed input pair: '--input' (--input expects k=v; usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--input", "abc"],
      `malformed input pair: 'abc' (--input expects k=v; usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--input", "=v"],
      `malformed input pair: '=v' (--input expects k=v; usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--input", "="],
      `malformed input pair: '=' (--input expects k=v; usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--input", "a=1", "--input", "a=2"],
      `duplicate input key: 'a' (each key may appear once; usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--input=a=b"],
      `unknown option: --input=a=b (usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "a=b"],
      `unexpected argument: a=b (usage: ${U})`,
    ],
    [
      ["cap", "--sessions-root", "/x", "--input", "a=1", "--detach"],
      `unknown option: --detach (usage: ${U})`,
    ],
  ];
  for (const [argv, message] of errors) {
    it(`${JSON.stringify(argv)} -> exact prefixed error naming the offending token; ALL CONSUMER MODULES remain unevaluated (loader / session / launcher / SDK)`, async () => {
      const { io, err } = collectErr();
      const code = await runSession(argv, io);
      expect(code).toBe(1);
      expect(err).toEqual([`pio-run-session: ${message}`]);
      expect(hoisted.evalFlags.loaderEvaluated).toBe(false);
      expect(hoisted.evalFlags.sessionEvaluated).toBe(false);
      expect(hoisted.evalFlags.launcherEvaluated).toBe(false);
      expect(hoisted.evalFlags.sdkEvaluated).toBe(false);
      expect(hoisted.evalFlags.takeoverEvaluated).toBe(false);
      expect(hoisted.tuiInstances).toHaveLength(0);
    });
  }
});

describe("runSession (loader gate fires before ANY session construction)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("unresolvable name: the LOADER'S miss line arrives verbatim on stderr + 1; the session/status thunks never fire, PioSession.create uncalled, launcher/SDK thunks never fire (the miss line lands BEFORE any TTY consideration)", async () => {
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
    expect(hoisted.evalFlags.launcherEvaluated).toBe(false);
    expect(hoisted.evalFlags.sdkEvaluated).toBe(false);
    expect(hoisted.evalFlags.takeoverEvaluated).toBe(false);
    expect(hoisted.tuiInstances).toHaveLength(0);
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
    it(`${family}-refusal sentinel: printed VERBATIM + 1, pre-session (create uncalled, zero construction, launcher/SDK thunks unfired)`, async () => {
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
      expect(hoisted.evalFlags.launcherEvaluated).toBe(false);
      expect(hoisted.evalFlags.sdkEvaluated).toBe(false);
      expect(hoisted.evalFlags.takeoverEvaluated).toBe(false);
      expect(hoisted.tuiInstances).toHaveLength(0);
      const { PioSession } = await sessionModule();
      expect(vi.mocked(PioSession.create)).not.toHaveBeenCalled();
    });
  }
});

// ---- In-namespace TTY fast-fail: the standalone entry bypasses host gates
// entirely, so the analogous depth is restored HERE — after parse + loader
// admission, BEFORE any construction (mirrors host discipline: the miss
// line still reaches piped unknown-name invocations first). Descriptors are
// injected through the seam (hermetic truth table); the launcher thunk is
// leaf-pure (SDK-free), so the SDK graph stays unevaluated on every row in
// this block. TTY-TRUE admission is witnessed by the FIRST PIPELINE row
// below (it is the file's first proceeding row — placing it here would flip
// the SDK eval flag that the cheap-path rows above pin false).

describe("runSession (in-namespace TTY fast-fail — truth table over injected descriptors)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  // Replicated single-owner refusal literal (owner: the module-private
  // TTY_REFUSAL_LINE in ./run-session.ts — deliberately DISTINCT from the
  // host gate's neutral launcher literal; two owners, two byte forms).
  const TTY_REFUSAL_LINE =
    "pio-run-session: running a capability needs an interactive terminal (TTY); piped invocations are refused";

  // Hygiene net: a refusal row must never mint the emitter — the target
  // stays inert even in the pre-gate red state; the pins prove non-use.
  const nullSignals: SignalsTarget = { prependListener: () => {} };

  const refusalMatrix: ReadonlyArray<{
    label: string;
    input: { readonly isTTY?: boolean };
    output: { readonly isTTY?: boolean };
  }> = [
    {
      label: "falsy stdin (undefined) + TTY-true stdout",
      input: {},
      output: { isTTY: true },
    },
    {
      label: "TTY-true stdin + falsy stdout (undefined)",
      input: { isTTY: true },
      output: {},
    },
    { label: "both descriptors falsy (undefined)", input: {}, output: {} },
    {
      label: "explicit isTTY:false on both descriptors",
      input: { isTTY: false },
      output: { isTTY: false },
    },
  ];
  refusalMatrix.forEach((row, index) => {
    it(`${row.label}: REFUSED pre-construction — the EXACT single in-namespace line on stderr + 1; create uncalled, no emitter, zero terminal interaction, SDK graph UNEVALUATED`, async () => {
      class StubCtor {}
      const loaderMod = await loaderModule();
      const resolveMock = vi.mocked(loaderMod.resolveCapability);
      resolveMock.mockReset();
      resolveMock.mockResolvedValue(hitResolution(StubCtor));
      const { io, err } = collectErr();
      const code = await runSession(["alpha", "--sessions-root", "/x"], io, {
        signals: nullSignals,
        exit: () => {},
        tty: { input: row.input, output: row.output },
      });
      expect(code).toBe(1);
      expect(err).toEqual([TTY_REFUSAL_LINE]);
      // The launcher thunk fires ONLY in the row that triggers the
      // first-ever evaluation (file-order doctrine); later rows resolve it
      // from the module cache and pin the behavioral consequences instead.
      expect(hoisted.evalFlags.launcherEvaluated).toBe(index === 0);
      // Flag reads precede the post-hoc session-module fetch below.
      expect(hoisted.evalFlags.sessionEvaluated).toBe(false);
      expect(hoisted.evalFlags.sdkEvaluated).toBe(false);
      expect(hoisted.evalFlags.takeoverEvaluated).toBe(false);
      expect(hoisted.tuiInstances).toHaveLength(0);
      expect(hoisted.emitterOptionsLog).toHaveLength(0);
      const { PioSession } = await sessionModule();
      expect(vi.mocked(PioSession.create)).not.toHaveBeenCalled();
    });
  });
});

// ---- Pre-emitter faults: plain degrade, zero terminal trace. Positioned
// BEFORE the first proceeding row so the SDK-eval pin stays load-bearing
// (the mount step is never reached, so the SDK graph is genuinely
// unevaluated in this row's window).

describe("runSession (pre-emitter faults — plain degrade, zero terminal trace)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("pre-emitter fault (PioSession.create rejecting): PLAIN degrade — the exact unexpected-error line + 1, and NO status.json anywhere under the sessions root (no ad-hoc emitter mint; the terminal was NEVER constructed — teardown is a silent no-op, SDK graph unevaluated)", async () => {
    const base = mkdtempSync(join(os.tmpdir(), "pio-runsess-"));
    hoisted.tmpBases.push(base);
    const sessionsRoot = join(base, "sessions");
    const loaderMod = await loaderModule();
    const resolveMock = vi.mocked(loaderMod.resolveCapability);
    resolveMock.mockReset();
    class StubCtor {}
    resolveMock.mockResolvedValue(hitResolution(StubCtor));
    const { PioSession } = await sessionModule();
    const createMock = vi.mocked(PioSession.create);
    createMock.mockReset();
    createMock.mockRejectedValue(new Error("session construction fault"));
    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", sessionsRoot],
      io,
      { tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: session construction fault",
    ]);
    expect(hoisted.emitterOptionsLog).toHaveLength(0); // emitter never constructed
    expect(hoisted.evalFlags.sdkEvaluated).toBe(false); // mount never reached
    expect(hoisted.evalFlags.takeoverEvaluated).toBe(false); // install thunk never fired
    expect(hoisted.installCalls).toHaveLength(0);
    expect(hoisted.tuiInstances).toHaveLength(0);
    expect(hoisted.lifecycle).toEqual([]); // no armed/mounted/stopped/disposed
    expect(readdirSync(base)).toEqual([]); // nothing materialized under the root
  });
});

// ---- Single-path pipeline wiring against factory-mocked loader/session
// seams and the REAL leaf-pure status module. Every real-emitter row injects
// a fake signals target + exit spy (hygiene: the suite never arms the real
// process) AND TTY-TRUE terminal descriptors (the in-namespace fast-fail
// admits the run). By the time this block runs, the blocks above have
// already imported BOTH the loader and the session consumer modules (loader
// via its direct thunk; session via its post-hoc `sessionModule()` fetch),
// so neither factory re-runs for any row here; the FIRST row of this block
// is also the file's first importer of the SDK root (the mount thunk) and of
// the launcher via the entry — the cheap-path flags were pinned false
// upstream, and this row pins the SDK eval flip load-bearing.

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

/** Structural view of the recorded frame-environment install context
 * (assertion surface — the recording stub hands the raw bag back). */
interface CapturedInstallContext {
  readonly sessionsRoot: string;
  readonly topFrame: Record<string, unknown>;
  readonly terminalStop: () => void;
  readonly stderr: (line: string) => void;
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
  /** The fake runtime's dispose mock (additive — the teardown's dispose
   * leg delegates to it; the wrapper around it records the marker). */
  readonly dispose: ReturnType<typeof vi.fn>;
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
  const dispose = vi.fn(async (): Promise<void> => {});
  const fake: Record<string, unknown> = {
    id: "sess-fake",
    counters: (): { tokens: number } => ({ tokens: 42 }),
    runtime: {
      session: { sessionId: "sess-fake", sessionFile: transcriptPath },
      dispose: async (): Promise<void> => {
        hoisted.lifecycle.push("disposed");
        await dispose();
      },
    },
  };
  // World-registered dispose thunk (the default guard-trigger legs consume
  // it at the trigger point — identical token to the legacy teardown leg).
  hoisted.disposeHooks.length = 0;
  const runtimeView = fake.runtime as { dispose: () => Promise<void> };
  hoisted.disposeHooks.push(async (): Promise<void> => {
    await runtimeView.dispose();
  });
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
      hoisted.lifecycle.push("run-called");
      runStartResolve?.();
      return options.runBehavior();
    }
  }
  return {
    base,
    sessionsRoot,
    transcriptPath,
    fake,
    dispose,
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
  resolveMock.mockResolvedValue(hitResolution(world.ctor));
  const { PioSession } = await sessionModule();
  const createMock = vi.mocked(PioSession.create);
  createMock.mockReset();
  // Cast seam: the fake session is structurally complete for the entry's
  // reach path (see file header).
  createMock.mockResolvedValue(world.fake as unknown as PioSession);
  // Terminal world defaults (per-row script): the render loop starts an
  // INDEPENDENT never-settling promise (the pipeline resolves while the TUI
  // loop stays open — nothing blocks) and the teardown stop leg is a
  // scripted no-op. Variant rows override these slots (stop throwing, run
  // rejecting, constructor throwing).
  hoisted.tuiScripts.run = (): Promise<unknown> => new Promise(() => {});
  hoisted.tuiScripts.stop = (): void => {};
}

describe("runSession (pipeline order and status emission)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("success pipeline: gate → session (EXACT (cwd, sessionsRoot)) → instantiate ({ session } identity) → arm (ONCE, indexed between construction and run) → MOUNT (one terminal over THE runtime BY REFERENCE, started without awaiting) → run(THE single parsed record — zero-pair argv hands the EMPTY object) → teardown (stop → dispose, BEFORE the record) → emit (payload deep-equal) → mapped exit 0; the terminal record is canonical (key order, nullish dropped, source builtin, token scalar, transcriptRef relative to the engagement dir)", async () => {
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: true, outputs: { answer: 42 } }),
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
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
    expect(inst.runArgs).toStrictEqual([{}]); // THE parsed record — zero pairs ⇒ the EMPTY object (the old zero-arg contract is superseded)
    expect(world.handlers).toHaveLength(1); // armKillCapture installed exactly once

    // Terminal mount (imperative, process-scoped): EXACTLY ONE construction
    // over THE engagement's runtime BY REFERENCE (single-runtime identity —
    // one engagement, one runtime, one terminal), started without awaiting
    // (the never-settling loop promise never blocked the pipeline), torn
    // down probe-native (stop → dispose) BEFORE the record emission — the
    // FULL interleaving pinned in the one lifecycle channel.
    expect(hoisted.evalFlags.sdkEvaluated).toBe(true); // first importer of the SDK root
    // Fifth flag flips here — first importer of the frame-environment
    // thunk (load-bearing only in this row; the factory runs once).
    expect(hoisted.evalFlags.takeoverEvaluated).toBe(true);
    expect(hoisted.tuiInstances).toHaveLength(1);
    const tuiMount = hoisted.tuiInstances[0];
    expect(tuiMount.ctorArgs).toHaveLength(1);
    expect(tuiMount.ctorArgs[0]).toBe(world.fake.runtime); // THE runtime, by reference
    expect(tuiMount.runCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
    ]);

    // Install: strictly between mount and run (marker above), exactly
    // once; cheap arg pins here, closure behavior in the args-channel row.
    expect(hoisted.installCalls).toHaveLength(1);
    const installedCtx = hoisted.installCalls[0] as CapturedInstallContext;
    expect(installedCtx.sessionsRoot).toBe(world.sessionsRoot); // the parsed value
    expect(installedCtx.topFrame).toBe(world.fake); // the created instance BY REFERENCE

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

    // RS-D: the exit-guard wiring on a CLEAN completion — installed exactly
    // ONCE over the forwarded seams (bag shape pinned in RS-A), its FATAL
    // trigger NEVER taken (a clean exit rides the mapped-code channel, not
    // the pass), the top-emitter cell attached exactly once at the grown-
    // thunk position, and NO ledger snapshot anywhere under the sessions
    // root (the real pass fires only on an armed-holder death) — the audit
    // tree stays the shipped top-only inventory.
    expect(hoisted.guardObservations.handles).toHaveLength(1);
    expect(hoisted.guardObservations.handles[0].trigger).not.toHaveBeenCalled();
    expect(hoisted.guardObservations.attachCalls).toHaveLength(1);
    expect(hoisted.guardObservations.attachCalls[0].lifecycleCursor).toBe(
      hoisted.lifecycle.indexOf("env-installed") + 1,
    );
    expect(readdirSync(world.sessionsRoot)).toEqual(["top"]);
  });

  it("typed-failure pipeline: run() resolves an ok:false payload → mapped exit 1 and the terminal record carries the PAYLOAD'S errors verbatim (outputs default to {}, no ad-hoc enrichment); the terminal is torn down probe-native before the failing record", async () => {
    const payloadErrors = [
      {
        type: "Error",
        cause: "budget",
        message: "phase stopped at the iteration bound",
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
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );

    expect(code).toBe(1);
    expect(err).toEqual([]);
    expect(hoisted.tuiInstances).toHaveLength(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.installCalls).toHaveLength(1); // install fired strictly before the fault
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
    ]);
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
  it("paired invocation: THE single parsed record is handed to run(values) BY REFERENCE — exactly ONE argument deep-equal to the parsed pairs WITH declaration key order (no spread/copy at the handoff point)", async () => {
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: true, outputs: {} }),
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      [
        "alpha",
        "--sessions-root",
        world.sessionsRoot,
        "--input",
        "topic=hello world",
        "--input",
        "depth=2",
      ],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(world.instances).toHaveLength(1);
    expect(hoisted.tuiInstances).toHaveLength(1);
    const inst = world.instances[0];
    // Exactly ONE argument: the one record parseEntry built, passed by
    // reference (identity verified structurally — external tests cannot name
    // the internal object, so arity + deep equality + key order ARE the pins).
    expect(inst.runArgs).toHaveLength(1);
    // Cast seam: the parsed record bytes are read through Record<string,
    // unknown> (documented suite convention — zero casts live in SOURCE).
    const handed = inst.runArgs[0] as Record<string, unknown>;
    expect(handed).toStrictEqual({
      topic: "hello world",
      depth: "2",
    });
    expect(Object.keys(handed)).toEqual(["topic", "depth"]);
    expect(hoisted.installCalls).toHaveLength(1);
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
    ]);
  });

  it("installed context ARGS behave as wired: invoking terminalStop takes the MOUNTED terminal's stop count up by EXACTLY one (delta taken after teardown's own stop), and invoking stderr appends EXACTLY one verbatim line to the ROW'S sink (outcome pins first, then the probes)", async () => {
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: true, outputs: {} }),
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );

    // Outcome pins FIRST (order discipline): clean completion, no stderr.
    expect(code).toBe(0);
    expect(err).toEqual([]);

    const installedCtx = hoisted.installCalls[0] as CapturedInstallContext;
    // Probe 1: the installed terminalStop closure delegates to the MOUNTED
    // fake terminal (teardown's stop leg already ran — scripted no-op
    // body); invoking it adds EXACTLY one more stop.
    const stopBefore = hoisted.tuiInstances[0].stopCalls;
    expect(stopBefore).toBe(1); // teardown's stop leg ran
    installedCtx.terminalStop();
    expect(hoisted.tuiInstances[0].stopCalls).toBe(stopBefore + 1); // delta exactly 1
    // Probe 2: the installed stderr closure IS the row's sink — invoking it
    // appends EXACTLY one line, verbatim (RunSessionIO newline convention).
    installedCtx.stderr("frame-environment probe line");
    expect(err).toEqual(["frame-environment probe line"]);
  });
});

describe("runSession (SIGTERM partial capture through the entry)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("the kill handler armed BEFORE run() (via the forwarded signals target) writes the PARTIAL record and terminates through the forwarded exit sink (1) — the suite touches no real process handlers; the mounted terminal is NOT stopped by the kill path (OS-death release)", async () => {
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
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    // The entry reached instance.run() — arming strictly preceded it, and
    // the terminal was mounted BETWEEN arming and the run (source order:
    // arm → mount → run): it is UP for the entire pending run.
    await world.runStarted;
    expect(hoisted.invocations).toEqual(["constructed", "armed", "run-called"]);
    expect(hoisted.tuiInstances).toHaveLength(1);
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
    ]);
    expect(world.handlers).toHaveLength(1);
    expect(hoisted.installCalls).toHaveLength(1); // install fired strictly before the run
    // Manual dispatch of the CAPTURED listener — hermetic: no real signal.
    world.handlers[0]();
    const exitCode = await exited;
    expect(exitCode).toBe(1);
    expect(world.exitCalls).toEqual([1]);
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
    // The kill path performs NO entry-side teardown: the record settles
    // exactly once and process death releases the terminal (live
    // cooked-mode recovery is a QG measurement point, not a redesign).
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
    ]);
    // The pending run never settles — silence the dangling promise.
    void sessionPromise.catch(() => {});
  });
});

// ---- Terminal lifecycle: imperative mount at the explicit pipeline step,
// probe-native teardown on every exit path, secondary-fault survival, and
// the accepted consequence of the imperative model (pre-phase refusals land
// while the terminal is up).

describe("runSession (terminal lifecycle — imperative mount, probe-native teardown)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("constructor THROWS: stop SKIPPED, dispose STILL ATTEMPTED, the PRIMARY fault survives to the degrade line + 1 (the record settles exactly once through the emitter)", async () => {
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: true, outputs: {} }),
    });
    await scriptHitPipeline(world);
    hoisted.tuiScripts.construct = (): void => {
      throw new Error("terminal construction fault");
    };
    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: terminal construction fault",
    ]);
    expect(hoisted.tuiInstances).toHaveLength(0); // ctor never succeeded
    expect(world.dispose).toHaveBeenCalledTimes(1); // dispose STILL attempted
    expect(hoisted.installCalls).toHaveLength(0); // mount incomplete — install never reached
    expect(hoisted.lifecycle).toEqual(["armed", "disposed", "emitted"]); // no mounted / no stopped / no run-called
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "Error", message: "terminal construction fault" },
    ]);
    expect(world.exitCalls).toEqual([]); // boundary capture, not the kill path
  });

  it("INSTALL THUNK THROWS (post-mount fault): teardown FIRST, record settles through the already-constructed emitter, degrade line byte-stable + 1, and NO run() fires (lifecycle ends before run-called)", async () => {
    const world = makePipelineWorld({
      runBehavior: async () => ({ ok: true, outputs: {} }),
    });
    await scriptHitPipeline(world);
    hoisted.envScripts.install = (): void => {
      throw new Error("frame environment fault");
    };
    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: frame environment fault",
    ]);
    expect(hoisted.installCalls).toHaveLength(1); // fired once, then threw
    expect(hoisted.invocations).toEqual(["constructed", "armed"]); // run never called
    expect(hoisted.tuiInstances).toHaveLength(1);
    expect(hoisted.tuiInstances[0].stopCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "stopped",
      "disposed",
      "emitted",
    ]);
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "Error", message: "frame environment fault" },
    ]);
    expect(world.exitCalls).toEqual([]); // boundary capture, not the kill path
  });

  it("SECONDARY FAULTS: stop THROWING and dispose REJECTING both lose to the PRIMARY fault (the degrade names the primary; the typed capture lands in the record; exit 1)", async () => {
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => {
        throw new Error("pipeline exploded");
      },
    });
    await scriptHitPipeline(world);
    hoisted.tuiScripts.stop = (): void => {
      throw new Error("stop fault (secondary)");
    };
    world.dispose.mockRejectedValueOnce(new Error("dispose fault (secondary)"));
    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: pipeline exploded",
    ]);
    expect(hoisted.tuiInstances[0].stopCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.installCalls).toHaveLength(1); // install fired strictly before the fault
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
    ]);
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "Error", message: "pipeline exploded" },
    ]);
    expect(world.exitCalls).toEqual([]);
  });

  it("PRE-PHASE REFUSAL VARIANT (imperative model): the run REJECTS with a pre-phase-style typed error — the terminal WAS constructed (accepted consequence), its typed capture lands in the record, and teardown + record-exactly-once + exit 1 hold", async () => {
    const refusalMessage =
      "web tools unavailable: missing tool definitions for web_search, web_fetch (provisioning: isolated agent dir 'pi-native-search' local-source registration)";
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => {
        // Replicated typed signature (owner: preflightThrownMessage in
        // capabilities/research.ts — the shipped total-absence refusal).
        const refusal = new Error(refusalMessage);
        refusal.name = "WebToolsMissingError";
        throw refusal;
      },
    });
    await scriptHitPipeline(world);
    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      `pio-run-session: unexpected error: ${refusalMessage}`,
    ]);
    expect(hoisted.tuiInstances).toHaveLength(1); // WAS constructed (the mount precedes the run)
    expect(hoisted.tuiInstances[0].stopCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.installCalls).toHaveLength(1); // install fired pre-fault
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
    ]);
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "WebToolsMissingError", message: refusalMessage },
    ]);
    expect(world.exitCalls).toEqual([]);
  });
});

describe("runSession (last-resort boundary)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  it("post-emitter fault (fixture run() REJECTING): the captured record IS written — the REAL captureError ladder (identity fallback: type = error.name + message) — AND the degraded line + 1 still land, with the terminal torn down BEFORE the settle", async () => {
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
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio-run-session: unexpected error: pipeline exploded",
    ]);
    expect(hoisted.tuiInstances).toHaveLength(1);
    expect(hoisted.tuiInstances[0].stopCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    expect(hoisted.installCalls).toHaveLength(1); // install fired pre-fault
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
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
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    expect(hoisted.tuiInstances[0].stopCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("runSession (ordered shutdown pass wiring — RS rows)", () => {
  beforeEach(() => {
    resetHoistedState();
  });

  /** THE replicated typed exit-line bytes (owner: the default scripted legs
   * in the takeover mock above — single-owner literal discipline). */
  const FATAL_TYPED_LINE = (() => {
    const s =
      "terminal-takeover: shutdown \u2014 frame 'top@0.0.0' (depth 0) ended by fatal";
    return s;
  })();

  it("RS-A the guard wiring lands strictly BETWEEN env-installed and run-called: attachTopEmitter observes its call at lifecycle position env-installed+1, installExitGuard receives EXACTLY the forwarded seam bag (key order exit→signals, REFERENCE identity on both fields — absent seam fields would be omitted by the entry's conditional spreads, so this shape is the full-bag proof), and with a scripted marker the signals target observes TWO prepends in order [legacy arm (at 'armed', pre-mount), guard marker (post-install)] — the last-prepended-runs-first doctrine keeps the legacy kill capture dominant", async () => {
    const marker = vi.fn((): void => {});
    hoisted.guardScripts.marker = marker;
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => ({
        ok: true,
        outputs: {},
      }),
    });
    await scriptHitPipeline(world);

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(0);
    expect(err).toEqual([]);
    // Placement: BOTH wiring calls observe the cursor immediately after the
    // env-installed token (strictly before run-called pushed its token).
    expect(hoisted.guardObservations.attachCalls).toHaveLength(1);
    expect(hoisted.guardObservations.attachCalls[0].lifecycleCursor).toBe(
      hoisted.lifecycle.indexOf("env-installed") + 1,
    );
    expect(hoisted.guardObservations.installBags).toHaveLength(1);
    expect(hoisted.guardObservations.installBags[0].lifecycleCursor).toBe(
      hoisted.lifecycle.indexOf("env-installed") + 1,
    );
    // Cast seam: the bag bytes are read through a structural view (zero
    // casts live in SOURCE — suite convention).
    const bag = hoisted.guardObservations.installBags[0].bag as {
      exit?: unknown;
      signals?: unknown;
    };
    expect(Object.keys(bag)).toEqual(["exit", "signals"]);
    expect(bag.exit).toBe(world.exitSink); // forwarded BY REFERENCE
    expect(bag.signals).toBe(world.signalsTarget); // forwarded BY REFERENCE
    // TWO prepends, legacy FIRST (armed pre-mount), the guard marker SECOND.
    expect(world.handlers).toHaveLength(2);
    expect(world.handlers[1]).toBe(marker);
    expect(world.handlers[0]).not.toBe(marker);
  });

  it("RS-B the merged FATAL boundary (holder armed — the predicate admits): a rejecting run() takes the ORDERED PASS instead of the legacy teardown — the guard handle's trigger fires EXACTLY ONCE with 'fatal', the default scripted legs land the typed line FIRST on the sink THEN the single death leg (stop exactly once + the world's runtime dispose exactly once — the legacy teardown is SKIPPED, so each total stays ONE), the byte-stable seven-token lifecycle inventory survives unchanged, the TOP record settles through the boundary's own capture step AFTER the pass (ok:false, captured errors verbatim), the wrapper's exit/uninstall channels stay idle, and the sink history is EXACTLY [typed line, degrade] + exit code 1", async () => {
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => {
        throw new Error("pipeline exploded");
      },
    });
    await scriptHitPipeline(world);
    hoisted.installedPredicate.mockReturnValue(true); // holder ADMITTED

    const { io, err } = collectErr();
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      io,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1);
    // THE guard handle: the FATAL channel fired exactly once.
    const handle = hoisted.guardObservations.handles[0];
    expect(handle.trigger).toHaveBeenCalledTimes(1);
    expect(handle.trigger).toHaveBeenCalledWith("fatal");
    expect(handle.exit).not.toHaveBeenCalled();
    expect(handle.uninstall).not.toHaveBeenCalled();
    // THE exactly-once death leg (pass OR legacy, never both): stop 1 +
    // dispose 1 through the world's own recorder.
    expect(hoisted.tuiInstances[0].stopCalls).toBe(1);
    expect(world.dispose).toHaveBeenCalledTimes(1);
    // THE byte-stable lifecycle inventory (the pass's legs reuse the SAME
    // observation tokens the legacy teardown pushed).
    expect(hoisted.lifecycle).toEqual([
      "armed",
      "mounted",
      "env-installed",
      "run-called",
      "stopped",
      "disposed",
      "emitted",
    ]);
    // THE sink history: the typed line FIRST (the pass's line leg), then the
    // boundary degrade — nothing else touches the out-of-window stream.
    expect(err).toEqual([
      FATAL_TYPED_LINE,
      "pio-run-session: unexpected error: pipeline exploded",
    ]);
    // THE top record: settled by the BOUNDARY's capture step (the pass
    // structurally excludes the top — depth-0 honesty lives in the settle).
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "Error", message: "pipeline exploded" },
    ]);
    expect(record.outputs).toStrictEqual({});
    expect(world.exitCalls).toEqual([]); // the boundary returns, it exits not
  });

  it("RS-C EVERY secondary fault inside the triggered pass is swallowed: a doubly-faulting combination (custom legs throwing immediately + a sink that throws on every line) still RESOLVES the entry at 1 silently — the trigger was still attempted exactly once ('fatal'), the pass's stop/dispose legs never ran (the leg fault preceded them — totals ZERO, distinct from RS-B's exactly-once), the boundary's settle step still landed the captured top record (best-effort survived the silent degrade), and the process-level degradation is total silence (no line reaches the fallen sink without being caught)", async () => {
    const world = makePipelineWorld({
      runBehavior: async (): Promise<Record<string, unknown>> => {
        throw new Error("pipeline exploded");
      },
    });
    await scriptHitPipeline(world);
    hoisted.installedPredicate.mockReturnValue(true);
    hoisted.guardScripts.legs = async (): Promise<void> => {
      throw new Error("leg fallen"); // the pass itself faults immediately
    };
    const faulting: RunSessionIO = {
      stderr: (): void => {
        throw new Error("sink fallen");
      },
    };
    const code = await runSession(
      ["alpha", "--sessions-root", world.sessionsRoot],
      faulting,
      { signals: world.signalsTarget, exit: world.exitSink, tty: TTY_TRUE },
    );
    expect(code).toBe(1); // resolved — the swallow chain held end to end
    const handle = hoisted.guardObservations.handles[0];
    expect(handle.trigger).toHaveBeenCalledTimes(1);
    expect(handle.trigger).toHaveBeenCalledWith("fatal");
    // The leg fault PRECEDED both legs: zero stops, zero disposes.
    expect(hoisted.tuiInstances[0].stopCalls).toBe(0);
    expect(world.dispose).not.toHaveBeenCalled();
    // The boundary's OWN settle step still wrote the captured record (the
    // emitter write never rejects; the silent degrade follows it).
    const record = JSON.parse(
      readFileSync(join(world.sessionsRoot, "top", "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(record.ok).toBe(false);
    expect(record.errors).toEqual([
      { type: "Error", message: "pipeline exploded" },
    ]);
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

  it("statement-for-statement mirror of bin/pio: exactly ONE dynamic import of ../src/run-session.ts + the process.exitCode sink (the single-arg call stays valid — io and seams are optional parameters)", () => {
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

  it("ZERO static VALUE import statements (pure `import type` clauses admitted: erased under erasable syntax — zero runtime module evaluation; the permitted clause set is EXACTLY the status type pair + the launcher TtyStream view, and SDK reach stays separately pinned)", () => {
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
      "./capability/status.ts",
      "./sandbox/launcher.ts",
    ]);
  });

  it("dynamic specifier set is EXACTLY {'./capability/loader.ts', './capability/pio-session.ts', './capability/status.ts', './capability/terminal-takeover.ts', './sandbox/launcher.ts', '@earendil-works/pi-coding-agent'} — ALL literal, no interpolation (status appears twice: pipeline + boundary)", () => {
    const literal = [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map(
      (match) => match[1],
    );
    const total = src.match(/import\(/g)?.length ?? 0;
    expect([...new Set(literal)].sort()).toEqual(
      [
        "./capability/loader.ts",
        "./capability/pio-session.ts",
        "./capability/status.ts",
        "./capability/terminal-takeover.ts",
        "./sandbox/launcher.ts",
        "@earendil-works/pi-coding-agent",
      ].sort(),
    );
    expect(total).toBe(literal.length); // no template-literal (interpolated) imports
  });

  it("zero occurrences of the retired CAPABILITY_NOT_IMPLEMENTED identifier (the loader's capabilityRefusalLine owns the miss line now)", () => {
    expect(src.includes("CAPABILITY_NOT_IMPLEMENTED")).toBe(false);
  });

  it("EXACTLY ONE occurrence of the SDK specifier in run-session.ts source (the dynamic mount thunk — the terminal class arrives through it and NOWHERE else)", () => {
    expect(src.match(/@earendil-works\/pi-coding-agent/g)?.length).toBe(1);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});
