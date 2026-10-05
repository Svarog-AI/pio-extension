// Hermetic island suite for the fenced bash instance of the command write
// fence (landlock-bash.ts). Self-contained island per the standing ruling:
// own fixtures, own scanner, own needles typed locally; NO cross-suite
// imports; zero SDK value reach in this file (the two-export split exists
// so the driver needs none); no network; disk access LIMITED to new URL
// source reads of the module's own source. Behavioral rows drive the ops
// primitive DIRECTLY over plain values through injected seams (fake
// spawner carrying scripted EventEmitter-derived children, fake statMode,
// fake shell-config resolution) - seam-driven receipt arithmetic pins the
// spawn-site posture. Sanctioned cross-module VALUE dependencies, confined
// to integration-edge rows and named per group: the sibling ruleset
// producers (refusal/framing goldens + the resolver, frozen single owners)
// and the shared byte family constant. Plain-value comparisons throughout.
// Wall-clock discipline: real timers only (short seconds-class timeouts,
// grace windows left to elapse naturally); NO fake timers; hangs fail
// loudly under the runner's own timeout guard.

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { CapabilitySources } from "../../capability/guards/guard-vocabulary.ts";
import { UNIVERSAL_NO_PERMISSION_DENIAL } from "../../denial-vocabulary.ts";
import type { AnchorChannels } from "../../session-execution-state.ts";
import { SessionExecutionState } from "../../session-execution-state.ts";
import type {
  ChildHandle,
  LandlockBashSeams,
  LandlockSpawnOptions,
} from "./landlock-bash.ts";
import * as landlockBashModule from "./landlock-bash.ts";
import {
  createLandlockBash,
  createLandlockBashOperations,
} from "./landlock-bash.ts";
import {
  renderCommandLandlockDenial,
  renderMechanismRefusal,
  resolveLandlockHelperPath,
} from "./landlock-ruleset.ts";

// ---------------------------------------------------------------------------
// Own hermetic fixtures - plain structural literals mirroring the shared
// fixture roots for downstream comparability.
// ---------------------------------------------------------------------------

const SLOT_ROOT = "/state/projects/proj-x";
const WORKSPACE_CWD = "/workspace/proj-x";
/** Guaranteed-existing anchor for the op-level cwd parameter: the temp-dir
 * root resolves F_OK on every POSIX host WITHOUT any disk mutation by this
 * suite (the disk-access limit stands; existence alone is consulted). */
const EXEC_CWD = os.tmpdir();
/** Guaranteed-absent literal for the cwd-missing parity row. */
const MISSING_CWD = "/nonexistent/workspace/proj-x";

/** The standing research-shaped sources (the default span fixture). */
const RESEARCH: CapabilitySources = {
  name: "research",
  writes: ["research/*.md"],
  allowProjectWrites: true,
};
/** Covered concrete declaration under the research slot (the phase fixture). */
const KEPT_A = `${SLOT_ROOT}/research/a.md`;

/** Package root - one level above src/tools/bash -> src/tools -> src ->
 * package root (mirrors the constants leaf's derivation; the suite-local
 * derivation keeps the sanctioned edge inside the ruleset producer). */
const PKG_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
/** The conventional carrier path the subject's own resolver yields over the
 * REAL package root + host arch - self-consistent on any mapped host. Null
 * ONLY on exotic unmapped hosts; the suite targets the provisioned host
 * class, and the assertion below documents that premise LOUDLY rather than
 * degrading the goldens silently (degraded goldens would fail every
 * dependent row conspicuously, never pass falsely). */
const CARRIER_PATH = resolveLandlockHelperPath(process.arch, PKG_ROOT);
const CARRIER: string = CARRIER_PATH!;

/** Measured shell-config shape on this host class (argv transport; the seam
 * default's pinned stand-in for deterministic rows). */
const MEASURED_SHELL: Readonly<{ shell: string; args: string[] }> = {
  shell: "/bin/bash",
  args: ["-c"],
};

const PROBE_OK_LINE = "landlock-helper probe abi=8 pin=8 status=ok\n";
const DENY_SNIPPET = "Permission denied";

// ---------------------------------------------------------------------------
// Fake child machinery - EventEmitter-derived structural fakes (bidirectional
// conformance by method-parameter bivariance; zero casts at either boundary).
// ---------------------------------------------------------------------------

interface DataAction {
  at: number;
  kind: "data";
  stream: "stdout" | "stderr";
  chunk: Buffer;
}
interface ExitAction {
  at: number;
  kind: "exit";
  code: number | null;
  signal?: NodeJS.Signals;
  /** Model a descendant holding the pipe open past exit (no end events). */
  holdPipes?: boolean;
}
interface CloseAction {
  at: number;
  kind: "close";
  code: number | null;
}
interface ErrorAction {
  at: number;
  kind: "error";
  err: Error;
}
type ChildAction = DataAction | ExitAction | CloseAction | ErrorAction;

class FakeStream extends EventEmitter {
  destroyCalls = 0;
  destroy(): void {
    this.destroyCalls += 1;
  }
}
class FakeStdin extends EventEmitter {
  ended: string[] = [];
  end(data: string): void {
    this.ended.push(data);
  }
}
let PID_COUNTER = 1;
class FakeChild extends EventEmitter {
  readonly pid: number;
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  readonly stdin: FakeStdin | null;
  private actions: ChildAction[];
  constructor(withStdin: boolean, actions: ChildAction[]) {
    super();
    this.pid = PID_COUNTER++;
    this.stdin = withStdin ? new FakeStdin() : null;
    this.actions = actions;
  }
  scheduleRun(): void {
    setTimeout(() => {
      for (const action of this.actions) {
        setTimeout(() => this.apply(action), action.at);
      }
    }, 0);
  }
  private apply(action: ChildAction): void {
    switch (action.kind) {
      case "data": {
        const target = action.stream === "stdout" ? this.stdout : this.stderr;
        target.emit("data", action.chunk);
        break;
      }
      case "exit": {
        this.emit("exit", action.code, action.signal ?? null);
        if (!action.holdPipes) {
          this.stdout.emit("end");
          this.stderr.emit("end");
        }
        break;
      }
      case "close": {
        this.emit("close", action.code, null);
        break;
      }
      case "error": {
        this.emit("error", action.err);
        break;
      }
    }
  }
}

interface SpawnReceipt {
  command: string;
  args: string[];
  options: LandlockSpawnOptions;
}
interface Harness {
  ops: ReturnType<typeof createLandlockBashOperations>;
  receipts: SpawnReceipt[];
  /** Children handed out by the spawner, in spawn order (probe first). */
  children: ChildHandle[];
  ledgerEvents: string[];
}

/** Standard probe-pass preamble script (the fast-path gate succeeds). */
function probePassActions(): ChildAction[] {
  return [
    {
      at: 0,
      kind: "data",
      stream: "stdout",
      chunk: Buffer.from(PROBE_OK_LINE),
    },
    { at: 0, kind: "exit", code: 0 },
  ];
}

