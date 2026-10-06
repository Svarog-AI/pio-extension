// Hermetic unit suite for the capability base (base.ts). Every SDK value
// symbol is a pure fake via hoisted vi.mock bindings — the real
// @earendil-works/pi-coding-agent graph is never evaluated; no filesystem,
// network, env, or process-stream assumptions. Each construction mints a
// fresh fake session behind a fresh fake runtime, so prompt arguments and
// per-instance state are directly observable. Live-harness rows drive the
// real phase engine over scripted fake prompts (one queued resolution =
// one settled logical run). Fixture subclasses are inline test doubles.
// Synthetic events flow through the documented cast seam asEvent; the
// B-world seams join it as the same idiom.
//
// Row-2 dispatch probe: ./terminal-takeover.ts is factory-mocked with
// importOriginal DELEGATION — the factory flips the hoisted eval flag on
// first evaluation (factories evaluate ONCE per file; sticky) and wraps
// materializeFrame in a PLAIN synchronous pass-through that records
// invocations (an async wrapper would mask the sync escape contract).
// LOAD-BEARING ROW ORDER: every pre-B row is session-present, so the probe
// stays unevaluated until B1; B8 (first inside the block) pins the
// unflipped state. The B block's world mirrors the sibling physics harness
// in compact form; holder controls come through the SAME deferred import
// path base.ts uses — a static import would fire the factory at file load
// and rot the B8 pin.

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { deriveProjectKey } from "../sandbox/layout.ts";
import { EXECUTION_STATE_STAMP } from "../session.ts";
import { SessionExecutionState } from "../session-execution-state.ts";
import type { CapabilityParams } from "./base.ts";
import {
  CapabilityEnvError,
  deriveStateRootFromAgentDir,
  PioCapability,
  settleFileModeOutputs,
} from "./base.ts";
import type { Contract } from "./contract.ts";
import { ContractViolationError } from "./errors.ts";
import type { WriteGateVerdict } from "./guards/write-gate.ts";
import { decideWrite } from "./guards/write-gate.ts";
import { PioSession, renderCapabilityMarker } from "./pio-session.ts";
import type { CapabilityResult } from "./status.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

const CWD = "/work/dir";

type Listener = (event: AgentSessionEvent) => void;

interface FakeSession {
  subscribe: ReturnType<typeof vi.fn>;
  /** One invocation stands for one fully-settled logical run. */
  prompt: ReturnType<typeof vi.fn>;
  /** The no-turn capability-span stamp seam (recording arg-shape). */
  sendCustomMessage: ReturnType<typeof vi.fn>;
  sessionId: string;
  dispose: ReturnType<typeof vi.fn>;
}

interface Round {
  session: FakeSession;
  runtime: { session: FakeSession };
  captured: Listener[];
}

const harness = vi.hoisted(() => {
  const managerCwd = "/managed/cwd";
  const agentDir = "/agent/dir";
  const sessionId = "sess-fake-0001";

  const state: { rounds: Round[]; mints: number } = { rounds: [], mints: 0 };

  const fakeServices = { marker: "fake-services" };

  const getAgentDir = vi.fn(() => agentDir);
  // Additive: arg-recording (inherited) + a deterministic platform-named
  // file under the given dir — behavior-neutral for the rows that consume
  // only getCwd().
  const SessionManager = {
    create: vi.fn((_cwd: string, sessionDir?: string) => {
      const fileName = `20260101T000000Z_${String(++state.mints).padStart(8, "0")}.jsonl`;
      return {
        getCwd: (): string => managerCwd,
        getSessionFile: (): string | undefined =>
          sessionDir === undefined ? undefined : `${sessionDir}/${fileName}`,
      };
    }),
  };
  const createAgentSessionServices = vi.fn(async () => fakeServices);
  const createAgentSessionFromServices = vi.fn(async () => ({
    extensionsResult: {},
  }));
  const createAgentSessionRuntime = vi.fn(async () => {
    // Fresh fakes per invocation so isolation rows observe distinct handles.
    const captured: Listener[] = [];
    const subscribe = vi.fn((listener: Listener) => {
      captured.push(listener);
      return () => {};
    });
    const prompt = vi.fn(async () => undefined);
    // Recording mock for the no-turn custom-message seam.
    const sendCustomMessage = vi.fn(async (): Promise<void> => {});
    const session: FakeSession = {
      subscribe,
      prompt,
      sendCustomMessage,
      sessionId,
      dispose: vi.fn(),
    };
    const round: Round = { session, runtime: { session }, captured };
    state.rounds.push(round);
    return round.runtime;
  });

  // Construction floor for the unconditional customTools threading: the
  // real PioSession.create builds the Landlock-bash instance eagerly at the
  // construction seam; these fakes absorb the construction-time SDK value
  // reaches (this island's rows never inspect the threaded entry - the bare
  // static shape suffices; the full four-symbol floor lives solely in
  // pio-session.test.ts where observation resides).
  const createBashToolDefinition = vi.fn(
    (_cwd: string, options: { operations: unknown }) => ({
      name: "bash",
      operations: options.operations,
    }),
  );
  const defineTool = vi.fn((tool: unknown) => tool);
  // Eager at construction (seams.localOps ?? createLocalBashOperations()):
  // structural stub - the island never drives the delegate bag.
  const createLocalBashOperations = vi.fn(() => ({}));

  const reset = () => {
    state.rounds = [];
    state.mints = 0;
    getAgentDir.mockClear();
    SessionManager.create.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
    createBashToolDefinition.mockClear();
    defineTool.mockClear();
    createLocalBashOperations.mockClear();
  };

  return {
    state,
    getAgentDir,
    SessionManager,
    createAgentSessionServices,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    createBashToolDefinition,
    defineTool,
    createLocalBashOperations,
    reset,
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: harness.getAgentDir,
  SessionManager: harness.SessionManager,
  createAgentSessionServices: harness.createAgentSessionServices,
  createAgentSessionFromServices: harness.createAgentSessionFromServices,
  createAgentSessionRuntime: harness.createAgentSessionRuntime,
  createBashToolDefinition: harness.createBashToolDefinition,
  defineTool: harness.defineTool,
  createLocalBashOperations: harness.createLocalBashOperations,
}));

// Row-2 dispatch probe (see header note): delegation keeps the REAL
// mechanics available while the eval flag + invocation log stay observable;
// the plain synchronous pass-through preserves the sync-throw semantics of
// the holder-guard escape.
const takeoverProbe = vi.hoisted(() => ({
  evaluated: false,
  calls: [] as Array<Record<string, unknown>>,
}));

type HopDispatcher = (
  input: Record<string, unknown>,
) => Promise<CapabilityResult>;

vi.mock("./terminal-takeover.ts", async (importOriginal) => {
  const original = await importOriginal();
  takeoverProbe.evaluated = true;
  const ns = original as { materializeFrame: HopDispatcher };
  const materializeFrame: HopDispatcher = (input) => {
    takeoverProbe.calls.push(input);
    return ns.materializeFrame(input);
  };
  return {
    ...(original as Record<string, unknown>),
    materializeFrame,
  };
});

let takenOver: typeof import("./terminal-takeover.ts") | undefined;
let originalEnv: string | undefined;

/** Lazy takeover-module binding: bound on first use (from B1 onward); a
 * STATIC import would evaluate the recording factory at file load and rot
 * the B8 pin. */
async function ensureTakeoverModule(): Promise<
  typeof import("./terminal-takeover.ts")
> {
  takenOver ??= await import("./terminal-takeover.ts");
  return takenOver;
}

const bTempRoots: string[] = [];
let bTempCursor = 0;

/** One row-owned tmpdir sessions-root; afterEach removes it recursively —
 * FORCED (runs even on assertion failure). */
function newBTempRoot(): string {
  const root = mkdtempSync(
    join(tmpdir(), `pio-base-b-${String(++bTempCursor).padStart(2, "0")}-`),
  );
  bTempRoots.push(root);
  return root;
}

beforeEach(() => {
  harness.reset();
  // B-block isolation: no holder state leaks across rows.
  takenOver?.teardownFrameEnvironment();
  originalEnv = process.env.PI_CODING_AGENT_DIR;
  // Suite-wide channel baseline: every execute_phase disclosure consult
  // resolves the anchor channels fresh, so hermetic runs need a SET
  // literal agent dir (rows wanting UNSET or malformed values pick those
  // explicitly).
  process.env.PI_CODING_AGENT_DIR = "/lit/state/.pi/agent";
});

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalEnv;
  }
  while (bTempRoots.length > 0) {
    rmSync(bTempRoots.pop() as string, { recursive: true, force: true });
  }
});

function lastRound(): Round {
  const round = harness.state.rounds[harness.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

/** Build a host plus the construction round backing it. */
async function host() {
  const instance = await PioSession.create(CWD);
  return { instance, round: lastRound() };
}

/** Drive synthetic events through the listener the host attached. */
function emit(round: Round, ...events: object[]) {
  const listener = round.captured[0];
  if (!listener) throw new Error("expected an attached listener");
  for (const event of events) listener(asEvent(event));
}

function agentStart() {
  return { type: "agent_start" };
}

/** Mirrors the installed dist payload: per-attempt messages plus retry flag. */
function agentEnd(messages: unknown[] = [], willRetry: boolean = false) {
  return { type: "agent_end", messages, willRetry };
}

/** One quiet settled run: a run start plus one empty agent_end payload. */
function quietRun(): object[] {
  return [agentStart(), agentEnd([], false)];
}

/** Queue one synthetic settlement per pass over the captured listener. */
function scriptRuns(round: Round, ...passes: object[][]) {
  for (const pass of passes) {
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...pass);
    });
  }
}

interface BHandle {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  /** Plain callable signature added: the default Mock type is not
   * callable through the interface. */
  subscribe: ReturnType<typeof vi.fn> & ((listener: Listener) => () => void);
  /** One invocation stands for one fully-settled logical run. */
  readonly prompt: ReturnType<typeof vi.fn>;
  /** The no-turn capability-span stamp seam (recording arg-shape). */
  readonly sendCustomMessage: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn> & (() => void);
  readonly captured: Listener[];
  readonly live: Listener[];
  disposed: boolean;
}

/** Mirror the measured handle physics: functional per-listener
 * unsubscribe; dispose clears the live list. */
function mintBHandle(sessionId: string, sessionFile?: string): BHandle {
  const captured: Listener[] = [];
  const live: Listener[] = [];
  const handle: BHandle = {
    sessionId,
    sessionFile,
    prompt: vi.fn(async (): Promise<void> => {}),
    sendCustomMessage: vi.fn(async (): Promise<void> => {}),
    subscribe: vi.fn((listener: Listener) => {
      captured.push(listener);
      live.push(listener);
      return (): void => {
        const index = live.indexOf(listener);
        if (index !== -1) {
          live.splice(index, 1);
        }
      };
    }),
    dispose: vi.fn((): void => {}),
    captured,
    live,
    disposed: false,
  };
  handle.dispose.mockImplementation(() => {
    handle.disposed = true;
    live.length = 0;
  });
  return handle;
}

