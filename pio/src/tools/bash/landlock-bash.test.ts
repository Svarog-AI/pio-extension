/**
 * Colocated hermetic island suite for the fenced bash instance (WRAP DESIGN).
 *
 * The subject instantiates the SDK's public factory and REPLACES ONLY its
 * operations object with a thin adapter that (1) runs the fail-closed fence
 * block (snapshot -> classify -> compose -> throwaway --probe fork ->
 * wrapped-script serialization), then (2) DELEGATES the actual spawn to the
 * SDK's OWN exported local ops (`createLocalBashOperations` - a public root
 * export documented for exactly this interception posture). Parity machinery
 * (grace-idle wait, lineage kill, post-wait priority, stream hygiene) is the
 * SDK code running UNMODIFIED - this suite drives the ops primitive DIRECTLY
 * (the factory-level ExtensionContext wall makes execute() driving untypeable
 * cast-free) and settles post-delegation behavior over an INJECTED scripted
 * local-ops stand-in (the `localOps` seam) - no real shell ever spawns in
 * hermetic rows. Settlement appends ONE content-INDEPENDENT standing note on
 * resolved NON-ZERO out-of-band exits (trigger = exit code ALONE; the note
 * names the concrete kernel writable set the spawn rode, rendered from the
 * frozen composer - no output-content consult anywhere). Sanctioned
 * cross-MODULE value dependencies: the ./landlock-ruleset.ts producers
 * (frozen single owners of the refusal bytes and of the kernel-set composer
 * the listing goldens bind against) - confined to integration-edge rows,
 * named per group. Disk access: `new URL` source reads of the module's own
 * source ONLY. No fake timers.
 */
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  type AnchorChannels,
  SessionExecutionState,
} from "../../session-execution-state.ts";
import {
  type ChildHandle,
  createLandlockBash,
  createLandlockBashOperations,
  type LandlockBashSeams,
} from "./landlock-bash.ts";
import {
  composeKernelWritableSet,
  parseProbeReport,
  renderMechanismRefusal,
  resolveLandlockHelperPath,
} from "./landlock-ruleset.ts";

// ===========================================================================
// FIXTURES (house roots; real state driven with fixture anchor channels)
// ===========================================================================

const SLOT_ROOT = "/state/projects/proj-x";
const WORKSPACE_CWD = "/workspace/proj-x";
/** Guaranteed-existing dir for the cwd pre-check (real fs consult; no disk
 * mutation anywhere in the suite). */
const EXEC_CWD = os.tmpdir();
/** Literal guaranteed-absent path for the cwd-parity refusal row. */
const MISSING_CWD = "/nonexistent/workspace/proj-x";

const RESEARCH = {
  name: "research",
  writes: ["research/*.md"],
  allowProjectWrites: true,
} as const;
const KEPT_A = `${SLOT_ROOT}/research/a.md`;

function fixtureChannels(overrides?: {
  slotRoot?: string;
  workspaceCwd?: string;
}): AnchorChannels {
  return {
    projectSlotRoot: () => overrides?.slotRoot ?? SLOT_ROOT,
    workspaceCwd: () => overrides?.workspaceCwd ?? WORKSPACE_CWD,
  };
}

/** A REAL state over the fixture channels (lifecycle free by default). */
function fixtureState(channels?: AnchorChannels): SessionExecutionState {
  return new SessionExecutionState(channels ?? fixtureChannels());
}

// ===========================================================================
// SELF-CONSISTENT CARRIER PATH (the subject's own resolver over the REAL
// package root + host arch - self-consistent on ANY host)
// ===========================================================================

const PKG_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CARRIER_PATH = resolveLandlockHelperPath(process.arch, PKG_ROOT);
/** Documented non-null: the resolver yields the conventional prebuild path
 * for every host class (unmapped arches are exercised via the arch-stub row
 * instead). */
const CARRIER = CARRIER_PATH!;

// ===========================================================================
// FAKE CHILD + SPAWNER RECEIPTS (probe fork observation ONLY - the real
// spawn rides the delegated local ops and never touches this seam)
// ===========================================================================

interface SpawnReceipt {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: {
    readonly cwd: string;
    readonly detached: boolean;
    readonly env: NodeJS.ProcessEnv | undefined;
    readonly stdio: [string, string, string];
    readonly windowsHide: boolean;
  };
}

class FakeStream extends EventEmitter {
  destroyed = false;
  destroy(): void {
    this.destroyed = true;
  }
}

type Action =
  | { kind: "data"; stream: "stdout" | "stderr"; chunk: Buffer }
  | { kind: "exit"; code: number | null; signal?: NodeJS.Signals }
  | { kind: "error"; message: string }
  | { kind: "close"; code: number | null; signal?: NodeJS.Signals };

class FakeChild extends EventEmitter implements ChildHandle {
  readonly stdout = new FakeStream();
  readonly stderr = new FakeStream();
  private readonly assignedPid: number;
  private readonly actions: Action[];
  constructor(pidCounter: { next: number }, actions: Action[]) {
    super();
    this.assignedPid = pidCounter.next++;
    this.actions = actions;
  }
  get pid(): number | undefined {
    return this.assignedPid;
  }
  get stdin(): null {
    return null;
  }
  /** Schedule emissions on a deferred tick so listeners attach first. */
  arm(): void {
    setTimeout(() => {
      for (const action of this.actions) {
        switch (action.kind) {
          case "data": {
            const stream =
              action.stream === "stdout" ? this.stdout : this.stderr;
            stream.emit("data", action.chunk);
            break;
          }
          case "exit": {
            this.emit("exit", action.code, action.signal);
            break;
          }
          case "error": {
            this.emit("error", new Error(action.message));
            break;
          }
          case "close": {
            this.emit("close", action.code, action.signal);
            break;
          }
        }
      }
    }, 5);
  }
}

interface Harness {
  readonly ops: BashOperations;
  readonly receipts: SpawnReceipt[];
  readonly state: SessionExecutionState;
}

function makeHarness(
  state: SessionExecutionState,
  probeChildren: Array<{ stdin: boolean; actions: Action[] }>,
  seams?: {
    statMode?: (p: string) => number | undefined;
    resolveShellConfig?: () => ReturnType<
      typeof import("@earendil-works/pi-coding-agent").getShellConfig
    >;
    localOps?: BashOperations;
  },
): Harness {
  const receipts: SpawnReceipt[] = [];
  const counter = { next: 1000 };
  let index = 0;
  const landlockSeams: LandlockBashSeams = {
    ...(seams?.statMode !== undefined ? { statMode: seams.statMode } : {}),
    spawner: (command, args, options) => {
      receipts.push({
        command,
        args: [...args],
        options: {
          cwd: options.cwd,
          detached: options.detached,
          env: options.env,
          stdio: [...options.stdio] as [string, string, string],
          windowsHide: options.windowsHide,
        },
      });
      const scripted = probeChildren[Math.min(index, probeChildren.length - 1)];
      index += 1;
      const child = new FakeChild(counter, scripted.actions);
      child.arm();
      return child;
    },
    ...(seams?.resolveShellConfig !== undefined
      ? { resolveShellConfig: seams.resolveShellConfig }
      : {}),
    ...(seams?.localOps !== undefined ? { localOps: seams.localOps } : {}),
  };
  return {
    ops: createLandlockBashOperations(WORKSPACE_CWD, state, landlockSeams),
    receipts,
    state,
  };
}

