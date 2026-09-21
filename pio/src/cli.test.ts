// Behavior-matrix TDD suite for the pio CLI (Step 2). Drives `parse` and
// `main(argv, io)` with captured IO, plus mechanical SDK-isolation guards.
import { readFileSync } from "node:fs";
import type { CliIO } from "./cli.ts";
import { main, parse } from "./cli.ts";
import { run as probeRun } from "./probe.ts";
import { runCapability } from "./sandbox/run.ts";
import { PIO_VERSION } from "./version.ts";

// Hermetic dispatch seams: an unmocked main() could drive REAL session
// construction, bwrap launches, or network in a unit suite, so BOTH builtin
// modules are factory-mocked regardless of worker stdio TTY-ness. The
// not-implemented formatter replicates the shipped literal so the byte-pins
// below stay meaningful.
vi.mock("./probe.ts", () => ({ run: vi.fn() }));
vi.mock("./sandbox/run.ts", () => ({
  runCapability: vi.fn(),
  CAPABILITY_NOT_IMPLEMENTED: (name: string) =>
    `pio: capability '${name}' is not implemented yet`,
}));

const PROBE_DIAGNOSTIC =
  "probe — built-in diagnostic: verifies session/TUI/transcript plumbing";

function collectIo(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (line) => out.push(line), stderr: (line) => err.push(line) },
    out,
    err,
  };
}

describe("parse (descriptor-level grammar)", () => {
  it("bare invocation -> reserved", () => {
    expect(parse([])).toEqual({ kind: "reserved" });
  });

  it("--help -> help", () => {
    expect(parse(["--help"])).toEqual({ kind: "help" });
  });

  it("help -> help", () => {
    expect(parse(["help"])).toEqual({ kind: "help" });
  });

  it("--version -> version", () => {
    expect(parse(["--version"])).toEqual({ kind: "version" });
  });

  it("bare run -> reserved", () => {
    expect(parse(["run"])).toEqual({ kind: "reserved" });
  });

  it("run probe -> run(probe)", () => {
    expect(parse(["run", "probe"])).toEqual({
      kind: "run",
      capability: "probe",
    });
  });

  it("run <unknown> -> run(<unknown>): dispatch decides, not the parser", () => {
    expect(parse(["run", "nope"])).toEqual({ kind: "run", capability: "nope" });
  });

  it("capability matching is exact and case-sensitive (no normalization)", () => {
    expect(parse(["run", "PROBE"])).toEqual({
      kind: "run",
      capability: "PROBE",
    });
  });

  const unknownOptionCases: ReadonlyArray<
    [flag: string, argv: readonly string[]]
  > = [
    ["--huh", ["--huh"]],
    ["-h", ["-h"]],
    ["-v", ["-v"]],
    ["--detach", ["--detach"]],
    ["--input", ["--input", "x"]],
  ];
  for (const [flag, argv] of unknownOptionCases) {
    it(`unknown option '${flag}' (argv ${JSON.stringify(argv)}) -> error naming the flag`, () => {
      expect(parse(argv)).toEqual({
        kind: "error",
        message: `unknown option: ${flag} (try: pio --help)`,
      });
    });
  }

  it("top-level non-run command -> unknown-command error", () => {
    expect(parse(["foo"])).toEqual({
      kind: "error",
      message: "unknown command: foo (try: pio --help)",
    });
  });

  it("empty top-level token -> unknown-command error (empty token)", () => {
    expect(parse([""])).toEqual({
      kind: "error",
      message: "unknown command:  (try: pio --help)",
    });
  });

  it("dash token after run <cap> -> unknown-option error", () => {
    expect(parse(["run", "probe", "--detach"])).toEqual({
      kind: "error",
      message: "unknown option: --detach (try: pio --help)",
    });
  });

  it("non-dash token after run <cap> -> unexpected-argument error", () => {
    expect(parse(["run", "probe", "extra"])).toEqual({
      kind: "error",
      message: "unexpected argument: extra (usage: pio run <capability>)",
    });
  });

  it("run with empty capability -> missing-capability error", () => {
    expect(parse(["run", ""])).toEqual({
      kind: "error",
      message:
        "expected capability name after 'run' (usage: pio run <capability>)",
    });
  });

  it("run --help is a deliberate strict unknown-option error", () => {
    expect(parse(["run", "--help"])).toEqual({
      kind: "error",
      message: "unknown option: --help (try: pio --help)",
    });
  });

  it("--help / --version are terminal forms: trailing noise is ignored", () => {
    expect(parse(["--help", "garbage"])).toEqual({ kind: "help" });
    expect(parse(["help", "x", "y"])).toEqual({ kind: "help" });
    expect(parse(["--version", "junk"])).toEqual({ kind: "version" });
  });
});