type BSwapStep =
  | { kind: "swap"; sessionId: string; observe?: (incoming: BHandle) => void }
  | { kind: "cancel" }
  | { kind: "reject"; message: string };

interface BWorld {
  readonly cwd: string;
  readonly runtime: {
    readonly cwd: string;
    session: BHandle;
    /** Plain callable signature added: the default Mock type is not
     * callable through the interface. */
    switchSession: ReturnType<typeof vi.fn> &
      ((
        path: string,
        options?: { readonly cwdOverride?: string },
      ) => Promise<{ cancelled: boolean }>);
  };
  readonly parentHandle: BHandle;
  readonly parentFile: string;
  /** Zero-call stderr sink observation (holder context). */
  readonly stderr: ReturnType<typeof vi.fn> & ((line: string) => void);
}

/** One B-row world: tmpdir sessions-root with an (empty) top slot dir,
 * fresh parent handle, placeholder switch physics (rows queue their own
 * steps). No physical seed file — nothing reads the parent transcript, and
 * the B2 listing pin snapshots the created layout only. */
function buildBWorld(root: string, cwd: string): BWorld {
  mkdirSync(join(root, "top"), { recursive: true });
  const parentFile = join(root, "top", "parent-transcript.jsonl");
  const parentHandle = mintBHandle("sess-fake-0001", parentFile);
  const runtime: BWorld["runtime"] = {
    cwd,
    session: parentHandle,
    switchSession: vi.fn(
      async (
        _path: string,
        _options?: { readonly cwdOverride?: string },
      ): Promise<{ cancelled: boolean }> => {
        // Placeholder physics — rows queue their own steps.
        return { cancelled: false };
      },
    ),
  };
  return {
    cwd,
    runtime,
    parentHandle,
    parentFile,
    stderr: vi.fn((): void => {}),
  };
}

/** Queue scripted switch outcomes (the measured teardown-then-apply order).
 * "cancel" performs no teardown (the current handle stays current);
 * "reject" escapes the RAW error unmasked. */
function scriptBSwitches(world: BWorld, ...steps: BSwapStep[]): void {
  for (const step of steps) {
    world.runtime.switchSession.mockImplementationOnce(
      async (path: string): Promise<{ cancelled: boolean }> => {
        if (step.kind === "cancel") {
          return { cancelled: true };
        }
        if (step.kind === "reject") {
          throw new Error(step.message);
        }
        world.runtime.session.dispose();
        const incoming = mintBHandle(step.sessionId, path);
        world.runtime.session = incoming;
        step.observe?.(incoming);
        return { cancelled: false };
      },
    );
  }
}

/** Cast seam presenting the B-world runtime under the SDK type at the
 * fromRuntime call site (mirrors the adjacent suites' documented cast
 * idiom). */
const asRuntime = (runtime: BWorld["runtime"]): AgentSessionRuntime =>
  runtime as unknown as AgentSessionRuntime;

/** Deterministic harness mint filename (harness.mints resets per row in
 * beforeEach; n is the 1-based per-row call index). */
const MINTED_B_FILE = (n: number): string =>
  `20260101T000000Z_${String(n).padStart(8, "0")}.jsonl`;

/** Install the REAL holder over a B-world (deferred module access — see
 * the header note on why no static import exists). */
async function installBHolder(world: BWorld, root: string): Promise<void> {
  const takeover = await ensureTakeoverModule();
  const topFrame = PioSession.fromRuntime(asRuntime(world.runtime));
  takeover.installFrameEnvironment({
    sessionsRoot: root,
    topFrame,
    terminalStop: (): void => {},
    stderr: (line: string): void => {
      world.stderr(line);
    },
  });
}

/** Deliberately-fake identity: a test double, not a shipped capability. */
const FIXTURE_CONTRACT: Contract = {
  name: "fixture-cap",
  version: "1.0.0",
  inputs: [],
  outputs: [],
  writes: [],
};

/** Shared failing-shape assertion: ok:false, single-element errors, no outputs key. */
function expectSingleFailure(
  result: CapabilityResult,
  expected: Record<string, unknown>,
): void {
  expect(result.ok).toBe(false);
  expect("outputs" in result).toBe(false);
  expect(result.errors).toHaveLength(1);
  expect(result.errors?.[0]).toEqual(expected);
}

describe("PioCapability — happy path & pre-spawn ordering", () => {
  class IdentityCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    #returned: Record<string, unknown>;
    constructor(returned: Record<string, unknown>, session: PioSession) {
      super({ session });
      this.#returned = returned;
    }
    async call(): Promise<Record<string, unknown>> {
      return this.#returned;
    }
  }

  it("lands the call return in outputs by reference identity with ok:true and no errors key", async () => {
    const outputs = { artifact: "value" };
    const { instance } = await host();
    const cap = new IdentityCap(outputs, instance);
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(result.outputs).toBe(outputs);
    expect("errors" in result).toBe(false);
  });

  it("a missing value-slot input resolves ok:false with the violation captured and call never invoked", async () => {
    const callSpy = vi.fn(
      async (): Promise<Record<string, unknown>> => ({
        reached: true,
      }),
    );
    class ValidatedCap extends PioCapability {
      readonly contract: Contract = {
        name: "fixture-cap",
        version: "1.0.0",
        inputs: [{ name: "doc" }],
        outputs: [],
        writes: [],
      };
      readonly call = callSpy;
      constructor(session: PioSession) {
        super({ session });
      }
    }
    const { instance } = await host();
    const cap = new ValidatedCap(instance);
    const result = await cap.run({});
    expect(callSpy).toHaveBeenCalledTimes(0);
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message:
        "Contract violation: input 'doc' expects a non-empty string value",
      violations: ["input 'doc' expects a non-empty string value"],
    });
  });

  it("sees pristine values at validation time even when the body clears the slot mid-flight", async () => {
    class MutatingCap extends PioCapability {
      readonly contract: Contract = {
        name: "fixture-cap",
        version: "1.0.0",
        inputs: [{ name: "doc" }],
        outputs: [],
        writes: [],
      };
      constructor(session: PioSession) {
        super({ session });
      }
      async call(
        inputs: Record<string, unknown>,
      ): Promise<Record<string, unknown>> {
        // Clears the validated slot AFTER validation must already have run.
        inputs.doc = undefined;
        return { cleared: true };
      }
    }
    const { instance } = await host();
    const cap = new MutatingCap(instance);
    const result = await cap.run({ doc: "pristine" });
    expect(result.ok).toBe(true);
  });
});

describe("PioCapability — escape capture", () => {
  class EscapingCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    #thrower: () => unknown;
    constructor(thrower: () => unknown, session: PioSession) {
      super({ session });
      this.#thrower = thrower;
    }
    async call(): Promise<Record<string, unknown>> {
      throw this.#thrower();
    }
  }

  it("captures a ContractViolationError escaping the body with identity violations", async () => {
    const violations = ["output 'r' is missing", "output 'g' is stale"];
    const thrown = new ContractViolationError(violations);
    const { instance } = await host();
    const result = await new EscapingCap(() => thrown, instance).run();
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message: "Contract violation: output 'r' is missing; output 'g' is stale",
      violations,
    });
    // The captured array IS the thrown error's own array (reference passthrough).
    expect(result.errors?.[0]?.violations).toBe(violations);
  });

  const uniformEscapeRows: Array<{
    label: string;
    thrower: () => unknown;
    expected: Record<string, unknown>;
    omitCause?: boolean;
  }> = [
    {
      label:
        "a random unknown Error captures as bare identity with no cause key",
      thrower: () => new Error("boom"),
      expected: { type: "Error", message: "boom" },
      omitCause: true,
    },
    {
      label:
        "an author halt carrying the closed cause vocabulary keeps its adopted cause",
      thrower: () => new Error("halted", { cause: "author-halt" }),
      expected: {
        type: "Error",
        cause: "author-halt",
        message: "halted",
      },
    },
    {
      label: "a budget-cause Error carries the closed-vocabulary adopted cause",
      thrower: () => new Error("bounded", { cause: "budget" }),
      expected: {
        type: "Error",
        cause: "budget",
        message: "bounded",
      },
    },
    {
      label:
        "a non-Error thrown value degrades to UnknownError with its rendered form",
      thrower: () => "kaput",
      expected: { type: "UnknownError", message: "kaput" },
    },
  ];
  for (const row of uniformEscapeRows) {
    it(row.label, async () => {
      const { instance } = await host();
      const result = await new EscapingCap(row.thrower, instance).run();
      expectSingleFailure(result, row.expected);
      if (row.omitCause) {
        expect("cause" in (result.errors?.[0] ?? {})).toBe(false);
      }
    });
  }
});

// ─── Row-2 dispatch block (B rows) ──────────────────────────────────────
// Load-bearing order: B8 (factory NEVER evaluated) PRECEDES the first
// session-absent row — B1 is this file's first-ever pipeline-row
// evaluation and flips the sticky flag. Every pre-B row is session-present
// post-migration, so nothing earlier touches the import.
const NOT_INSTALLED_B_REPLICA =
  "terminal-takeover: frame environment not installed \u2014 a session-absent capability can only run under the engaged entry";

