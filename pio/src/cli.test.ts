// Behavior-matrix TDD suite for the pio CLI (Steps 2–3). Drives `parse` and
// `main(argv, io)` with captured IO, plus mechanical SDK-isolation guards.
import { readFileSync } from "node:fs";
import type { CliIO } from "./cli.ts";
import { main, parse } from "./cli.ts";
import { runCapability } from "./sandbox/run.ts";
import { PIO_VERSION } from "./version.ts";

// Hermetic dispatch seam: an unmocked main() could drive REAL session
// construction, bwrap launches, or network in a unit suite, so the builtin
// module is factory-mocked regardless of worker stdio TTY-ness. The miss
// line arrives THROUGH the mocked run path (delegation proof); its bytes are
// replicated from the loader owner below so the pins stay meaningful.
vi.mock("./sandbox/run.ts", () => ({
  runCapability: vi.fn(),
}));

const ADVISORY_LINE =
  "No capabilities are resolvable yet — the built-in capability table ships empty.";

// Replicated miss-line literal — the SOLE OWNER is capabilityRefusalLine in
// capability/loader.ts; the copy follows its owner into the entry suites so
// the delegation byte-pins stay meaningful.
const missLine = (name: string): string =>
  `pio: capability '${name}' is not implemented yet`;

// Replicated host usage string — the SOLE OWNER is the RUN_USAGE constant in
// ./cli.ts (help usage line + both error-template tails); the copy keeps the
// byte-pins below meaningful (the U-alias idiom from run-session.test.ts).
// NOTE the trailing ellipsis is the U+2026 HORIZONTAL ELLIPSIS character —
// pinned codepoint, not three dots.
const USAGE = "pio run <capability> [--input k=v …]";

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

  it("run cap -> run(cap) with the EMPTY inputs record (always present on run descriptors)", () => {
    expect(parse(["run", "cap"])).toEqual({
      kind: "run",
      capability: "cap",
      inputs: {},
    });
  });

  it("run <unknown> -> run(<unknown>) with the empty inputs record: dispatch decides, not the parser", () => {
    expect(parse(["run", "nope"])).toEqual({
      kind: "run",
      capability: "nope",
      inputs: {},
    });
  });

  it("capability matching is exact and case-sensitive (no normalization)", () => {
    expect(parse(["run", "CAP"])).toEqual({
      kind: "run",
      capability: "CAP",
      inputs: {},
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
    expect(parse(["run", "cap", "--detach"])).toEqual({
      kind: "error",
      message: "unknown option: --detach (try: pio --help)",
    });
  });

  it("non-dash token after run <cap> -> unexpected-argument error (canonical usage tail)", () => {
    expect(parse(["run", "cap", "extra"])).toEqual({
      kind: "error",
      message: `unexpected argument: extra (usage: ${USAGE})`,
    });
  });

  it("run with empty capability -> missing-capability error (canonical usage tail)", () => {
    expect(parse(["run", ""])).toEqual({
      kind: "error",
      message: `expected capability name after 'run' (usage: ${USAGE})`,
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

describe("parse (--input pair grammar — accepted forms)", () => {
  it("single pair -> run descriptor carrying the inputs record", () => {
    expect(parse(["run", "cap", "--input", "a=1"])).toEqual({
      kind: "run",
      capability: "cap",
      inputs: { a: "1" },
    });
  });

  it("multiple pairs -> DESCRIPTOR PAYLOAD PINNED WITH INSERTION ORDER (Object.keys snapshot)", () => {
    const parsed = parse(["run", "cap", "--input", "b=2", "--input", "a=1"]);
    expect(parsed).toEqual({
      kind: "run",
      capability: "cap",
      inputs: { b: "2", a: "1" },
    });
    if (parsed.kind !== "run") throw new Error("run descriptor expected");
    expect(Object.keys(parsed.inputs)).toEqual(["b", "a"]);
  });

  it("a multi-word topic arriving shell-quoted as ONE value keeps its spaces byte-exact", () => {
    expect(
      parse(["run", "research", "--input", "topic=How do LLMs learn?"]),
    ).toEqual({
      kind: "run",
      capability: "research",
      inputs: { topic: "How do LLMs learn?" },
    });
  });

  it("a value CONTAINING further '=' characters round-trips (split on the FIRST '=' only)", () => {
    expect(parse(["run", "cap", "--input", "topic=a=b"])).toEqual({
      kind: "run",
      capability: "cap",
      inputs: { topic: "a=b" },
    });
  });

  it("an empty value ('k=') IS syntactically legal (value = the EMPTY string)", () => {
    expect(parse(["run", "cap", "--input", "k="])).toEqual({
      kind: "run",
      capability: "cap",
      inputs: { k: "" },
    });
  });

  it("a pair candidate that itself starts with a dash is consumed AS-IS (pair candidates get no dash classification — legal at parse level)", () => {
    expect(parse(["run", "cap", "--input", "-x=y"])).toEqual({
      kind: "run",
      capability: "cap",
      inputs: { "-x": "y" },
    });
  });
});

describe("parse (--input pair grammar — strictness edges, first violation wins)", () => {
  const malformedPairCases: ReadonlyArray<
    readonly [argv: readonly string[], token: string]
  > = [
    // Dangling flag: NO pair candidate follows.
    [["run", "cap", "--input"], "--input"],
    // Pair candidate with NO '=' at all.
    [["run", "cap", "--input", "abc"], "abc"],
    // Pair candidate whose key (text before the FIRST '=') is EMPTY.
    [["run", "cap", "--input", "=v"], "=v"],
    [["run", "cap", "--input", "="], "="],
  ];
  for (const [argv, token] of malformedPairCases) {
    it(`${JSON.stringify(argv)} -> malformed input pair naming ${JSON.stringify(token)}`, () => {
      expect(parse(argv)).toEqual({
        kind: "error",
        message: `malformed input pair: '${token}' (--input expects k=v; usage: ${USAGE})`,
      });
    });
  }

  it("duplicated key -> duplicate-input-key error naming the KEY (the later pair is rejected)", () => {
    expect(parse(["run", "cap", "--input", "a=1", "--input", "a=2"])).toEqual({
      kind: "error",
      message: `duplicate input key: 'a' (each key may appear once; usage: ${USAGE})`,
    });
  });

  it("a duplicated EMPTY-valued key is still a duplicate (key presence, not value, drives it)", () => {
    expect(parse(["run", "cap", "--input", "k=", "--input", "k=v"])).toEqual({
      kind: "error",
      message: `duplicate input key: 'k' (each key may appear once; usage: ${USAGE})`,
    });
  });

  it("the glued form '--input=a=b' is a dash token ≠ the flag token -> unknown-option naming the WHOLE token", () => {
    expect(parse(["run", "cap", "--input=a=b"])).toEqual({
      kind: "error",
      message: "unknown option: --input=a=b (try: pio --help)",
    });
  });

  it("a pair NOT preceded by its flag is a POSITIONAL surplus -> unexpected-argument naming the token", () => {
    expect(parse(["run", "cap", "a=b"])).toEqual({
      kind: "error",
      message: `unexpected argument: a=b (usage: ${USAGE})`,
    });
  });

  it("positional surplus AFTER a valid pair -> unexpected-argument naming the surplus token", () => {
    expect(parse(["run", "cap", "--input", "a=1", "extra"])).toEqual({
      kind: "error",
      message: `unexpected argument: extra (usage: ${USAGE})`,
    });
  });

  it("an unknown dash AMONG pairs -> unknown-option naming the token", () => {
    expect(parse(["run", "cap", "--input", "a=1", "--detach"])).toEqual({
      kind: "error",
      message: "unknown option: --detach (try: pio --help)",
    });
  });

  it("'--input' in the CAPABILITY slot stays a strict unknown-option (the flag is recognized ONLY after a capability name was consumed)", () => {
    expect(parse(["run", "--input", "x"])).toEqual({
      kind: "error",
      message: "unknown option: --input (try: pio --help)",
    });
  });
});

describe("main (behavior matrix)", () => {
  // Full pinned-array equality: every line of the ten-line pinned form stays
  // byte-identical — placement pinned, not merely presence (the section
  // header and the advisory footer survived the built-in ENTRY deletion
  // BYTE-IDENTICAL).
  it("--help: exit 0, stdout deep-equals the full pinned line array, clean stderr", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["--help"], io);
    expect(code).toBe(0);
    expect(out).toEqual([
      "pio — goal-driven project management CLI",
      "",
      "Usage:",
      "  pio run <capability> [--input k=v …]",
      "  pio --help",
      "  pio --version",
      "",
      "Built-in capabilities:",
      "",
      ADVISORY_LINE,
    ]);
    expect(err).toEqual([]);
  });

  it("help: same contract as --help (containment over the built-ins header AND the advisory footer)", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["help"], io);
    expect(code).toBe(0);
    const joined = out.join("\n");
    expect(joined).toContain("pio run <capability>");
    expect(joined).toContain("Built-in capabilities:");
    expect(joined).toContain(ADVISORY_LINE);
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

  it("run cap --detach: exit 1, unknown-option line naming --detach", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "cap", "--detach"], io);
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

  it("run cap extra: exit 1, unexpected-argument line (canonical usage tail)", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "cap", "extra"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([`pio: unexpected argument: extra (usage: ${USAGE})`]);
  });

  it('run "": exit 1, missing-capability line (canonical usage tail)', async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", ""], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([
      `pio: expected capability name after 'run' (usage: ${USAGE})`,
    ]);
  });
});

