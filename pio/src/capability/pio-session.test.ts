// Hermetic unit suite for the capability session host (pio-session.ts).
// Every SDK value symbol reachable through the session-construction seam is a
// pure fake: the vi.mock factory references ONLY hoisted bindings and never
// pulls in the original module, so the real @earendil-works/pi-coding-agent
// graph is never evaluated. No filesystem, network, env, or process-stream
// assumptions — except the filesystem-scoped expectation-gate rows, which
// drive the disk-truth gate with real node:fs reads and writes against
// per-row mkdtemp tmpdir targets (disk seeding is row duty there; every
// other row remains fs/env-free). Each construction mints a fresh fake
// session behind a fresh
// fake runtime, so subscription counts and per-instance isolation are
// directly observable. Synthetic events flow through the single documented
// cast seam asEvent — the sole `as` over synthetic event payloads (the
// handle-typing seams asHandle / asRuntime below are the only other
// assertions in this file, plus the marked foreign-kind seam
// foreignVarKind feeding the malformed-kind registry-fault row).
//
// Physics-mirror harness (installed 0.85.1 dist): fake handles bookkeep
// LIVE listeners — subscribe returns a functional per-listener unsubscribe
// (agent-session.d.ts L278–L280); dispose clears the live list
// (agent-session.js L584–L604); emitTo delivers to EVERY live listener, so
// a double-subscribed handle counts every event twice and fails the exact
// sums. simulateSwap mirrors switchSession's teardown-first order
// (agent-session-runtime.js L128–L143): dispose the outgoing handle, apply
// a FRESH zero-listener handle, replay nothing (reopened transcripts
// re-fire no events). No stdout spy anywhere: the module composes no
// process-stream bytes — prompt text rides the session channel.
//
// Phase-running rows drive the runs themselves through the fake session
// handle's prompt mock: each queued implementation emits synthetic events
// through the captured listener and then resolves, where one resolution
// stands for one fully-settled logical run. The agentEnd fixture mirrors
// the installed dist payload shape ({ type, messages, willRetry }).
//
// Gate-wiring rows: host() drives the stored runtime-factory closure ONCE
// per construction so the real seam's stamp path lands on the additive
// from-services carrier handle; the minted state is recovered cast-free
// (descriptor read plus instanceof - no second cast seam) and the pinned
// empty-contract fixture span enters before any phase runs. Verdict
// assertions ride identity over the REAL predicate (the refusal bytes stay
// owned by ./guards/write-gate.ts); the per-run disclosure consult resolves
// the owned anchor channels FRESH on every execute_phase, so a file-level
// agent-dir baseline covers phase-driving rows and every remaining
// PI_CODING_AGENT_DIR touch stays a row-scoped save/restore nested over it.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { deriveProjectKey } from "../sandbox/layout.ts";
import { EXECUTION_STATE_STAMP } from "../session.ts";
import type { ExecutionSnapshot } from "../session-execution-state.ts";
import { SessionExecutionState } from "../session-execution-state.ts";
import type { CapabilityParams } from "./base.ts";
import {
  CapabilityEnvError,
  deriveStateRootFromAgentDir,
  PioCapability,
} from "./base.ts";
import type { Contract } from "./contract.ts";
import { ContractViolationError, VariableRejectionError } from "./errors.ts";
import type { CapabilitySources } from "./guards/guard-vocabulary.ts";
import { decideWrite } from "./guards/write-gate.ts";
import type { IterationCtx, PhaseResult, VarKind } from "./pio-session.ts";
import {
  PioSession,
  renderCapabilityMarker,
  renderPhaseMarker,
  renderPhasePermissionDisclosure,
  SessionHandleRefusalError,
  SessionVariableStore,
} from "./pio-session.ts";
import {
  captureError,
  createStatusEmitter,
  exitCodeFor,
  statusPath,
} from "./status.ts";

// Single documented cast seam for synthetic event payloads.
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

// Handle-typing seams: the fakes carry exactly the module's handle reach
// (sessionId / subscribe / prompt / dispose) and are presented under the
// SDK types at the fromRuntime / rebind call sites.
const asHandle = (v: FakeSession): AgentSession => v as unknown as AgentSession;
const asRuntime = (r: { session: FakeSession }): AgentSessionRuntime =>
  r as unknown as AgentSessionRuntime;

const CWD = "/work/dir";
const SESSIONS_ROOT = "/store/sessions";

type Listener = (event: AgentSessionEvent) => void;

interface FakeSession {
  subscribe: ReturnType<typeof vi.fn>;
  /** One invocation stands for one fully-settled logical run. */
  prompt: ReturnType<typeof vi.fn>;
  /** The no-turn capability-span stamp seam (recording arg-shape). */
  sendCustomMessage: ReturnType<typeof vi.fn>;
  sessionId: string;
  /** Mirrored dispose — plain callable type (the default Mock type is not
   * callable through the interface). */
  dispose: () => void;
  /** Every listener ever subscribed — append-only counting observability. */
  captured: Listener[];
  /** Live listeners: subscribe adds; unsubscribe / mirrored dispose remove. */
  live: Listener[];
  /** Mirrored platform-dispose marker (dist: _eventListeners = []). */
  disposed: boolean;
}

interface Round {
  session: FakeSession;
  runtime: { session: FakeSession };
  captured: Listener[];
}

type ManagerFake = { getCwd: () => string };

interface RuntimeOpts {
  cwd: string;
  agentDir: string;
  sessionManager: ManagerFake;
}

interface FactoryInput {
  cwd: string;
  agentDir: string;
  sessionManager: ManagerFake;
  sessionStartEvent: unknown;
}

/** Widened structural fake of the SDK tool_call event: deliberately wider
 * than the discriminated union so plain literal payloads typecheck with zero
 * casts (asEvent stays the sole payload cast seam in this file). */
interface FakeToolCallEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  input: unknown;
}

type Verdict = { block: true; reason: string };

type RecordedHandler = (event: FakeToolCallEvent) => Verdict | undefined;

interface FakeRegistration {
  event: string;
  handler: RecordedHandler;
}

interface FakePi {
  registrations: FakeRegistration[];
  on: (event: string, handler: RecordedHandler) => void;
}

/** Structural fake of the services options shape (erased harness typing is
 * sanctioned): deliberately wider than the SDK type. */
interface ServicesOpts {
  cwd: string;
  agentDir?: string;
  resourceLoaderOptions?: {
    extensionFactories?: ReadonlyArray<(pi: FakePi) => void | Promise<void>>;
  };
}

/** Structural fake of a threaded custom-tool entry (wider than the SDK
 * ToolDefinition surface the descriptor rows consult): name, the ops bag,
 * and the receipt-recording execute the rows drive. */
interface FakeThreadedTool {
  name: string;
  operations: unknown;
  execute: (args: unknown) => Promise<unknown>;
}

/** Suite-local structural view of the from-services options arg (wider-than-
 * SDK convention, established in this file): rows read the threaded
 * custom-tools entry CAST-FREE off the recorded factory call. */
interface FromServicesArg {
  services: unknown;
  sessionManager: ManagerFake;
  sessionStartEvent: unknown;
  customTools?: ReadonlyArray<FakeThreadedTool>;
}

const harness = vi.hoisted(() => {
  const managerCwd = "/managed/cwd";
  const agentDir = "/agent/dir";
  const sessionId = "sess-fake-0001";

  const state: {
    rounds: Round[];
    storedFactories: ((input: FactoryInput) => Promise<unknown>)[];
    servicesArgs: ServicesOpts[];
    stampCarriers: FakeSession[];
    fromServicesArgs: FromServicesArg[];
    bashFactoryCalls: { cwd: string; operations: unknown }[];
    bashExecReceipts: { args: unknown; bag: unknown }[];
  } = {
    rounds: [],
    storedFactories: [],
    servicesArgs: [],
    stampCarriers: [],
    fromServicesArgs: [],
    bashFactoryCalls: [],
    bashExecReceipts: [],
  };

  const fakeManager = { getCwd: () => managerCwd };
  const fakeServices = { marker: "fake-services" };

  // Dist physics mirror: subscribe returns a functional per-listener
  // unsubscribe (agent-session.d.ts L278–L280); dispose clears the live
  // list (agent-session.js L584–L604). captured = counts; live = delivery.
  const mintFakeHandle = (id: string = sessionId): FakeSession => {
    const captured: Listener[] = [];
    const live: Listener[] = [];
    const subscribe = vi.fn((listener: Listener) => {
      captured.push(listener);
      live.push(listener);
      return () => {
        const index = live.indexOf(listener);
        if (index !== -1) live.splice(index, 1);
      };
    });
    const prompt = vi.fn(async () => undefined);
    // Recording mock for the no-turn custom-message seam.
    const sendCustomMessage = vi.fn(async (): Promise<void> => {});
    const dispose = vi.fn(() => undefined);
    const handle: FakeSession = {
      sessionId: id,
      subscribe,
      prompt,
      sendCustomMessage,
      dispose,
      captured,
      live,
      disposed: false,
    };
    // Mirrors dist dispose: _eventListeners = [] + agent disconnect.
    dispose.mockImplementation(() => {
      handle.disposed = true;
      live.length = 0;
    });
    return handle;
  };

  const getAgentDir = vi.fn(() => agentDir);
  const SessionManager = {
    create: vi.fn(() => fakeManager),
  };
  const createAgentSessionServices = vi.fn(async (options: ServicesOpts) => {
    state.servicesArgs.push(options);
    return fakeServices;
  });
  const createAgentSessionFromServices = vi.fn(
    async (options: FromServicesArg) => {
      // Additive from-services arg record: rows read the threaded
      // custom-tools entry cast-free off the real seam's spread. The stamp
      // carrier stays additive - the real seam stamps the guard install
      // onto the created handle; rows read back that descriptor cast-free.
      state.fromServicesArgs.push(options);
      const carrier = mintFakeHandle();
      state.stampCarriers.push(carrier);
      return { extensionsResult: {}, session: carrier };
    },
  );
  const createAgentSessionRuntime = vi.fn(
    async (
      factory?: (input: FactoryInput) => Promise<unknown>,
      _runtimeOpts?: RuntimeOpts,
    ) => {
      if (factory !== undefined) state.storedFactories.push(factory);
      // Fresh fakes per invocation so isolation rows observe distinct
      // handles.
      const session = mintFakeHandle();
      const round: Round = {
        session,
        runtime: { session },
        captured: session.captured,
      };
      state.rounds.push(round);
      return round.runtime;
    },
  );

  // THE Landlock-bash construction floor: import-binding completeness over
  // ../tools/bash/landlock-bash.ts's FOUR SDK value reaches. The factory is
  // a RECORDING structural fake - it logs the cwd plus the ops bag it
  // received and returns the structural definition rows drive; defineTool
  // mirrors the real inference-preserving wrap as the identity passthrough;
  // getShellConfig + createLocalBashOperations stay UNEXERCISED here (the
  // island never drives the real per-spawn machinery).
  const createBashToolDefinition = vi.fn(
    (cwd: string, options: { operations: unknown }) => {
      state.bashFactoryCalls.push({ cwd, operations: options.operations });
      const execute = vi.fn(async (args: unknown) => {
        state.bashExecReceipts.push({ args, bag: options.operations });
        return { content: [], details: { exitCode: 0 } };
      });
      return { name: "bash", operations: options.operations, execute };
    },
  );
  const defineTool = vi.fn((tool: unknown) => tool);
  const getShellConfig = vi.fn(() => ({ shell: "/bin/bash", args: ["-c"] }));
  const createLocalBashOperations = vi.fn(() => ({}));

  const reset = () => {
    state.rounds = [];
    state.storedFactories = [];
    state.servicesArgs = [];
    state.stampCarriers = [];
    state.fromServicesArgs = [];
    state.bashFactoryCalls = [];
    state.bashExecReceipts = [];
    getAgentDir.mockClear();
    SessionManager.create.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
    createBashToolDefinition.mockClear();
    defineTool.mockClear();
    getShellConfig.mockClear();
    createLocalBashOperations.mockClear();
  };

  return {
    state,
    mintFakeHandle,
    getAgentDir,
    SessionManager,
    createAgentSessionServices,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    createBashToolDefinition,
    defineTool,
    getShellConfig,
    createLocalBashOperations,
    reset,
    managerCwd,
    agentDir,
    sessionId,
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
  getShellConfig: harness.getShellConfig,
  createLocalBashOperations: harness.createLocalBashOperations,
}));

beforeEach(() => {
  harness.reset();
  // THE file-level agent-dir baseline (save/set): phase-running rows resolve
  // the owned anchor channels through the fresh per-run snapshot consult, so
  // they run under a resolvable agent dir deterministically; row-scoped
  // switches (withAgentDir) save and restore back onto this baseline.
  savedAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = AGENT_DIR_LITERAL;
});

afterEach(() => {
  if (savedAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = savedAgentDir;
  }
});

/** Save slot for the file-level agent-dir baseline (restored in afterEach). */
let savedAgentDir: string | undefined;