describe("PioCapability — row-2 dispatch (B rows)", () => {
  it("B8 — a session-present run() completes with the terminal-takeover factory NEVER EVALUATED (flag false, zero recorded invocations)", async () => {
    expect(takeoverProbe.evaluated).toBe(false);
    const { instance } = await host();
    const marker: Record<string, unknown> = { placed: "present" };
    class B8Cap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      constructor(session: PioSession) {
        super({ session });
      }
      async call(): Promise<Record<string, unknown>> {
        return marker;
      }
    }
    const result = await new B8Cap(instance).run();
    expect(result.ok).toBe(true);
    expect(result.outputs).toBe(marker);
    // THE eval-flag pin: session-present executions never evaluate the
    // module — the recording factory did not run.
    expect(takeoverProbe.evaluated).toBe(false);
    expect(takeoverProbe.calls).toHaveLength(0);
  });

  it("B1 — uninstalled env: the session-absent run() settles the PINNED FrameEnvironmentError capture (call never invoked); the eval flag flips false→true across the call", async () => {
    expect(takeoverProbe.evaluated).toBe(false);
    const callSpy = vi.fn(async (): Promise<Record<string, unknown>> => ({}));
    class B1Cap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      readonly call = callSpy;
      constructor() {
        super({});
      }
    }
    const result = await new B1Cap().run();
    expect(callSpy).toHaveBeenCalledTimes(0);
    expectSingleFailure(result, {
      type: "FrameEnvironmentError",
      message: NOT_INSTALLED_B_REPLICA,
    });
    // B1 is the file's first pipeline-row evaluation: the sticky flag
    // flipped exactly here (mirror of the run-session suite flip pin).
    expect(takeoverProbe.evaluated).toBe(true);
  });

  it("B2 — invalid input WITH the env installed: the contract capture settles with ZERO hop side effects (zero switches, zero mints, sessions-root listing unchanged) — the thunk sits strictly AFTER validation", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/b2");
    await installBHolder(world, root);
    const snapshotBefore = [
      ...readdirSync(root).sort(),
      ...readdirSync(join(root, "top")).sort(),
    ];
    const callSpy = vi.fn(async (): Promise<Record<string, unknown>> => ({}));
    class B2Cap extends PioCapability {
      readonly contract: Contract = {
        name: "fixture-cap",
        version: "1.0.0",
        inputs: [{ name: "doc" }],
        outputs: [],
        writes: [],
      };
      readonly call = callSpy;
      constructor() {
        super({});
      }
    }
    const result = await new B2Cap().run({});
    expect(callSpy).toHaveBeenCalledTimes(0);
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message:
        "Contract violation: input 'doc' expects a non-empty string value",
      violations: ["input 'doc' expects a non-empty string value"],
    });
    // Zero hop side effects: the validation fault precedes the thunk.
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(harness.SessionManager.create).toHaveBeenCalledTimes(0);
    const snapshotAfter = [
      ...readdirSync(root).sort(),
      ...readdirSync(join(root, "top")).sort(),
    ];
    expect(snapshotAfter).toEqual(snapshotBefore);
  });

  it("B3 — settled payload reaches the caller's await BY REFERENCE (marker identity survives the latch round trip; the child record mirrors it); the slot RETAINS the adopted host after the unwind (a second run takes the session-present path — no second hop)", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/b3");
    await installBHolder(world, root);
    scriptBSwitches(
      world,
      { kind: "swap", sessionId: "sess-b-child" },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const marker: Record<string, unknown> = { marker: "b3-distinct" };
    class B3Cap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        return marker;
      }
    }
    const cap = new B3Cap();
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(result.outputs).toBe(marker);
    // Relationship pin (base omits seams → ids are non-deterministic): the
    // switch-out arg IS the mock-minted child file.
    const childFile = world.runtime.switchSession.mock.calls[0][0] as string;
    const createDir = harness.SessionManager.create.mock.calls[0][1] as string;
    expect(childFile).toBe(`${createDir}/${MINTED_B_FILE(1)}`);
    // THE child record mirrors the SAME payload at the derived slot.
    const parsed = JSON.parse(
      readFileSync(join(dirname(childFile), "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.outputs).toEqual(marker);
    // Accepted edge: the slot retained the adopted child host — the SECOND
    // run takes the session-present path (no second hop, no second mint).
    const again = await cap.run();
    expect(again.ok).toBe(true);
    expect(again.outputs).toBe(marker);
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
    expect(harness.SessionManager.create).toHaveBeenCalledTimes(1);
  });

  it("B4 — a body-thrown ContractViolationError surfaces UNMASKED at the await with the hop FULLY unwound (switch args [childFile, parentFile], ledger back to [top], child record mirrors the capture)", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/b4");
    const takeover = await ensureTakeoverModule();
    await installBHolder(world, root);
    scriptBSwitches(
      world,
      { kind: "swap", sessionId: "sess-b-child" },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const violations = ["output 'r' is missing", "output 'g' is stale"];
    class B4Cap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        throw new ContractViolationError(violations);
      }
    }
    const result = await new B4Cap().run();
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message: "Contract violation: output 'r' is missing; output 'g' is stale",
      violations,
    });
    // The captured array IS the thrown error's own array (reference
    // passthrough through the dual channels).
    expect(result.errors?.[0]?.violations as unknown).toBe(violations);
    // Full unwind: out + back onto the CAPTURED parent file.
    const calls = world.runtime.switchSession.mock.calls.map(
      (c) => c[0],
    ) as string[];
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(world.parentFile);
    const frames = takeover.activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].capability.name).toBe("top");
    // The child record mirrors the capture (fault BEFORE the switch-back).
    const parsed = JSON.parse(
      readFileSync(join(dirname(calls[0]), "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toEqual([
      {
        type: "ContractViolationError",
        cause: "contract",
        message:
          "Contract violation: output 'r' is missing; output 'g' is stale",
        violations,
      },
    ]);
  });

  it("B5 — a body-thrown budget-cause error surfaces unmasked at the await ({ type: 'Error', cause: 'budget', message }) with the hop fully unwound and the record mirrored", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/b5");
    const takeover = await ensureTakeoverModule();
    await installBHolder(world, root);
    scriptBSwitches(
      world,
      { kind: "swap", sessionId: "sess-b-child" },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    class B5Cap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        throw new Error("body fault: bounded out", { cause: "budget" });
      }
    }
    const result = await new B5Cap().run();
    expectSingleFailure(result, {
      type: "Error",
      cause: "budget",
      message: "body fault: bounded out",
    });
    const calls = world.runtime.switchSession.mock.calls.map(
      (c) => c[0],
    ) as string[];
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(world.parentFile);
    const frames = takeover.activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].capability.name).toBe("top");
    const parsed = JSON.parse(
      readFileSync(join(dirname(calls[0]), "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toEqual([
      {
        type: "Error",
        cause: "budget",
        message: "body fault: bounded out",
      },
    ]);
  });

  class B7LeafCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      return {};
    }
  }

  it("B7 — execute_phase rejects with the pinned plain Error while no session is present (never-run session-absent instance; expectation verbatim)", async () => {
    const variants: CapabilityParams[] = [{}, { tty: false, timeoutMs: 5 }];
    for (const params of variants) {
      const rejection: unknown = await new B7LeafCap(params)
        .execute_phase("any")
        .catch((reason: unknown) => reason);
      expect(rejection).toBeInstanceOf(Error);
      expect(rejection).not.toBeInstanceOf(ContractViolationError);
      if (rejection instanceof Error) {
        expect(rejection.name).toBe("Error");
        expect(rejection.message).toBe(
          "no session available: execute_phase requires in-process placement",
        );
      } else {
        throw new Error("expected an Error rejection");
      }
    }
  });
});

describe("PioCapability — structural pins", () => {
  class LeafCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      return {};
    }
  }

  it("offers no virtual run slot: the inherited seam resolves to the base by identity", () => {
    expect(Object.hasOwn(LeafCap.prototype, "run")).toBe(false);
    expect(LeafCap.prototype.run).toBe(PioCapability.prototype.run);
  });

  it("retains reserved params on the instance without enforcement", () => {
    const bare = new LeafCap({});
    const reserved = new LeafCap({ tty: false, timeoutMs: 5 });
    expect(bare.tty).toBeUndefined();
    expect(bare.timeoutMs).toBeUndefined();
    expect(reserved.tty).toBe(false);
    expect(reserved.timeoutMs).toBe(5);
  });

  it("neither prototype owns an output-validation member at the consumer edge", () => {
    const matching = (target: object): string[] =>
      Object.getOwnPropertyNames(target).filter((name) =>
        /validat|checkOutputs/i.test(name),
      );
    expect(matching(PioCapability.prototype)).toEqual([]);
    expect(matching(PioSession.prototype)).toEqual([]);
  });
});