/** Measured shell-config shape on this host class (argv transport; the
 * seam default's pinned stand-in for deterministic rows). */
const MEASURED_SHELL: Readonly<{ shell: string; args: string[] }> = {
  shell: "/bin/bash",
  args: ["-c"],
};

/** The standard passing-probe preamble (one throwaway fork, ok verdict). */
function probePassActions(): Action[] {
  return [
    {
      kind: "data",
      stream: "stdout",
      chunk: Buffer.from("landlock-helper probe abi=8 pin=8 status=ok\n"),
    },
    { kind: "exit", code: 0 },
  ];
}

// ===========================================================================
// SCRIPTED LOCAL-OPS STAND-IN (post-delegation settlement driver)
// ===========================================================================

interface ScriptBox {
  readonly cmd: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly signal: AbortSignal | undefined;
  readonly timeout: number | undefined;
  push(chunk: Buffer): void;
}

type ScriptOutcome =
  | { readonly exitCode: number | null }
  | { readonly reject: Error };

type ScriptFn = (box: ScriptBox) => ScriptOutcome | Promise<ScriptOutcome>;

function scriptedOps(fn: ScriptFn): {
  ops: BashOperations;
  calls: ScriptBox[];
} {
  const calls: ScriptBox[] = [];
  const ops: BashOperations = {
    async exec(command, cwd, opts) {
      const box: ScriptBox = {
        cmd: command,
        cwd,
        env: opts.env,
        signal: opts.signal,
        timeout: opts.timeout,
        push: (chunk: Buffer) => {
          opts.onData(chunk);
        },
      };
      calls.push(box);
      const settled = await Promise.resolve(fn(box));
      if ("reject" in settled) {
        throw settled.reject;
      }
      return { exitCode: settled.exitCode };
    },
  };
  return { ops, calls };
}

/** A neutral recorder local-ops (resolves 0; asserts the delegate was NOT
 * consulted on pre-child refusal rows). */
function recorderOps(): { ops: BashOperations; calls: ScriptBox[] } {
  return scriptedOps(() => ({ exitCode: 0 }));
}

// ===========================================================================
// DATA CHANNEL RECORDER (the observation surface for append/framing rows)
// ===========================================================================

function dataRecorder() {
  const chunks: Buffer[] = [];
  return {
    chunks,
    onData: (chunk: Buffer) => {
      chunks.push(chunk);
    },
  };
}

// ===========================================================================
// SETTLE + REFUSAL READERS (cast-free structural narrowing)
// ===========================================================================

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

interface MessageCarrier {
  message: string;
  name?: string;
}

function isMessageCarrier(value: unknown): value is MessageCarrier {
  return typeof value === "object" && value !== null && "message" in value;
}