function lastRound(): Round {
  const round = harness.state.rounds[harness.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

/** Pinned empty-contract fixture span: confers no governance - purely the
 * structural precondition a non-empty declaration attaches against. */
const FIXTURE_SPAN: CapabilitySources = {
  name: "host-fixture",
  writes: [],
  allowProjectWrites: false,
};

/** Read the stamp value off a handle by descriptor (cast-free discovery:
 * the value lands in an unknown channel and is narrowed by instanceof -
 * no additional cast seam in this file). */
function stampValue(handle: object): unknown {
  return Object.getOwnPropertyDescriptor(handle, EXECUTION_STATE_STAMP)?.value;
}

function assertMintedState(stamped: unknown): SessionExecutionState {
  if (!(stamped instanceof SessionExecutionState)) {
    throw new Error("expected the handle to carry a minted execution state");
  }
  return stamped;
}

function lastServicesArg(): ServicesOpts {
  const o = harness.state.servicesArgs[harness.state.servicesArgs.length - 1];
  if (!o) throw new Error("expected recorded services options");
  return o;
}

/** The LAST recorded from-services arg (throw-guard recovery, house idiom -
 * zero additional casts). */
function lastFromServicesArg(): FromServicesArg {
  const o =
    harness.state.fromServicesArgs[harness.state.fromServicesArgs.length - 1];
  if (!o) throw new Error("expected a recorded from-services arg");
  return o;
}

/** Drive the round's stored runtime-factory closure ONCE with synthetic
 * inputs (the factory-driving channel): the real seam's services arg
 * records and the freshly minted from-services handle carries the stamp.
 * Deliberately NOT auto-invoked by the runtime factory - existing rows
 * keep their pre-minted-handle worlds untouched. */
async function driveStoredClosure(): Promise<{
  servicesArg: ServicesOpts;
  createdHandle: FakeSession;
}> {
  const factory =
    harness.state.storedFactories[harness.state.storedFactories.length - 1];
  if (!factory) throw new Error("expected a stored runtime factory");
  await factory({
    cwd: CWD,
    agentDir: harness.agentDir,
    sessionManager: { getCwd: () => harness.managerCwd },
    sessionStartEvent: undefined,
  });
  const createdHandle =
    harness.state.stampCarriers[harness.state.stampCarriers.length - 1];
  if (!createdHandle) throw new Error("expected a stamped created handle");
  return { servicesArg: lastServicesArg(), createdHandle };
}

/** Drive one bare extension factory with a structurally typed recording pi
 * and hand back its registered tool_call handler (zero casts). */
async function captureToolCallHandler(
  extensionFactory: (pi: FakePi) => void | Promise<void>,
): Promise<RecordedHandler> {
  const registrations: FakeRegistration[] = [];
  const pi: FakePi = {
    registrations,
    on: (event, handler) => {
      registrations.push({ event, handler });
    },
  };
  await extensionFactory(pi);
  const registration = registrations.find((r) => r.event === "tool_call");
  if (!registration) {
    throw new Error("expected a registered tool_call handler");
  }
  return registration.handler;
}

/** Build a host plus the construction round backing it, and RECOVER THE
 * GATE PLUMBING: the stored closure is driven once so the real seam's
 * stamp path lands, the minted state is recovered cast-free, the pinned
 * fixture span enters, and the threaded tool_call handler is captured.
 * The gate record is additive - invisible to every pre-existing
 * destructuring. */
async function host(sessionsRoot?: string) {
  const instance = await PioSession.create(CWD, sessionsRoot);
  const round = lastRound();
  const { servicesArg, createdHandle } = await driveStoredClosure();
  const state = assertMintedState(stampValue(createdHandle));
  state.enterCapability(FIXTURE_SPAN);
  const factories = servicesArg.resourceLoaderOptions?.extensionFactories ?? [];
  if (factories.length !== 1) {
    throw new Error("expected exactly one threaded extension factory");
  }
  const toolCallHandler = await captureToolCallHandler(factories[0]);
  return { instance, round, gate: { state, createdHandle, toolCallHandler } };
}

/** Deliver synthetic events to EVERY live listener on the target handle
 * (platform fan-out mirror; a disposed handle delivers to nobody, and a
 * double subscription would count every event twice). */
function emitTo(handle: FakeSession, ...events: object[]) {
  for (const event of events) {
    const payload = asEvent(event);
    for (const listener of handle.live) listener(payload);
  }
}

/** Drive synthetic events through the round's handle (all-live delivery). */
function emit(round: Round, ...events: object[]) {
  emitTo(round.session, ...events);
}

/** Simulated swap mirroring switchSession's measured order (agent-session-
 * runtime.js L128–L143): DISPOSE the outgoing handle FIRST, then apply the
 * FRESH zero-listener incoming handle; replays NOTHING (reopened
 * transcripts re-fire no events). */
function simulateSwap(round: Round, incoming: FakeSession): void {
  round.runtime.session.dispose();
  round.runtime.session = incoming;
}

/** Replica of the module's refusal message — the \u2014 escape replicated
 * identically (never a literal em dash in string literals). */
const REFUSAL_REPLICA =
  "pio-session: rebind refused \u2014 handle 'sess-other-9999' is not this frame's session ('sess-fake-0001')";

/** Replica of the module-private customType namespace (SOLE OWNER: the
 * PIO_CAPABILITY_CUSTOM_TYPE constant in ./pio-session.ts). */
const CAPABILITY_CUSTOM_TYPE_REPLICA = "pio-capability";

describe("renderCapabilityMarker (pure)", () => {
  it("renders the EXACT pinned capability-line bytes with no trailing newline", () => {
    // Codepoints: U+2014 U+2014 SPACE `capability:` SPACE label SPACE
    // U+2014 U+2014 — the layout mirrors renderPhaseMarker with the
    // reserved `capability:` prefix INSIDE the dash flank.
    const rendered = renderCapabilityMarker("demo");
    expect(rendered).toBe("\u2014\u2014 capability: demo \u2014\u2014");
    expect(rendered.charCodeAt(0)).toBe(0x2014);
    expect(rendered.charCodeAt(1)).toBe(0x2014);
    expect(rendered.charCodeAt(2)).toBe(0x20);
    expect(rendered.charAt(14)).toBe(" ");
    expect(rendered.charAt(19)).toBe(" ");
    expect(rendered.charCodeAt(21)).toBe(0x2014);
    expect(rendered.length).toBe(22);
    expect(rendered.endsWith("\n")).toBe(false);
  });
});

describe("PioSession — markCapability (no-turn custom-message seam)", () => {
  it("issues EXACTLY ONE sendCustomMessage with the pinned argument shape and NO options object (SDK default = no turn)", async () => {
    const { instance, round } = await host();
    await instance.markCapability("res");
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(round.session.sendCustomMessage).toHaveBeenCalledWith({
      customType: CAPABILITY_CUSTOM_TYPE_REPLICA,
      content: renderCapabilityMarker("res"),
      display: true,
      details: undefined,
    });
    // NO options object: the call carries EXACTLY one argument — the
    // triggerTurn switch stays at its SDK default (append, never a turn).
    expect(round.session.sendCustomMessage.mock.calls[0]).toHaveLength(1);
  });

  it("triggers NO LLM turn from the mark alone and leaves the observation state snapshot-equal across it (custom messages are observation-neutral)", async () => {
    const { instance, round } = await host();
    const before = instance.counters();
    const payloadsBefore = instance.getRunMessages();
    await instance.markCapability("neutral");
    // Zero prompt invocations: the mark never starts a run on this plane.
    expect(round.session.prompt).toHaveBeenCalledTimes(0);
    // Counters unchanged by reference-content — a fresh snapshot reads
    // byte-equal to the pre-mark one (no assistant usage fed in).
    const after = instance.counters();
    expect(after).toStrictEqual(before);
    // The payload master list gains nothing (feeds come only from
    // agent_end; the custom message fires none here).
    expect(instance.getRunMessages()).toEqual(payloadsBefore);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
  });
});

// --- Event fixtures (shapes mirror the installed dist) --------------------

function start(toolCallId: string, toolName: string, args?: unknown) {
  return { type: "tool_execution_start", toolCallId, toolName, args };
}

function update(toolCallId: string, toolName: string, args?: unknown) {
  return {
    type: "tool_execution_update",
    toolCallId,
    toolName,
    args,
    partialResult: { stream: "partial" },
  };
}

// The end event carries NO args field — the path must correlate from the
// matching start event through the toolCallId.
function end(toolCallId: string, toolName: string, isError: boolean) {
  return {
    type: "tool_execution_end",
    toolCallId,
    toolName,
    result: null,
    isError,
  };
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

function turnEnd(message: object) {
  return { type: "turn_end", message, toolResults: [] };
}

function messageEnd(message: object) {
  return { type: "message_end", message };
}

function usage(
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
  extra: object = {},
) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...extra,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function assistantMessage(usageFields: object) {
  return {
    role: "assistant",
    content: [{ type: "text", text: "done" }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: usageFields,
    stopReason: "stop",
    timestamp: 1,
  };
}

describe("PioSession — construction & scoping", () => {
  it("subscribes exactly once, staying exactly once across API use", async () => {
    const { instance, round } = await host();
    expect(round.session.subscribe).toHaveBeenCalledTimes(1);

    instance.counters();
    instance.getFilesWrittenDelta();
    const store = instance.vars;
    // W2C mechanical preambles (mandatory-type ruling): declare before
    // the first write; row intent unchanged.
    store.declare("a", "number");
    store.set("a", 1);
    store.get("a");
    store.list();
    instance.counters();
    instance.getFilesWrittenDelta();

    expect(round.session.subscribe).toHaveBeenCalledTimes(1);
  });

  it("distinct instances hold distinct sessions and listeners with no shared observation state", async () => {
    const a = await PioSession.create(CWD);
    const ra = lastRound();
    const b = await PioSession.create(CWD);
    const rb = lastRound();

    expect(ra.session).not.toBe(rb.session);
    expect(ra.runtime).not.toBe(rb.runtime);
    expect(ra.session.subscribe).toHaveBeenCalledTimes(1);
    expect(rb.session.subscribe).toHaveBeenCalledTimes(1);
    expect(ra.captured[0]).not.toBe(rb.captured[0]);

    // A successful write committed through instance A's listener...
    emit(
      ra,
      start("w1", "write", { path: "/only/a.txt" }),
      end("w1", "write", false),
    );

    expect(a.counters().filesWritten).toBe(1);
    // ...leaves instance B's counters and partition untouched.
    expect(b.counters()).toEqual({
      filesWritten: 0,
      askUserCalls: 0,
      toolUses: {},
      tokens: 0,
    });
    expect(b.getFilesWrittenDelta()).toEqual([]);
  });

  it("id mirrors the settled session handle id", async () => {
    const { instance } = await host();
    expect(instance.id).toBe(harness.sessionId);
  });

  it("runtime IS the construction result by reference identity", async () => {
    const { instance } = await host();
    expect(instance.runtime).toBe(lastRound().runtime);
  });

  it("with a sessions root: transcripts routed into the top slot", async () => {
    await PioSession.create(CWD, SESSIONS_ROOT);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(
      CWD,
      path.join(SESSIONS_ROOT, "top"),
    );
  });

  it("without a sessions root: single-arg SessionManager.create", async () => {
    await PioSession.create(CWD);
    expect(harness.SessionManager.create).toHaveBeenCalledTimes(1);
    expect(harness.SessionManager.create).toHaveBeenLastCalledWith(CWD);
    expect(harness.SessionManager.create.mock.calls[0]).toHaveLength(1);
  });
});

describe("PioSession — zero state", () => {
  it("counters() before any event carries the exact zero shape; take yields empty", async () => {
    const { instance } = await host();
    const snapshot = instance.counters();
    expect(Object.keys(snapshot).sort()).toEqual([
      "askUserCalls",
      "filesWritten",
      "tokens",
      "toolUses",
    ]);
    expect(snapshot.filesWritten).toBe(0);
    expect(snapshot.askUserCalls).toBe(0);
    expect(snapshot.toolUses).toEqual({});
    expect(snapshot.tokens).toBe(0);
    expect(instance.getFilesWrittenDelta()).toEqual([]);
  });
});

describe("PioSession — toolUses counter", () => {
  const toolUseRows: Array<{
    label: string;
    events: object[];
    expected: Record<string, number>;
  }> = [
    {
      label:
        "counts every started execution per name, mixed and repeated; updates and ends contribute nothing",
      events: [
        start("c1", "read", {}),
        start("c2", "bash", { command: "ls" }),
        start("c3", "edit", { path: "/x.md" }),
        start("c4", "read", {}),
        update("c1", "read", {}),
        end("c1", "read", false),
        end("c2", "bash", true),
      ],
      expected: { read: 2, bash: 1, edit: 1 },
    },
    {
      label: "a failed grep keeps its start count",
      events: [start("f1", "grep", {}), end("f1", "grep", true)],
      expected: { grep: 1 },
    },
  ];
  for (const row of toolUseRows) {
    it(row.label, async () => {
      const { instance, round } = await host();
      emit(round, ...row.events);
      expect(instance.counters().toolUses).toEqual(row.expected);
    });
  }

  it("a failed write keeps its start count while filesWritten stays excluded", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("w1", "write", { path: "/failed.md" }),
      end("w1", "write", true),
    );
    expect(instance.counters().toolUses).toEqual({ write: 1 });
    expect(instance.counters().filesWritten).toBe(0);
  });
});

describe("PioSession — filesWritten counter", () => {
  it("successful write and edit ends commit into count and delta; a failed edit contributes nothing", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("w1", "write", { path: "/out/a.md" }),
      end("w1", "write", false),
      start("e1", "edit", { path: "/out/b.md" }),
      end("e1", "edit", true),
    );
    expect(instance.counters().filesWritten).toBe(1);
    expect(instance.getFilesWrittenDelta()).toEqual(["/out/a.md"]);
  });

  it("non-file tools never contribute regardless of success", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("r1", "read", { path: "/in/a.md" }),
      end("r1", "read", false),
      start("b1", "bash", { command: "echo hi" }),
      end("b1", "bash", false),
      start("g1", "grep", {}),
      end("g1", "grep", false),
    );
    expect(instance.counters().filesWritten).toBe(0);
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    expect(instance.counters().toolUses).toEqual({
      read: 1,
      bash: 1,
      grep: 1,
    });
  });

  it("paths correlate from the matching start because the end carries no args", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("p1", "write", { path: "/correlated/deep.md" }),
      end("p1", "write", false),
    );
    const delta = instance.getFilesWrittenDelta();
    expect(delta).toHaveLength(1);
    // Byte-for-byte the start's args.path — the only source of the value.
    expect(delta[0]).toBe("/correlated/deep.md");
    expect(instance.counters().filesWritten).toBe(1);
  });

  const defensiveArgRows: Array<{ label: string; args: unknown }> = [
    { label: "missing path key", args: {} },
    { label: "non-string path", args: { path: 42 } },
    { label: "empty-string path", args: { path: "" } },
    { label: "absent args", args: undefined },
  ];
  for (const row of defensiveArgRows) {
    it(`an ignored write start (${row.label}) neither commits nor registers a pending entry`, async () => {
      const { instance, round } = await host();
      emit(round, start("d1", "write", row.args), end("d1", "write", false));
      expect(instance.counters().filesWritten).toBe(0);
      expect(instance.getFilesWrittenDelta()).toEqual([]);
      // The start itself is still observed...
      expect(instance.counters().toolUses).toEqual({ write: 1 });
    });
  }

  it("interleaved parallel edits: one succeeding end and one failing end commit exactly one path", async () => {
    const { instance, round } = await host();
    emit(
      round,
      start("a1", "edit", { path: "/pa.md" }),
      start("b1", "edit", { path: "/pb.md" }),
      end("b1", "edit", true),
      end("a1", "edit", false),
    );
    expect(instance.counters().filesWritten).toBe(1);
    expect(instance.getFilesWrittenDelta()).toEqual(["/pa.md"]);
  });

  it("a stale write start is drained at agent_start and never leaks into a later run", async () => {
    const { instance, round } = await host();
    emit(round, start("s1", "write", { path: "/stale.md" }));
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    emit(round, agentStart());
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    emit(
      round,
      start("s2", "write", { path: "/fresh.md" }),
      end("s2", "write", false),
    );
    expect(instance.getFilesWrittenDelta()).toEqual(["/fresh.md"]);
    expect(instance.counters().filesWritten).toBe(1);
  });

  it("explicit resets separate per-run windows while the cumulative count grows", async () => {
    const { instance, round } = await host();
    emit(
      round,
      agentStart(),
      start("r1a", "write", { path: "/run1/a.md" }),
      end("r1a", "write", false),
      start("r1b", "edit", { path: "/run1/b.md" }),
      end("r1b", "edit", false),
      agentEnd(),
    );
    // Repeated reads within the window are content-stable.
    expect(instance.getFilesWrittenDelta()).toEqual([
      "/run1/a.md",
      "/run1/b.md",
    ]);
    expect(instance.getFilesWrittenDelta()).toEqual([
      "/run1/a.md",
      "/run1/b.md",
    ]);
    expect(instance.counters().filesWritten).toBe(2);

    // The explicit reset closes the first run's window.
    instance.resetFilesWrittenDelta();

    emit(
      round,
      agentStart(),
      start("r2a", "write", { path: "/run2/c.md" }),
      end("r2a", "write", false),
      agentEnd(),
    );
    expect(instance.getFilesWrittenDelta()).toEqual(["/run2/c.md"]);
    expect(instance.getFilesWrittenDelta()).toEqual(["/run2/c.md"]);
    expect(instance.counters().filesWritten).toBe(3);
  });
});

describe("PioSession — askUserCalls counter", () => {
  it("an ask_user start increments askUserCalls AND appears in toolUses.ask_user", async () => {
    const { instance, round } = await host();
    emit(round, start("u1", "ask_user", {}));
    const counters = instance.counters();
    expect(counters.askUserCalls).toBe(1);
    expect(counters.toolUses.ask_user).toBe(1);
  });

  it("near-names do not increment askUserCalls (but keep their start counts)", async () => {
    const { instance, round } = await host();
    emit(round, start("n1", "ask-user", {}), start("n2", "Ask_User", {}));
    const counters = instance.counters();
    expect(counters.askUserCalls).toBe(0);
    expect(counters.toolUses).toEqual({ "ask-user": 1, Ask_User: 1 });
  });
});

describe("PioSession — tokens counter", () => {
  it("accumulates assistant message_end usages across turns to the pinned sum", async () => {
    const { instance, round } = await host();
    // Hand-computed: 10+20+5+3 = 38 · 100+250+400+50 = 800 · 7+8+9+10 = 34 → 872.
    emit(
      round,
      agentStart(),
      messageEnd(assistantMessage(usage(10, 20, 5, 3))),
      messageEnd(assistantMessage(usage(100, 250, 400, 50))),
      messageEnd(assistantMessage(usage(7, 8, 9, 10))),
      agentEnd(),
    );
    expect(instance.counters().tokens).toBe(872);
  });

  it("user, toolResult (with its own populated usage), and custom message_end events contribute nothing", async () => {
    const { instance, round } = await host();
    emit(
      round,
      messageEnd({ role: "user", content: "hi", timestamp: 1 }),
      messageEnd({
        role: "toolResult",
        toolCallId: "t1",
        toolName: "bash",
        content: [],
        isError: false,
        usage: usage(1000, 2000, 3000, 4000),
        timestamp: 1,
      }),
      messageEnd({
        role: "custom",
        customType: "note",
        content: "n",
        display: true,
        timestamp: 1,
      }),
    );
    expect(instance.counters().tokens).toBe(0);
  });

  it("the same assistant message on turn_end and message_end counts once", async () => {
    const { instance, round } = await host();
    const msg = assistantMessage(usage(5, 6, 7, 8)); // Σ 26
    emit(round, turnEnd(msg), messageEnd(msg));
    expect(instance.counters().tokens).toBe(26);
  });

  it("optional cacheWrite1h and reasoning fields do not perturb the totals", async () => {
    const { instance, round } = await host();
    emit(
      round,
      messageEnd(
        assistantMessage(
          usage(1, 2, 3, 4, { cacheWrite1h: 99, reasoning: 77 }),
        ),
      ),
    );
    expect(instance.counters().tokens).toBe(10);
  });
});

describe("PioSession — vars store", () => {
  it("set/get round-trip; absent name is undefined; list preserves insertion order without duplicates", async () => {
    const { instance } = await host();
    const store = instance.vars;
    // W2C mechanical preambles (mandatory-type ruling): every legacy raw
    // write declares its base kind first; row intent and assertions
    // unchanged.
    store.declare("a", "number");
    store.declare("b", "string");
    store.declare("c", "array");
    store.set("a", 1);
    store.set("b", "two");
    store.set("c", [3, 4]);
    expect(store.get("a")).toBe(1);
    expect(store.get("b")).toBe("two");
    expect(store.get("c")).toEqual([3, 4]);
    expect(store.get("missing")).toBeUndefined();
    expect(store.list()).toEqual(["a", "b", "c"]);
    store.set("a", 99);
    expect(store.get("a")).toBe(99);
    expect(store.list()).toEqual(["a", "b", "c"]);
  });

  it("same-reference semantics: mutation through the retained reference is visible through the instance property", async () => {
    const { instance } = await host();
    const store = instance.vars;
    store.declare("k", "string");
    store.set("k", "x");
    expect(instance.vars.get("k")).toBe("x");
  });

  it("cross-instance invisibility: one instance's entries stay out of another's view", async () => {
    const a = await PioSession.create(CWD);
    const b = await PioSession.create(CWD);
    a.vars.declare("shared", "string");
    a.vars.set("shared", "mine");
    expect(b.vars.get("shared")).toBeUndefined();
    expect(b.vars.list()).toEqual([]);
    expect(a.vars.get("shared")).toBe("mine");
  });
});

// ---------------------------------------------------------------------
// Validated store core (goal session-variable-storage, landing): the
// mandatory-type base-kind registry, the single validated write entry
// point over the D4 admission/conversion table, the overloaded typed
// reads, and the delta-window cursor idiom. Pure-store rows construct
// the EXPORTED class directly (hermetic, zero harness); the cross-
// instance legs extend BOTH the host()/create pair pattern AND the
// fromRuntime H/H2 pattern over the same settled runtime. Golden lines
// below are REPLICAS — sole owners are the module-private renderers in
// ./pio-session.ts; the \u2014 escape is replicated identically (never a
// literal em dash inside a string literal).
// ---------------------------------------------------------------------

const VAR_REJECTION_PREFIX = "Variable rejection: ";

/** Replica of the pinned undeclared-write line (exact bytes). */
const varUndeclaredWriteLine = (name: string): string =>
  `variable '${name}' has no declared base type \u2014 a base type must be declared before writing`;

/** Replica of the pinned coercion-reject line (declared-name write path). */
const varCoercionRejectLine = (
  name: string,
  kind: string,
  typeSpelling: string,
  clause: string,
): string =>
  `variable '${name}' cannot take a value of type '${typeSpelling}' as declared kind '${kind}' \u2014 ${clause}`;

/** Replica of the pinned typed-read ABSENT line. */
const varReadAbsentLine = (name: string, kind: string): string =>
  `read of variable '${name}' as '${kind}' failed \u2014 variable is absent`;

/** Replica of the pinned typed-read CONVERSION-FAULT line (<description>
 * is the stored-value slot: `stored value of type '<typeof>'` with stored-
 * null spelled distinctly per the explicit ruling). */
const varReadConvertLine = (
  name: string,
  kind: string,
  description: string,
): string =>
  `read of variable '${name}' as '${kind}' failed \u2014 ${description} cannot convert to '${kind}'`;

/** Replica of the pure-ASCII bookkeeping conflict line (NO em dashes). */
const varRegistryConflictLine = (
  name: string,
  newKind: string,
  existingKind: string,
): string =>
  `var registry: cannot declare '${name}' as '${newKind}': already declared as '${existingKind}'`;

/** Replica of the pure-ASCII bookkeeping malformed-kind line. */
const varRegistryMalformedLine = (kind: string, name: string): string =>
  `var registry: invalid base kind '${kind}' for variable '${name}'`;

// Pinned CLAUSE vocabulary (one constant per emitted clause — every
// clause the shared conversion core can emit is goldened through these).
const CLAUSE_UNDEFINED = "value is undefined";
const CLAUSE_FUNCTION = "value is a function";
const CLAUSE_SYMBOL = "value is a symbol";
const CLAUSE_BIGINT = "value is a bigint";
const CLAUSE_NAN = "number is not finite (NaN)";
const CLAUSE_PLUS_INFINITY = "number is not finite (+Infinity)";
const CLAUSE_MINUS_INFINITY = "number is not finite (-Infinity)";
const CLAUSE_CLASS_INSTANCE = "value is a class instance";
const CLAUSE_REFERENCE_CYCLE = "value contains a reference cycle";
const CLAUSE_BOOLEAN_TOKEN = "token is not a recognized boolean form";
const CLAUSE_SHAPE_ARRAY = "value is an array";
const CLAUSE_SHAPE_OBJECT = "value is an object";
const clauseGeneric = (kind: string): string =>
  `value does not coerce to '${kind}'`;

// MARKED CAST SEAM (test-side only, house pattern; the ONE non-handle
// assertion in this file alongside asEvent / asHandle / asRuntime):
// a runtime-foreign kind that type erasure admits — drives the
// malformed-kind bookkeeping fault row (source never casts; the union
// erases at runtime so only a foreign caller could supply this).
const foreignVarKind = "bogus" as VarKind;

/** Fault-capture helper for the UNEXPORTED bookkeeping class: asserts
 * Error shape by NAME only (no instanceof — the class is module-local,
 * à la ExecutionStateError; cf. the FAULT_NAME pattern in
 * session-execution-state.test.ts). */
function captureNamedFault(fn: () => void): { name: string; message: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof Error) return { name: err.name, message: err.message };
    throw new Error(`expected an Error fault, got ${String(err)}`);
  }
  throw new Error("expected a fault, none thrown");
}

/** Assert a THROWN family member: identity, EXACTLY one violation line
 * (the pinned bytes), the composed default message, and NO cause key. */
function expectFamilyFault(fn: () => void, line: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  if (!(caught instanceof VariableRejectionError)) {
    throw new Error(`expected a VariableRejectionError, got ${String(caught)}`);
  }
  const err = caught;
  expect(err.name).toBe("VariableRejectionError");
  expect(err.violations).toEqual([line]);
  expect(err.message).toBe(`${VAR_REJECTION_PREFIX}${line}`);
  expect("cause" in err).toBe(false);
}

describe("SessionVariableStore — base-type registry (declare)", () => {
  it("registers a base kind readable through declarations(): fresh object per call, declaration ORDER preserved, independent of stored values", () => {
    const store = new SessionVariableStore();
    store.declare("first", "boolean");
    store.declare("second", "number");
    store.set("second", 42);
    const snapshot = store.declarations();
    expect(Object.keys(snapshot)).toEqual(["first", "second"]);
    expect(snapshot.first).toBe("boolean");
    expect(snapshot.second).toBe("number");
    // A declared-but-never-set name APPEARS (the registry is not the
    // presence record; the entries list stays value-driven).
    expect(store.list()).toEqual(["second"]);
    // Fresh object per call: callers may retain freely (counters() doctrine).
    expect(store.declarations()).not.toBe(snapshot);
    expect(store.declarations()).toEqual(snapshot);
  });

  it("same-name SAME-kind re-declaration is an IDEMPOTENT no-op: no fault, declaration order untouched, writes stay valid", () => {
    const store = new SessionVariableStore();
    store.declare("flag", "boolean");
    store.set("flag", true);
    store.declare("later", "string");
    store.declare("flag", "boolean"); // idempotent re-declaration
    expect(store.declarations()).toEqual({ flag: "boolean", later: "string" });
    expect(store.list()).toEqual(["flag"]);
    expect(() => store.set("flag", "false")).not.toThrow();
    expect(store.get("flag", "boolean")).toBe(false);
  });

  it("same-name DIFFERENT-kind re-declaration faults LOUDLY in the developer-facing ASCII bookkeeping family with the exact pinned bytes, never half-applied", () => {
    const store = new SessionVariableStore();
    store.declare("flag", "boolean");
    store.set("flag", true);
    const fault = captureNamedFault(() => store.declare("flag", "number"));
    expect(fault.name).toBe("VarRegistryError");
    expect(fault.message).toBe(
      varRegistryConflictLine("flag", "number", "boolean"),
    );
    expect(/\u2014/.test(fault.message)).toBe(false); // pure ASCII — no em dashes
    // Registry and entries survive the fault verbatim.
    expect(store.declarations()).toEqual({ flag: "boolean" });
    expect(store.get("flag", "boolean")).toBe(true);
  });

  it("a MALFORMED kind (runtime foreignness past type erasure) faults in the SAME bookkeeping family with the exact pinned bytes; nothing is minted and a legal declaration afterwards still works", () => {
    const store = new SessionVariableStore();
    const fault = captureNamedFault(() => store.declare("n", foreignVarKind));
    expect(fault.name).toBe("VarRegistryError");
    expect(fault.message).toBe(varRegistryMalformedLine("bogus", "n"));
    // The malformed attempt mints NOTHING (explicit authoring-side
    // declare() is the SOLE registry writer — inference is barred).
    expect(store.declarations()).toEqual({});
    store.declare("n", "number");
    expect(store.declarations()).toEqual({ n: "number" });
  });

  it("declare NEVER revalidates or transforms existing stored values (no second adjudication site): an idempotent re-declaration over a populated name leaves the stored REFERENCE untouched", () => {
    const store = new SessionVariableStore();
    store.declare("obj", "object");
    const seed: Record<string, unknown> = { nested: { deep: 1 } };
    store.set("obj", seed);
    const retained = store.get("obj");
    store.declare("obj", "object"); // re-declare over the populated name
    expect(store.get("obj")).toBe(retained); // same reference — untouched
    expect(store.get("obj", "object")).toBe(seed); // typed read resolves verbatim
  });
});

