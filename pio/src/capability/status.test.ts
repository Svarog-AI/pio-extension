// Hermetic unit suite for the terminal status record module. Leaf-module
// proof: no SDK mocks exist anywhere in this suite — the production code
// imports nothing beyond node builtins and the error home, so the suite needs
// plain fakes only: an array-backed signal target mimicking EventEmitter
// prepend semantics (prepend => unshift; fire = iterate a copy in stored
// order, awaiting handlers), a recording exit sink, pendable settle
// promises, a stepping injected clock, and real tmpdir FS (fresh mkdtempSync
// per row, forced teardown).
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { CapabilityErrorCause } from "./errors.ts";
import { ContractViolationError, PhaseBudgetError } from "./errors.ts";
import type { SessionStatus, StatusEmitter } from "./status.ts";
import {
  captureError,
  createStatusEmitter,
  DEFAULT_KILL_GRACE_MS,
  exitCodeFor,
  serializeStatus,
  statusPath,
} from "./status.ts";

/** Mirrors the session counters' five-field token derivation so the fixture
 * sum is hand-computable and the emitter's lack of transformation pinnable. */
const tokenSum = (
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): number => input + output + cacheRead + cacheWrite;

/** Stepping injected clock: mint at construction, advance between rows. */
function steppingClock(initial = 1_700_000_000_000): {
  now: () => number;
  advance(ms: number): void;
} {
  let t = initial;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

interface HarnessOpts {
  now?: () => number;
  tokens?: () => number;
  sessionFile?: () => string | undefined;
  settleLiveRun?: () => Promise<void>;
  graceMs?: number;
}

/** FS-backed harness: fresh tmpdir engagement layout with a dynamic-name
 * transcript fixture, injected exit sink, and the exposed fake signal target. */
function mkHarness(opts: HarnessOpts = {}): {
  root: string;
  sessionsRoot: string;
  transcript: string;
  emitter: StatusEmitter;
  exitCalls: number[];
  signals: ReturnType<typeof makeFakeSignals>;
  readRaw(): string;
} {
  const root = mkdtempSync(join(os.tmpdir(), "status-test-"));
  const sessionsRoot = join(root, ".sessions");
  const transcript = join(
    sessionsRoot,
    "top",
    "20260101T000000Z_deadbeefcafe.jsonl",
  );
  const exitCalls: number[] = [];
  const signals = makeFakeSignals();
  const emitter = createStatusEmitter({
    sessionsRoot,
    capability: { name: "demo", version: "0.1.0" },
    tokens: opts.tokens ?? (() => 0),
    sessionFile: opts.sessionFile ?? (() => transcript),
    now: opts.now,
    exit: (code: number) => {
      exitCalls.push(code);
    },
    signals: signals.target,
    settleLiveRun: opts.settleLiveRun,
    graceMs: opts.graceMs,
  });
  return {
    root,
    sessionsRoot,
    transcript,
    emitter,
    exitCalls,
    signals,
    readRaw: (): string =>
      readFileSync(join(sessionsRoot, "top", "status.json"), "utf8"),
  };
}

// Array-backed signal target mimicking EventEmitter prepend semantics:
// registration prepends (unshift); fire iterates a COPY in stored order,
// awaiting handlers — last-prepended-runs-first, exactly like dispatch.
function makeFakeSignals(): {
  target: {
    prependListener(signal: "SIGTERM", handler: () => void): void;
  };
  fire(): Promise<void>;
  count(): number;
  invocations: string[];
} {
  const handlers: Array<{ label: string; handler: () => void }> = [];
  const invocations: string[] = [];
  let seq = 0;
  return {
    target: {
      prependListener(_signal: "SIGTERM", handler: () => void): void {
        handlers.unshift({ label: `h${seq}`, handler });
        seq += 1;
      },
    },
    async fire(): Promise<void> {
      for (const entry of handlers.slice()) {
        invocations.push(entry.label);
        await entry.handler();
      }
    },
    count: (): number => handlers.length,
    invocations,
  };
}

describe("serializeStatus (byte shape)", () => {
  const happy: SessionStatus = {
    ok: true,
    capability: { name: "demo", version: "0.1.0", source: "builtin" },
    outputs: { "outputs/REPORT.md": "report" },
    tokens: 519,
    durationMs: 1234,
  };

  it("golden bytes for a clean record: canonical order, 2-space indent, trailing newline", () => {
    expect(serializeStatus(happy)).toBe(
      `{
  "ok": true,
  "capability": {
    "name": "demo",
    "version": "0.1.0",
    "source": "builtin"
  },
  "outputs": {
    "outputs/REPORT.md": "report"
  },
  "tokens": 519,
  "durationMs": 1234
}
`,
    );
  });

  it("key order equals [ok, capability, outputs, tokens, durationMs] on a clean record", () => {
    expect(Object.keys(JSON.parse(serializeStatus(happy)))).toEqual([
      "ok",
      "capability",
      "outputs",
      "tokens",
      "durationMs",
    ]);
  });

  it("nested capability serializes in [name, version, source] order", () => {
    const parsed = JSON.parse(serializeStatus(happy));
    expect(Object.keys(parsed.capability)).toEqual([
      "name",
      "version",
      "source",
    ]);
  });

  it("carries the literal source 'builtin' in the serialized text", () => {
    expect(serializeStatus(happy)).toContain('"source": "builtin"');
  });

  it("omits nullish optionals by ABSENCE (no errors key, no transcriptRef key, never null)", () => {
    const text = serializeStatus(happy);
    expect(text).not.toContain('"errors"');
    expect(text).not.toContain('"transcriptRef"');
    expect(text).not.toContain("null");
  });

  it("failing contract record: exact key set with violations present", () => {
    const failing: SessionStatus = {
      ok: false,
      capability: { name: "demo", version: "0.1.0", source: "builtin" },
      outputs: {},
      errors: [
        {
          type: "ContractViolationError",
          cause: "contract",
          message: "Contract violation: 'plan' file not found: ./PLAN.md",
          violations: ["'plan' file not found: ./PLAN.md"],
        },
      ],
      tokens: 7,
      durationMs: 42,
    };
    const parsed = JSON.parse(serializeStatus(failing));
    expect(Object.keys(parsed)).toEqual([
      "ok",
      "capability",
      "outputs",
      "errors",
      "tokens",
      "durationMs",
    ]);
    expect(parsed.errors[0]).toStrictEqual({
      type: "ContractViolationError",
      cause: "contract",
      message: "Contract violation: 'plan' file not found: ./PLAN.md",
      violations: ["'plan' file not found: ./PLAN.md"],
    });
  });

  it("failing budget record: cause present, violations ABSENT from the element", () => {
    const failing: SessionStatus = {
      ok: false,
      capability: { name: "demo", version: "0.1.0", source: "builtin" },
      outputs: {},
      errors: [
        {
          type: "PhaseBudgetError",
          cause: "budget",
          message: "Iteration budget exceeded after 3 iterations",
        },
      ],
      tokens: 1,
      durationMs: 2,
    };
    const parsed = JSON.parse(serializeStatus(failing));
    expect(Object.keys(parsed.errors[0])).toEqual(["type", "cause", "message"]);
    expect(parsed.errors[0]).toStrictEqual({
      type: "PhaseBudgetError",
      cause: "budget",
      message: "Iteration budget exceeded after 3 iterations",
    });
  });

  it("full record keeps canonical order including errors before transcriptRef", () => {
    const full: SessionStatus = {
      ok: false,
      capability: { name: "demo", version: "0.1.0", source: "builtin" },
      outputs: { a: 1 },
      errors: [{ type: "SIGTERM", cause: "kill" }],
      transcriptRef: ".sessions/top/x.jsonl",
      tokens: 9,
      durationMs: 3,
    };
    expect(Object.keys(JSON.parse(serializeStatus(full)))).toEqual([
      "ok",
      "capability",
      "outputs",
      "errors",
      "transcriptRef",
      "tokens",
      "durationMs",
    ]);
  });
});

describe("placement and transcriptRef (pure + tmpdir rows)", () => {
  it("statusPath lands beside the top transcript at <root>/top/status.json", () => {
    expect(statusPath("/eng/.sessions")).toBe(
      join("/eng", ".sessions", "top", "status.json"),
    );
  });

  it("writes the terminal record at statusPath and stamps identity + builtin source", async () => {
    const h = mkHarness();
    try {
      const emitted = await h.emitter.emit({ ok: true, outputs: {} });
      expect(h.readRaw()).toBe(serializeStatus(emitted.status));
      const parsed = JSON.parse(h.readRaw());
      expect(parsed.capability).toStrictEqual({
        name: "demo",
        version: "0.1.0",
        source: "builtin",
      });
      expect(statusPath(h.sessionsRoot)).toBe(
        join(h.root, ".sessions", "top", "status.json"),
      );
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("records transcriptRef RELATIVE to the engagement dir for a dynamic-name fixture", async () => {
    const h = mkHarness();
    try {
      const emitted = await h.emitter.emit({ ok: true, outputs: {} });
      const ref = emitted.status.transcriptRef;
      expect(ref).toBe(".sessions/top/20260101T000000Z_deadbeefcafe.jsonl");
      expect(ref).not.toBeUndefined();
      expect(ref?.startsWith("/")).toBe(false);
      const parsed = JSON.parse(h.readRaw());
      expect(parsed.transcriptRef).toBe(ref);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("survives a repo move: re-read through the stored ref from the new location", async () => {
    const h = mkHarness();
    const moved = mkdtempSync(join(os.tmpdir(), "status-moved-parent-"));
    try {
      const emitted = await h.emitter.emit({ ok: true, outputs: { a: 1 } });
      const ref = emitted.status.transcriptRef;
      // Materialize the transcript AFTER emission (which created the top dir)
      // so the stored ref resolves to real bytes for the move simulation.
      const transcriptPayload = '{"type":"session","id":"deadbeefcafe"}\n';
      writeFileSync(h.transcript, transcriptPayload);
      const originalRecord = JSON.parse(
        readFileSync(statusPath(h.sessionsRoot), "utf8"),
      );
      renameSync(h.root, join(moved, "relocated"));
      // Through its OWN stored ref, the transcript keeps identical bytes from
      // the new location — the relative placement survives the move.
      if (ref === undefined) {
        throw new Error("row fixture invariant violated: ref must be present");
      }
      const relocatedTranscript = readFileSync(
        join(moved, "relocated", ref),
        "utf8",
      );
      expect(relocatedTranscript).toBe(transcriptPayload);
      // And the terminal record itself reads back byte-stable at its
      // engagement-relative position under the new root.
      const relocatedRecord = JSON.parse(
        readFileSync(
          join(moved, "relocated", ".sessions", "top", "status.json"),
          "utf8",
        ),
      );
      expect(relocatedRecord).toStrictEqual(originalRecord);
      expect(emitted.status.transcriptRef).toBe(ref);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
      rmSync(moved, { recursive: true, force: true });
    }
  });

  it("omits the transcriptRef key entirely when the accessor yields undefined", async () => {
    const h = mkHarness({ sessionFile: () => undefined });
    try {
      await h.emitter.emit({ ok: true, outputs: {} });
      const text = h.readRaw();
      expect(text).not.toContain('"transcriptRef"');
      expect(JSON.parse(text).transcriptRef).toBeUndefined();
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });
});

describe("token scalar and duration (injected-clock rows)", () => {
  it("round-trips the hand-computed five-field token sum VERBATIM", async () => {
    const sum = tokenSum(10, 7, 500, 2);
    expect(sum).toBe(519);
    const h = mkHarness({ tokens: () => sum });
    try {
      const emitted = await h.emitter.emit({ ok: true, outputs: {} });
      expect(emitted.status.tokens).toBe(519);
      expect(h.readRaw()).toContain('"tokens": 519');
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("spans durationMs exactly under a stepping clock (construct T, emit T+50)", async () => {
    const clock = steppingClock(1_700_000_000_000);
    const h = mkHarness({ now: clock.now });
    try {
      clock.advance(50);
      const emitted = await h.emitter.emit({ ok: true, outputs: {} });
      expect(emitted.status.durationMs).toBe(50);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("yields a positive span under the default wall clock", async () => {
    const h = mkHarness();
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const emitted = await h.emitter.emit({ ok: true, outputs: {} });
      expect(emitted.status.durationMs).toBeGreaterThan(0);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });
});

describe("captureError (ladder table)", () => {
  it("contract violation: default message, cause, violations passthrough by identity", () => {
    const err = new ContractViolationError([
      "'plan' file not found: ./PLAN.md",
    ]);
    const captured = captureError(err);
    expect(captured).toStrictEqual({
      type: "ContractViolationError",
      cause: "contract",
      message: "Contract violation: 'plan' file not found: ./PLAN.md",
      violations: ["'plan' file not found: ./PLAN.md"],
    });
    expect(captured.violations).toBe(err.violations);
  });

  it("contract violation: custom message preserved over the derived default", () => {
    const captured = captureError(
      new ContractViolationError(["v"], "custom msg"),
    );
    expect(captured.message).toBe("custom msg");
    expect(captured.violations).toEqual(["v"]);
  });

  it("phase budget: default message, pinned type and cause, no violations key", () => {
    const captured = captureError(new PhaseBudgetError(3));
    expect(Object.keys(captured)).toEqual(["type", "cause", "message"]);
    expect(captured).toStrictEqual({
      type: "PhaseBudgetError",
      cause: "budget",
      message: "Iteration budget exceeded after 3 iterations",
    });
  });

  it("author-halt via standard Error.cause: adopted from the closed vocabulary", () => {
    const captured = captureError(
      new Error("halted", { cause: "author-halt" }),
    );
    expect(captured).toStrictEqual({
      type: "Error",
      cause: "author-halt",
      message: "halted",
    });
  });

  it("foreign cause: rejected by the vocabulary gate (no cause key)", () => {
    const captured = captureError(new Error("x", { cause: "bogus" }));
    expect(captured).toStrictEqual({ type: "Error", message: "x" });
  });

  it("plain Error: identity plus message, no cause", () => {
    expect(captureError(new Error("x"))).toStrictEqual({
      type: "Error",
      message: "x",
    });
  });

  it("empty Error message: message key ABSENT (never empty-string noise)", () => {
    expect(captureError(new Error(""))).toStrictEqual({ type: "Error" });
  });

  it("string throw: UnknownError with the String form", () => {
    expect(captureError("boom")).toStrictEqual({
      type: "UnknownError",
      message: "boom",
    });
  });

  it("primitive throw: String-rendered message", () => {
    expect(captureError(42)).toStrictEqual({
      type: "UnknownError",
      message: "42",
    });
  });

  it("object throw: String-form message", () => {
    expect(captureError({ detail: 1 })).toStrictEqual({
      type: "UnknownError",
      message: "[object Object]",
    });
  });
});

describe("exitCodeFor (pure map) and pinned grace default", () => {
  const capability: SessionStatus["capability"] = {
    name: "demo",
    version: "0.1.0",
    source: "builtin",
  };

  const cases: ReadonlyArray<
    [
      label: string,
      ok: boolean,
      cause: CapabilityErrorCause | null,
      expected: number,
    ]
  > = [
    ["clean completion", true, null, 0],
    ["contract failure", false, "contract", 1],
    ["budget failure", false, "budget", 1],
    ["author halt", false, "author-halt", 1],
    ["kill mid-run", false, "kill", 1],
    ["unknown failure without cause", false, null, 1],
  ];
  for (const [label, ok, cause, expected] of cases) {
    it(`${label} -> ${expected}`, () => {
      const status: SessionStatus = {
        ok,
        capability,
        outputs: {},
        ...(cause !== null
          ? { errors: [{ type: label, cause }] }
          : !ok
            ? { errors: [{ type: "MysteryError" }] }
            : {}),
        tokens: 0,
        durationMs: 0,
      };
      expect(exitCodeFor(status)).toBe(expected);
    });
  }

  it("pins the default kill grace at 250 ms", () => {
    expect(DEFAULT_KILL_GRACE_MS).toBe(250);
  });
});

/** Pendable promise sink for held settlements. */
function pendable(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolveFn: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });
  return {
    promise,
    resolve: (): void => {
      resolveFn?.();
    },
  };
}

/** Pump the real event loop past any in-flight immediate-capture chain
 * (no-settle prelude + one fs write); margins are generous vs tmpdir latency. */
const pump = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("single-write guard (racing-consumer rows)", () => {
  it("completion first: signal no-ops, bytes stable, third emit delegates to the cached winner", async () => {
    const h = mkHarness({ tokens: () => 5 });
    try {
      const first = await h.emitter.emit({ ok: true, outputs: { a: 1 } });
      const bytesX = h.readRaw();
      expect(first.exitCode).toBe(0);

      await h.signals.fire();

      // No second write, and the exit sink was NEVER called on this path.
      expect(h.readRaw()).toBe(bytesX);
      expect(h.exitCalls).toEqual([]);

      // A THIRD consumer resolves the winner's exact emission result.
      const third = await h.emitter.emit({
        ok: false,
        errors: [captureError(new Error("late arrival"))],
      });
      expect(third).toBe(first);
      expect(third.status.ok).toBe(true);
      expect(third.exitCode).toBe(0);
      expect(h.readRaw()).toBe(bytesX);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("kill first: exactly ONE write total, exit once with 1, completion emit delegates to the kill's result", async () => {
    const hold = pendable();
    const h = mkHarness({
      tokens: () => 7,
      settleLiveRun: () => hold.promise,
      graceMs: 10_000, // large bound: the kill chain parks on the held settle
    });
    try {
      h.emitter.armKillCapture();
      const firing = h.signals.fire();
      // The kill chain is in flight: claim taken, parked on settlement.
      const delegated = h.emitter.emit({ ok: true, outputs: { b: 2 } });
      hold.resolve();
      const winner = await delegated;
      expect(winner.status.ok).toBe(false);
      expect(winner.exitCode).toBe(1);
      expect(winner.status.errors).toStrictEqual([
        { type: "SIGTERM", cause: "kill" },
      ]);
      expect(winner.status.tokens).toBe(7);
      expect(h.exitCalls).toEqual([1]);
      // Bytes are the KILL payload: the completion write never happened.
      expect(h.readRaw()).toBe(serializeStatus(winner.status));
      expect(JSON.parse(h.readRaw()).ok).toBe(false);
      await firing;
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("double signal: one capture, one exit", async () => {
    const hold = pendable();
    const h = mkHarness({
      settleLiveRun: () => hold.promise,
      graceMs: 10_000,
    });
    try {
      h.emitter.armKillCapture();
      const first = h.signals.fire();
      const second = h.signals.fire(); // repeat delivery after the claim
      hold.resolve();
      await first;
      await second;
      await pump(15);
      expect(h.exitCalls).toEqual([1]);
      expect(JSON.parse(h.readRaw()).errors).toStrictEqual([
        { type: "SIGTERM", cause: "kill" },
      ]);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("double arm: second armKillCapture adds no listener, single fire single-fires", async () => {
    const h = mkHarness({});
    try {
      h.emitter.armKillCapture();
      h.emitter.armKillCapture();
      expect(h.signals.count()).toBe(1);
      await h.signals.fire();
      await pump(15);
      expect(h.signals.invocations).toEqual(["h0"]);
      expect(h.exitCalls).toEqual([1]);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });
});

describe("SIGTERM ordering and settlement (seam rows)", () => {
  it("entry-side armed second runs FIRST at dispatch: its effects land before the simulated pi handler's marker", async () => {
    const h = mkHarness({ tokens: () => 3 });
    try {
      // Shared timeline of observable effects, in landing order.
      const markers: string[] = [];
      let releasePi: (() => void) | undefined;
      const piGate = new Promise<void>((resolve) => {
        releasePi = resolve;
      });
      // Simulated InteractiveMode handler: registered FIRST during TUI
      // bring-up; its terminal effect marker is gated so entry effects can be
      // observed landing strictly before it.
      const piHandler = async (): Promise<void> => {
        await piGate;
        markers.push("pi:effect");
      };
      h.signals.target.prependListener("SIGTERM", piHandler);
      // Entry-side arming happens AFTER registration (prepend => index 0).
      h.emitter.armKillCapture();
      expect(h.signals.count()).toBe(2);

      const firing = h.signals.fire();
      // The kill chain is claimed + in flight; delegate to observe completion.
      const delegated = h.emitter.emit({ ok: true, outputs: {} });
      const winner = await delegated;
      markers.push("entry:record-written+exit(1)");

      // Dispatch order: last-prepended (entry) invoked strictly before the
      // earlier-registered simulated pi handler.
      expect(h.signals.invocations).toEqual(["h1", "h0"]);
      expect(winner.status.ok).toBe(false);
      expect(JSON.parse(h.readRaw()).errors).toStrictEqual([
        { type: "SIGTERM", cause: "kill" },
      ]);
      expect(h.exitCalls).toEqual([1]);
      // Pi's marker has NOT landed yet — entry effects came first.
      expect(markers).toEqual(["entry:record-written+exit(1)"]);
      releasePi?.();
      await firing;
      expect(markers).toEqual(["entry:record-written+exit(1)", "pi:effect"]);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("settle timeout: overrun swallowed, capture proceeds AS-IS with pre-settle values", async () => {
    let mutated = false;
    const neverSettles = new Promise<void>(() => {}); // hangs forever
    const holdTokens = 111;
    const postTokens = 999;
    const h = mkHarness({
      graceMs: 5,
      settleLiveRun: async (): Promise<void> => {
        mutated = true; // world mutates during the grace window
        await neverSettles;
      },
      tokens: () => (mutated ? postTokens : holdTokens),
    });
    try {
      h.emitter.armKillCapture();
      const firing = h.signals.fire();
      const winner = await h.emitter.emit({ ok: true, outputs: {} });
      await firing;
      // PRE-SETTLE snapshot wins over the post-grace world state.
      expect(mutated).toBe(true);
      expect(winner.status.tokens).toBe(holdTokens);
      expect(winner.status.transcriptRef).toBe(
        ".sessions/top/20260101T000000Z_deadbeefcafe.jsonl",
      );
      expect(winner.exitCode).toBe(1);
      expect(h.exitCalls).toEqual([1]);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("settle fault: rejection swallowed, capture completes identically", async () => {
    const h = mkHarness({
      tokens: () => 42,
      settleLiveRun: (): Promise<void> =>
        Promise.reject(new Error("settlement exploded")),
    });
    try {
      h.emitter.armKillCapture();
      const firing = h.signals.fire();
      const winner = await h.emitter.emit({ ok: true, outputs: {} });
      await firing;
      expect(winner.status.ok).toBe(false);
      expect(winner.status.errors).toStrictEqual([
        { type: "SIGTERM", cause: "kill" },
      ]);
      expect(winner.status.tokens).toBe(42);
      expect(winner.exitCode).toBe(1);
      expect(h.exitCalls).toEqual([1]);
      expect(JSON.parse(h.readRaw()).ok).toBe(false);
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  it("settle fast: settlement may influence the world, never the record (pre-settle snapshot pin)", async () => {
    const root = mkdtempSync(join(os.tmpdir(), "status-test-"));
    try {
      const sessionsRoot = join(root, ".sessions");
      const preFile = join(
        sessionsRoot,
        "top",
        "20260101T000000Z_deadbeefcafe.jsonl",
      );
      const postFile = join(sessionsRoot, "top", "later_named.jsonl");
      let flipped = false;
      const exitCalls: number[] = [];
      const signals = makeFakeSignals();
      const emitter = createStatusEmitter({
        sessionsRoot,
        capability: { name: "demo", version: "0.1.0" },
        tokens: (): number => (flipped ? 888 : 123),
        sessionFile: (): string => (flipped ? postFile : preFile),
        exit: (code: number) => {
          exitCalls.push(code);
        },
        signals: signals.target,
        // Settles quickly AFTER mutating both accessors' world.
        settleLiveRun: async (): Promise<void> => {
          flipped = true;
        },
      });
      emitter.armKillCapture();
      const firing = signals.fire();
      const winner = await emitter.emit({ ok: true, outputs: {} });
      await firing;
      expect(flipped).toBe(true);
      // Record carries the PRE-SETTLE snapshot on both fields.
      expect(winner.status.tokens).toBe(123);
      expect(winner.status.transcriptRef).toBe(
        ".sessions/top/20260101T000000Z_deadbeefcafe.jsonl",
      );
      expect(exitCalls).toEqual([1]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("no settle hook: immediate as-is capture with exit(1) exactly once", async () => {
    const h = mkHarness({ tokens: () => 9 });
    try {
      h.emitter.armKillCapture();
      const firing = h.signals.fire();
      const winner = await h.emitter.emit({ ok: true, outputs: {} });
      await firing;
      expect(winner.status.ok).toBe(false);
      expect(winner.status.tokens).toBe(9);
      expect(winner.exitCode).toBe(1);
      expect(h.exitCalls).toEqual([1]);
      expect(JSON.parse(h.readRaw()).outputs).toStrictEqual({});
    } finally {
      rmSync(h.root, { recursive: true, force: true });
    }
  });
});