function errorMessage(error: unknown): string {
  if (isMessageCarrier(error)) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function refusalErrorOf(
  outcome: Settled<{ exitCode: number | null }>,
): unknown {
  if (outcome.ok) {
    throw new Error("expected a refusal but the op resolved");
  }
  return outcome.error;
}

function expectRefusal(
  outcome: Settled<{ exitCode: number | null }>,
  expectedMessage: string,
): void {
  if (outcome.ok) {
    throw new Error(
      `expected a refusal but the op resolved with ${JSON.stringify(outcome.value)}`,
    );
  }
  const error = outcome.error;
  expect(isMessageCarrier(error)).toBe(true);
  if (isMessageCarrier(error)) {
    expect(error.message).toBe(expectedMessage);
  }
}

// ===========================================================================
// GROUP A - factory-identity pins over createLandlockBash
// ===========================================================================

describe("A. factory-identity pins over createLandlockBash", () => {
  it("returns a definition whose name and label are exactly 'bash'", () => {
    const def = createLandlockBash(WORKSPACE_CWD, fixtureState()) as {
      name?: string;
    };
    expect(def.name).toBe("bash");
  });

  it("carries the measured description head, the contribution prompt snippet, and the execute + transcript-renderer functions", () => {
    const def = createLandlockBash(WORKSPACE_CWD, fixtureState()) as {
      description?: string;
      promptSnippet?: string;
      execute?: unknown;
      renderCall?: unknown;
      renderResult?: unknown;
    };
    expect(def.description?.startsWith("Execute a bash command")).toBe(true);
    expect(def.promptSnippet).toBe(
      "Execute bash commands (ls, grep, find, etc.)",
    );
    expect(typeof def.execute).toBe("function");
    expect(typeof def.renderCall).toBe("function");
    expect(typeof def.renderResult).toBe("function");
  });

  it("parameters introspect to properties ['command','timeout'] with required EXACTLY ['command'] (TypeBox structural read - no SDK import)", () => {
    const def = createLandlockBash(WORKSPACE_CWD, fixtureState()) as {
      parameters: unknown;
    };
    interface SchemaView {
      properties?: Record<string, unknown>;
      required?: readonly string[];
    }
    function isSchemaView(v: unknown): v is SchemaView {
      return typeof v === "object" && v !== null;
    }
    expect(isSchemaView(def.parameters)).toBe(true);
    if (!isSchemaView(def.parameters)) return;
    const probe = def.parameters;
    expect(Object.keys(probe.properties ?? {}).sort()).toEqual([
      "command",
      "timeout",
    ]);
    expect([...(probe.required ?? [])].sort()).toEqual(["command"]);
  });

  it("a second instance over the same inputs is a DISTINCT object (fresh factory instantiation per creation)", () => {
    const state = fixtureState();
    const one = createLandlockBash(WORKSPACE_CWD, state);
    const two = createLandlockBash(WORKSPACE_CWD, state);
    expect(one).not.toBe(two);
  });

  it("the definition's description is byte-STABLE across instantiations over the same inputs (identity-by-construction preserved: the standing note is a runtime data-channel append - NEVER a definition-level mutation)", () => {
    const state = fixtureState();
    const one = createLandlockBash(WORKSPACE_CWD, state) as {
      description?: string;
    };
    const two = createLandlockBash(WORKSPACE_CWD, state) as {
      description?: string;
    };
    expect(one.description).toBe(two.description);
    expect(one.description?.startsWith("Execute a bash command")).toBe(true);
  });
});

// ===========================================================================
// GROUP B - pre-spawn fault truth table (ZERO delegate consults, ZERO real
// children; probe-receipt arithmetic pinned per row)
// ===========================================================================

describe("B. pre-spawn fault truth table", () => {
  it("helper-absent: unreadable stat reading refuses with the path detail, ZERO spawns and ZERO delegate consults", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], {
      statMode: () => undefined,
      localOps: rec.ops,
    });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("helper-absent", { helperPath: CARRIER }),
    );
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("helper-not-executable: mode 0o644 refuses with the path detail, ZERO spawns", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], {
      statMode: () => 0o644,
      localOps: rec.ops,
    });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("helper-not-executable", { helperPath: CARRIER }),
    );
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("helper-unmapped-arch: exotic process.arch (stubbed, restored in finally) refuses with the arch detail and ZERO spawner receipts - the refusal precedes even the probe", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], { localOps: rec.ops });
    const originalArch = process.arch;
    Object.defineProperty(process, "arch", { value: "exotic-arch-token" });
    try {
      const outcome = await settle(
        h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
      );
      expectRefusal(
        outcome,
        renderMechanismRefusal("helper-unmapped-arch", {
          arch: "exotic-arch-token",
        }),
      );
      expect(h.receipts).toHaveLength(0);
      expect(rec.calls).toHaveLength(0);
    } finally {
      Object.defineProperty(process, "arch", { value: originalArch });
    }
  });

  it("probe-refused: parsed status=fail line with abi=7 pin=8 exiting 101 refuses with the discovered/pinned details riding; exactly ONE probe spawn, ZERO delegate consults", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [
            {
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from(
                "landlock-helper probe abi=7 pin=8 status=fail\n",
              ),
            },
            { kind: "exit", code: 101 },
          ],
        },
      ],
      { localOps: rec.ops },
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
    expect(
      parseProbeReport("landlock-helper probe abi=7 pin=8 status=fail"),
    ).not.toBeNull();
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("probe-abnormal (garbage stdout + exit 1): unparseable line refuses abnormal with the output riding; exactly ONE probe spawn", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [
            {
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from("not-a-report\n"),
            },
            { kind: "exit", code: 1 },
          ],
        },
      ],
      { localOps: rec.ops },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: 1,
        probeOutput: "not-a-report",
      }),
    );
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("probe-abnormal (parsed-ok line exiting 3): exit/status mismatch refuses abnormal; exactly ONE probe spawn", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [
            {
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from(
                "landlock-helper probe abi=8 pin=8 status=ok\n",
              ),
            },
            { kind: "exit", code: 3 },
          ],
        },
      ],
      { localOps: rec.ops },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: 3,
        probeOutput: "landlock-helper probe abi=8 pin=8 status=ok",
      }),
    );
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("probe-abnormal (null exit - abnormal death): the exit=n/a placeholder renders and the empty-output placeholder rides; exactly ONE probe spawn", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [{ kind: "exit", code: null, signal: "SIGKILL" }],
        },
      ],
      { localOps: rec.ops },
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
    expect(rec.calls).toHaveLength(0);
  });

  it("probe-abnormal (spawner sync throw): the fork fault conservatively refuses abnormal; NO child ever existed, ZERO delegate consults", async () => {
    const rec = recorderOps();
    const state = fixtureState();
    const ops = createLandlockBashOperations(WORKSPACE_CWD, state, {
      spawner: () => {
        throw new Error("spawner-sync-fault-simulated");
      },
      localOps: rec.ops,
    });
    const outcome = await settle(
      ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      outcome,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: null,
        probeOutput: "",
      }),
    );
    expect(rec.calls).toHaveLength(0);
  });

  it("probe-abnormal (child error event - TOCTOU drift between classify and probe): the spawn fault conservatively refuses abnormal; exactly ONE probe spawn", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [
            { kind: "error", message: "spawn ENOENT (toctou drift)" },
            { kind: "exit", code: null, signal: "SIGSEGV" },
          ],
        },
      ],
      { localOps: rec.ops },
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
    expect(rec.calls).toHaveLength(0);
  });

  it("malformed-spec (relative sh fallback - the SDK last-resort form measured on hosts without /bin/bash): the serializer's non-absolute-shell corner refuses pre-child; exactly ONE probe receipt, ZERO delegate consults", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        resolveShellConfig: () => ({ ...MEASURED_SHELL, shell: "sh" }),
        localOps: rec.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("malformed-spec (empty shell string): the serializer's empty-shell corner refuses pre-child; exactly ONE probe receipt", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        resolveShellConfig: () => ({ ...MEASURED_SHELL, shell: "" }),
        localOps: rec.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("malformed-spec (relative workspaceCwd anchor with agreed dual project flags): the non-absolute-writable-entry corner beats shell checks; exactly ONE probe receipt", async () => {
    const rec = recorderOps();
    const state = fixtureState(
      fixtureChannels({ workspaceCwd: "relative/anchor" }),
    );
    // A span + attached phase make the composer carry the relative
    // workspace anchor into the writable vector (depth 0 is /dev-only).
    state.enterCapability(RESEARCH);
    state.attachPhase("impl", ["research/a.md"], true, false);
    const h = makeHarness(
      state,
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: rec.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("malformed-spec (stdin command transport - the legacy-WSL form, unreachable on shipped Linux): the serializer's defensive corner refuses loudly pre-child rather than degrading fidelity; exactly ONE probe receipt", async () => {
    const rec = recorderOps();
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        resolveShellConfig: () => ({
          shell: "/bin/bash",
          args: ["-s"],
          commandTransport: "stdin",
        }),
        localOps: rec.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
    expect(h.receipts).toHaveLength(1);
    expect(rec.calls).toHaveLength(0);
  });

  it("snapshot() fault: the state module's first-fault-escapes doctrine - the channel error escapes VERBATIM as the op rejection, ZERO spawns, ZERO delegate consults", async () => {
    const rec = recorderOps();
    class LocalChannelFault extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ExecutionStateError";
      }
    }
    const faultyState = fixtureState({
      projectSlotRoot: () => {
        throw new LocalChannelFault(
          "anchor channel fault: projectSlotRoot unreadable",
        );
      },
      workspaceCwd: () => WORKSPACE_CWD,
    });
    const h = makeHarness(faultyState, [], { localOps: rec.ops });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      const error = outcome.error;
      expect(error instanceof LocalChannelFault).toBe(true);
      if (error instanceof LocalChannelFault) {
        expect(error.name).toBe("ExecutionStateError");
        expect(error.message).toBe(
          "anchor channel fault: projectSlotRoot unreadable",
        );
      }
    }
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("pre-abort: an already-aborted signal rejects with the aborted bytes BEFORE any work - ZERO spawns, ZERO delegate consults", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], { localOps: rec.ops });
    const controller = new AbortController();
    controller.abort();
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, {
        onData: () => undefined,
        signal: controller.signal,
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("aborted");
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("invalid timeout (non-finite): the first mirrored byte shape rejects, ZERO spawns", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], { localOps: rec.ops });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, {
        onData: () => undefined,
        timeout: Number.NaN,
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe(
      "Invalid timeout: must be a finite number of seconds",
    );
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("invalid timeout (above the int32 millisecond ceiling): the second mirrored byte shape rejects, ZERO spawns", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], { localOps: rec.ops });
    const outcome = await settle(
      h.ops.exec("echo hi", EXEC_CWD, {
        onData: () => undefined,
        timeout: 3_000_000,
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe(
      "Invalid timeout: maximum is 2147483.647 seconds",
    );
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("cwd missing: the two-line parity byte shape with the interpolated cwd rejects, ZERO spawns - the check precedes the fence block", async () => {
    const rec = recorderOps();
    const h = makeHarness(fixtureState(), [], { localOps: rec.ops });
    const outcome = await settle(
      h.ops.exec("echo hi", MISSING_CWD, {
        onData: () => undefined,
      }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe(
      `Working directory does not exist: ${MISSING_CWD}\nCannot execute bash commands.`,
    );
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });
});

// ===========================================================================
// GROUP C - post-delegation settlement over the uniform band rule
// (each row: ONE probe spawn + the delegated call receives the wrapped
// script; settlement POST-FILTERS the delegated resolution)
// ===========================================================================

describe("C. post-delegation settlement over the uniform band rule", () => {
  async function settleRow(exitCode: number | null) {
    const fake = scriptedOps(() => ({ exitCode }));
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("true", EXEC_CWD, { onData: () => undefined }),
    );
    return { h, fake, outcome };
  }

  it("exit 0 resolves { exitCode: 0 } with the data channel raw-only (ONE probe spawn; the delegate received the wrapped script)", async () => {
    const { h, fake, outcome } = await settleRow(0);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
    expect(h.receipts).toHaveLength(1);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.cmd).toContain(CARRIER);
  });

  it("exit 1 (out-of-band non-zero) resolves { exitCode: 1 } at the op boundary (the standing note rides the data channel - group D owns its bytes, trigger, and framing; the op-boundary resolution is unchanged)", async () => {
    const { outcome } = await settleRow(1);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 1 });
  });

  const BAND_CLASSES: Array<
    [number, Parameters<typeof renderMechanismRefusal>[0]]
  > = [
    [100, "malformed-spec"],
    [101, "abi-missing-or-blocked"],
    [102, "add-rule-failure"],
    [103, "restrict-self-failure"],
    [104, "execve-failure"],
  ];

  for (const [code, klass] of BAND_CLASSES) {
    it(`exit ${code} (assigned fault class '${String(klass)}'): the uniform band rule REFUSES with the class-specific line whether carrier-fault or coincidental command exit - the reading is OPAQUE to the wrapper; ONE probe spawn + ONE delegated call`, async () => {
      const { h, fake, outcome } = await settleRow(code);
      expect(outcome.ok).toBe(false);
      expect(errorMessage(refusalErrorOf(outcome))).toBe(
        renderMechanismRefusal(klass, { exitCode: code }),
      );
      expect(h.receipts).toHaveLength(1);
      expect(fake.calls).toHaveLength(1);
    });
  }

  for (const code of [105, 199]) {
    it(`exit ${code} (reserved band): the band-reserved line interpolates the code AND carries the enforcement-active clause; ONE probe spawn + ONE delegated call`, async () => {
      const { h, fake, outcome } = await settleRow(code);
      expect(outcome.ok).toBe(false);
      const message = errorMessage(refusalErrorOf(outcome));
      expect(message).toBe(
        renderMechanismRefusal("band-reserved", { exitCode: code }),
      );
      expect(message).toContain(`code ${code}`);
      expect(message).toContain("enforcement was active throughout");
      expect(h.receipts).toHaveLength(1);
      expect(fake.calls).toHaveLength(1);
    });
  }

  for (const code of [200, 999]) {
    it(`exit ${code} (out-of-band): command-exit passthrough resolves { exitCode: ${code} }; ONE probe spawn + ONE delegated call`, async () => {
      const { outcome } = await settleRow(code);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: code });
    });
  }

  it("null exit (the delegate reports a killed domain, neither abort nor timeout flagged): resolves { exitCode: null } - parity; the classifier never sees null by design", async () => {
    const { outcome } = await settleRow(null);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: null });
  });
});