describe("SessionVariableStore — undeclared-write rejection (mandatory-type doctrine)", () => {
  it("a write to a name WITHOUT a registered kind THROWS the family with the pinned undeclared-write line BEFORE any conversion, leaving the store empty and naming no incoming value or kind on purpose", () => {
    const store = new SessionVariableStore();
    expectFamilyFault(
      () => store.set("fresh", "anything"),
      varUndeclaredWriteLine("fresh"),
    );
    expect(store.list()).toEqual([]);
    expect(store.declarations()).toEqual({});
    // Same lane for EVERY incoming shape: the fault is the ABSENCE of a
    // kind, adjudicated before any value inspection.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expectFamilyFault(
      () => store.set("fresh2", cyclic),
      varUndeclaredWriteLine("fresh2"),
    );
    expect(store.list()).toEqual([]);
  });
});

describe("SessionVariableStore — D4 admission/conversion matrix (set, declared names)", () => {
  it("'boolean': ADMITS exactly the four sanctioned forms (true, 'true', false, 'false') and retires every legacy token/quirk row (silent-fallback W2C defect, '1'/'yes'/'0'/'no' tokens, bare 0/1) with the exact pinned clause each", () => {
    const store = new SessionVariableStore();
    store.declare("b", "boolean");
    const admits: readonly { input: unknown; stored: unknown }[] = [
      { input: true, stored: true },
      { input: "true", stored: true },
      { input: false, stored: false },
      { input: "false", stored: false },
    ];
    for (const row of admits) {
      store.set("b", row.input);
      expect(store.get("b")).toBe(row.stored);
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: "1", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "yes", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "0", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "no", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: "maybe", spelling: "string", clause: CLAUSE_BOOLEAN_TOKEN },
      { input: 1, spelling: "number", clause: clauseGeneric("boolean") },
      { input: 0, spelling: "number", clause: clauseGeneric("boolean") },
      { input: null, spelling: "null", clause: clauseGeneric("boolean") },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: [true], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { b: true }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => 1, spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      store.set("b", true); // park a known-good value first
      expectFamilyFault(
        () => store.set("b", row.input),
        varCoercionRejectLine("b", "boolean", row.spelling, row.clause),
      );
      expect(store.get("b")).toBe(true); // rejected write leaves prior value intact
    }
  });

  it("'number': ADMITS finite numbers and the numeric-string corners ('42', ' 42 ', '0x1A', '1e3', '-7') and retires every legacy quirk row (''→0, null→0, true→1, [5]→5, NaN, ±Infinity) with the exact pinned clause each", () => {
    const store = new SessionVariableStore();
    store.declare("n", "number");
    const admits: readonly { input: unknown; stored: number }[] = [
      { input: 42, stored: 42 },
      { input: 0, stored: 0 },
      { input: -0.5, stored: -0.5 },
      { input: "42", stored: 42 },
      { input: " 42 ", stored: 42 },
      { input: "0x1A", stored: 26 },
      { input: "1e3", stored: 1000 },
      { input: "-7", stored: -7 },
    ];
    for (const row of admits) {
      store.set("n", row.input);
      expect(store.get("n")).toBe(row.stored);
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: "", spelling: "string", clause: clauseGeneric("number") },
      { input: "banana", spelling: "string", clause: clauseGeneric("number") },
      { input: null, spelling: "null", clause: clauseGeneric("number") },
      { input: true, spelling: "boolean", clause: clauseGeneric("number") },
      { input: false, spelling: "boolean", clause: clauseGeneric("number") },
      { input: [5], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { n: 1 }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => 1, spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      store.set("n", 0);
      expectFamilyFault(
        () => store.set("n", row.input),
        varCoercionRejectLine("n", "number", row.spelling, row.clause),
      );
      expect(store.get("n")).toBe(0);
    }
  });

  it("'string': ADMITS strings verbatim plus finite-number and boolean String()-form conversions and retires the String() catch-all (arrays, objects, null) with the exact pinned clause each", () => {
    const store = new SessionVariableStore();
    store.declare("s", "string");
    const admits: readonly { input: unknown; stored: string }[] = [
      { input: "hello", stored: "hello" },
      { input: "", stored: "" },
      { input: 42, stored: "42" },
      { input: -0.5, stored: "-0.5" },
      { input: 0, stored: "0" },
      { input: true, stored: "true" },
      { input: false, stored: "false" },
    ];
    for (const row of admits) {
      store.set("s", row.input);
      expect(store.get("s")).toBe(row.stored);
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: ["x"], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { s: 1 }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: null, spelling: "null", clause: clauseGeneric("string") },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => "x", spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      store.set("s", "");
      expectFamilyFault(
        () => store.set("s", row.input),
        varCoercionRejectLine("s", "string", row.spelling, row.clause),
      );
      expect(store.get("s")).toBe("");
    }
  });

  it("'array': ADMITS arrays subject to the stored-by-reference integrity walk (plain prototypes everywhere, acyclic, no class instances at any depth; scalar leaves need no walk) storing the SAME reference, and rejects every non-array shape with the exact pinned clause", () => {
    const store = new SessionVariableStore();
    store.declare("a", "array");
    const admits: readonly { input: unknown[]; label: string }[] = [
      { input: [], label: "empty" },
      { input: [1, "two", true, null], label: "mixed scalar leaves" },
      { input: [[{ a: [] }], {}], label: "nested plain structures" },
      { input: [Object.create(null)], label: "null-prototype element" },
    ];
    for (const row of admits) {
      store.set("a", row.input);
      expect(store.get("a", "array")).toBe(row.input); // SAME reference
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: "a", spelling: "string", clause: clauseGeneric("array") },
      { input: 1, spelling: "number", clause: clauseGeneric("array") },
      { input: { a: [] }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: () => [], spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      store.set("a", []);
      expectFamilyFault(
        () => store.set("a", row.input),
        varCoercionRejectLine("a", "array", row.spelling, row.clause),
      );
      expect(store.get("a")).toEqual([]);
    }
  });

  it("'object': ADMITS plain acyclic objects (recursively) storing the SAME reference and rejects arrays, class instances, cycles, and scalars with the exact pinned clause each", () => {
    const store = new SessionVariableStore();
    store.declare("o", "object");
    const admits: readonly { input: Record<string, unknown>; label: string }[] =
      [
        { input: {}, label: "empty" },
        { input: { a: 1, b: { c: [2] } }, label: "nested plain" },
        {
          input: Object.assign(Object.create(null), { k: 1 }),
          label: "null prototype top-level",
        },
        {
          input: { inner: Object.create(null) },
          label: "null prototype nested",
        },
      ];
    for (const row of admits) {
      store.set("o", row.input);
      expect(store.get("o", "object")).toBe(row.input); // SAME reference
    }
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: [], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      {
        input: { d: new Date() },
        spelling: "object",
        clause: CLAUSE_CLASS_INSTANCE,
      }, // NESTED instance
      { input: "o", spelling: "string", clause: clauseGeneric("object") },
      { input: 1, spelling: "number", clause: clauseGeneric("object") },
      { input: null, spelling: "null", clause: clauseGeneric("object") },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: () => ({}), spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      store.set("o", {});
      expectFamilyFault(
        () => store.set("o", row.input),
        varCoercionRejectLine("o", "object", row.spelling, row.clause),
      );
      expect(store.get("o")).toEqual({});
    }
  });

  it("'null': ADMITS null ONLY (universal null rule) and rejects everything else — including the string 'null' — with the exact pinned clause each", () => {
    const store = new SessionVariableStore();
    store.declare("z", "null");
    store.set("z", null);
    expect(store.get("z", "null")).toBeNull();
    const faults: readonly {
      input: unknown;
      spelling: string;
      clause: string;
    }[] = [
      { input: 0, spelling: "number", clause: clauseGeneric("null") },
      { input: "null", spelling: "string", clause: clauseGeneric("null") },
      { input: "", spelling: "string", clause: clauseGeneric("null") },
      { input: true, spelling: "boolean", clause: clauseGeneric("null") },
      { input: [null], spelling: "object", clause: CLAUSE_SHAPE_ARRAY },
      { input: { z: null }, spelling: "object", clause: CLAUSE_SHAPE_OBJECT },
      { input: undefined, spelling: "undefined", clause: CLAUSE_UNDEFINED },
      { input: Number.NaN, spelling: "number", clause: CLAUSE_NAN },
      {
        input: Number.POSITIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_PLUS_INFINITY,
      },
      {
        input: Number.NEGATIVE_INFINITY,
        spelling: "number",
        clause: CLAUSE_MINUS_INFINITY,
      },
      { input: new Date(), spelling: "object", clause: CLAUSE_CLASS_INSTANCE },
      { input: () => null, spelling: "function", clause: CLAUSE_FUNCTION },
      { input: Symbol("s"), spelling: "symbol", clause: CLAUSE_SYMBOL },
      { input: 10n, spelling: "bigint", clause: CLAUSE_BIGINT },
    ];
    for (const row of faults) {
      expectFamilyFault(
        () => store.set("z", row.input),
        varCoercionRejectLine("z", "null", row.spelling, row.clause),
      );
      expect(store.get("z", "null")).toBeNull(); // prior value intact
    }
  });
});

describe("SessionVariableStore — stored-by-reference integrity walk (deep structure)", () => {
  it("top-level SELF-reference cycles reject under 'object' and 'array' kinds with the cycle clause (never rendered — clause grammar dodges the serialization hazard)", () => {
    const store = new SessionVariableStore();
    store.declare("o", "object");
    store.declare("a", "array");
    const selfObj: Record<string, unknown> = {};
    selfObj.self = selfObj;
    expectFamilyFault(
      () => store.set("o", selfObj),
      varCoercionRejectLine("o", "object", "object", CLAUSE_REFERENCE_CYCLE),
    );
    const selfArr: unknown[] = [];
    selfArr.push(selfArr);
    expectFamilyFault(
      () => store.set("a", selfArr),
      varCoercionRejectLine("a", "array", "object", CLAUSE_REFERENCE_CYCLE),
    );
    // Both stores stay clean: the faulted writes landed nothing.
    expect(store.list()).toEqual([]);
  });

  it("NESTED cycles reject at ANY depth — including via array ELEMENTS — with the cycle clause", () => {
    const store = new SessionVariableStore();
    store.declare("o", "object");
    const inner: unknown[] = [];
    const wrapper: Record<string, unknown> = { inner };
    inner.push(wrapper); // back-edge through an array element
    expectFamilyFault(
      () => store.set("o", wrapper),
      varCoercionRejectLine("o", "object", "object", CLAUSE_REFERENCE_CYCLE),
    );
    const deepArray: unknown[] = [];
    const deepInner: Record<string, unknown> = { b: deepArray };
    const deepHolder: Record<string, unknown> = { a: deepInner };
    deepArray.push(deepHolder); // back-edge two levels down
    expectFamilyFault(
      () => store.set("o", deepHolder),
      varCoercionRejectLine("o", "object", "object", CLAUSE_REFERENCE_CYCLE),
    );
  });

  it("class instances reject at ANY depth (element and property alike) with the instance clause; a CUSTOM-PROTOTYPE container is non-plain even when its own keys look fine", () => {
    const store = new SessionVariableStore();
    store.declare("a", "array");
    store.declare("o", "object");
    expectFamilyFault(
      () => store.set("a", [new Date()]),
      varCoercionRejectLine("a", "array", "object", CLAUSE_CLASS_INSTANCE),
    );
    expectFamilyFault(
      () => store.set("o", { stamp: new Date() }),
      varCoercionRejectLine("o", "object", "object", CLAUSE_CLASS_INSTANCE),
    );
    const exoticProto = { custom: true };
    const exoticElement: unknown = Object.create(exoticProto);
    expectFamilyFault(
      () => store.set("a", [exoticElement]),
      varCoercionRejectLine("a", "array", "object", CLAUSE_CLASS_INSTANCE),
    );
    expect(store.list()).toEqual([]);
  });

  it("SHARED substructures admit (path-based ancestor tracking: sharing is not a cycle) and deep plain nesting round-trips by reference", () => {
    const store = new SessionVariableStore();
    store.declare("o", "object");
    const sharedLeaf: Record<string, unknown> = { x: 1 };
    const dagRoot: Record<string, unknown> = {
      left: sharedLeaf,
      right: sharedLeaf,
    };
    store.set("o", dagRoot);
    expect(store.get("o", "object")).toBe(dagRoot);
    const deep: Record<string, unknown> = { l1: { l2: { l3: [{ l4: 4 }] } } };
    store.set("o", deep);
    expect(store.get("o", "object")).toBe(deep);
  });
});

describe("SessionVariableStore — typed reads (overloaded surface)", () => {
  it("an ABSENT name throws the pinned absent line (never undefined — the safe overload IS the undefined channel) and mutates nothing", () => {
    const store = new SessionVariableStore();
    expectFamilyFault(
      () => store.get("missing", "number"),
      varReadAbsentLine("missing", "number"),
    );
    expect(store.get("missing")).toBeUndefined(); // safe channel silent
    expect(store.list()).toEqual([]);
  });

  it("converting reads resolve the CONCRETE value — the D4 table governs read-conversion too (worked examples): stored '42' as number → 42; stored 42 as string → '42'; stored true as string → 'true'; stored 'true' as boolean → true; stored null as null → null", () => {
    const store = new SessionVariableStore();
    store.declare("s42", "string");
    store.set("s42", "42");
    store.declare("n42", "number");
    store.set("n42", 42);
    store.declare("bt", "boolean");
    store.set("bt", true);
    store.declare("st", "string");
    store.set("st", "true");
    store.declare("nil", "null");
    store.set("nil", null);
    expect(store.get("s42", "number")).toBe(42);
    expect(store.get("n42", "string")).toBe("42");
    expect(store.get("bt", "string")).toBe("true");
    expect(store.get("st", "boolean")).toBe(true);
    expect(store.get("nil", "null")).toBeNull();
  });

  it("array/object typed reads return the SAME stored reference (no copy)", () => {
    const store = new SessionVariableStore();
    const arr: unknown[] = [1];
    const obj: Record<string, unknown> = { a: 1 };
    store.declare("a", "array");
    store.set("a", arr);
    store.declare("o", "object");
    store.set("o", obj);
    expect(store.get("a", "array")).toBe(arr);
    expect(store.get("o", "object")).toBe(obj);
  });

  it("unconvertible stored values THROW the pinned convert line with the STORED TYPE spelling — and present-but-null read as ANY other kind is a conversion FAULT (stored-null spelled distinctly, per the explicit ruling, NOT legacy's null leniency)", () => {
    const store = new SessionVariableStore();
    store.declare("o", "object");
    store.set("o", { a: 1 });
    store.declare("word", "string");
    store.set("word", "banana");
    store.declare("nil", "null");
    store.set("nil", null);
    expectFamilyFault(
      () => store.get("o", "string"),
      varReadConvertLine("o", "string", "stored value of type 'object'"),
    );
    expectFamilyFault(
      () => store.get("word", "number"),
      varReadConvertLine("word", "number", "stored value of type 'string'"),
    );
    expectFamilyFault(
      () => store.get("nil", "number"),
      varReadConvertLine("nil", "number", "stored value is null"),
    );
    // Reads mutate NOTHING: the stored values survive every faulted read.
    expect(store.get("nil", "null")).toBeNull();
    expect(store.get("o", "object")).toEqual({ a: 1 });
    expect(store.get("word", "string")).toBe("banana");
  });

  it("typed reads resolve the CONCRETE kind types at compile time (IDE guarantee — positive assignability rows checked by npm run check)", () => {
    const store = new SessionVariableStore();
    store.declare("n", "number");
    store.set("n", 42);
    store.declare("b", "boolean");
    store.set("b", true);
    store.declare("s", "string");
    store.set("s", "hi");
    store.declare("a", "array");
    store.set("a", [1]);
    store.declare("o", "object");
    store.set("o", { k: 1 });
    store.declare("z", "null");
    store.set("z", null);
    const num: number = store.get("n", "number");
    const bool: boolean = store.get("b", "boolean");
    const str: string = store.get("s", "string");
    const arr: unknown[] = store.get("a", "array");
    const obj: Record<string, unknown> = store.get("o", "object");
    const nul: null = store.get("z", "null");
    expect(num).toBe(42);
    expect(bool).toBe(true);
    expect(str).toBe("hi");
    expect(arr).toEqual([1]);
    expect(obj).toEqual({ k: 1 });
    expect(nul).toBeNull();
  });
});

describe("SessionVariableStore — delta-window primitive (cursor idiom)", () => {
  it("initial baseline EMPTY: pre-mark reads report everything currently stored with final values", () => {
    const store = new SessionVariableStore();
    store.declare("x", "number");
    store.set("x", 1);
    store.declare("y", "string");
    store.set("y", "a");
    expect(store.getVarsDelta()).toEqual({ x: 1, y: "a" });
  });

  it("reports every variable ADDED OR MODIFIED since the mark with FINAL values; untouched names stay out", () => {
    const store = new SessionVariableStore();
    store.declare("p", "number");
    store.set("p", 1);
    store.declare("q", "string");
    store.set("q", "keep");
    store.resetVarsDelta();
    store.declare("r", "number");
    store.set("r", 3); // addition
    store.set("p", 9); // modification (final value reported)
    expect(store.getVarsDelta()).toEqual({ p: 9, r: 3 });
    expect(store.getVarsDelta().q).toBeUndefined();
  });

  it("setting the SAME primitive twice reports NO modification (value equality); overwrites with distinct references report the FINAL value — and a flip back to the EXACT baseline reference is net-unmodified (reference-inequality semantics)", () => {
    const store = new SessionVariableStore();
    store.declare("n", "number");
    store.set("n", 5);
    store.declare("o", "object");
    const v1: Record<string, unknown> = { a: 1 };
    const v2: Record<string, unknown> = { a: 2 };
    const v3: Record<string, unknown> = { a: 3 };
    store.set("o", v1);
    store.resetVarsDelta();
    store.set("n", 5); // identical value — invisible
    store.set("o", v2); // distinct reference — visible (final value v2)
    expect(store.getVarsDelta()).toEqual({ o: v2 });
    store.set("o", v1); // flip back to the BASELINE reference — net unchanged
    expect(store.getVarsDelta()).toEqual({});
    store.set("o", v3); // another distinct reference — visible again
    expect(store.getVarsDelta()).toEqual({ o: v3 });
  });

  it("in-place mutation of a RETAINED object reference is NOT a modification (reference semantics; engine writers route through set)", () => {
    const store = new SessionVariableStore();
    store.declare("o", "object");
    const obj: Record<string, unknown> = { a: 1 };
    store.set("o", obj);
    store.resetVarsDelta();
    obj.a = 2; // mutated in place — invisible to the window
    expect(store.getVarsDelta()).toEqual({});
  });

  it("re-marking ADVANCES past the current state: intermediate churn drops off, post-second-mark modifications remain", () => {
    const store = new SessionVariableStore();
    store.declare("x", "number");
    store.set("x", 1);
    store.resetVarsDelta();
    store.set("x", 2); // churn between the marks
    store.resetVarsDelta(); // advance past the churn
    expect(store.getVarsDelta()).toEqual({});
    store.set("x", 3);
    expect(store.getVarsDelta()).toEqual({ x: 3 });
  });

  it("repeated reads are STABLE (deep-equal) but FRESH objects per call (non-consuming, never aliased)", () => {
    const store = new SessionVariableStore();
    store.declare("x", "number");
    store.set("x", 1);
    store.resetVarsDelta();
    store.set("x", 2);
    const first = store.getVarsDelta();
    const second = store.getVarsDelta();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });
});

describe("SessionVariableStore — cross-instance independence over the new surface", () => {
  it("two created sessions carry DISJOINT registries and stores: same names AND crossing names over declare/set/typed-read/delta", async () => {
    const a = await PioSession.create(CWD);
    const b = await PioSession.create(CWD);
    // SAME name, disjoint worlds: the registry never leaks across hosts.
    a.vars.declare("k", "string");
    a.vars.set("k", "a-val");
    expect(b.vars.get("k")).toBeUndefined();
    expect(b.vars.declarations()).toEqual({});
    expectFamilyFault(
      () => b.vars.get("k", "string"),
      varReadAbsentLine("k", "string"),
    );
    expect(b.vars.getVarsDelta()).toEqual({});
    // Crossing names: each side sees only its own world.
    a.vars.declare("only-a", "number");
    a.vars.set("only-a", 1);
    b.vars.declare("only-b", "number");
    b.vars.set("only-b", 2);
    expect(a.vars.get("only-b")).toBeUndefined();
    expect(b.vars.get("only-a")).toBeUndefined();
    expect(a.vars.get("only-a", "number")).toBe(1);
    expect(b.vars.get("only-b", "number")).toBe(2);
    // Registry isolation: the SAME name may carry a DIFFERENT kind in the
    // other instance (per-instance ownership carries over automatically).
    b.vars.declare("k", "number");
    b.vars.set("k", 7);
    expect(a.vars.get("k", "string")).toBe("a-val");
    expect(b.vars.get("k", "number")).toBe(7);
    // Delta windows never leak across instances.
    a.vars.resetVarsDelta();
    b.vars.resetVarsDelta();
    a.vars.set("k", "again");
    expect(b.vars.getVarsDelta()).toEqual({});
    expect(a.vars.getVarsDelta()).toEqual({ k: "again" });
  });

  it("two fromRuntime hosts over the SAME settled runtime carry disjoint stores and registries over the new surface", async () => {
    const rawRuntime = await harness.createAgentSessionRuntime();
    const round = lastRound();
    const runtime = asRuntime(round.runtime);
    const H = PioSession.fromRuntime(runtime);
    const H2 = PioSession.fromRuntime(runtime);
    H.vars.declare("k", "string");
    H.vars.set("k", "H-val");
    H2.vars.declare("k", "number"); // different KIND, same name — legal
    H2.vars.set("k", 9);
    expect(H.vars.get("k", "string")).toBe("H-val");
    expect(H2.vars.get("k", "number")).toBe(9);
    expect(H.vars.declarations()).toEqual({ k: "string" });
    expect(H2.vars.declarations()).toEqual({ k: "number" });
    H.vars.resetVarsDelta();
    H2.vars.set("k", 10);
    expect(H.vars.getVarsDelta()).toEqual({});
    expect(H2.vars.getVarsDelta()).toEqual({ k: 10 });
    // Both hosts wrap the SAME settled runtime by reference (disjoint
    // stores ride the shared handle — D1 placement row-1 mechanics).
    expect(H.runtime).toBe(rawRuntime);
    expect(H2.runtime).toBe(rawRuntime);
  });
});