describe("PioCapability — prompt framing passes through untouched", () => {
  // Codepoints in the goldens below: U+2014 (em dash) twice flanking each
  // label with single spaces, U+000A (line feed) between lines.
  const PHASE_A_MARKER = "\u2014\u2014 phase-a \u2014\u2014";
  const PHASE_B_MARKER = "\u2014\u2014 phase-b \u2014\u2014";
  const CAP_MARKER = "\u2014\u2014 fixture-cap \u2014\u2014";
  // The unattached fixture phases ride the DELIMITER-ONLY disclosure
  // form (stateless window: no attached phase, so the shared core is
  // never consulted - re-typed locally per the suite's pattern).
  const DISCLOSURE_DELIMITER_REPLICA =
    "\u2014\u2014 phase permissions \u2014\u2014";

  class TwoPhaseCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a", { instructions: "do A" });
      const b = await this.execute_phase("phase-b", { instructions: "do B" });
      return { phaseResults: [a, b] };
    }
  }

  it("leaves the composed phase prompts free of any capability marker line", async () => {
    const { instance, round } = await host();
    const cap = new TwoPhaseCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    // The wrapper forwards the option bag verbatim: the disclosure
    // delimiter line, then the engine-composed phase marker plus the
    // authored instructions reach the prompt channel.
    expect(round.session.prompt).toHaveBeenNthCalledWith(
      1,
      `${DISCLOSURE_DELIMITER_REPLICA}\n${PHASE_A_MARKER}\ndo A`,
    );
    expect(round.session.prompt).toHaveBeenNthCalledWith(
      2,
      `${DISCLOSURE_DELIMITER_REPLICA}\n${PHASE_B_MARKER}\ndo B`,
    );
  });

  class MinTwoCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a", {
        instructions: "do A",
        min: 2,
      });
      return { phaseResults: [a] };
    }
  }

  it("re-sends the byte-identical phase framing on every floor-driven iteration without added lines", async () => {
    const { instance, round } = await host();
    const cap = new MinTwoCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    const framed = `${DISCLOSURE_DELIMITER_REPLICA}\n${PHASE_A_MARKER}\ndo A`;
    expect(round.session.prompt).toHaveBeenNthCalledWith(1, framed);
    expect(round.session.prompt).toHaveBeenNthCalledWith(2, framed);
  });

  class BarePhaseCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a");
      return { phaseResults: [a] };
    }
  }

  it("ends the bare first-phase prompt at its marker line with no trailing newline and no capability line", async () => {
    const { instance, round } = await host();
    const cap = new BarePhaseCap({ session: instance });
    scriptRuns(round, quietRun());
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `${DISCLOSURE_DELIMITER_REPLICA}\n${PHASE_A_MARKER}`,
    );
    const sent = round.session.prompt.mock.calls[0][0];
    expect(sent.endsWith("\n")).toBe(false);
    expect(sent.includes(CAP_MARKER)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Span stamp: driven through run(); owned by the run() seam alone — the
// phase path has no awareness of the channel. One no-turn header per
// session-present span; the row-2 hop body is unstamped. Label =
// contract.name; content = renderCapabilityMarker's bytes (referenced, not
// duplicated). The replica below names the module-private customType
// constant in ./pio-session.ts.
// ---------------------------------------------------------------------
/** Replica of the module-private customType namespace (SOLE OWNER: the
 * PIO_CAPABILITY_CUSTOM_TYPE constant in ./pio-session.ts). */
const CAPABILITY_CUSTOM_TYPE_REPLICA = "pio-capability";

describe("PioCapability — span stamp (owned solely by the run() seam)", () => {
  class TwoPhaseStampCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("phase-a", { instructions: "do A" });
      const b = await this.execute_phase("phase-b", { instructions: "do B" });
      return { a: a.iterations, b: b.iterations };
    }
  }

  it("stamps EXACTLY ONCE per run() on the provided session: the single sendCustomMessage PRECEDING the span's first phase prompt (log order), labeled with the capability's OWN contract.name at the renderer's pinned bytes", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    const cap = new TwoPhaseStampCap({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(round.session.sendCustomMessage).toHaveBeenCalledWith({
      customType: CAPABILITY_CUSTOM_TYPE_REPLICA,
      content: renderCapabilityMarker("fixture-cap"),
      display: true,
      details: undefined,
    });
    // NO options object: one argument only (SDK default = no turn).
    expect(round.session.sendCustomMessage.mock.calls[0]).toHaveLength(1);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    // Log-order: the settled stamp strictly precedes the span's first
    // phase prompt.
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
  });

  class FloorStampCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("floored", {
        instructions: "do F",
        min: 2,
      });
      return { iterations: a.iterations };
    }
  }

  it("floor-driven multi-run bodies emit NO further stamps (later runs/phases ⇒ zero — nothing in the phase path knows the channel exists)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    const cap = new FloorStampCap({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
  });

  class NoBodyStampCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      return {};
    }
  }

  it("a ZERO-PHASE body still persists the bare header: one stamp, zero prompts", async () => {
    const { instance, round } = await host();
    const cap = new NoBodyStampCap({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledTimes(0);
  });

  it("a second run() on the SAME instance opens a FRESH span: a fresh stamp (no state exists to re-arm — one call site per branch per run)", async () => {
    const { instance, round } = await host();
    const cap = new NoBodyStampCap({ session: instance });
    const first = await cap.run();
    expect(first.ok).toBe(true);
    const again = await cap.run();
    expect(again.ok).toBe(true);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    expect(round.session.prompt).toHaveBeenCalledTimes(0);
  });

  class ViolatingStampCap extends PioCapability {
    readonly contract: Contract = {
      name: "fixture-cap",
      version: "1.0.0",
      inputs: [{ name: "doc" }],
      outputs: [],
      writes: [],
    };
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      return {};
    }
  }

  it("a CONTRACT-VIOLATION run stamps NOTHING (pre-execution settlement: zero stamps, zero prompts — the stamp sits strictly AFTER validateInputs)", async () => {
    const { instance, round } = await host();
    const cap = new ViolatingStampCap({ session: instance });
    const result = await cap.run({});
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message:
        "Contract violation: input 'doc' expects a non-empty string value",
      violations: ["input 'doc' expects a non-empty string value"],
    });
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(0);
    expect(round.session.prompt).toHaveBeenCalledTimes(0);
  });

  class FaultAfterSettleStampCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      await this.execute_phase("fault-after-settle", {
        shouldStopLoop: async () => true,
      });
      // The author-level fault lands AFTER a settled run: the span stamp
      // outlives it.
      throw new Error("body fault after a settled run");
    }
  }

  it("a fault thrown AFTER a settled run still PERSISTS the span stamp (the mark landed strictly before the first prompt and outlives the rejecting run)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const cap = new FaultAfterSettleStampCap({ session: instance });
    const result = await cap.run();
    expectSingleFailure(result, {
      type: "Error",
      message: "body fault after a settled run",
    });
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
  });

  it("ROW-2: the hop body stamps NOWHERE — neither child nor parent handle receives a custom message while the callee's single phase prompt rides the adopted child handle", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/stamp-hop");
    await installBHolder(world, root);
    let child: BHandle | undefined;
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-stamp-child",
        observe: (incoming: BHandle) => {
          child = incoming;
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    class HopPhaseCap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        const a = await this.execute_phase("hop-phase", {
          instructions: "do it",
        });
        return { iterations: a.iterations };
      }
    }
    const result = await new HopPhaseCap().run();
    expect(result.ok).toBe(true);
    const c = child as BHandle;
    // Absence: the callee span rides the child transcript (phase prompt on
    // the adopted handle) with no capability header — the child's own
    // status record names it.
    expect(c.prompt).toHaveBeenCalledTimes(1);
    expect(c.sendCustomMessage).not.toHaveBeenCalled();
    expect(world.parentHandle.sendCustomMessage).not.toHaveBeenCalled();
    expect(world.parentHandle.prompt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// State-root inversion (pure; owner: capability/base.ts — the pair lives
// there: class CapabilityEnvError, message prefix generalized to
// "capability:"). The message replicas below name that owner. Em dashes
// are U+2014 (escaped).
// ---------------------------------------------------------------------
const ENV_UNSET_MESSAGE =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";
const envMalformedMessage = (value: string): string =>
  `capability: PI_CODING_AGENT_DIR is malformed ('${value}') \u2014 cannot derive the state root`;

describe("deriveStateRootFromAgentDir (pure)", () => {
  const T = "/home/user/pio-state";

  it("inverts the renderer expression <T>/.pi/agent to <T>", () => {
    expect(deriveStateRootFromAgentDir(`${T}/.pi/agent`)).toBe(T);
  });

  it("throws the pinned UNSET message for absent/empty/whitespace-only input", () => {
    for (const variant of [undefined, "", "   "] as const) {
      expect(() => deriveStateRootFromAgentDir(variant)).toThrow(
        ENV_UNSET_MESSAGE,
      );
    }
    try {
      deriveStateRootFromAgentDir(undefined);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityEnvError);
      expect((error as CapabilityEnvError).name).toBe("CapabilityEnvError");
    }
  });

  it("throws the pinned MALFORMED message naming the trimmed value for a relative input", () => {
    for (const variant of ["rel/.pi/agent", "  rel/.pi/agent  "] as const) {
      expect(() => deriveStateRootFromAgentDir(variant)).toThrow(
        envMalformedMessage("rel/.pi/agent"),
      );
    }
    try {
      deriveStateRootFromAgentDir("  rel/.pi/agent  ");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityEnvError);
      expect((error as CapabilityEnvError).name).toBe("CapabilityEnvError");
    }
  });
});