describe("parse (session-run grammar)", () => {
  const USAGE = "pio session-run <capability> --sessions-root <dir>";

  it("the renderer-emitted quadruple (cross-step continuity) -> session-run descriptor", () => {
    expect(
      parse([
        "session-run",
        "probe",
        "--sessions-root",
        "/st/projects/k/engagements/e1/.sessions",
      ]),
    ).toEqual({
      kind: "session-run",
      capability: "probe",
      sessionsRoot: "/st/projects/k/engagements/e1/.sessions",
    });
  });

  it("relative value accepted verbatim (syntactic-only parser: consumers own validity)", () => {
    expect(
      parse(["session-run", "probe", "--sessions-root", "rel/path"]),
    ).toEqual({
      kind: "session-run",
      capability: "probe",
      sessionsRoot: "rel/path",
    });
  });

  const errors: ReadonlyArray<[argv: readonly string[], message: string]> = [
    [
      ["session-run"],
      `expected capability name after 'session-run' (usage: ${USAGE})`,
    ],
    [
      ["session-run", ""],
      `expected capability name after 'session-run' (usage: ${USAGE})`,
    ],
    [["session-run", "-h"], "unknown option: -h (try: pio --help)"],
    [["session-run", "--huh"], "unknown option: --huh (try: pio --help)"],
    [
      ["session-run", "probe"],
      `expected --sessions-root <dir> after 'session-run <capability>' (usage: ${USAGE})`,
    ],
    [
      ["session-run", "probe", "--detach"],
      "unknown option: --detach (try: pio --help)",
    ],
    [
      ["session-run", "probe", "positional"],
      `unexpected argument: positional (usage: ${USAGE})`,
    ],
    [
      ["session-run", "probe", "--sessions-root"],
      `expected a value for --sessions-root (usage: ${USAGE})`,
    ],
    [
      ["session-run", "probe", "--sessions-root", ""],
      `expected a value for --sessions-root (usage: ${USAGE})`,
    ],
    [
      ["session-run", "probe", "--sessions-root", "-x"],
      "unknown option: -x (try: pio --help)",
    ],
    [
      ["session-run", "probe", "--sessions-root", "/x", "extra"],
      `unexpected argument: extra (usage: ${USAGE})`,
    ],
    [
      ["session-run", "probe", "--sessions-root", "/x", "--more"],
      "unknown option: --more (try: pio --help)",
    ],
    [
      [
        "session-run",
        "probe",
        "--sessions-root",
        "/x",
        "--sessions-root",
        "/y",
      ],
      "unknown option: --sessions-root (try: pio --help)",
    ],
    [
      ["session-run", "--sessions-root", "/x", "probe"],
      "unknown option: --sessions-root (try: pio --help)",
    ],
  ];
  for (const [argv, message] of errors) {
    it(`${JSON.stringify(argv)} -> exact error naming the offending token`, () => {
      expect(parse(argv)).toEqual({ kind: "error", message });
    });
  }
});

