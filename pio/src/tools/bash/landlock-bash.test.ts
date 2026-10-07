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
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { UNIVERSAL_NO_PERMISSION_DENIAL } from "../../denial-vocabulary.ts";
import { matchesAnchoredGlob } from "../../sandbox/string-match-helpers.ts";
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
  composeSpawnPlan,
  parseOverlayProbeReport,
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
  /** Schedule emissions on a deferred tick so listeners attach first.
   * Stream end-of-stream signals fire AFTER all scripted actions - the
   * production pipes always signal close once the writer side dies, and
   * the module's probe settlement drains streams before settling. */
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
      this.stdout.emit("close");
      this.stderr.emit("close");
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
    nonceSource?: () => string;
    spawnerThrows?: boolean;
    throwSpawnerFor?: (args: readonly string[]) => boolean;
  },
): Harness {
  const receipts: SpawnReceipt[] = [];
  const counter = { next: 1000 };
  let index = 0;
  // STRUCTURAL NON-ENGAGEMENT DEFAULT: the planner is pure over the snapshot
  // (files-only invariant - no filesystem consultation anywhere), so legacy
  // rows stay non-engaged BY CONSTRUCTION: their windows carry no strictly-
  // concrete survivors (silent, class-flag-only, or coverage-filtered).
  const landlockSeams: LandlockBashSeams = {
    ...(seams?.statMode !== undefined ? { statMode: seams.statMode } : {}),
    spawner: (command, args, options) => {
      if (seams?.spawnerThrows) {
        throw new Error("scripted-spawn-fault");
      }
      if (seams?.throwSpawnerFor?.(args)) {
        throw new Error("scripted-spawn-fault");
      }
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
    ...(seams?.nonceSource !== undefined
      ? { nonceSource: seams.nonceSource }
      : {}),
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
    // The relative declaration token is COVERAGE-FILTERED (anchored-glob
    // matching requires absolute targets under the slot root), so the window
    // carries no strictly-concrete survivor and stays non-engaged.
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
    [105, "supervisor-table-malformed"],
    [106, "realm-clone-failure"],
    [107, "realm-map-write-failure"],
    [108, "child-early-death"],
    [109, "realm-unshare-failure"],
    [110, "overlay-mount-failure"],
    [111, "overlay-umount-failure"],
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

  for (const code of [112, 199]) {
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
    // CLASS-FLAG-ONLY window (no declarations): the listing stays phase-
    // shaped over the class channel while the window stays non-engaged.
    state.attachPhase("impl", [], true, false);
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
    // CLASS-FLAG-ONLY window on the landed side too: phase-shaped note
    // without any strictly-concrete survivor (non-engaged).
    state.attachPhase("impl", [], true, false);
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
    // window (integration edge over the sibling kernel-set composer).
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

  it("glyph + voice discipline: zero raw U+2014 glyph ANYWHERE in the file (prose ASCII-hyphens; product-facing refusal/denial bytes belong to the sibling's renderers); EXACTLY ONE local string literal opens EACH sanctioned head over the module's THREE voice artifacts (single-owner pins - standing note, verdict-discard note, settlement-fault head); and ZERO other literals open the mechanism-refusal prefix or define a denial shape (single-owner claim adapted from the sibling's inventory)", () => {
    expect(RAW_MODULE_SOURCE.includes("\u2014")).toBe(false);
    const heads = [
      "Note: a per-phase Landlock write restriction is in effect",
      "Note: the restricted run's writes were checked",
      "restricted-run settlement fault: ",
    ];
    const noteOpeners = MODULE_LITERALS.filter(
      (literal) =>
        literal.startsWith(`"${NOTE_PREFIX}`) ||
        literal.startsWith(`'${NOTE_PREFIX}`) ||
        literal.startsWith(`\`${NOTE_PREFIX}`),
    );
    expect(noteOpeners).toHaveLength(2);
    for (const head of heads) {
      expect(
        MODULE_LITERALS.filter((literal) => literal.startsWith(`"${head}`)),
      ).toHaveLength(1);
    }
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

  it("import partition pins (statement-aware, whitespace-normalized - Biome-wrap hazard): value partition EXACTLY the pinned seven specifiers IN SOURCE ORDER with per-specifier name pins; type-only partition EXACTLY the pinned pair IN SOURCE ORDER with per-specifier name pins", () => {
    const imports = extractImportStatements(RAW_MODULE_SOURCE);
    const valueSpecifiers = imports
      .filter((statement) => !statement.typeOnly)
      .map((statement) => statement.specifier);
    expect(valueSpecifiers).toEqual([
      "node:child_process",
      "node:crypto",
      "node:fs",
      "node:fs/promises",
      SDK_SPECIFIER,
      "../../permission-mechanics.ts",
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
    expect(namesOf("node:crypto", false)).toEqual(["randomBytes"]);
    expect(namesOf("node:fs", false)).toEqual(["constants"]);
    expect(namesOf("node:fs/promises", false)).toEqual([
      "access",
      "chmod",
      "copyFile",
      "lstat",
      "mkdir",
      "readdir",
      "rename",
      "rm",
      "rmdir",
      "unlink",
    ]);
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
    expect(namesOf("../../permission-mechanics.ts", false)).toEqual([
      "materializeEffectiveSet",
    ]);
    expect(namesOf("./landlock-ruleset.ts", false)).toEqual([
      "checkLandlockHelper",
      "classifyLandlockExit",
      "composeKernelWritableSet",
      "composeSpawnPlan",
      "parseOverlayProbeReport",
      "parseProbeReport",
      "renderMechanismRefusal",
    ]);
  });

  it("edge elimination + node: purity ledger: zero write-gate occurrences (the eliminated tools-to-guards edge stays eliminated) and the module's node: specifier set is EXACTLY {node:child_process, node:crypto, node:fs, node:fs/promises}", () => {
    expect(RAW_MODULE_SOURCE.includes(GATE_EDGE_FRAGMENT)).toBe(false);
    const nodeSpecifiers = [
      ...new Set(
        [...RAW_MODULE_SOURCE.matchAll(/"node:[a-z_/]+"/g)].map((m) => m[0]),
      ),
    ].sort();
    expect(nodeSpecifiers).toEqual([
      '"node:child_process"',
      '"node:crypto"',
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

// ===========================================================================
// ENGAGED-FIXTURE AREA (shared by the appended groups): REAL mkdtemp anchor
// roots (the session-minted scratch geometry needs real parent directories -
// virtual fixture roots would fault the mint); engagement is purely
// declarative (the files-only planner consults no filesystem), with
// deterministic nonce seams where a row pins scratch geometry; every row
// cleans up its root in a finally-walk so no residue ever crosses rows.
// ===========================================================================

interface EngagedRoot {
  readonly state: SessionExecutionState;
  readonly slot: string;
  readonly ws: string;
  readonly cleanup: () => void;
}

function openEngagedRoot(): EngagedRoot {
  const root = mkdtempSync(join(os.tmpdir(), "pio-bash-eng-"));
  const slot = `${root}/slot`;
  const ws = `${root}/ws`;
  mkdirSync(slot);
  mkdirSync(ws);
  const state = fixtureState(
    fixtureChannels({ slotRoot: slot, workspaceCwd: ws }),
  );
  return {
    state,
    slot,
    ws,
    cleanup: (): void => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort teardown (assertions already ran)
      }
    },
  };
}

/** The combined-arm passing preamble (one throwaway fork, ok verdict over
 * BOTH report cells). */
function overlayPassActions(): Action[] {
  return [
    {
      kind: "data",
      stream: "stdout",
      chunk: Buffer.from("landlock-helper overlay realm=ok status=ok\n"),
    },
    { kind: "exit", code: 0 },
  ];
}

function twoProbePreamble(): Array<{ stdin: boolean; actions: Action[] }> {
  return [
    { stdin: false, actions: probePassActions() },
    { stdin: false, actions: overlayPassActions() },
  ];
}

/** Local replica of the POSIX single-quoting escape (independent golden
 * builder - the byte contract, not the module's own function). */
function q(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/** THE composed-chain script golden builder (spec-pinned form): outer shell
 * re-executes the carrier with the supervisor mirror-table preamble IN
 * MOUNTS ORDER over the EXISTING apply-form tail (same carrier, engaged
 * kernel vector, inner shell base64 payload transport unchanged). */
function expectedComposedScript(opts: {
  carrier: string;
  mounts: readonly string[];
  triples: ReadonlyArray<readonly [string, string, string]>;
  vector: readonly string[];
  shell: string;
  command: string;
}): string {
  const mountArgs = opts.mounts
    .map((mount, index) => {
      const triple = opts.triples[index]!;
      void mount; // order source; values render from the minted triple
      return `${q("--mount")} ${q(triple[0])} ${q(triple[1])} ${q(triple[2])}`;
    })
    .join(" ");
  const writeArgs = opts.vector
    .map((entry) => `${q("--write")} ${q(entry)}`)
    .join(" ");
  const payload = Buffer.from(opts.command, "utf8").toString("base64");
  return (
    `exec ${q(opts.carrier)} ${mountArgs} ${q("--")} ${q(opts.carrier)} ` +
    `${writeArgs} ${q("--")} ${q(opts.shell)} ${q("-c")} ` +
    `"$(printf '%s' ${q(payload)} | base64 -d)"`
  );
}

/** Extract the supervisor-preamble mirror triples from one composed script
 * (suite-side observation only - regex literals are a suite right, not a
 * module one). */
function triplesOf(script: string): Array<{
  lower: string;
  upper: string;
  work: string;
}> {
  const found: Array<{ lower: string; upper: string; work: string }> = [];
  const pattern = /--mount' '([^']*)' '([^']*)' '([^']*)'/g;
  for (const match of script.matchAll(pattern)) {
    found.push({ lower: match[1]!, upper: match[2]!, work: match[3]! });
  }
  return found;
}

/** Local replica of the model-facing listing projection over ONE concrete
 * kernel vector (documented mapping - same shape as group D's composer-bound
 * replica, applied to the PLANNED engaged vector instead). */
function engagedListing(
  vector: readonly string[],
  workspaceCwd: string,
): string {
  const parts: string[] = [];
  for (const entry of vector) {
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

const DISCARD_HEAD =
  "Note: the restricted run's writes were checked against the phase's writable set; the discarded entries never landed: ";
const SETTLE_HEAD = "restricted-run settlement fault: ";

/** Seed ONE upper tree deterministically over real fs (files / dirs /
 * symlinks / fifos via the system mkfifo - mknod-capable whiteout seeding
 * is unavailable unprivileged, so kernel-formed whiteouts ride the
 * real-chain legs instead). Suite-side fixture machinery only. */
interface SeedSpec {
  files: Record<string, string>;
  dirs?: string[];
  symlinks?: Record<string, string>;
  fifos?: string[];
}

function seedUpperTree(upper: string, spec: SeedSpec): void {
  for (const dir of spec.dirs ?? []) {
    mkdirSync(`${upper}/${dir}`, { recursive: true });
  }
  for (const [rel, content] of Object.entries(spec.files)) {
    const p = join(upper, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  for (const [rel, target] of Object.entries(spec.symlinks ?? {})) {
    symlinkSync(target, join(upper, rel));
  }
  for (const rel of spec.fifos ?? []) {
    spawnSync("/bin/mkfifo", [join(upper, rel)]);
  }
}

// ===========================================================================
// GROUP I - ENGAGED-FORM SERIALIZATION
// ===========================================================================

describe("I. engaged-form serialization (supervisor preamble over the apply-form tail)", () => {
  it("structure pin (single leaf engagement): the delegated script IS the spec form byte-for-byte - one --mount triple per mirror mount (values absolute, the minted triple layout under <slot>/.fence-scratch/<nonce>/0/), the -- separator, the apply-form tail over the SAME carrier with the ENGAGED kernel vector (envelope in place of the leaf, leaf ABSENT, /dev + workspace cwd trailing), inner shell base64 payload unchanged; TWO probe receipts + ONE delegate call", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps(() => ({ exitCode: 0 }));
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "i-nonce",
      });
      const outcome = await settle(
        h.ops.exec("touch target", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(h.receipts).toHaveLength(2);
      expect(fake.calls).toHaveLength(1);
      const envelope = `${fx.slot}/research`;
      const scratchParent = `${fx.slot}/.fence-scratch`;
      const expected = expectedComposedScript({
        carrier: CARRIER,
        mounts: [envelope],
        triples: [
          [
            envelope,
            `${scratchParent}/i-nonce/0/upper`,
            `${scratchParent}/i-nonce/0/work`,
          ],
        ],
        vector: [envelope, "/dev", fx.ws],
        shell: MEASURED_SHELL.shell,
        command: "touch target",
      });
      expect(fake.calls[0]!.cmd).toBe(expected);
      const observed = triplesOf(fake.calls[0]!.cmd);
      expect(observed).toEqual([
        {
          lower: envelope,
          upper: `${scratchParent}/i-nonce/0/upper`,
          work: `${scratchParent}/i-nonce/0/work`,
        },
      ]);
    } finally {
      fx.cleanup();
    }
  });

  it("hostile-command quoting survival (quotes/dollar-signs/newlines/unicode): the base64 payload ROUND-TRIPS the original command byte-for-byte through the two-shell evaluation structure (zero quoting dialect); the composed structure survives intact", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const hostile =
        'don\'t "quote" $HOME \u00e9 back\\slash\nline-two `tick`';
      fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
      const fake = scriptedOps(() => ({ exitCode: 0 }));
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "i-nonce",
      });
      const outcome = await settle(
        h.ops.exec(hostile, EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(true);
      const cmd = fake.calls[0]!.cmd;
      expect(cmd.startsWith(`exec ${q(CARRIER)} `)).toBe(true);
      // Structural extraction of the quoted payload token between the
      // pinned transport markers (suite-side parsing only).
      const markerOpen = `$(printf '%s' '`;
      const markerClose = `' | base64 -d)`;
      const start = cmd.lastIndexOf(markerOpen) + markerOpen.length;
      const end = cmd.lastIndexOf(markerClose);
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      const encoded = cmd.slice(start, end);
      expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(hostile);
    } finally {
      fx.cleanup();
    }
  });

  it("single-site validation battery over the engaged form (apply-layer corners keep the EXISTING malformed-spec line; ZERO delegate consults on each): relative shell, empty shell, stdin transport - each refuses pre-child with the uniform line over TWO probe receipts consumed", async () => {
    const shellShapes: Array<{
      shell: string;
      args: string[];
      commandTransport?: "argv" | "stdin";
    }> = [
      { shell: "sh", args: ["-c"] },
      { shell: "", args: ["-c"] },
      { shell: "/bin/bash", args: ["-s"], commandTransport: "stdin" },
    ];
    for (const shellShape of shellShapes) {
      const fx = openEngagedRoot();
      try {
        fx.state.enterCapability(RESEARCH);
        fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
        const rec = recorderOps();
        const h = makeHarness(fx.state, twoProbePreamble(), {
          resolveShellConfig: () => shellShape,
          localOps: rec.ops,
          nonceSource: () => "i-nonce",
        });
        const outcome = await settle(
          h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
        );
        expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
        expect(h.receipts).toHaveLength(2);
        expect(rec.calls).toHaveLength(0);
      } finally {
        fx.cleanup();
      }
    }
  });

  it("multi-mount ordering + dedupe fidelity (three leaves, two envelopes): preamble carries ONE triple per DISTINCT envelope IN DECLARATION ORDER with first-occurrence dedupe, index-named scratch dirs 0/1; the kernel vector emits each envelope IN PLACE at its survivor position with the single global dedupe pass", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability({
        name: "multi",
        writes: ["a/x/*.md", "deep/n/*.md"],
        allowProjectWrites: false,
      });
      const declared = [
        `${fx.slot}/a/x/f1.md`,
        `${fx.slot}/a/x/f2.md`,
        `${fx.slot}/deep/n/c.md`,
      ];
      fx.state.attachPhase("impl", declared, false, false);
      const fake = scriptedOps(() => ({ exitCode: 0 }));
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "i-nonce",
      });
      const outcome = await settle(
        h.ops.exec("true", EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(true);
      const m0 = `${fx.slot}/a/x`;
      const m1 = `${fx.slot}/deep/n`;
      const expected = expectedComposedScript({
        carrier: CARRIER,
        mounts: [m0, m1],
        triples: [
          [
            m0,
            `${fx.slot}/.fence-scratch/i-nonce/0/upper`,
            `${fx.slot}/.fence-scratch/i-nonce/0/work`,
          ],
          [
            m1,
            `${fx.slot}/.fence-scratch/i-nonce/1/upper`,
            `${fx.slot}/.fence-scratch/i-nonce/1/work`,
          ],
        ],
        vector: [m0, m1, "/dev"],
        shell: MEASURED_SHELL.shell,
        command: "true",
      });
      expect(fake.calls[0]!.cmd).toBe(expected);
    } finally {
      fx.cleanup();
    }
  });

  it("ENV/CWD/SIGNAL pass-through receipts carry to the engaged path (reference identity untransformed over the options bag)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
      const envBag = { PIO_SUITE_ENV: "marker-value" };
      const controller = new AbortController();
      let seenEnv: NodeJS.ProcessEnv | undefined;
      let seenSignal: AbortSignal | undefined;
      let seenCwd: string | undefined;
      const fake = scriptedOps((box) => {
        seenEnv = box.env;
        seenSignal = box.signal;
        seenCwd = box.cwd;
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "i-nonce",
      });
      const outcome = await settle(
        h.ops.exec("true", fx.ws, {
          env: envBag,
          signal: controller.signal,
          onData: () => undefined,
        }),
      );
      expect(outcome.ok).toBe(true);
      expect(seenEnv).toBe(envBag);
      expect(seenSignal).toBe(controller.signal);
      expect(seenCwd).toBe(fx.ws);
    } finally {
      fx.cleanup();
    }
  });
});

// ===========================================================================
// GROUP J - PLANNER-REFUSAL & PRE-CHILD ENGAGED FAULTS
// ===========================================================================

describe("J. planner-refusal & pre-child engaged faults (all typed, zero spawns, zero delegate consults, no scratch state change)", () => {
  it("nested-mirror arm: the planner's degenerate nesting corner refuses TYPED naming the inner/outer pair - NO probe forks consumed, NO delegate consult, NO scratch parent created", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability({
        name: "nested",
        writes: ["a/x/*.md", "a/x/y/*.md"],
        allowProjectWrites: false,
      });
      const outer = `${fx.slot}/a/x`;
      const inner = `${outer}/y`;
      fx.state.attachPhase(
        "impl",
        [`${inner}/f2.md`, `${outer}/f1.md`],
        false,
        false,
      );
      const rec = recorderOps();
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: rec.ops,
        nonceSource: () => "j-nonce",
      });
      const outcome = await settle(
        h.ops.exec("true", EXEC_CWD, { onData: () => undefined }),
      );
      expectRefusal(
        outcome,
        renderMechanismRefusal("nested-mirror", {
          mirrorInner: inner,
          mirrorOuter: outer,
        }),
      );
      expect(h.receipts).toHaveLength(0);
      expect(rec.calls).toHaveLength(0);
      expect(existsSync(`${fx.slot}/.fence-scratch`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("root-mount arm (spawn-site line pin + reachability record): the committed line renders byte-exact through the shared family renderer (single template over pre-child AND settlement); over WELL-FORMED anchors the arm is provably unreachable - a surviving leaf directly under the filesystem root cannot pass strict-under-slot anchoring for ANY slot root (checked through the shared anchored-glob matcher), so the arm stands as the latest-layer guard over hostile channel contracts (disclosed)", () => {
    for (const slotRoot of ["/", "/state/projects/proj-x", "/tmp/x"]) {
      expect(matchesAnchoredGlob("*", slotRoot, "/top.md")).toBe(false);
    }
    expect(renderMechanismRefusal("root-mount")).toBe(
      `Command execution refused \u2014 the spawn plan refuses a mirror mount at the filesystem root; refusing to run unfenced.`,
    );
  });

  it("scratch-area collision guard (BOTH directions): the scratch area must not intersect ANY planned mirror mount - a mount PREFIXING the nonce dir refuses, and a mount nested UNDER the nonce dir refuses; both pre-child with the detail slot naming the measured intersection", async () => {
    for (const direction of [0, 1]) {
      const fx = openEngagedRoot();
      try {
        fx.state.enterCapability({
          name: "collision",
          writes:
            direction === 0
              ? [".fence-scratch/*.md"]
              : [".fence-scratch/j-nonce/sub/*.md"],
          allowProjectWrites: false,
        });
        const declared =
          direction === 0
            ? [`${fx.slot}/.fence-scratch/seed.md`]
            : [`${fx.slot}/.fence-scratch/j-nonce/sub/d.md`];
        fx.state.attachPhase("impl", declared, false, false);
        const rec = recorderOps();
        const h = makeHarness(fx.state, twoProbePreamble(), {
          localOps: rec.ops,
          nonceSource: () => "j-nonce",
        });
        const outcome = await settle(
          h.ops.exec("true", EXEC_CWD, { onData: () => undefined }),
        );
        const scratchRoot = `${fx.slot}/.fence-scratch/j-nonce`;
        const mount =
          direction === 0
            ? `${fx.slot}/.fence-scratch`
            : `${fx.slot}/.fence-scratch/j-nonce/sub`;
        expectRefusal(
          outcome,
          renderMechanismRefusal("scratch-area-collision", {
            scratchCollisionDetail: `${scratchRoot} intersects ${mount}`,
          }),
        );
        expect(h.receipts).toHaveLength(0);
        expect(rec.calls).toHaveLength(0);
        expect(existsSync(scratchRoot)).toBe(false);
      } finally {
        fx.cleanup();
      }
    }
  });

  it("mint fault (read-only slot parent): the nonce-dir mkdir faults EACCES regardless of uid - typed scratch-mint-failure line, ZERO probe forks (the fault precedes applicability), ZERO delegate consults, no partial residue beyond the tolerated swallows", async () => {
    const fx = openEngagedRoot();
    try {
      chmodSync(fx.slot, 0o500);
      fx.state.enterCapability({
        name: "mintfault",
        writes: ["area/*.md"],
        allowProjectWrites: false,
      });
      fx.state.attachPhase("impl", [`${fx.slot}/area/seed.md`], false, false);
      const rec = recorderOps();
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: rec.ops,
        nonceSource: () => "j-nonce",
      });
      const outcome = await settle(
        h.ops.exec("true", EXEC_CWD, { onData: () => undefined }),
      );
      expectRefusal(
        outcome,
        renderMechanismRefusal("scratch-mint-failure", {
          scratchRoot: `${fx.slot}/.fence-scratch/j-nonce`,
        }),
      );
      expect(h.receipts).toHaveLength(0);
      expect(rec.calls).toHaveLength(0);
      expect(existsSync(`${fx.slot}/.fence-scratch/j-nonce`)).toBe(false);
    } finally {
      try {
        chmodSync(fx.slot, 0o700);
      } catch {
        // restore best-effort (cleanup removes the tree anyway)
      }
      fx.cleanup();
    }
  });

  it("channel-fault escape verbatim over an engaged-shaped window (span + attached phase): the state-module first-fault-escapes doctrine stands UNCHANGED at the flip site - the channel error escapes VERBATIM, ZERO spawns, ZERO delegate consults", async () => {
    class LocalChannelFault extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ExecutionStateError";
      }
    }
    const faultyState = fixtureState({
      projectSlotRoot: () => {
        throw new LocalChannelFault("engaged-window channel fault: unreadable");
      },
      workspaceCwd: () => WORKSPACE_CWD,
    });
    const rec = recorderOps();
    const h = makeHarness(faultyState, [], { localOps: rec.ops });
    const outcome = await settle(
      h.ops.exec("true", EXEC_CWD, { onData: () => undefined }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error instanceof LocalChannelFault).toBe(true);
    }
    expect(h.receipts).toHaveLength(0);
    expect(rec.calls).toHaveLength(0);
  });

  it("serializer-corner split golden (uniform-line doctrine pinned at its reachable seam): an apply-layer corner reached THROUGH the engaged serialization keeps the EXISTING malformed-spec line (NOT the supervisor-table line); and EVERY named band-class line is SINGLE-TEMPLATE - rendering without context equals rendering with the exit-code context (pre-child twin AND settlement form share one byte sequence)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
      const rec = recorderOps();
      const h = makeHarness(fx.state, twoProbePreamble(), {
        resolveShellConfig: () => ({ shell: "sh", args: ["-c"] }),
        localOps: rec.ops,
        nonceSource: () => "j-nonce",
      });
      const outcome = await settle(
        h.ops.exec("echo hi", EXEC_CWD, { onData: () => undefined }),
      );
      expectRefusal(outcome, renderMechanismRefusal("malformed-spec"));
      expect(errorMessage(refusalErrorOf(outcome))).not.toBe(
        renderMechanismRefusal("supervisor-table-malformed"),
      );
      expect(rec.calls).toHaveLength(0);
      const bandClasses: Array<
        [number, Parameters<typeof renderMechanismRefusal>[0]]
      > = [
        [100, "malformed-spec"],
        [101, "abi-missing-or-blocked"],
        [102, "add-rule-failure"],
        [103, "restrict-self-failure"],
        [104, "execve-failure"],
        [105, "supervisor-table-malformed"],
        [106, "realm-clone-failure"],
        [107, "realm-map-write-failure"],
        [108, "child-early-death"],
        [109, "realm-unshare-failure"],
        [110, "overlay-mount-failure"],
        [111, "overlay-umount-failure"],
      ];
      for (const [code, klass] of bandClasses) {
        expect(renderMechanismRefusal(klass)).toBe(
          renderMechanismRefusal(klass, { exitCode: code }),
        );
      }
    } finally {
      fx.cleanup();
    }
  });
});

// ===========================================================================
// GROUP K - COMBINED-APPLICABILITY PROBE OVER THE SECOND PER-INSTANCE LATCH
//
// ===========================================================================

describe("K. combined-applicability probe over the second per-instance latch", () => {
  it("latch lifecycle + argv pin: first engaged invocation pays BOTH forks (probe #1 then the combined arm over [--overlay-probe <nonce dir>] - the per-invocation root IS the nonce dir itself); the ok verdict latches and the second invocation skips EVERY fork (zero extra receipts) while delegating twice", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
      const fake = scriptedOps(() => ({ exitCode: 0 }));
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "k-nonce",
      });
      const o1 = await settle(
        h.ops.exec("first", EXEC_CWD, { onData: () => undefined }),
      );
      expect(o1.ok).toBe(true);
      expect(h.receipts).toHaveLength(2);
      expect(h.receipts[0]?.args).toEqual(["--probe"]);
      expect(h.receipts[1]?.args).toEqual([
        "--overlay-probe",
        `${fx.slot}/.fence-scratch/k-nonce`,
      ]);
      const o2 = await settle(
        h.ops.exec("second", EXEC_CWD, { onData: () => undefined }),
      );
      expect(o2.ok).toBe(true);
      if (o2.ok) expect(o2.value).toEqual({ exitCode: 0 });
      // Second invocation consumed ZERO forks (both latches hot):
      expect(h.receipts).toHaveLength(2);
      expect(fake.calls).toHaveLength(2);
    } finally {
      fx.cleanup();
    }
  });

  it("failed verdicts NEVER latch (self-healing doctrine): a (status=fail, realm=fail) cell refuses TYPED with the detail cells + collapsed stderr stage diagnostic; the next invocation RETRIES the combined arm and settles once it passes (receipt total THREE - one fewer than a no-latch world would pay, because probe #1 stayed latched)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
      const stageDiag = "landlock-helper overlay: failed at mount (errno=95)\n";
      const probes: Array<{ stdin: boolean; actions: Action[] }> = [
        { stdin: false, actions: probePassActions() },
        {
          stdin: false,
          actions: [
            {
              kind: "data",
              stream: "stdout",
              chunk: Buffer.from(
                "landlock-helper overlay realm=fail status=fail\n",
              ),
            },
            {
              kind: "data",
              stream: "stderr",
              chunk: Buffer.from(stageDiag),
            },
            { kind: "exit", code: 1 },
          ],
        },
        { stdin: false, actions: overlayPassActions() },
      ];
      const rec = dataRecorder();
      const fake = scriptedOps(() => ({ exitCode: 0 }));
      const h = makeHarness(fx.state, probes, {
        localOps: fake.ops,
        nonceSource: () => "k-nonce",
      });
      const first = await settle(
        h.ops.exec("first", EXEC_CWD, { onData: rec.onData }),
      );
      expectRefusal(
        first,
        renderMechanismRefusal("overlay-probe-refused", {
          combinedRealm: "fail",
          combinedStatus: "fail",
          combinedStage: stageDiag,
        }),
      );
      // Silent-law purity: zero stream leakage into the tool channel.
      expect(rec.chunks).toHaveLength(0);
      expect(h.receipts).toHaveLength(2);
      const second = await settle(
        h.ops.exec("second", EXEC_CWD, { onData: () => undefined }),
      );
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.value).toEqual({ exitCode: 0 });
      expect(h.receipts).toHaveLength(3);
      expect(fake.calls).toHaveLength(1);
    } finally {
      fx.cleanup();
    }
  });

  it("abnormal battery (every non-refused bad reading degrades to the committed abnormal line with the degradation slots; ZERO delegate consults + silent-law purity on each leg): garbage stdout, an exit/status mismatch cell, a child error event (null-exit reading), and a sync spawner throw confined to the combined arm", async () => {
    type Leg = {
      name: string;
      probes?: Array<{ stdin: boolean; actions: Action[] }>;
      throwSpawnerFor?: (args: readonly string[]) => boolean;
      expectedLine: string;
    };
    const legs: Leg[] = [
      {
        name: "garbage stdout",
        probes: [
          { stdin: false, actions: probePassActions() },
          {
            stdin: false,
            actions: [
              {
                kind: "data",
                stream: "stdout",
                chunk: Buffer.from("not-a-report\n"),
              },
              { kind: "exit", code: 0 },
            ],
          },
        ],
        expectedLine: renderMechanismRefusal("overlay-probe-abnormal", {
          combinedProbeExit: 0,
          combinedProbeOutput: "not-a-report",
        }),
      },
      {
        name: "cell mismatch (realm=ok, status=fail)",
        probes: [
          { stdin: false, actions: probePassActions() },
          {
            stdin: false,
            actions: [
              {
                kind: "data",
                stream: "stdout",
                chunk: Buffer.from(
                  "landlock-helper overlay realm=ok status=fail\n",
                ),
              },
              { kind: "exit", code: 0 },
            ],
          },
        ],
        expectedLine: renderMechanismRefusal("overlay-probe-abnormal", {
          combinedProbeExit: 0,
          combinedProbeOutput: "landlock-helper overlay realm=ok status=fail",
        }),
      },
      {
        name: "child error event (null-exit reading)",
        probes: [
          { stdin: false, actions: probePassActions() },
          {
            stdin: false,
            actions: [{ kind: "error", message: "spawn fault" }],
          },
        ],
        expectedLine: renderMechanismRefusal("overlay-probe-abnormal", {
          combinedProbeExit: null,
          combinedProbeOutput: "",
        }),
      },
      {
        name: "sync spawner throw confined to the combined arm",
        throwSpawnerFor: (args) => args[0] === "--overlay-probe",
        expectedLine: renderMechanismRefusal("overlay-probe-abnormal", {
          combinedProbeExit: null,
          combinedProbeOutput: "",
        }),
      },
    ];
    for (const leg of legs) {
      const fx = openEngagedRoot();
      try {
        fx.state.enterCapability(RESEARCH);
        fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
        const rec = dataRecorder();
        const recorder = recorderOps();
        const h = makeHarness(
          fx.state,
          leg.probes ?? [
            { stdin: false, actions: probePassActions() },
            { stdin: false, actions: overlayPassActions() },
          ],
          {
            localOps: recorder.ops,
            nonceSource: () => "k-nonce",
            ...(leg.throwSpawnerFor !== undefined
              ? { throwSpawnerFor: leg.throwSpawnerFor }
              : {}),
          },
        );
        const outcome = await settle(
          h.ops.exec(`leg ${leg.name}`, EXEC_CWD, { onData: rec.onData }),
        );
        expectRefusal(outcome, leg.expectedLine);
        expect(rec.chunks).toHaveLength(0);
        expect(recorder.calls).toHaveLength(0);
      } finally {
        fx.cleanup();
      }
    }
  });

  it("probe #1 STILL precedes the combined arm (ordered receipts over the spawner seam - Landlock applicability gates before vehicle applicability even though both apply inside the composed chain)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      fx.state.attachPhase("impl", [`${fx.slot}/research/a.md`], true, false);
      const fake = scriptedOps(() => ({ exitCode: 0 }));
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "k-nonce",
      });
      const outcome = await settle(
        h.ops.exec("ordering", EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(true);
      expect(h.receipts.map((receipt) => receipt.args[0])).toEqual([
        "--probe",
        "--overlay-probe",
      ]);
    } finally {
      fx.cleanup();
    }
  });
});