describe("SessionVariableStore — W2C round-trips (restated binding: declare-then-write)", () => {
  it("all six kinds round-trip declare-then-write with well-typed values (outcomes identical to legacy's corresponding writes) and list() insertion order is preserved under the new API", () => {
    const store = new SessionVariableStore();
    store.declare("f", "boolean");
    store.set("f", "true"); // textual form converts to the declared kind
    store.declare("num", "number");
    store.set("num", "42"); // numeric string converts
    store.declare("str", "string");
    store.set("str", "hello");
    store.declare("arr", "array");
    store.set("arr", [1, { b: 2 }]); // stored by reference
    store.declare("obj", "object");
    store.set("obj", { c: [3] }); // stored by reference
    store.declare("nil", "null");
    store.set("nil", null);
    expect(store.list()).toEqual(["f", "num", "str", "arr", "obj", "nil"]);
    expect(store.get("f", "boolean")).toBe(true);
    expect(store.get("num", "number")).toBe(42);
    expect(store.get("str", "string")).toBe("hello");
    expect(store.get("arr", "array")).toEqual([1, { b: 2 }]);
    expect(store.get("obj", "object")).toEqual({ c: [3] });
    expect(store.get("nil", "null")).toBeNull();
    // Re-set with native well-typed values: stable outcomes (byte-
    // behavior identical to legacy for these surviving lanes).
    store.set("f", false);
    store.set("num", -7.5);
    expect(store.get("f", "boolean")).toBe(false);
    expect(store.get("num", "number")).toBe(-7.5);
  });
});

describe("SessionVariableStore — containment shape (bare identity)", () => {
  it("a two-line family instance reduces through captureError to the BARE IDENTITY literal {type, message}: NO cause key, NO violations key, joined message bytes pinned", () => {
    const lines = [
      "variable 'a' has no declared base type \u2014 a base type must be declared before writing",
      "variable 'b' cannot take a value of type 'string' as declared kind 'boolean' \u2014 token is not a recognized boolean form",
    ];
    const captured = captureError(new VariableRejectionError(lines));
    expect(captured).toEqual({
      type: "VariableRejectionError",
      message: `${VAR_REJECTION_PREFIX}${lines.join("; ")}`,
    });
    // Exact key set: no adoption hook exists to ride (D3 pin).
    expect(Object.keys(captured).sort()).toEqual(["message", "type"]);
  });
});

describe("PioSession — phase markers", () => {
  it("renders the exact marker bytes with no trailing newline", () => {
    // Codepoints: U+2014 U+2014 SPACE label SPACE U+2014 U+2014.
    const rendered = renderPhaseMarker("write-goal");
    expect(rendered).toBe("\u2014\u2014 write-goal \u2014\u2014");
    expect(rendered.charCodeAt(0)).toBe(0x2014);
    expect(rendered.charCodeAt(1)).toBe(0x2014);
    expect(rendered.charCodeAt(2)).toBe(0x20);
    expect(rendered.charAt(13)).toBe(" ");
    expect(rendered.length).toBe(16);
    expect(rendered.endsWith("\n")).toBe(false);
  });

  it("stamps the marker ahead of the instructions, AHEAD of the disclosure tail", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    await instance.execute_phase("build", { instructions: "Write the thing" });
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 build \u2014\u2014\nWrite the thing\n\n${expectedDisclosure()}`,
    );
  });

  it("sends the bare marker line when instructions are absent", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    await instance.execute_phase("solo");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 solo \u2014\u2014\n\n${expectedDisclosure()}`,
    );
  });

  it("re-stamps the byte-identical marker line at every iteration", async () => {
    const { instance, round } = await host();
    const sent: string[] = [];
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    let calls = 0;
    await instance.execute_phase("again", {
      shouldStopLoop: async () => {
        calls += 1;
        return calls === 2;
      },
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(
      `\u2014\u2014 again \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(sent[1]).toBe(sent[0]);
  });
});

// ---------------------------------------------------------------------
// Phase-permission DISCLOSURE channel: the in-transcript writable-targets
// listing folded AT THE END of the marker-led composition into the SAME
// text payload of every execute_phase run. Identity-over-replicas doctrine -
// the EXPECTED BLOCK BYTES are assembled IN-TEST by the suite-local helper
// below (the fixed constants re-typed locally; the SOLE BYTE OWNER stays
// the module-private static + exported renderer in ./pio-session.ts); all
// prompts ride the SAME mocked SDK seam every other row uses.
// ---------------------------------------------------------------------

/** LOCAL replica of the block's fixed label (SOLE OWNER: the module-private
 * disclosure static in ./pio-session.ts). */
const DISCLOSURE_LABEL_REPLICA = "Phase Permissions";

/** LOCAL replica of the block's header line: the plain pinned label plus
 * the terminal colon (no flanks, no escapes - the committed bare-line
 * form). */
const DISCLOSURE_HEADER_REPLICA = `${DISCLOSURE_LABEL_REPLICA}:`;

/** Assemble an expected disclosure block in-test: the header line plus
 * whichever body lines qualify (owner order: files, project class, scratch
 * class); a window carrying NO body line gains the empty-form None line
 * (mirroring the renderer's own condition); LF-joined, NO trailing period
 * or newline anywhere. */
function expectedDisclosure(
  files?: readonly string[],
  projectCwd?: string,
  scratch?: boolean,
): string {
  const lines: string[] = [DISCLOSURE_HEADER_REPLICA];
  if (files !== undefined && files.length > 0) {
    lines.push(files.join(", "));
  }
  if (projectCwd !== undefined) {
    lines.push(`project files at ${projectCwd}`);
  }
  if (scratch) {
    lines.push("scratch files at /tmp");
  }
  if (lines.length === 1) {
    lines.push("None");
  }
  return lines.join("\n");
}

describe("PioSession — phase-permission disclosure", () => {
  // Row-seeded deliverables live under the LITERAL project slot (the
  // baseline env resolves it deterministically); the settlement gate is row
  // DUTY here (these rows exercise prompt bytes, not the gate), so every row
  // seeds its declared artifacts before driving the phase. The state root is
  // wiped after every row so no residue rides into siblings.
  afterEach(async () => {
    await rm(deriveStateRootFromAgentDir(AGENT_DIR_LITERAL), {
      recursive: true,
      force: true,
    });
  });

  /** Seed the declared artifact(s) so the settlement gate passes on the
   * first break (disk seeding is row duty, mirroring the expectation-gate
   * rows' convention). */
  async function seedArtifacts(...targets: string[]): Promise<void> {
    for (const target of targets) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "seeded for the disclosure window\n");
    }
  }

  it("SILENT window (attached span, zero declarations, no flags): the block is the PLAIN HEADER PLUS THE EMPTY-FORM None LINE and the phase settles with NO fault raised (done:true, iterations:1, the prompt ends with the None line)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("disc-silent");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 disc-silent \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("STATELESS feed: the renderer called with NO ARGUMENT, with EXPLICIT undefined, or with a depth-0 record (sources/phase null over RESOLVED anchors) yields the EMPTY-FORM BLOCK (header plus the capital-N None line) - both short-circuit arms skip the shared core, no fault", () => {
    // The depth-0 record mirrors what snapshot() actually freezes when no
    // span layer is retained: null sources/phase with resolved anchor paths.
    const depthZero: ExecutionSnapshot = {
      sources: null,
      phase: null,
      paths: {
        projectSlotRoot: "/lit/state/projects/key",
        workspaceCwd: "/work",
      },
    };
    expect(renderPhasePermissionDisclosure()).toBe(expectedDisclosure());
    expect(renderPhasePermissionDisclosure(undefined)).toBe(
      expectedDisclosure(),
    );
    expect(renderPhasePermissionDisclosure(depthZero)).toBe(
      expectedDisclosure(),
    );
  });

  it("SINGLE-FILE window: a span declaring a contract pattern that admits the phase's ONE declared artifact renders THAT EXACT PATH as the files line (verbatim, comma-space joiner trivially one entry)", async () => {
    const { instance, round, gate } = await host();
    const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
    gate.state.enterCapability({
      name: "disc-cover",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    const target = path.join(slotRoot, "research", "report.md");
    await seedArtifacts(target);
    scriptRuns(round, quietRun());
    await instance.execute_phase("disc-single", { write: [target] });
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 disc-single \u2014\u2014\n\n${expectedDisclosure([target])}`,
    );
  });

  it("MULTI-FILE window: declaration ORDER with FIRST-OCCURRENCE DEDUPE - duplicate declared entries render ONCE, in first-seen order, joined by the comma-space joiner", async () => {
    const { instance, round, gate } = await host();
    const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
    gate.state.enterCapability({
      name: "disc-cover-work",
      writes: ["work/*.md"],
      allowProjectWrites: false,
    });
    const a = path.join(slotRoot, "work", "a.md");
    const b = path.join(slotRoot, "work", "b.md");
    const c = path.join(slotRoot, "work", "c.md");
    await seedArtifacts(a, b, c);
    scriptRuns(round, quietRun());
    await instance.execute_phase("disc-multi", { write: [a, b, a, c] });
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 disc-multi \u2014\u2014\n\n${expectedDisclosure([a, b, c])}`,
    );
  });

  it("PATTERN-PASSTHROUGH: a declaration CARRYING a wildcard that IS coverage-admitted renders RAW in the files line - the block mirrors the shared core unfiltered (no concreteness filter consumed)", async () => {
    const { instance, round, gate } = await host();
    const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
    gate.state.enterCapability({
      name: "disc-pattern",
      writes: ["research/*.md"],
      allowProjectWrites: false,
    });
    const token = path.join(slotRoot, "research", "r*port.md");
    await seedArtifacts(token);
    scriptRuns(round, quietRun());
    await instance.execute_phase("disc-token", { write: [token] });
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 disc-token \u2014\u2014\n\n${expectedDisclosure([token])}`,
    );
  });

  it("SCOPE-ONLY window: the CLAMPED-active project-files class (dual-flag agreement over the coalesced sources) renders EXACTLY the project-class line naming the absolute workspace cwd", async () => {
    const { instance, round, gate } = await host();
    gate.state.enterCapability({
      name: "disc-scoped",
      writes: [],
      allowProjectWrites: true,
    });
    const cwd = gate.state.snapshot().paths.workspaceCwd;
    scriptRuns(round, quietRun());
    await instance.execute_phase("disc-scope", {
      allowProjectWrites: true,
    });
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 disc-scope \u2014\u2014\n\n${expectedDisclosure(undefined, cwd)}`,
    );
  });

  it("SCRATCH-ONLY window: the phase's OWN single scratch flag (never clamped - single-flag doctrine) renders EXACTLY the scratch-class line with the bare /tmp literal", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    await instance.execute_phase("disc-scratch", { tmpDirAllowed: true });
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 disc-scratch \u2014\u2014\n\n${expectedDisclosure(undefined, undefined, true)}`,
    );
  });

  it("COMBINED window: files PLUS BOTH class lines render FOUR LF-separated lines TOTAL - header, files, project, scratch - in owner order", async () => {
    const { instance, round, gate } = await host();
    const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
    gate.state.enterCapability({
      name: "disc-rich",
      writes: ["notes/*.md"],
      allowProjectWrites: true,
    });
    const note = path.join(slotRoot, "notes", "n.md");
    const cwd = gate.state.snapshot().paths.workspaceCwd;
    await seedArtifacts(note);
    const sent: string[] = [];
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    await instance.execute_phase("disc-combined", {
      write: [note],
      allowProjectWrites: true,
      tmpDirAllowed: true,
    });
    expect(sent).toHaveLength(1);
    const block = sent[0]?.split("\n").slice(-4) ?? [];
    expect(block).toEqual(expectedDisclosure([note], cwd, true).split("\n"));
    expect(sent[0].split("\n", 1)[0] ?? "").toBe(
      "\u2014\u2014 disc-combined \u2014\u2014",
    );
  });

  it("FILES-ABSENT-WITH-CLASSES window: the block is THREE lines - header plus the two class lines (the files line is ABSENT, no placeholder)", async () => {
    const { instance, round, gate } = await host();
    gate.state.enterCapability({
      name: "disc-classes",
      writes: [],
      allowProjectWrites: true,
    });
    const cwd = gate.state.snapshot().paths.workspaceCwd;
    const sent: string[] = [];
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    await instance.execute_phase("disc-classes-only", {
      allowProjectWrites: true,
      tmpDirAllowed: true,
    });
    expect(sent).toHaveLength(1);
    const lines = (sent[0] ?? "").split("\n");
    expect(lines[0]).toBe("\u2014\u2014 disc-classes-only \u2014\u2014");
    expect(lines.slice(-3)).toEqual([
      DISCLOSURE_HEADER_REPLICA,
      `project files at ${cwd}`,
      "scratch files at /tmp",
    ]);
  });

  it("STRUCTURAL pins over EVERY rendered form: LF-split = 1 + present body lines (the two empty forms carry the capital-N None line instead), the header line is byte-exact (plain pinned label plus terminal colon), ZERO trailing-period terminators, no trailing newline (MINIMAL MESSAGE)", () => {
    const fileOnly: ExecutionSnapshot = {
      sources: { name: "", writes: ["*.md"], allowProjectWrites: false },
      phase: {
        id: "struct-f",
        declared: ["/slot/root/a.md"],
        allowProjectWrites: false,
        tmpDirAllowed: false,
      },
      paths: { projectSlotRoot: "/slot/root", workspaceCwd: "/ws" },
    };
    const classesOnly: ExecutionSnapshot = {
      sources: { name: "", writes: [], allowProjectWrites: true },
      phase: {
        id: "struct-c",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: { projectSlotRoot: "/slot/root", workspaceCwd: "/ws" },
    };
    const combined: ExecutionSnapshot = {
      sources: { name: "", writes: ["*.md"], allowProjectWrites: true },
      phase: {
        id: "struct-x",
        declared: ["/slot/root/a.md", "/slot/root/b.md"],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      },
      paths: { projectSlotRoot: "/slot/root", workspaceCwd: "/ws" },
    };
    const forms: Array<[string, number]> = [
      [renderPhasePermissionDisclosure(), 2],
      [
        renderPhasePermissionDisclosure({
          sources: null,
          phase: null,
          paths: { projectSlotRoot: "", workspaceCwd: "" },
        }),
        2,
      ],
      [renderPhasePermissionDisclosure(fileOnly), 2],
      [renderPhasePermissionDisclosure(classesOnly), 3],
      [renderPhasePermissionDisclosure(combined), 4],
    ];
    for (const [form, lineCount] of forms) {
      const lines = form.split("\n");
      // Line-count identity: 1 (header) + present body lines; the empty
      // forms end at exactly 2 (header + None).
      expect(lines).toHaveLength(lineCount);
      // Header line byte-exact: the plain pinned label plus the terminal
      // colon (ASCII spot-checks replicate the no-flank, no-escape truth).
      expect(lines[0]).toBe(DISCLOSURE_HEADER_REPLICA);
      expect(lines[0].codePointAt(0)).toBe(0x50);
      expect(lines[0].codePointAt(lines[0].length - 1)).toBe(0x3a);
      // MINIMAL MESSAGE: zero sentence terminators, no trailing newline.
      for (const line of lines) {
        expect(line.endsWith(".")).toBe(false);
      }
      expect(form.endsWith("\n")).toBe(false);
    }
  });

  it("LATE-BINDING: the injected block reflects the consulted window AFTER THIS CALL's attach completes - swapping the governing span BETWEEN two phase starts flips the disclosed listing onto the NEXT prompt (and the first prompt already carries its own attached dimensions)", async () => {
    const { instance, round, gate } = await host();
    const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
    const lateTarget = path.join(slotRoot, "late", "l.md");
    await seedArtifacts(lateTarget);
    const sent: string[] = [];
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    // Call one: fixture span governs (its empty writes admit nothing) -
    // yet the phase's OWN attached scratch flag shows: the consult runs
    // strictly AFTER the attach completes.
    await instance.execute_phase("disc-late-1", { tmpDirAllowed: true });
    // Swap the consulted window BETWEEN the two calls (after phase one has
    // settled AND detached): the next phase start governs under the
    // entering covering span.
    gate.state.enterCapability({
      name: "disc-later",
      writes: ["late/*.md"],
      allowProjectWrites: false,
    });
    // Call two: the covering span admits the declared artifact - the
    // difference rides the next prompt.
    await instance.execute_phase("disc-late-2", { write: [lateTarget] });
    expect(sent[0]).toBe(
      `\u2014\u2014 disc-late-1 \u2014\u2014\n\n${expectedDisclosure(undefined, undefined, true)}`,
    );
    expect(sent[1]).toBe(
      `\u2014\u2014 disc-late-2 \u2014\u2014\n\n${expectedDisclosure([lateTarget])}`,
    );
  });

  it("UNCONDITIONAL ride: an attached GOVERNING-EMPTY window (a dimension declared that the clamped span rules invisible) STILL receives the header-plus-None empty form - silence is not fault", async () => {
    const { instance, round } = await host();
    const sent: string[] = [];
    round.session.prompt.mockImplementationOnce(async (text: string) => {
      sent.push(text);
      emit(round, ...quietRun());
    });
    // Fixture span: allowProjectWrites false - the phase's own true flag is
    // CLAMPED off at decision time (dual-flag disagreement).
    await instance.execute_phase("disc-bare", { allowProjectWrites: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBe(
      `\u2014\u2014 disc-bare \u2014\u2014\n\n${expectedDisclosure()}`,
    );
  });
});

describe("PioSession — execute_phase budgets", () => {
  it("runs exactly once by default and resolves done", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("default-phase");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("floor forces further runs past an early stop", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun(), quietRun());
    let hookCalls = 0;
    const result = await instance.execute_phase("floored", {
      min: 3,
      shouldStopLoop: async () => {
        hookCalls += 1;
        return true;
      },
    });
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(3);
    expect(round.session.prompt).toHaveBeenCalledTimes(3);
    expect(hookCalls).toBe(3);
  });

  it("resolves the bounded result at the ceiling when continuation is still demanded: done:true with iterations === max, one settled run per iteration, the hook observed on every settling run", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let hookCalls = 0;
    const result = await instance.execute_phase("ceiling", {
      max: 2,
      shouldStopLoop: async () => {
        hookCalls += 1;
        return false;
      },
    });
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(2);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(hookCalls).toBe(2);
  });

  it("settles cleanly before the ceiling", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("early", {
      max: 5,
      shouldStopLoop: async () => true,
    });
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("counts the settling run between floor and ceiling", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let calls = 0;
    const result = await instance.execute_phase("between", {
      min: 1,
      max: 4,
      shouldStopLoop: async () => {
        calls += 1;
        return calls > 1;
      },
    });
    expect(result.iterations).toBe(2);
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
  });

  it("a floor exceeding the ceiling resolves BOUNDED (the ceiling ends the loop after one settled run; the floor never overrides the break)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("contradiction", {
      min: 2,
      max: 1,
    });
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejecting hook unwrapped", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const sentinel = new Error("hook-failed");
    await expect(
      instance.execute_phase("bad-hook", {
        shouldStopLoop: async () => {
          throw sentinel;
        },
      }),
    ).rejects.toBe(sentinel);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejecting prompt unwrapped", async () => {
    const { instance, round } = await host();
    const sentinel = new Error("prompt-failed");
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...quietRun());
      throw sentinel;
    });
    await expect(instance.execute_phase("bad-prompt")).rejects.toBe(sentinel);
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
  });
});

