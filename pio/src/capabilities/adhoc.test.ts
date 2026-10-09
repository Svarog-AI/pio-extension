// Hermetic adhoc suite. The sitting never terminates on its own, so every
// driven row ends with ONE scripted rejecting pass (the row-end valve) that
// escapes to the base catch-all - a harness device, not a product claim.
// One fused world serves both sides: real PioSession.create over a
// physics-shaped fake runtime lets the same rows drive body logic and the
// real terminal-takeover hop (non-hopping rows pin zero switchSession
// calls). Replicated product bytes name their SOLE OWNER export in
// ./adhoc.ts or the named co-shipping module; identity-over-goldens.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { CapabilityParams } from "../capability/base.ts";
import {
  CapabilityEnvError,
  deriveStateRootFromAgentDir,
  settleFileModeOutputs,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import {
  type CapabilityTable,
  capabilityRefusalLine,
  resolveCapability,
} from "../capability/loader.ts";
import {
  PioSession,
  renderCapabilityMarker,
  renderPhaseMarker,
} from "../capability/pio-session.ts";
import {
  activeFrames,
  installFrameEnvironment,
  teardownFrameEnvironment,
} from "../capability/terminal-takeover.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";
import AdhocCapability, {
  ADHOC_BURST_MAX_RUNS,
  ADHOC_NAME,
  DISPATCH_REQUEST_VAR,
  NO_DISPATCH_VALUE,
} from "./adhoc.ts";

type Listener = (event: AgentSessionEvent) => void;

type StubMode = "success" | "success-absolute" | "bare-error" | "abort";

const stubKit = vi.hoisted(() => {
  const STUB_TOKEN = "research/9f8e7d6c5b4a.md";
  const BARE_ERROR_MESSAGE = `web tools unavailable: missing tool definitions for web_search, web_fetch (provisioning: isolated agent dir 'pi-native-search' local-source registration)`;
  const RESEARCH_DESCRIPTION =
    "Researches whatever topic you give it: searches the web and writes the findings into a readable markdown report saved in the project workspace.";
  const DEFAULT_CONTRACT: Contract = {
    name: "research",
    version: "0.1.0",
    inputs: [{ name: "topic" }],
    outputs: [{ name: "report", paramKey: "report" }],
    writes: ["research/*.md"],
    allowProjectWrites: true,
  };
  const INTERRUPT_CONTRACT: Contract = {
    name: "research",
    version: "0.1.0",
    inputs: [{ name: "topic" }],
    outputs: [
      { name: "report", file: "research/part.md" },
      { name: "archive", file: "research/archive.d" },
    ],
    writes: ["research/**"],
    allowProjectWrites: true,
  };
  const state: {
    bag: unknown;
    inputs: Record<string, unknown> | undefined;
    mode: StubMode;
    park: (() => Promise<void>) | undefined;
    enteredNotify: (() => void) | undefined;
    contract: Contract;
    absoluteToken: string | undefined;
  } = {
    bag: undefined,
    inputs: undefined,
    mode: "success",
    park: undefined,
    enteredNotify: undefined,
    contract: DEFAULT_CONTRACT,
    absoluteToken: undefined,
  };
  const reset = (): void => {
    state.bag = undefined;
    state.inputs = undefined;
    state.mode = "success";
    state.park = undefined;
    state.enteredNotify = undefined;
    state.contract = DEFAULT_CONTRACT;
    state.absoluteToken = undefined;
  };
  return {
    STUB_TOKEN,
    BARE_ERROR_MESSAGE,
    RESEARCH_DESCRIPTION,
    DEFAULT_CONTRACT,
    INTERRUPT_CONTRACT,
    state,
    reset,
  };
});

vi.mock("../capabilities/research.ts", async () => {
  const baseMod = await import("../capability/base.ts");
  class StubResearch extends baseMod.PioCapability {
    readonly contract: Contract = stubKit.state.contract;
    constructor(params: CapabilityParams) {
      super(params);
      stubKit.state.bag = params;
    }
    async call(inputs: Record<string, unknown>) {
      stubKit.state.inputs = inputs;
      stubKit.state.enteredNotify?.();
      if (stubKit.state.park !== undefined) {
        await stubKit.state.park();
      }
      switch (stubKit.state.mode) {
        case "success":
          return { report: stubKit.STUB_TOKEN };
        case "success-absolute":
          return { report: stubKit.state.absoluteToken ?? "/abs/fallback.md" };
        case "bare-error": {
          const error = new Error(stubKit.BARE_ERROR_MESSAGE);
          error.name = "WebToolsMissingError";
          throw error;
        }
        case "abort":
          await this.execute_phase("stub-probe", {
            instructions: "stub probe run",
            min: 1,
            max: 1,
          });
          return { report: stubKit.STUB_TOKEN };
      }
    }
  }
  return { default: StubResearch, DESCRIPTION: stubKit.RESEARCH_DESCRIPTION };
});

interface PromptRecord {
  readonly text: string;
  readonly file: string | undefined;
}

interface HandleLike {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  readonly prompt: ReturnType<typeof vi.fn> & ((text: string) => Promise<void>);
  readonly sendCustomMessage: ReturnType<typeof vi.fn> &
    ((payload: unknown) => Promise<void>);
  readonly subscribe: ReturnType<typeof vi.fn> &
    ((listener: Listener) => () => void);
  readonly dispose: ReturnType<typeof vi.fn> & (() => void);
  readonly captured: Listener[];
  readonly live: Listener[];
  disposed: boolean;
  readonly passes: Array<() => Promise<void>>;
}

interface RuntimeShape {
  readonly cwd: string;
  session: HandleLike;
  readonly switchSession: ReturnType<typeof vi.fn>;
}

interface Round {
  session: HandleLike;
  runtime: RuntimeShape;
  captured: Listener[];
}

const sdkKit = vi.hoisted(() => {
  const PARENT_ID = "sess-fake-adhoc-01";
  const PASSES_EXHAUSTED_MESSAGE =
    "adhoc-suite: no scripted pass for this prompt";
  let mints = 0;
  const state: {
    rounds: Round[];
    storedFactories: Array<(input: unknown) => Promise<unknown>>;
    managers: Array<{ getCwd: () => string }>;
    fromServicesArgs: Array<{ customTools?: ReadonlyArray<unknown> }>;
    promptLog: PromptRecord[];
    customMessages: unknown[];
    parentFile: string | undefined;
  } = {
    rounds: [],
    storedFactories: [],
    managers: [],
    fromServicesArgs: [],
    promptLog: [],
    customMessages: [],
    parentFile: undefined,
  };
  const mintHandle = (
    sessionId: string,
    sessionFile: string | undefined,
  ): HandleLike => {
    const captured: Listener[] = [];
    const live: Listener[] = [];
    const passes: Array<() => Promise<void>> = [];
    const handle: HandleLike = {
      sessionId,
      sessionFile,
      prompt: vi.fn(async (text: string): Promise<void> => {
        state.promptLog.push({ text, file: sessionFile });
        const pass = passes.shift();
        if (pass === undefined) {
          throw new Error(PASSES_EXHAUSTED_MESSAGE);
        }
        await pass();
      }),
      sendCustomMessage: vi.fn(async (payload: unknown): Promise<void> => {
        state.customMessages.push(payload);
      }),
      subscribe: vi.fn((listener: Listener): (() => void) => {
        captured.push(listener);
        live.push(listener);
        return (): void => {
          const index = live.indexOf(listener);
          if (index !== -1) {
            live.splice(index, 1);
          }
        };
      }),
      dispose: vi.fn((): void => {
        handle.disposed = true;
        live.length = 0;
      }),
      disposed: false,
      captured,
      live,
      passes,
    };
    return handle;
  };
  const create = vi.fn((cwd: string, sessionDir?: string) => {
    const fileName = `20260101T000000Z_${String(++mints).padStart(8, "0")}.jsonl`;
    const manager = {
      getCwd: (): string => cwd,
      getSessionFile: (): string | undefined =>
        sessionDir === undefined ? undefined : `${sessionDir}/${fileName}`,
    };
    state.managers.push(manager);
    return manager;
  });
  const getAgentDir = vi.fn((): string => "/agent/dir");
  const createAgentSessionServices = vi.fn(async () => ({
    marker: "fake-services",
  }));
  const createAgentSessionFromServices = vi.fn(
    async (options: {
      services: unknown;
      sessionManager: unknown;
      sessionStartEvent: unknown;
      customTools?: ReadonlyArray<unknown>;
    }) => {
      state.fromServicesArgs.push(options);
      return { extensionsResult: {}, session: {} };
    },
  );
  const createAgentSessionRuntime = vi.fn(
    async (factory?: (input: unknown) => Promise<unknown>) => {
      if (factory !== undefined) state.storedFactories.push(factory);
      const handle = mintHandle(PARENT_ID, state.parentFile);
      const runtime: RuntimeShape = {
        cwd: process.cwd(),
        session: handle,
        switchSession: vi.fn(
          async (): Promise<{ cancelled: boolean }> => ({ cancelled: false }),
        ),
      };
      const round: Round = {
        session: handle,
        runtime,
        captured: handle.captured,
      };
      state.rounds.push(round);
      return runtime;
    },
  );
  const createBashToolDefinition = vi.fn(
    (_cwd: string, options: { operations: unknown }) => ({
      name: "bash",
      operations: options.operations,
    }),
  );
  const defineTool = vi.fn((tool: unknown) => tool);
  const createLocalBashOperations = vi.fn(() => ({}));
  const reset = (): void => {
    mints = 0;
    state.rounds = [];
    state.storedFactories = [];
    state.managers = [];
    state.fromServicesArgs = [];
    state.promptLog = [];
    state.customMessages = [];
    state.parentFile = undefined;
    create.mockClear();
    getAgentDir.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
    createBashToolDefinition.mockClear();
    defineTool.mockClear();
    createLocalBashOperations.mockClear();
  };
  return {
    PARENT_ID,
    state,
    mintHandle,
    create,
    getAgentDir,
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
  getAgentDir: sdkKit.getAgentDir,
  SessionManager: { create: sdkKit.create },
  createAgentSessionServices: sdkKit.createAgentSessionServices,
  createAgentSessionFromServices: sdkKit.createAgentSessionFromServices,
  createAgentSessionRuntime: sdkKit.createAgentSessionRuntime,
  createBashToolDefinition: sdkKit.createBashToolDefinition,
  defineTool: sdkKit.defineTool,
  createLocalBashOperations: sdkKit.createLocalBashOperations,
}));

const fsKit = vi.hoisted(() => {
  let real: ((path: string) => boolean) | undefined;
  let forced: (() => void) | undefined;
  const existsMock = (path: unknown): boolean => {
    forced?.();
    if (real === undefined) return true;
    return real(String(path));
  };
  return {
    setReal(fn: (path: string) => boolean): void {
      real = fn;
    },
    setForced(fn?: () => void): void {
      forced = fn;
    },
    existsMock,
  };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  fsKit.setReal(actual.existsSync.bind(actual));
  return {
    ...actual,
    existsSync: fsKit.existsMock as unknown as typeof actual.existsSync,
  };
});

const ROW_END_MESSAGE = "adhoc-suite: row end";

const GREETING_FRAGMENT =
  "Press ESC at any time to cancel the currently running operation; the conversation stays alive.";

const CATALOG_HEADER_REPLICA = "Available capabilities:";

const ADHOC_DESCRIPTION_REPLICA =
  "Describe what you need in plain language and it matches your request against the registered built-ins, confirms the pick with you, runs the chosen capability right here in this conversation, and reports the result - staying available for follow-ups until you exit.";

function listingReplica(): string {
  return [
    CATALOG_HEADER_REPLICA,
    `- research: ${stubKit.RESEARCH_DESCRIPTION}`,
    "  inputs: topic",
    "- compose-new-session-demo: Temporary demonstration of handing the terminal between sessions: after a greeting, a brand-new session takes over your terminal to research a fixed topic, and you get the top 3 findings from its report once control comes back.",
    "- compose-same-session-demo: Demonstration of keeping everything in one session: after a greeting, research runs inside your current session without ever leaving it, and you get the top 3 findings from its report.",
    "- guards-demo: Demonstration of missing-deliverable protection: a run deliberately skips writing its required file, the engine forces a corrected retry until the file exists, and the outcome is stated.",
    "- vars-demo: Demonstration of the shared variable store: within one run, the AI and the program code set and read the same variables, one step is deliberately retried, and a value written by a nested sub-run is read back in the main run.",
    `- adhoc: ${ADHOC_DESCRIPTION_REPLICA}`,
  ].join("\n");
}

function gatherBaselineReplica(): string {
  const lead = `Cycle protocol for the adhoc dispatcher:
1. REVIEW the conversation since the last cycle. If a decided-and-stored request is already visible and still stands, skip straight to step 4 (STORE) below. If nothing is pending or actionable this cycle, say briefly what you can help with and end WITHOUT defining the variable (leave it at the sentinel {}).`;
  const tail = `2. CHECK: match the request against the listed capabilities and their declared inputs. If nothing fits, say so plainly and leave the variable at the sentinel.
3. RECOMMEND: in your reply, name which capability you would call, which inputs you would pass, and why. Use the provisioned ask_user tool to gather whatever is missing (including the concrete input values) until you are confident.
4. STORE: when determined, define the variable 'dispatch_request' with the setVar tool holding EXACTLY the JSON string {"name": "<capability>", "inputs": {...}} (values plain strings; inputs may be empty). When nothing dispatches, leave the variable at the sentinel {}.
5. END right after storing (or deciding not to). The program side validates between turns, confirms with the operator, and runs the confirmed capability between turns; its outcome appears in the transcript before your next engagement. If you store a request and ask a question in the same final run, the loop simply continues and the last settled state wins.
Work autonomously between any ask_user exchange and the turn end.`;
  return [lead, listingReplica(), tail].join("\n\n");
}

const DISCLOSURE_EMPTY_FORM_REPLICA = "Phase Permissions:\nNone";
const promptOf = (phaseId: string, instructions: string): string =>
  `${renderPhaseMarker(phaseId)}\n${instructions}\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;

const CONFIRM_DECISION_LEAD =
  "The gathering phase determined a validated dispatch decision:";
const CONFIRM_GRAMMAR_FRAGMENT =
  "Confirm this exact decision with the operator using the ask_user tool in ONE single call, offering: Yes / No / free-form custom feedback.";
const confirmDecisionLine = (name: string, description: string): string =>
  `Capability: ${name} - ${description}`;

const REPORT_SETTLED_LINE = (name: string): string =>
  `dispatch '${name}' settled.`;
const REPORT_FAILED_LINE = (name: string, type: string): string =>
  `dispatch '${name}' failed (${type}).`;
const INTERRUPT_CANCELLATION_LINE = (name: string): string =>
  `dispatch '${name}' was cancelled by the operator while it ran; its run settles as interrupted.`;
const INTERRUPT_SURVIVORS_LABEL = "- Surviving declared partial outputs:";
const INTERRUPT_NONE_LINE =
  "- No declared partial outputs were found at their declared locations.";
const INTERRUPT_DEGRADED_REPLICA =
  "Partial outputs could not be verified (state-root derivation fault); any durable files it committed remain under the project workspace.";

const REFUSAL_RECURSION_REPLICA =
  "adhoc dispatch refused: adhoc cannot dispatch itself (the dispatcher cannot dispatch itself)";
const MALFORMED_REPLICAS = {
  invalidJson:
    "adhoc dispatch refused: the stored dispatch request is not valid JSON",
  nonPlainObject:
    "adhoc dispatch refused: the stored dispatch request is not a plain object",
  badName:
    "adhoc dispatch refused: the stored dispatch request has no non-empty capability name",
  badInputs:
    "adhoc dispatch refused: the stored dispatch request inputs must be a plain object of string values",
};

const VIOLATION_TOPIC_REPLICA =
  "input 'topic' expects a non-empty string value";

const PIE_MESSAGE_REPLICA =
  "Phase interruption: the settling run ended on a user abort \u2014 the phase settles as cancelled";

const ENV_UNSET_REPLICA =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";

const CUSTOM_TYPE_REPLICA = "pio-capability";

const setSuccessReplica = (name: string, value: unknown): string =>
  `variable '${name}' set to ${JSON.stringify(value)}.`;

function projectSlotOf(): string {
  return join(
    deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
    "projects",
    deriveProjectKey(process.cwd()),
  );
}
function expectedAbsolutePath(token: string): string {
  return join(projectSlotOf(), token);
}

const AGENT_START = { type: "agent_start" };
const AGENT_END = { type: "agent_end", messages: [], willRetry: false };
const ASK_USER_START = {
  type: "tool_execution_start",
  toolCallId: "tc-ask-1",
  toolName: "ask_user",
  args: {},
};
const ASK_USER_END = {
  type: "tool_execution_end",
  toolCallId: "tc-ask-1",
  isError: false,
};
const ABORT_MESSAGE_END = {
  type: "message_end",
  message: {
    role: "assistant",
    stopReason: "aborted",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { total: 0 },
    },
  },
};

let originalEnv: string | undefined;
let originalCwd: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

const tempRoots: string[] = [];
let tempCursor = 0;

function newTempRoot(): string {
  const root = mkdtempSync(
    join(tmpdir(), `pio-adhoc-${String(++tempCursor).padStart(2, "0")}-`),
  );
  tempRoots.push(root);
  return root;
}

beforeEach(() => {
  stubKit.reset();
  sdkKit.reset();
  fsKit.setForced(undefined);
  teardownFrameEnvironment();
  originalEnv = process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CODING_AGENT_DIR; // start UNSET — rows opt in
  originalCwd = process.cwd();
  stderrSpy = vi.spyOn(process.stderr, "write");
  stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((): boolean => true);
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalEnv !== undefined) {
    process.env.PI_CODING_AGENT_DIR = originalEnv;
  } else {
    delete process.env.PI_CODING_AGENT_DIR;
  }
  stderrSpy.mockRestore();
  stdoutSpy.mockRestore();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function stderrText(): string {
  return stderrSpy.mock.calls
    .map((call: readonly unknown[]) => String(call[0]))
    .join("");
}
function stdoutText(): string {
  return stdoutSpy.mock.calls
    .map((call: readonly unknown[]) => String(call[0]))
    .join("");
}

const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

function lastRound(): Round {
  const round = sdkKit.state.rounds[sdkKit.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

interface World {
  readonly root: string;
  readonly sessionsRoot: string | undefined;
  readonly parentFile: string | undefined;
  readonly instance: PioSession;
  readonly round: Round;
  readonly runtime: RuntimeShape;
  readonly stop: ReturnType<typeof vi.fn> & (() => void);
  readonly stderrSink: ReturnType<typeof vi.fn> & ((line: string) => void);
  readonly physics: boolean;
}

function seedTranscript(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function enterWorkTree(root: string, env: "set" | "unset"): void {
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  process.chdir(work);
  if (env === "set") {
    process.env.PI_CODING_AGENT_DIR = join(root, ".pi", "agent");
  } else {
    delete process.env.PI_CODING_AGENT_DIR;
  }
}

async function setupWorld(opts: {
  root: string;
  env: "set" | "unset";
  physics?: boolean;
}): Promise<World> {
  enterWorkTree(opts.root, opts.env);
  const sessionsRoot = opts.physics ? join(opts.root, "sessions") : undefined;
  const parentFile = opts.physics
    ? join(sessionsRoot as string, "top", "parent-transcript.jsonl")
    : join(opts.root, "transcript", "parent-transcript.jsonl");
  if (opts.physics) {
    seedTranscript(parentFile, "<top seed>\n");
  }
  sdkKit.state.parentFile = parentFile;
  const instance = await PioSession.create(process.cwd());
  const round = lastRound();
  const stop = vi.fn((): void => {});
  const stderrSink = vi.fn((_line: string): void => {});
  const world: World = {
    root: opts.root,
    sessionsRoot,
    parentFile,
    instance,
    round,
    runtime: round.runtime,
    stop,
    stderrSink,
    physics: Boolean(opts.physics),
  };
  if (opts.physics) {
    installFrameEnvironment({
      sessionsRoot: sessionsRoot as string,
      topFrame: instance,
      terminalStop: (): void => stop(),
      stderr: (line: string): void => stderrSink(line),
    });
  }
  return world;
}

function emitTo(handle: HandleLike, ...events: object[]): void {
  for (const event of events) {
    for (const listener of [...handle.live]) {
      listener(asEvent(event));
    }
  }
}

interface DrivenSettlement {
  content: Array<{ type: string; text: string }>;
  details: unknown;
}
function driveVarEntry(
  entry: unknown,
  params: unknown,
): Promise<DrivenSettlement> {
  const execute = (
    entry as {
      execute: (
        id: string,
        p: unknown,
        s: unknown,
        u: unknown,
        c: unknown,
      ) => Promise<DrivenSettlement>;
    }
  ).execute;
  return execute("tc-adhoc-suite", params, undefined, undefined, {});
}

async function driveStoredClosure(): Promise<{
  customTools?: ReadonlyArray<unknown>;
}> {
  const factory = sdkKit.state.storedFactories.at(-1);
  if (factory === undefined) {
    throw new Error("expected a stored construction factory");
  }
  const manager = sdkKit.state.managers.at(-1);
  if (manager === undefined)
    throw new Error("expected a recorded session manager");
  await factory({
    cwd: process.cwd(),
    agentDir: "/agent/dir",
    sessionManager: manager,
    sessionStartEvent: undefined,
  });
  const arg = sdkKit.state.fromServicesArgs.at(-1);
  if (arg === undefined)
    throw new Error("expected a recorded from-services arg");
  return arg;
}

async function recoverTools(): Promise<Record<string, unknown>> {
  const arg = await driveStoredClosure();
  const tools = arg.customTools ?? [];
  expect(tools.map((tool) => (tool as { name: string }).name)).toEqual([
    "bash",
    "setVar",
    "getVar",
    "listVars",
  ]);
  const index: Record<string, unknown> = {};
  for (const tool of tools) index[(tool as { name: string }).name] = tool;
  return index;
}

function scriptStorePass(
  handle: HandleLike,
  tools: Record<string, unknown> | undefined,
  json: string | undefined,
  ask: boolean,
  results: DrivenSettlement[],
): void {
  handle.passes.push(async (): Promise<void> => {
    emitTo(handle, AGENT_START);
    if (tools !== undefined && json !== undefined) {
      results.push(
        await driveVarEntry(tools.setVar, {
          name: DISPATCH_REQUEST_VAR,
          type: "string",
          value: json,
        }),
      );
    }
    if (ask) {
      emitTo(handle, ASK_USER_START, ASK_USER_END);
    }
    emitTo(handle, AGENT_END);
  });
}
const scriptQuiet = (handle: HandleLike): void =>
  scriptStorePass(handle, undefined, undefined, false, []);
const scriptAsk = (handle: HandleLike): void =>
  scriptStorePass(handle, undefined, undefined, true, []);
function scriptAbort(handle: HandleLike): void {
  handle.passes.push(async (): Promise<void> => {
    emitTo(handle, AGENT_START, ABORT_MESSAGE_END, AGENT_END);
  });
}
function scriptValve(handle: HandleLike): void {
  handle.passes.push(async (): Promise<void> => {
    throw new Error(ROW_END_MESSAGE);
  });
}

type SwapStep =
  | {
      kind: "swap";
      sessionId: string;
      persist?: (path: string) => void;
      prepare?: (handle: HandleLike) => void;
    }
  | { kind: "cancel" }
  | { kind: "reject"; message: string };

function scriptSwitches(world: World, ...steps: SwapStep[]): void {
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
        const incoming = sdkKit.mintHandle(step.sessionId, path);
        world.runtime.session = incoming;
        step.persist?.(path);
        step.prepare?.(incoming);
        return { cancelled: false };
      },
    );
  }
}

function scriptHappyHop(
  world: World,
  opts: {
    childId: string;
    postHop: (parent: HandleLike) => void;
    onChild?: (child: HandleLike) => void;
  },
): void {
  scriptSwitches(
    world,
    {
      kind: "swap",
      sessionId: opts.childId,
      persist: (path: string): void => seedTranscript(path, "<child seed>\n"),
      prepare: opts.onChild,
    },
    {
      kind: "swap",
      sessionId: sdkKit.PARENT_ID,
      prepare: opts.postHop,
    },
  );
}

function recursiveListing(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const sub of recursiveListing(full)) {
        out.push(`${entry}/${sub}`);
      }
    } else {
      out.push(entry);
    }
  }
  return out.sort();
}

function topPrompts(world: World): PromptRecord[] {
  return sdkKit.state.promptLog.filter(
    (record) => record.file !== undefined && record.file === world.parentFile,
  );
}
const sentText = (records: PromptRecord[], index: number): string =>
  records[index]?.text ?? "";

const VALVE_RESULT = {
  ok: false,
  errors: [{ type: "Error", message: ROW_END_MESSAGE }],
} as const;

const TOPIC = "Stained glass in Rouen";
const DECISION_JSON = `{"name":"research","inputs":{"topic":"${TOPIC}"}}`;

describe("happy chain (R1 — binding leg, physics world)", () => {
  it("the full sitting: greeting -> gather burst (listing + REAL setVar + ask delta, then a quiet settle) -> confirm -> UNIFORM ROW-2 hop -> report with BASE-SETTLED absolute outputs -> consume-and-clear -> outer re-arm; exactly ONE span stamp across the whole sitting", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const results: DrivenSettlement[] = [];
    scriptQuiet(world.round.session);
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, results);
    scriptQuiet(world.round.session);
    scriptAsk(world.round.session);
    scriptHappyHop(world, {
      childId: "child-r1",
      postHop: (parent): void => {
        scriptQuiet(parent); // report
        scriptValve(parent); // row-end valve (fresh gather burst)
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();

    expect(result).toStrictEqual(VALVE_RESULT);

    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(6);
    expect(prompts.every((record) => record.file === world.parentFile)).toBe(
      true,
    );
    expect(sdkKit.state.promptLog).toHaveLength(6); // zero child-file prompts
    expect(sentText(prompts, 0)).toContain(renderPhaseMarker("greeting"));
    expect(sentText(prompts, 0)).toContain(GREETING_FRAGMENT);
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 1)).toBe(baseline);
    expect(sentText(prompts, 2)).toBe(baseline);
    expect(sentText(prompts, 3)).toContain(renderPhaseMarker("confirm"));
    expect(sentText(prompts, 3)).toContain(CONFIRM_DECISION_LEAD);
    expect(sentText(prompts, 3)).toContain(
      confirmDecisionLine("research", stubKit.RESEARCH_DESCRIPTION),
    );
    expect(sentText(prompts, 3)).toContain(
      `Inputs to pass: ${JSON.stringify({ topic: TOPIC })}`,
    );
    expect(sentText(prompts, 3)).toContain(CONFIRM_GRAMMAR_FRAGMENT);
    const abs = expectedAbsolutePath(stubKit.STUB_TOKEN);
    expect(sentText(prompts, 4)).toContain(renderPhaseMarker("report"));
    expect(sentText(prompts, 4)).toContain(REPORT_SETTLED_LINE("research"));
    expect(sentText(prompts, 4)).toContain(
      `Outputs: ${JSON.stringify({ report: abs })}`,
    );
    expect(sentText(prompts, 5)).toBe(baseline);
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(results[0]?.content[0]?.text).toBe(
      setSuccessReplica(DISPATCH_REQUEST_VAR, DECISION_JSON),
    );
    expect(stubKit.state.bag).toEqual({});
    expect(stubKit.state.inputs).toStrictEqual({ topic: TOPIC });
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
    const switchPaths = world.runtime.switchSession.mock.calls.map(
      (call) => call[0],
    ) as string[];
    const childFile = switchPaths[0] as string;
    const childScopeDir = dirname(dirname(childFile));
    const scopeName = basename(childScopeDir);
    expect(dirname(childFile)).toBe(join(childScopeDir, "top"));
    expect(switchPaths[1]).toBe(world.parentFile);
    for (const call of world.runtime.switchSession.mock.calls) {
      expect(call[1]).toEqual({ cwdOverride: process.cwd() });
    }
    const childStatusPath = join(childScopeDir, "top", "status.json");
    expect(existsSync(childStatusPath)).toBe(true);
    const raw = readFileSync(childStatusPath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.capability).toEqual({
      name: "research",
      version: "0.1.0",
      source: "builtin",
    });
    expect(parsed.outputs).toEqual({ report: abs });
    expect(parsed.transcriptRef).toBe(
      `${scopeName}/top/${basename(childFile)}`,
    );
    expect(activeFrames()).toHaveLength(1);
    expect(world.runtime.session.sessionId).toBe(sdkKit.PARENT_ID);
    expect(world.runtime.session).not.toBe(world.round.session);
    expect(world.round.session.disposed).toBe(true);
    expect(recursiveListing(world.sessionsRoot as string)).toEqual(
      [
        `${scopeName}/top/${basename(childFile)}`,
        `${scopeName}/top/status.json`,
        "top/parent-transcript.jsonl",
      ].sort(),
    );
    expect(sdkKit.state.customMessages).toHaveLength(1);
    expect(sdkKit.state.customMessages[0]).toStrictEqual({
      customType: CUSTOM_TYPE_REPLICA,
      content: renderCapabilityMarker(ADHOC_NAME),
      display: true,
      details: undefined,
    });
    expect(world.stop).toHaveBeenCalledTimes(0);
    expect(world.stderrSink).not.toHaveBeenCalled();
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("quiet-cycle shape (R2 — top world)", () => {
  it("quiescent cycling costs EXACTLY one gather prompt per inner iteration (two consecutive cycles pinned by prompt count/text; variable at the sentinel; no confirm/report prompts; no hop)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    scriptQuiet(world.round.session); // greeting
    scriptQuiet(world.round.session); // cycle 1: gather reconciliation
    scriptQuiet(world.round.session); // cycle 2: gather reconciliation
    scriptValve(world.round.session); // row-end valve (cycle 3's prompt)
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(4);
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 1)).toBe(baseline);
    expect(sentText(prompts, 2)).toBe(baseline);
    expect(sentText(prompts, 3)).toBe(baseline);
    expect(sentText(prompts, 0)).toContain(renderPhaseMarker("greeting"));
    for (const record of prompts) {
      expect(record.text).not.toContain(renderPhaseMarker("confirm"));
      expect(record.text).not.toContain(renderPhaseMarker("report"));
    }
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(sdkKit.state.customMessages).toHaveLength(1);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("flow independence (R3 — physics world)", () => {
  it("a decision landing in a delta-0 burst run settles THAT run and dispatches (ONE reconciliation turn - the burst's own run count pinned); assert only the sanctioned claims: request reaches the variable, burst dispatches, loop survives", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const results: DrivenSettlement[] = [];
    scriptQuiet(world.round.session); // greeting
    scriptStorePass(world.round.session, tools, DECISION_JSON, false, results);
    scriptAsk(world.round.session); // affirming confirm pass
    scriptHappyHop(world, {
      childId: "child-r3",
      postHop: (parent): void => {
        scriptQuiet(parent); // report
        scriptValve(parent); // row-end valve (fresh gather burst)
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    expect(results[0]?.content[0]?.text).toBe(
      setSuccessReplica(DISPATCH_REQUEST_VAR, DECISION_JSON),
    );
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(5);
    expect(sentText(prompts, 1)).toContain(renderPhaseMarker("gather"));
    expect(sentText(prompts, 2)).toContain(renderPhaseMarker("confirm"));
    expect(sentText(prompts, 2)).toContain(CONFIRM_DECISION_LEAD);
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
    expect(stubKit.state.bag).toEqual({});
    expect(stubKit.state.inputs).toStrictEqual({ topic: TOPIC });
    const abs = expectedAbsolutePath(stubKit.STUB_TOKEN);
    expect(sentText(prompts, 3)).toContain(REPORT_SETTLED_LINE("research"));
    expect(sentText(prompts, 3)).toContain(
      `Outputs: ${JSON.stringify({ report: abs })}`,
    );
    expect(sentText(prompts, 4)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("ESC mid-burst (R4 — top world)", () => {
  it("an aborted gather settlement throws PhaseInterruptionError OUT of the body's own phase, is caught around the cycle, DISCARDS the stored decision, and re-arms a fresh gather burst (prompts continue on the top handle; no hop)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    const tools = await recoverTools();
    scriptQuiet(world.round.session); // greeting
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptAbort(world.round.session); // burst run 2 settles ABORTED
    scriptValve(world.round.session); // fresh burst's prompt = row-end valve
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    expect(result.errors?.[0]?.type).not.toBe("PhaseInterruptionError");
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(4);
    expect(sentText(prompts, 3)).toBe(sentText(prompts, 1));
    expect(sentText(prompts, 3)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("ESC mid-hosted-run (R5 — physics world)", () => {
  it("a stub callee that settles ABORTED yields a child record BYTE-PINNED ok:false with the PhaseInterruptionError capture; the switch-back + top-frame rebind complete; the report phase carries the interruption facts INCLUDING fixture-seeded survivor paths (a directory passing existsSync included); the lane is consumed+cleared; the loop is alive", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const projectSlot = projectSlotOf();
    const partPath = join(projectSlot, "research", "part.md");
    const archiveDir = join(projectSlot, "research", "archive.d");
    mkdirSync(dirname(partPath), { recursive: true });
    writeFileSync(partPath, "partial findings\n");
    mkdirSync(archiveDir, { recursive: true });
    stubKit.state.contract = stubKit.INTERRUPT_CONTRACT;
    stubKit.state.mode = "abort";
    scriptQuiet(world.round.session); // greeting
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptQuiet(world.round.session); // gather settles quiet
    scriptAsk(world.round.session); // affirming confirm
    scriptHappyHop(world, {
      childId: "child-r5",
      onChild: (child): void => {
        scriptAbort(child); // the stub's phase settles ABORTED
      },
      postHop: (parent): void => {
        scriptQuiet(parent); // report
        scriptValve(parent); // row-end valve (fresh gather burst)
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const childFile = world.runtime.switchSession.mock.calls.map(
      (call: unknown[]) => call[0],
    )[0] as string;
    const childScopeDir = dirname(dirname(childFile));
    const raw = readFileSync(join(childScopeDir, "top", "status.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toStrictEqual([
      { type: "PhaseInterruptionError", message: PIE_MESSAGE_REPLICA },
    ]);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(6);
    expect(world.runtime.session.sessionId).toBe(sdkKit.PARENT_ID);
    expect(activeFrames()).toHaveLength(1);
    const reportText = sentText(prompts, 4);
    expect(reportText).toContain(renderPhaseMarker("report"));
    expect(reportText).toContain(INTERRUPT_CANCELLATION_LINE("research"));
    expect(reportText).toContain(INTERRUPT_SURVIVORS_LABEL);
    const survivorReport = `  - report: ${partPath}`;
    const survivorArchive = `  - archive: ${archiveDir}`;
    expect(reportText).toContain(survivorReport);
    expect(reportText).toContain(survivorArchive);
    expect(reportText.indexOf(survivorReport)).toBeLessThan(
      reportText.indexOf(survivorArchive),
    );
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(sentText(prompts, 5)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.stop).toHaveBeenCalledTimes(0);
    expect(world.stderrSink).not.toHaveBeenCalled();
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("refusal vocabulary (R6-R9 — top world)", () => {
  interface RefusalCase {
    label: string;
    payload: string;
    fact: string;
  }
  const cases: RefusalCase[] = [
    {
      label: "recursion (stored adhoc)",
      payload: `{"name":"adhoc","inputs":{}}`,
      fact: REFUSAL_RECURSION_REPLICA,
    },
    {
      label: "unknown name (loader miss VERBATIM)",
      payload: `{"name":"doesnotexist","inputs":{}}`,
      fact: `pio: capability 'doesnotexist' is not implemented yet`,
    },
    {
      label: "contract violation (collect-all lines VERBATIM)",
      payload: `{"name":"research","inputs":{}}`,
      fact: VIOLATION_TOPIC_REPLICA,
    },
    {
      label: "malformed: invalid JSON",
      payload: `{invalid json`,
      fact: MALFORMED_REPLICAS.invalidJson,
    },
    {
      label: "malformed: parsed non-plain-object",
      payload: `[1, 2]`,
      fact: MALFORMED_REPLICAS.nonPlainObject,
    },
    {
      label: "malformed: name not a non-empty string",
      payload: `{"name":"","inputs":{}}`,
      fact: MALFORMED_REPLICAS.badName,
    },
    {
      label: "malformed: inputs with a non-string value",
      payload: `{"name":"research","inputs":{"topic":42}}`,
      fact: MALFORMED_REPLICAS.badInputs,
    },
  ];
  for (const row of cases) {
    it(`${row.label}: the refusal FACT rides the NEXT gather burst's instructions alongside the always-present listing; NO hop; the lane is cleared; the cycle continues`, async () => {
      const root = newTempRoot();
      const world = await setupWorld({ root, env: "set" });
      const tools = await recoverTools();
      scriptQuiet(world.round.session); // greeting
      scriptStorePass(world.round.session, tools, row.payload, true, []);
      scriptQuiet(world.round.session); // burst 1 run 2 settles quiet
      scriptQuiet(world.round.session); // burst 2 (carries the fact) settles
      scriptValve(world.round.session); // row-end valve (burst 3's prompt)
      const adhoc = new AdhocCapability({ session: world.instance });
      const result = await adhoc.run();
      expect(result).toStrictEqual(VALVE_RESULT);
      const prompts = topPrompts(world);
      expect(prompts).toHaveLength(5);
      const baseline = promptOf("gather", gatherBaselineReplica());
      expect(sentText(prompts, 1)).toBe(baseline);
      expect(sentText(prompts, 2)).toBe(baseline);
      const second = sentText(prompts, 3);
      expect(second).toContain(listingReplica());
      expect(second).toContain(row.fact);
      expect(second.indexOf(CATALOG_HEADER_REPLICA)).toBeLessThan(
        second.indexOf(row.fact),
      );
      if (row.label.startsWith("unknown")) {
        expect(row.fact).toBe(capabilityRefusalLine("doesnotexist"));
      }
      expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
        NO_DISPATCH_VALUE,
      );
      expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
      expect(stubKit.state.bag).toEqual({});
      expect(sentText(prompts, 4)).toBe(baseline);
      expect(stderrText()).toBe("");
      expect(stdoutText()).toBe("");
    });
  }
});