// ===========================================================================
// GROUP D - the standing-note matrix (content-INDEPENDENT settlement:
// trigger = delegated exit CODE alone; listing = the concrete kernel set the
// spawn rode, bound against the frozen composer for the SAME window;
// framing = unconditional leading + trailing LFs)
// ===========================================================================

describe("D. the standing-note matrix", () => {
  /** The re-typed template head (the module's own pinned constant is the
   * single owner; the house measured-golden pattern binds the BEHAVIOR -
   * trigger, listing source, framing, channel order - against locally
   * composed expectations). */
  const NOTE_TEMPLATE =
    "Note: a per-phase Landlock write restriction is in effect and denied writes surface as permission errors in the command's own output. Landlock may be blocking changes to certain files due to lack of permissions in the current phase. Allowed targets: ";
  const UNIVERSAL_NOTE = `${NOTE_TEMPLATE}none.`;

  /** Locally re-typed projection of the CONCRETE kernel writable set onto
   * model-facing listing elements (documented mapping contract): the
   * always-present /dev machinery allowance is absent from the grant; the
   * class additions name like the house shapes; strictly-concrete survivors
   * ride raw; COMPOSITION order preserved; the empty remainder degrades to
   * the "none" form. */
  function expectedListing(
    writable: readonly string[],
    workspaceCwd: string,
  ): string {
    const parts: string[] = [];
    for (const entry of writable) {
      if (entry === "/dev") continue;
      if (entry === "/tmp") {
        parts.push("scratch files under /tmp/");
        continue;
      }
      if (entry === workspaceCwd) {
        parts.push(`project files under ${entry}`);
        continue;
      }
      parts.push(entry);
    }
    return parts.length === 0 ? "none" : parts.join(", ");
  }

  /** The note for one window: template + the frozen composer's vector for
   * the SAME snapshot (non-circular - the golden derives from the sibling
   * materializer, the binding target is this module's append). */
  function noteForWindow(state: SessionExecutionState): string {
    const snapshot = state.snapshot();
    return `${NOTE_TEMPLATE}${expectedListing(composeKernelWritableSet(snapshot), snapshot.paths.workspaceCwd)}.`;
  }

  it("FIRE (universal 'none' listing over an untouched depth-0 state): the exit-code trigger ALONE fires ONE appended note STRICTLY AFTER all raw chunks (channel-order receipt), the listing degrades to the universal 'none' form, and the leading LF is UNCONDITIONAL (accepted blank line after cleanly-ended output)", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("working...\n"));
      box.push(Buffer.from("boom\n"));
      return { exitCode: 3 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("fails-without-denial", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 3 });
    // Channel-order receipt: raw chunks verbatim FIRST, then EXACTLY ONE
    // append (unconditional leading LF; trailing LF always).
    expect(rec.chunks).toHaveLength(3);
    expect(rec.chunks[0]!.toString("utf8")).toBe("working...\n");
    expect(rec.chunks[1]!.toString("utf8")).toBe("boom\n");
    expect(rec.chunks[2]!.toString("utf8")).toBe(`\n${UNIVERSAL_NOTE}\n`);
    expect(fake.calls).toHaveLength(1);
  });

  it("FIRE (phase-shaped listing - span + attached governing phase): the note names the CONCRETE kernel set the spawn rode, bound against the FROZEN composer output for the SAME window (integration edge, non-circular)", async () => {
    const rec = dataRecorder();
    const state = fixtureState();
    state.enterCapability(RESEARCH);
    state.attachPhase("impl", [KEPT_A], true, false);
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("attempting write...\n"));
      return { exitCode: 1 };
    });
    const h = makeHarness(
      state,
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("writes-outside-phase", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 1 });
    const payload = rec.chunks[rec.chunks.length - 1]!.toString("utf8");
    // The phase window must NOT degrade onto the depth-0 form (guards the
    // projection against silently dropping every element).
    expect(noteForWindow(state)).not.toBe(UNIVERSAL_NOTE);
    expect(payload).toBe(`\n${noteForWindow(state)}\n`);
  });

  it("LATE-BINDING freshness (invocation 1 settles the universal note; enterCapability + attachPhase land BETWEEN invocations over the SAME shared state record; invocation 2 settles the phase-shaped note - the per-invocation fresh consult survives span/phase churn)", async () => {
    const rec1 = dataRecorder();
    const rec2 = dataRecorder();
    const state = fixtureState();
    const fake1 = scriptedOps(() => ({ exitCode: 3 }));
    const fake2 = scriptedOps(() => ({ exitCode: 3 }));
    const ops1 = createLandlockBashOperations(WORKSPACE_CWD, state, {
      localOps: fake1.ops,
    });
    const o1 = await settle(
      ops1.exec("first", EXEC_CWD, { onData: rec1.onData }),
    );
    expect(o1.ok).toBe(true);
    expect(rec1.chunks[rec1.chunks.length - 1]!.toString("utf8")).toBe(
      `\n${UNIVERSAL_NOTE}\n`,
    );
    state.enterCapability(RESEARCH);
    state.attachPhase("impl", [KEPT_A], true, false);
    const ops2 = createLandlockBashOperations(WORKSPACE_CWD, state, {
      localOps: fake2.ops,
    });
    const o2 = await settle(
      ops2.exec("second", EXEC_CWD, { onData: rec2.onData }),
    );
    expect(o2.ok).toBe(true);
    expect(rec2.chunks[rec2.chunks.length - 1]!.toString("utf8")).toBe(
      `\n${noteForWindow(state)}\n`,
    );
    expect(noteForWindow(state)).not.toBe(UNIVERSAL_NOTE);
  });

  it("framing (NO output flowed): the note OPENS the stream with its unconditional leading LF + trailing LF (accepted phantom-first-line artifact on silent failures)", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps(() => ({ exitCode: 4 }));
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("silent-failure", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 4 });
    expect(rec.chunks).toHaveLength(1);
    const payload = rec.chunks[0]!.toString("utf8");
    expect(payload).toBe(`\n${UNIVERSAL_NOTE}\n`);
    expect(payload.startsWith("\n")).toBe(true);
  });

  it("framing (immediately-preceding output byte NOT LF - partial last line): a LEADING LF terminates the partial line before the note", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("partial-last-line"));
      return { exitCode: 5 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("trailing-partial", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 5 });
    expect(rec.chunks).toHaveLength(2);
    expect(rec.chunks[0]!.toString("utf8")).toBe("partial-last-line");
    const payload = rec.chunks[1]!.toString("utf8");
    expect(payload).toBe(`\n${UNIVERSAL_NOTE}\n`);
  });

  it("framing (output ends in LF): LEADING LF still prepended (unconditional policy - accepted stray blank line after cleanly-ended output); trailing LF always (the factory status suffix appends its own separator after)", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("line-one\n"));
      box.push(Buffer.from("line-two\n"));
      return { exitCode: 5 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("clean-lines", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 5 });
    const payload = rec.chunks[rec.chunks.length - 1]!.toString("utf8");
    expect(payload).toBe(`\n${UNIVERSAL_NOTE}\n`);
    expect(payload.startsWith("\n")).toBe(true);
  });

  it("MUTE (delegated exit 0): the exit-code trigger does not fire - zero note appended, raw chunks untouched, resolves { exitCode: 0 } (FACTUAL silence; enforcement is the guarantee - the note is advisory framing only)", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("anything\n"));
      return { exitCode: 0 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("succeeds", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
    expect(rec.chunks).toHaveLength(1);
    expect(rec.chunks[0]!.toString("utf8")).toBe("anything\n");
  });
});