describe("PioSession — hook context", () => {
  it("interleaves hook calls strictly between prompt resolutions with parity", async () => {
    const { instance, round } = await host();
    const log: string[] = [];
    let pass = 0;
    round.session.prompt.mockImplementationOnce(async () => {
      pass += 1;
      emit(round, ...quietRun());
      log.push(`p${pass}`);
    });
    round.session.prompt.mockImplementationOnce(async () => {
      pass += 1;
      emit(round, ...quietRun());
      log.push(`p${pass}`);
    });
    let hookCall = 0;
    await instance.execute_phase("interleave", {
      shouldStopLoop: async () => {
        hookCall += 1;
        log.push(`h${hookCall}`);
        return hookCall === 2;
      },
    });
    expect(log).toEqual(["p1", "h1", "p2", "h2"]);
    expect(round.session.prompt).toHaveBeenCalledTimes(hookCall);
  });

  it("shows cumulative counters beside the per-run window take", async () => {
    const { instance, round } = await host();
    // Hand-computed usage sums: run 1 Σ10 (4+3+2+1), run 2 Σ7 (3+2+1+1).
    scriptRuns(
      round,
      [
        agentStart(),
        start("r1a", "write", { path: "/r1/a.md" }),
        end("r1a", "write", false),
        start("r1b", "edit", { path: "/r1/b.md" }),
        end("r1b", "edit", false),
        messageEnd(assistantMessage(usage(4, 3, 2, 1))),
        agentEnd([], false),
      ],
      [
        agentStart(),
        start("r2a", "write", { path: "/r2/c.md" }),
        end("r2a", "write", false),
        messageEnd(assistantMessage(usage(3, 2, 1, 1))),
        agentEnd([], false),
      ],
    );
    const seen: Array<{
      countersFilesWritten: number;
      filesWritten: string[];
      tokens: number;
    }> = [];
    let n = 0;
    await instance.execute_phase("divergence", {
      shouldStopLoop: async (ctx) => {
        n += 1;
        seen.push({
          countersFilesWritten: ctx.counters.filesWritten,
          filesWritten: [...ctx.filesWritten],
          tokens: ctx.counters.tokens,
        });
        return n === 2;
      },
    });
    expect(seen).toEqual([
      {
        countersFilesWritten: 2,
        filesWritten: ["/r1/a.md", "/r1/b.md"],
        tokens: 10,
      },
      {
        countersFilesWritten: 3,
        filesWritten: ["/r2/c.md"],
        tokens: 17,
      },
    ]);
  });

  it("hands the hook the variable store by reference identity", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let n = 0;
    await instance.execute_phase("vars-id", {
      shouldStopLoop: async (ctx) => {
        n += 1;
        expect(ctx.vars).toBe(instance.vars);
        return n === 2;
      },
    });
    expect(n).toBe(2);
  });

  it("materializes a fresh counter snapshot per invocation with exactly the three keys", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    const contexts: IterationCtx[] = [];
    let n = 0;
    await instance.execute_phase("ctx-shape", {
      shouldStopLoop: async (ctx) => {
        n += 1;
        contexts.push(ctx);
        return n === 2;
      },
    });
    expect(contexts[0].counters).not.toBe(contexts[1].counters);
    expect(Object.keys(contexts[0]).sort()).toEqual([
      "counters",
      "filesWritten",
      "vars",
    ]);
    expect(Object.keys(contexts[1]).sort()).toEqual([
      "counters",
      "filesWritten",
      "vars",
    ]);
  });
});

describe("PioSession — run messages", () => {
  it("concatenates settled-end payloads across runs in event order", async () => {
    const { instance, round } = await host();
    const m1 = { id: "m1" };
    const m2 = { id: "m2" };
    const m3 = { id: "m3" };
    scriptRuns(
      round,
      [agentStart(), agentEnd([m1, m2], false)],
      [agentStart(), agentEnd([m3], false)],
    );
    let n = 0;
    const result = await instance.execute_phase("concat", {
      shouldStopLoop: async () => {
        n += 1;
        return n === 2;
      },
    });
    expect(result.messages).toEqual([m1, m2, m3]);
    expect(result.iterations).toBe(2);
  });

  it("counts one retry-bearing span as a single run with both payloads", async () => {
    const { instance, round } = await host();
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart());
      emit(round, agentEnd(["a"], true));
      emit(round, agentEnd(["b"], false));
    });
    const result = await instance.execute_phase("retry-span");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
    expect(result.messages).toEqual(["a", "b"]);
  });

  it("yields an empty message list for an empty run", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("empty-run");
    expect(result.messages).toEqual([]);
  });
});

describe("PioSession — read/reset contract", () => {
  it("keeps the window content-stable across repeated reads within a pass", async () => {
    const { instance, round } = await host();
    scriptRuns(round, [
      agentStart(),
      start("w1", "write", { path: "/r1/a.md" }),
      end("w1", "write", false),
      start("w2", "edit", { path: "/r1/b.md" }),
      end("w2", "edit", false),
      agentEnd([], false),
    ]);
    const reads: string[][] = [];
    await instance.execute_phase("stable-window", {
      shouldStopLoop: async (ctx) => {
        reads.push([...ctx.filesWritten]);
        reads.push([...instance.getFilesWrittenDelta()]);
        reads.push([...instance.getFilesWrittenDelta()]);
        return true;
      },
    });
    expect(reads).toEqual([
      ["/r1/a.md", "/r1/b.md"],
      ["/r1/a.md", "/r1/b.md"],
      ["/r1/a.md", "/r1/b.md"],
    ]);
  });

  it("advances the baseline on reset while the cumulative count survives", async () => {
    const { instance, round } = await host();
    emit(
      round,
      agentStart(),
      start("w1", "write", { path: "/r1/a.md" }),
      end("w1", "write", false),
      start("w2", "edit", { path: "/r1/b.md" }),
      end("w2", "edit", false),
      agentEnd([], false),
    );
    expect(instance.getFilesWrittenDelta()).toEqual(["/r1/a.md", "/r1/b.md"]);
    expect(instance.counters().filesWritten).toBe(2);
    instance.resetFilesWrittenDelta();
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    expect(instance.counters().filesWritten).toBe(2);
  });

  it("accumulates payloads across passes and closes the window at closeout", async () => {
    const { instance, round } = await host();
    const m1 = { id: "m1" };
    const m2 = { id: "m2" };
    const m3 = { id: "m3" };
    scriptRuns(
      round,
      [agentStart(), agentEnd([m1], false)],
      [agentStart(), agentEnd([m2], false)],
      [agentStart(), agentEnd([m3], false)],
    );
    const observed: unknown[][] = [];
    const result = await instance.execute_phase("accumulate", {
      shouldStopLoop: async () => {
        const firstRead = instance.getRunMessages();
        const secondRead = instance.getRunMessages();
        expect(firstRead).toEqual(secondRead);
        observed.push([...firstRead]);
        return observed.length === 3;
      },
    });
    expect(observed).toEqual([[m1], [m1, m2], [m1, m2, m3]]);
    expect(result.messages).toEqual([m1, m2, m3]);
    expect(instance.getRunMessages()).toEqual([]);
  });
});

describe("PioSession — exit isolation", () => {
  it("closes the message window at a bounded exit so the next phase starts clean (the ceiling end RESOLVES; the window-close invariant rides the resolved exit)", async () => {
    const { instance, round } = await host();
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart(), agentEnd(["a1", "a2"], false));
    });
    const bounded = await instance.execute_phase("dead", {
      max: 1,
      shouldStopLoop: async () => false,
    });
    expect(bounded.done).toBe(true);
    expect(bounded.iterations).toBe(1);

    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart(), agentEnd(["b1"], false));
    });
    const second = await instance.execute_phase("next");
    expect(second.messages).toEqual(["b1"]);
  });

  it("closes the delta window at a rejected prompt so the next phase sees an empty window", async () => {
    const { instance, round } = await host();
    const sentinel = new Error("phase-a-died");
    round.session.prompt.mockImplementationOnce(async () => {
      emit(
        round,
        agentStart(),
        start("d1", "write", { path: "/dead/a.md" }),
        end("d1", "write", false),
      );
      throw sentinel;
    });
    await expect(instance.execute_phase("dead-write")).rejects.toBe(sentinel);

    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...quietRun());
    });
    let first: IterationCtx | undefined;
    await instance.execute_phase("after", {
      shouldStopLoop: async (ctx) => {
        first = ctx;
        return true;
      },
    });
    expect(first?.filesWritten).toEqual([]);
    expect(first?.counters.filesWritten).toBe(1);
  });
});

describe("PioSession — phase result shape", () => {
  it("returns exactly the six settled keys with the final snapshot values", async () => {
    const { instance, round } = await host();
    // Hand-computed: usage Σ10 (1+2+3+4), one committed write.
    scriptRuns(round, [
      agentStart(),
      start("s1", "write", { path: "/s/x.md" }),
      end("s1", "write", false),
      messageEnd(assistantMessage(usage(1, 2, 3, 4))),
      agentEnd([], false),
    ]);
    const result: PhaseResult = await instance.execute_phase("structure", {
      shouldStopLoop: async () => true,
    });
    expect(Object.keys(result).sort()).toEqual([
      "counters",
      "done",
      "iterations",
      "messages",
      "tokens",
      "varsDelta",
    ]);
    expect(result.done).toBe(true);
    expect(result.varsDelta).toEqual({});
    expect(result.tokens).toBe(result.counters.tokens);
    expect(result.counters).toEqual({
      filesWritten: 1,
      askUserCalls: 0,
      toolUses: { write: 1 },
      tokens: 10,
    });
    expect(result.counters).toEqual(instance.counters());
  });

  it("exposes no output-validation surface yet", async () => {
    const { instance } = await host();
    expect("validateOutputs" in instance).toBe(false);
  });
});

describe("PioSession — composed-host surface (P-rows)", () => {
  it("fromRuntime constructs synchronously over a settled runtime: immediately usable with one live subscription on the current handle, id and runtime by reference, a fresh vars store, the exact zero counters, zero construction reach, and a distinct observer per host", async () => {
    // Drive the runtime factory DIRECTLY (not via create): one settled
    // runtime whose current handle h0 carries the harness identity.
    const rawRuntime = await harness.createAgentSessionRuntime();
    const round = lastRound();
    const h0 = round.session;
    expect(harness.createAgentSessionRuntime).toHaveBeenCalledTimes(1);
    const runtime = asRuntime(round.runtime);

    // Provenance baseline: the four construction mocks stand at their
    // direct-drive counts; fromRuntime must move none of them.
    const provenanceBefore = {
      managerCreate: harness.SessionManager.create.mock.calls.length,
      services: harness.createAgentSessionServices.mock.calls.length,
      fromServices: harness.createAgentSessionFromServices.mock.calls.length,
      runtimeFactory: harness.createAgentSessionRuntime.mock.calls.length,
    };

    // SYNCHRONOUS — usable before any await.
    const H = PioSession.fromRuntime(runtime);
    const zero = H.counters();
    expect(Object.keys(zero).sort()).toEqual([
      "askUserCalls",
      "filesWritten",
      "tokens",
      "toolUses",
    ]);
    expect(zero.filesWritten).toBe(0);
    expect(zero.askUserCalls).toBe(0);
    expect(zero.toolUses).toEqual({});
    expect(zero.tokens).toBe(0);

    // Exactly one subscription on h0 (live 1, total 1); no other handle
    // exists in this world.
    expect(h0.live).toHaveLength(1);
    expect(h0.subscribe).toHaveBeenCalledTimes(1);

    expect(H.id).toBe("sess-fake-0001");
    expect(H.runtime).toBe(rawRuntime);

    // Fresh vars store: empty, set/get/list round-trips.
    expect(H.vars.list()).toEqual([]);
    H.vars.declare("k", "string");
    H.vars.set("k", "v");
    expect(H.vars.get("k")).toBe("v");
    expect(H.vars.list()).toEqual(["k"]);

    // PROVENANCE: zero standalone-construction reach — all four counts
    // unchanged by the factory call.
    expect(harness.SessionManager.create.mock.calls.length).toBe(
      provenanceBefore.managerCreate,
    );
    expect(harness.createAgentSessionServices.mock.calls.length).toBe(
      provenanceBefore.services,
    );
    expect(harness.createAgentSessionFromServices.mock.calls.length).toBe(
      provenanceBefore.fromServices,
    );
    expect(harness.createAgentSessionRuntime.mock.calls.length).toBe(
      provenanceBefore.runtimeFactory,
    );

    // OBSERVER FRESHNESS: a second host on the SAME runtime gets a
    // DISTINCT observer — two live listeners on h0, each routing to its
    // own.
    const H2 = PioSession.fromRuntime(runtime);
    expect(h0.live).toHaveLength(2);
    expect(h0.subscribe).toHaveBeenCalledTimes(2);
    expect(H2.vars).not.toBe(H.vars);
    expect(H2.vars.get("k")).toBeUndefined();
    // Hand-computed per host: Σ10 (1+2+3+4) + Σ26 (5+6+7+8) = 36 — each
    // event counted once per host (no cross-routing, no self-doubling).
    emitTo(h0, messageEnd(assistantMessage(usage(1, 2, 3, 4))));
    expect(H.counters().tokens).toBe(10);
    expect(H2.counters().tokens).toBe(10);
    emitTo(h0, messageEnd(assistantMessage(usage(5, 6, 7, 8))));
    expect(H.counters().tokens).toBe(36);
    expect(H2.counters().tokens).toBe(36);
  });

  it("rebind continues cumulative counters across a simulated swap: the reopen itself adds nothing, emitting on the fresh handle without a rebind changes nothing, re-arming adds no phantom accumulation, post-events land, and the old handle stays inert", async () => {
    const { instance: H, round: R } = await host();
    const h0 = R.session;
    // Pre-vector — hand-computed: Σ38 (10+20+5+3) tokens, one committed
    // write (its start also counts in toolUses), one bash start.
    emit(
      R,
      agentStart(),
      messageEnd(assistantMessage(usage(10, 20, 5, 3))),
      start("w1", "write", { path: "/pre/a.md" }),
      end("w1", "write", false),
      start("t1", "bash", { command: "ls" }),
    );
    const pre = {
      filesWritten: 1,
      askUserCalls: 0,
      toolUses: { bash: 1, write: 1 },
      tokens: 38,
    };
    expect(H.counters()).toEqual(pre);

    // Swap OUT to a child-like handle, BACK to a FRESH h1@S (file-backed
    // identity retention — new object, zero listeners).
    simulateSwap(R, harness.mintFakeHandle("sess-child-0002"));
    const h1 = harness.mintFakeHandle(harness.sessionId);
    simulateSwap(R, h1);
    expect(R.runtime.session).toBe(h1);
    expect(h0.disposed).toBe(true);

    // After swap-back, BEFORE any rebind: the reopen adds nothing — the
    // fresh handle re-fires nothing; H's old subscription died with h0.
    expect(H.counters()).toEqual(pre);

    // Without a rebind, h1 is invisible to H (zero live listeners) — the
    // re-arm is REQUIRED, not automatic.
    expect(h1.live).toHaveLength(0);
    emitTo(h1, messageEnd(assistantMessage(usage(1, 1, 1, 1))));
    expect(H.counters()).toEqual(pre);

    // Rebind the CURRENT handle: one live listener lands on h1; re-arming
    // adds no phantom accumulation.
    H.rebind(asHandle(R.runtime.session));
    expect(h1.live).toHaveLength(1);
    expect(H.counters()).toEqual(pre);

    // Post-events on h1 land: final = pre + post EXACT — hand-computed
    // 38 + 800 (100+250+400+50) = 838 tokens, 2 committed files.
    emitTo(
      h1,
      messageEnd(assistantMessage(usage(100, 250, 400, 50))),
      start("w2", "write", { path: "/post/b.md" }),
      end("w2", "write", false),
      start("g1", "grep", {}),
    );
    const final = {
      filesWritten: 2,
      askUserCalls: 0,
      toolUses: { bash: 1, write: 2, grep: 1 },
      tokens: 838,
    };
    expect(H.counters()).toEqual(final);

    // Old handle INERT: poking disposed h0 changes nothing.
    emitTo(h0, messageEnd(assistantMessage(usage(9, 9, 9, 9))));
    expect(H.counters()).toEqual(final);
  });

  it("same-handle rebind is a silent no-op: the TOTAL subscription count stays exactly one (repeat included) and the counters are untouched", async () => {
    const { instance: H, round: R } = await host();
    const h0 = R.session;
    emit(
      R,
      start("w1", "write", { path: "/pre/a.md" }),
      end("w1", "write", false),
    );
    const pre = H.counters();
    expect(h0.subscribe).toHaveBeenCalledTimes(1);

    H.rebind(asHandle(h0));
    expect(h0.subscribe).toHaveBeenCalledTimes(1);
    expect(h0.live).toHaveLength(1);

    // Repeat: still exactly one subscription (reference-identity no-op
    // gate — the observable is the stable subscription count).
    H.rebind(asHandle(h0));
    expect(h0.subscribe).toHaveBeenCalledTimes(1);
    expect(h0.live).toHaveLength(1);
    expect(H.counters()).toEqual(pre);
  });

  it("full-swap counter continuity over the rich vector: tokens sum EXACT across the rebind, the committed-path master list stays in EVENT ORDER through the open window, toolUses and askUserCalls merge exactly, replay adds nothing, and the disposed old handle stays inert", async () => {
    // All-live emit makes any double-subscribe fatal to these exact sums
    // (the no-op gate's tripwire).
    const { instance: H, round: R } = await host();
    const h0 = R.session;
    // Pre-vector — hand-computed: Σ838 (38 + 800) tokens, two committed
    // paths in event order, toolUses {write: 2, ask_user: 1}.
    emit(
      R,
      agentStart(),
      messageEnd(assistantMessage(usage(10, 20, 5, 3))),
      start("w1", "write", { path: "/pre/a.md" }),
      end("w1", "write", false),
      messageEnd(assistantMessage(usage(100, 250, 400, 50))),
      start("w2", "write", { path: "/pre/b.md" }),
      end("w2", "write", false),
      start("u1", "ask_user", {}),
    );
    const pre = {
      filesWritten: 2,
      askUserCalls: 1,
      toolUses: { write: 2, ask_user: 1 },
      tokens: 838,
    };
    expect(H.counters()).toEqual(pre);

    // Same choreography as P2: out to a child-like handle, back to FRESH h1@S.
    simulateSwap(R, harness.mintFakeHandle("sess-child-0005"));
    const h1 = harness.mintFakeHandle(harness.sessionId);
    simulateSwap(R, h1);

    // Read IMMEDIATELY after swap-back (before rebind): pre-vector EXACT —
    // "replay adds nothing" over the full vector.
    expect(H.counters()).toEqual(pre);

    H.rebind(asHandle(h1));
    expect(h1.live).toHaveLength(1);

    // Post-vector on h1 — hand-computed: further usage Σ34 (7+8+9+10),
    // one more committed path, one more tool start.
    emitTo(
      h1,
      messageEnd(assistantMessage(usage(7, 8, 9, 10))),
      start("w3", "write", { path: "/post/c.md" }),
      end("w3", "write", false),
      start("b1", "bash", { command: "npm test" }),
    );

    // Final tokens = T_pre + T_post EXACT: 838 + 34 = 872.
    expect(H.counters().tokens).toBe(872);
    // Master list = [pre…, post] in EVENT ORDER via count AND delta
    // content (no resets — the open window survives the rebind).
    expect(H.counters().filesWritten).toBe(3);
    expect(H.getFilesWrittenDelta()).toEqual([
      "/pre/a.md",
      "/pre/b.md",
      "/post/c.md",
    ]);
    // toolUses merged: write 2+1=3, one new bash start, ask_user at 1.
    expect(H.counters().toolUses).toEqual({ write: 3, ask_user: 1, bash: 1 });
    expect(H.counters().askUserCalls).toBe(1);

    // Disposed h0 poked → unchanged (old handle inert).
    emitTo(h0, messageEnd(assistantMessage(usage(50, 50, 50, 50))));
    expect(H.counters()).toEqual({
      filesWritten: 3,
      askUserCalls: 1,
      toolUses: { write: 3, ask_user: 1, bash: 1 },
      tokens: 872,
    });
  });

  it("the composed host is FIRST-CLASS for phases: byte-identical framed prompts on the shared runtime's current handle (including post-swap targeting of the rebound handle) and the identical bounded resolution at the ceiling as a created session", async () => {
    const { instance: H, round: R } = await host();
    const h0 = R.session;

    // One quiet run settles THROUGH H's own live listener.
    scriptRuns(R, quietRun());
    const result = await H.execute_phase("p5", {
      instructions: "Write the thing",
    });
    // Once, with the byte-identical framed text a created session sends
    // (placement-blind framing).
    expect(h0.prompt).toHaveBeenCalledTimes(1);
    expect(h0.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 p5 \u2014\u2014\nWrite the thing\n\n${expectedDisclosure()}`,
    );
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);

    // Ceiling parity: continuation demand at the ceiling RESOLVES the
    // bounded result IDENTICALLY to a created session (same done flag,
    // same iteration count).
    scriptRuns(R, quietRun(), quietRun());
    let hookCalls = 0;
    const boundedParity = await H.execute_phase("p5-budget", {
      max: 2,
      shouldStopLoop: async () => {
        hookCalls += 1;
        return false;
      },
    });
    expect(boundedParity.done).toBe(true);
    expect(boundedParity.iterations).toBe(2);
    expect(hookCalls).toBe(2);
    expect(h0.prompt).toHaveBeenCalledTimes(3);

    // CURRENT-HANDLE TARGETING: after swap + rebind, the next phase lands
    // on h1's prompt mock with the framed bytes; h0's mock is never called
    // for it (prompts ride the runtime's CURRENT handle, read freshly per
    // prompt).
    simulateSwap(R, harness.mintFakeHandle("sess-child-0003"));
    const h1 = harness.mintFakeHandle(harness.sessionId);
    simulateSwap(R, h1);
    H.rebind(asHandle(h1));
    const h0PromptsBefore = h0.prompt.mock.calls.length;
    h1.prompt.mockImplementationOnce(async () => {
      emitTo(h1, ...quietRun());
    });
    const after = await H.execute_phase("p5-after", { instructions: "Again" });
    expect(h1.prompt).toHaveBeenCalledTimes(1);
    expect(h1.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 p5-after \u2014\u2014\nAgain\n\n${expectedDisclosure()}`,
    );
    expect(h0.prompt.mock.calls.length).toBe(h0PromptsBefore);
    expect(after.done).toBe(true);
    expect(after.iterations).toBe(1);
  });

  it("a foreign-handle rebind refuses LOUDLY with the pinned SessionHandleRefusalError bytes, zero side effects, the binding intact afterwards (no-op after refusal, successful swap-back rebind resumes delivery), and the capture-ladder reduction locked", async () => {
    const { instance: H, round: R } = await host();
    const h0 = R.session;
    const before = H.counters();
    const hF = harness.mintFakeHandle("sess-other-9999");

    let thrown: unknown;
    try {
      H.rebind(asHandle(hF));
      throw new Error("expected a refusal");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SessionHandleRefusalError);
    expect(thrown).toBeInstanceOf(Error);
    const fault = thrown as SessionHandleRefusalError;
    expect(fault.name).toBe("SessionHandleRefusalError");
    // Byte-equal to the replica — \u2014 escaped identically on both sides.
    expect(fault.message).toBe(REFUSAL_REPLICA);
    expect((thrown as { cause?: unknown }).cause).toBeUndefined();

    // Zero side effects: hF never subscribed, h0 untouched, counters unmoved.
    expect(hF.subscribe).toHaveBeenCalledTimes(0);
    expect(h0.subscribe).toHaveBeenCalledTimes(1);
    expect(H.counters()).toEqual(before);

    // Binding intact: the follow-up same-handle rebind is STILL a no-op...
    H.rebind(asHandle(h0));
    expect(h0.subscribe).toHaveBeenCalledTimes(1);
    // ...and a legitimate swap-back rebind succeeds and resumes delivery.
    simulateSwap(R, harness.mintFakeHandle("sess-child-0004"));
    const h1 = harness.mintFakeHandle(harness.sessionId);
    simulateSwap(R, h1);
    H.rebind(asHandle(h1));
    expect(h1.subscribe).toHaveBeenCalledTimes(1);
    expect(h1.live).toHaveLength(1);
    emitTo(h1, messageEnd(assistantMessage(usage(1, 2, 3, 4))));
    expect(H.counters().tokens).toBe(10);

    // Capture-ladder pre-flight (real leaf-pure status.ts, no mock): bare
    // identity reduces to EXACTLY { type, message } — no cause, no extras.
    const captured = captureError(
      new SessionHandleRefusalError(REFUSAL_REPLICA),
    );
    expect(captured).toStrictEqual({
      type: "SessionHandleRefusalError",
      message: REFUSAL_REPLICA,
    });
  });
});
// ---------------------------------------------------------------------
// Expectation gate (write:) — engine-owned per-phase file expectations.
// FixtureCapability is TEST-LOCAL (extends the real base, session-present,
// never registered in the production loader table). Real node:fs writes
// against per-row mkdtemp targets are row duty, never harness magic; the
// fixture's empty contract outputs keep the base settle seam
// PI_CODING_AGENT_DIR-immune.
// ---------------------------------------------------------------------

