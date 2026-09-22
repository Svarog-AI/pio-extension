// Behavior-matrix TDD suite for the dedicated top-session entry. Drives
// `runSession(argv, io)` with captured sinks over factory-mocked consumer
// seams, plus mechanical lazy-SDK source guards over the entry source.
//
// Factory-evaluation flags: Vitest runs a mock factory at the mocked
// module's FIRST import (registration ≠ evaluation). Row order is therefore
// load-bearing — rows asserting a flag FALSE must be the process's first
// importers of that module (the parse-error block leads; the capability-gate
// row follows it), and rows asserting a flag TRUE rely on the first-run
// signal not yet being shadowed by a cached import.
import { readFileSync } from "node:fs";
import { type RunSessionIO, runSession } from "./run-session.ts";

const { evalFlags, notImplementedLine } = vi.hoisted(() => ({
  evalFlags: { probeEvaluated: false, runEvaluated: false },
  // Replicated single-owner catalog literal (same idiom as cli.test.ts) —
  // kept meaningful for the byte-pins below.
  notImplementedLine: (name: string): string =>
    `pio: capability '${name}' is not implemented yet`,
}));

// Hermetic dispatch seams: an unmocked dispatch could drive REAL session
// construction, bwrap launches, or network in a unit suite, so BOTH consumer
// modules are factory-mocked. The replicated single-source literals keep the
// byte-pins below meaningful (same idiom as cli.test.ts).
vi.mock("./probe.ts", () => {
  evalFlags.probeEvaluated = true;
  return {
    run: vi.fn(),
    TTY_REFUSAL_LINE:
      "pio: 'probe' needs an interactive terminal (TTY); headless mode lands in R4",
    isInteractiveTty: vi.fn(),
  };
});
vi.mock("./sandbox/run.ts", () => {
  evalFlags.runEvaluated = true;
  return {
    CAPABILITY_NOT_IMPLEMENTED: notImplementedLine,
    runCapability: vi.fn(),
  };
});

const U = "pio-run-session <capability> --sessions-root <dir>";

// Memoized accessor for the mocked probe module. Deliberately LAZY: fetching
// the reference runs the probe factory (first import in the process), so the
// first fetch must happen only in rows that tolerate/assert probe evaluation.
// Nothing at file scope imports a consumer module, so cheap-path rows below
// observe genuinely unevaluated modules.
type ProbeModule = typeof import("./probe.ts");
let probeModulePromise: Promise<ProbeModule> | undefined;
async function probeModule(): Promise<ProbeModule> {
  probeModulePromise ??= import("./probe.ts");
  return probeModulePromise;
}

/** Per-row mocked references into the probe seam (types from the real module). */
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

describe("runSession (strict two-value parse — cheap paths, ZERO module evaluation)", () => {
  beforeEach(() => {
    evalFlags.probeEvaluated = false;
    evalFlags.runEvaluated = false;
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
    it(`${JSON.stringify(argv)} -> exact prefixed error naming the offending token; ZERO consumer-module evaluations`, async () => {
      const { io, err } = collectErr();
      const code = await runSession(argv, io);
      expect(code).toBe(1);
      expect(err).toEqual([`pio-run-session: ${message}`]);
      expect(evalFlags.probeEvaluated).toBe(false);
      expect(evalFlags.runEvaluated).toBe(false);
    });
  }
});

describe("runSession (capability gate — fires BEFORE the TTY preflight)", () => {
  beforeEach(() => {
    evalFlags.probeEvaluated = false;
    evalFlags.runEvaluated = false;
  });

  it("non-probe capability: byte-identical not-implemented line from the single owner; ZERO probe-module evaluations; exit 1", async () => {
    const { io, err } = collectErr();
    const code = await runSession(["alpha", "--sessions-root", "/x"], io);
    expect(code).toBe(1);
    expect(err).toEqual(["pio: capability 'alpha' is not implemented yet"]);
    expect(evalFlags.runEvaluated).toBe(true); // catalog thunk fired on the non-probe arm
    expect(evalFlags.probeEvaluated).toBe(false); // probe module never loaded
  });
});

describe("runSession (TTY preflight — refusal before any construction)", () => {
  // Flag zeroing BEFORE the lazy fetch: the fetch may run the probe factory
  // (process-first import); the preflight row below reads that first-run
  // signal, so it must survive the hook.
  beforeEach(async () => {
    evalFlags.probeEvaluated = false;
    evalFlags.runEvaluated = false;
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    runMock.mockReset();
    ttyMock.mockReset();
  });

  it("non-TTY stdin/stdout: byte-identical TTY refusal line, exit 1, ZERO construction past the refusal", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(false);
    const { io, err } = collectErr();
    const code = await runSession(["probe", "--sessions-root", "/x"], io);
    expect(code).toBe(1);
    expect(err).toEqual([
      "pio: 'probe' needs an interactive terminal (TTY); headless mode lands in R4",
    ]);
    expect(runMock).not.toHaveBeenCalled(); // zero construction past the refusal
    expect(evalFlags.probeEvaluated).toBe(true);
    expect(evalFlags.runEvaluated).toBe(false);
  });
});