/** One harness over one real state record: fake spawner (receipt log +
 * scripted children queue), recording pid-ledger sink, plus optional extra
 * seams (statMode / shell resolution). The spawner throws LOUDLY beyond the
 * scripted queue - receipt arithmetic failures surface immediately. */
function makeHarness(
  state: SessionExecutionState,
  childrenQueue: Array<{ stdin: boolean; actions: ChildAction[] }>,
  extras?: Partial<Omit<LandlockBashSeams, "spawner" | "pidLedger">> & {
    throwOnProbe?: boolean;
  },
): Harness {
  const receipts: SpawnReceipt[] = [];
  const children: ChildHandle[] = [];
  const queue = [...childrenQueue];
  const ledgerEvents: string[] = [];
  const spawner = (
    command: string,
    args: readonly string[],
    options: LandlockSpawnOptions,
  ): ChildHandle => {
    const spec = queue.shift();
    receipts.push({ command, args: [...args], options });
    if (extras?.throwOnProbe && receipts.length === 1) {
      throw new Error("spawner-sync-fault-simulated");
    }
    if (spec === undefined) {
      throw new Error(
        `unscripted spawn ${receipts.length}: ${command} ${args.join(" ")}`,
      );
    }
    const child = new FakeChild(spec.stdin, spec.actions);
    children.push(child);
    child.scheduleRun();
    return child;
  };
  const seams: LandlockBashSeams = {
    spawner,
    pidLedger: {
      add: (p: number) => {
        ledgerEvents.push(`add:${p}`);
      },
      remove: (p: number) => {
        ledgerEvents.push(`remove:${p}`);
      },
    },
    ...(extras?.statMode !== undefined ? { statMode: extras.statMode } : {}),
    ...(extras?.resolveShellConfig !== undefined
      ? { resolveShellConfig: extras.resolveShellConfig }
      : {}),
  };
  const ops = createLandlockBashOperations(WORKSPACE_CWD, state, seams);
  return { ops, receipts, children, ledgerEvents };
}

/** Fresh lifecycle-free state over the standard literal anchors. */
function freshState(
  overrides?: Partial<AnchorChannels>,
): SessionExecutionState {
  const channels: AnchorChannels = {
    projectSlotRoot: () => SLOT_ROOT,
    workspaceCwd: () => WORKSPACE_CWD,
    ...overrides,
  };
  return new SessionExecutionState(channels);
}

/** Drive one exec to settlement: resolve OR reject, returning the outcome. */
async function settle<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Rejecting-op assertion helper: message bytes (structural read via a
 * local type predicate - no casts). */
interface MessageCarrier {
  message: string;
}
const isMessageCarrier = (value: unknown): value is MessageCarrier =>
  typeof value === "object" && value !== null && "message" in value;

function errorMessage(value: unknown): string {
  return isMessageCarrier(value) ? value.message : String(value);
}

function expectRefusal(
  outcome: { ok: boolean; error?: unknown },
  expectedMessage: string,
): void {
  expect(outcome.ok).toBe(false);
  const error = outcome.error;
  expect(error, "expected a rejection").toBeDefined();
  expect(isMessageCarrier(error)).toBe(true);
  if (isMessageCarrier(error)) {
    expect(error.message).toBe(expectedMessage);
  }
}

/** Rejection-reason accessor over the settled union (structural read - the
 * discriminant-checked access keeps the union total without assertions). */
function refusalErrorOf(outcome: { ok: boolean; error?: unknown }): unknown {
  return outcome.error;
}

/** onData recorder: raw Buffers in arrival order. */
function dataRecorder(): { calls: Buffer[]; onData: (b: Buffer) => void } {
  const calls: Buffer[] = [];
  return {
    calls,
    onData: (b: Buffer) => {
      calls.push(b);
    },
  };
}

// ===========================================================================
// A. Factory-identity pins (identity by construction - field-level only)
// ===========================================================================

describe("A. factory-identity pins over createLandlockBash", () => {
  it("returns a definition whose name and label are exactly 'bash'", () => {
    const def = createLandlockBash(EXEC_CWD, freshState());
    expect(def.name).toBe("bash");
    expect(def.label).toBe("bash");
  });

  it("carries the measured description head, the contribution prompt snippet, and the execute + transcript-renderer functions", () => {
    const def = createLandlockBash(EXEC_CWD, freshState());
    expect(typeof def.description).toBe("string");
    expect(def.description.startsWith("Execute a bash command")).toBe(true);
    expect(def.promptSnippet).toBe(
      "Execute bash commands (ls, grep, find, etc.)",
    );
    expect(typeof def.execute).toBe("function");
    expect(typeof def.renderCall).toBe("function");
    expect(typeof def.renderResult).toBe("function");
  });

  it("parameters introspect to properties ['command','timeout'] with required EXACTLY ['command'] (TypeBox structural read - no SDK import)", () => {
    interface SchemaView {
      properties?: Record<string, unknown>;
      required?: string[];
    }
    // Local type predicate (not a cast): JSON round-trip strips the schema
    // class instances to plain data for structural reads.
    const isSchemaView = (value: unknown): value is SchemaView =>
      typeof value === "object" && value !== null;
    const def = createLandlockBash(EXEC_CWD, freshState());
    const probe: unknown = JSON.parse(JSON.stringify(def.parameters));
    if (!isSchemaView(probe)) {
      throw new Error("schema introspection: unexpected non-object shape");
    }
    expect(Object.keys(probe.properties ?? {})).toEqual(["command", "timeout"]);
    expect(probe.required).toEqual(["command"]);
  });

  it("a second instance over the same inputs is a DISTINCT object (fresh factory instantiation per creation)", () => {
    const state = freshState();
    const a = createLandlockBash(EXEC_CWD, state);
    const b = createLandlockBash(EXEC_CWD, state);
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
    expect(a.description).toBe(b.description);
  });
});

// ===========================================================================
// B. Pre-spawn fault truth table (typed refusals pre-child; receipt arithmetic)
// ===========================================================================