class FixtureCapability extends PioCapability {
  readonly contract: Contract = {
    name: "fixture",
    version: "0.1.0",
    inputs: [],
    outputs: [],
    writes: [],
  };
  /** Observed phase results — the assertion channel for the BINDING legs. */
  readonly phaseResults: PhaseResult[] = [];
  #target: string;

  constructor(params: CapabilityParams & { target: string }) {
    super(params);
    this.#target = params.target;
  }

  async call(
    _inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Declaration-only phase: write, no hook, no max — the gate plus its
    // ceiling are the sole settlement authority.
    this.phaseResults.push(
      await this.execute_phase("guarded", {
        instructions: "Write the thing",
        write: [this.#target],
      }),
    );
    return {};
  }
}

/** Replica of the fixture phase's prompt baseline text: the marker line,
 * then the instructions, then the disclosure empty-form block TRAILING
 * (governing-empty fixture span confers no body lines - the capital-N None
 * line names the empty form) (the existing prompt-text golden discipline). */
const GUARDED_BASELINE = `\u2014\u2014 guarded \u2014\u2014\nWrite the thing\n\n${expectedDisclosure()}`;

/** Pinned corrective-note replica (SOLE OWNER: the module-private template
 * in ./pio-session.ts): the flanked em-dash delimiter line labeled output
 * guard above the body sentence — every currently-missing resolved path,
 * declaration order, plus the settled-run count at the denial point;
 * U+2014 arrives as \u2014 escapes identically on both sides. */
const correctiveNoteReplica = (iterations: number, missing: string[]): string =>
  `\u2014\u2014 output guard \u2014\u2014\nRequired phase output(s) still missing after ${iterations} run(s): ${missing.join(", ")}. Create each listed file with the write or edit tool before you finish this run.`;

/** Pinned ceiling-violation line replica (SOLE OWNER: the module-private
 * template in ./pio-session.ts): raw entry + resolved path; em dash
 * U+2014-escaped identically on both sides; N = 3 pinned ceiling. */
const violationLineReplica = (
  phaseId: string,
  entry: string,
  resolvedPath: string,
): string =>
  `phase '${phaseId}' output '${entry}' missing at ${resolvedPath} \u2014 still absent after 3 expectation re-run(s); the ceiling is exhausted`;

describe("PioSession — expectation gate (write:)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "pio-expectation-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  /** Captured prompt texts in send order (one element per prompt call). */
  const sentTexts = (round: Round): unknown[] =>
    round.session.prompt.mock.calls.map((call: readonly unknown[]) => call[0]);

  it("BINDING leg 1 (auto re-run and normal settle): the scripted first pass does NOT write the declared file, the engine denies settlement and re-runs with the pinned corrective block, the second pass's real fs write lets the gate pass, and the FULL chain (fixture call() -> real base run() -> real emitter) settles ok:true with exit code 0", async () => {
    const target = path.join(tmp, "deliverable.md");
    const { instance, round } = await host();
    // Pass one: quiet only — the gate alone drives the re-run.
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...quietRun());
    });
    // Pass two: a REAL fs write of the target before the run settles.
    round.session.prompt.mockImplementationOnce(async () => {
      await writeFile(target, "settled on pass two\n");
      emit(round, ...quietRun());
    });
    const cap = new FixtureCapability({ session: instance, target });
    const sessionsRoot = path.join(tmp, ".sessions");
    const emitter = createStatusEmitter({
      sessionsRoot,
      capability: { name: cap.contract.name, version: cap.contract.version },
      tokens: () => instance.counters().tokens,
      sessionFile: () => undefined,
    });
    const result = await cap.run({});
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(round.session.prompt.mock.calls[0]?.[0]).toBe(GUARDED_BASELINE);
    expect(round.session.prompt.mock.calls[1]?.[0]).toBe(
      `${GUARDED_BASELINE}\n${correctiveNoteReplica(1, [target])}`,
    );
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    // A retry IS a run: the accounting invariant.
    expect(cap.phaseResults).toHaveLength(1);
    expect(cap.phaseResults[0].done).toBe(true);
    expect(cap.phaseResults[0].iterations).toBe(2);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toEqual({});
    const emission = await emitter.emit(result);
    expect(emission.status.ok).toBe(true);
    expect(emission.exitCode).toBe(0);
    expect(exitCodeFor(emission.status)).toBe(0);
    const record = JSON.parse(
      readFileSync(statusPath(sessionsRoot), "utf8"),
    ) as {
      ok: boolean;
      capability: { name: string; version: string; source: string };
      outputs: Record<string, unknown>;
      errors?: unknown;
    };
    expect(record.ok).toBe(true);
    expect(record.capability).toEqual({
      name: "fixture",
      version: "0.1.0",
      source: "builtin",
    });
    expect(record.outputs).toEqual({});
    expect(record.errors).toBeUndefined();
  });

  it("BINDING leg 2 (never materializes => typed failure at the gate's OWN ceiling): four quiet passes burn the first pass + exactly 3 corrective re-runs, execute_phase REJECTS with the pinned ContractViolationError (engine-level), and through the FULL chain the captured record names the missing file with ok:false and exit code 1 — distinct from, and not disturbing, the budget break-and-settle", async () => {
    // ENGINE-LEVEL: the raw rejection shape over a dedicated host.
    const engineTarget = path.join(tmp, "engine-ghost.md");
    const engine = await host();
    scriptRuns(engine.round, quietRun(), quietRun(), quietRun(), quietRun());
    let thrown: unknown;
    try {
      await engine.instance.execute_phase("guarded", {
        instructions: "Write the thing",
        write: [engineTarget],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as ContractViolationError).violations).toEqual([
      violationLineReplica("guarded", engineTarget, engineTarget),
    ]);

    // FULL CHAIN: the same trajectory through the fixture -> real base
    // run() -> real emitter.
    const chainTarget = path.join(tmp, "chain-ghost.md");
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun(), quietRun(), quietRun());
    const cap = new FixtureCapability({
      session: instance,
      target: chainTarget,
    });
    const sessionsRoot = path.join(tmp, ".sessions");
    const emitter = createStatusEmitter({
      sessionsRoot,
      capability: { name: cap.contract.name, version: cap.contract.version },
      tokens: () => instance.counters().tokens,
      sessionFile: () => undefined,
    });
    const result = await cap.run({});
    // First pass + 3 corrective re-runs — the gate's own ceiling.
    expect(round.session.prompt).toHaveBeenCalledTimes(4);
    const sent = sentTexts(round);
    expect(sent[0]).toBe(GUARDED_BASELINE);
    expect(sent[1]).toBe(
      `${GUARDED_BASELINE}\n${correctiveNoteReplica(1, [chainTarget])}`,
    );
    expect(sent[2]).toBe(
      `${GUARDED_BASELINE}\n${correctiveNoteReplica(2, [chainTarget])}`,
    );
    expect(sent[3]).toBe(
      `${GUARDED_BASELINE}\n${correctiveNoteReplica(3, [chainTarget])}`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    const line = violationLineReplica("guarded", chainTarget, chainTarget);
    expect(result.errors?.[0]).toStrictEqual({
      type: "ContractViolationError",
      cause: "contract",
      message: `Contract violation: ${line}`,
      violations: [line],
    });
    const emission = await emitter.emit(result);
    expect(emission.status.ok).toBe(false);
    expect(emission.exitCode).toBe(1);
    expect(exitCodeFor(emission.status)).toBe(1);
    const record = JSON.parse(
      readFileSync(statusPath(sessionsRoot), "utf8"),
    ) as { ok: boolean; errors?: Array<{ violations?: string[] }> };
    expect(record.ok).toBe(false);
    expect(record.errors?.[0]?.violations).toEqual([line]);
  });
  it("companion: a PRE-EXISTING declared file makes the gate pass on the FIRST break with zero retries — one prompt, all-baseline text, iterations === 1, done: true", async () => {
    const target = path.join(tmp, "preexisting.md");
    await writeFile(target, "seeded before the phase\n");
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("preexisting", {
      write: [target],
    });
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 preexisting \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("corrective-note freshness (property v): two declared paths, the first lands during retry one — the retry-two block lists ONLY the still-missing path (landed path dropped; declaration-order comma-space join preserved on the earlier block) and the ceiling throw carries one line per STILL-MISSING path only", async () => {
    const first = path.join(tmp, "first.md");
    const second = path.join(tmp, "second.md");
    const baseline = `\u2014\u2014 multi \u2014\u2014\n\n${expectedDisclosure()}`;
    const { instance, round } = await host();
    // Pass two writes ONLY the first declared path; the others stay quiet.
    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, ...quietRun());
    });
    round.session.prompt.mockImplementationOnce(async () => {
      await writeFile(first, "lands on retry one\n");
      emit(round, ...quietRun());
    });
    scriptRuns(round, quietRun(), quietRun());
    let thrown: unknown;
    try {
      await instance.execute_phase("multi", { write: [first, second] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractViolationError);
    const sent = sentTexts(round);
    expect(sent[0]).toBe(baseline);
    // Both paths listed in declaration order...
    expect(sent[1]).toBe(
      `${baseline}\n${correctiveNoteReplica(1, [first, second])}`,
    );
    // ...then the landed path drops off (fresh per retry).
    expect(sent[2]).toBe(`${baseline}\n${correctiveNoteReplica(2, [second])}`);
    expect(sent[3]).toBe(`${baseline}\n${correctiveNoteReplica(3, [second])}`);
    expect((thrown as ContractViolationError).violations).toEqual([
      violationLineReplica("multi", second, second),
    ]);
  });

  it("normal budget re-runs with the SAME setup MINUS the declaration stay byte-identical to the baseline at every run (hook-driven continuations carry no corrective note)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun());
    let calls = 0;
    const result = await instance.execute_phase("plain-rerun", {
      shouldStopLoop: async () => {
        calls += 1;
        return calls === 2;
      },
    });
    expect(sentTexts(round)).toEqual([
      `\u2014\u2014 plain-rerun \u2014\u2014\n\n${expectedDisclosure()}`,
      `\u2014\u2014 plain-rerun \u2014\u2014\n\n${expectedDisclosure()}`,
    ]);
    expect(calls).toBe(2);
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(2);
  });

  it("independence and accounting: a declared phase whose hook ALWAYS demands continuation past max: 3 keeps passing the gate beyond the budget — EXACTLY 6 prompts (budget runs 3 + corrective 3) then the typed throw, with iterations counted as 6 settled runs", async () => {
    const target = path.join(tmp, "never-lands.md");
    const baseline = `\u2014\u2014 coexist \u2014\u2014\n\n${expectedDisclosure()}`;
    const { instance, round } = await host();
    scriptRuns(
      round,
      quietRun(),
      quietRun(),
      quietRun(),
      quietRun(),
      quietRun(),
      quietRun(),
    );
    let hookCalls = 0;
    let thrown: unknown;
    try {
      await instance.execute_phase("coexist", {
        max: 3,
        shouldStopLoop: async () => {
          hookCalls += 1;
          return false;
        },
        write: [target],
      });
    } catch (error) {
      thrown = error;
    }
    expect(hookCalls).toBe(6);
    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect(round.session.prompt).toHaveBeenCalledTimes(6);
    const sent = sentTexts(round);
    // Budget runs re-send the baseline: the gate sits strictly at breaks.
    expect(sent.slice(0, 3)).toEqual([baseline, baseline, baseline]);
    expect(sent[3]).toBe(`${baseline}\n${correctiveNoteReplica(3, [target])}`);
    expect(sent[4]).toBe(`${baseline}\n${correctiveNoteReplica(4, [target])}`);
    expect(sent[5]).toBe(`${baseline}\n${correctiveNoteReplica(5, [target])}`);
    expect((thrown as ContractViolationError).violations).toEqual([
      violationLineReplica("coexist", target, target),
    ]);
  });

  it("the CEILING rejection closes both windows: after the typed throw the next phase on the SAME host sees empty deltas and messages (the finally closeout fires on the new reject cause; cumulative counters survive)", async () => {
    const target = path.join(tmp, "window-ghost.md");
    const { instance, round } = await host();
    // Runs commit fake-plane writes + payloads: the windows WOULD leak.
    const deadPass = [
      agentStart(),
      start("d1", "write", { path: "/leaked/a.md" }),
      end("d1", "write", false),
      agentEnd(["d1"], false),
    ];
    scriptRuns(round, deadPass, deadPass, deadPass, deadPass);
    await expect(
      instance.execute_phase("ceiling-die", { write: [target] }),
    ).rejects.toBeInstanceOf(ContractViolationError);
    // The finally closeout fires on the reject cause too.
    expect(instance.getFilesWrittenDelta()).toEqual([]);
    expect(instance.getRunMessages()).toEqual([]);
    expect(instance.counters().filesWritten).toBe(4);

    round.session.prompt.mockImplementationOnce(async () => {
      emit(round, agentStart(), agentEnd(["n1"], false));
    });
    let first: IterationCtx | undefined;
    const next = await instance.execute_phase("after", {
      shouldStopLoop: async (ctx) => {
        first = ctx;
        return true;
      },
    });
    expect(next.messages).toEqual(["n1"]);
    expect(first?.filesWritten).toEqual([]);
    expect(first?.counters.filesWritten).toBe(4);
  });
  it("mechanical semantics (i): a resolvable DIRECTORY declared as an expected path passes mechanically — one prompt, all-baseline text, done: true", async () => {
    // The mkdtemp root itself is an existing directory — declare IT.
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("dir-expects", {
      write: [tmp],
    });
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 dir-expects \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("mechanical semantics (ii): a RELATIVE entry resolves under process.cwd() with NO chdir (the expectation is computed at assertion time via node:path resolve) and the never-write ceiling names the cwd-resolved path in every corrective block AND the violation line", async () => {
    const entry = `pio-expectation-relative-${randomUUID()}.md`;
    const baseline = `\u2014\u2014 relative-write \u2014\u2014\n\n${expectedDisclosure()}`;
    const { instance, round } = await host();
    scriptRuns(round, quietRun(), quietRun(), quietRun(), quietRun());
    let thrown: unknown;
    try {
      await instance.execute_phase("relative-write", { write: [entry] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractViolationError);
    // Same resolution the module performs (location-independent).
    const resolved = path.resolve(process.cwd(), entry);
    const sent = sentTexts(round);
    expect(sent[0]).toBe(baseline);
    expect(sent[1]).toBe(
      `${baseline}\n${correctiveNoteReplica(1, [resolved])}`,
    );
    expect(sent[2]).toBe(
      `${baseline}\n${correctiveNoteReplica(2, [resolved])}`,
    );
    expect(sent[3]).toBe(
      `${baseline}\n${correctiveNoteReplica(3, [resolved])}`,
    );
    expect((thrown as ContractViolationError).violations).toEqual([
      violationLineReplica("relative-write", entry, resolved),
    ]);
  });

  it("accounting (c): the min floor is consumed BEFORE any gate consult — with min: 2 and a never-landing file the first two prompts are BOTH pure baseline (the floor-driven continuation sees no gate) and the first denial carries run count 2 (5 prompts: floor+break runs 2 + corrective 3)", async () => {
    const target = path.join(tmp, "floored-ghost.md");
    const baseline = `\u2014\u2014 floored-write \u2014\u2014\n\n${expectedDisclosure()}`;
    const { instance, round } = await host();
    scriptRuns(
      round,
      quietRun(),
      quietRun(),
      quietRun(),
      quietRun(),
      quietRun(),
    );
    let thrown: unknown;
    try {
      await instance.execute_phase("floored-write", {
        min: 2,
        write: [target],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect(round.session.prompt).toHaveBeenCalledTimes(5);
    expect(sentTexts(round)).toEqual([
      baseline,
      baseline,
      `${baseline}\n${correctiveNoteReplica(2, [target])}`,
      `${baseline}\n${correctiveNoteReplica(3, [target])}`,
      `${baseline}\n${correctiveNoteReplica(4, [target])}`,
    ]);
  });

  it("base case (e): a DECLARED phase settling at its BUDGET break passes the gate and settles normally once its file exists — the delivered break-and-settle is undisturbed under the gate (one prompt, all-baseline, done: true)", async () => {
    const target = path.join(tmp, "budget-file.md");
    await writeFile(target, "present before the budget break\n");
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const result = await instance.execute_phase("budget-gate", {
      max: 1,
      shouldStopLoop: async () => false,
      write: [target],
    });
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt).toHaveBeenCalledWith(
      `\u2014\u2014 budget-gate \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(result.done).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("degenerate declarations: an UNDECLARED phase and an EMPTY write: [] phase each settle with the DISCLOSURE-TRAILING baseline (empty-form header plus None over the governing-empty fixture span) — one prompt each, exact text, done: true (the disclosure-folded goldens are the primary regression proof)", async () => {
    const { instance, round } = await host();
    scriptRuns(round, quietRun());
    const a = await instance.execute_phase("unguarded-baseline");
    expect(round.session.prompt).toHaveBeenCalledTimes(1);
    expect(round.session.prompt.mock.calls[0]?.[0]).toBe(
      `\u2014\u2014 unguarded-baseline \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(a.done).toBe(true);
    expect(a.iterations).toBe(1);

    scriptRuns(round, quietRun());
    const b = await instance.execute_phase("empty-decl", { write: [] });
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(round.session.prompt.mock.calls[1]?.[0]).toBe(
      `\u2014\u2014 empty-decl \u2014\u2014\n\n${expectedDisclosure()}`,
    );
    expect(b.done).toBe(true);
    expect(b.iterations).toBe(1);
  });
});

describe("export surface", () => {
  it("runtime export surface is EXACTLY ['PioSession', 'SessionHandleRefusalError', 'SessionVariableStore', 'renderCapabilityMarker', 'renderPhaseMarker', 'renderPhasePermissionDisclosure'] sorted (types erase under erasable syntax)", async () => {
    expect(Object.keys(await import("./pio-session.ts")).sort()).toEqual(
      [
        "PioSession",
        "SessionHandleRefusalError",
        "SessionVariableStore",
        "renderCapabilityMarker",
        "renderPhaseMarker",
        "renderPhasePermissionDisclosure",
      ].sort(),
    );
  });
});

describe("source guards (composed-host edge discipline over pio-session.ts)", () => {
  const src = readFileSync(
    new URL("./pio-session.ts", import.meta.url),
    "utf8",
  );

  it("zero occurrences of terminal-takeover (frame-world import ban)", () => {
    expect(src.includes("terminal-takeover")).toBe(false);
  });

  it("zero occurrences of isComposed (placement-flag ban)", () => {
    expect(src.includes("isComposed")).toBe(false);
  });

  it("the SDK root sits in EXACTLY ONE clause — the TYPE clause, normalized byte form pinned with AgentSession LEADING — and the VALUE clause set is exactly the pinned ten-specifier gate-wiring set behind it", () => {
    // EXACTLY ONE clause references the SDK root, and it is the TYPE
    // clause.
    expect(src.match(/from "@earendil-works\/pi-coding-agent"/g)?.length).toBe(
      1,
    );
    // Normalized to the pinned single-line form — whitespace and the
    // formatter-mandated trailing comma are neutral (mechanical
    // punctuation).
    const sdkTypeClause = src.match(
      /import type \{[^}]*\} from "@earendil-works\/pi-coding-agent";/,
    )?.[0];
    expect(
      sdkTypeClause?.replace(/\s+/g, " ").replace(", }", " }").trim(),
    ).toBe(
      'import type { AgentSession, AgentSessionEvent, AgentSessionEventListener, AgentSessionRuntime } from "@earendil-works/pi-coding-agent";',
    );
    // The VALUE clause set, in source order (formatter-authoritative:
    // node:* builtins lead, then the package-top-level modules, then the
    // capability-local edge modules)...
    const valueClauses = [
      ...src.matchAll(
        /^\s*import\s+(?!type\b)[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    expect(valueClauses).toEqual([
      "node:fs",
      "node:path",
      "../permission-mechanics.ts",
      "../sandbox/layout.ts",
      "../session.ts",
      "../session-execution-state.ts",
      "../tools/bash/landlock-bash.ts",
      "./base.ts",
      "./errors.ts",
      "./guards/write-gate.ts",
    ]);
    // ...BEHIND the external type clause.
    expect(src.indexOf('from "@earendil-works/pi-coding-agent"')).toBeLessThan(
      src.indexOf('from "../session.ts"'),
    );
  });

  it("fragment occurrences over the disclosure channel: the module-private disclosure static appears EXACTLY TWICE (declaration + the renderer's single destructure read) and the renderer itself is declared EXACTLY ONCE beside its SINGLE invocation — the injection site consults one optional-chained snapshot reading, never more", () => {
    expect(src.match(/PHASE_DISCLOSURE_STATIC/g)?.length).toBe(2);
    expect(src.match(/renderPhasePermissionDisclosure\(/g)?.length).toBe(2);
    expect(src.match(/#executionState\?\.snapshot\(\)/g)?.length).toBe(1);
  });

  it("zero dynamic import( occurrences in the module", () => {
    expect(src.match(/import\(/g)?.length ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------
// Per-session write-gate producer wiring: mint + threading, discovery,
// phase feeding, rebind span survival. Identity-over-goldens doctrine -
// verdict
// assertions deep-equal the REAL predicate over the same state reading;
// no refusal-byte goldens live here (sole owner: ./guards/write-gate.ts).
// Every PI_CODING_AGENT_DIR touch is row-scoped save/restore (vitest
// workers share the process; a leaked deletion poisons sibling rows).
// ---------------------------------------------------------------------

/** Literal absolute agent dir for env-controlled rows AND the file-level
 * phase-driving baseline (never a /tmp/ root - a /tmp/-anchored fixture
 * would ride the scratch-class doctrine and muddle the refusal-shape
 * targets). */
const AGENT_DIR_LITERAL = "/lit/state/.pi/agent";

/** Env-unset message replica (SOLE OWNER: deriveStateRootFromAgentDir in
 * ./base.ts - class CapabilityEnvError); U+2014 arrives as an escape
 * identically on both sides. */
const ENV_UNSET_REPLICA =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";

/** Row-scoped env switch with guaranteed restore. */
async function withAgentDir(
  agentDir: string | undefined,
  body: () => Promise<void>,
): Promise<void> {
  const saved = process.env.PI_CODING_AGENT_DIR;
  try {
    if (agentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = agentDir;
    await body();
  } finally {
    if (saved === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = saved;
  }
}

/** Structural tool-call payload for handler queries (plain literal over the
 * widened fake keeps zero casts in this file). */
function toolCall(toolName: string, input: unknown): FakeToolCallEvent {
  return { type: "tool_call", toolCallId: "tc-1", toolName, input };
}

describe("PioSession \u2014 gate mint + threading (producer side)", () => {
  it("EXACTLY ONE execution-state mint per create threads through the guard install: the driven services arg carries the single resourceLoaderOptions key with ONE bare extension factory, and the created handle's stamp descriptor is a non-enumerable configurable own data property carrying that very state", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { round, gate } = await host();
      const servicesArg = lastServicesArg();
      expect(
        Object.keys(servicesArg.resourceLoaderOptions ?? {}).sort(),
      ).toEqual(["extensionFactories"]);
      const factories =
        servicesArg.resourceLoaderOptions?.extensionFactories ?? [];
      expect(factories).toHaveLength(1);
      expect(typeof factories[0]).toBe("function");

      const d = Object.getOwnPropertyDescriptor(
        gate.createdHandle,
        EXECUTION_STATE_STAMP,
      );
      expect(d).toBeDefined();
      expect(d?.value).toBe(gate.state);
      expect(d?.enumerable).toBe(false);
      expect(d?.configurable).toBe(true);
      expect(gate.state).toBeInstanceOf(SessionExecutionState);
      // The stamp lands on the closure-rerun carrier, distinct from the
      // initial round handle (whose subscription world predates the
      // closure).
      expect(round.session).not.toBe(gate.createdHandle);
    });
  });

  it("two sequential constructions yield DISTINCT states by identity (per-construction isolation at the producer)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const first = await host();
      const second = await host();
      expect(first.gate.state).not.toBe(second.gate.state);
      expect(first.gate.state).toBeInstanceOf(SessionExecutionState);
      expect(second.gate.state).toBeInstanceOf(SessionExecutionState);
    });
  });

  it("channel derivation is BYTE-EQUAL to the settle-seam root formula over the same env and cwd (in-row public channels - never a hardcoded slug), workspaceCwd is resolve(cwd), and after exiting the fixture span the depth-0 reading is the null/null empty-set base", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { gate } = await host();
      // Self-consistent in-row derivation through the imported public
      // channels. The all-slash cwd divergence between slugify and
      // deriveProjectKey stays unreachable here (a launch cwd is mounted
      // real; the settle seam rejects such cwds loud upstream).
      const expectedSlot = path.join(
        deriveStateRootFromAgentDir(AGENT_DIR_LITERAL),
        "projects",
        deriveProjectKey(CWD),
      );
      const snap = gate.state.snapshot();
      expect(snap.paths.projectSlotRoot).toBe(expectedSlot);
      expect(snap.paths.workspaceCwd).toBe(path.resolve(CWD));
      // Fixture span live: sources by reference, phase slot empty.
      expect(snap.sources).toBe(FIXTURE_SPAN);
      expect(snap.phase).toBeNull();
      // Depth-0 base once the fixture span exits.
      gate.state.exitCapability();
      const base = gate.state.snapshot();
      expect(base.sources).toBeNull();
      expect(base.phase).toBeNull();
    });
  });

  it("the registered tool_call handler COMPOSES snapshot() + decideWrite - identity with the REAL predicate over deny and allow shapes, and PER-CALL FRESHNESS across a mutated state between two invocations", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { gate } = await host();
      // Deny shape: strict confirmation - the empty-contract fixture span
      // admits NOTHING (the span site is non-admitting).
      const deniedTarget = "/outside/a.md";
      const deniedInput = { path: deniedTarget };
      expect(
        gate.toolCallHandler(toolCall("write", deniedInput)),
      ).toStrictEqual(decideWrite(gate.state.snapshot(), "write", deniedInput));
      expect(
        gate.toolCallHandler(toolCall("write", deniedInput)),
      ).toBeDefined();
      // Refusal shape over the SAME window: the /tmp/ scratch class NO
      // LONGER admits unconditionally - with no phase attached the target
      // refuses on the non-governing reading, identity over the REAL
      // predicate.
      const tmpInput = { path: "/tmp/scratch.md" };
      expect(gate.toolCallHandler(toolCall("write", tmpInput))).toStrictEqual(
        decideWrite(gate.state.snapshot(), "write", tmpInput),
      );
      expect(gate.toolCallHandler(toolCall("write", tmpInput))).toBeDefined();
      // PER-CALL FRESHNESS leg 1: attaching a tmp-flag phase flips the
      // SAME /tmp/ target from refused to allowed - scratch rides the
      // phase declaration at decision time end-to-end through the real
      // registered handler.
      gate.state.attachPhase("freshness-scratch", [], false, true);
      expect(gate.toolCallHandler(toolCall("write", tmpInput))).toBe(undefined);
      gate.state.detachPhase();

      // PER-CALL FRESHNESS: mutate the state BETWEEN two invocations - a
      // covering span plus a phase declaration flips the SAME target from
      // refused to allowed (a stale one-shot snapshot could not observe
      // this shift).
      const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
      const coveredTarget = path.join(slotRoot, "research", "note.md");
      const coveredInput = { path: coveredTarget };
      expect(
        gate.toolCallHandler(toolCall("write", coveredInput)),
      ).toBeDefined();
      gate.state.enterCapability({
        name: "covering",
        writes: ["research/*.md"],
        allowProjectWrites: false,
      });
      gate.state.attachPhase("freshness", [coveredTarget], false, false);
      expect(gate.toolCallHandler(toolCall("write", coveredInput))).toBe(
        undefined,
      );
      // A non-covered sibling target stays refused - identity again.
      const siblingInput = { path: path.join(slotRoot, "other.md") };
      expect(
        gate.toolCallHandler(toolCall("edit", siblingInput)),
      ).toStrictEqual(decideWrite(gate.state.snapshot(), "edit", siblingInput));
      expect(
        gate.toolCallHandler(toolCall("edit", siblingInput)),
      ).toBeDefined();
      // Balanced unwind of the added layer.
      gate.state.detachPhase();
      gate.state.exitCapability();
    });
  });

  it("eager consult over UNGATED tools: bash resolves undefined (silence = allowed) under a healthy env and THROWS the producer's env fault with the env deleted - even for bash (the fail-safe tail)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { gate } = await host();
      expect(
        gate.toolCallHandler(toolCall("bash", { command: "ls" })),
      ).toBeUndefined();
    });
    await withAgentDir(undefined, async () => {
      const { gate } = await host();
      let thrown: unknown;
      try {
        gate.toolCallHandler(toolCall("bash", { command: "ls" }));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CapabilityEnvError);
      expect((thrown as CapabilityEnvError).message).toBe(ENV_UNSET_REPLICA);
    });
  });

  it("faulty channel: a deleted PI_CODING_AGENT_DIR makes snapshot() throw the producer's CapabilityEnvError VERBATIM (name + message bytes) on every call until healthy", async () => {
    await withAgentDir(undefined, async () => {
      const { gate } = await host();
      let first: unknown;
      try {
        gate.state.snapshot();
      } catch (error) {
        first = error;
      }
      expect(first).toBeInstanceOf(CapabilityEnvError);
      expect((first as CapabilityEnvError).name).toBe("CapabilityEnvError");
      expect((first as CapabilityEnvError).message).toBe(ENV_UNSET_REPLICA);
      // Fault persists VERBATIM on the next call (fresh wrapper, no caching
      // anywhere: name + message bytes identical again).
      let second: unknown;
      try {
        gate.state.snapshot();
      } catch (error) {
        second = error;
      }
      expect(second).toBeInstanceOf(CapabilityEnvError);
      expect((second as CapabilityEnvError).name).toBe("CapabilityEnvError");
      expect((second as CapabilityEnvError).message).toBe(ENV_UNSET_REPLICA);
    });
  });
});

describe("PioSession \u2014 gate discovery (fromRuntime symbol stamp)", () => {
  it("a STAMPED shared handle: two fromRuntime instances over the same runtime discover the SAME row-held state by reference - A's phase run observes its phase attached mid-run on the row-held state, B's subsequent run observes the SAME external state consulted again, both post-phase readings detached", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), "pio-gate-share-"));
      try {
        // Direct-drive idiom (the existing P-row channel): one settled
        // runtime whose current handle h0 the row stamps ITSELF.
        await harness.createAgentSessionRuntime();
        const round = lastRound();
        const h0 = round.session;
        const rowState = new SessionExecutionState({
          projectSlotRoot: () => "/proj/lit-slot",
          workspaceCwd: () => "/work/lit",
        });
        Object.defineProperty(h0, EXECUTION_STATE_STAMP, {
          value: rowState,
          enumerable: false,
          configurable: true,
        });
        const A = PioSession.fromRuntime(asRuntime(round.runtime));
        const B = PioSession.fromRuntime(asRuntime(round.runtime));

        // Span-producer delegation pin folded here: A's enter reaches the
        // row-held state BY REFERENCE (B delegates to the same object).
        A.enterCapability(FIXTURE_SPAN);
        expect(rowState.snapshot().sources).toBe(FIXTURE_SPAN);

        const seededA = path.join(tmp, "a.md");
        await writeFile(seededA, "seeded\n");
        scriptRuns(round, quietRun());
        let sawA: string | null = null;
        const resultA = await A.execute_phase("shared-a", {
          write: [seededA],
          shouldStopLoop: async () => {
            sawA = rowState.snapshot().phase?.id ?? null;
            return true;
          },
        });
        expect(resultA.iterations).toBe(1);
        expect(sawA).toBe("shared-a");
        expect(rowState.snapshot().phase).toBeNull();

        const seededB = path.join(tmp, "b.md");
        await writeFile(seededB, "seeded\n");
        scriptRuns(round, quietRun());
        let sawB: string | null = null;
        const resultB = await B.execute_phase("shared-b", {
          write: [seededB],
          shouldStopLoop: async () => {
            sawB = rowState.snapshot().phase?.id ?? null;
            return true;
          },
        });
        expect(resultB.iterations).toBe(1);
        expect(sawB).toBe("shared-b");
        expect(rowState.snapshot().phase).toBeNull();
        // Balanced unwind through B's delegation.
        B.exitCapability();
        expect(rowState.snapshot().sources).toBeNull();
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  it("a FOREIGN (unstamped) handle: fromRuntime finds NO state - a non-empty write: phase RESOLVES normally (attach silently skipped, no depth-0 fault), rebind over a successful swap is fault-free (it owns no execution state - the swap touches nothing state-side), counters and markCapability unaffected, and BOTH span-producer methods are clean no-ops (no throw, no observable effect)", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "pio-gate-foreign-"));
    try {
      const hf = harness.mintFakeHandle();
      const foreign = PioSession.fromRuntime(asRuntime({ session: hf }));
      expect(foreign.id).toBe(harness.sessionId);

      // Span producers: no throw, no observable effect anywhere.
      foreign.enterCapability(FIXTURE_SPAN);
      foreign.exitCapability();

      // No-turn mark + zero counters behave exactly like an ordinary host.
      await foreign.markCapability("foreign");
      expect(hf.sendCustomMessage).toHaveBeenCalledTimes(1);
      expect(foreign.counters()).toEqual({
        filesWritten: 0,
        askUserCalls: 0,
        toolUses: {},
        tokens: 0,
      });

      // Non-empty declaration settles NORMALLY: no state at all, hence no
      // depth-0 fault - attach silently skipped.
      const seeded = path.join(tmp, "x.md");
      await writeFile(seeded, "seeded\n");
      hf.prompt.mockImplementationOnce(async () => {
        emitTo(hf, ...quietRun());
      });
      const result = await foreign.execute_phase("foreign-phase", {
        write: [seeded],
      });
      expect(result.done).toBe(true);
      expect(result.iterations).toBe(1);

      // Successful-swap rebind: fault-free (this instance owns no
      // execution state - the swap touches nothing state-side),
      // subscription re-armed on the fresh handle.
      const h1 = harness.mintFakeHandle(harness.sessionId);
      foreign.rebind(asHandle(h1));
      expect(h1.live).toHaveLength(1);
      expect(foreign.counters()).toEqual({
        filesWritten: 0,
        askUserCalls: 0,
        toolUses: {},
        tokens: 0,
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("PioSession \u2014 gate phase feeding (attach/detach lifecycle)", () => {
  /** Depth-0 attach fault message replica (SOLE OWNER: attachPhase in
   * ../session-execution-state.ts - the unexported ExecutionStateError
   * bookkeeping class). */
  const attachNoSpanReplica = (phaseId: string): string =>
    `execution state: attachPhase('${phaseId}') called with no capability span active`;

  /** Structural mirror of the mid-run phase reading (hook-observed through
   * the REAL state snapshot - never a fake of the system under test). */
  type PhaseRecord = {
    id: string;
    declared: readonly string[];
    allowProjectWrites: boolean;
    tmpDirAllowed: boolean;
  };
  const recordOf = (phase: PhaseRecord): PhaseRecord => ({
    id: phase.id,
    declared: phase.declared,
    allowProjectWrites: phase.allowProjectWrites,
    tmpDirAllowed: phase.tmpDirAllowed,
  });

  it("ATTACH stores the RAW declared VERBATIM: a double declaration (BOTH files seeded so the expectation gate passes) is stored WHOLE at the mid-run reading - declaration order pinned, the contract-uncovered ghost entry present, proving NO filtering at attach - the phase id pinned, and the post-detach reading STRUCTURALLY IDENTICAL to the pre-attach reading", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), "pio-gate-verbatim-"));
      try {
        const seededTarget = path.join(tmp, "lands.md");
        const uncoveredGhost = path.join(tmp, "ghost.md");
        await writeFile(seededTarget, "seeded\n");
        await writeFile(uncoveredGhost, "ghost seeded - contract-uncovered\n");
        const { instance, round, gate } = await host();
        const preAttach = gate.state.snapshot();
        scriptRuns(round, quietRun());
        let observedPhaseId: string | null = null;
        let observedDeclared: string[] | null = null;
        await instance.execute_phase("verbatim", {
          write: [seededTarget, uncoveredGhost],
          shouldStopLoop: async () => {
            const snap = gate.state.snapshot();
            observedPhaseId = snap.phase?.id ?? null;
            observedDeclared = snap.phase ? [...snap.phase.declared] : null;
            return true;
          },
        });
        expect(observedPhaseId).toBe("verbatim");
        // Deep-equal to the retained resolved array, order-pinned; the
        // ghost survives attach untouched.
        expect(observedDeclared).toStrictEqual([
          path.resolve(seededTarget),
          path.resolve(uncoveredGhost),
        ]);
        // Post-exit: the phase slot is empty and the reading structurally
        // identical to the pre-attach one (same sources / phase-null /
        // paths record shape).
        const postDetach = gate.state.snapshot();
        expect(postDetach.phase).toBeNull();
        expect(postDetach).toEqual(preAttach);
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  it("SYMMETRY leg 1 (NORMAL break): the phase attaches at start and detaches after one quiet settle over a seeded file - attached mid-run, detached post-run", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), "pio-gate-normal-"));
      try {
        const seeded = path.join(tmp, "n.md");
        await writeFile(seeded, "seeded\n");
        const { instance, round, gate } = await host();
        scriptRuns(round, quietRun());
        let saw: string | null = null;
        const result = await instance.execute_phase("normal-leg", {
          write: [seeded],
          shouldStopLoop: async () => {
            saw = gate.state.snapshot().phase?.id ?? null;
            return true;
          },
        });
        expect(result.done).toBe(true);
        expect(result.iterations).toBe(1);
        expect(saw).toBe("normal-leg");
        expect(gate.state.snapshot().phase).toBeNull();
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  it("SYMMETRY leg 2 (BUDGET break): max: 1 with an always-continuing stop rule RESOLVES bounded (a resolve, not a reject), the phase attached mid-run and detached after the bounded resolution", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), "pio-gate-budget-"));
      try {
        const seeded = path.join(tmp, "b.md");
        await writeFile(seeded, "seeded\n");
        const { instance, round, gate } = await host();
        scriptRuns(round, quietRun());
        let saw: string | null = null;
        const result = await instance.execute_phase("budget-leg", {
          max: 1,
          write: [seeded],
          shouldStopLoop: async () => {
            saw = gate.state.snapshot().phase?.id ?? null;
            return false;
          },
        });
        expect(result.done).toBe(true);
        expect(result.iterations).toBe(1);
        expect(saw).toBe("budget-leg");
        expect(gate.state.snapshot().phase).toBeNull();
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  it("SYMMETRY leg 3 (CEILING-FAULT throw): four quiet passes over an unseeded target REJECT with the typed violation, the windows close AND the phase detaches post-reject (the finally fires on the throw cause too)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      const deadPass = [
        agentStart(),
        start("d1", "write", { path: "/leaked/a.md" }),
        end("d1", "write", false),
        agentEnd(["d1"], false),
      ];
      scriptRuns(round, deadPass, deadPass, deadPass, deadPass);
      await expect(
        instance.execute_phase("ceiling-leg", { write: ["/absent/x.md"] }),
      ).rejects.toBeInstanceOf(ContractViolationError);
      // Windows closed (the standing invariant) AND the phase detached.
      expect(instance.getFilesWrittenDelta()).toEqual([]);
      expect(instance.getRunMessages()).toEqual([]);
      expect(gate.state.snapshot().phase).toBeNull();
    });
  });

  it("ABSENT/EMPTY declaration pair: no write and an explicit write: [] each leave snapshot().phase null THROUGH THE WHOLE RUN (hook-observed) - the valid no-op keeps the capability's sources governing unchanged", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      scriptRuns(round, quietRun(), quietRun());
      const seenAbsent: boolean[] = [];
      const seenEmpty: boolean[] = [];
      await instance.execute_phase("no-decl", {
        shouldStopLoop: async () => {
          seenAbsent.push(gate.state.snapshot().phase === null);
          return seenAbsent.length === 1;
        },
      });
      await instance.execute_phase("empty-decl", {
        write: [],
        shouldStopLoop: async () => {
          seenEmpty.push(gate.state.snapshot().phase === null);
          return seenEmpty.length === 1;
        },
      });
      expect(seenAbsent).toEqual([true]);
      expect(seenEmpty).toEqual([true]);
      expect(gate.state.snapshot().phase).toBeNull();
    });
  });

  it("containment-free loudness: a non-empty declaration over a state-PRESENT-but-span-LESS state throws the state's bookkeeping fault UNWRAPPED (name + message bytes) - never swallowed into any settlement path", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      gate.state.exitCapability(); // consume the fixture span -> depth 0
      scriptRuns(round, quietRun());
      let thrown: unknown;
      try {
        await instance.execute_phase("loud", { write: ["/lit/deep/x.md"] });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const fault = thrown as Error;
      expect(fault.name).toBe("ExecutionStateError");
      expect(fault.message).toBe(attachNoSpanReplica("loud"));
    });
  });

  it("FLAG-ONLY ATTACHES: a scope-flag declaration WITHOUT the write bag attaches the two-dimension record (the hook-observed mid-run reading deep-equals the FULL RECORD) and detaches after the normal break - the write bag stays the sole expectation source", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      scriptRuns(round, quietRun());
      const records: PhaseRecord[] = [];
      const result = await instance.execute_phase("flag-only-leg", {
        allowProjectWrites: true,
        shouldStopLoop: async () => {
          const phase = gate.state.snapshot().phase;
          if (phase !== null) records.push(recordOf(phase));
          return true;
        },
      });
      expect(result.done).toBe(true);
      expect(result.iterations).toBe(1);
      expect(records).toHaveLength(1);
      expect(records[0]).toStrictEqual({
        id: "flag-only-leg",
        declared: [],
        allowProjectWrites: true,
        tmpDirAllowed: false,
      });
      // Normal-break detach over the widened attach:
      expect(gate.state.snapshot().phase).toBeNull();
    });
  });

  it("TMP-ONLY ATTACHES: a bare tmpDirAllowed declaration WITHOUT the write bag and WITHOUT the scope flag ATTACHES (the hook-observed mid-run record deep-equals { id, declared: [], allowProjectWrites: false, tmpDirAllowed: true }) and detaches after the normal break - the widened attach condition's third disjunct, end-to-end", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      scriptRuns(round, quietRun());
      const records: PhaseRecord[] = [];
      const result = await instance.execute_phase("tmp-only-leg", {
        tmpDirAllowed: true,
        shouldStopLoop: async () => {
          const phase = gate.state.snapshot().phase;
          if (phase !== null) records.push(recordOf(phase));
          return true;
        },
      });
      expect(result.done).toBe(true);
      expect(result.iterations).toBe(1);
      expect(records).toHaveLength(1);
      expect(records[0]).toStrictEqual({
        id: "tmp-only-leg",
        declared: [],
        allowProjectWrites: false,
        tmpDirAllowed: true,
      });
      expect(gate.state.snapshot().phase).toBeNull();
    });
  });

  it("PATHS+FLAG STORE BOTH DIMENSIONS: a seeded file plus the scope flag feeds the full two-dimension record verbatim (the mid-run reading deep-equals the resolved path AND the stored flag - extending the verbatim-storage semantics to the flag)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), "pio-gate-flag-both-"));
      try {
        const seeded = path.join(tmp, "both.md");
        await writeFile(seeded, "seeded\n");
        const { instance, round, gate } = await host();
        scriptRuns(round, quietRun());
        const records: PhaseRecord[] = [];
        const result = await instance.execute_phase("both-leg", {
          write: [seeded],
          allowProjectWrites: true,
          shouldStopLoop: async () => {
            const phase = gate.state.snapshot().phase;
            if (phase !== null) records.push(recordOf(phase));
            return true;
          },
        });
        expect(result.done).toBe(true);
        expect(result.iterations).toBe(1);
        expect(records).toHaveLength(1);
        expect(records[0]).toStrictEqual({
          id: "both-leg",
          declared: [path.resolve(seeded)],
          allowProjectWrites: true,
          tmpDirAllowed: false,
        });
        expect(gate.state.snapshot().phase).toBeNull();
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    });
  });

  it("FLAG-ONLY BUDGET BREAK SYMMETRY: max: 1 with an always-continuing stop rule RESOLVES bounded over the flag-only attach - attached mid-run, detached after the bounded resolution", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      scriptRuns(round, quietRun());
      const records: PhaseRecord[] = [];
      const result = await instance.execute_phase("flag-budget-leg", {
        max: 1,
        allowProjectWrites: true,
        shouldStopLoop: async () => {
          const phase = gate.state.snapshot().phase;
          if (phase !== null) records.push(recordOf(phase));
          return false;
        },
      });
      expect(result.done).toBe(true);
      expect(result.iterations).toBe(1);
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe("flag-budget-leg");
      expect(records[0].allowProjectWrites).toBe(true);
      expect(records[0].tmpDirAllowed).toBe(false);
      expect(gate.state.snapshot().phase).toBeNull();
    });
  });

  it("CEILING-THROW DETACH OVER A TWO-DIMENSION ATTACH: an unseeded target plus the scope flag REJECTS with the typed violation (unwrapped - containment unchanged) with the windows closed AND the phase detached post-reject (the finally fires on the throw cause for the widened attach)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      const deadPass = [
        agentStart(),
        start("d1", "write", { path: "/leaked/a.md" }),
        end("d1", "write", false),
        agentEnd(["d1"], false),
      ];
      scriptRuns(round, deadPass, deadPass, deadPass, deadPass);
      await expect(
        instance.execute_phase("ceiling-both", {
          write: ["/absent/x.md"],
          allowProjectWrites: true,
        }),
      ).rejects.toBeInstanceOf(ContractViolationError);
      // Windows closed (the standing invariant) AND the phase detached.
      expect(instance.getFilesWrittenDelta()).toEqual([]);
      expect(instance.getRunMessages()).toEqual([]);
      expect(gate.state.snapshot().phase).toBeNull();
    });
  });
});