describe("stale variable (R10 — top world)", () => {
  it("an operator-declined confirmation leaves the lane at the sentinel (post-action reset semantics); the following quiescent cycle is SILENT (no hop, no refusal fact, the lane untouched)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    const tools = await recoverTools();
    const declineResults: DrivenSettlement[] = [];
    scriptQuiet(world.round.session); // greeting
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptQuiet(world.round.session); // gather settles quiet
    scriptStorePass(
      world.round.session,
      tools,
      NO_DISPATCH_VALUE,
      true,
      declineResults,
    );
    scriptQuiet(world.round.session); // silent cycle 1 (baseline gather)
    scriptQuiet(world.round.session); // silent cycle 2 (baseline gather)
    scriptValve(world.round.session); // row-end valve (silent cycle 3)
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(7);
    expect(sentText(prompts, 3)).toContain(renderPhaseMarker("confirm"));
    expect(declineResults[0]?.content[0]?.text).toBe(
      setSuccessReplica(DISPATCH_REQUEST_VAR, NO_DISPATCH_VALUE),
    );
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 4)).toBe(baseline);
    expect(sentText(prompts, 5)).toBe(baseline);
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("env defect (R11 — physics world)", () => {
  it("the settle seam NEVER consults placement for already-absolute values (throwing provider uncalled; relative tokens still pay the derivation) and deriveStateRootFromAgentDir THROWS LOUDLY on the absent channel (no silent fallback)", () => {
    const absoluteToken = "/fixed/elsewhere/report.md";
    let providerCalls = 0;
    const throwingProvider = (): string => {
      providerCalls += 1;
      throw new Error("placement must never be consulted");
    };
    expect(
      settleFileModeOutputs(
        [{ name: "report", paramKey: "report" }],
        { report: absoluteToken },
        throwingProvider,
      ),
    ).toEqual({ report: absoluteToken });
    expect(providerCalls).toBe(0);
    expect(
      settleFileModeOutputs(
        [{ name: "report", paramKey: "report" }],
        { report: "research/x.md" },
        () => "/slot",
      ),
    ).toEqual({ report: "/slot/research/x.md" });
    try {
      deriveStateRootFromAgentDir(undefined);
      expect.unreachable("the absent channel must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityEnvError);
      expect((error as Error).message).toContain(ENV_UNSET_REPLICA);
    }
  });

  it("a SETTLED report over an ALREADY-ABSOLUTE token rides the hop and the base seam UNTRANSFORMED (the child record keeps the raw value; the report renders its compact JSON verbatim - no derivation consult on this path); ZERO process-stream writes", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const absoluteToken = join(root, "fixed", "report.md");
    stubKit.state.mode = "success-absolute";
    stubKit.state.absoluteToken = absoluteToken;
    scriptQuiet(world.round.session);
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptQuiet(world.round.session);
    scriptAsk(world.round.session);
    scriptHappyHop(world, {
      childId: "child-r11a",
      postHop: (parent): void => {
        scriptQuiet(parent);
        scriptValve(parent);
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 4);
    expect(reportText).toContain(REPORT_SETTLED_LINE("research"));
    expect(reportText).toContain(
      `Outputs: ${JSON.stringify({ report: absoluteToken })}`,
    );
    const childFile = world.runtime.switchSession.mock.calls.map(
      (call: unknown[]) => call[0],
    )[0] as string;
    const parsed = JSON.parse(
      readFileSync(
        join(dirname(dirname(childFile)), "top", "status.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.outputs).toEqual({ report: absoluteToken });
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });

  it("an INTERRUPTED report DEGRADES to the generic sentence when the partial-survivor derivation FAULTS (swallow-only: the narration never hard-fails the loop; the sitting settles and cycles on); the interruption capture stands in the child record; ZERO process-stream writes", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    stubKit.state.contract = stubKit.INTERRUPT_CONTRACT;
    stubKit.state.mode = "abort";
    fsKit.setForced((): void => {
      throw new Error("adhoc-suite: forced survivor-scan fault");
    });
    scriptQuiet(world.round.session);
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptQuiet(world.round.session);
    scriptAsk(world.round.session);
    scriptHappyHop(world, {
      childId: "child-r11b",
      onChild: (child): void => {
        scriptAbort(child);
      },
      postHop: (parent): void => {
        scriptQuiet(parent);
        scriptValve(parent);
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 4);
    expect(reportText).toContain(INTERRUPT_CANCELLATION_LINE("research"));
    expect(reportText).toContain(INTERRUPT_DEGRADED_REPLICA);
    expect(reportText).not.toContain(INTERRUPT_SURVIVORS_LABEL);
    const childFile = world.runtime.switchSession.mock.calls.map(
      (call: unknown[]) => call[0],
    )[0] as string;
    const parsed = JSON.parse(
      readFileSync(
        join(dirname(dirname(childFile)), "top", "status.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(parsed.errors).toStrictEqual([
      { type: "PhaseInterruptionError", message: PIE_MESSAGE_REPLICA },
    ]);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("result-variant coverage (physics world)", () => {
  it("a FAILED callee dispatch settles the sitting on the typed capture: the report carries the failed line WITH THE CAPTURE TYPE plus the message VERBATIM; the child record stands ok:false with the same capture; the lane is cleared; the loop stays alive; ZERO process-stream writes", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    stubKit.state.mode = "bare-error";
    scriptQuiet(world.round.session);
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptQuiet(world.round.session);
    scriptAsk(world.round.session);
    scriptHappyHop(world, {
      childId: "child-r14",
      postHop: (parent): void => {
        scriptQuiet(parent);
        scriptValve(parent);
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 4);
    expect(reportText).toContain(renderPhaseMarker("report"));
    expect(reportText).toContain(
      REPORT_FAILED_LINE("research", "WebToolsMissingError"),
    );
    expect(reportText).toContain(stubKit.BARE_ERROR_MESSAGE);
    const childFile = world.runtime.switchSession.mock.calls.map(
      (call: unknown[]) => call[0],
    )[0] as string;
    const parsed = JSON.parse(
      readFileSync(
        join(dirname(dirname(childFile)), "top", "status.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toStrictEqual([
      { type: "WebToolsMissingError", message: stubKit.BARE_ERROR_MESSAGE },
    ]);
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(sentText(prompts, 5)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });

  it("an INTERRUPTED dispatch over a static-file-slot contract with NO surviving files names the absence explicitly (the survivor label does NOT appear; the explicit none-line does); the loop stays alive; ZERO process-stream writes", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    stubKit.state.contract = stubKit.INTERRUPT_CONTRACT;
    stubKit.state.mode = "abort";
    scriptQuiet(world.round.session);
    scriptStorePass(world.round.session, tools, DECISION_JSON, true, []);
    scriptQuiet(world.round.session);
    scriptAsk(world.round.session);
    scriptHappyHop(world, {
      childId: "child-r15",
      onChild: (child): void => {
        scriptAbort(child);
      },
      postHop: (parent): void => {
        scriptQuiet(parent);
        scriptValve(parent);
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 4);
    expect(reportText).toContain(INTERRUPT_CANCELLATION_LINE("research"));
    expect(reportText).toContain(INTERRUPT_NONE_LINE);
    expect(reportText).not.toContain(INTERRUPT_SURVIVORS_LABEL);
    expect(reportText).not.toContain(INTERRUPT_DEGRADED_REPLICA);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("bound (R12 — top world)", () => {
  it("endless ask continuation in gather settles PLAINLY at the cap (done at ADHOC_BURST_MAX_RUNS - bound-behavior, NO throw, NO annotation duty); the body proceeds on the sentinel and the loop stays alive", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    scriptQuiet(world.round.session); // greeting
    for (let run = 0; run < ADHOC_BURST_MAX_RUNS; run++) {
      scriptAsk(world.round.session); // every run: delta > 0, nothing stored
    }
    scriptValve(world.round.session); // the fresh burst's prompt = valve
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(1 + ADHOC_BURST_MAX_RUNS + 1);
    expect(sentText(prompts, 1)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(sentText(prompts, ADHOC_BURST_MAX_RUNS + 1)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBe(
      NO_DISPATCH_VALUE,
    );
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("module surface and mechanical source guards (R13)", () => {
  const src = readFileSync(new URL("./adhoc.ts", import.meta.url), "utf8");

  it("loader admission over the shipped thunk: the contract is STRICT-EQUAL to the no-inputs/no-outputs/no-writes identity (ALLOWPROJECTWRITES ABSENT) and the ctor is the module default by REFERENCE", async () => {
    const table: CapabilityTable = {
      adhoc: () => import("./adhoc.ts"),
    };
    const result = await resolveCapability("adhoc", table);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal}`);
    expect(result.capability.ctor).toBe(AdhocCapability);
    expect(result.capability.contract).toStrictEqual({
      name: ADHOC_NAME,
      version: "0.1.0",
      inputs: [],
      outputs: [],
      writes: [],
    });
  });

  it("runtime export surface is EXACTLY the six pinned names (types erase under erasable syntax)", async () => {
    const mod = await import("./adhoc.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "ADHOC_BURST_MAX_RUNS",
      "ADHOC_NAME",
      "DESCRIPTION",
      "DISPATCH_REQUEST_VAR",
      "NO_DISPATCH_VALUE",
      "default",
    ]);
  });

  it("the export cluster carries the pinned values (lane variable, sentinel, burst cap, name) and the DESCRIPTION is a PURE-ASCII single line", async () => {
    const mod = await import("./adhoc.ts");
    const description = mod.DESCRIPTION as unknown as string;
    expect(ADHOC_NAME).toBe("adhoc");
    expect(DISPATCH_REQUEST_VAR).toBe("dispatch_request");
    expect(NO_DISPATCH_VALUE).toBe("{}");
    expect(ADHOC_BURST_MAX_RUNS).toBe(30);
    expect(description).toBe(ADHOC_DESCRIPTION_REPLICA);
    expect(description.split("\n").length === 1).toBe(true);
    expect([...description].every((char) => char.charCodeAt(0) < 128)).toBe(
      true,
    );
  });

  it("ZERO raw U+2014 / U+2026 occurrences in the module source (pure-ASCII literals; dash-free templates)", () => {
    expect(src.includes("\u2014")).toBe(false);
    expect(src.includes("\u2026")).toBe(false);
  });

  it("the import surface is EXACTLY the pinned dependency set with ZERO SDK specifier (capability-layer doctrine: the module never reaches the SDK directly; layout stays formatter-canonical)", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
    const specifiers = [
      ...new Set(
        [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]),
      ),
    ].sort();
    expect(specifiers).toEqual(
      [
        "../capability/base.ts",
        "../capability/contract.ts",
        "../capability/errors.ts",
        "../capability/loader.ts",
        "../capability/pio-session.ts",
        "../capability/status.ts",
        "../sandbox/layout.ts",
        "node:fs",
        "node:path",
      ].sort(),
    );
  });

  it("threaded customTools names are EXACTLY the fenced bash + the variable trio (NO adhoc-specific tool anywhere - construction-floor row)", async () => {
    const root = newTempRoot();
    enterWorkTree(root, "set");
    await PioSession.create(process.cwd());
    await recoverTools(); // the name-sequence assertion lives in the helper
  });
});