describe("main (behavior matrix)", () => {
  // Full pinned-array equality: every pre-existing line stays byte-identical
  // AND the internal session-run line lands at its pinned position (right
  // after the run usage line) — placement pinned, not merely presence.
  it("--help: exit 0, stdout deep-equals the full pinned line array, clean stderr", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["--help"], io);
    expect(code).toBe(0);
    expect(out).toEqual([
      "pio — goal-driven project management CLI",
      "",
      "Usage:",
      "  pio run <capability>",
      "  pio session-run <capability> --sessions-root <dir>   [internal: invoked by the sandbox launcher — not a host-facing command]",
      "  pio --help",
      "  pio --version",
      "",
      "Built-in capabilities:",
      "  probe — built-in diagnostic: verifies session/TUI/transcript plumbing (currently the only resolvable target)",
    ]);
    expect(err).toEqual([]);
  });

  it("help: same contract as --help", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["help"], io);
    expect(code).toBe(0);
    const joined = out.join("\n");
    expect(joined).toContain("pio run <capability>");
    expect(joined).toContain(PROBE_DIAGNOSTIC);
    expect(err).toEqual([]);
  });

  it("--version: exit 0, exactly PIO_VERSION on stdout, clean stderr", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["--version"], io);
    expect(code).toBe(0);
    expect(out).toEqual([PIO_VERSION]);
    expect(err).toEqual([]);
  });

  it("bare invocation: exit 1, exact reserved line on stderr, nothing on stdout", async () => {
    const { io, out, err } = collectIo();
    const code = await main([], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: default workflow capability not available yet"]);
  });

  it("bare run: exit 1, exact reserved line on stderr", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: default workflow capability not available yet"]);
  });

  it("run <unknown>: exit 1, not-implemented line naming the capability", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "whatever"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: capability 'whatever' is not implemented yet"]);
  });

  it("run PROBE: exit 1, not-implemented line naming PROBE (case-sensitive miss)", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "PROBE"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: capability 'PROBE' is not implemented yet"]);
  });

  it("run probe --detach: exit 1, unknown-option line naming --detach", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "probe", "--detach"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: unknown option: --detach (try: pio --help)"]);
  });

  it("--input x: exit 1, unknown-option line naming --input", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["--input", "x"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: unknown option: --input (try: pio --help)"]);
  });

  it("bogus top-level command: exit 1, unknown-command line", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["bogus"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: unknown command: bogus (try: pio --help)"]);
  });

  it("run probe extra: exit 1, unexpected-argument line", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "probe", "extra"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([
      "pio: unexpected argument: extra (usage: pio run <capability>)",
    ]);
  });

  it('run "": exit 1, missing-capability line', async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", ""], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([
      "pio: expected capability name after 'run' (usage: pio run <capability>)",
    ]);
  });
});