describe("PioSession \u2014 gate rebind span survival (a successful swap leaves the state intact)", () => {
  it("a SUCCESSFUL swap rebind LEAVES THE STATE INTACT: the pre-existing outer span layer survives the switch-back ON THE SHARED STATE (by reference, phase still attached), a follow-up enter/attach round-trips under it, and the extracted handler's consultations track the surviving layers by identity with the real predicate (span-survival visibility end-to-end)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      // Simulated open window: an EXTRA span plus an attached phase.
      const extraSpan: CapabilitySources = {
        name: "extra",
        writes: [],
        allowProjectWrites: false,
      };
      gate.state.enterCapability(extraSpan);
      gate.state.attachPhase(
        "open-window",
        ["/window/declared.md"],
        false,
        false,
      );
      expect(gate.state.snapshot().phase?.id).toBe("open-window");

      const h1 = harness.mintFakeHandle(harness.sessionId);
      simulateSwap(round, h1);
      instance.rebind(asHandle(h1));

      // NO drain: the open window survives the switch-back INTACT - the
      // innermost span still governs BY REFERENCE and its phase stays
      // attached on the shared state.
      expect(gate.state.snapshot().sources).toBe(extraSpan);
      expect(gate.state.snapshot().phase?.id).toBe("open-window");
      // A follow-up enter/attach round-trips UNDER the surviving layers
      // cleanly (the LIFO stack composes after the swap).
      gate.state.enterCapability(FIXTURE_SPAN);
      gate.state.attachPhase("post-switch", ["/post/x.md"], false, false);
      expect(gate.state.snapshot().phase?.id).toBe("post-switch");
      gate.state.detachPhase();
      gate.state.exitCapability();
      expect(gate.state.snapshot().sources).toBe(extraSpan);

      // The extracted handler consults the SURVIVING shared state: refused
      // by identity under the surviving layers, and a covering span entered
      // AFTER the swap STILL confers no admission - strict confirmation:
      // without a confirming phase the SAME covered target stays refused
      // (late binding rides the live state across the swap).
      const slotRoot = gate.state.snapshot().paths.projectSlotRoot;
      const coveredInput = {
        path: path.join(slotRoot, "research", "note.md"),
      };
      expect(
        gate.toolCallHandler(toolCall("write", coveredInput)),
      ).toStrictEqual(
        decideWrite(gate.state.snapshot(), "write", coveredInput),
      );
      expect(
        gate.toolCallHandler(toolCall("write", coveredInput)),
      ).toBeDefined();
      gate.state.enterCapability({
        name: "covering",
        writes: ["research/*.md"],
        allowProjectWrites: false,
      });
      // The pattern-covered target REFUSES even under the covering span:
      // the span site admits nothing (no phase confirms the target).
      expect(
        gate.toolCallHandler(toolCall("write", coveredInput)),
      ).toStrictEqual(
        decideWrite(gate.state.snapshot(), "write", coveredInput),
      );
      expect(
        gate.toolCallHandler(toolCall("write", coveredInput)),
      ).toBeDefined();
      // Balanced unwind of every added layer: the fixture span keeps
      // governing once the window and the covering span pop.
      gate.state.exitCapability();
      gate.state.detachPhase();
      gate.state.exitCapability();
      expect(gate.state.snapshot().sources).toBe(FIXTURE_SPAN);
    });
  });

  it("GATE ORDER: a same-handle rebind does NOT drain (the fixture span survives the no-op) and a refused foreign-id rebind THROWS first and leaves the state INTACT (the span survives the refusal)", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { instance, round, gate } = await host();
      expect(gate.state.snapshot().sources).toBe(FIXTURE_SPAN);
      // No-op same-handle rebind: no drain.
      instance.rebind(asHandle(round.session));
      expect(gate.state.snapshot().sources).toBe(FIXTURE_SPAN);
      // Foreign-id refusal: throws, state intact.
      const hF = harness.mintFakeHandle("sess-other-9999");
      let thrown: unknown;
      try {
        instance.rebind(asHandle(hF));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(SessionHandleRefusalError);
      expect(gate.state.snapshot().sources).toBe(FIXTURE_SPAN);
    });
  });
});

