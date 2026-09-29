// Hermetic unit suite for the temporary compose-new-session-demo capability.
// Self-contained island (sibling suites are self-contained — no cross-suite
// harness imports): two cooperating worlds in one file.
//
// 1. SCRIPTED-EVENT TOP WORLD (research-suite idiom): a fake SDK root mocking
// exactly the five faked value symbols drives PioSession.create(cwd) — fake
// manager/services/runtime/session with subscribe/prompt/getToolDefinition/
// sessionId/dispose; scripted prompt resolutions emit SYNTHETIC EVENTS ONLY
// (they observe, write NOTHING to disk); a single-turn settle pass =
// agent_start · agent_end []. mkdtemp tmpdir roots with PI_CODING_AGENT_DIR
// pointed at <tmp>/.pi/agent (rows choose SET or UNSET per their pin;
// saved/restored in afterEach) and process.chdir into <tmp>/work (restored).
// The stub `research` rides vi.mock("../capabilities/research.ts"): a bona
// fide bundled subclass (extends the REAL base — the strict-descent reference
// chain stays intact) whose scripted call records the CONSTRUCTION BAG
// (params) + received inputs and settles a scripted payload (success token /
// kill capture / bare error / empty-or-absent outputs variants). In these
// rows the stub anchors the row's host in its placement slot so the REAL
// base run()'s IN-PROCESS branch carries the scripted settlement — the hop
// mechanics themselves belong to the physics world below. Because the stub
// extends the REAL base, its settle seam transforms the stub's SLOT-RELATIVE
// token in BOTH worlds; expected settled values compute in-row through the
// same public channels (never a recomputed fingerprint or key).
//
// 2. PHYSICS WORLD (takeover-suite idiom) for the routing rows: the REAL
// terminal-takeover module with installFrameEnvironment over a
// harness-minted top-frame PioSession; a fake SDK root whose switchSession
// applies the MEASURED teardown-then-apply order (dispose outgoing handle
// FIRST, then apply the FRESH zero-listener incoming handle ANCHORED AT THE
// SWAPPED PATH, replay NOTHING); deterministic platform-named file mint under
// the given scope dir (arg-recording; the child's file derives from its own
// scope top dir); functional per-listener unsubscribe with live-listener
// bookkeeping (dispose clears); a harness-minted SINGLE terminal-shaped
// recorder (the module never constructs or drives a terminal — stop counts
// observed, constructed-once pinned); every prompt issued through the shared
// runtime's CURRENT handle is LOGGED WITH THE HANDLE'S FILE (prompt intake
// routes to whichever handle the runtime currently holds — exactly what the
// routing rows assert on).
//
// Doctrine (load-bearing): anti-bloat — ordering/placement pins ride PUBLIC
// EFFECTS (construction bags, prompt counts/text/order, switch args,
// anchor-recorded transcript targets, ledger snapshots, scope-dir listings,
// record bytes/placement, counters, exit codes); no stage-position recorders
// over private internals. Replicated product literals carry a comment naming
// the SOLE OWNER. Mock scope is file-local: the loader/cli suites load the
// REAL research module and stay drift-free. NOTE the em dashes are U+2014 EM
// DASH characters — escaped so the pinned codepoints survive editor and
// toolkit glyph mangling; never normalize.

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
import type {
  AgentSessionEvent,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import type { CapabilityParams } from "../capability/base.ts";
import { deriveStateRootFromAgentDir } from "../capability/base.ts";
import type { CapabilityTable } from "../capability/loader.ts";
import { resolveCapability } from "../capability/loader.ts";
import { PioSession, renderPhaseMarker } from "../capability/pio-session.ts";
import {
  activeFrames,
  installFrameEnvironment,
  teardownFrameEnvironment,
} from "../capability/terminal-takeover.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";
import ComposeNewSessionDemoCapability, {
  DEMO_TOPIC,
} from "./compose-new-session-demo.ts";

type Listener = (event: AgentSessionEvent) => void;

/** Stub behavior vocabulary (scripted settlements). */
type StubMode =
  | "success"
  | "kill"
  | "bare-error"
  | "empty-report"
  | "missing-report";

// ─── Scripted-event top world (fake SDK root) ──────────────────────────

interface FakeSession {
  subscribe: ReturnType<typeof vi.fn>;
  /** One invocation stands for one fully-settled logical run. */
  prompt: ReturnType<typeof vi.fn>;
  getToolDefinition: ReturnType<typeof vi.fn>;
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

const sdkKit = vi.hoisted(() => {
  let mints = 0;
  const state: { rounds: Round[] } = { rounds: [] };
  // Unified manager fake: the top world reads getCwd() (session
  // construction), the physics-world hop mint reads getSessionFile()
  // (deterministic platform-named file UNDER THE GIVEN DIR — the filename
  // counter stands for the platform's own minted id; NO filesystem side
  // effects).
  const create = vi.fn((cwd: string, sessionDir?: string) => {
    const fileName = `20260101T000000Z_${String(++mints).padStart(8, "0")}.jsonl`;
    return {
      getCwd: (): string => cwd,
      getSessionFile: (): string | undefined =>
        sessionDir === undefined ? undefined : `${sessionDir}/${fileName}`,
    };
  });
  const getAgentDir = vi.fn((): string => "/agent/dir");
  const createAgentSessionServices = vi.fn(async () => ({
    marker: "fake-services",
  }));
  const createAgentSessionFromServices = vi.fn(async () => ({
    extensionsResult: {},
  }));
  const createAgentSessionRuntime = vi.fn(async () => {
    // Fresh fakes per invocation so isolation rows observe distinct handles.
    const captured: Listener[] = [];
    const subscribe = vi.fn((listener: Listener) => {
      captured.push(listener);
      return (): void => {};
    });
    const prompt = vi.fn(async (): Promise<void> => {});
    // Defined-by-default lookups (the demo flow never consults tool
    // definitions — the preflight belongs to the real child, not here).
    const getToolDefinition = vi.fn((name: string) => ({
      name,
      description: "fake tool definition",
    }));
    // Recording mock for the no-turn custom-message seam (the real base
    // run() stamps on it; never a turn trigger).
    const sendCustomMessage = vi.fn(async (): Promise<void> => {});
    const session: FakeSession = {
      subscribe,
      prompt,
      getToolDefinition,
      sendCustomMessage,
      sessionId: "sess-fake-demo-01",
      dispose: vi.fn(),
    };
    const round: Round = { session, runtime: { session }, captured };
    state.rounds.push(round);
    return round.runtime;
  });
  const reset = (): void => {
    mints = 0;
    state.rounds = [];
    create.mockClear();
    getAgentDir.mockClear();
    createAgentSessionServices.mockClear();
    createAgentSessionFromServices.mockClear();
    createAgentSessionRuntime.mockClear();
  };
  return {
    state,
    create,
    getAgentDir,
    createAgentSessionServices,
    createAgentSessionFromServices,
    createAgentSessionRuntime,
    reset,
  };
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: sdkKit.getAgentDir,
  SessionManager: { create: sdkKit.create },
  createAgentSessionServices: sdkKit.createAgentSessionServices,
  createAgentSessionFromServices: sdkKit.createAgentSessionFromServices,
  createAgentSessionRuntime: sdkKit.createAgentSessionRuntime,
}));

// ─── The stubbed research sibling (file-local mock) ─────────────────────

// Sole-owner payloads + the stub's scripted cell (reachable from both the
// hoisted factory and the suite body).
const stubKit = vi.hoisted(() => {
  /** The stub's frozen success token (owner: THIS suite). The child's real
   * fingerprint machinery is intentionally not exercised — the pin is
   * passthrough absolutization of whatever token crosses the await. */
  const STUB_REPORT_TOKEN = "research/9f8e7d6c5b4a.md";
  /** Replica of the shipped bare-error thrown message (SOLE OWNER: the
   * preflightThrownMessage owner in capabilities/research.ts). */
  const BARE_ERROR_MESSAGE = `web tools unavailable: missing tool definitions for web_search, web_fetch (provisioning: isolated agent dir 'pi-native-search' local-source registration)`;
  const state = {
    bag: undefined as unknown,
    inputs: undefined as Record<string, unknown> | undefined,
    mode: "success" as StubMode,
    park: undefined as (() => Promise<void>) | undefined,
    enteredNotify: undefined as (() => void) | undefined,
    anchor: undefined as unknown,
  };
  const reset = (): void => {
    state.bag = undefined;
    state.inputs = undefined;
    state.mode = "success";
    state.park = undefined;
    state.enteredNotify = undefined;
    state.anchor = undefined;
  };
  return { STUB_REPORT_TOKEN, BARE_ERROR_MESSAGE, state, reset };
});

vi.mock("../capabilities/research.ts", async () => {
  const baseMod = await import("../capability/base.ts");
  const takeoverMod = await import("../capability/terminal-takeover.ts");
  const researchContract = {
    name: "research",
    version: "0.1.0",
    inputs: [{ name: "topic" }],
    outputs: [{ name: "report", paramKey: "report" }],
    writes: ["research/*.md"],
    allowProjectWrites: true,
  };
  class StubResearch extends baseMod.PioCapability {
    readonly contract = researchContract;
    constructor(params: CapabilityParams) {
      super(params);
      stubKit.state.bag = params;
      // Anchor the row's host in the placement slot when a row supplies one
      // so the REAL base run()'s IN-PROCESS branch carries the scripted
      // settlement (hop mechanics belong to the physics-world rows; the bag
      // itself stays session-absent exactly as constructed). Cast seam: the
      // row stores a real PioSession instance.
      if (stubKit.state.anchor !== undefined) {
        this.s = stubKit.state.anchor as PioSession;
      }
    }
    async call(
      inputs: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      stubKit.state.inputs = inputs;
      stubKit.state.enteredNotify?.();
      if (stubKit.state.park !== undefined) {
        await stubKit.state.park();
      }
      switch (stubKit.state.mode) {
        case "kill":
          throw new takeoverMod.FrameKillError();
        case "bare-error": {
          const error = new Error(stubKit.BARE_ERROR_MESSAGE);
          error.name = "WebToolsMissingError";
          throw error;
        }
        case "empty-report":
          return { report: "" };
        case "missing-report":
          return {};
        default:
          return { report: stubKit.STUB_REPORT_TOKEN };
      }
    }
  }
  return { default: StubResearch };
});

// ─── Physics world (takeover-suite idiom) ───────────────────────────────

/** Prompt-intake observation: the text plus the FILE OF THE HANDLE that
 * received it (routes through whichever handle the runtime currently holds). */
interface PromptRecord {
  readonly text: string;
  readonly file: string | undefined;
}

interface PhysicsHandle {
  readonly sessionId: string;
  readonly sessionFile: string | undefined;
  /** Plain callable signature added: the default Mock type is not
   * callable through the interface. */
  readonly prompt: ReturnType<typeof vi.fn> & ((text: string) => Promise<void>);
  /** The no-turn capability-span stamp seam (recording arg-shape; plain
   * callable signature added for the same reason). */
  readonly sendCustomMessage: ReturnType<typeof vi.fn> &
    ((message: unknown) => Promise<void>);
  /** Mirrored platform subscribe: returns a FUNCTIONAL per-listener
   * unsubscribe (dist physics). */
  readonly subscribe: (listener: Listener) => () => void;
  /** Mirrored platform dispose: flips the marker + clears the live list. */
  readonly dispose: () => void;
  /** Every listener ever subscribed — append-only counting observability. */
  readonly captured: Listener[];
  /** Live listeners: subscribe adds; unsubscribe / mirrored dispose remove. */
  readonly live: Listener[];
  /** MUTABLE by design: the mirrored dispose flips it. */
  disposed: boolean;
}

function mintPhysicsHandle(
  sessionId: string,
  sessionFile: string | undefined,
  log: PromptRecord[],
): PhysicsHandle {
  const captured: Listener[] = [];
  const live: Listener[] = [];
  const handle: PhysicsHandle = {
    sessionId,
    sessionFile,
    prompt: vi.fn(async (text: string): Promise<void> => {
      log.push({ text, file: sessionFile });
    }),
    sendCustomMessage: vi.fn(async (_message: unknown): Promise<void> => {}),
    subscribe: (listener: Listener): (() => void) => {
      captured.push(listener);
      live.push(listener);
      return (): void => {
        const index = live.indexOf(listener);
        if (index !== -1) {
          live.splice(index, 1);
        }
      };
    },
    dispose: (): void => {
      handle.disposed = true;
      live.length = 0;
    },
    captured,
    live,
    disposed: false,
  };
  return handle;
}

interface TerminalRecorder {
  readonly constructions: number;
  /** Plain callable signature added: the default Mock type is not
   * callable through the interface. */
  readonly stop: ReturnType<typeof vi.fn> & (() => void);
}

interface PhysicsWorld {
  readonly cwd: string;
  readonly runtime: {
    readonly cwd: string;
    session: PhysicsHandle;
    /** Plain callable signature added: the default Mock type is not
     * callable through the interface. */
    switchSession: ReturnType<typeof vi.fn> &
      ((
        path: string,
        options?: { readonly cwdOverride?: string },
      ) => Promise<{ cancelled: boolean }>);
    dispose: ReturnType<typeof vi.fn> & (() => Promise<void>);
  };
  readonly parentHandle: PhysicsHandle;
  /** THE harness-minted SINGLE terminal recorder (world setup). */
  readonly terminal: TerminalRecorder;
  /** The holder-context stderr sink (rows pin zero calls). Plain callable
   * signature added: the default Mock type is not callable through the
   * interface. */
  readonly stderr: ReturnType<typeof vi.fn> & ((line: string) => void);
  /** Prompt-intake log (shared across every handle of this world). */
  readonly promptLog: PromptRecord[];
}

function buildPhysicsWorld(root: string, cwd: string): PhysicsWorld {
  const promptLog: PromptRecord[] = [];
  const parentHandle = mintPhysicsHandle(
    "sess-fake-0001",
    join(root, "top", "parent-transcript.jsonl"),
    promptLog,
  );
  const runtime: PhysicsWorld["runtime"] = {
    cwd,
    session: parentHandle,
    switchSession: vi.fn(
      async (
        _path: string,
        _options?: { cwdOverride?: string },
      ): Promise<{ cancelled: boolean }> => {
        // Placeholder physics — rows queue their own steps.
        return { cancelled: false };
      },
    ),
    dispose: vi.fn(async (): Promise<void> => {}),
  };
  return {
    cwd,
    runtime,
    parentHandle,
    terminal: { constructions: 1, stop: vi.fn((): void => {}) },
    stderr: vi.fn((): void => {}),
    promptLog,
  };
}

/** ONE scripted switchSession outcome (the physics applied by
 * scriptSwitches stand for the measured dist order). */
type SwapStep =
  | {
      kind: "swap";
      /** The REOPENED handle's sessionId (a fresh id for a switched-in
       * child; the RETAINED id for a switched-back parent — file-backed
       * identity). */
      sessionId: string;
      /** Scripted transcript persistence landing the JSONL file at the
       * scripted switch-in moment (stands for the platform's own
       * persistence; absent steps persist nothing). */
      persist?: (path: string) => void;
    }
  | { kind: "cancel" }
  | { kind: "reject"; message: string };

/** Queue scripted switch outcomes. Each "swap" applies the MEASURED
 * teardown-then-apply order: dispose the outgoing handle FIRST, apply the
 * FRESH zero-listener incoming handle anchored at the swapped path, replay
 * NOTHING. "cancel" performs no teardown (the current handle stays
 * current); "reject" escapes the RAW error unmasked. */
function scriptSwitches(world: PhysicsWorld, ...steps: SwapStep[]): void {
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
        const incoming = mintPhysicsHandle(
          step.sessionId,
          path,
          world.promptLog,
        );
        world.runtime.session = incoming;
        step.persist?.(path);
        return { cancelled: false };
      },
    );
  }
}

