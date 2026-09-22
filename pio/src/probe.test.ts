// Hermetic unit suite for the pio probe target (Step 3). Every seam that would
// touch the real SDK or worker stdio is mocked/stubbed (D4); teardown ordering
// is verified by the live E2E battery + code inspection, not unit-asserted.
import type { TtyStream } from "./probe.ts";
import { isInteractiveTty, PROBE_OPENING_TEXT, run } from "./probe.ts";
import { createProbeSession } from "./session.ts";

vi.mock("./session.ts", () => ({ createProbeSession: vi.fn() }));

const probeSpy = vi.mocked(createProbeSession);
const TTY_REFUSAL_LINE =
  "pio: 'probe' needs an interactive terminal (TTY); headless mode lands in R4";

function collectorIo(): { io: { stderr(line: string): void }; err: string[] } {
  const err: string[] = [];
  return { io: { stderr: (line) => err.push(line) }, err };
}

beforeEach(() => {
  probeSpy.mockReset();
});

describe("PROBE_OPENING_TEXT (frozen constant)", () => {
  it("char-equals the exact frozen opening line", () => {
    expect(PROBE_OPENING_TEXT).toBe(
      "pio probe — diagnostic session. This proves the setup only; everything below behaves exactly like a normal pi session. Ctrl-C quits cleanly.",
    );
  });
});

describe("isInteractiveTty (predicate truth table)", () => {
  const cases: ReadonlyArray<readonly [string, TtyStream, TtyStream, boolean]> =
    [
      ["both streams TTY", { isTTY: true }, { isTTY: true }, true],
      ["stdin TTY / stdout not", { isTTY: true }, { isTTY: false }, false],
      ["stdin not / stdout TTY", { isTTY: false }, { isTTY: true }, false],
      ["neither stream TTY", { isTTY: false }, { isTTY: false }, false],
      ["isTTY absent on both", {}, {}, false],
    ];
  for (const [name, input, output, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(isInteractiveTty(input, output)).toBe(expected);
    });
  }
});

describe("run (preflight gates construction)", () => {
  // Save the original descriptors once; restore them after each test — the
  // process streams are never monkey-patched permanently.
  const origStdin = Object.getOwnPropertyDescriptor(process, "stdin");
  const origStdout = Object.getOwnPropertyDescriptor(process, "stdout");

  afterEach(() => {
    if (origStdin) Object.defineProperty(process, "stdin", origStdin);
    if (origStdout) Object.defineProperty(process, "stdout", origStdout);
  });

  it("non-TTY stdin: resolves 1, exact refusal line, ZERO createProbeSession calls", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: false },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { isTTY: true },
      configurable: true,
    });
    const { io, err } = collectorIo();
    const code = await run(io);
    expect(code).toBe(1);
    expect(err).toEqual([TTY_REFUSAL_LINE]);
    expect(probeSpy).not.toHaveBeenCalled();
  });
});

describe("run (failure rendering)", () => {
  const origStdin = Object.getOwnPropertyDescriptor(process, "stdin");
  const origStdout = Object.getOwnPropertyDescriptor(process, "stdout");

  afterEach(() => {
    if (origStdin) Object.defineProperty(process, "stdin", origStdin);
    if (origStdout) Object.defineProperty(process, "stdout", origStdout);
  });

  it("construction rejection: resolves 1, exact readable cause on stderr, never rejects", async () => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { isTTY: true },
      configurable: true,
    });
    probeSpy.mockRejectedValue(new Error("boom"));
    const { io, err } = collectorIo();
    const code = await run(io);
    expect(code).toBe(1);
    expect(err).toEqual(["pio: probe failed: boom"]);
  });
});

describe("run (sessionsRoot threading into session creation)", () => {
  const origStdin = Object.getOwnPropertyDescriptor(process, "stdin");
  const origStdout = Object.getOwnPropertyDescriptor(process, "stdout");

  beforeEach(() => {
    Object.defineProperty(process, "stdin", {
      value: { isTTY: true },
      configurable: true,
    });
    Object.defineProperty(process, "stdout", {
      value: { isTTY: true },
      configurable: true,
    });
  });

  afterEach(() => {
    if (origStdin) Object.defineProperty(process, "stdin", origStdin);
    if (origStdout) Object.defineProperty(process, "stdout", origStdout);
  });

  it("opts.sessionsRoot given: createProbeSession called with (process.cwd(), sessionsRoot); failure line unchanged", async () => {
    probeSpy.mockRejectedValue(new Error("boom"));
    const { io, err } = collectorIo();
    const code = await run(io, { sessionsRoot: "/x" });
    expect(code).toBe(1);
    expect(err).toEqual(["pio: probe failed: boom"]);
    expect(probeSpy).toHaveBeenCalledTimes(1);
    expect(probeSpy).toHaveBeenCalledWith(process.cwd(), "/x");
  });

  it("no opts: createProbeSession called SINGLE-ARG with (process.cwd()); failure line unchanged", async () => {
    probeSpy.mockRejectedValue(new Error("boom"));
    const { io, err } = collectorIo();
    const code = await run(io);
    expect(code).toBe(1);
    expect(err).toEqual(["pio: probe failed: boom"]);
    expect(probeSpy).toHaveBeenCalledTimes(1);
    // Length-sensitive: an explicit undefined second arg fails this row.
    expect(probeSpy).toHaveBeenCalledWith(process.cwd());
  });
});