describe("B. pre-spawn fault truth table", () => {
  const readyStat = (): number => 0o755;

  it("helper-absent: unreadable stat reading refuses with the path detail, ZERO spawns", async () => {
    const h = makeHarness(freshState(), [], { statMode: () => undefined });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("helper-absent", { helperPath: CARRIER }),
    );
    expect(h.receipts).toHaveLength(0);
  });

  it("helper-not-executable: mode 0o644 refuses with the path detail, ZERO spawns", async () => {
    const h = makeHarness(freshState(), [], { statMode: () => 0o644 });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("helper-not-executable", { helperPath: CARRIER }),
    );
    expect(h.receipts).toHaveLength(0);
  });

  it("helper-unmapped-arch: exotic process.arch (stubbed, restored in finally) refuses with the arch detail and ZERO spawner receipts - the refusal precedes even the probe", async () => {
    const originalArch = process.arch;
    Object.defineProperty(process, "arch", {
      value: "riscv64",
      configurable: true,
    });
    try {
      const h = makeHarness(freshState(), [], { statMode: readyStat });
      const outcome = await settle(
        h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
      );
      expectRefusal(
        outcome,
        renderMechanismRefusal("helper-unmapped-arch", { arch: "riscv64" }),
      );
      expect(h.receipts).toHaveLength(0);
    } finally {
      Object.defineProperty(process, "arch", {
        value: originalArch,
        configurable: true,
      });
    }
  });

  it("probe-refused: parsed status=fail line with abi=7 pin=8 exiting 101 refuses with the discovered/pinned details riding; exactly ONE probe spawn", async () => {
    const h = makeHarness(
      freshState(),
      [
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from(
                "landlock-helper probe abi=7 pin=8 status=fail\n",
              ),
            },
            { at: 0, kind: "exit", code: 101 },
          ],
        },
      ],
      { statMode: readyStat },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-refused", {
        discoveredAbi: 7,
        pinnedAbi: 8,
      }),
    );
    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0].command).toBe(CARRIER);
    expect(h.receipts[0].args).toEqual(["--probe"]);
    expect(h.receipts[0].options.stdio).toEqual(["ignore", "pipe", "ignore"]);
  });

  it("probe-abnormal (garbage stdout + exit 1): unparseable line refuses abnormal with the output riding; exactly ONE probe spawn", async () => {
    const h = makeHarness(
      freshState(),
      [
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from("not-a-report\n"),
            },
            { at: 0, kind: "exit", code: 1 },
          ],
        },
      ],
      { statMode: readyStat },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: 1,
        probeOutput: "not-a-report\n",
      }),
    );
    expect(h.receipts).toHaveLength(1);
  });

  it("probe-abnormal (parsed-ok line exiting 3): exit/status mismatch refuses abnormal; exactly ONE probe spawn", async () => {
    const h = makeHarness(
      freshState(),
      [
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from(PROBE_OK_LINE),
            },
            { at: 0, kind: "exit", code: 3 },
          ],
        },
      ],
      { statMode: readyStat },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: 3,
        probeOutput: PROBE_OK_LINE,
      }),
    );
    expect(h.receipts).toHaveLength(1);
  });

  it("probe-abnormal (null exit - abnormal death): the exit=n/a placeholder renders and the empty-output placeholder rides; exactly ONE probe spawn", async () => {
    const h = makeHarness(
      freshState(),
      [
        {
          stdin: false,
          actions: [{ at: 0, kind: "exit", code: null, signal: "SIGKILL" }],
        },
      ],
      { statMode: readyStat },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    const expected = renderMechanismRefusal("probe-abnormal", {
      probeExit: null,
      probeOutput: "",
    });
    expectRefusal(outcome, expected);
    expect(expected).toContain("exit=n/a");
    expect(h.receipts).toHaveLength(1);
  });

  it("probe-abnormal (spawner sync throw): the fork fault conservatively refuses abnormal; the attempt is logged, NO child ever existed", async () => {
    const h = makeHarness(freshState(), [{ stdin: false, actions: [] }], {
      statMode: readyStat,
      throwOnProbe: true,
    });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: null,
        probeOutput: "",
      }),
    );
    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0].args).toEqual(["--probe"]);
  });

  it("probe-abnormal (child error event - TOCTOU drift between classify and probe): the spawn fault conservatively refuses abnormal; exactly ONE probe spawn", async () => {
    const h = makeHarness(
      freshState(),
      [
        {
          stdin: false,
          actions: [
            { at: 0, kind: "error", err: new Error("ENOENT-simulated") },
            { at: 0, kind: "close", code: null },
          ],
        },
      ],
      { statMode: readyStat },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: null,
        probeOutput: "",
      }),
    );
    expect(h.receipts).toHaveLength(1);
  });

  it("malformed-spec (relative sh fallback - the SDK last-resort form measured on hosts without /bin/bash): the assembler's non-absolute-shell corner refuses pre-child; exactly ONE probe receipt", async () => {
    const h = makeHarness(
      freshState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        statMode: readyStat,
        resolveShellConfig: () => ({ shell: "sh", args: ["-c"] }),
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0].args).toEqual(["--probe"]);
  });

  it("malformed-spec (empty shell string): the assembler's empty-shell corner refuses pre-child; exactly ONE probe receipt", async () => {
    const h = makeHarness(
      freshState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        statMode: readyStat,
        resolveShellConfig: () => ({ shell: "", args: ["-c"] }),
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
  });

  it("malformed-spec (relative workspaceCwd anchor with agreed dual project flags): the non-absolute-writable-entry corner beats shell checks (set violations first); exactly ONE probe receipt", async () => {
    const state = freshState({ workspaceCwd: () => "workspace/rel-anchor" });
    state.enterCapability(RESEARCH);
    state.attachPhase("impl", [], true, false);
    const h = makeHarness(
      state,
      [{ stdin: false, actions: probePassActions() }],
      {
        statMode: readyStat,
        resolveShellConfig: () => ({ ...MEASURED_SHELL }),
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
    // Source-charter note: the fourth invalid corner (empty-writable-set) is
    // UNREACHABLE by construction behind the /dev-always composition minimum
    // - defensive in the total assembler, not row-driven here.
  });

  it("snapshot() fault: the state module's first-fault-escapes doctrine - the channel error escapes VERBATIM as the op rejection, ZERO spawns", async () => {
    class LocalChannelFault extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ExecutionStateError";
      }
    }
    const state = freshState({
      projectSlotRoot: () => {
        throw new LocalChannelFault(
          "execution state: local channel fault (re-typed)",
        );
      },
    });
    const h = makeHarness(state, [], { statMode: readyStat });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(false);
    const error = outcome.ok === false ? outcome.error : undefined;
    expect(error).toBeInstanceOf(LocalChannelFault);
    if (error instanceof LocalChannelFault) {
      expect(error.name).toBe("ExecutionStateError");
      expect(error.message).toBe(
        "execution state: local channel fault (re-typed)",
      );
    }
    expect(h.receipts).toHaveLength(0);
  });

  it("pre-abort: an already-aborted signal rejects with the aborted bytes BEFORE any work - ZERO spawns", async () => {
    const controller = new AbortController();
    controller.abort();
    const h = makeHarness(freshState(), [], { statMode: readyStat });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, {
        onData: () => undefined,
        signal: controller.signal,
      }),
    );
    expectRefusal(outcome, "aborted");
    expect(h.receipts).toHaveLength(0);
  });

  it("invalid timeout (non-finite / non-positive): the first mirrored byte shape rejects, ZERO spawns", async () => {
    const h = makeHarness(freshState(), [], { statMode: readyStat });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, {
        onData: () => undefined,
        timeout: Number.NaN,
      }),
    );
    expectRefusal(
      outcome,
      "Invalid timeout: must be a finite number of seconds",
    );
    expect(h.receipts).toHaveLength(0);
  });

  it("invalid timeout (above the int32 millisecond ceiling): the second mirrored byte shape rejects, ZERO spawns", async () => {
    const h = makeHarness(freshState(), [], { statMode: readyStat });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, {
        onData: () => undefined,
        timeout: 1_000_000_000,
      }),
    );
    expectRefusal(outcome, "Invalid timeout: maximum is 2147483.647 seconds");
    expect(h.receipts).toHaveLength(0);
  });

  it("cwd missing: the two-line parity byte shape with the interpolated cwd rejects, ZERO spawns - the check precedes the fence block", async () => {
    const h = makeHarness(freshState(), [], { statMode: readyStat });
    const outcome = await settle(
      h.ops.exec("echo hi", MISSING_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      `Working directory does not exist: ${MISSING_CWD}\nCannot execute bash commands.`,
    );
    expect(h.receipts).toHaveLength(0);
  });
});