// ===========================================================================
// GROUP E - delegation error contracts (the delegate's rejections propagate
// VERBATIM; kill paths carry NO denial noise)
// ===========================================================================

describe("E. delegation error contracts", () => {
  it("the delegate rejecting with the aborted bytes: the op rejects with the SAME bytes VERBATIM; raw chunks arrive untouched and NOTHING is appended (kill-path silence - the standing note rides resolved non-zero exits ONLY)", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("aborted-soon\n"));
      return { reject: new Error("aborted") };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("long-running", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("aborted");
    expect(rec.chunks).toHaveLength(1);
  });

  it("the delegate rejecting with the timeout bytes (original-secs token): the op rejects with the SAME bytes VERBATIM; raw chunks arrive untouched and NOTHING is appended", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("output-so-far\npartial"));
      return { reject: new Error("timeout:0.05") };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("hanging", EXEC_CWD, { onData: rec.onData, timeout: 0.05 }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe("timeout:0.05");
    expect(rec.chunks).toHaveLength(1);
  });

  it("the delegate rejecting with an arbitrary spawn error (TOCTOU ENOENT-class): the op rejects with the SAME error VERBATIM - NOT a mechanism refusal (misattribution avoided)", async () => {
    const boom = new Error("spawn /workspace/proj-x ENOENT (simulated)");
    const fake = scriptedOps(() => ({ reject: boom }));
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("any", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(false);
    expect(refusalErrorOf(outcome)).toBe(boom);
  });

  it("NON-INTERACTION (an in-band band refusal over raw streamed output): the refusal REPLACES the exit report entirely - the standing-note interaction is ABSENT by construction (notes ride resolved NON-ZERO out-of-band exits ONLY)", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("raw-output\n"));
      return { exitCode: 104 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("execve-corner", EXEC_CWD, { onData: rec.onData }),
    );
    expect(outcome.ok).toBe(false);
    expect(errorMessage(refusalErrorOf(outcome))).toBe(
      renderMechanismRefusal("execve-failure", { exitCode: 104 }),
    );
    // Raw chunk forwarded verbatim; NO standing-note append.
    expect(rec.chunks).toHaveLength(1);
    expect(rec.chunks[0]!.toString("utf8")).toBe("raw-output\n");
  });
});