describe("main (run path dispatch)", () => {
  const runCapabilityMock = vi.mocked(runCapability);
  const probeRunMock = vi.mocked(probeRun);

  beforeEach(() => {
    runCapabilityMock.mockReset();
    probeRunMock.mockReset();
  });

  it("run probe: dispatched through the run path with ('probe', the injected sink routed as stderr); exit 0 propagates unchanged; the stderr routing is proven by a line written THROUGH that sink", async () => {
    runCapabilityMock.mockImplementation(async (_name, sink) => {
      sink?.stderr("threaded-line");
      return 0;
    });
    const { io, out, err } = collectIo();
    const code = await main(["run", "probe"], io);
    expect(code).toBe(0);
    expect(runCapabilityMock).toHaveBeenCalledTimes(1);
    expect(runCapabilityMock).toHaveBeenCalledWith("probe", io);
    expect(err).toEqual(["threaded-line"]);
    expect(out).toEqual([]);
    expect(probeRunMock).not.toHaveBeenCalled();
  });

  it("run probe: exit code 1 from the run path propagates unchanged", async () => {
    runCapabilityMock.mockResolvedValue(1);
    const { io, out, err } = collectIo();
    const code = await main(["run", "probe"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it("directly-rejecting runCapability: last-resort boundary renders 'pio: unexpected error: kaboom', resolves 1", async () => {
    runCapabilityMock.mockRejectedValue(new Error("kaboom"));
    const { io, out, err } = collectIo();
    const code = await main(["run", "probe"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: unexpected error: kaboom"]);
  });

  it("run <unknown> never reaches the probe builtin (cross-module isolation)", async () => {
    const { io } = collectIo();
    const code = await main(["run", "bogus"], io);
    expect(code).toBe(1);
    expect(probeRunMock).not.toHaveBeenCalled();
  });
});

describe("main (session-run dispatch)", () => {
  const probeRunMock = vi.mocked(probeRun);
  const runCapabilityMock = vi.mocked(runCapability);

  beforeEach(() => {
    probeRunMock.mockReset();
    runCapabilityMock.mockReset();
  });

  it("session-run probe --sessions-root X: builtin run receives a first arg whose stderr routes into the collected sink AND a second arg deep-equal to { sessionsRoot: X }; exit 0 propagates; the run path stays un-called", async () => {
    probeRunMock.mockImplementation(async (sink) => {
      sink?.stderr("threaded-line");
      return 0;
    });
    const { io, out, err } = collectIo();
    const code = await main(
      ["session-run", "probe", "--sessions-root", "/x"],
      io,
    );
    expect(code).toBe(0);
    expect(probeRunMock).toHaveBeenCalledTimes(1);
    const args = probeRunMock.mock.calls[0];
    expect(args[0]).toBe(io);
    expect(args[1]).toEqual({ sessionsRoot: "/x" });
    expect(err).toEqual(["threaded-line"]);
    expect(out).toEqual([]);
    expect(runCapabilityMock).not.toHaveBeenCalled();
  });

  it("session-run probe --sessions-root X: exit code 1 propagates unchanged", async () => {
    probeRunMock.mockResolvedValue(1);
    const { io } = collectIo();
    const code = await main(
      ["session-run", "probe", "--sessions-root", "/x"],
      io,
    );
    expect(code).toBe(1);
    expect(probeRunMock).toHaveBeenCalledTimes(1);
  });

  it("session-run <other> --sessions-root X: exit 1, byte-identical not-implemented line, ZERO builtin runs", async () => {
    const { io, out, err } = collectIo();
    const code = await main(
      ["session-run", "bogus", "--sessions-root", "/x"],
      io,
    );
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: capability 'bogus' is not implemented yet"]);
    expect(probeRunMock).not.toHaveBeenCalled();
  });
});

describe("main (last-resort error boundary)", () => {
  const SINK_FAULT = "sink fallen";

  function faultyIo(faultOn: "stdout" | "stderr"): {
    io: CliIO;
    out: string[];
    err: string[];
  } {
    const out: string[] = [];
    const err: string[] = [];
    return {
      io: {
        stdout: (line) => {
          if (faultOn === "stdout") throw new Error(SINK_FAULT);
          out.push(line);
        },
        stderr: (line) => {
          if (faultOn === "stderr") throw new Error(SINK_FAULT);
          err.push(line);
        },
      },
      out,
      err,
    };
  }

  it("--help with a faulting stdout sink: resolves 1 (never rejects), exact unexpected-error line on the healthy stderr", async () => {
    const { io, out, err } = faultyIo("stdout");
    const code = await main(["--help"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([`pio: unexpected error: ${SINK_FAULT}`]);
  });

  it("bogus command with a faulting stderr sink: resolves 1 (never rejects); doubly-failed sink degrades silently", async () => {
    const { io, out, err } = faultyIo("stderr");
    const code = await main(["bogus"], io);
    expect(code).toBe(1);
    expect(err).toEqual([]);
    expect(out).toEqual([]);
  });

  it("bare invocation with a faulting stderr sink: resolves 1 (never rejects); doubly-failed sink degrades silently", async () => {
    const { io, out, err } = faultyIo("stderr");
    const code = await main([], io);
    expect(code).toBe(1);
    expect(err).toEqual([]);
    expect(out).toEqual([]);
  });
});

describe("mechanical SDK-isolation guards", () => {
  const src = readFileSync(new URL("./cli.ts", import.meta.url), "utf8");

  it("zero occurrences of the SDK specifier in cli.ts source", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("the dynamic-import specifier set in cli.ts is exactly the two literal builtin thunks (no interpolation)", () => {
    const specifiers = [
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    expect([...new Set(specifiers)].sort()).toEqual(
      ["./probe.ts", "./sandbox/run.ts"].sort(),
    );
  });

  it("static imports in cli.ts are exactly the pio-local version constant (no SDK reach)", () => {
    const specifiers = [
      ...src.matchAll(
        /^\s*import\s+(?:type\s+)?[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    // Multi-line static imports would slip past this single-clause pattern;
    // guard (a) above catches an SDK-typed one regardless.
    expect(specifiers).toEqual(["./version.ts"]);
  });

  it("the not-implemented catalog line has a single owner (run.ts): zero copies in cli.ts, one in run.ts", () => {
    const runSrc = readFileSync(
      new URL("./sandbox/run.ts", import.meta.url),
      "utf8",
    );
    const count = (text: string): number =>
      text.split("is not implemented yet").length - 1;
    expect(count(src)).toBe(0);
    expect(count(runSrc)).toBe(1);
  });

  // NOTE: the former third guard (registry shape: Object.keys(BUILTINS) ===
  // ["probe"]) was retired together with the BUILTINS registry itself (probe
  // is an explicit dispatch special case in main(), no abstraction around it).
  // Guards above mechanically pin: zero SDK references, the literal
  // builtin-thunk dynamic-import set, the version-only static import, and the
  // single-owner catalog line.
});