// ===========================================================================
// C. Post-spawn settlement - the band table + exit semantics
// ===========================================================================

describe("C. post-spawn settlement over the uniform band rule", () => {
  const ready = { statMode: () => 0o755 } as const;

  const runReal = async (
    actions: ChildAction[],
    options: {
      timeout?: number;
      env?: NodeJS.ProcessEnv;
      signal?: AbortSignal;
    } = {},
  ) => {
    const h = makeHarness(
      freshState(),
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const rec = dataRecorder();
    const outcome = await settle(
      h.ops.exec("the-command", EXEC_CWD, { onData: rec.onData, ...options }),
    );
    // Two spawn receipts: probe then real; the real argv carries the composed
    // vector (depth-0 window -> ["/dev"]) with the -- separator and the
    // command LAST under argv transport.
    expect(h.receipts).toHaveLength(2);
    expect(h.receipts[0].args).toEqual(["--probe"]);
    expect(h.receipts[1].command).toBe(CARRIER);
    expect(h.receipts[1].args).toEqual([
      "--write",
      "/dev",
      "--",
      MEASURED_SHELL.shell,
      ...MEASURED_SHELL.args,
      "the-command",
    ]);
    return { h, outcome, rec };
  };

  it("exit 0 resolves { exitCode: 0 } with the data channel raw-only", async () => {
    const { outcome, rec } = await runReal([
      { at: 0, kind: "data", stream: "stdout", chunk: Buffer.from("plain\n") },
      { at: 0, kind: "exit", code: 0 },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
    expect(rec.calls).toHaveLength(1);
  });

  it("exit 1 without marker resolves { exitCode: 1 } plainly (markerless mute corner - the kernel denial is the guarantee; the line is annotation)", async () => {
    const { outcome, rec } = await runReal([
      {
        at: 0,
        kind: "data",
        stream: "stdout",
        chunk: Buffer.from("just failing\n"),
      },
      { at: 0, kind: "exit", code: 1 },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 1 });
    expect(rec.calls).toHaveLength(1);
  });

  for (const [code, fault] of [
    [100, "malformed-spec"],
    [101, "abi-missing-or-blocked"],
    [102, "add-rule-failure"],
    [103, "restrict-self-failure"],
    [104, "execve-failure"],
  ] as Array<[number, Parameters<typeof renderMechanismRefusal>[0]]>) {
    it(`exit ${code} (assigned fault class '${fault}'): the uniform band rule refuses with the class-specific line whether carrier-fault or coincidental command exit - the reading is OPAQUE to the spawner; exactly TWO spawns`, async () => {
      const { outcome } = await runReal([{ at: 0, kind: "exit", code }]);
      expectRefusal(outcome, renderMechanismRefusal(fault, { exitCode: code }));
    });
  }

  for (const code of [105, 199]) {
    it(`exit ${code} (reserved band): the band-reserved line interpolates the code AND carries the enforcement-active clause; exactly TWO spawns`, async () => {
      const { outcome } = await runReal([{ at: 0, kind: "exit", code }]);
      const expected = renderMechanismRefusal("band-reserved", {
        exitCode: code,
      });
      expectRefusal(outcome, expected);
      expect(expected).toContain(`code ${code}`);
      expect(expected).toContain("enforcement was active throughout");
    });
  }

  for (const code of [200, 999]) {
    it(`exit ${code} (out-of-band): command-exit passthrough resolves { exitCode: ${code} }; exactly TWO spawns`, async () => {
      const { outcome } = await runReal([{ at: 0, kind: "exit", code }]);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: code });
    });
  }

  it("null exit (natural SIGTERM, neither abort nor timeout flagged): resolves { exitCode: null } - killed-domain parity; the classifier never sees null by design", async () => {
    const { outcome } = await runReal([
      { at: 0, kind: "exit", code: null, signal: "SIGTERM" },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: null });
  });
});

// ===========================================================================
// D. Attribution fire/mute matrix (framing + channel mechanics over real state)
// ===========================================================================

describe("D. attribution fire/mute matrix", () => {
  const ready = { statMode: () => 0o755 } as const;

  const runAttributed = async (
    state: SessionExecutionState,
    actions: ChildAction[],
  ) => {
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const rec = dataRecorder();
    const outcome = await settle(
      h.ops.exec("write-target", EXEC_CWD, { onData: rec.onData }),
    );
    expect(h.receipts).toHaveLength(2);
    return { h, outcome, rec, snapshot: state.snapshot() };
  };

  it("FIRE (universal shape over an untouched depth-0 state): ONE onData call carrying lead + universal line + trailing LF STRICTLY AFTER all raw chunks (channel-order receipt)", async () => {
    const { outcome, rec, snapshot } = await runAttributed(freshState(), [
      {
        at: 0,
        kind: "data",
        stream: "stderr",
        chunk: Buffer.from(`rm: cannot remove '/x': ${DENY_SNIPPET}\n`),
      },
      { at: 0, kind: "exit", code: 1 },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 1 });
    expect(rec.calls).toHaveLength(2);
    const payload = rec.calls[1].toString("utf8");
    expect(payload).toBe(`${renderCommandLandlockDenial(snapshot)}\n`);
    expect(payload).toBe(`${UNIVERSAL_NO_PERMISSION_DENIAL}\n`);
  });

  it("FIRE (phase shape - governing phase with covered concrete declarations): the appended line names the governing layer + writable-set listing exactly as the frozen renderer computes for the SAME window", async () => {
    const state = freshState();
    state.enterCapability(RESEARCH);
    state.attachPhase("impl", [KEPT_A], false, false);
    const { outcome, rec, snapshot } = await runAttributed(state, [
      {
        at: 0,
        kind: "data",
        stream: "stderr",
        chunk: Buffer.from(`cp: ${DENY_SNIPPET}\n`),
      },
      { at: 0, kind: "exit", code: 1 },
    ]);
    expect(outcome.ok).toBe(true);
    expect(rec.calls).toHaveLength(2);
    const expectedLine = renderCommandLandlockDenial(snapshot);
    expect(rec.calls[1].toString("utf8")).toBe(`${expectedLine}\n`);
    expect(expectedLine).toContain("during phase 'impl'");
    expect(expectedLine).toContain(KEPT_A);
    expect(expectedLine).not.toBe(UNIVERSAL_NO_PERMISSION_DENIAL);
  });

  it("framing variant (tail ends in LF): NO leading LF - payload is the bare line + trailing LF", async () => {
    const { rec } = await runAttributed(freshState(), [
      {
        at: 0,
        kind: "data",
        stream: "stderr",
        chunk: Buffer.from(`${DENY_SNIPPET}\n`),
      },
      { at: 0, kind: "exit", code: 2 },
    ]);
    expect(rec.calls).toHaveLength(2);
    expect(rec.calls[1].toString("utf8")).toBe(
      `${UNIVERSAL_NO_PERMISSION_DENIAL}\n`,
    );
    expect(rec.calls[1].toString("utf8").startsWith("\n")).toBe(false);
  });

  it("framing variant (tail's last line PARTIAL): a LEADING LF terminates the partial line before the denial line", async () => {
    const { rec } = await runAttributed(freshState(), [
      {
        at: 0,
        kind: "data",
        stream: "stdout",
        chunk: Buffer.from("partial-line-no-newline"),
      },
      {
        at: 1,
        kind: "data",
        stream: "stderr",
        chunk: Buffer.from(`${DENY_SNIPPET}`),
      },
      { at: 1, kind: "exit", code: 2 },
    ]);
    expect(rec.calls).toHaveLength(3);
    const payload = rec.calls[2].toString("utf8");
    expect(payload).toBe(`\n${UNIVERSAL_NO_PERMISSION_DENIAL}\n`);
  });

  it("masked-exit-0 MUTE (exit 0 with a marker in the tail): zero onData additions and resolves 0 - the documented v1 silence corner (the kernel denial still holds; the annotation does not fire)", async () => {
    const { outcome, rec } = await runAttributed(freshState(), [
      {
        at: 0,
        kind: "data",
        stream: "stderr",
        chunk: Buffer.from(`tee: /off: ${DENY_SNIPPET}\n`),
      },
      { at: 0, kind: "exit", code: 0 },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
    expect(rec.calls).toHaveLength(1);
  });

  it("EVICTED-marker MUTE (marker-bearing chunk emitted deeper than the mirror-tail cap): the ring evicts it and attribution stays silent - the advisory false-negative corner", async () => {
    const fillerSize = 70_000; // exceeds the 64 KiB cap
    const { outcome, rec } = await runAttributed(freshState(), [
      {
        at: 0,
        kind: "data",
        stream: "stdout",
        chunk: Buffer.from(`${DENY_SNIPPET}\n`),
      },
      {
        at: 1,
        kind: "data",
        stream: "stdout",
        chunk: Buffer.alloc(fillerSize, 0x61),
      },
      { at: 2, kind: "exit", code: 1 },
    ]);
    expect(outcome.ok).toBe(true);
    expect(rec.calls).toHaveLength(2); // two raw chunks only - no addition
  });

  it("RETAINED-marker FIRE (large multi-chunk output with the marker line within the last cap): the cap-adjacent retention proof fires the append", async () => {
    const fillerSize = 70_000;
    const { outcome, rec } = await runAttributed(freshState(), [
      {
        at: 0,
        kind: "data",
        stream: "stdout",
        chunk: Buffer.alloc(fillerSize, 0x62),
      },
      {
        at: 1,
        kind: "data",
        stream: "stderr",
        chunk: Buffer.from(`${DENY_SNIPPET}\n`),
      },
      { at: 2, kind: "exit", code: 1 },
    ]);
    expect(outcome.ok).toBe(true);
    expect(rec.calls).toHaveLength(3);
    expect(rec.calls[2].toString("utf8")).toBe(
      `${UNIVERSAL_NO_PERMISSION_DENIAL}\n`,
    );
  });

  it("LATE-BINDING freshness (invocation 1 settles universal-shaped; enterCapability + attachPhase land BETWEEN invocations over the SAME state + SAME ops; invocation 2 settles phase-shaped - the per-invocation fresh consult over the shared record)", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stderr",
              chunk: Buffer.from(`${DENY_SNIPPET}\n`),
            },
            { at: 0, kind: "exit", code: 1 },
          ],
        },
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stderr",
              chunk: Buffer.from(`${DENY_SNIPPET}\n`),
            },
            { at: 0, kind: "exit", code: 1 },
          ],
        },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const rec1 = dataRecorder();
    const first = await settle(
      h.ops.exec("w1", EXEC_CWD, { onData: rec1.onData }),
    );
    expect(first.ok).toBe(true);
    expect(rec1.calls).toHaveLength(2);
    expect(rec1.calls[1].toString("utf8")).toBe(
      `${UNIVERSAL_NO_PERMISSION_DENIAL}\n`,
    );

    state.enterCapability(RESEARCH);
    state.attachPhase("impl", [KEPT_A], false, false);

    const rec2 = dataRecorder();
    const second = await settle(
      h.ops.exec("w2", EXEC_CWD, { onData: rec2.onData }),
    );
    expect(second.ok).toBe(true);
    expect(rec2.calls).toHaveLength(2);
    const phaseLine = renderCommandLandlockDenial(state.snapshot());
    expect(rec2.calls[1].toString("utf8")).toBe(`${phaseLine}\n`);
    expect(phaseLine).toContain("during phase 'impl'");
    expect(h.receipts).toHaveLength(4); // two probes + two real spawns
  });
});