/** A row-openable pending gate: the parked body parks until the row opens
 * it (normal settlement channel — unlike the shutdown-pass rowGate whose
 * opened promise never resolves, the latch reject channel settles instead). */
function rowGate(): { readonly parked: Promise<void>; open(): void } {
  let openFn: (() => void) | undefined;
  return {
    parked: new Promise<void>((resolve) => {
      openFn = resolve;
    }),
    open: (): void => {
      openFn?.();
    },
  };
}

/** Cast seam presenting the physics world's runtime object under the SDK
 * type at the fromRuntime call site (mirrors the sibling suites' idiom). */
const asRuntime = (runtime: PhysicsWorld["runtime"]): AgentSessionRuntime =>
  runtime as unknown as AgentSessionRuntime;

/** THE composed-world top frame: REAL PioSession.fromRuntime over the
 * settled fake runtime, installed as the outermost ledger entry over the
 * row's tmpdir sessions root. */
function installTopFrame(world: PhysicsWorld, root: string): PioSession {
  const topFrame = PioSession.fromRuntime(asRuntime(world.runtime));
  installFrameEnvironment({
    sessionsRoot: root,
    topFrame,
    terminalStop: (): void => world.terminal.stop(),
    stderr: (line: string): void => world.stderr(line),
  });
  return topFrame;
}