describe("PioCapability — engine integration through the base", () => {
  class UncapturedFaultCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      await this.execute_phase("fault-after-settle", {
        shouldStopLoop: async () => true,
      });
      // The author-level fault lands AFTER a settled run: the engine
      // propagation reaches it untouched (a settled run is not a stop signal
      // for an escaping fault).
      throw new Error("body fault after a settled run");
    }
  }

  it("lets an uncaptured body fault escape the body into the failing result", async () => {
    const { instance, round } = await host();
    const cap = new UncapturedFaultCap({ session: instance });
    scriptRuns(round, quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expectSingleFailure(result, {
      type: "Error",
      message: "body fault after a settled run",
    });
  });

  /** Locally-minted rejection sentinel standing in for a surviving
   * propagation-family fault the hook can raise (owner: THIS suite). */
  class RejectingHookSentinel extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RejectingHookSentinel";
    }
  }

  class CaughtHookFaultCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      let caughtMessage: string | undefined;
      try {
        await this.execute_phase("hooked-fault", {
          shouldStopLoop: async () => {
            throw new RejectingHookSentinel("the hook gave up");
          },
        });
      } catch (err) {
        // Authors may catch a rejecting-hook fault narrowly around
        // individual calls.
        if (err instanceof RejectingHookSentinel) {
          caughtMessage = err.message;
        } else {
          throw err;
        }
      }
      return { caughtMessage };
    }
  }

  it("completes ok when the body catches a rejecting-hook fault narrowly (author-level handling coexists with the base catch-all, which never preempts it)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const cap = new CaughtHookFaultCap({ session: instance });
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ caughtMessage: "the hook gave up" });
  });

  class HookCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("hooked", {
        shouldStopLoop: async () => true,
      });
      return { settled: { done: a.done, iterations: a.iterations } };
    }
  }

  it("forwards the closed option bag intact past the wrapper", async () => {
    const { instance, round } = await host();
    const cap = new HookCap({ session: instance });
    scriptRuns(round, quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    // The wrapper forwards options verbatim: the disclosure delimiter
    // leads, then the bare marker line stands alone.
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 phase permissions \u2014\u2014\n\u2014\u2014 hooked \u2014\u2014`,
    );
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({
      settled: { done: true, iterations: 1 },
    });
  });
});

// ─── Settle-seam placement (file-mode outputs) ──────────────────────────
// THE success settlement under test: run() absolutizes FILE-MODE contract
// output slots ONCE at the base, for BOTH placements (in-place and inside
// the hop's body — one payload serves the child record and the caller's
// await). Pure-helper rows inject a fixed placement provider (no env/cwd
// reach); seam rows drive the REAL derivation over a controlled
// PI_CODING_AGENT_DIR (rows pick their own value over the suite baseline).
// Em dashes are U+2014 (escaped).

describe("settleFileModeOutputs (pure)", () => {
  const PLACEMENT = "/state/projects/key";
  const FILE_SLOT = [{ name: "report", paramKey: "report" }];

  it("absolutizes a FILE-MODE slot's relative string against the placement (paramKey write-back; other keys untouched)", () => {
    const provider = vi.fn((): string => PLACEMENT);
    const settled = settleFileModeOutputs(
      FILE_SLOT,
      { report: "research/x.md", extra: "value" },
      provider,
    );
    expect(settled).toEqual({
      report: `${PLACEMENT}/research/x.md`,
      extra: "value",
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("a VALUE slot passes through BY REFERENCE and NEVER invokes the provider", () => {
    const provider = vi.fn((): string => PLACEMENT);
    const outputs = { note: "some value" };
    expect(settleFileModeOutputs([{ name: "note" }], outputs, provider)).toBe(
      outputs,
    );
    expect(provider).toHaveBeenCalledTimes(0);
  });

  const passThroughVariants: ReadonlyArray<{
    label: string;
    outputs: Record<string, unknown>;
  }> = [
    { label: "EMPTY string token", outputs: { report: "" } },
    { label: "ABSENT token", outputs: {} },
    { label: "NON-STRING token", outputs: { report: 42 } },
    { label: "null token", outputs: { report: null } },
  ];
  for (const variant of passThroughVariants) {
    it(`a ${variant.label} in a file-mode slot passes through untouched (provider never invoked)`, () => {
      const provider = vi.fn((): string => PLACEMENT);
      expect(settleFileModeOutputs(FILE_SLOT, variant.outputs, provider)).toBe(
        variant.outputs,
      );
      expect(provider).toHaveBeenCalledTimes(0);
    });
  }

  it("ALREADY-ABSOLUTE values pass through WITHOUT a second join (provider never invoked)", () => {
    const provider = vi.fn((): string => PLACEMENT);
    const outputs = { report: "/elsewhere/report.md" };
    expect(settleFileModeOutputs(FILE_SLOT, outputs, provider)).toBe(outputs);
    expect(provider).toHaveBeenCalledTimes(0);
  });

  it("settles MULTIPLE file-mode slots in declaration order with ONE memoized provider invocation (the static-file form reports the contract-declared location)", () => {
    const provider = vi.fn((): string => PLACEMENT);
    const settled = settleFileModeOutputs(
      [
        { name: "a", paramKey: "a" },
        { name: "b", file: "b.md" },
      ],
      { a: "rel/a.md", b: "stale/b.md" },
      provider,
    );
    expect(settled).toEqual({
      a: `${PLACEMENT}/rel/a.md`,
      b: `${PLACEMENT}/b.md`,
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });
});

describe("run() success settlement (seam rows — real derivation, both placements)", () => {
  class SettlingCap extends PioCapability {
    readonly contract: Contract = {
      name: "fixture-cap",
      version: "1.0.0",
      inputs: [],
      outputs: [{ name: "report", paramKey: "report" }],
      writes: [],
    };
    #body: () => Promise<Record<string, unknown>>;
    constructor(
      body: () => Promise<Record<string, unknown>>,
      params: CapabilityParams,
    ) {
      super(params);
      this.#body = body;
    }
    async call(): Promise<Record<string, unknown>> {
      return this.#body();
    }
  }

  /** Expected placement computed IN-ROW via the same public channels the
   * seam derives (self-consistent idiom — never a recomputed private math). */
  function derivedAbsolute(token: string): string {
    return join(
      deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
      "projects",
      deriveProjectKey(process.cwd()),
      token,
    );
  }

  it("in-place: a file-mode output settles to the derived ABSOLUTE placement when the state-root channel is SET", async () => {
    const root = newBTempRoot();
    process.env.PI_CODING_AGENT_DIR = join(root, ".pi", "agent");
    const { instance } = await host();
    const result = await new SettlingCap(
      async () => ({ report: "research/x.md" }),
      { session: instance },
    ).run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({
      report: derivedAbsolute("research/x.md"),
    });
  });

  it("in-place: a settle-time conversion fault settles THIS capability's own capture (pinned CapabilityEnvError bytes) after the body COMPLETED", async () => {
    delete process.env.PI_CODING_AGENT_DIR; // row-chosen UNSET
    let completed = false;
    const { instance } = await host();
    const cap = new SettlingCap(
      async (): Promise<Record<string, unknown>> => {
        completed = true;
        return { report: "research/x.md" };
      },
      { session: instance },
    );
    const result = await cap.run();
    expect(completed).toBe(true);
    expectSingleFailure(result, {
      type: "CapabilityEnvError",
      message: ENV_UNSET_MESSAGE,
    });
  });

  it("in-place: a FAILURE result settles UNTRANSFORMED — the body's own capture stands (no env fault masked in behind a failing body)", async () => {
    delete process.env.PI_CODING_AGENT_DIR;
    const { instance } = await host();
    const cap = new SettlingCap(
      async (): Promise<Record<string, unknown>> => {
        throw new Error("boom");
      },
      { session: instance },
    );
    const result = await cap.run();
    expectSingleFailure(result, { type: "Error", message: "boom" });
  });

  it("hop placement: the child record AND the caller's await carry the TRANSFORMED token (one payload serves both channels) with the switch-back completed", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/settle-hop");
    await installBHolder(world, root);
    scriptBSwitches(
      world,
      { kind: "swap", sessionId: "sess-settle-child" },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    process.env.PI_CODING_AGENT_DIR = join(root, ".pi", "agent");
    const cap = new SettlingCap(
      async () => ({ report: "research/hop.md" }),
      {},
    );
    const result = await cap.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const expected = derivedAbsolute("research/hop.md");
    expect(result.outputs).toStrictEqual({ report: expected });
    // THE child record mirrors the SAME transformed payload.
    const childFile = world.runtime.switchSession.mock.calls[0][0] as string;
    const parsed = JSON.parse(
      readFileSync(join(dirname(childFile), "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.outputs).toEqual({ report: expected });
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
  });

  it("hop placement: a conversion fault settles AFTER the unwind — child record ok:false with the typed capture, the await mirrors it, switch args [childFile, parentFile], ledger back to [top]", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/settle-hop-fault");
    const takeover = await ensureTakeoverModule();
    await installBHolder(world, root);
    scriptBSwitches(
      world,
      { kind: "swap", sessionId: "sess-settle-fault" },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    delete process.env.PI_CODING_AGENT_DIR; // row-chosen UNSET
    const cap = new SettlingCap(
      async () => ({ report: "research/hop.md" }),
      {},
    );
    const result = await cap.run();
    expectSingleFailure(result, {
      type: "CapabilityEnvError",
      message: ENV_UNSET_MESSAGE,
    });
    const calls = world.runtime.switchSession.mock.calls.map(
      (c) => c[0],
    ) as string[];
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(world.parentFile);
    const frames = takeover.activeFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].capability.name).toBe("top");
    const parsed = JSON.parse(
      readFileSync(join(dirname(calls[0]), "status.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toEqual([
      { type: "CapabilityEnvError", message: ENV_UNSET_MESSAGE },
    ]);
  });
});

describe("source guards (row-2 edge discipline over base.ts)", () => {
  const src = readFileSync(new URL("./base.ts", import.meta.url), "utf8");

  it("EXACTLY ONE dynamic import( occurrence in base.ts and it is the terminal-takeover literal thunk (the ONLY new edge; session-present executions never evaluate the module)", () => {
    const dynThunks = src.match(/import\(\s*["'][^"']+["']\s*\)/g) ?? [];
    expect(dynThunks).toEqual(['import("./terminal-takeover.ts")']);
  });

  it("the session slot is internally assignable: `protected s:` without the readonly modifier while `contract` keeps `declare readonly`", () => {
    expect(src.includes("protected s: PioSession | undefined")).toBe(true);
    expect(src.includes("readonly s:")).toBe(false);
    expect(src.includes("declare readonly contract: Contract")).toBe(true);
  });

  it("EXACTLY ONE span-stamp call site (this.s.markCapability()) in base.ts — the session-present branch, strictly before the execute_phase declaration; the phase method body references the channel nowhere", () => {
    const callSites = [...src.matchAll(/this\.s\.markCapability\(/g)].map(
      (match) => match.index ?? -1,
    );
    expect(callSites).toHaveLength(1);
    const phaseDecl = src.indexOf("async execute_phase(");
    expect(phaseDecl).toBeGreaterThan(-1);
    for (const index of callSites) {
      expect(index).toBeLessThan(phaseDecl);
    }
    // The execute_phase METHOD BODY (from its declaration to the class end)
    // carries ZERO references to the seam name.
    const phaseEnd = src.indexOf("\n}", phaseDecl);
    expect(phaseEnd).toBeGreaterThan(phaseDecl);
    expect(src.slice(phaseDecl, phaseEnd).includes("markCapability")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------
// Capability-source SPAN WINDOW (run()'s session-present branch): the
// session's execution state records WHAT IS EXECUTING RIGHT NOW -- a LIFO
// capability span layer opened strictly after input validation and closed
// at settlement on success AND the catch-all. Observation idiom (this
// suite only): ROW-SIDE REAL states over healthy LITERAL channel closures
// stamped onto the B-world parent handle (a plain non-enumerable value
// write) BEFORE any host is built, then discovered through the CAST-FREE
// fromRuntime path per row (zero harness surgery); consults go through the
// REAL predicate. Denial bytes below replicate write-gate.ts byte-for-byte
// (SOLE OWNER: its module-private renderers); em dashes are U+2014
// (escaped). Literal-root doctrine: no /tmp/-anchored channel fixture
// anywhere; the rows are env-independent by construction. Every row sits
// AFTER the B block: the sticky takeover-eval flag discipline (B1 flip,
// B8 pin) is load-bearing.
// ---------------------------------------------------------------------
const UNIVERSAL_NO_PERMISSION_REPLICA =
  "Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.";

/** Replica of write-gate.ts's module-private PHASE-LINE renderer (SOLE
 * OWNER: its renderers) - survivors in declaration order, then the scope
 * element iff the class is active, then the scratch element LAST iff the
 * flag is active (the join-or-"none" listing rule included; the phase line
 * is pure ASCII, no dash glyphs). */
const PHASE_LINE_REPLICA = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null = null,
  scratchActive = false,
): WriteGateVerdict => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) {
    parts.push(`project files under ${workspaceCwd}`);
  }
  if (scratchActive) {
    parts.push("scratch files under /tmp/");
  }
  const allowlist = parts.length === 0 ? "none" : parts.join(", ");
  return {
    block: true,
    reason: `Writing is refused during phase '${phaseId}'. Allowed targets: ${allowlist}.`,
  };
};

const LITERAL_SLOT_ROOT = "/proj/slot";
const LITERAL_WORKSPACE_CWD = "/work/slot";

/** One healthy row-side state: literal constant channels (never /tmp/-
 * anchored -- env-independent, no PI_CODING_AGENT_DIR manipulation). The
 * optional overrides take ROW-OWNED real roots (the admit rows need REAL
 * disk-truth channels over their own mkdtemp dirs). */
function freshRowState(
  projectSlotRoot: string = LITERAL_SLOT_ROOT,
  workspaceCwd: string = LITERAL_WORKSPACE_CWD,
): SessionExecutionState {
  return new SessionExecutionState({
    projectSlotRoot: () => projectSlotRoot,
    workspaceCwd: () => workspaceCwd,
  });
}

/** Stamp the row-held state onto a B-world parent handle (mirrors the
 * create() stamp shape: non-enumerable own data property). */
function stampRowState(handle: BHandle, state: SessionExecutionState): void {
  Object.defineProperty(handle, EXECUTION_STATE_STAMP, {
    value: state,
    enumerable: false,
    configurable: true,
  });
}

/** One queued quiet resolution per expected prompt over the shared handle
 * (the scriptRuns pass idiom in direct form). */
function scriptQuietPrompts(handle: BHandle, count: number): void {
  for (let index = 0; index < count; index += 1) {
    handle.prompt.mockImplementationOnce(async (): Promise<void> => {});
  }
}

/** Host over the stamped B-world runtime: the REAL cast-free discovery
 * path runs per row (stamped handle implies finding the row-held object
 * by identity). */
function stampedHost(world: BWorld): PioSession {
  return PioSession.fromRuntime(asRuntime(world.runtime));
}

describe("PioCapability - capability-source span window (enter/exit timing)", () => {
  it("SUCCESS: the span is ENTERED before the body's first phase prompt and EXITED before the ok:true result reaches the caller; a second run() on the SAME instance re-enters cleanly and settles", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/span-success");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    const session = stampedHost(world);
    const enterSpy = vi.spyOn(state, "enterCapability");
    const exitSpy = vi.spyOn(state, "exitCapability");
    expect(state.snapshot().sources).toBeNull(); // pre-run governance
    let midBodyName: string | null = null;
    scriptQuietPrompts(world.parentHandle, 2);
    class SuccessSpanCap extends PioCapability {
      readonly contract: Contract = {
        name: "span-cap",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        // BEFORE the body's first phase prompt: the span must already read.
        const snapshot = state.snapshot();
        midBodyName = snapshot.sources === null ? null : snapshot.sources.name;
        await this.execute_phase("quiet", { shouldStopLoop: async () => true });
        return { settled: true };
      }
    }
    const cap = new SuccessSpanCap(session);
    const result = await cap.run();
    expect(result.ok).toBe(true);
    // (a) enter preceded the body's first prompt: the mid-body snapshot
    // reads the span, and the enter evidence orders before the prompt.
    expect(midBodyName).toBe("span-cap");
    expect(enterSpy).toHaveBeenCalledTimes(1);
    expect(enterSpy.mock.invocationCallOrder[0]).toBeLessThan(
      world.parentHandle.prompt.mock.invocationCallOrder[0],
    );
    // (b) the pop completed before the result reached the caller: the
    // reading restores pre-run governance (depth-0 start implies popped).
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(state.snapshot()).toStrictEqual({
      sources: null,
      phase: null,
      paths: {
        projectSlotRoot: LITERAL_SLOT_ROOT,
        workspaceCwd: LITERAL_WORKSPACE_CWD,
      },
    });
    // (c) a second run on the SAME instance re-enters cleanly and settles
    // (balanced pair per run -- a fresh span, mirroring the span-stamp
    // fresh-span row).
    const again = await cap.run();
    expect(again.ok).toBe(true);
    expect(midBodyName).toBe("span-cap");
    expect(enterSpy).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledTimes(2);
    expect(state.snapshot().sources).toBeNull();
  });

  it("FAULT: the pop PRECEDES the ok:false settlement -- a post-rejection consultation through the REAL predicate renders the universal no-permission byte, and a follow-up run on the SAME state behaves as if the span never existed", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/span-fault");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    const session = stampedHost(world);
    const enterSpy = vi.spyOn(state, "enterCapability");
    scriptQuietPrompts(world.parentHandle, 2);
    class FaultOnceSpanCap extends PioCapability {
      readonly contract: Contract = {
        name: "fault-cap",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      #firstFault = true;
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        await this.execute_phase("fault-after-settle", {
          shouldStopLoop: async () => true,
        });
        // The author-level fault lands AFTER a settled run (mirror of the
        // FaultAfterSettleStampCap idiom).
        if (this.#firstFault) {
          this.#firstFault = false;
          throw new Error("body fault after a settled run");
        }
        return { recovered: true };
      }
    }
    const cap = new FaultOnceSpanCap(session);
    const result = await cap.run();
    // Enter evidence: the span was entered before the settled prompt.
    expect(enterSpy).toHaveBeenCalledTimes(1);
    expect(enterSpy.mock.invocationCallOrder[0]).toBeLessThan(
      world.parentHandle.prompt.mock.invocationCallOrder[0],
    );
    // Never-rejects preserved: the author fault settles as the capture.
    expectSingleFailure(result, {
      type: "Error",
      message: "body fault after a settled run",
    });
    // THE sharp byte pin: by the time the ok:false result resolves, the
    // span is ALREADY popped -- and even if it were not, the refusal names
    // the STATE, not the layer: the REAL predicate over the row-held state
    // renders the universal no-permission byte.
    expect(
      decideWrite(state.snapshot(), "write", {
        path: `${LITERAL_SLOT_ROOT}/any.md`,
      }),
    ).toStrictEqual({ block: true, reason: UNIVERSAL_NO_PERMISSION_REPLICA });
    // A follow-up action on the SAME state behaves as if the span never
    // existed: a fresh balanced run enters and settles cleanly.
    const again = await cap.run();
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("unreachable");
    expect(again.outputs).toStrictEqual({ recovered: true });
    expect(state.snapshot().sources).toBeNull();
  });

  it("CONTRACT-VIOLATION: an invalid-input run enters NOTHING (strictly after validateInputs -- zero enter-side effect, the state reading untouched)", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/span-violation");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    const session = stampedHost(world);
    const enterSpy = vi.spyOn(state, "enterCapability");
    const exitSpy = vi.spyOn(state, "exitCapability");
    // Reuse of the ViolatingStampCap fixture shape: required value input.
    class ViolatingSpanCap extends PioCapability {
      readonly contract: Contract = {
        name: "span-cap",
        version: "1.0.0",
        inputs: [{ name: "doc" }],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    }
    const result = await new ViolatingSpanCap(session).run({});
    expectSingleFailure(result, {
      type: "ContractViolationError",
      cause: "contract",
      message:
        "Contract violation: input 'doc' expects a non-empty string value",
      violations: ["input 'doc' expects a non-empty string value"],
    });
    expect(enterSpy).toHaveBeenCalledTimes(0);
    expect(exitSpy).toHaveBeenCalledTimes(0);
    expect(state.snapshot().sources).toBeNull();
  });
});

describe("PioCapability - capability-source span window (hop-body regression)", () => {
  it("HOP: the row-2 window over a STATELESS adopted host NO-OPS CLEANLY -- every gate operation no-ops over the platform-minted handle (the documented foreign boundary), so the full callee body (phase included) leaves the STAMPED shared parent state untouched at depth 0, with zero sendCustomMessage on both handles and the phase prompt on the adopted child handle", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/span-hop");
    const state = freshRowState();
    // Stamp BEFORE any frame is built over the world: the top frame
    // discovers the row-held state by identity at holder install.
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    let child: BHandle | undefined;
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-span-child",
        observe: (incoming: BHandle) => {
          child = incoming;
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    class HopSpanCap extends PioCapability {
      readonly contract: Contract = FIXTURE_CONTRACT;
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        const a = await this.execute_phase("hop-phase", {
          instructions: "do it",
        });
        return { iterations: a.iterations };
      }
    }
    const result = await new HopSpanCap().run();
    expect(result.ok).toBe(true);
    // THE shared state survived the FULL hop untouched: the bracket over
    // the ADOPTED host no-ops cleanly (the platform-minted, unstamped
    // handle carries no execution state -- the documented foreign
    // boundary) -- depth 0 throughout.
    expect(state.snapshot().sources).toBeNull();
    expect(state.snapshot().phase).toBeNull();
    // Absence pins (mirror of the span-stamp row-2 row): neither handle
    // received a custom message; the phase prompt rode the adopted child.
    const c = child as BHandle;
    expect(c.prompt).toHaveBeenCalledTimes(1);
    expect(c.sendCustomMessage).not.toHaveBeenCalled();
    expect(world.parentHandle.sendCustomMessage).not.toHaveBeenCalled();
    expect(world.parentHandle.prompt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Capability-source SPAN WINDOW over the STAMPED-SHARED-STATE row-2
// physical: the hop body BRACKETS the callee's span over the shared stack
// discovered by the adopted host (enter strictly post-adoption/pre-body,
// exit at settlement on success AND the catch-all alike). The fixture
// mirrors the dist-verified physics with ZERO harness surgery: the real
// fromRuntime discovery path runs end-to-end, and the scripted switch
// stamps every freshly-minted INCOMING handle via its observe callback
// (the stored factory re-run stamps every created handle - the measured
// switchSession physics). Row-owned REAL anchor channels plus pre-created
// deliverables carry the disk-truth duty for the admit rows (the
// settlement gate consults real existsSync for write-bag declarations);
// refusal-only consultations freely use non-existent literal roots.
// Prompts settle over the adopted CHILD handle during the hop; restored
// swaps reuse the source sessionId strings so the rebind identity gates
// hold (reopen-retains-sessionId physics). Consults ride the REAL
// decideWrite(state.snapshot(), ...) predicate captured at key vantages
// and asserted after cap.run() (fault-masking avoidance idiom: verdicts
// never fire hermetically; the script never invokes the interceptor).
// Every row sits AFTER the B block (sticky takeover-eval flag discipline).
// ---------------------------------------------------------------------
describe("PioCapability - capability-source span window (hop-body bracket over the stamped-shared-state physical)", () => {
  it("SNAPSHOT: mid-body the CALLEE'S sources read INNERMOST with the parent's span SUSPENDED behind it (retained [parent, callee]), the enter evidence orders strictly BEFORE the adopted child handle's first prompt, and the full settle restores pre-hop governance (null/null, balanced enter/exit counts)", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/hop-snapshot");
    const state = freshRowState();
    // Stamp BEFORE any frame is built over the world: the top frame
    // discovers the row-held state by identity at holder install.
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    // Observe-time stamping: the incoming handle already carries the SAME
    // shared state when the adoption discovers it (measured factory-re-
    // run physics).
    const children: BHandle[] = [];
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-snap-child",
        observe: (incoming: BHandle): void => {
          children.push(incoming);
          stampRowState(incoming, state);
          scriptQuietPrompts(incoming, 1);
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const session = stampedHost(world);
    const enterSpy = vi.spyOn(state, "enterCapability");
    const exitSpy = vi.spyOn(state, "exitCapability");
    const sourceNames: string[] = [];
    class SnapParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "snap-parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await snapChild.run();
        return { nested: true };
      }
    }
    class SnapChildCap extends PioCapability {
      readonly contract: Contract = {
        name: "snap-callee",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        const a = await this.execute_phase("quiet-hopped", {
          shouldStopLoop: async () => true,
        });
        return { settled: a.done };
      }
    }
    const snapChild = new SnapChildCap();
    const result = await new SnapParentCap(session).run();
    expect(result.ok).toBe(true);
    // THE retained reading [parent, callee]: the parent's span suspends
    // BEHIND the callee's while the hopped body executes.
    expect(sourceNames).toEqual(["snap-parent", "snap-callee"]);
    // Enter evidence orders STRICTLY BEFORE the adopted child handle's
    // first prompt (the second enter is the bracket's post-adoption push
    // on the SHARED state).
    expect(enterSpy).toHaveBeenCalledTimes(2);
    expect(children[0].prompt.mock.invocationCallOrder[0]).toBeGreaterThan(
      enterSpy.mock.invocationCallOrder[1],
    );
    // Full settle: pre-hop governance restored (depth 0), one balanced
    // pair per placement branch (two spans opened, two popped).
    expect(exitSpy).toHaveBeenCalledTimes(2);
    expect(state.snapshot()).toStrictEqual({
      sources: null,
      phase: null,
      paths: {
        projectSlotRoot: LITERAL_SLOT_ROOT,
        workspaceCwd: LITERAL_WORKSPACE_CWD,
      },
    });
  });

  it("ADMIT PAIR: the callee's phase-DECLARED deliverable ADMITS through the REAL predicate under the callee's OWN contract patterns mid-pass (verdict undefined -- THE discriminator against the pre-fix universal byte), while the SAME target over the pre-hop parent window renders the universal no-permission byte replica identically, with the source-name capture pinning [parent, callee, parent]", async () => {
    const root = newBTempRoot();
    const slotRoot = join(root, "slot");
    mkdirSync(join(slotRoot, "research"), { recursive: true });
    const artifact = join(slotRoot, "research", "report.md");
    // Pre-created disk truth: the settlement gate consults REAL existence
    // for the declared deliverable (disk-truth duty stays suite-side).
    writeFileSync(artifact, "pre-created disk truth\n", "utf8");
    const world = buildBWorld(root, "/work/hop-admit");
    // REAL row-owned anchor channels (never /tmp/-anchored literals).
    const state = freshRowState(slotRoot, join(root, "cwd"));
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    const children: BHandle[] = [];
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-admit-child",
        observe: (incoming: BHandle): void => {
          children.push(incoming);
          stampRowState(incoming, state);
          scriptQuietPrompts(incoming, 1);
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const session = stampedHost(world);
    const sourceNames: string[] = [];
    const verdicts: Array<WriteGateVerdict | undefined> = [];
    class AdmitParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "admit-parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        // Pre-hop vantage: the parent's empty-contract SILENT window over
        // the SAME target renders the universal byte (the contrasting
        // non-governing side of the discriminating pair).
        verdicts.push(
          decideWrite(state.snapshot(), "write", { path: artifact }),
        );
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await admitChild.run();
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { done: true };
      }
    }
    class AdmitChildCap extends PioCapability {
      readonly contract: Contract = {
        name: "admit-callee",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: ["research/*.md"],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        await this.execute_phase("probe-write", {
          write: [artifact],
          instructions: "produce the report",
          shouldStopLoop: async (): Promise<boolean> => {
            // MID-PASS (the attached phase still governs at this break
            // point): the declared deliverable is consulted through the
            // REAL predicate.
            verdicts.push(
              decideWrite(state.snapshot(), "write", { path: artifact }),
            );
            sourceNames.push(state.snapshot().sources?.name ?? "none");
            return true;
          },
        });
        return { admitted: true };
      }
    }
    const admitChild = new AdmitChildCap();
    const result = await new AdmitParentCap(session).run();
    expect(result.ok).toBe(true);
    // THE retained reading [parent, callee, parent]: admission happened
    // under the callee's OWN layer, and the suspended parent governs
    // again once the callee settles.
    expect(sourceNames).toEqual([
      "admit-parent",
      "admit-callee",
      "admit-parent",
    ]);
    // THE discriminating pair: the pre-hop silent window refuses the SAME
    // target on the universal byte, while the mid-pass reading under the
    // running callee's own contract patterns is ADMISSION (undefined).
    expect(verdicts).toHaveLength(2);
    expect(verdicts[0]).toStrictEqual({
      block: true,
      reason: UNIVERSAL_NO_PERMISSION_REPLICA,
    });
    expect(verdicts[1]).toBeUndefined();
    expect(state.snapshot().phase).toBeNull();
  });

  it("STRAY REFUSAL: a STRAY target outside the callee's layer consulted mid-pass (the active phase GOVERNS exclusively - moment-set listing) refuses with the PHASE-LINE shape enumerating the surviving declared deliverable (replica mirroring write-gate.ts byte-for-byte), while the pre-hop vantage over the SAME stray renders the universal byte", async () => {
    const root = newBTempRoot();
    const slotRoot = join(root, "slot");
    mkdirSync(join(slotRoot, "research"), { recursive: true });
    const artifact = join(slotRoot, "research", "report.md");
    writeFileSync(artifact, "pre-created disk truth\n", "utf8");
    // Refusal-only consultation: the stray root need not exist (the
    // predicate is channel-free and never touches disk).
    const stray = join(slotRoot, "stray", "notes.txt");
    const world = buildBWorld(root, "/work/hop-stray");
    const state = freshRowState(slotRoot, join(root, "cwd"));
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    const children: BHandle[] = [];
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-stray-child",
        observe: (incoming: BHandle): void => {
          children.push(incoming);
          stampRowState(incoming, state);
          scriptQuietPrompts(incoming, 1);
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const session = stampedHost(world);
    const sourceNames: string[] = [];
    const verdicts: Array<WriteGateVerdict | undefined> = [];
    class StrayParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "stray-parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        verdicts.push(decideWrite(state.snapshot(), "write", { path: stray }));
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await strayChild.run();
        return { done: true };
      }
    }
    class StrayChildCap extends PioCapability {
      readonly contract: Contract = {
        name: "stray-callee",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: ["research/*.md"],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        await this.execute_phase("probe-stray", {
          write: [artifact],
          instructions: "produce the report",
          shouldStopLoop: async (): Promise<boolean> => {
            // MID-PASS: the phase's effective construction holds EXACTLY
            // the surviving deliverable - the stray sits OUTSIDE the
            // layer, so the phase line lists the moment's set alone.
            verdicts.push(
              decideWrite(state.snapshot(), "write", { path: stray }),
            );
            sourceNames.push(state.snapshot().sources?.name ?? "none");
            return true;
          },
        });
        return { refused: true };
      }
    }
    const strayChild = new StrayChildCap();
    const result = await new StrayParentCap(session).run();
    expect(result.ok).toBe(true);
    expect(sourceNames).toEqual(["stray-parent", "stray-callee"]);
    // Pre-hop: the parent's silent window renders the universal byte.
    expect(verdicts).toHaveLength(2);
    expect(verdicts[0]).toStrictEqual({
      block: true,
      reason: UNIVERSAL_NO_PERMISSION_REPLICA,
    });
    // Mid-pass: the GOVERNING-WINDOW vantage (chosen as the
    // discriminating shape) renders the PHASE LINE naming the active
    // phase and listing ONLY the surviving deliverable (no scope or
    // scratch elements - none are declared).
    expect(verdicts[1]).toStrictEqual(
      PHASE_LINE_REPLICA("probe-stray", [artifact]),
    );
    expect(state.snapshot().phase).toBeNull();
  });

  it("FAULT PATH: a callee fault AFTER a settled pass settles the ok:false typed capture at the AWAIT (never-rejects preserved), the pop PRECEDES the settlement (post-fault the shared state reads the RESUMED parent layer with the faulting callee's pop already recorded, and the REAL-predicate consult renders the universal byte), and a FOLLOW-UP balanced second hop settles ok:true as if the callee span never existed (3/3 balanced, depth restored to pre-hop governance)", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/hop-fault");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    const children: BHandle[] = [];
    // Two hops: the faulting hop + the balanced follow-up (each attaches
    // and restores; both incoming handles stamped at observe time).
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-fault-child",
        observe: (incoming: BHandle): void => {
          children.push(incoming);
          stampRowState(incoming, state);
          scriptQuietPrompts(incoming, 1);
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
      {
        kind: "swap",
        sessionId: "sess-fault-second",
        observe: (incoming: BHandle): void => {
          children.push(incoming);
          stampRowState(incoming, state);
        },
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const session = stampedHost(world);
    const enterSpy = vi.spyOn(state, "enterCapability");
    const exitSpy = vi.spyOn(state, "exitCapability");
    const sourceNames: string[] = [];
    const verdicts: Array<WriteGateVerdict | undefined> = [];
    const hopResults: CapabilityResult[] = [];
    let midEnters = -1;
    let midExits = -1;
    class FaultHopCap extends PioCapability {
      readonly contract: Contract = {
        name: "fault-callee",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        await this.execute_phase("fault-after-settle", {
          shouldStopLoop: async () => true,
        });
        // The author-level fault lands AFTER a settled pass.
        throw new Error("body fault after a settled run");
      }
    }
    class QuietHopCap extends PioCapability {
      readonly contract: Contract = {
        name: "quiet-callee",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        return { recovered: true };
      }
    }
    class FaultParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "fault-parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        hopResults.push(await new FaultHopCap().run());
        // Post-rejection vantage (still inside the parent body): the
        // callee layer is GONE - the parent layer resumed governing and
        // its silent window refuses on the universal byte.
        verdicts.push(
          decideWrite(state.snapshot(), "write", {
            path: `${LITERAL_SLOT_ROOT}/any.md`,
          }),
        );
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        // Balance witness at the capture's AWAIT: two enters have landed
        // (parent + the faulting callee), and the callee's OWN pop is
        // already recorded while the parent span stays open (it settles
        // with the parent's own finally) -- the pop strictly preceded the
        // ok:false capture reaching this await.
        midEnters = enterSpy.mock.calls.length;
        midExits = exitSpy.mock.calls.length;
        hopResults.push(await new QuietHopCap().run());
        return { settled: true };
      }
    }
    const result = await new FaultParentCap(session).run();
    expect(result.ok).toBe(true);
    // Never-rejects preserved: the ok:false TYPED CAPTURE reached the
    // await (settled identically into the child record by the hop's own
    // containment).
    expect(hopResults).toHaveLength(2);
    expectSingleFailure(hopResults[0], {
      type: "Error",
      message: "body fault after a settled run",
    });
    expect(hopResults[1].ok).toBe(true);
    if (!hopResults[1].ok) throw new Error("unreachable");
    expect(hopResults[1].outputs).toStrictEqual({ recovered: true });
    // THE pop preceded the settlement: the post-rejection consultation
    // through the REAL predicate renders the universal byte, and the
    // retained witness shows the PARENT layer resuming.
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toStrictEqual({
      block: true,
      reason: UNIVERSAL_NO_PERMISSION_REPLICA,
    });
    expect(sourceNames).toEqual(["fault-parent"]);
    // Balanced bookkeeping at the capture's await: the faulting callee's
    // span is CLOSED (its pop recorded) while the parent span is still
    // open -- and after the follow-up hop everything balances (3/3).
    expect(midEnters).toBe(2);
    expect(midExits).toBe(1);
    expect(enterSpy).toHaveBeenCalledTimes(3);
    expect(exitSpy).toHaveBeenCalledTimes(3);
    expect(state.snapshot().sources).toBeNull();
    expect(state.snapshot().phase).toBeNull();
  });

  it("NESTED HOP BALANCE: a row-2 hop INSIDE a row-2 hop retains [parent, outer, inner] with the INNERMOST governing (the inner-delivered mid-pass consult ADMITS under the inner layer's patterns), the outer resumes behind the popped inner, and the full settle returns the shared state to pre-hop governance with 3/3 balanced enter/exit counts", async () => {
    const root = newBTempRoot();
    const slotRoot = join(root, "slot");
    mkdirSync(join(slotRoot, "deep"), { recursive: true });
    const deepArtifact = join(slotRoot, "deep", "note.md");
    writeFileSync(deepArtifact, "pre-created disk truth\n", "utf8");
    const world = buildBWorld(root, "/work/hop-nested");
    const state = freshRowState(slotRoot, join(root, "cwd"));
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    const handles: BHandle[] = [];
    // FOUR scripted swaps (attach outer, attach inner, restore inner,
    // restore outer); every INCOMING handle stamped at observe time (the
    // measured factory-re-run physics); restored sessionIds REUSED so the
    // rebind identity gates hold.
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "nest-outer-child",
        observe: (incoming: BHandle): void => {
          handles.push(incoming);
          stampRowState(incoming, state);
        },
      },
      {
        kind: "swap",
        sessionId: "nest-inner-child",
        observe: (incoming: BHandle): void => {
          handles.push(incoming);
          stampRowState(incoming, state);
          scriptQuietPrompts(incoming, 1);
        },
      },
      {
        kind: "swap",
        sessionId: "nest-outer-child",
        observe: (incoming: BHandle): void => {
          handles.push(incoming);
          stampRowState(incoming, state);
        },
      },
      {
        kind: "swap",
        sessionId: "sess-fake-0001",
        observe: (incoming: BHandle): void => {
          handles.push(incoming);
          stampRowState(incoming, state);
        },
      },
    );
    const session = stampedHost(world);
    const enterSpy = vi.spyOn(state, "enterCapability");
    const exitSpy = vi.spyOn(state, "exitCapability");
    const sourceNames: string[] = [];
    const verdicts: Array<WriteGateVerdict | undefined> = [];
    class NestParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "nest-parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await nestOuter.run();
        return { nested: true };
      }
    }
    class NestOuterCap extends PioCapability {
      readonly contract: Contract = {
        name: "nest-outer",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await nestInner.run();
        // Outer resume: the inner span popped, the OUTER layer governs
        // again before the outer body settles.
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { nested: true };
      }
    }
    class NestInnerCap extends PioCapability {
      readonly contract: Contract = {
        name: "nest-inner",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: ["deep/*.md"],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        await this.execute_phase("nested-probe", {
          write: [deepArtifact],
          instructions: "write the note",
          shouldStopLoop: async (): Promise<boolean> => {
            // MID-PASS at depth 2: the INNERMOST layer governs - the
            // inner-delivered artifact admits under the inner layer's
            // patterns (outer's empty contract would clamp it away).
            verdicts.push(
              decideWrite(state.snapshot(), "write", {
                path: deepArtifact,
              }),
            );
            sourceNames.push(state.snapshot().sources?.name ?? "none");
            return true;
          },
        });
        return { deep: true };
      }
    }
    const nestInner = new NestInnerCap();
    const nestOuter = new NestOuterCap();
    const result = await new NestParentCap(session).run();
    expect(result.ok).toBe(true);
    // THE retained sequence: [parent, outer, inner] with the outer RESUME
    // as the closing reading (the inner pops behind the outer's back).
    expect(sourceNames).toEqual([
      "nest-parent",
      "nest-outer",
      "nest-inner",
      "nest-outer",
    ]);
    // Innermost governing: the inner-delivered artifact ADMITS through
    // the REAL predicate under the inner layer's own patterns.
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toBeUndefined();
    // Balanced settle on the SHARED state: three spans opened (one per
    // placement branch), three popped - pre-hop governance restored.
    expect(enterSpy).toHaveBeenCalledTimes(3);
    expect(exitSpy).toHaveBeenCalledTimes(3);
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(4);
    expect(state.snapshot()).toStrictEqual({
      sources: null,
      phase: null,
      paths: {
        projectSlotRoot: slotRoot,
        workspaceCwd: join(root, "cwd"),
      },
    });
  });

  it("POST-HOP PARENT RESUME: after the child settles AND the switch-back runs, the PARENT's span GOVERNS AGAIN (retained [parent, callee, parent]) and its SILENT windows STILL refuse on the universal byte (nothing attached) -- the restore path's content invariant across the switch-back + rebind restore", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/hop-resume");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    await installBHolder(world, root);
    const handles: BHandle[] = [];
    scriptBSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-resume-child",
        observe: (incoming: BHandle): void => {
          handles.push(incoming);
          stampRowState(incoming, state);
          scriptQuietPrompts(incoming, 1);
        },
      },
      {
        kind: "swap",
        sessionId: "sess-fake-0001",
        observe: (incoming: BHandle): void => {
          handles.push(incoming);
          stampRowState(incoming, state);
        },
      },
    );
    const session = stampedHost(world);
    const sourceNames: string[] = [];
    const verdicts: Array<WriteGateVerdict | undefined> = [];
    const target = `${LITERAL_SLOT_ROOT}/resume/readme.md`;
    class ResumeParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "resume-parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        // Vantage 1: the parent's OWN silent window pre-hop.
        verdicts.push(decideWrite(state.snapshot(), "write", { path: target }));
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await resumeChild.run();
        // Vantage 3: AFTER the child settle AND the switch-back (the latch
        // resolves only once the restore ran) -- the parent's span governs
        // AGAIN over the RESTORED handle.
        verdicts.push(decideWrite(state.snapshot(), "write", { path: target }));
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { resumed: true };
      }
    }
    class ResumeChildCap extends PioCapability {
      readonly contract: Contract = {
        name: "resume-callee",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor() {
        super({});
      }
      async call(): Promise<Record<string, unknown>> {
        const a = await this.execute_phase("silent-hopped", {
          instructions: "stay quiet",
        });
        // Vantage 2: mid-callee-body - the callee's OWN silent window
        // (span present, nothing attached) over the same target.
        verdicts.push(decideWrite(state.snapshot(), "write", { path: target }));
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { quiet: a.done };
      }
    }
    const resumeChild = new ResumeChildCap();
    const result = await new ResumeParentCap(session).run();
    expect(result.ok).toBe(true);
    // THE content invariant across the switch-back + rebind restore: the
    // RETAINED SEQUENCE reads [parent, callee, parent] - the parent's
    // span survived the handle replacement (rebind leaves the execution
    // state intact; spans belong to the balanced enter/exit lifecycle).
    expect(sourceNames).toEqual([
      "resume-parent",
      "resume-callee",
      "resume-parent",
    ]);
    // Every SILENT window (parent pre-hop, callee mid-body, parent
    // post-switch-back) STILL refuses on the universal byte.
    expect(verdicts).toHaveLength(3);
    for (const verdict of verdicts) {
      expect(verdict).toStrictEqual({
        block: true,
        reason: UNIVERSAL_NO_PERMISSION_REPLICA,
      });
    }
    // Physics pins: switch args [childFile, parentFile] with the cwd
    // override, and the CURRENT handle IS the restored parent mint.
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
    expect(world.runtime.switchSession).toHaveBeenNthCalledWith(
      2,
      world.parentFile,
      { cwdOverride: world.cwd },
    );
    expect(world.runtime.session).toBe(handles[1]);
    expect(state.snapshot().phase).toBeNull();
  });
});

describe("PioCapability - capability-source span window (composed-in-process nesting)", () => {
  it("NESTED: the REAL predicate refuses ALL THREE consultations with the IDENTICAL universal byte (the span site is non-admitting - no phase confirms any target), the retained top-layer source-name capture pins the [caller, callee, caller] suspend/restore ordering, and post-run BOTH spans settle to null/null", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/span-nested");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    const session = stampedHost(world);
    // Shared-handle lookup: caller AND callee discover the SAME state by
    // identity (the row-1 composed shape).
    const stray = `${LITERAL_SLOT_ROOT}/notes/a.md`;
    const observed: Array<WriteGateVerdict | undefined> = [];
    const sourceNames: string[] = [];
    class NestedCallerCap extends PioCapability {
      readonly contract: Contract = {
        name: "caller-cap",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: ["demo/*.md"],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        // (1) Mid-caller-span, pre-child: NOTHING governs (no phase) -
        // the refusal names the STATE; the LAYER rides the marker channel.
        observed.push(decideWrite(state.snapshot(), "write", { path: stray }));
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        // (2) The callee composes IN-PROCESS over the SAME handle/state.
        await callee.run();
        // (3) Back in the caller body AFTER child settlement: the CALLER's
        // sources govern AGAIN - proven mechanically via the name capture.
        observed.push(decideWrite(state.snapshot(), "write", { path: stray }));
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { nested: true };
      }
    }
    class NestedCalleeCap extends PioCapability {
      readonly contract: Contract = {
        name: "callee-cap",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: ["research/*.md"],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        // Inside the callee's own span: its own artifact REFUSES too -
        // the span confers nothing without a confirming phase.
        observed.push(
          decideWrite(state.snapshot(), "write", {
            path: `${LITERAL_SLOT_ROOT}/research/findings.md`,
          }),
        );
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { researched: true };
      }
    }
    const callee = new NestedCalleeCap(session);
    const result = await new NestedCallerCap(session).run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // THE THREE-WAY byte identity: every consultation resolves to the
    // universal no-permission byte (property (c) reinterpretation of
    // record: the refusal names the STATE; the layer rides the marker
    // channel).
    expect(observed).toHaveLength(3);
    for (const verdict of observed) {
      expect(verdict).toStrictEqual({
        block: true,
        reason: UNIVERSAL_NO_PERMISSION_REPLICA,
      });
    }
    // Retained mechanics proof: the TOP-LAYER SOURCE NAMES track the
    // suspend/restore ordering through the composed hop.
    expect(sourceNames).toEqual(["caller-cap", "callee-cap", "caller-cap"]);
    // (4) Post-run: both spans settled.
    expect(state.snapshot().sources).toBeNull();
    expect(state.snapshot().phase).toBeNull();
  });
});

describe("PioCapability - capability-source span window (empty-contract span - the compose-demo shape)", () => {
  it("EMPTY: the universal no-permission byte INSIDE every span IS itself the standing demonstration that a span confers nothing - the in-parent-span stray, the in-parent-span /tmp/ scratch (parity class RETIRED inside an empty span), and the child's own artifact under the child span ALL refuse identically, with the source-name capture pinning [parent, parent, child]; post-run the state is restored to pre-run governance", async () => {
    const root = newBTempRoot();
    const world = buildBWorld(root, "/work/span-empty");
    const state = freshRowState();
    stampRowState(world.parentHandle, state);
    const session = stampedHost(world);
    const observed: Array<WriteGateVerdict | undefined> = [];
    const sourceNames: string[] = [];
    class EmptyParentCap extends PioCapability {
      readonly contract: Contract = {
        name: "parent",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: [],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        // Within the parent span ALONE (before the child): genuinely total
        // default-deny - the span confers nothing.
        observed.push(
          decideWrite(state.snapshot(), "write", {
            path: `${LITERAL_SLOT_ROOT}/stray/readme.md`,
          }),
        );
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        // The /tmp/ scratch inside the empty span: parity class RETIRED -
        // undeclared means refused at every depth now.
        observed.push(
          decideWrite(state.snapshot(), "write", {
            path: "/tmp/scratch.txt",
          }),
        );
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        await child.run();
        return { done: true };
      }
    }
    class ComposingChildCap extends PioCapability {
      readonly contract: Contract = {
        name: "child",
        version: "1.0.0",
        inputs: [],
        outputs: [],
        writes: ["notes/*.md"],
      };
      constructor(host: PioSession) {
        super({ session: host });
      }
      async call(): Promise<Record<string, unknown>> {
        observed.push(
          decideWrite(state.snapshot(), "write", {
            path: `${LITERAL_SLOT_ROOT}/notes/b.md`,
          }),
        );
        sourceNames.push(state.snapshot().sources?.name ?? "none");
        return { done: true };
      }
    }
    const child = new ComposingChildCap(session);
    const result = await new EmptyParentCap(session).run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Properties (a)+(b) reinterpreted of record: the universal byte
    // INSIDE the spans is itself the standing demonstration that a span
    // confers nothing - all three readings converge on ONE fixed string.
    expect(observed).toHaveLength(3);
    for (const verdict of observed) {
      expect(verdict).toStrictEqual({
        block: true,
        reason: UNIVERSAL_NO_PERMISSION_REPLICA,
      });
    }
    // Retained mechanics proof: the TOP-LAYER SOURCE NAMES track the
    // suspend/restore ordering ([parent, parent, child]).
    expect(sourceNames).toEqual(["parent", "parent", "child"]);
    // Post-run: state restored to pre-run governance.
    expect(state.snapshot().sources).toBeNull();
    expect(state.snapshot().phase).toBeNull();
  });
});