// ===========================================================================
// E. Kill lineage + parity error contracts
// ===========================================================================

describe("E. kill lineage + parity error contracts", () => {
  const ready = { statMode: () => 0o755 } as const;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A hanging real-spawn harness: probe passes; the real child never exits
   * on its own - death arrives ONLY through the spied process.kill (the
   * modeled kernel delivery rides the fake child's death emissions).
   * Receipts assert call ARGUMENTS, not syscalls - zero real signal traffic.
   */
  const makeHanging = (state: SessionExecutionState) =>
    makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions: [] },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );

  const deliverDeath = (child: FakeChild): void => {
    child.emit("exit", null, "SIGKILL");
    child.stdout.emit("end");
    child.stderr.emit("end");
  };

  it("TIMEOUT (0.05 s over a hanging lineage): rejects with the EXACT original-se token; FIRST kill receipt is the group-form (-pid, SIGKILL); the ledger remove receipt lands in finally", async () => {
    const h = makeHanging(freshState());
    const killCalls: Array<{ pid: number; signal: string }> = [];
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      killCalls.push({ pid: pid ?? 0, signal: String(signal) });
      if (h.children[1] instanceof FakeChild) {
        deliverDeath(h.children[1]);
      }
      return true;
    });
    const rec = dataRecorder();
    const started = Date.now();
    const outcome = await settle(
      h.ops.exec("hang", EXEC_CWD, { onData: rec.onData, timeout: 0.05 }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("timeout:0.05");
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    const spawned = h.children[1];
    expect(killCalls.length).toBeGreaterThanOrEqual(1);
    expect(killCalls[0]).toEqual({
      pid: -(spawned.pid ?? 0),
      signal: "SIGKILL",
    });
    expect(h.ledgerEvents).toEqual([
      `add:${spawned.pid ?? 0}`,
      `remove:${spawned.pid ?? 0}`,
    ]);
    // no denial noise: the mirrored tail stays pristine on the kill path
    expect(rec.calls).toHaveLength(0);
  });

  it("TIMEOUT FALLBACK (group kill throws once - the individual fallback succeeds): the SECOND receipt is (pid, SIGKILL) - the fallback ladder", async () => {
    const h = makeHanging(freshState());
    let groupAttemptDone = false;
    const killCalls: Array<{ pid: number; signal: string }> = [];
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      const numericPid = pid ?? 0;
      killCalls.push({ pid: numericPid, signal: String(signal) });
      if (numericPid < 0) {
        if (!groupAttemptDone) {
          groupAttemptDone = true;
          throw new Error("EPERM-simulated-group-kill-failure");
        }
      } else if (h.children[1] instanceof FakeChild) {
        deliverDeath(h.children[1]);
      }
      return true;
    });
    const outcome = await settle(
      h.ops.exec("hang", EXEC_CWD, { onData: () => undefined, timeout: 0.05 }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("timeout:0.05");
    const spawned = h.children[1];
    expect(killCalls[0]).toEqual({
      pid: -(spawned.pid ?? 0),
      signal: "SIGKILL",
    });
    expect(killCalls[1]).toEqual({ pid: spawned.pid ?? 0, signal: "SIGKILL" });
  });

  it("ABORT-MID-RUN (controller aborts during wait over a marker-bearing tail): rejects with the aborted bytes; group-form kill receipt present; NO denial noise on the kill path", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stderr",
              chunk: Buffer.from(`${DENY_SNIPPET}\n`),
            },
          ],
        },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const controller = new AbortController();
    const killCalls: Array<{ pid: number; signal: string }> = [];
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      killCalls.push({ pid: pid ?? 0, signal: String(signal) });
      if (h.children[1] instanceof FakeChild) {
        deliverDeath(h.children[1]);
      }
      return true;
    });
    const rec = dataRecorder();
    const promise = h.ops.exec("hang", EXEC_CWD, {
      onData: rec.onData,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 15);
    const outcome = await settle(promise);
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("aborted");
    const spawned = h.children[1];
    expect(killCalls[0]).toEqual({
      pid: -(spawned.pid ?? 0),
      signal: "SIGKILL",
    });
    // primary channel intact (the raw marker chunk forwarded) but NO appended
    // denial payload - kill paths carry no denial noise by construction
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].toString("utf8")).toBe(`${DENY_SNIPPET}\n`);
  });

  it("ABORT-PRIORITY (the timeout fires FIRST - timedOut latches - and an abort lands before settlement): the aborted bytes win - the pinned post-wait priority order over BOTH flags set; EXACTLY two group-form kill receipts (abort kill + timeout kill)", async () => {
    const h = makeHanging(freshState());
    const controller = new AbortController();
    const killCalls: Array<{ pid: number; signal: string }> = [];
    // The spy records but delivers NO death automatically - death arrives
    // manually AFTER both the abort kill and the timeout kill have landed,
    // so the post-wait check observes BOTH signal.aborted and the timedOut
    // latch deterministically.
    vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
      killCalls.push({ pid: pid ?? 0, signal: String(signal) });
      return true;
    });
    const promise = h.ops.exec("hang", EXEC_CWD, {
      onData: () => undefined,
      signal: controller.signal,
      timeout: 0.06,
    });
    setTimeout(() => controller.abort(), 30);
    setTimeout(() => {
      if (h.children[1] instanceof FakeChild) {
        deliverDeath(h.children[1]);
      }
    }, 80);
    const outcome = await settle(promise);
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("aborted");
    const spawned = h.children[1];
    expect(killCalls.length).toBe(2);
    expect(killCalls[0]).toEqual({
      pid: -(spawned.pid ?? 0),
      signal: "SIGKILL",
    });
  });

  it("EXTERNAL-KILL (child exits (null, SIGTERM) without any op flag): resolves { exitCode: null } with no throw - parity over the killed domain", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [{ at: 0, kind: "exit", code: null, signal: "SIGTERM" }],
        },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const outcome = await settle(
      h.ops.exec("killed", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: null });
    expect(h.receipts).toHaveLength(2);
  });

  it("GRACE-IDLE anti-truncation (exit with held pipes; data arriving WITHIN the idle window is still forwarded, and finalization waits for the idle elapse)", async () => {
    const state = freshState();
    const lateChunk = Buffer.from("late-descendant-output\n");
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from("early\n"),
            },
            { at: 5, kind: "exit", code: 0, holdPipes: true },
            { at: 40, kind: "data", stream: "stdout", chunk: lateChunk },
          ],
        },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const rec = dataRecorder();
    const started = Date.now();
    const outcome = await settle(
      h.ops.exec("held", EXEC_CWD, { onData: rec.onData }),
    );
    const elapsed = Date.now() - started;
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
    expect(elapsed).toBeGreaterThanOrEqual(80); // waited out the idle window after the late chunk
    const texts = rec.calls.map((b) => b.toString("utf8"));
    expect(texts).toContain("early\n");
    expect(texts).toContain("late-descendant-output\n"); // anti-truncation: late data forwarded
    expect(h.receipts).toHaveLength(2);
  });

  it("GRACE-IDLE clean fast-path (both streams end at exit): immediate finalization well inside the grace window", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            {
              at: 0,
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from("fast\n"),
            },
            { at: 1, kind: "exit", code: 0 }, // default: streams end with the exit
          ],
        },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const rec = dataRecorder();
    const started = Date.now();
    const outcome = await settle(
      h.ops.exec("fast", EXEC_CWD, { onData: rec.onData }),
    );
    const elapsed = Date.now() - started;
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
    expect(elapsed).toBeLessThan(90); // no idle wait incurred
    expect(rec.calls.map((b) => b.toString("utf8"))).toEqual(["fast\n"]);
  });
});

