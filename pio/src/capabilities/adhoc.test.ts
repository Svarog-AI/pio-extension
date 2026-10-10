// Hermetic adhoc suite. The sitting never terminates on its own, so every
// driven row ends with ONE scripted rejecting pass (the row-end valve) that
// escapes to the base catch-all - a harness device, not a product claim.
// One fused world serves both sides: real PioSession.create over a
// physics-shaped fake runtime lets the same rows drive body logic and the
// real terminal-takeover hop (non-hopping rows pin zero switchSession
// calls). Replicated product bytes name their SOLE OWNER export in
// ./adhoc.ts or the named co-shipping module; identity-over-goldens. The
// two-lane encoding settles decisions natively (object onto the request
// spec lane, boolean onto the answer lane), malformed writes fail visibly
// MID-TURN via twin-store capture, and fully-silent rounds pay the ruled
// four-prompt cost into the dedicated verdict class before the next fresh
// round begins.
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
import { z } from "zod";
import type { CapabilityParams } from "../capability/base.ts";
import {
  CapabilityEnvError,
  deriveStateRootFromAgentDir,
  settleFileModeOutputs,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import {
  ContractViolationError,
  MissingVariableError,
  VariableRejectionError,
} from "../capability/errors.ts";
import {
  type CapabilityTable,
  capabilityRefusalLine,
  resolveCapability,
} from "../capability/loader.ts";
import {
  PioSession,
  renderCapabilityMarker,
  renderPhaseMarker,
  SessionVariableStore,
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
    contract: Contract;
    absoluteToken: string | undefined;
  } = {
    bag: undefined,
    inputs: undefined,
    mode: "success",
    contract: DEFAULT_CONTRACT,
    absoluteToken: undefined,
  };
  const reset = (): void => {
    state.bag = undefined;
    state.inputs = undefined;
    state.mode = "success";
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

const CATALOG_HEADER_REPLICA = "Available capabilities:";

const ADHOC_DESCRIPTION_REPLICA =
  "Describe what you need in plain language and it matches your request against the registered built-ins, runs the chosen capability right here in this conversation, and reports the result - staying available for follow-ups until you exit.";

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

/** Replica of the settled gather-instruction opening (SOLE OWNER:
 * GATHER_INSTRUCTIONS in ./adhoc.ts) - the object-value idiom over the
 * request lane plus the positive closing. */
const GATHER_INSTRUCTION_REPLICA = `When the conversation has no context yet, open by asking how you can help, then ask targeted follow-up questions until you know what the user wants - use the ask_user tool for anything that is missing, including concrete input values, and stay at it until there is enough context. Never pull up the full list and ask what they want: the list below is reference material for matching, not a menu to hand over. Match the request against the capabilities and their declared inputs: if one capability obviously fits, tell the user which capability you will call, which inputs you will pass, and why - no choice to make; if several could fit, offer only the narrowed shortlist of candidates for the user to pick from; if nothing fits, say so plainly. When you are ready, define the variable '${DISPATCH_REQUEST_VAR}' with the setVar tool, passing the decision as an object value with the keys "name" (the capability name) and "inputs" (a plain object of string values; may be empty), and end your reply right after storing. If there is nothing to dispatch, store nothing and end your turn by asking the operator if there is anything else you can help them with. Don't do anything except what is said here - you are just gathering input.`;

function gatherBaselineReplica(): string {
  return [GATHER_INSTRUCTION_REPLICA, listingReplica()].join("\n\n");
}

/** Replica of the settled admission-failure trailer (SOLE OWNER:
 * REPORT_TRAILER in ./adhoc.ts - shared with the outcome report). */
const FAIL_REPORT_TRAILER_REPLICA =
  "State these facts plainly and briefly in your reply. Do not re-run or dispatch anything yourself, and do not ask the user anything. End your turn right after stating them.";

/** Replica of the admission-failure composer (SOLE OWNER:
 * renderAdmissionFailureInstructions in ./adhoc.ts) - the owner-directed
 * full-removal narrative: the refusal rides THE report, never a prompt. */
function failReportReplica(name: string, refusal: string): string {
  return [
    "Facts for the report:",
    `The gathered decision names '${name}' but the program side did not admit it: ${refusal}`,
    "No capability was run.",
    FAIL_REPORT_TRAILER_REPLICA,
  ].join("\n");
}

const DISCLOSURE_EMPTY_FORM_REPLICA = "Phase Permissions:\nNone";
const promptOf = (phaseId: string, instructions: string): string =>
  `${renderPhaseMarker(phaseId)}\n${instructions}\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;

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

const VIOLATION_TOPIC_REPLICA =
  "input 'topic' expects a non-empty string value";

const PIE_MESSAGE_REPLICA =
  "Phase interruption: the settling run ended on a user abort \u2014 the phase settles as cancelled";

const ENV_UNSET_REPLICA =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";

const CUSTOM_TYPE_REPLICA = "pio-capability";

const REQUEST_SPEC_LABEL_REPLICA = "dispatch decision";

/** Replica of the variable-guard corrective note (SOLE OWNER:
 * renderVariableRetryLine in ../capability/pio-session.ts). Em dash
 * U+2014 escaped. */
const varGuardNoteReplica = (runs: number, names: readonly string[]): string =>
  `\u2014\u2014 variable guard \u2014\u2014\nRequired variable(s) still missing after ${runs} run(s): ${names.join(", ")}. Define each listed variable with the setVar tool before you finish this run.`;

/** Replica of the ceiling violation line (SOLE OWNER:
 * renderMissingVariableLine in ../capability/pio-session.ts); N = 3 pinned
 * ceiling. Em dash U+2014 escaped. */
const varCeilingLineReplica = (phaseId: string, name: string): string =>
  `phase '${phaseId}' variable '${name}' missing \u2014 still undefined after 3 variable expectation re-run(s); the ceiling is exhausted`;

const setSuccessReplica = (name: string, value: unknown): string =>
  `variable '${name}' set to ${JSON.stringify(value)}.`;

/** Suite-mirrored plain-object predicate (SOLE owner: isPlainObject in
 * ./adhoc.ts). */
function suiteIsPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Suite-mirrored all-string entries predicate (SOLE owner:
 * areStringEntries in ./adhoc.ts). */
function suiteAreStringEntries(value: unknown): boolean {
  if (!suiteIsPlainObject(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

/** Suite-mirrored request schema (SOLE owner: REQUEST_SCHEMA in
 * ./adhoc.ts) - the authored messages are the contract, so the twin drive
 * composes the IDENTICAL issue bytes. */
const SUITE_REQUEST_SCHEMA = z
  .custom<Record<string, unknown>>(suiteIsPlainObject, {
    message: "the stored dispatch request is not a plain object",
  })
  .superRefine((decision, ctx) => {
    if (typeof decision.name !== "string" || decision.name.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "the stored dispatch request has no non-empty capability name",
      });
    }
    if (
      Object.hasOwn(decision, "inputs") &&
      !suiteAreStringEntries(decision.inputs)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["inputs"],
        message:
          "the stored dispatch request inputs must be a plain object of string values",
      });
    }
  });

const declareRequestTwin = (store: SessionVariableStore): void => {
  store.declare(DISPATCH_REQUEST_VAR, {
    label: REQUEST_SPEC_LABEL_REPLICA,
    schema: SUITE_REQUEST_SCHEMA,
  });
};

/** THE twin-store drive (identity-over-goldens over store-owned settlement
 * bytes): a FRESH store carrying the SAME declaration settles the SAME
 * value; when a prior value is seeded the defect write leaves it INTACT
 * (asserted on the twin), and the thrown family message IS the comparison
 * target for the driven mid-turn tool result - zero hand-built frame
 * copies. */
function twinDefectLine(opts: {
  name: string;
  declare: (store: SessionVariableStore) => void;
  prior?: unknown;
  value: unknown;
}): string {
  const twin = new SessionVariableStore();
  opts.declare(twin);
  if (opts.prior !== undefined) {
    twin.set(opts.name, opts.prior);
  }
  try {
    twin.set(opts.name, opts.value);
  } catch (error) {
    expect(error).toBeInstanceOf(VariableRejectionError);
    if (opts.prior !== undefined) {
      expect(twin.get(opts.name)).toStrictEqual(opts.prior);
    }
    return (error as Error).message;
  }
  throw new Error("adhoc-suite: expected the twin store to refuse");
}

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
  delete process.env.PI_CODING_AGENT_DIR; // start UNSET - rows opt in
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

/** ONE scripted pass that may drive a REAL setVar body over EITHER lane
 * (two-key input only - the retired claimed-type key is gone) and/or the
 * ask_user start/end pair. */
function scriptLanePass(
  handle: HandleLike,
  tools: Record<string, unknown> | undefined,
  varName: string | undefined,
  value: unknown,
  ask: boolean,
  results: DrivenSettlement[],
): void {
  handle.passes.push(async (): Promise<void> => {
    emitTo(handle, AGENT_START);
    if (tools !== undefined && varName !== undefined) {
      results.push(await driveVarEntry(tools.setVar, { name: varName, value }));
    }
    if (ask) {
      emitTo(handle, ASK_USER_START, ASK_USER_END);
    }
    emitTo(handle, AGENT_END);
  });
}
const scriptQuiet = (handle: HandleLike): void =>
  scriptLanePass(handle, undefined, undefined, undefined, false, []);
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
const DECISION_OBJECT = { name: "research", inputs: { topic: TOPIC } };

describe("lane arming (unseeded request lane)", () => {
  it("the request lane armed BEFORE the first gather on the REAL store: the spec displays its label, the stored value absent, NO confirm lane exists anywhere (full removal), and a driven sitting starts normally (valve-only row witnesses the live half)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    scriptValve(world.round.session);
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const declarations = world.instance.vars.declarations();
    expect(Object.keys(declarations)).toEqual([DISPATCH_REQUEST_VAR]);
    expect(declarations[DISPATCH_REQUEST_VAR]).toBe(REQUEST_SPEC_LABEL_REPLICA);
    expect(world.instance.vars.declarationDisplay(DISPATCH_REQUEST_VAR)).toBe(
      REQUEST_SPEC_LABEL_REPLICA,
    );
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(1);
    expect(sentText(prompts, 0)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("happy chain (R1 - binding leg, physics world)", () => {
  it("the full sitting: gather burst (listing + REAL object setVar + ask delta, settling the burst in its own run) -> admission passes in the main loop -> UNIFORM ROW-2 hop -> report with BASE-SETTLED absolute outputs -> deliberate lane window -> outer re-arm; exactly ONE span stamp across the whole sitting", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const results: DrivenSettlement[] = [];
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      results,
    );
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
    expect(prompts).toHaveLength(3);
    expect(prompts.every((record) => record.file === world.parentFile)).toBe(
      true,
    );
    expect(sdkKit.state.promptLog).toHaveLength(3); // zero child-file prompts
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 0)).toBe(baseline);
    const abs = expectedAbsolutePath(stubKit.STUB_TOKEN);
    expect(sentText(prompts, 1)).toContain(renderPhaseMarker("report"));
    expect(sentText(prompts, 1)).toContain(REPORT_SETTLED_LINE("research"));
    expect(sentText(prompts, 1)).toContain(
      `Outputs: ${JSON.stringify({ report: abs })}`,
    );
    expect(sentText(prompts, 2)).toBe(baseline);
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(results[0]?.content[0]?.text).toBe(
      setSuccessReplica(DISPATCH_REQUEST_VAR, DECISION_OBJECT),
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

describe("quiet-cycle shape (R2 - top world, ruled silent-round cost)", () => {
  it("each silent cycle costs EXACTLY four gather prompts (baseline + the three escalating guard notes naming the request lane) before the verdict is caught and the next cycle begins - two consecutive cycles + valve = 9 prompts; the lane absent throughout; no report prompts; no hop", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    for (let run = 0; run < 8; run += 1) {
      scriptQuiet(world.round.session); // two silent cycles x 4 passes
    }
    scriptValve(world.round.session); // row-end valve (cycle 3's prompt)
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(9);
    const baseline = promptOf("gather", gatherBaselineReplica());
    const cycleShapes = [
      baseline,
      `${baseline}\n${varGuardNoteReplica(1, [DISPATCH_REQUEST_VAR])}`,
      `${baseline}\n${varGuardNoteReplica(2, [DISPATCH_REQUEST_VAR])}`,
      `${baseline}\n${varGuardNoteReplica(3, [DISPATCH_REQUEST_VAR])}`,
    ];
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (let offset = 0; offset < 4; offset += 1) {
        expect(sentText(prompts, cycle * 4 + offset)).toBe(cycleShapes[offset]);
      }
    }
    expect(sentText(prompts, 8)).toBe(baseline);
    for (const record of prompts) {
      expect(record.text).not.toContain(renderPhaseMarker("confirm"));
      expect(record.text).not.toContain(renderPhaseMarker("report"));
    }
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(sdkKit.state.customMessages).toHaveLength(1);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("flow independence (R3 - physics world)", () => {
  it("a decision landing in a delta-0 burst run settles THAT run and dispatches (ONE reconciliation turn - the burst's own run count pinned); admission rides the main loop; assert only the sanctioned claims: request reaches the variable, burst dispatches, loop survives", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const results: DrivenSettlement[] = [];
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      false,
      results,
    );
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
      setSuccessReplica(DISPATCH_REQUEST_VAR, DECISION_OBJECT),
    );
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(3);
    expect(sentText(prompts, 0)).toContain(renderPhaseMarker("gather"));
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
    expect(stubKit.state.bag).toEqual({});
    expect(stubKit.state.inputs).toStrictEqual({ topic: TOPIC });
    const abs = expectedAbsolutePath(stubKit.STUB_TOKEN);
    expect(sentText(prompts, 1)).toContain(REPORT_SETTLED_LINE("research"));
    expect(sentText(prompts, 1)).toContain(
      `Outputs: ${JSON.stringify({ report: abs })}`,
    );
    expect(sentText(prompts, 2)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("store-on-retry (emergent property, top world)", () => {
  it("a silent first gather run re-enters WITH the escalation note and a model that stores the decision on the SECOND run settles the phase THERE (2 gather prompts, NO error, NO fact anywhere); admission + hop/dispatch/report legs ride the happy chain; total top prompts: 4", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    const results: DrivenSettlement[] = [];
    scriptQuiet(world.round.session); // gather run 1: silent
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      results,
    ); // gather run 2: stores and settles the burst
    scriptHappyHop(world, {
      childId: "child-retry",
      postHop: (parent): void => {
        scriptQuiet(parent); // report
        scriptValve(parent); // row-end valve (fresh gather burst)
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(4);
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 0)).toBe(baseline);
    expect(sentText(prompts, 1)).toBe(
      `${baseline}\n${varGuardNoteReplica(1, [DISPATCH_REQUEST_VAR])}`,
    );
    expect(sentText(prompts, 2)).toContain(REPORT_SETTLED_LINE("research"));
    expect(sentText(prompts, 3)).toBe(baseline);
    // NO teaching channel anywhere: the refusal narrative is gone with the
    // carried fact - the retry window is a reaction opportunity only.
    for (const record of prompts) {
      expect(record.text).not.toContain(REFUSAL_RECURSION_REPLICA);
      expect(record.text).not.toContain(VIOLATION_TOPIC_REPLICA);
      expect(record.text).not.toContain(capabilityRefusalLine("doesnotexist"));
    }
    expect(results[0]?.content[0]?.text).toBe(
      setSuccessReplica(DISPATCH_REQUEST_VAR, DECISION_OBJECT),
    );
    expect(stubKit.state.bag).toEqual({});
    expect(stubKit.state.inputs).toStrictEqual({ topic: TOPIC });
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("ESC mid-gather (R4 - top world)", () => {
  it("an aborted gather settling run throws PhaseInterruptionError OUT of the body's own phase, is caught around the sit, LEAVES THE LANE CLEAN (nothing was stored), and re-arms a fresh plain gather burst (prompts continue on the top handle; no hop)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    await recoverTools();
    scriptAbort(world.round.session); // the gather run settles ABORTED
    scriptValve(world.round.session); // fresh burst's prompt = row-end valve
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    expect(result.errors?.[0]?.type).not.toBe("PhaseInterruptionError");
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(2);
    expect(sentText(prompts, 1)).toBe(sentText(prompts, 0));
    expect(sentText(prompts, 1)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("ESC mid-hosted-run (R5 - physics world)", () => {
  it("a stub callee that settles ABORTED yields a child record BYTE-PINNED ok:false with the PhaseInterruptionError capture; the switch-back + top-frame rebind complete; the report phase carries the interruption facts INCLUDING fixture-seeded survivor paths (a directory passing existsSync included); the lane disarmed by the round-top clear; the loop is alive", async () => {
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
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      [],
    );
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
    expect(prompts).toHaveLength(3);
    expect(world.runtime.session.sessionId).toBe(sdkKit.PARENT_ID);
    expect(activeFrames()).toHaveLength(1);
    const reportText = sentText(prompts, 1);
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
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(sentText(prompts, 2)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(world.stop).toHaveBeenCalledTimes(0);
    expect(world.stderrSink).not.toHaveBeenCalled();
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
    expect(result).toStrictEqual(VALVE_RESULT);
  });
});

describe("admission failures settle as failure reports (owner-directed full removal)", () => {
  interface AdmissionCase {
    label: string;
    payload: unknown;
    name: string;
    fact: string;
  }
  const cases: AdmissionCase[] = [
    {
      label: "recursion (stored adhoc)",
      payload: { name: "adhoc", inputs: {} },
      name: "adhoc",
      fact: REFUSAL_RECURSION_REPLICA,
    },
    {
      label: "unknown name (loader miss VERBATIM)",
      payload: { name: "doesnotexist", inputs: {} },
      name: "doesnotexist",
      fact: `pio: capability 'doesnotexist' is not implemented yet`,
    },
    {
      label: "contract violation (collect-all lines VERBATIM)",
      payload: { name: "research", inputs: {} },
      name: "research",
      fact: VIOLATION_TOPIC_REPLICA,
    },
    {
      // Schema tolerance branch: the `inputs` KEY IS ABSENT (not just
      // empty) - the schema tolerates an absent inputs key (no inputs issue
      // fires mid-turn) and the decision still reaches the validator, whose
      // collect-all topic-violation rides THE report.
      label:
        "contract violation with ABSENT inputs key (schema tolerates absence: no inputs issue fires and the decision still reaches the validator)",
      payload: { name: "research" },
      name: "research",
      fact: VIOLATION_TOPIC_REPLICA,
    },
  ];
  for (const row of cases) {
    it(`${row.label}: NO teaching channel - the refused pick settles ONE gather burst, the FAILURE REPORT carries the EXACT narrative bytes, then the sit re-arms on the PLAIN baseline (three prompts; no hop; lane cleared)`, async () => {
      const root = newTempRoot();
      const world = await setupWorld({ root, env: "set" });
      const tools = await recoverTools();
      scriptLanePass(
        world.round.session,
        tools,
        DISPATCH_REQUEST_VAR,
        row.payload,
        true,
        [],
      ); // gather stores the refused pick and settles the burst
      scriptQuiet(world.round.session); // the failure report run
      scriptValve(world.round.session); // fresh burst's prompt = row-end valve
      const adhoc = new AdhocCapability({ session: world.instance });
      const result = await adhoc.run();
      expect(result).toStrictEqual(VALVE_RESULT);
      const prompts = topPrompts(world);
      expect(prompts).toHaveLength(3);
      const baseline = promptOf("gather", gatherBaselineReplica());
      expect(sentText(prompts, 0)).toBe(baseline);
      // THE owner-directed pin: the refusal rides THE report, byte-exact.
      expect(sentText(prompts, 1)).toContain(renderPhaseMarker("report"));
      expect(sentText(prompts, 1)).toBe(
        promptOf("report", failReportReplica(row.name, row.fact)),
      );
      if (row.label.startsWith("unknown")) {
        expect(row.fact).toBe(capabilityRefusalLine("doesnotexist"));
      }
      expect(sentText(prompts, 2)).toBe(baseline);
      expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
      expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
      expect(stubKit.state.bag).toEqual({});
      expect(stderrText()).toBe("");
      expect(stdoutText()).toBe("");
    });
  }
});

describe("mid-turn settlement (replaces the retired malformed-defect class)", () => {
  /** Shared assertion core over a defective REQUEST-lane write: the tool
   * result settles MID-TURN equal to the twin-store throw (identity over
   * goldens), the round then runs its silent-round physics into the caught
   * verdict, and the following burst is the PLAIN baseline with NO
   * refusal fact appended. */
  async function driveRequestDefectRow(
    label: string,
    value: unknown,
    prior: unknown | undefined,
  ): Promise<void> {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    const tools = await recoverTools();
    const results: DrivenSettlement[] = [];
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      value,
      true,
      results,
    );
    for (let run = 0; run < 3; run += 1) {
      scriptQuiet(world.round.session); // the silent tail (notes 1-3)
    }
    scriptValve(world.round.session); // the following plain burst
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const twinLine = twinDefectLine({
      name: DISPATCH_REQUEST_VAR,
      declare: declareRequestTwin,
      prior,
      value,
    });
    expect(results[0]?.content[0]?.text).toBe(twinLine);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(5);
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 0)).toBe(baseline);
    expect(sentText(prompts, 1)).toBe(
      `${baseline}\n${varGuardNoteReplica(1, [DISPATCH_REQUEST_VAR])}`,
    );
    expect(sentText(prompts, 2)).toBe(
      `${baseline}\n${varGuardNoteReplica(2, [DISPATCH_REQUEST_VAR])}`,
    );
    expect(sentText(prompts, 3)).toBe(
      `${baseline}\n${varGuardNoteReplica(3, [DISPATCH_REQUEST_VAR])}`,
    );
    // THE contrast pin: mid-turn settlements leave NO carried fact - the
    // following burst is the plain baseline byte-exact.
    expect(sentText(prompts, 4)).toBe(baseline);
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
    void label;
  }

  it("null onto the request lane (exemplar by ruling): the authored plain-object defect line settles MID-TURN equal to the twin-store throw; the prior value - a decision - reads back INTACT on the twin; the sitting continues into the silent tail and the following burst is PLAIN", async () => {
    await driveRequestDefectRow("null", null, DECISION_OBJECT);
  });

  it("an ARRAY value onto the request lane (non-plain-object class): the same mid-turn settlement shape; no prior was stored so absence stays the intact read", async () => {
    await driveRequestDefectRow("array", [1, 2], undefined);
  });

  it("a bad-name AND bad-inputs composite faults as ONE collect-all line ('; ' join, dot-prefixed paths in push order) - the collect-all-over-authored-issues witness", async () => {
    const composite = { name: "", inputs: { topic: 42 } };
    await driveRequestDefectRow("composite", composite, undefined);
    // Identity over goldens already bound the joined line via the twin;
    // the COMPOSITION witness pins the encounter order explicitly.
    const twinLine = twinDefectLine({
      name: DISPATCH_REQUEST_VAR,
      declare: declareRequestTwin,
      value: composite,
    });
    expect(twinLine).toBe(
      "Variable rejection: variable 'dispatch_request' does not satisfy its declared shape check \u2014 name: the stored dispatch request has no non-empty capability name; inputs: the stored dispatch request inputs must be a plain object of string values",
    );
  });

  it("bad-inputs alone (non-string input value): the inputs-path issue settles MID-TURN; the request name is valid so no name issue fires", async () => {
    await driveRequestDefectRow(
      "bad-inputs",
      { name: "research", inputs: { topic: 42 } },
      undefined,
    );
  });
});

// NOTE the retired answer-lane simple-type row: with the owner-directed full
// removal there is NO boolean answer lane left in adhoc - the engine-owned
// built-in-type reject mechanic stays covered by the var-tools/vars-demo suites.

// NOTE the retired confirm-era rows: with the owner-directed full removal
// there is NO answer lane left in adhoc - the engine-owned built-in-type
// reject mechanic stays covered by the var-tools/vars-demo suites, and the
// silent-confirm physics dies with the confirm phase itself.

describe("stale residue erasure (R10 - top world)", () => {
  it("a PRE-SEEDED valid decision left in the request lane neither dispatches nor reaches any prompt: the round-top clear erases it BEFORE the first burst (plain baseline, four silent-cycle shapes + valve = five prompts; no hop; the callee bag empty); the lane ends absent", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    // Program-side residue (identity surface): a PRIOR sitting's
    // declaration + stored pick left behind - seeded AFTER declaring the
    // lane (undeclared writes reject), BEFORE the running sitting owns it.
    // The re-declaration inside the running sitting settles as the
    // idempotent same-kind/same-display no-op.
    declareRequestTwin(world.instance.vars);
    world.instance.vars.set(DISPATCH_REQUEST_VAR, DECISION_OBJECT);
    for (let run = 0; run < 4; run += 1) {
      scriptQuiet(world.round.session); // silent cycle 1 (four prompts)
    }
    scriptValve(world.round.session); // row-end valve (silent cycle 2's first prompt)
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(5);
    const baseline = promptOf("gather", gatherBaselineReplica());
    expect(sentText(prompts, 0)).toBe(baseline);
    expect(sentText(prompts, 1)).toBe(
      `${baseline}\n${varGuardNoteReplica(1, [DISPATCH_REQUEST_VAR])}`,
    );
    expect(sentText(prompts, 2)).toBe(
      `${baseline}\n${varGuardNoteReplica(2, [DISPATCH_REQUEST_VAR])}`,
    );
    expect(sentText(prompts, 3)).toBe(
      `${baseline}\n${varGuardNoteReplica(3, [DISPATCH_REQUEST_VAR])}`,
    );
    expect(sentText(prompts, 4)).toBe(baseline);
    expect(world.runtime.switchSession).toHaveBeenCalledTimes(0);
    expect(stubKit.state.bag).toEqual({});
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("env defect (R11 - physics world)", () => {
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
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      [],
    );
    scriptHappyHop(world, {
      childId: "child-r11a",
      postHop: (parent): void => {
        scriptQuiet(parent);
        scriptValve(parent);
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 1);
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
    expect(result).toStrictEqual(VALVE_RESULT);
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
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      [],
    );
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
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 1);
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
    expect(result).toStrictEqual(VALVE_RESULT);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("result-variant coverage (physics world)", () => {
  it("a FAILED callee dispatch settles the sitting on the typed capture: the report carries the failed line WITH THE CAPTURE TYPE plus the message VERBATIM; the child record stands ok:false with the same capture; the lane disarmed; the loop stays alive; ZERO process-stream writes", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    stubKit.state.mode = "bare-error";
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      [],
    );
    scriptHappyHop(world, {
      childId: "child-r14",
      postHop: (parent): void => {
        scriptQuiet(parent);
        scriptValve(parent);
      },
    });
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 1);
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
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
    expect(sentText(prompts, 2)).toBe(
      promptOf("gather", gatherBaselineReplica()),
    );
    expect(result).toStrictEqual(VALVE_RESULT);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });

  it("an INTERRUPTED dispatch over a static-file-slot contract with NO surviving files names the absence explicitly (the survivor label does NOT appear; the explicit none-line does); the loop stays alive; ZERO process-stream writes", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set", physics: true });
    const tools = await recoverTools();
    stubKit.state.contract = stubKit.INTERRUPT_CONTRACT;
    stubKit.state.mode = "abort";
    scriptLanePass(
      world.round.session,
      tools,
      DISPATCH_REQUEST_VAR,
      DECISION_OBJECT,
      true,
      [],
    );
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
    const prompts = topPrompts(world);
    const reportText = sentText(prompts, 1);
    expect(reportText).toContain(INTERRUPT_CANCELLATION_LINE("research"));
    expect(reportText).toContain(INTERRUPT_NONE_LINE);
    expect(reportText).not.toContain(INTERRUPT_SURVIVORS_LABEL);
    expect(reportText).not.toContain(INTERRUPT_DEGRADED_REPLICA);
    expect(result).toStrictEqual(VALVE_RESULT);
    expect(stderrText()).toBe("");
    expect(stdoutText()).toBe("");
  });
});

describe("bound (R12 - top world)", () => {
  it("endless asking with nothing stored costs EXACTLY four gather prompts per silent cycle (thirty silent cycles x 4 prompts + valve = 121 prompts pinned by count and spot-checked shapes; the arithmetic pin is the point of the row)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    for (let run = 0; run < ADHOC_BURST_MAX_RUNS * 4; run += 1) {
      scriptQuiet(world.round.session); // thirty silent cycles
    }
    scriptValve(world.round.session); // the next cycle's prompt = valve
    const adhoc = new AdhocCapability({ session: world.instance });
    const result = await adhoc.run();
    expect(result).toStrictEqual(VALVE_RESULT);
    const prompts = topPrompts(world);
    expect(prompts).toHaveLength(ADHOC_BURST_MAX_RUNS * 4 + 1);
    const baseline = promptOf("gather", gatherBaselineReplica());
    const cycleShapes = [
      baseline,
      `${baseline}\n${varGuardNoteReplica(1, [DISPATCH_REQUEST_VAR])}`,
      `${baseline}\n${varGuardNoteReplica(2, [DISPATCH_REQUEST_VAR])}`,
      `${baseline}\n${varGuardNoteReplica(3, [DISPATCH_REQUEST_VAR])}`,
    ];
    expect(sentText(prompts, 0)).toBe(cycleShapes[0]);
    expect(sentText(prompts, 1)).toBe(cycleShapes[1]);
    expect(sentText(prompts, 2)).toBe(cycleShapes[2]);
    expect(sentText(prompts, 3)).toBe(cycleShapes[3]);
    expect(sentText(prompts, 4)).toBe(cycleShapes[0]);
    expect(sentText(prompts, (ADHOC_BURST_MAX_RUNS - 1) * 4)).toBe(
      cycleShapes[0],
    );
    expect(sentText(prompts, (ADHOC_BURST_MAX_RUNS - 1) * 4 + 1)).toBe(
      cycleShapes[1],
    );
    expect(sentText(prompts, (ADHOC_BURST_MAX_RUNS - 1) * 4 + 2)).toBe(
      cycleShapes[2],
    );
    expect(sentText(prompts, (ADHOC_BURST_MAX_RUNS - 1) * 4 + 3)).toBe(
      cycleShapes[3],
    );
    expect(sentText(prompts, ADHOC_BURST_MAX_RUNS * 4)).toBe(cycleShapes[0]);
    expect(world.instance.vars.get(DISPATCH_REQUEST_VAR)).toBeUndefined();
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

  it("runtime export surface is EXACTLY the five pinned names (types erase under erasable syntax; the retired sentinel AND the retired answer-lane variable are ABSENT)", async () => {
    const mod = await import("./adhoc.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "ADHOC_BURST_MAX_RUNS",
      "ADHOC_NAME",
      "DESCRIPTION",
      "DISPATCH_REQUEST_VAR",
      "default",
    ]);
  });

  it("the export cluster carries the pinned values (request lane variable, burst cap, name) and the DESCRIPTION is a PURE-ASCII single line", async () => {
    const mod = await import("./adhoc.ts");
    const description = mod.DESCRIPTION as unknown as string;
    expect(ADHOC_NAME).toBe("adhoc");
    expect(DISPATCH_REQUEST_VAR).toBe("dispatch_request");
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

  it("the import surface is EXACTLY the pinned dependency set with ZERO SDK specifier and the GAINED zod specifier (capability-layer doctrine: the module never reaches the SDK directly; layout stays formatter-canonical)", () => {
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
        "zod",
      ].sort(),
    );
  });

  it("threaded customTools names are EXACTLY the fenced bash + the variable trio (NO adhoc-specific tool anywhere - construction-floor row)", async () => {
    const root = newTempRoot();
    enterWorkTree(root, "set");
    await PioSession.create(process.cwd());
    await recoverTools(); // the name-sequence assertion lives in the helper
  });

  it("RETIREMENT GREP over the module source: ZERO occurrences of the retired symbols/phrases (the sentinel, the decoder, the defect union, the legacy line table, the invalid-JSON phrase - S04 - AND the confirm era: the answer-lane variable, its grammar, its composer - full removal)", () => {
    const needles = [
      "NO_DISPATCH_VALUE",
      "decodeDispatchRequest",
      "DecodeDefect",
      "MALFORMED_DEFECT_LINES",
      "not valid JSON",
      "DISPATCH_CONFIRM_VAR",
      "dispatch_confirm",
      "CONFIRM_GRAMMAR",
      "renderConfirmInstructions",
    ];
    for (const needle of needles) {
      expect(src.includes(needle)).toBe(false);
    }
  });

  it("VERDICT SIGNATURE over a bare host (engine seam witnessed end-to-end): a variables-only ceiling exhaustion over a freshly declared custom-typed variable listed in a minimal phase throws the DEDICATED class whose names field deep-equals the listed-absent lane and whose message composes the engine-owned line bytes with ZERO drift (swallow-nothing-else is the catch's code shape - no dedicated row)", async () => {
    const root = newTempRoot();
    const world = await setupWorld({ root, env: "set" });
    const PROBE_VAR = "probe_lane";
    world.instance.vars.declare(PROBE_VAR, {
      label: "probe shape",
      schema: SUITE_REQUEST_SCHEMA,
    });
    for (let run = 0; run < 4; run += 1) {
      scriptQuiet(world.round.session);
    }
    let thrown: unknown;
    // Direct execute_phase consults need an OPEN capability span for the
    // execution-state attach (mirrors the base-run window ownership).
    world.instance.enterCapability({
      name: "verdict-probe",
      writes: [],
      allowProjectWrites: false,
    });
    try {
      await world.instance.execute_phase("verdict-probe", {
        instructions: "Probe the verdict.",
        vars: [PROBE_VAR],
      });
    } catch (error) {
      thrown = error;
    } finally {
      world.instance.exitCapability();
    }
    expect(thrown).toBeInstanceOf(MissingVariableError);
    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as MissingVariableError).names).toEqual([PROBE_VAR]);
    const line = varCeilingLineReplica("verdict-probe", PROBE_VAR);
    expect((thrown as MissingVariableError).violations).toEqual([line]);
    expect((thrown as Error).message).toBe(`Contract violation: ${line}`);
    const prompts = topPrompts(world);
    const baseline = `\u2014\u2014 verdict-probe \u2014\u2014\nProbe the verdict.\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;
    expect(sentText(prompts, 0)).toBe(baseline);
    expect(sentText(prompts, 1)).toBe(
      `${baseline}\n${varGuardNoteReplica(1, [PROBE_VAR])}`,
    );
    expect(sentText(prompts, 2)).toBe(
      `${baseline}\n${varGuardNoteReplica(2, [PROBE_VAR])}`,
    );
    expect(sentText(prompts, 3)).toBe(
      `${baseline}\n${varGuardNoteReplica(3, [PROBE_VAR])}`,
    );
    expect(world.instance.vars.get(PROBE_VAR)).toBeUndefined();
  });
});