// ===========================================================================
// GROUP F - wrapped-script serialization + pass-through receipts
// ===========================================================================

describe("F. wrapped-script serialization + pass-through receipts", () => {
  const B64_DECODER_PATTERN = /printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d/;

  it("BASE FORM: the delegated command string is the exec-form carrier invocation - carrier program absolute FIRST, the composed --write vector, the -- separator, the inner absolute shell with -c over a base64-decoded payload that ROUND-TRIPS to the original command BYTES", async () => {
    const original = "echo hello world";
    const fake = scriptedOps(() => ({ exitCode: 0 }));
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec(original, EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    expect(fake.calls).toHaveLength(1);
    const script = fake.calls[0]!.cmd;
    expect(script.startsWith(`exec '${CARRIER}'`)).toBe(true);
    expect(script).toContain("'--'");
    expect(script).toContain(MEASURED_SHELL.shell);
    // The --write vector equals the composed writable set over the fixture
    // window (integration edge over the frozen Step 3 composer).
    const writable = composeKernelWritableSet(fixtureState().snapshot());
    for (const entry of writable) {
      expect(script).toContain(`'${entry}'`);
    }
    // The base64 payload decodes back to the ORIGINAL command bytes.
    const b64Match = script.match(B64_DECODER_PATTERN);
    expect(b64Match).not.toBeNull();
    if (b64Match) {
      expect(Buffer.from(b64Match[1]!, "base64").toString("utf8")).toBe(
        original,
      );
    }
  });

  it("HOSTILE COMMAND QUOTING (quotes, newlines, dollar signs, unicode): the serialized payload SURVIVES the outer-shell evaluation - the decode round-trip is byte-identical", async () => {
    const original =
      "printf 'it\\'s \\$HOME \\u2014 done'\necho \"second line\"";
    const fake = scriptedOps(() => ({ exitCode: 0 }));
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec(original, EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    const script = fake.calls[0]!.cmd;
    const b64Match = script.match(B64_DECODER_PATTERN);
    expect(b64Match).not.toBeNull();
    if (b64Match) {
      expect(Buffer.from(b64Match[1]!, "base64").toString("utf8")).toBe(
        original,
      );
    }
  });

  it("ENV identity: the delegate's env IS the very object handed to the op (reference identity, PI_*-looking entries untouched)", async () => {
    const envObject = {
      PATH: "/usr/bin",
      PI_SESSION_ID: "seed-value",
    } as NodeJS.ProcessEnv;
    const seen: Array<NodeJS.ProcessEnv | undefined> = [];
    const fake = scriptedOps((box) => {
      seen.push(box.env);
      return { exitCode: 0 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("env-check", EXEC_CWD, {
        onData: () => undefined,
        env: envObject,
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(envObject);
    expect(seen[0]?.PI_SESSION_ID).toBe("seed-value");
  });

  it("CWD pass-through: the delegate's cwd IS the op parameter verbatim (the factory's ctx?.cwd || constructionCwd precedence belongs to the factory - here the op mirrors the param); the probe receipt honors the SAME param", async () => {
    const foreignDir = mkdtempSync(`${os.tmpdir()}/cwf-s04-cwd-`);
    const fake = scriptedOps(() => ({ exitCode: 0 }));
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("cwd-check", foreignDir, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(true);
    expect(fake.calls[0]?.cwd).toBe(foreignDir);
    expect(h.receipts[0]?.options.cwd).toBe(foreignDir);
  });

  it("SIGNAL forwarding: the op's signal reaches the delegate UNTRANSFORMED (reference identity) - the delegate owns the abort kill governance end-to-end", async () => {
    const controller = new AbortController();
    const seen: Array<AbortSignal | undefined> = [];
    const fake = scriptedOps((box) => {
      seen.push(box.signal);
      return { exitCode: 0 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      {
        localOps: fake.ops,
      },
    );
    const outcome = await settle(
      h.ops.exec("signal-check", EXEC_CWD, {
        onData: () => undefined,
        signal: controller.signal,
      }),
    );
    expect(outcome.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(controller.signal);
  });
});

// ===========================================================================
// GROUP G - mechanical source-guard charter over the module's OWN source
// ===========================================================================

describe("G. mechanical source-guard charter over landlock-bash.ts", () => {
  const MODULE_PATH = new URL("./landlock-bash.ts", import.meta.url);
  const RAW_MODULE_SOURCE = readFileSync(fileURLToPath(MODULE_PATH), "utf8");

  /** Blank out string/template literals and comments before scanning, so
   * prose/literal bytes cannot masquerade as structural tokens. */
  function partitionForScan(source: string): {
    residue: string;
    literals: string[];
  } {
    const literals: string[] = [];
    let residue = "";
    let index = 0;
    while (index < source.length) {
      const ch = source[index];
      if (ch === "/" && source[index + 1] === "/") {
        const end = source.indexOf("\n", index);
        index = end === -1 ? source.length : end;
        continue;
      }
      if (ch === "/" && source[index + 1] === "*") {
        const end = source.indexOf("*/", index + 2);
        index = end === -1 ? source.length : end + 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        let j = index + 1;
        while (j < source.length) {
          if (source[j] === "\\") {
            j += 2;
            continue;
          }
          if (quote === "`" && source[j] === "$" && source[j + 1] === "{") {
            let depth = 1;
            j += 2;
            while (j < source.length && depth > 0) {
              if (source[j] === "{") depth += 1;
              if (source[j] === "}") depth -= 1;
              j += 1;
            }
            continue;
          }
          if (source[j] === quote) break;
          j += 1;
        }
        literals.push(source.slice(index, j + 1));
        residue += " ";
        index = j + 1;
        continue;
      }
      residue += ch;
      index += 1;
    }
    return { residue, literals };
  }

  const { residue: MODULE_RESIDUE, literals: MODULE_LITERALS } =
    partitionForScan(RAW_MODULE_SOURCE);

  const CAST_TOKEN = ["a", "s"].join("");
  const GATE_EDGE_FRAGMENT = "write-gate";
  const REFUSAL_PREFIX = ["Command", "execution", "refused"].join(" ");
  const NOTE_PREFIX = "Note: ";

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

  const SDK_SPECIFIER = ["@earendil-works", "pi-coding-agent"].join("/");

  /** Statement-aware extraction: pairs each import statement's kind (value /
   * type-only) with its specifier and the sorted imported names. Biome may
   * wrap long lists across lines - whitespace is normalized first. */
  function extractImportStatements(source: string): Array<{
    typeOnly: boolean;
    specifier: string;
    names: string[];
  }> {
    const normalized = source.replace(/\s+/g, " ");
    const statements: Array<{
      typeOnly: boolean;
      specifier: string;
      names: string[];
    }> = [];
    const pattern = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
    for (;;) {
      const match = pattern.exec(normalized);
      if (match === null) break;
      const names = match[2]!
        .split(",")
        .map((part) => part.trim().replace(/^type\s+/, ""))
        .filter((part) => part.length > 0);
      statements.push({
        typeOnly: match[1] !== undefined,
        specifier: match[3]!,
        names: names.sort(),
      });
    }
    return statements;
  }

  function namesOf(specifier: string, typeOnly: boolean): string[] {
    const matches = extractImportStatements(RAW_MODULE_SOURCE).filter(
      (statement) =>
        statement.specifier === specifier && statement.typeOnly === typeOnly,
    );
    expect(matches.length).toBeGreaterThan(0);
    return matches.flatMap((statement) => statement.names);
  }

  it("scanner soundness pins: ZERO slash survives the elision (zero regex literals - restored explicitly), zero `as` assertion casts in the residue, NO class/enum/namespace declarations (erasable-syntax-clean, tsc-enforced with the scan as tripwire)", () => {
    expect(MODULE_RESIDUE.includes("/")).toBe(false);
    const castToken = `${CAST_TOKEN} `;
    expect(MODULE_RESIDUE.includes(castToken)).toBe(false);
    for (const declaration of ["class ", "enum ", "namespace "]) {
      expect(MODULE_RESIDUE.includes(declaration)).toBe(false);
    }
  });

  it("glyph + voice discipline: zero raw U+2014 glyph ANYWHERE in the file (prose ASCII-hyphens; the product-facing refusal/denial bytes belong to the sibling's renderers); EXACTLY ONE local string literal opens the sanctioned standing-note prefix (the module's SOLE new voice artifact - single-owner pin); and ZERO other literals open the mechanism-refusal prefix or define a denial shape (single-owner claim adapted from the sibling's inventory)", () => {
    expect(RAW_MODULE_SOURCE.includes("\u2014")).toBe(false);
    const noteOpeners = MODULE_LITERALS.filter(
      (literal) =>
        literal.startsWith(`"${NOTE_PREFIX}`) ||
        literal.startsWith(`'${NOTE_PREFIX}`) ||
        literal.startsWith(`\`${NOTE_PREFIX}`),
    );
    expect(noteOpeners).toHaveLength(1);
    for (const literal of MODULE_LITERALS) {
      expect(literal.startsWith(`"${REFUSAL_PREFIX}`)).toBe(false);
      expect(literal.startsWith(`'${REFUSAL_PREFIX}`)).toBe(false);
      expect(literal.startsWith(`\`${REFUSAL_PREFIX}`)).toBe(false);
    }
    const denialShapeNeedle = ["No permission", "to write"].join(" ");
    for (const literal of MODULE_LITERALS) {
      expect(literal).not.toContain(denialShapeNeedle);
    }
  });

  it("runtime namespace surface pin: Object.keys sorted equals EXACTLY the TWO value exports (alphabetized)", async () => {
    const mod = await import(pathToFileURL(fileURLToPath(MODULE_PATH)).href);
    const runtimeKeys = Object.keys(mod).sort();
    expect(runtimeKeys).toEqual([...VALUE_EXPORT_NAMES].sort());
  });

  it("declarative export names pin: the two values PLUS the six pinned type/interface names (eight declarative exports)", () => {
    for (const name of VALUE_EXPORT_NAMES) {
      expect(RAW_MODULE_SOURCE).toContain(`export function ${name}`);
    }
    for (const name of TYPE_EXPORT_NAMES) {
      expect(RAW_MODULE_SOURCE).toContain(`export interface ${name}`);
    }
  });

  it("import partition pins (statement-aware, whitespace-normalized - Biome-wrap hazard): value partition EXACTLY the pinned five specifiers IN SOURCE ORDER with per-specifier name pins; type-only partition EXACTLY the pinned pair IN SOURCE ORDER with per-specifier name pins", () => {
    const imports = extractImportStatements(RAW_MODULE_SOURCE);
    const valueSpecifiers = imports
      .filter((statement) => !statement.typeOnly)
      .map((statement) => statement.specifier);
    expect(valueSpecifiers).toEqual([
      "node:child_process",
      "node:fs",
      "node:fs/promises",
      SDK_SPECIFIER,
      "./landlock-ruleset.ts",
    ]);
    const typeSpecifiers = imports
      .filter((statement) => statement.typeOnly)
      .map((statement) => statement.specifier);
    expect(typeSpecifiers).toEqual([
      SDK_SPECIFIER,
      "../../session-execution-state.ts",
    ]);
    expect(namesOf("node:child_process", false)).toEqual(["spawn"]);
    expect(namesOf("node:fs", false)).toEqual(["constants"]);
    expect(namesOf("node:fs/promises", false)).toEqual(["access"]);
    expect(namesOf(SDK_SPECIFIER, false)).toEqual([
      "createBashToolDefinition",
      "createLocalBashOperations",
      "defineTool",
      "getShellConfig",
    ]);
    expect(namesOf(SDK_SPECIFIER, true)).toEqual([
      "BashOperations",
      "ToolDefinition",
    ]);
    expect(namesOf("../../session-execution-state.ts", true)).toEqual([
      "SessionExecutionState",
    ]);
    expect(namesOf("./landlock-ruleset.ts", false)).toEqual([
      "checkLandlockHelper",
      "classifyLandlockExit",
      "composeKernelWritableSet",
      "parseProbeReport",
      "renderMechanismRefusal",
    ]);
  });

  it("edge elimination + node: purity ledger: zero write-gate occurrences (the eliminated tools-to-guards edge stays eliminated) and the module's node: specifier set is EXACTLY {node:child_process, node:fs, node:fs/promises}", () => {
    expect(RAW_MODULE_SOURCE.includes(GATE_EDGE_FRAGMENT)).toBe(false);
    const nodeSpecifiers = [
      ...new Set(
        [...RAW_MODULE_SOURCE.matchAll(/"node:[a-z_/]+"/g)].map((m) => m[0]),
      ),
    ].sort();
    expect(nodeSpecifiers).toEqual([
      '"node:child_process"',
      '"node:fs"',
      '"node:fs/promises"',
    ]);
  });

  it("no-other-package pin: the ONLY non-node/non-relative quoted import specifier occurrence in the file is the SDK one (lockfile purity)", () => {
    const quoted = [
      ...RAW_MODULE_SOURCE.matchAll(/from\s+["']([^"']+)["']/g),
    ].map((m) => m[1]!);
    const foreign = [
      ...new Set(
        quoted.filter(
          (specifier) =>
            !specifier.startsWith("node:") && !specifier.startsWith("."),
        ),
      ),
    ];
    expect(foreign).toEqual([SDK_SPECIFIER]);
  });

  it("dev-process-marker hygiene: no plan-step/goal/spec-version/owner-ruling/kickoff identifiers in shipped comments (mechanically scanned per the house pattern set)", () => {
    for (const needle of DEV_PROCESS_MARKERS) {
      expect(RAW_MODULE_SOURCE).not.toMatch(new RegExp(needle));
    }
  });
});

// ===========================================================================
// GROUP H - PROBE-ONCE CACHING over a REUSED ops instance (one harness,
// multiple invocations: the first pays the fork; a PASSED verdict latches;
// FAILED verdicts do NOT latch and retry pre-child on the next invocation)
// ===========================================================================

describe("H. probe-once caching over a reused ops instance", () => {
  /** Re-typed universal depth-0 note payload (the SAME documented mapping
   * as group D: the composer's /dev-only minimum degrades onto the "none"
   * listing; framing UNCONDITIONAL - leading LF + trailing LF). */
  const DEPTH0_NOTE_PAYLOAD =
    "\nNote: a per-phase Landlock write restriction is in effect and denied writes surface as permission errors in the command's own output. Landlock may be blocking changes to certain files due to lack of permissions in the current phase. Allowed targets: none.\n";

  it("CACHE-HIT (single ops instance, two invocations): the first pays the probe fork (ONE spawner receipt, delegate consulted); the second settles normally with EXACTLY ZERO additional spawner receipts while the wrapped script still reaches the delegate and the note settlement is unchanged", async () => {
    const rec = dataRecorder();
    const fake = scriptedOps((box) => {
      box.push(Buffer.from("raw\n"));
      return { exitCode: 3 };
    });
    const h = makeHarness(
      fixtureState(),
      [{ stdin: false, actions: probePassActions() }],
      { localOps: fake.ops },
    );
    const first = await settle(
      h.ops.exec("first", EXEC_CWD, { onData: rec.onData }),
    );
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value).toEqual({ exitCode: 3 });
    expect(h.receipts).toHaveLength(1);
    expect(fake.calls).toHaveLength(1);
    const second = await settle(
      h.ops.exec("second", EXEC_CWD, { onData: rec.onData }),
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toEqual({ exitCode: 3 });
    // Cache hit: NO second fork over the SAME instance (a re-fork would
    // push the receipt total to two).
    expect(h.receipts).toHaveLength(1);
    // The delegate is still consulted and receives the wrapped script.
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]?.cmd).toContain(CARRIER);
    // Settlement unchanged per invocation: raw chunk verbatim FIRST, then
    // the universal note (channel-order receipt over both invocations).
    expect(rec.chunks).toHaveLength(4);
    expect(rec.chunks[0]!.toString("utf8")).toBe("raw\n");
    expect(rec.chunks[1]!.toString("utf8")).toBe(DEPTH0_NOTE_PAYLOAD);
    expect(rec.chunks[2]!.toString("utf8")).toBe("raw\n");
    expect(rec.chunks[3]!.toString("utf8")).toBe(DEPTH0_NOTE_PAYLOAD);
  });

  it("FAILURE-RETRY (probe-abnormal family, single ops instance): the first invocation refuses probe-abnormal PRE-CHILD (ONE spawner receipt, delegate NOT consulted) and the failed verdict does NOT latch - the second invocation RE-RUNS the probe over the SAME instance (receipt total TWO), passes, and settles through the wrapped-script delegate consult", async () => {
    const fake = scriptedOps(() => ({ exitCode: 0 }));
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [
            {
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from("garbage-not-a-report\n"),
            },
            { kind: "exit", code: 1 },
          ],
        },
        { stdin: false, actions: probePassActions() },
      ],
      { localOps: fake.ops },
    );
    const first = await settle(
      h.ops.exec("first", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      first,
      renderMechanismRefusal("probe-abnormal", {
        probeExit: 1,
        probeOutput: "garbage-not-a-report",
      }),
    );
    expect(h.receipts).toHaveLength(1);
    expect(fake.calls).toHaveLength(0);
    const second = await settle(
      h.ops.exec("second", EXEC_CWD, { onData: () => undefined }),
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toEqual({ exitCode: 0 });
    // Explicit receipt arithmetic for the non-cached failure: the probe
    // RE-RAN (total TWO receipts - the second consumes the passing seam)
    // and the delegate was consulted exactly once with the wrapped script.
    expect(h.receipts).toHaveLength(2);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.cmd).toContain(CARRIER);
  });

  it("FAILURE-NOT-CACHED explicit (probe-refused family, single ops instance): the abi-mismatch refusal (status=fail exiting 101) leaves the latch open too - the second invocation retries the probe over the SAME instance (receipt total TWO) and settles once the passing seam answers", async () => {
    const fake = scriptedOps(() => ({ exitCode: 0 }));
    const h = makeHarness(
      fixtureState(),
      [
        {
          stdin: false,
          actions: [
            {
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from(
                "landlock-helper probe abi=7 pin=8 status=fail\n",
              ),
            },
            { kind: "exit", code: 101 },
          ],
        },
        { stdin: false, actions: probePassActions() },
      ],
      { localOps: fake.ops },
    );
    const first = await settle(
      h.ops.exec("first", EXEC_CWD, { onData: () => undefined }),
    );
    expectRefusal(
      first,
      renderMechanismRefusal("probe-refused", {
        discoveredAbi: 7,
        pinnedAbi: 8,
      }),
    );
    expect(h.receipts).toHaveLength(1);
    expect(fake.calls).toHaveLength(0);
    const second = await settle(
      h.ops.exec("second", EXEC_CWD, { onData: () => undefined }),
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value).toEqual({ exitCode: 0 });
    expect(h.receipts).toHaveLength(2);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.cmd).toContain(CARRIER);
  });
});
