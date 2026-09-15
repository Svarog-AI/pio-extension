// Behavior-matrix TDD suite for the pio CLI (Step 2). Drives `parse` and
// `main(argv, io)` with captured IO, plus mechanical SDK-isolation guards.
import { readFileSync } from "node:fs";
import type { CliIO } from "./cli.ts";
import { BUILTINS, main, parse } from "./cli.ts";
import { PIO_VERSION } from "./version.ts";

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

describe("main (behavior matrix)", () => {
  it("--help: exit 0, usage form + exact probe diagnostic line on stdout, clean stderr", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["--help"], io);
    expect(code).toBe(0);
    const joined = out.join("\n");
    expect(joined).toContain("pio run <capability>");
    expect(joined).toContain(PROBE_DIAGNOSTIC);
    expect(joined).toMatch(/only resolvable target/i);
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

  // transitional: superseded by Step 3
  it("run probe: lazy load degrades readably while probe.ts is absent (transitional: superseded by Step 3)", async () => {
    const { io, out, err } = collectIo();
    const code = await main(["run", "probe"], io);
    expect(code).toBe(1);
    expect(out).toEqual([]);
    expect(err.length).toBe(1);
    expect(err[0]).toMatch(/^pio: failed to load built-in 'probe': /);
  });
});

describe("mechanical SDK-isolation guards", () => {
  const src = readFileSync(new URL("./cli.ts", import.meta.url), "utf8");

  it("zero occurrences of the SDK specifier in cli.ts source", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("the only dynamic-import specifier in cli.ts is the literal './probe.ts'", () => {
    const specifiers = [
      ...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]);
    expect([...new Set(specifiers)]).toEqual(["./probe.ts"]);
  });

  it("registry shape: keys exactly ['probe'], each value a thunk function", () => {
    expect(Object.keys(BUILTINS)).toEqual(["probe"]);
    for (const value of Object.values(BUILTINS)) {
      expect(typeof value).toBe("function");
    }
  });
});