describe("runSession (valid forms + builtin dispatch)", () => {
  // Flag zeroing BEFORE the lazy fetch: the fetch may run the probe factory
  // (process-first import); the preflight row below reads that first-run
  // signal, so it must survive the hook.
  beforeEach(async () => {
    evalFlags.probeEvaluated = false;
    evalFlags.runEvaluated = false;
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    runMock.mockReset();
    ttyMock.mockReset();
  });

  it("accepts the renderer-emitted triple VERBATIM (cross-step continuity — data literal of the post-repoint buildTarget grammar [capability, --sessions-root, <engagementDir>/.sessions]; the producer pin lives in render.test.ts, the composer pin in TEST.md) and dispatches to the probe builtin with (the injected sink, { sessionsRoot }); exit 0 propagates; the catalog thunk never fires for probe", async () => {
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
    expect(evalFlags.runEvaluated).toBe(false); // probe name never loads the catalog
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

describe("runSession (last-resort boundary)", () => {
  // Flag zeroing BEFORE the lazy fetch: the fetch may run the probe factory
  // (process-first import); the preflight row below reads that first-run
  // signal, so it must survive the hook.
  beforeEach(async () => {
    evalFlags.probeEvaluated = false;
    evalFlags.runEvaluated = false;
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    runMock.mockReset();
    ttyMock.mockReset();
  });

  it("directly-rejecting builtin: resolves 1 (never rejects), exactly one readable unexpected-error line on the healthy sink", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(true);
    runMock.mockRejectedValue(new Error("kaboom"));
    const { io, err } = collectErr();
    const code = await runSession(["probe", "--sessions-root", "/x"], io);
    expect(code).toBe(1);
    expect(err).toEqual(["pio-run-session: unexpected error: kaboom"]);
  });

  it("doubly-faulting sink: resolves 1, silently", async () => {
    const { run: runMock, isInteractiveTty: ttyMock } = await probeMocks();
    ttyMock.mockReturnValue(true);
    runMock.mockRejectedValue(new Error("kaboom"));
    const faulting: RunSessionIO = {
      stderr: () => {
        throw new Error("sink fallen");
      },
    };
    const code = await runSession(["probe", "--sessions-root", "/x"], faulting);
    expect(code).toBe(1);
  });
});

describe("export surface", () => {
  it("runtime export surface is exactly ['runSession'] (the IO type erases under erasable syntax)", async () => {
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

  it("statement-for-statement mirror of bin/pio: exactly ONE dynamic import of ../src/run-session.ts + the process.exitCode sink", () => {
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

  it("ZERO static import statements (stronger than cli.ts's version-only-static invariant)", () => {
    const specifiers = [
      ...src.matchAll(
        /^\s*import\s+(?:type\s+)?[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(specifiers).toEqual([]);
  });

  it("dynamic specifier set is EXACTLY {'./probe.ts', './sandbox/run.ts'} — ALL literal, no interpolation", () => {
    const literal = [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map(
      (match) => match[1],
    );
    const total = src.match(/import\(/g)?.length ?? 0;
    expect([...new Set(literal)].sort()).toEqual(
      ["./probe.ts", "./sandbox/run.ts"].sort(),
    );
    expect(total).toBe(literal.length); // no template-literal (interpolated) imports
  });

  it("zero occurrences of the SDK specifier in run-session.ts source", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});