/** Seed a transcript file (creates the slot dirs; the physics handles
 * themselves create none). */
function seedTranscript(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Recursive relative-path listing (sorted) — the audit-tree observation. */
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

// ─── Sole-owner replicas (byte-pinned; \u2014 escaped identically) ─────

/** Pinned greeting template (SOLE OWNER: GREETING_INSTRUCTIONS in
 * ./compose-new-session-demo.ts). Em dashes are U+2014 (escaped). */
const GREETING_REPLICA = `You are starting a research handoff demonstration.
1. Greet the operator: say hello and briefly mention that the terminal is about to be handed over to a research run on a fixed topic.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** Pinned summary template (SOLE OWNER: the summaryInstructions owner in
 * ./compose-new-session-demo.ts). Em dashes are U+2014 (escaped). */
const summaryReplica = (reportPath: string): string =>
  `The research run has finished. Its full report is at:
${reportPath}
1. Read that file.
2. Distill the THREE most important findings from it \u2014 ranked by importance, grounded strictly in the report's content (nothing invented, no outside knowledge).
3. Present the three findings in your reply as a numbered list: one finding per line, one or two sentences each.
4. Do nothing else \u2014 no further tools, no questions, no writes. End your turn right after presenting the three findings.`;

/** THE pinned single fixed sentence behind the successful-but-empty
 * settlement (SOLE OWNER: EMPTY_REPORT_SETTLEMENT_MESSAGE in
 * ./compose-new-session-demo.ts). Em dash U+2014 (escaped). */
const EMPTY_REPORT_REPLICA =
  "compose-new-session-demo: the research child settled successfully but its outputs carry no report to read \u2014 nothing to summarize";

/** Replica of the pinned interruption message (SOLE OWNER: the
 * FRAME_KILL_MESSAGE constant + FrameKillError constructor in
 * ../capability/terminal-takeover.ts). */
const FRAME_KILL_REPLICA =
  "terminal-takeover: frame interrupted \u2014 the ordered shutdown pass terminated the process";

/** Replicas of the pinned state-root escape messages (SOLE OWNER:
 * deriveStateRootFromAgentDir in ../capability/base.ts). */
const ENV_UNSET_REPLICA =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";
const envMalformedReplica = (value: string): string =>
  `capability: PI_CODING_AGENT_DIR is malformed ('${value}') \u2014 cannot derive the state root`;

/** Engine-composed prompt texts (marker line + instructions, verbatim the
 * phase engine's composition). */
const greetingPromptText = (): string =>
  `${renderPhaseMarker("greeting")}\n${GREETING_REPLICA}`;
const summaryPromptText = (absolutePath: string): string =>
  `${renderPhaseMarker("summary")}\n${summaryReplica(absolutePath)}`;

/** Self-consistent absolute-path derivation via the SAME public channels the
 * BASE SETTLE SEAM derives (expected settled value of the stub's
 * slot-relative token — never a recomputed fingerprint or key). */
function expectedAbsolutePath(token: string): string {
  return join(
    deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
    "projects",
    deriveProjectKey(process.cwd()),
    token,
  );
}

// ─── Shared lifecycle ───────────────────────────────────────────────────

let originalEnv: string | undefined;
let originalCwd: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;

const tempRoots: string[] = [];
let tempCursor = 0;

/** One row-owned tmpdir root; afterEach removes it recursively — FORCED
 * TEARDOWN: the removal runs even on assertion failure. */
function newTempRoot(): string {
  const root = mkdtempSync(
    join(tmpdir(), `pio-compose-${String(++tempCursor).padStart(2, "0")}-`),
  );
  tempRoots.push(root);
  return root;
}

beforeEach(() => {
  stubKit.reset();
  sdkKit.reset();
  teardownFrameEnvironment();
  originalEnv = process.env.PI_CODING_AGENT_DIR;
  delete process.env.PI_CODING_AGENT_DIR; // start UNSET — rows opt in
  originalCwd = process.cwd();
  stderrSpy = vi.spyOn(process.stderr, "write");
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalEnv !== undefined) {
    process.env.PI_CODING_AGENT_DIR = originalEnv;
  } else {
    delete process.env.PI_CODING_AGENT_DIR;
  }
  stderrSpy.mockRestore();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function stderrText(): string {
  return stderrSpy.mock.calls
    .map((call: readonly unknown[]) => String(call[0]))
    .join("");
}

// ─── Scripted-event top world helpers ───────────────────────────────────

/** Single documented cast seam for synthetic event payloads. */
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

function lastRound(): Round {
  const round = sdkKit.state.rounds[sdkKit.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

/** Build a host plus the construction round backing it. */
async function host(): Promise<{ instance: PioSession; round: Round }> {
  const instance = await PioSession.create(process.cwd());
  return { instance, round: lastRound() };
}

/** Drive synthetic events through the listener the host attached. */
function emit(round: Round, ...events: object[]): void {
  const listener = round.captured[0];
  if (!listener) throw new Error("expected an attached listener");
  for (const event of events) listener(asEvent(event));
}

/** One quiet settled run: a run start plus one empty agent_end payload. */
function quietSettle(): object[] {
  return [
    { type: "agent_start" },
    { type: "agent_end", messages: [], willRetry: false },
  ];
}

/** Queue one synthetic settlement per pass over the captured listener. */
function scriptRuns(round: Round, ...passes: object[][]): void {
  for (const pass of passes) {
    round.session.prompt.mockImplementationOnce(async (): Promise<void> => {
      emit(round, ...pass);
    });
  }
}

function sentAt(round: Round, index: number): string {
  const text = round.session.prompt.mock.calls[index]?.[0];
  return typeof text === "string" ? text : "";
}

/** Row-owned tmp work tree + the SET state-root channel (the renderer's
 * unconditional <root>/.pi/agent expression over this row's own tree). */
function enterWorkTree(tmp: string): void {
  const work = join(tmp, "work");
  mkdirSync(work, { recursive: true });
  process.chdir(work);
  process.env.PI_CODING_AGENT_DIR = join(tmp, ".pi", "agent");
}

// ─── C rows: admission / composition / summary / settlement ─────────────

describe("admission, composition, summary, settlement (C rows)", () => {
  it("C1 loader admission (real pipeline over the shipped thunk): resolving 'compose-new-session-demo' resolves ok with ctor by REFERENCE identity and the contract by STRICT DEEP EQUALITY — the no-inputs identity (inputs: [] + writes: []) IS the pin", async () => {
    // The real resolution pipeline over the demo's own shipped module
    // (thunk → strict descent → throwaway construction → contract check);
    // default-table membership is the loader suite's pin territory, so this
    // suite stays registration-agnostic by driving the module's own thunk.
    const table: CapabilityTable = {
      "compose-new-session-demo": () => import("./compose-new-session-demo.ts"),
    };
    const result = await resolveCapability("compose-new-session-demo", table);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal}`);
    expect(result.capability.ctor).toBe(ComposeNewSessionDemoCapability);
    expect(result.capability.contract).toStrictEqual({
      name: "compose-new-session-demo",
      version: "0.1.0",
      inputs: [],
      outputs: [{ name: "report" }],
      writes: [],
    });
  });

  it("C2 the full happy path: EXACTLY TWO settled turns on the demo's own session IN ORDER (greeting, then summary), the base settle seam ABSOLUTIZING the stub's slot-relative token (the summary text interpolates the settled value VERBATIM; expected value computed in-row via the SAME public channels), the child CONSTRUCTED session-absent and run with EXACTLY DEMO_TOPIC, and ZERO demo-side filesystem writes", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    stubKit.state.anchor = instance;
    scriptRuns(round, quietSettle(), quietSettle());
    const demo = new ComposeNewSessionDemoCapability({ session: instance });
    const result = await demo.run();
    // Settlement: ok:true with the SETTLED absolute value (the real base
    // seam transformed the stub's slot-relative token; the demo's own
    // VALUE slot passes it through untransformed).
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({
      report: expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
    });
    // Exactly two prompts IN ORDER: greeting, then summary (carrying the
    // ABSOLUTE report path interpolated verbatim from the settled value —
    // derived in-row through the same public channels).
    expect(round.session.prompt).toHaveBeenCalledTimes(2);
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    expect(sentAt(round, 1)).toBe(
      summaryPromptText(expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN)),
    );
    // Construction bag: session-absent (the row-2 trigger proven at the
    // construction site); inputs: the hard-coded topic flowed untransformed
    // (imported-constant reference — never a duplicated literal).
    expect(stubKit.state.bag).toStrictEqual({});
    expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
    // Zero demo-side writes anywhere under the owned tree (read-only
    // summary — the pin is the instructed path, not a real read).
    expect(readdirSync(tmp).sort()).toEqual(["work"]);
    expect(readdirSync(join(tmp, "work"))).toEqual([]);
    // No product lines on stderr.
    expect(stderrText()).toBe("");
  });

  const faultVariants: ReadonlyArray<{
    label: string;
    mode: StubMode;
    type: string;
    message: string;
  }> = [
    {
      label: "the FrameKillError kill capture",
      mode: "kill",
      type: "FrameKillError",
      message: FRAME_KILL_REPLICA,
    },
    {
      label: "a bare WebToolsMissingError-shaped error",
      mode: "bare-error",
      type: "WebToolsMissingError",
      message: stubKit.BARE_ERROR_MESSAGE,
    },
  ];
  for (const variant of faultVariants) {
    it(`C3 child-fault (${variant.label}): the demo's run RESOLVES (never rejects) ok:false with the child's FIRST capture FORWARDED VERBATIM ({type, message} equal to the child's own entry — no types minted, no cause refinement re-branded) — and EXACTLY ONE prompt occurred (the greeting — the summary turn NEVER STARTS)`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      delete process.env.PI_CODING_AGENT_DIR; // row-chosen UNSET: failure results settle untransformed — no conversion may even run behind the gate
      stubKit.state.mode = variant.mode;
      const { instance, round } = await host();
      stubKit.state.anchor = instance;
      scriptRuns(round, quietSettle());
      const demo = new ComposeNewSessionDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        { type: variant.type, message: variant.message },
      ]);
      // The summary turn never started: exactly one prompt (the greeting).
      expect(round.session.prompt).toHaveBeenCalledTimes(1);
      expect(sentAt(round, 0)).toBe(greetingPromptText());
      // The child ran to completion before settling the fault: bag + inputs
      // recorded.
      expect(stubKit.state.bag).toStrictEqual({});
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      expect(stderrText()).toBe("");
    });
  }

  const malformedVariants: ReadonlyArray<{ label: string; mode: StubMode }> = [
    { label: "an EMPTY report token", mode: "empty-report" },
    { label: "an ABSENT outputs.report", mode: "missing-report" },
  ];
  for (const variant of malformedVariants) {
    it(`C4 malformed-success (${variant.label}): the demo's run RESOLVES ok:false with the PLAIN-Error fixed sentence (the one self-detected anomaly — no class minted, nothing to forward) — and EXACTLY ONE prompt (greeting only; the summary skips)`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      delete process.env.PI_CODING_AGENT_DIR;
      stubKit.state.mode = variant.mode;
      const { instance, round } = await host();
      stubKit.state.anchor = instance;
      scriptRuns(round, quietSettle());
      const demo = new ComposeNewSessionDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        { type: "Error", message: EMPTY_REPORT_REPLICA },
      ]);
      expect(round.session.prompt).toHaveBeenCalledTimes(1);
      expect(sentAt(round, 0)).toBe(greetingPromptText());
      expect(stubKit.state.bag).toStrictEqual({});
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      expect(stderrText()).toBe("");
    });
  }

  const envDefectVariants: ReadonlyArray<{
    label: string;
    prepare: () => void;
    message: string;
  }> = [
    {
      label: "PI_CODING_AGENT_DIR unset",
      prepare: (): void => {
        delete process.env.PI_CODING_AGENT_DIR;
      },
      message: ENV_UNSET_REPLICA,
    },
    {
      label: "a MALFORMED (relative) PI_CODING_AGENT_DIR",
      prepare: (): void => {
        process.env.PI_CODING_AGENT_DIR = "rel/.pi/agent";
      },
      message: envMalformedReplica("rel/.pi/agent"),
    },
  ];
  for (const variant of envDefectVariants) {
    it(`C5 settle-time conversion fault (${variant.label}): the BASE's seam faults while settling the child's file-mode output (pinned CapabilityEnvError bytes) and the demo FORWARDS the child's capture VERBATIM — EXACTLY ONE prompt (greeting only), the child ran to completion, NO summary turn`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      variant.prepare();
      const { instance, round } = await host();
      stubKit.state.anchor = instance;
      scriptRuns(round, quietSettle());
      const demo = new ComposeNewSessionDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        { type: "CapabilityEnvError", message: variant.message },
      ]);
      // Success-gated: the conversion fault escaped AFTER the completed child
      // (bag + inputs recorded) and BEFORE any summary turn (one prompt);
      // the forwarded capture keeps the child's type + message unchanged.
      expect(round.session.prompt).toHaveBeenCalledTimes(1);
      expect(sentAt(round, 0)).toBe(greetingPromptText());
      expect(stubKit.state.bag).toStrictEqual({});
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      expect(stderrText()).toBe("");
    });
  }
});

