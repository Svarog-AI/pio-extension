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
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { deriveProjectKey } from "../sandbox/layout.ts";
import type { CapabilityParams } from "./base.ts";
import {
  CapabilityEnvError,
  deriveStateRootFromAgentDir,
  PioCapability,
  settleFileModeOutputs,
} from "./base.ts";
import type { Contract } from "./contract.ts";
import { ContractViolationError, PhaseBudgetError } from "./errors.ts";
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
    // Recording mock for the no-turn custom-message seam (arg-shape
    // observable; never triggers a turn on this plane).
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

  const reset = () => {
    state.rounds = [];
    state.mints = 0;
    getAgentDir.mockClear();
    SessionManager.create.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
  };

  return {
    state,
    getAgentDir,
    SessionManager,
    createAgentSessionServices,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    reset,
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: harness.getAgentDir,
  SessionManager: harness.SessionManager,
  createAgentSessionServices: harness.createAgentSessionServices,
  createAgentSessionFromServices: harness.createAgentSessionFromServices,
  createAgentSessionRuntime: harness.createAgentSessionRuntime,
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
  delete process.env.PI_CODING_AGENT_DIR; // start UNSET — settle rows opt in
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
      label:
        "a PhaseBudgetError captures with the budget cause and default message",
      thrower: () => new PhaseBudgetError(2),
      expected: {
        type: "PhaseBudgetError",
        cause: "budget",
        message: "Iteration budget exceeded after 2 iterations",
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

  it("B5 — a body-thrown PhaseBudgetError surfaces unmasked at the await ({ type: 'PhaseBudgetError', cause: 'budget', default message }) with the hop fully unwound and the record mirrored", async () => {
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
        throw new PhaseBudgetError(2);
      }
    }
    const result = await new B5Cap().run();
    expectSingleFailure(result, {
      type: "PhaseBudgetError",
      cause: "budget",
      message: "Iteration budget exceeded after 2 iterations",
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
        type: "PhaseBudgetError",
        cause: "budget",
        message: "Iteration budget exceeded after 2 iterations",
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
      expect(rejection).not.toBeInstanceOf(PhaseBudgetError);
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
    // The wrapper forwards the option bag verbatim: only the engine-composed
    // phase marker plus the authored instructions reach the prompt channel.
    expect(round.session.prompt).toHaveBeenNthCalledWith(
      1,
      `${PHASE_A_MARKER}\ndo A`,
    );
    expect(round.session.prompt).toHaveBeenNthCalledWith(
      2,
      `${PHASE_B_MARKER}\ndo B`,
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
    const framed = `${PHASE_A_MARKER}\ndo A`;
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
    expect(round.session.prompt).toHaveBeenCalledWith(PHASE_A_MARKER);
    const sent = round.session.prompt.mock.calls[0][0];
    expect(sent.endsWith("\n")).toBe(false);
    expect(sent.includes(CAP_MARKER)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Span stamp: owned SOLELY by the run() seam (owner scope ruling — the
// phase path has NO awareness of the channel). Each run() opens its span
// with EXACTLY ONE no-turn durable custom-message header on whichever
// branch holds the span; label = the capability's OWN contract.name;
// content = the renderer's pinned bytes (single-owner reference — the
// suite never duplicates the line bytes). The replica below names the
// module-private namespace owner in ./pio-session.ts.
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
    // Log-order pin: the settled stamp strictly precedes the span's FIRST
    // phase prompt — the header reads as a section header above it.
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

  it("a ZERO-PHASE body still persists the bare header (the flipped accepted edge — pinned as intended, not special-cased away): one stamp, zero prompts", async () => {
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

  class BreachStampCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("breach", {
        min: 3,
        max: 2,
        shouldStopLoop: async () => false,
      });
      return { unreachable: a.iterations };
    }
  }

  it("a budget-breach body still PERSISTS the span stamp (the mark landed before the body and outlives the rejection)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    const cap = new BreachStampCap({ session: instance });
    const result = await cap.run();
    expectSingleFailure(result, {
      type: "PhaseBudgetError",
      cause: "budget",
      message: "Iteration budget exceeded after 2 iterations",
    });
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
  });

  it("ROW-2 uniformity: the hop body stamps the CALLEE'S span on the ADOPTED child handle after adoption and BEFORE the body's first phase prompt — the parent frame stays unstamped", async () => {
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
    // THE stamp lands on the CHILD frame's handle, at the renderer's pinned
    // bytes labeled with the CALLEE's own name.
    expect(c.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(c.sendCustomMessage).toHaveBeenCalledWith({
      customType: CAPABILITY_CUSTOM_TYPE_REPLICA,
      content: renderCapabilityMarker("fixture-cap"),
      display: true,
      details: undefined,
    });
    expect(c.sendCustomMessage.mock.calls[0]).toHaveLength(1);
    // ...strictly BEFORE the callee span's first phase prompt.
    expect(c.prompt).toHaveBeenCalledTimes(1);
    expect(c.sendCustomMessage.mock.invocationCallOrder[0]).toBeLessThan(
      c.prompt.mock.invocationCallOrder[0],
    );
    // The parent frame is UNSTAMPED: the header opened in the child's
    // transcript, not the caller's.
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
  class BreachCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      const a = await this.execute_phase("breach", {
        min: 3,
        max: 2,
        shouldStopLoop: async () => false,
      });
      return { unreachable: a.iterations };
    }
  }

  it("lets an uncaptured budget breach escape the body into the failing result", async () => {
    const { instance, round } = await host();
    const cap = new BreachCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expectSingleFailure(result, {
      type: "PhaseBudgetError",
      cause: "budget",
      message: "Iteration budget exceeded after 2 iterations",
    });
  });

  class CaughtBreachCap extends PioCapability {
    readonly contract: Contract = FIXTURE_CONTRACT;
    constructor(params: CapabilityParams = {}) {
      super(params);
    }
    async call(): Promise<Record<string, unknown>> {
      let caughtIterations: number | undefined;
      try {
        await this.execute_phase("breach", {
          min: 3,
          max: 2,
          shouldStopLoop: async () => false,
        });
      } catch (err) {
        // Authors may catch the breach narrowly around individual calls.
        if (err instanceof PhaseBudgetError) {
          caughtIterations = err.iterations;
        } else {
          throw err;
        }
      }
      return { caughtIterations };
    }
  }

  it("completes ok when the body catches the breach narrowly", async () => {
    const { instance, round } = await host();
    const cap = new CaughtBreachCap({ session: instance });
    scriptRuns(round, quietRun(), quietRun());
    const result = await cap.run();
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ caughtIterations: 2 });
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
    // The wrapper forwards options verbatim: the bare marker line stands alone.
    expect(round.session.prompt).toHaveBeenCalledWith(
      "\u2014\u2014 hooked \u2014\u2014",
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
// PI_CODING_AGENT_DIR (every row starts UNSET; the lifecycle restores).
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

  it("THE scope ruling pinned mechanically: EXACTLY TWO span-stamp call sites (this.s.markCapability()) in base.ts, both strictly BEFORE the execute_phase declaration — the phase path references the stamp channel NOWHERE (one call site per branch; the stamp expression itself occurs nowhere else)", () => {
    const callSites = [...src.matchAll(/this\.s\.markCapability\(/g)].map(
      (match) => match.index ?? -1,
    );
    expect(callSites).toHaveLength(2);
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