// ===========================================================================
// F. Narrowed parity rows - the exec-primitive contract ONLY
// ===========================================================================

describe("F. narrowed parity rows over the exec-primitive contract", () => {
  const ready = { statMode: () => 0o755 } as const;

  it("ENV identity: the spawner receipt's env IS the very object handed to the op (reference identity, PI_*-looking entries untouched) for BOTH the probe and the real spawn", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin", PI_MODEL: "kept-as-is" };
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions: [{ at: 0, kind: "exit", code: 0 }] },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const outcome = await settle(
      h.ops.exec("env-check", EXEC_CWD, { onData: () => undefined, env }),
    );
    expect(outcome.ok).toBe(true);
    expect(h.receipts[0].options.env).toBe(env);
    expect(h.receipts[1].options.env).toBe(env);
    expect(env.PI_MODEL).toBe("kept-as-is");
  });

  it("CWD pass-through: the spawner receipt's cwd IS the op parameter verbatim (the factory's ctx?.cwd || constructionCwd precedence belongs to the factory - here the op mirrors the param)", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions: [{ at: 0, kind: "exit", code: 0 }] },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const outcome = await settle(
      h.ops.exec("cwd-check", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    expect(h.receipts[0].options.cwd).toBe(EXEC_CWD);
    expect(h.receipts[1].options.cwd).toBe(EXEC_CWD);
    expect(EXEC_CWD).not.toBe(WORKSPACE_CWD); // the construction cwd stays distinct
  });

  it("STREAM integrity: chunks arrive at onData in emission order, count-exact and byte-identical (same Buffer references) - the mirror tap adds NOTHING to the primary channel", async () => {
    const alpha = Buffer.from("alpha\n");
    const beta = Buffer.from("beta\n");
    const gamma = Buffer.from("gamma\n");
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            { at: 0, kind: "data", stream: "stdout", chunk: alpha },
            { at: 1, kind: "data", stream: "stdout", chunk: beta },
            { at: 2, kind: "data", stream: "stderr", chunk: gamma },
            { at: 3, kind: "exit", code: 0 },
          ],
        },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const rec = dataRecorder();
    const outcome = await settle(
      h.ops.exec("stream-check", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    expect(rec.calls).toHaveLength(3);
    expect(rec.calls[0]).toBe(alpha); // reference identity - pristine bytes
    expect(rec.calls[1]).toBe(beta);
    expect(rec.calls[2]).toBe(gamma);
  });

  it("detached receipt equals the dynamic platform expression (not a construction-time capture) and windowsHide is true for both spawns", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions: [{ at: 0, kind: "exit", code: 0 }] },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const outcome = await settle(
      h.ops.exec("flags-check", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    for (const receipt of h.receipts) {
      expect(receipt.options.detached).toBe(process.platform !== "win32");
      expect(receipt.options.windowsHide).toBe(true);
    }
  });

  it("stdio tuple over ARGV transport: ['ignore','pipe','pipe'] with the command LAST in the real argv", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions: [{ at: 0, kind: "exit", code: 0 }] },
      ],
      { ...ready, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    await settle(
      h.ops.exec("last-token", EXEC_CWD, { onData: () => undefined }),
    );
    expect(h.receipts[1].options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(h.receipts[1].args[h.receipts[1].args.length - 1]).toBe(
      "last-token",
    );
  });

  it("stdio tuple over STDIN transport: ['pipe','pipe','pipe'], the command ABSENT from argv, and stdin.end(command) carries the command VERBATIM (transport correctness inherited from the shell-config shape - the fence pipes, it never transforms)", async () => {
    const state = freshState();
    const h = makeHarness(
      state,
      [
        { stdin: false, actions: probePassActions() },
        { stdin: true, actions: [{ at: 0, kind: "exit", code: 0 }] },
      ],
      {
        ...ready,
        resolveShellConfig: () => ({
          shell: "/bin/bash",
          args: ["-s"],
          commandTransport: "stdin",
        }),
      },
    );
    const outcome = await settle(
      h.ops.exec("stdin-verbatim", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    expect(h.receipts[1].options.stdio).toEqual(["pipe", "pipe", "pipe"]);
    expect(h.receipts[1].args).toEqual([
      "--write",
      "/dev",
      "--",
      "/bin/bash",
      "-s",
    ]);
    expect(h.receipts[1].args).not.toContain("stdin-verbatim");
  });

  it("EXIT-semantics taxonomy restated at the op boundary: contract errors THROW (bad cwd), band refusals THROW (exit 104), everything else RESOLVES (0, 3, null) - one resolve-vs-throw classification across the whole contract", async () => {
    const ready2 = ready;
    // (1) contract error - bad cwd
    const h1 = makeHarness(freshState(), [], { ...ready2 });
    const c1 = await settle(
      h1.ops.exec("x", MISSING_CWD, { onData: () => undefined }),
    );
    expect(c1.ok).toBe(false);
    // (2) band refusal - exit 104
    const h2 = makeHarness(
      freshState(),
      [
        { stdin: false, actions: probePassActions() },
        { stdin: false, actions: [{ at: 0, kind: "exit", code: 104 }] },
      ],
      { ...ready2, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
    );
    const c2 = await settle(
      h2.ops.exec("x", EXEC_CWD, { onData: () => undefined }),
    );
    expect(c2.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(c2))).toContain("execve-failure");
    // (3) resolutions: 0, 3, null
    for (const code of [0, 3, null]) {
      const hn = makeHarness(
        freshState(),
        [
          { stdin: false, actions: probePassActions() },
          { stdin: false, actions: [{ at: 0, kind: "exit", code }] },
        ],
        { ...ready2, resolveShellConfig: () => ({ ...MEASURED_SHELL }) },
      );
      const cn = await settle(
        hn.ops.exec("x", EXEC_CWD, { onData: () => undefined }),
      );
      expect(cn.ok, `code ${code}`).toBe(true);
      if (cn.ok) expect(cn.value).toEqual({ exitCode: code });
    }
  });
});