describe("mechanical discipline over the gate-wiring bytes", () => {
  const GATE_SUITE_SOURCE = readFileSync(
    new URL("./pio-session.test.ts", import.meta.url),
    "utf8",
  );
  const GUARDS_SUITE_SOURCE = readFileSync(
    new URL("../capabilities/guards-demo.test.ts", import.meta.url),
    "utf8",
  );
  // The module under test itself (the source-guard describe above keeps its
  // own scoped copy).
  const MODULE_SOURCE = readFileSync(
    new URL("./pio-session.ts", import.meta.url),
    "utf8",
  );

  /** Compact comment/literal-aware scan (house precedent: prose comments
   * are elided and exempt; literal payloads are recorded, not elided).
   * Soundness rests on the pinned no-slash-survives rule below - this
   * module ships zero regex literals, so no expression-start heuristic is
   * needed. */
  function partitionForScan(source: string): {
    residue: string;
    payloads: string[];
  } {
    const payloads: string[] = [];
    let residue = "";
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];
      if (ch === "/" && next === "/") {
        const end = source.indexOf("\n", i);
        i = end === -1 ? source.length : end;
        continue;
      }
      if (ch === "/" && next === "*") {
        const end = source.indexOf("*/", i + 2);
        i = end === -1 ? source.length : end + 2;
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
    return { residue, payloads };
  }

  const CAST_TOKEN = ["a", "s"].join("");
  const RAW_GLYPH = String.fromCharCode(0x2014);

  it("scoped purity residue: ZERO `as` casts and ZERO explicit `any` over the comment/literal-stripped residue of pio-session.ts (whole-file superset of the touched regions) - and NO slash survives the elision (the soundness pin keeping this scan valid)", () => {
    const { residue } = partitionForScan(MODULE_SOURCE);
    expect(residue.match(new RegExp(`\\b${CAST_TOKEN}\\b`, "g"))).toBeNull();
    expect(residue.match(/\bany\b/g)).toBeNull();
    expect(residue.includes("/")).toBe(false);
  });

  it("glyph discipline: NO raw U+2014 in any literal payload or in the comment-free code residue of pio-session.ts - and NO slash survives the elision (the zero-regex-literals pin that keeps this scan sound)", () => {
    const { residue, payloads } = partitionForScan(MODULE_SOURCE);
    for (const payload of payloads) {
      expect(payload.includes(RAW_GLYPH)).toBe(false);
    }
    expect(residue.includes(RAW_GLYPH)).toBe(false);
    expect(residue.includes("/")).toBe(false);
  });

  it("dev-process-marker scan over the FINAL three touched files: zero step-attribution / planning-meta tokens (needles assembled from fragments so the scan cannot match itself)", () => {
    const markers: string[] = [
      "\\bstep\\s+\\d",
      "\\bS" + "0\\d\\b",
      "\\bD#\\d",
      "\\u00a7",
      "(?:TASK|PLAN)" + "\\.md",
      `\\b${["ske", "leton"].join("")}\\b`,
      "\\b20\\d{2}-\\d{2}-\\d{2}\\b",
    ];
    for (const source of [
      MODULE_SOURCE,
      GATE_SUITE_SOURCE,
      GUARDS_SUITE_SOURCE,
    ]) {
      for (const pattern of markers) {
        expect(
          source.match(new RegExp(pattern, "gi")),
          `marker slipped through: ${pattern}`,
        ).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------
// Landlock-bash customTools threading: the unconditional single-entry
// registration over the construction seam. The grown SDK mock carries the
// FOUR construction/per-spawn value reaches of ../tools/bash/landlock-bash.ts
// (recording factory + identity wrap + two inert per-spawn seams); the rows
// below drive the REAL PioSession.create and observe the threaded entry
// cast-free off the recorded from-services arg. NO row drives the real ops
// exec (island doctrine): routed-execution and late-binding claims decompose
// into measured seam-level mechanics plus cited physics, never real spawns.
// Rows that consult snapshot() ride the standing row-scoped env switch
// (withAgentDir); every other row stays env-free (construction is
// storage-only and the mocks absorb session building).
// ---------------------------------------------------------------------

/** Measured constant: the installed 0.85.1 dist default active tool roster
 * (core/agent-session.js ~L2210 - the _refreshToolRegistry branch taken when
 * no base-tools override exists). Byte-stable golden (house lockstep idiom):
 * a future pin bump surfaces here as a deliberate update, not silent drift. */
const DEFAULT_ACTIVE_TOOL_NAMES = ["read", "bash", "edit", "write"];

describe("PioSession \u2014 Landlock-bash customTools threading", () => {
  it("unconditional single-entry identity (both construction forms): the from-services arg carries EXACTLY ONE customTools entry naming bash, the factory ledger shows ONE instantiation at the launched cwd, the entry's ops bag is REFERENCE-IDENTICAL to the ledger bag, and the guard wiring stays undisturbed", async () => {
    for (const sessionsRoot of [undefined, SESSIONS_ROOT]) {
      harness.reset();
      await PioSession.create(CWD, sessionsRoot);
      const { servicesArg } = await driveStoredClosure();
      const tools = lastFromServicesArg().customTools;
      expect(tools).toBeDefined();
      expect(tools?.length).toBe(1);
      if (!tools) throw new Error("expected the threaded entry set");
      const entry = tools[0];
      expect(entry.name).toBe("bash");
      // Single-source chain: the factory ledger holds EXACTLY ONE
      // instantiation at the launched cwd, and the entry's bag IS the
      // ledger's bag (no copy or wrap anywhere on the seam: session.ts
      // spreads the array verbatim and the identity defineTool preserves
      // the bag reference).
      const calls = harness.state.bashFactoryCalls;
      expect(calls).toHaveLength(1);
      const call = calls[0];
      if (!call) throw new Error("expected a factory-ledger entry");
      expect(call.cwd).toBe(CWD);
      expect(entry.operations).toBe(call.operations);
      // Guard wiring undisturbed: the single threaded extension factory.
      const factories =
        servicesArg.resourceLoaderOptions?.extensionFactories ?? [];
      expect(factories).toHaveLength(1);
    }
  });

  it("registry-replacement harmlessness: under the measured default active-tool roster, the SINGLE bash entry shadows EXACTLY ONE base definition and STAYS ACTIVE (override-by-name physics: the custom set lands over the builtin map)", async () => {
    await PioSession.create(CWD);
    await driveStoredClosure();
    const tools = lastFromServicesArg().customTools;
    if (tools?.length !== 1) {
      throw new Error("expected the single threaded bash entry");
    }
    const entry = tools[0];
    // The roster line binds the MEASURED constant; it does not re-prove the
    // registry internals - the physics rides the dist's override-by-name
    // path (custom definitions set over the builtin map AFTER it), so one
    // bash entry replaces the base entry and stays in the active roster.
    expect(DEFAULT_ACTIVE_TOOL_NAMES).toContain(entry.name);
    expect(entry.name).toBe("bash");
    expect(tools.length).toBe(1);
  });

  it("routed execution: awaiting the threaded entry's execute settles through EXACTLY ONE receipt whose bound bag is REFERENCE-IDENTICAL to the entry's ops bag AND the factory-ledger bag (the wiring chain is single-source at every hop), resolving the neutral settlement", async () => {
    await PioSession.create(CWD);
    await driveStoredClosure();
    const tools = lastFromServicesArg().customTools;
    if (tools?.length !== 1) {
      throw new Error("expected the single threaded bash entry");
    }
    const entry = tools[0];
    // RIDES (measured elsewhere, cited): the real factory's execute routes
    // a scripted execution to the PROVIDED ops bag per the dist fallback
    // contract (options?.operations ?? createLocalBashOperations(...) -
    // core/tools/bash.js), and the landed bash-instance kickoff live probe
    // observed the single-entry roster plus routed execution reaching the
    // custom ops. MEASURED HERE: the seam-level reference chain - registry
    // entry, threaded definition, and ops bag stay ONE object at every hop.
    const scripted = { command: "echo routed" };
    const settlement = await entry.execute(scripted);
    const receipts = harness.state.bashExecReceipts;
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];
    if (!receipt) throw new Error("expected a receipt record");
    expect(receipt.args).toBe(scripted);
    expect(receipt.bag).toBe(entry.operations);
    const call = harness.state.bashFactoryCalls[0];
    if (!call) throw new Error("expected a factory-ledger entry");
    expect(receipt.bag).toBe(call.operations);
    expect(settlement).toStrictEqual({ content: [], details: { exitCode: 0 } });
  });

  it("late-binding consult: the SAME threaded instance persists across handle re-creation while span/phase churn flips the consulted snapshot over the shared state (three-part mechanic)", async () => {
    // (i) Instance persistence across handle recreation: two stored-closure
    // re-runs (the /new-flow mirror) yield fresh stamp-carrier handles whose
    // re-spread customTools arrays are THE SAME array carrying the SAME
    // single entry - the ops bag survives by reference at every hop, the
    // factory ledger stays at ONE instantiation (the probe-once latch rides
    // this identity; no re-mint across handle swaps), and both handles
    // carry the SAME stamped execution state object.
    await PioSession.create(CWD);
    const firstDrive = await driveStoredClosure();
    const toolsFirst = lastFromServicesArg().customTools;
    if (toolsFirst?.length !== 1) {
      throw new Error("expected the single threaded bash entry");
    }
    const secondDrive = await driveStoredClosure();
    const toolsSecond = lastFromServicesArg().customTools;
    if (toolsSecond?.length !== 1) {
      throw new Error("expected the single threaded bash entry");
    }
    expect(toolsSecond).toBe(toolsFirst);
    expect(toolsSecond[0].operations).toBe(toolsFirst[0].operations);
    expect(harness.state.bashFactoryCalls).toHaveLength(1);
    const stateA = assertMintedState(stampValue(firstDrive.createdHandle));
    const stateB = assertMintedState(stampValue(secondDrive.createdHandle));
    expect(stateB).toBe(stateA);
    // (ii) Flip over the shared state: window A is the depth-0 world
    // (sources null, phase null); entering the fixture span plus attaching
    // the phase record flips window B's projection onto EXACTLY those
    // dimensions while the paths stay resolvable and equal (the channels
    // resolve FRESH per reading - stability across the flip is what makes
    // the attribution hold).
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const windowA = stateA.snapshot();
      expect(windowA.sources).toBeNull();
      expect(windowA.phase).toBeNull();
      stateA.enterCapability(FIXTURE_SPAN);
      const literalTarget = "/lit/guard/target.md";
      stateA.attachPhase("landlock-late-binding", [literalTarget], true, true);
      const windowB = stateA.snapshot();
      expect(windowB.sources).toEqual(FIXTURE_SPAN);
      expect(windowB.phase).toStrictEqual({
        id: "landlock-late-binding",
        declared: [literalTarget],
        allowProjectWrites: true,
        tmpDirAllowed: true,
      });
      expect(windowB.paths).toEqual(windowA.paths);
      // (iii) Single-expression linkage (design-type glue, flagged): the
      // mutated state IS the stamp-discovered state (identity above); the
      // fence-creation call site and the guard-install site bind the SAME
      // executionState local inside create - line-level glue, NOT
      // mechanically observable without driving the real exec, which the
      // island doctrine bars. Attribution isolation closes the argument:
      // the SAME bag persisted across both windows, so any consult
      // difference is attributable to the SHARED STATE alone - the fence
      // tracks the frame.
    });
  });

  it("guard-handler-list invariant: the services arg carries EXACTLY ONE extension factory, the captured tool_call handler PASSES a bash-named event (verdict undefined - the write gate self-filters by tool name; no second member intercepts commands) AND blocks a write event over a denied input with a verdict deep-equal to the REAL predicate over the same state reading", async () => {
    await withAgentDir(AGENT_DIR_LITERAL, async () => {
      const { gate } = await host();
      const factories =
        lastServicesArg().resourceLoaderOptions?.extensionFactories ?? [];
      expect(factories).toHaveLength(1);
      // Bash-named event: PASS - silence means allowed, and nothing besides
      // the single write-gate member sits in the consulted list.
      expect(gate.toolCallHandler(toolCall("bash", { command: "ls" }))).toBe(
        undefined,
      );
      // Denied write: refusal with identity over the REAL predicate (the
      // empty-contract fixture span admits NOTHING - the span site is
      // non-admitting).
      const deniedInput = { path: "/outside/a.md" };
      expect(
        gate.toolCallHandler(toolCall("write", deniedInput)),
      ).toStrictEqual(decideWrite(gate.state.snapshot(), "write", deniedInput));
      expect(
        gate.toolCallHandler(toolCall("write", deniedInput)),
      ).toBeDefined();
    });
  });
});