// ─── R rows: input routing (physics world, the real takeover module) ────

describe("input routing (R rows — physics world)", () => {
  it("R1 child-window routing: while the child frame owns the terminal (pending body, depth-1 ledger snapshot), N prompts issued through the shared runtime's CURRENT handle persist EXCLUSIVELY into the CHILD scope's transcript file — ZERO into the parent/top file; after release + settlement the switch-back completes ([childFile, parentFile]) and the demo's OWN NEXT PROMPT (the SUMMARY TURN) anchors to the TOP-scope file, as does any further operator prompt (return-edge pin)", async () => {
    const root = newTempRoot();
    const world = buildPhysicsWorld(root, "/work/demo-r1");
    const parentFile = world.parentHandle.sessionFile as string;
    seedTranscript(parentFile, "<top seed>\n");
    const top = installTopFrame(world, root);
    process.env.PI_CODING_AGENT_DIR = join(root, ".pi", "agent");
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-r1",
        persist: (path: string): void => seedTranscript(path, "<child seed>\n"),
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const gate = rowGate();
    stubKit.state.park = (): Promise<void> => gate.parked;
    const entered = new Promise<void>((resolve) => {
      stubKit.state.enteredNotify = resolve;
    });
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((): boolean => true);
    try {
      const demo = new ComposeNewSessionDemoCapability({ session: top });
      const resultPromise = demo.run();
      // Sync into the window: the stub's call began ⇒ the switch-out landed
      // (the body runs strictly after the attach stage) ⇒ the child handle
      // is current; the greeting prompt predates it deterministically.
      await entered;
      // Ledger snapshot IN-WINDOW: the depth-1 child entry sits on top.
      const frames = activeFrames();
      expect(frames).toHaveLength(2);
      expect(frames[1].depth).toBe(1);
      expect(frames[1].capability).toEqual({
        name: "research",
        version: "0.1.0",
      });
      const childScopeDir = frames[1].scopeDir;
      const rawChildFile = frames[1].sessionFile();
      if (typeof rawChildFile !== "string") {
        throw new Error("expected a named child transcript");
      }
      const childFile = rawChildFile;
      expect(dirname(dirname(childFile))).toBe(childScopeDir);
      // The PRE-handover greeting anchored to the TOP file.
      expect(world.promptLog[0]).toEqual({
        text: greetingPromptText(),
        file: parentFile,
      });
      // Window: operator prompts — EVERY one persists exclusively into the
      // CHILD file; NONE reaches the top/parent file.
      await world.runtime.session.prompt("in-window keystroke 1");
      await world.runtime.session.prompt("in-window keystroke 2");
      const windowRecords = world.promptLog.slice(1);
      expect(windowRecords).toHaveLength(2);
      for (const record of windowRecords) {
        expect(record.file).toBe(childFile);
      }
      expect(windowRecords.some((record) => record.file === parentFile)).toBe(
        false,
      );
      // Release → the child settles normally → the switch-back restores the
      // top frame's ownership.
      gate.open();
      const result = await resultPromise;
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      // Settled value: the real base seam (inside the REAL hop body)
      // absolutized the stub's slot-relative token.
      expect(result.outputs).toStrictEqual({
        report: expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
      });
      // Switch args: out to the child, back to the CAPTURED parent file.
      expect(world.runtime.switchSession).toHaveBeenCalledTimes(2);
      const switchPaths = world.runtime.switchSession.mock.calls.map(
        (call) => call[0],
      ) as string[];
      expect(switchPaths).toEqual([childFile, parentFile]);
      expect(world.runtime.switchSession.mock.calls[0][1]).toEqual({
        cwdOverride: "/work/demo-r1",
      });
      // Post-return: the demo's OWN next prompt (the summary turn) anchors
      // to the TOP file (natural post-return probe), carrying the derived
      // absolute path.
      const tail = world.promptLog[world.promptLog.length - 1];
      expect(tail).toEqual({
        text: summaryPromptText(
          expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
        ),
        file: parentFile,
      });
      // Any FURTHER operator prompt also lands on the top file.
      await world.runtime.session.prompt("post-return keystroke");
      const last = world.promptLog[world.promptLog.length - 1];
      expect(last).toEqual({ text: "post-return keystroke", file: parentFile });
      // Construction bag + inputs through the REAL hop: session-absent at
      // the construction site, the hard-coded topic untransformed.
      expect(stubKit.state.bag).toStrictEqual({});
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      // THE sole SDK value reach fired exactly once, rooted at the child
      // top dir with the runtime's cwd.
      expect(sdkKit.create).toHaveBeenCalledTimes(1);
      expect(sdkKit.create.mock.calls[0]).toEqual([
        "/work/demo-r1",
        dirname(childFile),
      ]);
      // Ledger unwound to the installed top entry; the current handle is
      // the REOPENED parent (retained file-backed identity, NEW object).
      expect(activeFrames()).toHaveLength(1);
      expect(world.runtime.session.sessionId).toBe("sess-fake-0001");
      expect(world.runtime.session.sessionFile).toBe(parentFile);
      expect(world.runtime.session).not.toBe(world.parentHandle);
      expect(world.parentHandle.disposed).toBe(true);
      // Terminal discipline: constructed ONCE at world setup (zero
      // constructions by the module), stop called ZERO times.
      expect(world.terminal.constructions).toBe(1);
      expect(world.terminal.stop).toHaveBeenCalledTimes(0);
      expect(world.stderr).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("R2 full-cycle placement audit: the GREETING (pre-handover) and SUMMARY (post-return) prompts target the TOP-scope file and NOTHING targets the child file; after settle, each scope dir holds exactly its expected artifact set (child scope: record + child transcript; top scope: top transcript ONLY — the top status.json stays ABSENT: entry-owned emission is not exercised in capability-layer rows)", async () => {
    const root = newTempRoot();
    const world = buildPhysicsWorld(root, "/work/demo-r2");
    const parentFile = world.parentHandle.sessionFile as string;
    seedTranscript(parentFile, "<top seed>\n");
    const top = installTopFrame(world, root);
    process.env.PI_CODING_AGENT_DIR = join(root, ".pi", "agent");
    scriptSwitches(
      world,
      {
        kind: "swap",
        sessionId: "sess-child-r2",
        persist: (path: string): void => seedTranscript(path, "<child seed>\n"),
      },
      { kind: "swap", sessionId: "sess-fake-0001" },
    );
    const demo = new ComposeNewSessionDemoCapability({ session: top });
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Settled value: the base seam absolutized the stub's slot-relative
    // token (one payload served the child record AND this await).
    expect(result.outputs).toStrictEqual({
      report: expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
    });
    // Placement audit: exactly TWO demo-side prompts, BOTH on the top file
    // (pre-handover greeting + post-return summary); zero on the child.
    const childFile = world.runtime.switchSession.mock.calls[0]?.[0] as string;
    expect(world.promptLog).toEqual([
      { text: greetingPromptText(), file: parentFile },
      {
        text: summaryPromptText(
          expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
        ),
        file: parentFile,
      },
    ]);
    expect(world.promptLog.every((record) => record.file !== childFile)).toBe(
      true,
    );
    // Scope listings: the child scope dir is the sole non-top entry under
    // root; each scope holds exactly its expected artifact set.
    const childEntries = readdirSync(root)
      .filter((entry) => entry !== "top")
      .sort();
    expect(childEntries).toHaveLength(1);
    const childScopeDir = join(root, childEntries[0]);
    expect(readdirSync(join(childScopeDir, "top")).sort()).toEqual(
      [basename(childFile), "status.json"].sort(),
    );
    expect(readdirSync(join(root, "top"))).toEqual(["parent-transcript.jsonl"]);
    expect(existsSync(join(root, "top", "status.json"))).toBe(false);
    // THE full recursive audit tree: exactly THREE artifacts, nothing else.
    expect(recursiveListing(root)).toEqual(
      [
        `${childEntries[0]}/top/${basename(childFile)}`,
        `${childEntries[0]}/top/status.json`,
        "top/parent-transcript.jsonl",
      ].sort(),
    );
    // THE child record: stamped from the CHILD's own capability over its
    // scope dir, ok:true, the SETTLED absolute report value (the base seam
    // transformed the stub's slot-relative token inside the hop body —
    // single payload, both channels), the child transcript ref.
    const raw = readFileSync(join(childScopeDir, "top", "status.json"), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(raw.endsWith("\n")).toBe(true);
    expect(parsed.ok).toBe(true);
    expect(parsed.capability).toEqual({
      name: "research",
      version: "0.1.0",
      source: "builtin",
    });
    expect(parsed.outputs).toEqual({
      report: expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
    });
    expect(parsed.transcriptRef).toBe(
      `${childEntries[0]}/top/${basename(childFile)}`,
    );
    expect(world.stderr).not.toHaveBeenCalled();
  });
});

// ─── Module surface and mechanical source guards ────────────────────────

interface ClauseShape {
  readonly typeOnly: boolean;
  readonly names: string[];
  readonly specifier: string;
}

/** Extract the static import clauses (multi-line-safe; brace-clause form —
 * the module's canonical post-lint shape). */
function staticImportClauses(source: string): ClauseShape[] {
  const out: ClauseShape[] = [];
  const re =
    /^\s*import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["'];/gm;
  for (const match of source.matchAll(re)) {
    const names = match[2].match(/[A-Za-z_$][\w$]*/g) ?? [];
    out.push({
      typeOnly: match[1] !== undefined,
      names,
      specifier: match[3],
    });
  }
  return out;
}

describe("module surface and mechanical source guards", () => {
  const src = readFileSync(
    new URL("./compose-new-session-demo.ts", import.meta.url),
    "utf8",
  );

  it("runtime export surface is EXACTLY ['DEMO_TOPIC', 'default'] (types erase under erasable syntax; no error class mints here — received failures forward verbatim) with the owner-bound topic value", async () => {
    const mod = await import("./compose-new-session-demo.ts");
    expect(Object.keys(mod).sort()).toEqual(["DEMO_TOPIC", "default"]);
    expect(mod.default).toBe(ComposeNewSessionDemoCapability);
    expect(DEMO_TOPIC).toBe("Gnosticism in Barcelona");
  });

  it("the hard-coded topic literal occurs EXACTLY ONCE in the module source (the file-top constant's definition — every other reference rides the import)", () => {
    expect((src.match(/Gnosticism in Barcelona/g) ?? []).length).toBe(1);
  });

  it("named static VALUE clauses are EXACTLY {../capability/base.ts (PioCapability)} in canonical order — and TYPE clauses exactly {../capability/base.ts (CapabilityParams), ../capability/contract.ts (Contract)}", () => {
    const clauses = staticImportClauses(src);
    const valueClauses = clauses.filter((clause) => !clause.typeOnly);
    const typeClauses = clauses.filter((clause) => clause.typeOnly);
    expect(valueClauses).toEqual([
      {
        typeOnly: false,
        names: ["PioCapability"],
        specifier: "../capability/base.ts",
      },
    ]);
    expect(typeClauses).toEqual([
      {
        typeOnly: true,
        names: ["CapabilityParams"],
        specifier: "../capability/base.ts",
      },
      {
        typeOnly: true,
        names: ["Contract"],
        specifier: "../capability/contract.ts",
      },
    ]);
  });

  it("the callee-edge DEFAULT import is EXACTLY one default-form clause bound to the shipped sibling module (outside the named-clause extractor above)", () => {
    const defaults = [
      ...src.matchAll(
        /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];/gm,
      ),
    ];
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.[1]).toBe("ResearchCapability");
    expect(defaults[0]?.[2]).toBe("./research.ts");
  });

  it("ZERO dynamic-import occurrences (zero module-load graph growth — the loader owns the callee-edge thunk internally) and zero occurrences of the SDK specifier", () => {
    expect(src.includes("import(")).toBe(false);
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("ZERO process-member accesses (placement math lives at the base's settle seam — no env or cwd read survives in this module; zero process-stream writers too)", () => {
    const matches = src.match(/process\.\w+/g) ?? [];
    expect(matches).toEqual([]);
  });

  it("zero occurrences of SIGINT / InteractiveMode / armKillCapture / parentSession (no terminal or lineage machinery in the demo module)", () => {
    for (const token of [
      "SIGINT",
      "InteractiveMode",
      "armKillCapture",
      "parentSession",
    ]) {
      expect(src.includes(token)).toBe(false);
    }
  });

  it("the header carries the uppercase TEMPORARY marker AND the settled removal-schedule statement (both mechanically greppable)", () => {
    expect(src.includes("TEMPORARY")).toBe(true);
    expect(src.includes("REMOVED at the bulk-migration cutover")).toBe(true);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});