// ===========================================================================
// G. Mechanical source-guard charter over the module's OWN source
// ===========================================================================

const MODULE_SOURCE = readFileSync(
  new URL("./landlock-bash.ts", import.meta.url),
  "utf8",
);

/** Compact comment/literal-aware scan (house partitionForScan idiom with a
 * comment capture) - prose comments elide into `comments`, every string/
 * template literal consumes to its close quote HONORING BACKSLASH ESCAPES
 * (raw interior recorded in `payloads`, escapes intact) and blanks in the
 * residue. Soundness rests on the ZERO-SLASH-IN-RESIDUE pin below - this
 * module ships ZERO regex literals, making the idiom safe by construction
 * (an accidental future regex breaks the row loudly - intended). */
function partitionForScan(source: string): {
  residue: string;
  payloads: string[];
  comments: string[];
} {
  const payloads: string[] = [];
  const comments: string[] = [];
  let residue = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      comments.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      comments.push(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const start = i + 1;
      i += 1;
      while (i < source.length && source[i] !== ch) {
        i += source[i] === "\\" ? 2 : 1;
      }
      const end = Math.min(i, source.length);
      payloads.push(source.slice(start, end));
      residue += `${ch}P${ch}`;
      i = end + 1;
      continue;
    }
    residue += ch;
    i += 1;
  }
  return { residue, payloads, comments };
}

const RAW_GLYPH = String.fromCharCode(0x2014);
const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");
const CAST_TOKEN = ["a", "s"].join("");
const GATE_EDGE_FRAGMENT = "write-gate";

/** Dev-process-marker needles (fragments assembled at runtime - self-match
 * proof): plan-step/goal/spec-version/owner-ruling/kickoff identifiers must
 * never leak into shipped comments. */