describe("main (run path dispatch)", () => {
  const runCapabilityMock = vi.mocked(runCapability);

  beforeEach(() => {
    runCapabilityMock.mockReset();
  });

  // Miss rows: the CLI no longer owns any refusal bytes — it DELEGATES the
  // name onward, and the miss line (loader-owned bytes, replicated above)
  // arrives THROUGH the very sink the run path receives.
  it("run <unknown>: exit 1, delegated onward — called with ('whatever', the injected io); the miss line arrives THROUGH that sink; clean stdout", async () => {
    runCapabilityMock.mockImplementation(async (_name, sink) => {
      sink?.stderr(missLine("whatever"));
      return 1;
    });
    const { io, out, err } = collectIo();
    const code = await main(["run", "whatever"], io);
    expect(code).toBe(1);
    expect(runCapabilityMock).toHaveBeenCalledTimes(1);
    expect(runCapabilityMock).toHaveBeenCalledWith(
      "whatever",
      io,
      undefined,
      {},
    );
    expect(out).toEqual([]);
    expect(err).toEqual([missLine("whatever")]);
  });

  it("run CAP: exit 1, same delegation with a case-sensitive miss naming CAP (the loader decides, the CLI renders nothing of its own)", async () => {
    runCapabilityMock.mockImplementation(async (_name, sink) => {
      sink?.stderr(missLine("CAP"));
      return 1;
    });
    const { io, out, err } = collectIo();
    const code = await main(["run", "CAP"], io);
    expect(code).toBe(1);
    expect(runCapabilityMock).toHaveBeenCalledTimes(1);
    expect(runCapabilityMock).toHaveBeenCalledWith("CAP", io, undefined, {});
    expect(out).toEqual([]);
    expect(err).toEqual([missLine("CAP")]);
  });

  it("run cap: dispatched through the run path with ('cap', the injected sink routed as stderr, explicit undefined seams, the empty inputs record); exit 0 propagates unchanged; the stderr routing is proven by a line written THROUGH that sink", async () => {
    runCapabilityMock.mockImplementation(async (_name, sink) => {
      sink?.stderr("threaded-line");
      return 0;
    });
    const { io, out, err } = collectIo();
    const code = await main(["run", "cap"], io);
    expect(code).toBe(0);
    expect(runCapabilityMock).toHaveBeenCalledTimes(1);
    expect(runCapabilityMock).toHaveBeenCalledWith("cap", io, undefined, {});
    expect(err).toEqual(["threaded-line"]);
    expect(out).toEqual([]);
  });

  it("run research --input topic=a b --input depth=2: FOUR-ARG delegation with the parsed payload INTACT (four args ALWAYS — the empty-map uniformity pins on both sides of this row)", async () => {
    runCapabilityMock.mockResolvedValue(0);
    const { io, out, err } = collectIo();
    const code = await main(
      ["run", "research", "--input", "topic=a b", "--input", "depth=2"],
      io,
    );
    expect(code).toBe(0);
    expect(runCapabilityMock).toHaveBeenCalledTimes(1);
    expect(runCapabilityMock).toHaveBeenCalledWith("research", io, undefined, {
      topic: "a b",
      depth: "2",
    });
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it("run cap: exit code 1 from the run path propagates unchanged", async () => {
    runCapabilityMock.mockResolvedValue(1);
    const { io, out, err } = collectIo();
    const code = await main(["run", "cap"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it("directly-rejecting runCapability: last-resort boundary renders 'pio: unexpected error: kaboom', resolves 1", async () => {
    runCapabilityMock.mockRejectedValue(new Error("kaboom"));
    const { io, out, err } = collectIo();
    const code = await main(["run", "cap"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual(["pio: unexpected error: kaboom"]);
  });
});

describe("main (--input strictness edges — prefixed bytes + exit 1)", () => {
  // The host parser rejects EVERY malformed shape BEFORE any dispatch — these
  // rows pin the rendered `pio: `-prefixed bytes end-to-end through main.
  const edgeRows: ReadonlyArray<
    readonly [argv: readonly string[], line: string]
  > = [
    [
      ["run", "cap", "--input", "a=1", "--input", "a=2"],
      `pio: duplicate input key: 'a' (each key may appear once; usage: ${USAGE})`,
    ],
    [
      ["run", "cap", "--input"],
      `pio: malformed input pair: '--input' (--input expects k=v; usage: ${USAGE})`,
    ],
    [
      ["run", "cap", "--input", "abc"],
      `pio: malformed input pair: 'abc' (--input expects k=v; usage: ${USAGE})`,
    ],
    [
      ["run", "cap", "--input", "=v"],
      `pio: malformed input pair: '=v' (--input expects k=v; usage: ${USAGE})`,
    ],
    [
      ["run", "cap", "--input", "="],
      `pio: malformed input pair: '=' (--input expects k=v; usage: ${USAGE})`,
    ],
    [
      ["run", "cap", "--input=a=b"],
      "pio: unknown option: --input=a=b (try: pio --help)",
    ],
    [["run", "cap", "a=b"], `pio: unexpected argument: a=b (usage: ${USAGE})`],
    [
      ["run", "cap", "--input", "a=1", "extra"],
      `pio: unexpected argument: extra (usage: ${USAGE})`,
    ],
    [
      ["run", "cap", "--input", "a=1", "--detach"],
      "pio: unknown option: --detach (try: pio --help)",
    ],
    [["run", "--input", "x"], "pio: unknown option: --input (try: pio --help)"],
  ];
  for (const [argv, line] of edgeRows) {
    it(`${JSON.stringify(argv)} -> exit 1, clean stdout, the exact prefixed line on stderr`, async () => {
      const { io, out, err } = collectIo();
      const code = await main(argv, io);
      expect(code).toBe(1);
      expect(out).toEqual([]);
      expect(err).toEqual([line]);
    });
  }
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

describe("session-run retirement (net-shrink)", () => {
  const UNKNOWN_COMMAND_LINE = "unknown command: session-run (try: pio --help)";

  // Every formerly-valid argv shape now classifies as the unknown-command
  // error NAMING THE TOKEN (syntactic data in test rows only).
  const parseRows: ReadonlyArray<readonly string[]> = [
    ["session-run"],
    ["session-run", "cap"],
    ["session-run", "cap", "--sessions-root", "/x"],
    ["session-run", "--sessions-root", "/x", "cap"],
  ];
  for (const argv of parseRows) {
    it(`${JSON.stringify(argv)} -> unknown-command error naming the token`, () => {
      expect(parse(argv)).toEqual({
        kind: "error",
        message: UNKNOWN_COMMAND_LINE,
      });
    });
  }

  it("main level: the canonical quadruple exits 1 with clean stdout and the exact prefixed unknown-command line on stderr", async () => {
    const { io, out, err } = collectIo();
    const code = await main(
      ["session-run", "cap", "--sessions-root", "/x"],
      io,
    );
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([`pio: ${UNKNOWN_COMMAND_LINE}`]);
  });
});

describe("mechanical SDK-isolation guards", () => {
  const src = readFileSync(new URL("./cli.ts", import.meta.url), "utf8");

  it("zero occurrences of the SDK specifier in cli.ts source", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("the dynamic-import specifier set in cli.ts is exactly the single literal builtin thunk (no interpolation)", () => {
    const specifiers = [
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    expect([...new Set(specifiers)]).toEqual(["./sandbox/run.ts"]);
  });

  it("HEADLINE NET-SHRINK PROOF: zero occurrences of the string 'session-run' in cli.ts source (pins the kind, the parse helper, the message consts, the help line, and the dispatch case simultaneously)", () => {
    expect(src.includes("session-run")).toBe(false);
  });

  it("static imports in cli.ts are exactly the pio-local version constant (no SDK reach)", () => {
    const specifiers = [
      ...src.matchAll(
        /^\s*import\s+(?:type\s+)?[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    // Multi-line static imports would slip past this single-clause pattern;
    // the zero-SDK-specifier guard above catches an SDK-typed multi-line
    // clause regardless.
    expect(specifiers).toEqual(["./version.ts"]);
  });

  it("the miss refusal line has a single owner (capability/loader.ts): zero copies in cli.ts, zero in sandbox/run.ts, exactly one in capability/loader.ts", () => {
    const runSrc = readFileSync(
      new URL("./sandbox/run.ts", import.meta.url),
      "utf8",
    );
    const loaderSrc = readFileSync(
      new URL("./capability/loader.ts", import.meta.url),
      "utf8",
    );
    const count = (text: string): number =>
      text.split("is not implemented yet").length - 1;
    expect(count(src)).toBe(0);
    expect(count(runSrc)).toBe(0);
    expect(count(loaderSrc)).toBe(1);
  });

  it("zero occurrences of the retired CAPABILITY_NOT_IMPLEMENTED identifier (ownership of the line moved to the loader's capabilityRefusalLine)", () => {
    expect(src.includes("CAPABILITY_NOT_IMPLEMENTED")).toBe(false);
  });

  // NOTE: the registry-shape guard was retired together with the BUILTINS
  // registry itself. Guards above mechanically pin: zero SDK references, the
  // single builtin-thunk dynamic-import set, the version-only static import,
  // the single-owner miss line (repointed to capability/loader.ts), the
  // zero-retired-identifier invariant, and the zero-'session-run'
  // net-shrink headline.
});