// ===========================================================================
// GROUP L - MANIFEST WALK -> VERDICT -> SELECTIVE COMMIT MATRIX
// ===========================================================================

describe("L. manifest walk -> verdict -> selective commit (scripted local-ops stand in for the child physics; seeded uppers over real mkdtemp roots)", () => {
  it("happy chain - pre-existing append (seeded leaf modified through the CoW view): exact final bytes in the real environment; CLEAN transcript (no standing note, no discard line, raw chunks only); scratch torn down; no staging residue", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      writeFileSync(leaf, "lower-v0");
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        box.push(Buffer.from("raw-chunk\n"));
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, { files: { "a.md": "committed-v1" } });
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "l-nonce",
      });
      const outcome = await settle(
        h.ops.exec("append", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(readFileSync(leaf, "utf8")).toBe("committed-v1");
      // Clean transcript: raw chunk ONLY (no discard line, no standing
      // note - exit 0 with zero discards).
      expect(rec.chunks.map((c) => c.toString("utf8"))).toEqual([
        "raw-chunk\n",
      ]);
      expect(existsSync(`${fx.slot}/.fence-scratch/l-nonce`)).toBe(false);
      expect(readdirSync(`${fx.slot}/research`).sort()).toEqual(["a.md"]);
    } finally {
      fx.cleanup();
    }
  });

  it("happy chain - not-yet-existing CREATE (absent leaf at spawn): created-through-the-merged-view seed commits into the real environment; clean transcript; exact final bytes", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/new.md`;
      mkdirSync(`${fx.slot}/research`);
      // Leaf ABSENT at spawn time: engagement is declarative under the
      // files-only invariant - the planner reads no disk, so an absent leaf
      // engages exactly as a present one does.
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, { files: { "new.md": "created-bytes" } });
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "l-nonce",
      });
      const outcome = await settle(
        h.ops.exec("create", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(existsSync(leaf)).toBe(true);
      if (existsSync(leaf)) {
        expect(readFileSync(leaf, "utf8")).toBe("created-bytes");
      }
      expect(rec.chunks).toHaveLength(0);
      expect(existsSync(`${fx.slot}/.fence-scratch/l-nonce`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("sibling-discard golden (off-frame sibling in the upper NEVER lands; discard note fired with byte-exact expectation over the RIDDEN vector listing; exit-0 corner covered - masked exit codes cannot suppress the machine-derived disclosure)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, {
          files: { "a.md": "keep", "sib.txt": "drop" },
        });
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "l-nonce",
      });
      const outcome = await settle(
        h.ops.exec("sibling", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(readFileSync(leaf, "utf8")).toBe("keep");
      const sibTarget = `${fx.slot}/research/sib.txt`;
      expect(existsSync(sibTarget)).toBe(false);
      const envelope = `${fx.slot}/research`;
      const listing = engagedListing([envelope, "/dev", fx.ws], fx.ws);
      expect(rec.chunks.map((c) => c.toString("utf8"))).toEqual([
        `\n${DISCARD_HEAD}${sibTarget}. Allowed targets: ${listing}.\n`,
      ]);
      expect(existsSync(`${fx.slot}/.fence-scratch/l-nonce`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("multi-entry deterministic order (sorted top-down DFS over mixed kinds: directory ensure BEFORE its children by construction; subtree admission via the declared token's prefix form; off-list junk discarded + noted once)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability({
        name: "multi",
        writes: ["research/*.md", "research/sub"],
        allowProjectWrites: true,
      });
      const leaf = `${fx.slot}/research/a.md`;
      const subDir = `${fx.slot}/research/sub`;
      mkdirSync(`${fx.slot}/research`);
      // Both declared tokens are file leaves sharing ONE envelope (files-
      // only invariant, declaration-order dedupe - a single mount); the
      // sub token's SUBTREE rides the verdict's declared-token prefix form
      // below.
      fx.state.attachPhase("impl", [leaf, subDir], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, {
          files: { "a.md": "one", "sub/in.md": "inside" },
          dirs: ["sub"],
        });
        seedUpperTree(triple.upper, { files: { "junk.bin": "junk" } });
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "l-nonce",
      });
      const outcome = await settle(
        h.ops.exec("multi", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      expect(readFileSync(leaf, "utf8")).toBe("one");
      expect(readFileSync(`${subDir}/in.md`, "utf8")).toBe("inside");
      expect(existsSync(`${fx.slot}/research/junk.bin`)).toBe(false);
      const listing = engagedListing(
        [`${fx.slot}/research`, "/dev", fx.ws],
        fx.ws,
      );
      expect(rec.chunks.map((c) => c.toString("utf8"))).toEqual([
        `\n${DISCARD_HEAD}${fx.slot}/research/junk.bin. Allowed targets: ${listing}.\n`,
      ]);
      expect(existsSync(`${fx.slot}/.fence-scratch/l-nonce`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("undecidable-kind discard (fifo + symlink entries seeded - conservative readings never commit, never crash; discard note lists every undecidable target in deterministic sorted top-down manifest order)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, {
          files: { "a.md": "keep" },
          symlinks: { lnk: leaf },
          fifos: ["pipe"],
        });
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "l-nonce",
      });
      const outcome = await settle(
        h.ops.exec("undecidable", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(readFileSync(leaf, "utf8")).toBe("keep");
      expect(existsSync(`${fx.slot}/research/lnk`)).toBe(false);
      expect(existsSync(`${fx.slot}/research/pipe`)).toBe(false);
      const listing = engagedListing(
        [`${fx.slot}/research`, "/dev", fx.ws],
        fx.ws,
      );
      const names = readdirSync(`${fx.slot}/research`).sort();
      expect(names).toEqual(["a.md"]);
      const dropped = [
        `${fx.slot}/research/lnk`,
        `${fx.slot}/research/pipe`,
      ].sort();
      expect(rec.chunks.map((c) => c.toString("utf8"))).toEqual([
        `\n${DISCARD_HEAD}${dropped.join(", ")}. Allowed targets: ${listing}.\n`,
      ]);
    } finally {
      fx.cleanup();
    }
  });

  it("mid-commit fault (best-forward typed refusal): a second entry whose real target is a PRE-EXISTING DIRECTORY makes the atomic rename fault mid-commit - the op refuses with the module-owned settlement-fault head + guarantee sentence, earlier-committed admitted entries STAND (best-forward), the faulty target stays its original directory (no half-written replacement), scratch torn down, no surviving staging", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      const blockedDir = `${fx.slot}/research/zblocked.md`;
      mkdirSync(`${fx.slot}/research`);
      mkdirSync(blockedDir); // real target pre-exists as a DIRECTORY
      fx.state.attachPhase("impl", [leaf, blockedDir], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, {
          files: { "a.md": "first-writer", "zblocked.md": "text-content" },
        });
        return { exitCode: 0 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "l-nonce",
      });
      const outcome = await settle(
        h.ops.exec("midcommit", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        const message = errorMessage(outcome.error);
        expect(message.startsWith(SETTLE_HEAD)).toBe(true);
        expect(message).toContain(
          "admitted entries committed before the fault stand",
        );
      }
      // Best-forward: the first admitted entry already landed.
      expect(readFileSync(leaf, "utf8")).toBe("first-writer");
      // The faulty target is UNTOUCHED (still a directory, not a file).
      expect(existsSync(blockedDir)).toBe(true);
      if (existsSync(blockedDir)) {
        const info = lstatSync(blockedDir);
        expect(info.isDirectory()).toBe(true);
      }
      // Scratch fully torn down; no staged residue anywhere in the real dir.
      expect(existsSync(`${fx.slot}/.fence-scratch/l-nonce`)).toBe(false);
      expect(readdirSync(`${fx.slot}/research`).sort()).toEqual([
        "a.md",
        "zblocked.md",
      ]);
      // No verdict line over a rejection: channel carries nothing.
      expect(rec.chunks).toHaveLength(0);
    } finally {
      fx.cleanup();
    }
  });

  it("off-list entries TRAPPED until teardown + last-writer-wins content on sequential walks (presence captured INSIDE the run proves the trap held; post-run the real environment shows only the committed bytes; two sequential engaged walks over the same declared leaf converge under plain POSIX parity - distinct nonces, distinct staging names, final content = second writer)", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      writeFileSync(leaf, "original");
      fx.state.attachPhase("impl", [leaf], true, false);
      let trappedDuringRun: boolean | undefined;
      const fake1 = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, {
          files: { "a.md": "first-writer", "trap.txt": "never-lands" },
        });
        trappedDuringRun = existsSync(join(triple.upper, "trap.txt"));
        return { exitCode: 0 };
      });
      const h1 = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake1.ops,
        nonceSource: () => "nonce-a",
      });
      const o1 = await settle(
        h1.ops.exec("walk one", EXEC_CWD, { onData: () => undefined }),
      );
      expect(o1.ok).toBe(true);
      expect(trappedDuringRun).toBe(true);
      expect(readFileSync(leaf, "utf8")).toBe("first-writer");
      expect(existsSync(`${fx.slot}/research/trap.txt`)).toBe(false);
      // Second sequential walk over the SAME declaring window (fresh ops
      // instance, fresh nonce) - converges onto the second writer's bytes.
      const fake2 = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, { files: { "a.md": "second-writer" } });
        return { exitCode: 0 };
      });
      const h2 = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake2.ops,
        nonceSource: () => "nonce-b",
      });
      const o2 = await settle(
        h2.ops.exec("walk two", EXEC_CWD, { onData: () => undefined }),
      );
      expect(o2.ok).toBe(true);
      expect(readFileSync(leaf, "utf8")).toBe("second-writer");
      // Full hygiene after BOTH walks: only the declared leaf survives in
      // the real directory; the persistent hidden parent may remain (empty
      // children are tolerated) but NO nonce dirs and NO staging survive.
      const researchNames = readdirSync(`${fx.slot}/research`).sort();
      expect(researchNames).toEqual(["a.md"]);
      const scratchParent = `${fx.slot}/.fence-scratch`;
      if (existsSync(scratchParent)) {
        expect(readdirSync(scratchParent)).toEqual([]);
      }
    } finally {
      fx.cleanup();
    }
  });
});

// ===========================================================================
// GROUP M - KILL/TIMEOUT/ABORT DISCARD-ALL + EXTENDED BAND SETTLEMENT
//
// ===========================================================================

describe("M. kill/timeout/abort discard-all + extended band settlement over the composed chain", () => {
  it("delegate rejects propagate VERBATIM (aborted / timeout contract bytes) AND drive discard-all teardown: NOTHING committed, NO verdict line, NO standing note, zero stream leakage, scratch root REMOVED", async () => {
    for (const contractBytes of ["aborted", "timeout"]) {
      const fx = openEngagedRoot();
      try {
        fx.state.enterCapability(RESEARCH);
        const leaf = `${fx.slot}/research/a.md`;
        mkdirSync(`${fx.slot}/research`);
        writeFileSync(leaf, "pristine-lower");
        fx.state.attachPhase("impl", [leaf], true, false);
        const rec = dataRecorder();
        const seeded: string[] = [];
        const fake = scriptedOps((box) => {
          const triple = triplesOf(box.cmd)[0]!;
          seedUpperTree(triple.upper, {
            files: { "a.md": "would-commit", "off.bin": "trapped" },
          });
          seeded.push(triple.upper);
          return { reject: new Error(contractBytes) };
        });
        const h = makeHarness(fx.state, twoProbePreamble(), {
          localOps: fake.ops,
          nonceSource: () => "m-nonce",
        });
        const outcome = await settle(
          h.ops.exec("killable", EXEC_CWD, { onData: rec.onData }),
        );
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(errorMessage(outcome.error)).toBe(contractBytes);
        }
        // Verbatim contract bytes carried; nothing else appended.
        expect(rec.chunks).toHaveLength(0);
        // Discard-all: real environment PRISTINE (the would-be commit did
        // NOT land; the trapped entry never existed there).
        expect(readFileSync(leaf, "utf8")).toBe("pristine-lower");
        expect(existsSync(`${fx.slot}/research/off.bin`)).toBe(false);
        expect(existsSync(`${fx.slot}/.fence-scratch/m-nonce`)).toBe(false);
      } finally {
        fx.cleanup();
      }
    }
  });

  it("resolved exitCode null (killed domain, neither abort nor timeout flagged): resolves { exitCode: null } WITH discard-all (nothing lands, no notes) - the conservative reading over an opaque death", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      writeFileSync(leaf, "pristine-lower");
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, { files: { "a.md": "would-commit" } });
        return { exitCode: null };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "m-nonce",
      });
      const outcome = await settle(
        h.ops.exec("null-exit", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: null });
      expect(readFileSync(leaf, "utf8")).toBe("pristine-lower");
      expect(rec.chunks).toHaveLength(0);
      expect(existsSync(`${fx.slot}/.fence-scratch/m-nonce`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("in-band settlement over the EXTENDED vocabulary (data-driven loop over ALL TWELVE assigned classes 100-111 incl. every new realm class + reserved-band samples 112/150): each reads conservatively THROUGH THE FULL CHAIN - discard-all teardown THEN the typed refusal byte-equal against the shared family renderer (single-source check - never a duplicated literal); NOTHING commits on any of them; no notes ride rejections", async () => {
    const table: Array<[number, Parameters<typeof renderMechanismRefusal>[0]]> =
      [
        [100, "malformed-spec"],
        [101, "abi-missing-or-blocked"],
        [102, "add-rule-failure"],
        [103, "restrict-self-failure"],
        [104, "execve-failure"],
        [105, "supervisor-table-malformed"],
        [106, "realm-clone-failure"],
        [107, "realm-map-write-failure"],
        [108, "child-early-death"],
        [109, "realm-unshare-failure"],
        [110, "overlay-mount-failure"],
        [111, "overlay-umount-failure"],
      ];
    const reserved = [112, 150];
    for (const [code, klass] of [
      ...table,
      ...reserved.map(
        (r) =>
          [r, "band-reserved"] as [
            number,
            Parameters<typeof renderMechanismRefusal>[0],
          ],
      ),
    ]) {
      const fx = openEngagedRoot();
      try {
        fx.state.enterCapability(RESEARCH);
        const leaf = `${fx.slot}/research/a.md`;
        mkdirSync(`${fx.slot}/research`);
        writeFileSync(leaf, "pristine-lower");
        fx.state.attachPhase("impl", [leaf], true, false);
        const rec = dataRecorder();
        const fake = scriptedOps((box) => {
          const triple = triplesOf(box.cmd)[0]!;
          seedUpperTree(triple.upper, { files: { "a.md": "would-commit" } });
          return { exitCode: code };
        });
        const h = makeHarness(fx.state, twoProbePreamble(), {
          localOps: fake.ops,
          nonceSource: () => "m-nonce",
        });
        const outcome = await settle(
          h.ops.exec(`band ${code}`, EXEC_CWD, { onData: rec.onData }),
        );
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(errorMessage(outcome.error)).toBe(
            renderMechanismRefusal(klass, { exitCode: code }),
          );
        }
        expect(readFileSync(leaf, "utf8")).toBe("pristine-lower");
        expect(rec.chunks).toHaveLength(0);
        expect(existsSync(`${fx.slot}/.fence-scratch/m-nonce`)).toBe(false);
      } finally {
        fx.cleanup();
      }
    }
  });

  it("out-of-band passthrough over the engaged path (exit 42): selective COMMIT proceeds (on-list lands, off-list traps + notes) and BOTH voice artifacts fire in pinned order raw -> discard -> standing - the full-channel byte stream pinned exactly", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      fx.state.attachPhase("impl", [leaf], true, false);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        box.push(Buffer.from("raw\n"));
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, {
          files: { "a.md": "landed", "off.txt": "trapped" },
        });
        return { exitCode: 42 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "m-nonce",
      });
      const outcome = await settle(
        h.ops.exec("passthrough", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 42 });
      expect(readFileSync(leaf, "utf8")).toBe("landed");
      expect(existsSync(`${fx.slot}/research/off.txt`)).toBe(false);
      const envelope = `${fx.slot}/research`;
      const listing = engagedListing([envelope, "/dev", fx.ws], fx.ws);
      const NOTE_TEMPLATE_LOCAL =
        "Note: a per-phase Landlock write restriction is in effect and denied writes surface as permission errors in the command's own output. Landlock may be blocking changes to certain files due to lack of permissions in the current phase. Allowed targets: ";
      expect(rec.chunks.map((c) => c.toString("utf8"))).toEqual([
        "raw\n",
        `\n${DISCARD_HEAD}${fx.slot}/research/off.txt. Allowed targets: ${listing}.\n`,
        `\n${NOTE_TEMPLATE_LOCAL}${listing}.\n`,
      ]);
      expect(existsSync(`${fx.slot}/.fence-scratch/m-nonce`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });
});

// ===========================================================================
// GROUP N - VEHICLE-ESTABLMENT FAULTS OVER THE COMPOSED CHAIN
// ===========================================================================

describe("N. vehicle-establishment faults and post-delegate vehicle deaths over the composed chain", () => {
  const countLocal = (): { ops: BashOperations; seen: string[] } => {
    const seen: string[] = [];
    return {
      seen,
      ops: {
        async exec(command: string): Promise<{ exitCode: number | null }> {
          seen.push(command.slice(0, 48));
          return { exitCode: 0 };
        },
      },
    };
  };

  const engagedState = (
    fx: ReturnType<typeof openEngagedRoot>,
  ): { state: SessionExecutionState; leaf: string } => {
    fx.state.enterCapability(RESEARCH);
    const leaf = `${fx.slot}/research/a.md`;
    mkdirSync(`${fx.slot}/research`);
    fx.state.attachPhase("impl", [leaf], true, false);
    return { state: fx.state, leaf };
  };

  it("pre-child probe-one ABNORMAL (garbage reading, foreign exit): typed refusal byte-equal the shared family renderer over the exact ctx the module composes (probeExit + raw output slot); exactly ONE fork total (the combined probe never runs); ZERO delegate consults; the minted scratch torn down without residue", async () => {
    const fx = openEngagedRoot();
    try {
      const { state } = engagedState(fx);
      const counted = countLocal();
      const h = makeHarness(
        state,
        [
          {
            stdin: false,
            actions: [
              {
                kind: "data",
                stream: "stdout" as const,
                chunk: Buffer.from("gibberish\n"),
              },
              { kind: "exit", code: 3 },
            ],
          },
        ],
        {
          localOps: counted.ops,
          nonceSource: () => "n-abn",
        },
      );
      const outcome = await settle(
        h.ops.exec("one", EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(errorMessage(outcome.error)).toBe(
          renderMechanismRefusal("probe-abnormal", {
            probeExit: 3,
            probeOutput: "gibberish",
          }),
        );
      }
      expect(counted.seen).toHaveLength(0);
      expect(h.receipts).toHaveLength(1);
      expect(h.receipts[0]!.args[0]).toBe("--probe");
      expect(existsSync(`${fx.slot}/.fence-scratch/n-abn`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("pre-child probe-one REFUSED form (parsed fail report over the contract exit 101): the ABI detail slots ride the renderer ctx verbatim (discovered vs pinned); one fork, zero delegates", async () => {
    const fx = openEngagedRoot();
    try {
      const { state } = engagedState(fx);
      const counted = countLocal();
      const h = makeHarness(
        state,
        [
          {
            stdin: false,
            actions: [
              {
                kind: "data",
                stream: "stdout" as const,
                chunk: Buffer.from(
                  "landlock-helper probe abi=8 pin=7 status=fail\n",
                ),
              },
              { kind: "exit", code: 101 },
            ],
          },
        ],
        {
          localOps: counted.ops,
          nonceSource: () => "n-ref",
        },
      );
      const outcome = await settle(
        h.ops.exec("refused", EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(errorMessage(outcome.error)).toBe(
          renderMechanismRefusal("probe-refused", {
            discoveredAbi: 8,
            pinnedAbi: 7,
          }),
        );
      }
      expect(counted.seen).toHaveLength(0);
      expect(h.receipts).toHaveLength(1);
    } finally {
      fx.cleanup();
    }
  });

  it("pre-child COMBINED-probe REFUSED form (realm-fail/status-fail report + stage diagnostics on stderr): TWO forks (probe-one passed, combined refused); ZERO delegate consults; the stage string rides the ctx untouched", async () => {
    const fx = openEngagedRoot();
    try {
      const { state } = engagedState(fx);
      const counted = countLocal();
      const diag = "landlock-helper overlay: failed at mount (errno=95)\n";
      const h = makeHarness(
        state,
        [
          { stdin: false, actions: probePassActions() },
          {
            stdin: false,
            actions: [
              {
                kind: "data",
                stream: "stdout" as const,
                chunk: Buffer.from(
                  "landlock-helper overlay realm=fail status=fail\n",
                ),
              },
              {
                kind: "data",
                stream: "stderr" as const,
                chunk: Buffer.from(diag),
              },
              { kind: "exit", code: 1 },
            ],
          },
        ],
        {
          localOps: counted.ops,
          nonceSource: () => "n-comb",
        },
      );
      const outcome = await settle(
        h.ops.exec("combined-refused", EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(errorMessage(outcome.error)).toBe(
          renderMechanismRefusal("overlay-probe-refused", {
            combinedRealm: "fail",
            combinedStatus: "fail",
            combinedStage: diag,
          }),
        );
      }
      expect(counted.seen).toHaveLength(0);
      expect(h.receipts).toHaveLength(2);
      expect(h.receipts[0]!.args[0]).toBe("--probe");
      expect(h.receipts[1]!.args[0]).toBe("--overlay-probe");
    } finally {
      fx.cleanup();
    }
  });

  it("pre-child COMBINED-probe ABNORMAL form (unparseable output): the two-fork shape holds; the raw exit-code slot rides the ctx; nothing delegated, scratch clean", async () => {
    const fx = openEngagedRoot();
    try {
      const { state } = engagedState(fx);
      const counted = countLocal();
      const h = makeHarness(
        state,
        [
          { stdin: false, actions: probePassActions() },
          { stdin: false, actions: [{ kind: "exit", code: 109 }] },
        ],
        {
          localOps: counted.ops,
          nonceSource: () => "n-comb-abn",
        },
      );
      const outcome = await settle(
        h.ops.exec("combined-abnormal", EXEC_CWD, { onData: () => undefined }),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(errorMessage(outcome.error)).toBe(
          renderMechanismRefusal("overlay-probe-abnormal", {
            combinedProbeExit: 109,
            combinedProbeOutput: "",
          }),
        );
      }
      expect(counted.seen).toHaveLength(0);
      expect(h.receipts).toHaveLength(2);
      expect(existsSync(`${fx.slot}/.fence-scratch/n-comb-abn`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("post-delegate vehicle deaths (the realm band 105-111 over the full chain, data-driven): the vehicle dies AFTER establishment; each code reads conservatively THROUGH SETTLEMENT - discard-all teardown, NOTHING commits, the channel carries the typed refusal ONLY (no notes ride rejections); every byte equal to the single-source family renderer (one class per code - no duplicated literals anywhere)", async () => {
    const codes: ReadonlyArray<
      [number, Parameters<typeof renderMechanismRefusal>[0]]
    > = [
      [105, "supervisor-table-malformed"],
      [106, "realm-clone-failure"],
      [107, "realm-map-write-failure"],
      [108, "child-early-death"],
      [109, "realm-unshare-failure"],
      [110, "overlay-mount-failure"],
      [111, "overlay-umount-failure"],
    ];
    for (const [code, klass] of codes) {
      const fx = openEngagedRoot();
      try {
        const { state, leaf } = engagedState(fx);
        writeFileSync(leaf, "pristine-lower");
        const rec = dataRecorder();
        const fake = scriptedOps((box) => {
          const triple = triplesOf(box.cmd)[0]!;
          seedUpperTree(triple.upper, { files: { "a.md": "would-commit" } });
          return { exitCode: code };
        });
        const h = makeHarness(state, twoProbePreamble(), {
          localOps: fake.ops,
          nonceSource: () => `n-veh-${code}`,
        });
        const outcome = await settle(
          h.ops.exec(`vehicle ${code}`, EXEC_CWD, { onData: rec.onData }),
        );
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(errorMessage(outcome.error)).toBe(
            renderMechanismRefusal(klass, { exitCode: code }),
          );
        }
        expect(readFileSync(leaf, "utf8")).toBe("pristine-lower");
        expect(rec.chunks).toHaveLength(0);
        expect(existsSync(`${fx.slot}/.fence-scratch/n-veh-${code}`)).toBe(
          false,
        );
      } finally {
        fx.cleanup();
      }
    }
  });
});

// ===========================================================================
// GROUP O - VOICE ARTIFACT GOLDENS OVER THE ENGAGED CHANNEL
// ===========================================================================

/** The shipped standing-note template (mirror copy - the single owner lives
 * in the module; the cross-file equivalence is the whole point of the row). */
const STANDING_NOTE_MIRROR =
  "Note: a per-phase Landlock write restriction is in effect and denied writes surface as permission errors in the command's own output. Landlock may be blocking changes to certain files due to lack of permissions in the current phase. Allowed targets: ";

describe("O. voice artifact goldens (template ownership, placement order, case-trap separation, non-circular listing bound)", () => {
  it("template single-ownership (source scan over the module): each note template is declared EXACTLY ONCE; the standing template renders at exactly its TWO call sites (pure + engaged - identical framing bytes at both); the discard template renders at its single engaged call site; the empty-listing 'none' fallback has exactly ONE owner expression; the denial-vocabulary phrase NEVER leaks into the standing template (voice separation - the two channels must not share bytes beyond the listing projection)", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./landlock-bash.ts", import.meta.url)),
      "utf8",
    );
    const slice = src.slice(src.indexOf("VEHICLE FACT"));
    expect(slice.split("const STANDING_NOTE_TEMPLATE =").length - 1).toBe(1);
    expect(slice.split("const DISCARD_NOTE_TEMPLATE =").length - 1).toBe(1);
    expect(src.split("$" + "{STANDING_NOTE_TEMPLATE}").length - 1).toBe(2);
    expect(src.split("$" + "{DISCARD_NOTE_TEMPLATE}").length - 1).toBe(1);
    expect(src.split('parts.length === 0 ? "none"').length - 1).toBe(1);
    const standingLiteral =
      src.match(/const STANDING_NOTE_TEMPLATE\s*=\s*[\s\S]*?";/)?.[0] ?? "";
    expect(standingLiteral).toContain(STANDING_NOTE_MIRROR);
    expect(standingLiteral.includes("Writing is refused")).toBe(false);
  });

  it("engagement proof + standing-note-ONLY channel (non-zero exit, EVERY entry admitted, no raw output): the data stream carries EXACTLY ONE chunk - the standing note whose listing is rendered from the PLAN-DERIVED kernel vector (computed via the independent planner entry point, never from the channel itself - non-circular bind): envelope elements raw, /dev dropped, workspace cwd mapped to its project-files clause; the committed leaf lands; scratch clean", async () => {
    const fx = openEngagedRoot();
    try {
      fx.state.enterCapability(RESEARCH);
      const leaf = `${fx.slot}/research/a.md`;
      mkdirSync(`${fx.slot}/research`);
      fx.state.attachPhase("impl", [leaf], true, false);
      const plan = composeSpawnPlan(fx.state.snapshot());
      if (plan.kind !== "ready") {
        throw new Error(
          `unexpected plan kind over the test window: ${plan.kind}`,
        );
      }
      expect(plan.engaged).toBe(true);
      const listing = engagedListing(plan.kernelVector, fx.ws);
      const rec = dataRecorder();
      const fake = scriptedOps((box) => {
        const triple = triplesOf(box.cmd)[0]!;
        seedUpperTree(triple.upper, { files: { "a.md": "landed-by-plan" } });
        return { exitCode: 7 };
      });
      const h = makeHarness(fx.state, twoProbePreamble(), {
        localOps: fake.ops,
        nonceSource: () => "o-nonce",
      });
      const outcome = await settle(
        h.ops.exec("note-only", EXEC_CWD, { onData: rec.onData }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 7 });
      expect(readFileSync(leaf, "utf8")).toBe("landed-by-plan");
      expect(rec.chunks.map((c) => c.toString("utf8"))).toEqual([
        `\n${STANDING_NOTE_MIRROR}${listing}.\n`,
      ]);
      expect(listing).not.toContain("/dev");
      expect(listing).toContain(`project files under ${fx.ws}`);
      expect(existsSync(`${fx.slot}/.fence-scratch/o-nonce`)).toBe(false);
    } finally {
      fx.cleanup();
    }
  });

  it("case-trap separation (the lowercase empty-listing word vs the denial-vocabulary constant): the universal denial line is byte-pinned to the imported constant (capital-N owner name, lowercase body); the module's empty-projection fallback is the SOLE other owner of the lowercase word; an engaged listing over a live vector can NEVER emit the word (at least one raw element always survives the /dev drop) - the two surfaces stay orthogonal by construction", () => {
    expect(UNIVERSAL_NO_PERMISSION_DENIAL).toBe(
      "Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.",
    );
    const src = readFileSync(
      fileURLToPath(new URL("./landlock-bash.ts", import.meta.url)),
      "utf8",
    );
    // The ONLY occurrence of the bare lowercase token in the module is the
    // projection fallback (the denial line itself lives in the vocabulary
    // module - zero duplication by construction).
    expect(src.split('return parts.length === 0 ? "none"').length - 1).toBe(1);
    // A live engaged vector projects at least one element - the word is
    // structurally unreachable over engaged windows (independent render).
    const st = new SessionExecutionState({
      projectSlotRoot: () => SLOT_ROOT,
      workspaceCwd: () => WORKSPACE_CWD,
    });
    st.enterCapability(RESEARCH);
    st.attachPhase("impl", [KEPT_A], true, false);
    const plan = composeSpawnPlan(st.snapshot());
    if (plan.kind !== "ready") {
      throw new Error(
        `unexpected plan kind over the case-trap window: ${plan.kind}`,
      );
    }
    expect(engagedListing(plan.kernelVector, WORKSPACE_CWD)).not.toContain(
      "none",
    );
  });
});

// ===========================================================================
// GROUP P - REAL-SYSCALL LEGS (production wiring: default spawner, default
// local ops - the vendored carrier actually executes; host-gated at
// collection time by the combined overlay probe, skip-with-reason on
// deficient hosts; THIS host is provisioned so the legs execute)
// ===========================================================================

interface OverlayLatch {
  readonly usable: boolean;
  readonly reason: string;
  readonly reportLine: string;
}

const OVERLAY_LATCH: OverlayLatch = (() => {
  try {
    const helperPath = resolveLandlockHelperPath();
    if (helperPath === null) {
      return { usable: false, reason: "helper-path-unmapped", reportLine: "" };
    }
    const root = mkdtempSync(join(os.tmpdir(), "pio-overlay-latch-"));
    const r = spawnSync(helperPath, ["--overlay-probe", root]);
    rmSync(root, { recursive: true, force: true });
    const line = (Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.alloc(0))
      .toString("utf8")
      .trim();
    if (r.status === 0) {
      const report = parseOverlayProbeReport(line);
      if (report !== null && report.realm === "ok" && report.status === "ok") {
        return { usable: true, reason: "provisioned", reportLine: line };
      }
      return {
        usable: false,
        reason: `report=${JSON.stringify(report)}`,
        reportLine: line,
      };
    }
    return {
      usable: false,
      reason: `exit=${r.status} stderr=${r.stderr.toString("utf8").slice(0, 120)}`,
      reportLine: line,
    };
  } catch (err) {
    return { usable: false, reason: String(err), reportLine: "" };
  }
})();

describe.skipIf(!OVERLAY_LATCH.usable)(
  `P. real-syscall legs (host gate: ${OVERLAY_LATCH.reason})`,
  () => {
    it("real restricted WRITE PHYSICS - create-new over an ABSENT lower leaf: the composed chain actually executes (delegated script IS the composed form); the granted write LANDS (upper -> selective commit); a same-run off-list write is DENIED by the in-bubble policy (the fence is SELECTIVE, not merely slow); exit 0 with a CLEAN transcript (zero chunks - the success-gate appends nothing); the scratch child torn down", async () => {
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leaf = `${slot}/research/a.md`;
      const rogue = `${slot}/rogue.txt`;
      const state = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state.enterCapability(RESEARCH);
      state.attachPhase("impl", [leaf], true, false);
      const chunks: Buffer[] = [];
      const ops = createLandlockBashOperations(ws, state);
      const t0 = Date.now();
      const outcome = await settle(
        ops.exec(
          `printf 'OK\\n' > '${leaf}' || echo LEAF-DENIED-BAD; printf 'X\\n' > '${rogue}' || true`,
          ws,
          { onData: (c: Buffer) => chunks.push(c), timeout: 30 },
        ),
      );
      const wall = Date.now() - t0;
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(wall).toBeGreaterThan(0);
      expect(existsSync(leaf)).toBe(true);
      if (existsSync(leaf)) {
        expect(readFileSync(leaf, "utf8")).toBe("OK\n");
      }
      // Selectivity proof: the off-list target never landed.
      expect(existsSync(rogue)).toBe(false);
      // Selectivity proof over the channel: the off-list target's own shell
      // error surfaced from INSIDE the bubble (denied by policy); NO voice
      // artifact fired because the compound command still exited 0.
      const joined = chunks.map((c) => c.toString("utf8")).join("");
      expect(joined).toContain("Permission denied");
      expect(joined).not.toContain("Note:");
      // Scratch hygiene: any surviving nonce child dir would be residue.
      const scratchParent = `${slot}/.fence-scratch`;
      if (existsSync(scratchParent)) {
        expect(readdirSync(scratchParent)).toEqual([]);
      }
      rmSync(root, { recursive: true, force: true });
    }, 60_000);

    it("real COPY-UP append physics over a PRE-EXISTING lower leaf: the in-bubble append copy-ups into the upper layer; settlement commits the merged content to the real environment; exit 0; transcript clean; lower byte-exact after commit", async () => {
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leaf = `${slot}/research/a.md`;
      writeFileSync(leaf, "ORIGINAL\n");
      const state = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state.enterCapability(RESEARCH);
      state.attachPhase("impl", [leaf], true, false);
      const chunks: Buffer[] = [];
      const ops = createLandlockBashOperations(ws, state);
      const outcome = await settle(
        ops.exec(`printf 'APPENDED\\n' >> '${leaf}'`, ws, {
          onData: (c: Buffer) => chunks.push(c),
          timeout: 30,
        }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      expect(readFileSync(leaf, "utf8")).toBe("ORIGINAL\nAPPENDED\n");
      expect(chunks).toHaveLength(0);
      const scratchParent = `${slot}/.fence-scratch`;
      if (existsSync(scratchParent)) {
        expect(readdirSync(scratchParent)).toEqual([]);
      }
      rmSync(root, { recursive: true, force: true });
    }, 60_000);

    it("real WHITEOUT delete physics + idempotent second pass: deleting a lower file through the merged view forms a KERNEL-NATURAL whiteout in the upper layer (observed mid-run as a character device with rdev zero by external polling - the privileged encoding is unavailable unprivileged outside the bubble, so this leg IS the whiteout physical proof); settlement applies the deletion to the real environment; a second full run over the now-absent leaf settles cleanly again (idempotent - no fault, no note)", async () => {
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leaf = `${slot}/research/a.md`;
      writeFileSync(leaf, "DOOMED\n");
      const state = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state.enterCapability(RESEARCH);
      state.attachPhase("impl", [leaf], true, false);
      const chunks: Buffer[] = [];
      const ops = createLandlockBashOperations(ws, state, {
        nonceSource: () => "p-whiteout",
      });
      const outcome = await settle(
        ops.exec(`rm '${leaf}'; sleep 0.5`, ws, {
          onData: (c: Buffer) => chunks.push(c),
          timeout: 30,
        }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 0 });
      // Whiteout observation: poll the upper layer during the window while
      // the child sleeps AFTER the rm.
      let sawWhiteout = false;
      // (The post-hoc upper is purged at settlement - so re-seed and observe
      // via a dedicated second instance whose command deletes then sleeps,
      // polled from THIS process.)
      const state2 = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state2.enterCapability(RESEARCH);
      state2.attachPhase("impl", [leaf], true, false);
      // First pass already committed the deletion (leaf gone below).
      expect(existsSync(leaf)).toBe(false);
      // Idempotent SECOND pass over the absent leaf: pure no-op settlement.
      const ops2 = createLandlockBashOperations(ws, state2, {
        nonceSource: () => "p-whiteout-2",
      });
      const chunks2: Buffer[] = [];
      const outcome2 = await settle(
        ops2.exec(`true`, ws, {
          onData: (c: Buffer) => chunks2.push(c),
          timeout: 30,
        }),
      );
      expect(outcome2.ok).toBe(true);
      if (outcome2.ok) expect(outcome2.value).toEqual({ exitCode: 0 });
      expect(existsSync(leaf)).toBe(false);
      // Whiteout observation leg (fresh lower file, delete-then-sleep while
      // this process polls the upper): the kernel-formed whiteout must be
      // observable as a char-device entry BEFORE teardown.
      writeFileSync(leaf, "DOOMED-AGAIN\n");
      const state3 = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state3.enterCapability(RESEARCH);
      state3.attachPhase("impl", [leaf], true, false);
      const ops3 = createLandlockBashOperations(ws, state3, {
        nonceSource: () => "p-whiteout-3",
      });
      const upperDir = `${slot}/.fence-scratch/p-whiteout-3/0/upper`; // mirror-root: the whiteout names itself by its RELATIVE position under the mounted envelope
      const pending = ops3.exec(`rm '${leaf}'; sleep 0.8`, ws, {
        onData: () => undefined,
        timeout: 30,
      });
      const deadline = Date.now() + 4_000;
      while (Date.now() < deadline && !sawWhiteout) {
        if (existsSync(upperDir)) {
          for (const name of readdirSync(upperDir)) {
            try {
              const st = lstatSync(`${upperDir}/${name}`);
              if (st.isCharacterDevice() && st.rdev === 0) sawWhiteout = true;
            } catch {
              // transient race - keep polling
            }
          }
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      const out3 = await settle(pending);
      expect(out3.ok).toBe(true);
      if (out3.ok) expect(out3.value).toEqual({ exitCode: 0 });
      expect(existsSync(leaf)).toBe(false);
      expect(sawWhiteout).toBe(true);
      rmSync(root, { recursive: true, force: true });
    }, 90_000);

    it("real OUT-OF-BAND passthrough (exit 42): the code passes through verbatim; the standing note fires with the PLAN-DERIVED listing; the pre-existing lower bytes stay PRISTINE (nothing written in-run)", async () => {
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leaf = `${slot}/research/a.md`;
      writeFileSync(leaf, "pristine-lower\n");
      const state = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state.enterCapability(RESEARCH);
      state.attachPhase("impl", [leaf], true, false);
      const plan = composeSpawnPlan(state.snapshot());
      if (plan.kind !== "ready") {
        throw new Error(`unexpected plan kind: ${plan.kind}`);
      }
      const listing = engagedListing(plan.kernelVector, ws);
      const chunks: Buffer[] = [];
      const ops = createLandlockBashOperations(ws, state);
      const outcome = await settle(
        ops.exec(`true; exit 42`, ws, {
          onData: (c: Buffer) => chunks.push(c),
          timeout: 30,
        }),
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.value).toEqual({ exitCode: 42 });
      expect(readFileSync(leaf, "utf8")).toBe("pristine-lower\n");
      expect(chunks.map((c) => c.toString("utf8"))).toEqual([
        `\n${STANDING_NOTE_MIRROR}${listing}.\n`,
      ]);
      rmSync(root, { recursive: true, force: true });
    }, 60_000);

    it("coincident IN-BAND codes cannot be forced unprivileged (physical-forcing limitation record): the host gate reports realm-ok status-ok (the capability EXISTS here), yet no unprivileged trigger can make the carrier itself emit an assigned-band code post-delegate - those readings are pinned through the SHARED classifier in the hermetic band loops instead; this row asserts the LATCH EVIDENCE byte-stably (parse round-trip over the collection-time report line) so the gating decision itself is auditable", () => {
      const report = parseOverlayProbeReport(OVERLAY_LATCH.reportLine);
      expect(report).not.toBeNull();
      if (report === null) return;
      expect(report.realm).toBe("ok");
      expect(report.status).toBe("ok");
      expect(OVERLAY_LATCH.reportLine).toBe(
        `landlock-helper overlay realm=${report.realm} status=${report.status}`,
      );
    });

    it("ABORTED lineage (AbortSignal.timeout over a long-running restricted command): the delegate rejects with the contract bytes VERBATIM (aborted); NOTHING lands; the scratch child is torn down by the settlement path despite the rejection; bounded wall-clock completion (no hang past the signal deadline plus teardown slack)", async () => {
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leaf = `${slot}/research/a.md`;
      writeFileSync(leaf, "survivor\n");
      const state = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state.enterCapability(RESEARCH);
      state.attachPhase("impl", [leaf], true, false);
      const signal = AbortSignal.timeout(500);
      const ops = createLandlockBashOperations(ws, state);
      const t0 = Date.now();
      const outcome = await settle(
        ops.exec(`sleep 30`, ws, {
          onData: () => undefined,
          signal,
          timeout: 30,
        }),
      );
      const wall = Date.now() - t0;
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(errorMessage(outcome.error)).toBe("aborted");
      }
      expect(wall).toBeLessThan(10_000);
      expect(readFileSync(leaf, "utf8")).toBe("survivor\n");
      const scratchParent = `${slot}/.fence-scratch`;
      if (existsSync(scratchParent)) {
        expect(readdirSync(scratchParent)).toEqual([]);
      }
      rmSync(root, { recursive: true, force: true });
    }, 30_000);

    it("SIGKILL lineage forensics (external SIGKILL of the composed-chain top process, fingerprinted through ps by the scratch NONCE token): settlement still completes within a bounded deadline; afterwards NO live process references the nonce (lineage fully dead - the throwaway doctrine holds under external murder); the lower stays pristine; the scratch child is gone. Degrade-honest: when the host lacks ps the kill step is skipped with a logged note and only the bounded-settlement claim is asserted", async () => {
      const psPath = existsSync("/usr/bin/ps")
        ? "/usr/bin/ps"
        : existsSync("/bin/ps")
          ? "/bin/ps"
          : null;
      if (psPath === null) {
        console.warn(
          "P-SIGKILL: ps binary absent - kill leg degraded (bounded settlement only)",
        );
      }
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leaf = `${slot}/research/a.md`;
      writeFileSync(leaf, "killed-survivor\n");
      const state = new SessionExecutionState({
        projectSlotRoot: () => slot,
        workspaceCwd: () => ws,
      });
      state.enterCapability(RESEARCH);
      state.attachPhase("impl", [leaf], true, false);
      const nonce = "p-killed";
      const ops = createLandlockBashOperations(ws, state, {
        nonceSource: () => nonce,
      });
      const pending = ops.exec(`sleep 30`, ws, {
        onData: () => undefined,
        timeout: 60,
      }); // Wait until the chain is up (nonce visible in some process args).
      const findTopPid = (): number | null => {
        const r = spawnSync(psPath ?? "ps", ["-eo", "pid=,args="]);
        if (r.status !== 0 || psPath === null) return null;
        let minPid: number | null = null;
        const text = (
          Buffer.isBuffer(r.stdout) ? r.stdout : Buffer.alloc(0)
        ).toString("utf8");
        for (const line of text.split("\n")) {
          if (!line.includes(nonce)) continue;
          const pidStr = line.trimStart().split(/\s+/)[0];
          const pid = Number(pidStr);
          if (Number.isFinite(pid) && (minPid === null || pid < minPid))
            minPid = pid;
        }
        return minPid;
      };
      const startDeadline = Date.now() + 5_000;
      let topPid: number | null = null;
      while (Date.now() < startDeadline && topPid === null) {
        topPid = findTopPid();
        await new Promise((r) => setTimeout(r, 50));
      }
      if (topPid !== null && psPath !== null) {
        process.kill(topPid, "SIGKILL");
      }
      // Bounded-settlement watch: the settlement MUST complete on its own
      // within the deadline regardless of how the signal death surfaces -
      // either as the conservative null-exit resolution or a contract-form
      // rejection (both are doctrine-valid readings over an external kill).
      const settleDeadline = Date.now() + 15_000;
      let settledAt: number | null = null;
      let reading: "resolved" | "rejected" = "resolved";
      await pending
        .then((value) => {
          expect(value.exitCode).toBeNull();
          settledAt = Date.now();
        })
        .catch((error: unknown) => {
          reading = "rejected";
          String(error instanceof Error ? error.message : error);
          settledAt = Date.now();
        });
      expect(settledAt).not.toBeNull();
      void reading;
      expect(settledAt !== null && settledAt <= settleDeadline).toBe(true);
      if (topPid !== null) {
        // Lineage forensics: nothing references the nonce anymore.
        expect(findTopPid()).toBeNull();
      }
      expect(readFileSync(leaf, "utf8")).toBe("killed-survivor\n");
      const scratchChild = `${slot}/.fence-scratch/${nonce}`;
      expect(existsSync(scratchChild)).toBe(false);
      rmSync(root, { recursive: true, force: true });
    }, 60_000);

    it("parallel engaged control (two concurrent instances, distinct nonces, ONE persistent parent): both scratch children coexist DURING the overlap window (distinct default-free mint names prove per-spawn isolation); after both settle the parent holds NO children (teardown never removes siblings' entries - each instance purges ONLY its own nonce dir); neither blocks the other", async () => {
      const root = mkdtempSync(join(os.tmpdir(), "pio-p-real-"));
      const slot = `${root}/slot`,
        ws = `${root}/ws`;
      mkdirSync(slot);
      mkdirSync(ws);
      mkdirSync(`${slot}/research`);
      const leafA = `${slot}/research/a.md`;
      const leafB = `${slot}/research/b.md`;
      void leafA;
      void leafB;
      const opsA = createLandlockBashOperations(
        ws,
        (() => {
          const st = new SessionExecutionState({
            projectSlotRoot: () => slot,
            workspaceCwd: () => ws,
          });
          st.enterCapability(RESEARCH);
          st.attachPhase("impl", [`${slot}/research/a.md`], true, false);
          return st;
        })(),
        { nonceSource: () => "par-a" },
      );
      const opsB = createLandlockBashOperations(
        ws,
        (() => {
          const st = new SessionExecutionState({
            projectSlotRoot: () => slot,
            workspaceCwd: () => ws,
          });
          st.enterCapability(RESEARCH);
          st.attachPhase("impl", [`${slot}/research/b.md`], true, false);
          return st;
        })(),
        { nonceSource: () => "par-b" },
      );
      const scratchParent = `${slot}/.fence-scratch`;
      const seenSnapshots: string[][] = [];
      const poller = (async () => {
        const deadline = Date.now() + 4_000;
        while (Date.now() < deadline) {
          if (existsSync(scratchParent)) {
            seenSnapshots.push(readdirSync(scratchParent).sort());
          }
          await new Promise((r) => setTimeout(r, 50));
        }
      })();
      const pA = settle(
        opsA.exec(`sleep 1.6`, ws, { onData: () => undefined, timeout: 30 }),
      );
      const pB = settle(
        opsB.exec(`sleep 0.6`, ws, { onData: () => undefined, timeout: 30 }),
      );
      const [oA, oB] = await Promise.all([pA, pB]);
      await poller;
      expect(oA.ok).toBe(true);
      if (oA.ok) expect(oA.value).toEqual({ exitCode: 0 });
      expect(oB.ok).toBe(true);
      if (oB.ok) expect(oB.value).toEqual({ exitCode: 0 });
      // Both children observed alive at some moment (overlap captured by the
      // polling snapshots - A sleeps well past B's duration).
      const overlapped = seenSnapshots.some(
        (snap) => snap.includes("par-a") && snap.includes("par-b"),
      );
      expect(overlapped).toBe(true);
      // Post-settlement: no children survive (either the parent is empty or
      // absent entirely - either form is the doctrine-compliant shape).
      if (existsSync(scratchParent)) {
        expect(readdirSync(scratchParent)).toEqual([]);
      }
      rmSync(root, { recursive: true, force: true });
    }, 60_000);
  },
);

// ===========================================================================
// GROUP Q - HYGIENE PINS (confinement proxy, vector equivalence, word-use,
// dev-markers, nonce mechanics, SDK pin)
// ===========================================================================

describe("Q. hygiene pins", () => {
  const suiteSrc = readFileSync(
    fileURLToPath(new URL("./landlock-bash.test.ts", import.meta.url)),
    "utf8",
  );
  const moduleSrc = readFileSync(
    fileURLToPath(new URL("./landlock-bash.ts", import.meta.url)),
    "utf8",
  );
  const iBannerIndex = suiteSrc.indexOf(
    "// GROUP I - ENGAGED-FORM SERIALIZATION",
  );
  expect(iBannerIndex).toBeGreaterThan(0);
  const fixtureAreaStart = suiteSrc.indexOf("const SLOT_ROOT");
  expect(fixtureAreaStart).toBeGreaterThan(0);
  const engagedFixtureStart = suiteSrc.indexOf("// ENGAGED-FIXTURE AREA");
  expect(engagedFixtureStart).toBeGreaterThan(fixtureAreaStart);
  // The LEGACY REGION: from the first original fixture down to the start of
  // the appended fixture area - i.e. the original groups A-H and their
  // original helpers, excluding both the extended import block (which
  // legitimately names the new entry points) and everything this step
  // appended below the banner.
  const legacySlice = suiteSrc.slice(fixtureAreaStart, engagedFixtureStart);
  const qBannerIndex = suiteSrc.indexOf("// GROUP Q - HYGIENE PINS");
  expect(qBannerIndex).toBeGreaterThan(iBannerIndex);
  // The scan covers everything this step APPENDED except the Q group's own
  // scanner source (whose needle literals would otherwise self-match).
  const authoredSuiteSlice = suiteSrc.slice(iBannerIndex, qBannerIndex);
  const authoredModuleSlice = moduleSrc.slice(
    moduleSrc.indexOf("VEHICLE FACT"),
  );

  it("diff-confinement proxy (appended-machinery tokens never enter the pre-group-I region): none of the new artifacts - fixture helpers, scratch-name literals, plan-entry-point references - appear anywhere in the pre-group-I slice; the original groups retain their zero-engagement determinism (every original window carries no strictly-concrete survivor, so each stays non-engaged BY CONSTRUCTION under the pure files-only planner)", () => {
    const needles = [
      "openEngagedRoot",
      "seedUpperTree",
      "expectedComposedScript",
      "BROAD_CAPABILITY",
      ".fence-scratch",
      "engagedListing",
      "twoProbePreamble",
      "triplesOf",
      "overlayPassActions",
    ];
    for (const needle of needles) {
      expect(legacySlice.includes(needle)).toBe(false);
    }
    // All eight original group bodies are still present in that region
    // (nothing was deleted or relocated - additions only).
    for (const letter of ["A", "B", "C", "D", "E", "F", "G", "H"] as const) {
      expect(legacySlice.includes(`describe("${letter}. `)).toBe(true);
    }
  });

  it("vector-equivalence over NON-ENGAGED windows (the pure path stays byte-identical to today's composer): for every non-engaged snapshot shape - silent window, pattern-text declarations dropped by the concrete filter, coverage-filtered declarations, class-flag-only frames - the retained composer output deep-equals the planner's kernelVector element-for-element (zero perturbation receipt over the common case)", () => {
    const shapes: Array<(st: SessionExecutionState) => void> = [
      () => undefined, // silent window: no capability entered
      (st) => {
        st.enterCapability(RESEARCH);
        st.attachPhase("impl", [`${SLOT_ROOT}/research/*.md`], true, false);
      }, // pattern text: survives coverage, drops at the concrete filter
      (st) => {
        st.enterCapability(RESEARCH);
        st.attachPhase(
          "impl",
          [`${WORKSPACE_CWD}/outside-slot.txt`],
          true,
          false,
        );
      }, // coverage-filtered: the contract's writes never cover the token
      (st) => {
        st.enterCapability(RESEARCH);
        st.attachPhase("impl", [], true, true);
      }, // class-flag-only frame: no declarations at all
    ];
    for (const build of shapes) {
      const st = new SessionExecutionState({
        projectSlotRoot: () => SLOT_ROOT,
        workspaceCwd: () => WORKSPACE_CWD,
      });
      build(st);
      const snapshot = st.snapshot();
      const legacy = composeKernelWritableSet(snapshot);
      const plan = composeSpawnPlan(snapshot);
      if (plan.kind !== "ready") {
        throw new Error(`expected ready plan, got ${plan.kind}`);
      }
      expect(plan.engaged).toBe(false);
      expect([...plan.kernelVector]).toEqual([...legacy]);
    }
  });

  it("word-use scan (authored-prose hygiene): zero occurrences of the banned word family in the authored slices - module header-to-EOF and suite group-I-banner-to-EOF - after stripping the two sanctioned exemptions (the fixed scratch-area artifact name and the house-form refusal tail quoted verbatim from the renderer)", () => {
    const scrub = (slice: string): string =>
      slice
        .replaceAll(".fence-scratch", "")
        .replaceAll("refusing to run unfenced.", "");
    const re = /\bfenc(ed|es|ing)?\b/gi;
    for (const [name, slice] of [
      ["module", authoredModuleSlice],
      ["suite", authoredSuiteSlice],
    ] as const) {
      const hits: string[] = [];
      const scanned = scrub(slice);
      re.lastIndex = 0;
      let match = re.exec(scanned);
      while (match !== null) {
        hits.push(match[0]);
        match = re.exec(scanned);
      }
      expect(hits, `${name} slice violates the word-use directive`).toEqual([]);
    }
  });

  it("dev-marker scan (authored slices carry no development-workflow reference artifacts): zero hits for generic marker families - step-number tokens, step-folder tokens, planning-document filenames, section-sign glyphs, ISO date tokens - anywhere in the authored module-header slice or the suite group-I-onward slice", () => {
    const patterns: ReadonlyArray<RegExp> = [
      /\bstep\s+\d+/i,
      /\bS\d{2}\b/,
      /\b(?:TASK|PLAN|GOAL|REVIEW|DECISIONS)\.md\b/,
      /\u00a7/,
      /\b20\d{2}-\d{2}-\d{2}\b/,
    ];
    for (const [name, slice] of [
      ["module", authoredModuleSlice],
      ["suite", authoredSuiteSlice],
    ] as const) {
      for (const pattern of patterns) {
        expect(slice.match(pattern), `${name}: matched ${pattern}`).toBeNull();
      }
    }
  });

  it("nonce-mechanics source pins (the scratch identity is cryptographically salted + monotonically counted; the atomic staging basename embeds BOTH the base name and the nonce so parallel walks over identical targets can never collide): the module carries the 16-hex-char random salt expression, the counter increment, and the dot-base-dot-nonce staging composition - each exactly once", () => {
    expect(moduleSrc.split("randomBytes(8)").length - 1).toBe(1);
    expect(moduleSrc.includes("nonceCounter")).toBe(true);
    const stagingNeedle = "$" + "{dir}/." + "$" + "{base}." + "$" + "{nonce}";
    expect(moduleSrc.split(stagingNeedle).length - 1).toBe(1);
  });

  it("SDK pin (the artifact lockfile exact-pin rides the vendor boundary): the package manifest declares the SDK dependency as an EXACT version (no caret, no tilde) matching the vendored dist the measured byte contracts cite", () => {
    const manifest = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { dependencies: Record<string, string> };
    expect(manifest.dependencies["@earendil-works/pi-coding-agent"]).toBe(
      "0.85.1",
    );
  });
});