const DEV_PROCESS_MARKERS: string[] = [
  "\\bstep" + "\\s+\\d",
  "\\bS0" + "\\d\\b",
  "\\bD#" + "\\d",
  "\u00a7",
  "(?:TASK|PLAN)\\." + "md",
  "\\bskeleton" + "\\b",
  "\\b20" + "\\d{2}-\\d{2}-\\d{2}\\b",
];

const VALUE_EXPORT_NAMES = [
  "createLandlockBash",
  "createLandlockBashOperations",
];

const TYPE_EXPORT_NAMES = [
  "ChildEventSource",
  "ChildHandle",
  "ChildReadSide",
  "ChildWriteSide",
  "LandlockBashSeams",
  "LandlockSpawnOptions",
];

describe("G. mechanical source-guard charter over landlock-bash.ts", () => {
  it("scanner soundness pins: ZERO slash survives the elision (zero regex literals - restored explicitly), zero `as` assertion casts in the residue, NO class/enum/namespace declarations (erasable-syntax-clean, tsc-enforced with the scan as tripwire)", () => {
    const { residue } = partitionForScan(MODULE_SOURCE);
    expect(residue.includes("/"), "zero-slash-in-residue").toBe(false);
    expect(residue.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
    expect(residue.match(/\bclass\b/g)).toBeNull();
    expect(residue.match(/\benum\b/g)).toBeNull();
    expect(residue.match(/\bnamespace\b/g)).toBeNull();
  });

  it("glyph + no-new-voice-bytes discipline: zero raw U+2014 glyph ANYWHERE in the file (prose ASCII-hyphens; the product-facing line bytes belong to the sibling's renderers) and zero LOCAL string literals opening the mechanism-refusal prefix or defining a denial shape (single-owner claim adapted from the sibling's inventory)", () => {
    expect(MODULE_SOURCE.includes(RAW_GLYPH)).toBe(false);
    const { payloads } = partitionForScan(MODULE_SOURCE);
    const REFUSAL_PREFIX = ["Command execution", "refused"].join(" ");
    expect(
      payloads.some((p) => p.startsWith(REFUSAL_PREFIX)),
      "no local mechanism-refusal template",
    ).toBe(false);
    const DENIAL_FRAGMENT = ["Writing is", "refused"].join(" ");
    expect(MODULE_SOURCE.includes(DENIAL_FRAGMENT)).toBe(false);
  });

  it("runtime namespace surface pin: Object.keys sorted equals EXACTLY the TWO value exports (alphabetized)", () => {
    expect(Object.keys(landlockBashModule).sort()).toEqual(VALUE_EXPORT_NAMES);
  });

  it("declarative export names pin: the two values PLUS the six pinned type/interface names (eight declarative exports)", () => {
    const declared = [
      ...MODULE_SOURCE.matchAll(
        /^export\s+(?:interface|type|const|function)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.length).toBe(8);
    expect([...VALUE_EXPORT_NAMES, ...TYPE_EXPORT_NAMES].sort()).toEqual(
      declared.sort(),
    );
  });

  it("import partition pins (statement-aware, whitespace-normalized - Biome-wrap hazard): value partition EXACTLY the pinned five specifiers IN SOURCE ORDER with per-specifier name pins; type-only partition EXACTLY the pinned pair IN SOURCE ORDER with per-specifier name pins", () => {
    const normalized = MODULE_SOURCE.replace(/\s+/g, " ");
    const clauses = [
      ...normalized.matchAll(
        /import\s+(type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)"/g,
      ),
    ].map((match) => ({
      typeOnly: match[1] !== undefined,
      names: match[2]
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
      specifier: match[3],
    }));
    expect(
      clauses.filter((clause) => !clause.typeOnly).map((c) => c.specifier),
    ).toEqual([
      "node:child_process",
      "node:fs",
      "node:fs/promises",
      SDK_SPECIFIER,
      "./landlock-ruleset.ts",
    ]);
    expect(
      clauses.filter((clause) => clause.typeOnly).map((c) => c.specifier),
    ).toEqual([SDK_SPECIFIER, "../../session-execution-state.ts"]);
    const namesOf = (specifier: string, typeOnly: boolean): string[] => {
      const clause = clauses.find(
        (c) => c.specifier === specifier && c.typeOnly === typeOnly,
      );
      return clause === undefined ? [] : clause.names;
    };
    expect(namesOf("node:child_process", false)).toEqual(["spawn"]);
    expect(namesOf("node:fs", false)).toEqual(["constants"]);
    expect(namesOf("node:fs/promises", false)).toEqual(["access"]);
    expect(namesOf(SDK_SPECIFIER, false)).toEqual([
      "createBashToolDefinition",
      "defineTool",
      "getShellConfig",
    ]);
    expect(namesOf("./landlock-ruleset.ts", false)).toEqual([
      "buildHelperArgv",
      "checkLandlockHelper",
      "classifyLandlockExit",
      "composeKernelWritableSet",
      "PERMISSION_DENIED_MARKER",
      "parseProbeReport",
      "renderCommandLandlockDenial",
      "renderMechanismRefusal",
    ]);
    expect(namesOf(SDK_SPECIFIER, true)).toEqual([
      "BashOperations",
      "ToolDefinition",
    ]);
    expect(namesOf("../../session-execution-state.ts", true)).toEqual([
      "SessionExecutionState",
    ]);
  });

  it("edge elimination + node: purity ledger: zero write-gate occurrences (the eliminated tools-to-guards edge stays eliminated) and the module's node: specifier set is EXACTLY {node:child_process, node:fs, node:fs/promises}", () => {
    expect(MODULE_SOURCE.includes(GATE_EDGE_FRAGMENT)).toBe(false);
    const nodeSpecifiers = [
      ...new Set(
        [...MODULE_SOURCE.matchAll(/"node:[a-z_/]+"/g)].map((m) => m[0]),
      ),
    ].sort();
    expect(nodeSpecifiers).toEqual([
      '"node:child_process"',
      '"node:fs"',
      '"node:fs/promises"',
    ]);
  });

  it("no-other-package pin: the ONLY non-node/non-relative quoted import specifier occurrence in the file is the SDK one (lockfile purity)", () => {
    const foreign = [
      ...new Set(
        [...MODULE_SOURCE.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]),
      ),
    ]
      .filter((s) => !s.startsWith("node:") && !s.startsWith("."))
      .sort();
    expect(foreign).toEqual([SDK_SPECIFIER]);
  });

  it("dev-process-marker hygiene: no plan-step/goal/spec-version/owner-ruling/kickoff identifiers in shipped comments (mechanically scanned per the house pattern set)", () => {
    for (const pattern of DEV_PROCESS_MARKERS) {
      expect(
        MODULE_SOURCE.match(new RegExp(pattern, "gi")),
        `marker slipped through: ${pattern}`,
      ).toBeNull();
    }
  });
});
