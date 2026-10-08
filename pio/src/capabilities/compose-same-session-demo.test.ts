// Hermetic unit suite for the standing compose-same-session-demo capability.
// Self-contained island (sibling suites are self-contained — no cross-suite
// harness imports): ONE scripted-event top world in this file.
//
// SCRIPTED-EVENT TOP WORLD (research-suite idiom): a fake SDK root mocking
// exactly the eight faked value symbols drives PioSession.create(cwd) — fake
// manager/services/runtime/session with subscribe/prompt/getToolDefinition/
// sessionId/dispose plus the RECORDING sendCustomMessage mock (the
// session-present span stamps land on it); scripted prompt resolutions emit
// SYNTHETIC EVENTS ONLY (they observe, write NOTHING to disk); a single-turn
// settle pass = agent_start · agent_end [] (the bound-shape row commits paths
// through a write-settle variant instead). mkdtemp tmpdir roots with
// PI_CODING_AGENT_DIR pointed at <tmp>/.pi/agent (rows choose SET or
// UNSET/MALFORMED per their pin; saved/restored in afterEach) and
// process.chdir into <tmp>/work (restored). Every session-driven row mints
// EXACTLY ONE session handle through the SDK kit — the single-host
// invariant IS the row-1 proof: the composed callee rides the CALLER'S
// handle by reference, so no second mint ever happens.
//
// THE D1 PLACEMENT: the demo constructs the stubbed `research` WITH the
// caller's session instance BY REFERENCE, so the REAL base run()'s
// SESSION-PRESENT branch carries the scripted settlement in-process — the
// stub records the CONSTRUCTION BAG + received inputs (+ vars vantage
// points) and settles a scripted payload (success token / kill capture /
// bare error / empty-or-absent outputs variants). Its success mode executes
// ONE phase THROUGH the inherited handle (real base execute_phase →
// marker-lined prompt on the shared handle), and the REAL settle seam
// transforms the stub's SLOT-RELATIVE token to the bubble's absolute
// placement — expected settled values compute in-row through the same
// public channels (never a recomputed fingerprint or key). Fault values are
// MINTED LOCALLY (bare Error + assigned name + pinned message replica
// citing the owner): the captureError ladder keys off name + message for
// generic errors, so the forwarded captures stay observationally identical
// to the shipped classes without importing them.
//
// Doctrine (load-bearing): anti-bloat — ordering/placement pins ride PUBLIC
// EFFECTS (construction bags, the unified per-handle TIMELINE of prompt
// sends and recorded custom-message appends, prompt counts/text/order,
// stderr spies, env channels); no stage-position recorders over private
// internals. Replicated product literals carry a comment naming the SOLE
// OWNER. Mock scope is file-local: the loader/cli suites load the REAL
// research module and stay drift-free. NOTE the em dashes are U+2014 EM
// DASH characters — escaped so the pinned codepoints survive editor and
// toolkit glyph mangling; never normalize.

import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import StubResearch, { RESEARCH_MAX_RUNS } from "../capabilities/research.ts";
import type { CapabilityParams } from "../capability/base.ts";
import { deriveStateRootFromAgentDir } from "../capability/base.ts";
import type { CapabilityTable } from "../capability/loader.ts";
import { resolveCapability } from "../capability/loader.ts";
import {
  PioSession,
  renderCapabilityMarker,
  renderPhaseMarker,
} from "../capability/pio-session.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";
import ComposeSameSessionDemoCapability, {
  DEMO_TOPIC,
} from "./compose-same-session-demo.ts";

type Listener = (event: AgentSessionEvent) => void;

/** Stub behavior vocabulary (scripted settlements). */
type StubMode =
  | "success"
  | "bound-success"
  | "kill"
  | "bare-error"
  | "empty-report"
  | "missing-report";

/** One observed event on the shared handle, in ISSUE ORDER: a prompt send
 * or a recorded custom-message append (the interleaving the marker-order
 * pins ride). */
interface TimelineEntry {
  readonly kind: "prompt" | "custom";
  /** Prompt text (kind: "prompt"). */
  readonly text?: string;
  /** The recorded custom-message payload (kind: "custom"). */
  readonly payload?: unknown;
}

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
  /** Unified per-handle observation timeline (issue order). */
  timeline: TimelineEntry[];
  /** Scripted synthetic passes (one per scheduled prompt send). */
  passes: Array<() => Promise<void>>;
}

// ─── Scripted-event top world (fake SDK root) ──────────────────────────

const sdkKit = vi.hoisted(() => {
  const state: { rounds: Round[] } = { rounds: [] };
  const create = vi.fn((cwd: string) => ({
    getCwd: (): string => cwd,
  }));
  const getAgentDir = vi.fn((): string => "/agent/dir");
  const createAgentSessionServices = vi.fn(async () => ({
    marker: "fake-services",
  }));
  const createAgentSessionFromServices = vi.fn(async () => ({
    extensionsResult: {},
  }));
  const createAgentSessionRuntime = vi.fn(async () => {
    // Fresh fakes per invocation; every row of THIS suite mints at most ONE
    // such handle (the single-host invariant the row pins on).
    const captured: Listener[] = [];
    const timeline: TimelineEntry[] = [];
    const passes: Array<() => Promise<void>> = [];
    const subscribe = vi.fn((listener: Listener) => {
      captured.push(listener);
      return (): void => {};
    });
    const prompt = vi.fn(async (text: string): Promise<void> => {
      // Record FIRST: the issue moment precedes the scripted settlement.
      timeline.push({ kind: "prompt", text });
      const resolvePass = passes.shift();
      if (resolvePass !== undefined) {
        await resolvePass();
      }
    });
    // Defined-by-default lookups (the demo flow never consults tool
    // definitions — the preflight belongs to the real research module, not
    // the stub).
    const getToolDefinition = vi.fn((name: string) => ({
      name,
      description: "fake tool definition",
    }));
    // Recording mock for the no-turn custom-message seam (required harness
    // plumbing: session-present runs always stamp).
    const sendCustomMessage = vi.fn(async (payload: unknown): Promise<void> => {
      timeline.push({ kind: "custom", payload });
    });
    const session: FakeSession = {
      subscribe,
      prompt,
      getToolDefinition,
      sendCustomMessage,
      sessionId: "sess-fake-demo-01",
      dispose: vi.fn(),
    };
    const round: Round = {
      session,
      runtime: { session },
      captured,
      timeline,
      passes,
    };
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
  const reset = (): void => {
    state.rounds = [];
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
    state,
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

// ─── The stubbed research sibling (file-local mock) ─────────────────────

// Sole-owner payloads + the stub's scripted cell (reachable from both the
// hoisted factory and the suite body).
const stubKit = vi.hoisted(() => {
  /** The stub's frozen success token (owner: THIS suite). The child's real
   * fingerprint machinery is intentionally not exercised — the pin is
   * passthrough absolutization of whatever token crosses the await. */
  const STUB_REPORT_TOKEN = "research/9f8e7d6c5b4a.md";
  /** Replica of the shipped preflight thrown message (SOLE OWNER: the
   * preflightThrownMessage owner in capabilities/research.ts). */
  const BARE_ERROR_MESSAGE =
    "web tools unavailable: missing tool definitions for web_search, web_fetch (provisioning: isolated agent dir 'pi-native-search' local-source registration)";
  /** Replica of the pinned interruption message (SOLE OWNER: the
   * FRAME_KILL_MESSAGE constant + FrameKillError constructor in
   * ../capability/terminal-takeover.ts). Minted locally as a bare Error so
   * the capture stays observationally identical without importing the
   * shipping class. */
  const KILL_CAPTURE_REPLICA =
    "terminal-takeover: frame interrupted \u2014 the ordered shutdown pass terminated the process";
  /** The stub's scripted success-phase instructions (owner: THIS suite — a
   * placeholder standing for the real research loop's template). */
  const STUB_RESEARCH_INSTRUCTIONS =
    "Stubbed research phase (placeholder for the bounded web-research loop): one quiet settled run.";
  const state = {
    bag: undefined as unknown,
    inputs: undefined as Record<string, unknown> | undefined,
    mode: "success" as StubMode,
    /** The stub's OWN declared contract (introspected at construction — the
     * callee-isolation pin observes exactly this). */
    contract: undefined as unknown,
    /** The single store object reached from the CALLEE'S vantage point
     * (recorded inside its span). */
    varsRef: undefined as unknown,
    /** Caller-side seed read FROM the shared store during the callee's span. */
    seenCallerVar: undefined as unknown,
    /** The absolute path the bound-success stop rule observes per run (set
     * by the row; the observer plane only — nothing lands on disk). */
    boundReportPath: undefined as string | undefined,
  };
  const reset = (): void => {
    state.bag = undefined;
    state.inputs = undefined;
    state.mode = "success";
    state.contract = undefined;
    state.varsRef = undefined;
    state.seenCallerVar = undefined;
    state.boundReportPath = undefined;
  };
  return {
    STUB_REPORT_TOKEN,
    BARE_ERROR_MESSAGE,
    KILL_CAPTURE_REPLICA,
    STUB_RESEARCH_INSTRUCTIONS,
    state,
    reset,
  };
});

vi.mock("../capabilities/research.ts", async () => {
  const baseMod = await import("../capability/base.ts");
  // THE tunable referenced by the bound-shape row rides the REAL owner's
  // export (single-owner doctrine — never a duplicated literal).
  const actual = await vi.importActual<
    typeof import("../capabilities/research.ts")
  >("../capabilities/research.ts");
  const BOUND_MAX_RUNS = actual.RESEARCH_MAX_RUNS;
  // Pinned deep-copy of the shipped research contract literal (SOLE OWNER:
  // the contract field on ResearchCapability in
  // capabilities/research.ts).
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
      stubKit.state.contract = this.contract;
    }
    async call(
      inputs: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      stubKit.state.inputs = inputs;
      // Vars vantage points (AC#3 evidence): the shared store is reached
      // THROUGH the inherited handle's public surface — one object from
      // both sides.
      if (this.s !== undefined) {
        stubKit.state.varsRef = this.s.vars;
        stubKit.state.seenCallerVar = this.s.vars.get("caller-seeded");
        // W2C mechanical preamble (mandatory-type ruling): declare before
        // the first write; row intent unchanged.
        this.s.vars.declare("callee-written", "string");
        this.s.vars.set("callee-written", "from-callee-span");
      }
      switch (stubKit.state.mode) {
        case "kill": {
          const error = new Error(stubKit.KILL_CAPTURE_REPLICA);
          error.name = "FrameKillError";
          throw error;
        }
        case "bare-error": {
          const error = new Error(stubKit.BARE_ERROR_MESSAGE);
          error.name = "WebToolsMissingError";
          throw error;
        }
        case "empty-report":
          return { report: "" };
        case "missing-report":
          return {};
        case "bound-success": {
          // Bound shape over the REAL engine: every settling run COMMITS the
          // stub report path, so the stop rule demands continuation through
          // the ceiling — the phase exits BOUNDED (iterations === the cap)
          // and the settlement below carries the slot-relative token exactly
          // as the shipped capability would on a bound hit.
          const target = stubKit.state.boundReportPath ?? "";
          await this.execute_phase("research", {
            instructions: stubKit.STUB_RESEARCH_INSTRUCTIONS,
            min: 1,
            max: BOUND_MAX_RUNS,
            shouldStopLoop: (ctx) =>
              Promise.resolve(!ctx.filesWritten.includes(target)),
          });
          return { report: stubKit.STUB_REPORT_TOKEN };
        }
        default:
          // Success: ONE phase THROUGH the inherited handle (real base
          // execute_phase → marker-lined prompt on the shared handle).
          await this.execute_phase("research", {
            instructions: stubKit.STUB_RESEARCH_INSTRUCTIONS,
            min: 1,
            max: 1,
          });
          return { report: stubKit.STUB_REPORT_TOKEN };
      }
    }
  }
  return { default: StubResearch, RESEARCH_MAX_RUNS: BOUND_MAX_RUNS };
});

// ─── Sole-owner replicas (byte-pinned; \u2014 escaped identically) ─────

/** Pinned greeting template (SOLE OWNER: GREETING_INSTRUCTIONS in
 * ./compose-same-session-demo.ts). Em dashes are U+2014 (escaped). */
const GREETING_REPLICA = `You are starting a same-session research demonstration.
1. Greet the operator: say hello and briefly mention that a research run on a fixed topic is about to start in this same session.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** Pinned summary template (SOLE OWNER: the summaryInstructions owner in
 * ./compose-same-session-demo.ts — byte-unchanged from the temporary
 * sibling; its wording is placement-neutral). Em dashes are U+2014
 * (escaped). */
const summaryReplica = (reportPath: string): string =>
  `The research run has finished. Its full report is at:
${reportPath}
1. Read that file.
2. Distill the THREE most important findings from it \u2014 ranked by importance, grounded strictly in the report's content (nothing invented, no outside knowledge).
3. Present the three findings in your reply as a numbered list: one finding per line, one or two sentences each.
4. Do nothing else \u2014 no further tools, no questions, no writes. End your turn right after presenting the three findings.`;

/** THE pinned single fixed sentence behind the successful-but-empty
 * settlement (SOLE OWNER: EMPTY_REPORT_SETTLEMENT_MESSAGE in
 * ./compose-same-session-demo.ts — row-2 bytes with only the product
 * prefix renamed). Em dash U+2014 (escaped). */
const EMPTY_REPORT_REPLICA =
  "compose-same-session-demo: the research child settled successfully but its outputs carry no report to read \u2014 nothing to summarize";

/** Replicas of the pinned state-root escape messages (SOLE OWNER:
 * deriveStateRootFromAgentDir in ../capability/base.ts). */
const ENV_UNSET_REPLICA =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";
const envMalformedReplica = (value: string): string =>
  `capability: PI_CODING_AGENT_DIR is malformed ('${value}') \u2014 cannot derive the state root`;

/** The value-slot violation line for the callee (SOLE OWNER: the
 * validateInputs owner in ../capability/contract.ts; the
 * ContractViolationError default message composes it). */
const VIOLATION_LINE = "input 'topic' expects a non-empty string value";
const VIOLATION_MESSAGE = `Contract violation: ${VIOLATION_LINE}`;

/** The customType tag identifying pio capability markers (SOLE OWNER: the
 * module-private PIO_CAPABILITY_CUSTOM_TYPE in
 * ../capability/pio-session.ts). */
const CUSTOM_TYPE_REPLICA = "pio-capability";

/** The two recorded marker payloads (contents checked against the RENDERER
 * OWNER directly — reference, not reconstructed bytes). */
const demoMarkerPayload = (): unknown => ({
  customType: CUSTOM_TYPE_REPLICA,
  content: renderCapabilityMarker("compose-same-session-demo"),
  display: true,
  details: undefined,
});
const researchMarkerPayload = (): unknown => ({
  customType: CUSTOM_TYPE_REPLICA,
  content: renderCapabilityMarker("research"),
  display: true,
  details: undefined,
});

/** Engine-composed prompt texts (marker line + instructions, then the
 * trailing disclosure block - verbatim the phase engine's composition).
 * The worlds here ride the EMPTY-FORM block (the demo span and the stub's
 * dimension-less callee phase declare nothing and arm no flags - header
 * plus capital-N None line, re-typed locally per the suite's established
 * pattern). */
const DISCLOSURE_EMPTY_FORM_REPLICA = "Phase Permissions:\nNone";
const greetingPromptText = (): string =>
  `${renderPhaseMarker("greeting")}\n${GREETING_REPLICA}\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;
const researchPhasePromptText = (): string =>
  `${renderPhaseMarker("research")}\n${stubKit.STUB_RESEARCH_INSTRUCTIONS}\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;
const summaryPromptText = (absolutePath: string): string =>
  `${renderPhaseMarker("summary")}\n${summaryReplica(absolutePath)}\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;

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
    join(
      tmpdir(),
      `pio-compose-same-${String(++tempCursor).padStart(2, "0")}-`,
    ),
  );
  tempRoots.push(root);
  return root;
}

beforeEach(() => {
  stubKit.reset();
  sdkKit.reset();
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

// ─── Top-world helpers ──────────────────────────────────────────────────

/** Single documented cast seam for synthetic event payloads. */
const asEvent = (v: unknown): AgentSessionEvent => v as AgentSessionEvent;

function lastRound(): Round {
  const round = sdkKit.state.rounds[sdkKit.state.rounds.length - 1];
  if (!round) throw new Error("expected a construction round");
  return round;
}

/** Build the SINGLE host handle plus the construction round backing it. */
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

/** A settle that COMMITS the given absolute path to the observer plane
 * (and ONLY the observer plane — nothing lands on disk). */
function writeSettle(absolutePath: string, toolCallId: string): object[] {
  return [
    { type: "agent_start" },
    {
      type: "tool_execution_start",
      toolCallId,
      toolName: "write",
      args: { path: absolutePath },
    },
    { type: "tool_execution_end", toolCallId, isError: false },
    { type: "agent_end", messages: [], willRetry: false },
  ];
}

/** Queue one synthetic settlement per scheduled prompt send. */
function scriptRuns(round: Round, ...passes: object[][]): void {
  for (const pass of passes) {
    round.passes.push(async (): Promise<void> => {
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
  it("C1 loader admission (real pipeline over the shipped thunk): resolving 'compose-same-session-demo' resolves ok with ctor by REFERENCE identity and the contract by STRICT DEEP EQUALITY — the no-inputs identity (inputs: [] + writes: []) IS the pin", async () => {
    // The real resolution pipeline over the demo's own shipped module
    // (thunk → strict descent → throwaway construction → contract check);
    // default-table membership is the loader suite's pin territory, so this
    // suite stays registration-agnostic by driving the module's own thunk.
    const table: CapabilityTable = {
      "compose-same-session-demo": () =>
        import("./compose-same-session-demo.ts"),
    };
    const result = await resolveCapability("compose-same-session-demo", table);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal}`);
    expect(result.capability.ctor).toBe(ComposeSameSessionDemoCapability);
    expect(result.capability.contract).toStrictEqual({
      name: "compose-same-session-demo",
      version: "0.1.0",
      inputs: [],
      outputs: [{ name: "report" }],
      writes: [],
    });
  });

  it("C2 the full happy path: EXACTLY the expected sequence on the ONE shared handle IN ORDER (demo marker, greeting, research marker, callee phase prompt, summary), the settle seam ABSOLUTIZING the stub's slot-relative token (the summary text interpolates the settled value VERBATIM; expected value computed in-row via the SAME public channels), the child CONSTRUCTED WITH the caller's session BY REFERENCE (the bag deep-equals exactly { session }), run with EXACTLY DEMO_TOPIC, and ZERO demo-side filesystem writes", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    scriptRuns(round, quietSettle(), quietSettle(), quietSettle());
    const demo = new ComposeSameSessionDemoCapability({ session: instance });
    const result = await demo.run();
    // Settlement: ok:true with the SETTLED absolute value (the CALLEE'S own
    // base seam transformed the stub's slot-relative token in this bubble;
    // the demo's own VALUE slot passes it through untransformed) — the
    // Outcome returns INLINE at the await and the demo continued to its
    // remaining work (the summary).
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({
      report: expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
    });
    // THE unified timeline on the ONE shared handle: the demo's marker
    // STRICTLY BEFORE the greeting prompt, the research marker STRICTLY
    // BEFORE the first callee-phase prompt, the summary LAST with no further
    // marker (implicit span-return) — each stamped EXACTLY ONCE.
    expect(round.timeline).toEqual([
      { kind: "custom", payload: demoMarkerPayload() },
      { kind: "prompt", text: greetingPromptText() },
      { kind: "custom", payload: researchMarkerPayload() },
      { kind: "prompt", text: researchPhasePromptText() },
      {
        kind: "prompt",
        text: summaryPromptText(
          expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN),
        ),
      },
    ]);
    expect(round.session.prompt).toHaveBeenCalledTimes(3);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    // THE D1 placement: the construction bag deep-equals EXACTLY
    // { session } and bag.session IS the caller's own handle BY REFERENCE
    // (identity, not equality) — nothing else crosses the boundary.
    expect(stubKit.state.bag).toStrictEqual({ session: instance });
    expect((stubKit.state.bag as { session: PioSession }).session).toBe(
      instance,
    );
    // Inputs: the hard-coded topic flowed untransformed (imported-constant
    // reference — never a duplicated literal).
    expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
    // Single-host invariant (the row-1 proof): EXACTLY ONE session mint
    // through the SDK kit.
    expect(sdkKit.state.rounds).toHaveLength(1);
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
      label: "the locally-minted FrameKillError-shaped kill capture",
      mode: "kill",
      type: "FrameKillError",
      message: stubKit.KILL_CAPTURE_REPLICA,
    },
    {
      label: "a locally-minted WebToolsMissingError-shaped bare error",
      mode: "bare-error",
      type: "WebToolsMissingError",
      message: stubKit.BARE_ERROR_MESSAGE,
    },
  ];
  for (const variant of faultVariants) {
    it(`C3 child-fault (${variant.label}): the demo's run RESOLVES (never rejects) ok:false with the child's FIRST capture FORWARDED VERBATIM ({type, message} equal to the child's own entry — no types minted, no cause refinement re-branded) — stopping exactly where the stub's scripted pre-fault activity stops (EXACTLY ONE prompt: the greeting; the callee STAMPED its span once and ran no phase; the summary NEVER STARTS)`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      stubKit.state.mode = variant.mode;
      const { instance, round } = await host();
      round.passes.push(async (): Promise<void> => {
        emit(round, ...quietSettle());
        // Row-chosen UNSET AFTER the turn settles: failure results settle
        // untransformed - no conversion may even run behind the gate.
        delete process.env.PI_CODING_AGENT_DIR;
      });
      const demo = new ComposeSameSessionDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        { type: variant.type, message: variant.message },
      ]);
      // Stopping exactly where the stub's scripted pre-fault activity stops:
      // the greeting prompt, the callee's own span stamp, NO callee phase
      // prompt, NO summary prompt.
      expect(round.timeline).toEqual([
        { kind: "custom", payload: demoMarkerPayload() },
        { kind: "prompt", text: greetingPromptText() },
        { kind: "custom", payload: researchMarkerPayload() },
      ]);
      expect(round.session.prompt).toHaveBeenCalledTimes(1);
      expect(sentAt(round, 0)).toBe(greetingPromptText());
      expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
      // The child ran to completion before settling the fault: bag + inputs
      // recorded (D1 bag + untransformed topic).
      expect(stubKit.state.bag).toStrictEqual({ session: instance });
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      expect(sdkKit.state.rounds).toHaveLength(1);
      expect(stderrText()).toBe("");
    });
  }

  const malformedVariants: ReadonlyArray<{ label: string; mode: StubMode }> = [
    { label: "an EMPTY report token", mode: "empty-report" },
    { label: "an ABSENT outputs.report", mode: "missing-report" },
  ];
  for (const variant of malformedVariants) {
    it(`C4 malformed-success (${variant.label}): the demo's run RESOLVES ok:false with the PLAIN-Error fixed sentence (the one self-detected anomaly — no class minted, nothing to forward) — EXACTLY ONE prompt (greeting only; the summary skips), the callee stamped its span once and its settlement passed through UNTRANSFORMED`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      stubKit.state.mode = variant.mode;
      const { instance, round } = await host();
      round.passes.push(async (): Promise<void> => {
        emit(round, ...quietSettle());
        // Row-chosen UNSET AFTER the turn settles: the settlement seam
        // reads the channel at await time, never at prompt-compose time.
        delete process.env.PI_CODING_AGENT_DIR;
      });
      const demo = new ComposeSameSessionDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        { type: "Error", message: EMPTY_REPORT_REPLICA },
      ]);
      expect(round.timeline).toEqual([
        { kind: "custom", payload: demoMarkerPayload() },
        { kind: "prompt", text: greetingPromptText() },
        { kind: "custom", payload: researchMarkerPayload() },
      ]);
      expect(round.session.prompt).toHaveBeenCalledTimes(1);
      expect(sentAt(round, 0)).toBe(greetingPromptText());
      expect(stubKit.state.bag).toStrictEqual({ session: instance });
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      expect(sdkKit.state.rounds).toHaveLength(1);
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
    it(`C5 settle-time conversion fault (${variant.label}): the BASE's seam faults while settling the child's file-mode output (pinned CapabilityEnvError bytes) and the demo FORWARDS the child's capture VERBATIM — the child completed its span (stamp + ONE phase prompt), EXACTLY TWO prompts total (greeting + callee phase), NO summary turn`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      const { instance, round } = await host();
      round.passes.push(async (): Promise<void> => {
        emit(round, ...quietSettle());
      });
      round.passes.push(async (): Promise<void> => {
        emit(round, ...quietSettle());
        // Row-chosen DEFECT after the turn settles: the settle-time
        // conversion consults the channel at await time, never at
        // prompt-compose time.
        variant.prepare();
      });
      const demo = new ComposeSameSessionDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        { type: "CapabilityEnvError", message: variant.message },
      ]);
      // Success-gated: the conversion fault escaped AFTER the completed
      // child (stamp + phase) and BEFORE any summary turn; the forwarded
      // capture keeps the child's type + message unchanged.
      expect(round.timeline).toEqual([
        { kind: "custom", payload: demoMarkerPayload() },
        { kind: "prompt", text: greetingPromptText() },
        { kind: "custom", payload: researchMarkerPayload() },
        { kind: "prompt", text: researchPhasePromptText() },
      ]);
      expect(round.session.prompt).toHaveBeenCalledTimes(2);
      expect(sentAt(round, 0)).toBe(greetingPromptText());
      expect(sentAt(round, 1)).toBe(researchPhasePromptText());
      expect(stubKit.state.bag).toStrictEqual({ session: instance });
      expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
      expect(sdkKit.state.rounds).toHaveLength(1);
      expect(stderrText()).toBe("");
    });
  }

  it("C6 bound-shaped callee settlement: the stub's scripted activity ends after a FULL RESEARCH_MAX_RUNS-shape bound settlement (every settling run commits the stub report path — the phase exits AT the ceiling, prompts x max) and the demo STILL reaches summary + ok (the verbatim fault-forwarding gate keys ONLY on ok, so a bound-settled callee's ok:true + frozen token passes by construction)", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const absoluteReport = expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN);
    stubKit.state.mode = "bound-success";
    stubKit.state.boundReportPath = absoluteReport;
    const boundPasses: object[][] = [];
    for (let i = 1; i <= RESEARCH_MAX_RUNS; i++) {
      boundPasses.push(writeSettle(absoluteReport, `w${i}`));
    }
    scriptRuns(round, quietSettle(), ...boundPasses, quietSettle());
    const demo = new ComposeSameSessionDemoCapability({ session: instance });
    const result = await demo.run();
    // The inline Outcome RETURNS AT THE AWAIT with ok:true over the
    // BOUNDED callee settlement, and the demo continued to its remaining
    // work (the summary).
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({ report: absoluteReport });
    // Greeting + the callee's EXACTLY-AT-the-ceiling phase runs + summary.
    expect(round.session.prompt).toHaveBeenCalledTimes(RESEARCH_MAX_RUNS + 2);
    expect(round.timeline).toEqual([
      { kind: "custom", payload: demoMarkerPayload() },
      { kind: "prompt", text: greetingPromptText() },
      { kind: "custom", payload: researchMarkerPayload() },
      ...Array.from({ length: RESEARCH_MAX_RUNS }, () => ({
        kind: "prompt" as const,
        text: researchPhasePromptText(),
      })),
      {
        kind: "prompt",
        text: summaryPromptText(absoluteReport),
      },
    ]);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    // D1 placement holds for the bound shape too: the bag deep-equals
    // EXACTLY { session } BY REFERENCE and no second handle ever mints.
    expect(stubKit.state.bag).toStrictEqual({ session: instance });
    expect((stubKit.state.bag as { session: PioSession }).session).toBe(
      instance,
    );
    expect(stubKit.state.inputs).toStrictEqual({ topic: DEMO_TOPIC });
    expect(sdkKit.state.rounds).toHaveLength(1);
    // Zero demo-side writes anywhere under the owned tree (scripted events
    // observe only; nothing seeds or writes the report here).
    expect(readdirSync(tmp).sort()).toEqual(["work"]);
    expect(readdirSync(join(tmp, "work"))).toEqual([]);
    expect(stderrText()).toBe("");
  });
});

// ─── A rows: ticket acceptance evidence ─────────────────────────────────

describe("frame governance and resume (AC#2 evidence)", () => {
  it("A1 callee-isolation + structural-resume: the composed callee's frame is exactly ITS OWN contract (the stub carries the REAL research contract — not the demo's — and the bag carries NO caller-contract/scope keys), the demo's declared contract is UNCHANGED by the call, the post-call continuation runs under caller-only references (the summary prompt names ONLY the demo-owned template + the settled report value), and the marker channel attributes each segment to its OWNING capability in call order", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    scriptRuns(round, quietSettle(), quietSettle(), quietSettle());
    const demo = new ComposeSameSessionDemoCapability({ session: instance });
    const demoContractBefore = demo.contract;
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Callee isolation: the stub's frame is exactly its OWN contract — a
    // pinned deep-copy of the REAL research contract literal (SOLE OWNER:
    // the contract field on ResearchCapability in
    // capabilities/research.ts), NOT the demo's.
    expect(stubKit.state.contract).toStrictEqual({
      name: "research",
      version: "0.1.0",
      inputs: [{ name: "topic" }],
      outputs: [{ name: "report", paramKey: "report" }],
      writes: ["research/*.md"],
      allowProjectWrites: true,
    });
    expect(stubKit.state.contract).not.toStrictEqual(demo.contract);
    // No caller-contract/scope keys cross the boundary: the construction
    // bag is EXACTLY { session }.
    expect(stubKit.state.bag).toStrictEqual({ session: instance });
    // The demo's declared contract is unchanged by the call (same object,
    // same identity bytes).
    expect(demo.contract).toBe(demoContractBefore);
    expect(demo.contract).toStrictEqual({
      name: "compose-same-session-demo",
      version: "0.1.0",
      inputs: [],
      outputs: [{ name: "report" }],
      writes: [],
    });
    // Structural resume: the post-call continuation (the summary) executes
    // under caller-only references — its prompt, LAST on the timeline, names
    // only the demo-owned template with the SETTLED value interpolated (no
    // callee-owned bytes).
    const summaryIndex = round.timeline.findIndex(
      (entry) =>
        entry.kind === "prompt" &&
        entry.text ===
          summaryPromptText(expectedAbsolutePath(stubKit.STUB_REPORT_TOKEN)),
    );
    expect(summaryIndex).toBe(round.timeline.length - 1);
    expect(round.timeline[summaryIndex]?.kind).toBe("prompt");
    // The marker channel attributes each segment to its owning capability
    // IN CALL ORDER: the caller's span first, the callee's second — nothing
    // opens a third span after the callee's (implicit span-return, no
    // unstamp).
    const customPayloads = round.timeline
      .filter((entry) => entry.kind === "custom")
      .map((entry) => entry.payload);
    expect(customPayloads).toEqual([
      demoMarkerPayload(),
      researchMarkerPayload(),
    ]);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    expect(sdkKit.state.rounds).toHaveLength(1);
    expect(stderrText()).toBe("");
  });
});

describe("sharing (AC#3 evidence)", () => {
  it("A2 VAR-FREE store identity: under D1 (one instance ⇒ one store, one observer) the single instance's .vars store is ONE object reachable from BOTH vantage points — the caller-side seed is visible INSIDE the callee's span and the callee-side write is visible AFTER the run (no bridging/coercion/validation probed or added)", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    // W2C mechanical preamble (mandatory-type ruling): declare before the
    // first write; row intent unchanged.
    instance.vars.declare("caller-seeded", "string");
    instance.vars.set("caller-seeded", "visible-across-spans");
    scriptRuns(round, quietSettle(), quietSettle(), quietSettle());
    const demo = new ComposeSameSessionDemoCapability({ session: instance });
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // ONE store object from both vantage points (reference identity): the
    // callee reached the SAME instance's store through the inherited handle.
    expect(stubKit.state.varsRef).toBe(instance.vars);
    // Caller-side set visible INSIDE the callee's span.
    expect(stubKit.state.seenCallerVar).toBe("visible-across-spans");
    // Callee-side write visible AFTER the run, on the caller's instance.
    expect(instance.vars.get("callee-written")).toBe("from-callee-span");
    // The shared handle served both spans: exactly one mint.
    expect(sdkKit.state.rounds).toHaveLength(1);
    expect(stderrText()).toBe("");
  });
});

describe("pre-execution violation (AC#4 evidence)", () => {
  const badInputVariants: ReadonlyArray<{
    label: string;
    inputs: Record<string, unknown>;
  }> = [
    { label: "a MISSING topic key", inputs: {} },
    { label: "an EMPTY-string topic", inputs: { topic: "" } },
    { label: "a NON-string topic", inputs: { topic: 42 } },
  ];
  for (const variant of badInputVariants) {
    it(`A3 ${variant.label}: driving the CALLEE through its own run() RESOLVES ok:false with the typed ContractViolationError capture and ZERO side effects — the callee body NEVER ran (no stub phase prompt) and NO span stamp occurred (validation precedes the stamp site — a violating run stamps nothing; zero sendCustomMessage calls)`, async () => {
      const tmp = newTempRoot();
      enterWorkTree(tmp);
      const { instance, round } = await host();
      const child = new StubResearch({ session: instance });
      const result = await child.run(variant.inputs);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.errors).toStrictEqual([
        {
          type: "ContractViolationError",
          cause: "contract",
          message: VIOLATION_MESSAGE,
          violations: [VIOLATION_LINE],
        },
      ]);
      // Zero side effects: nothing prompted, nothing stamped (the timeline
      // is EMPTY — no body prompt, no stamp), zero stderr.
      expect(round.timeline).toEqual([]);
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(0);
      expect(stderrText()).toBe("");
      // Construction happened (the D1 bag); the body never ran.
      expect(stubKit.state.bag).toStrictEqual({ session: instance });
      expect(stubKit.state.inputs).toBeUndefined();
      expect(sdkKit.state.rounds).toHaveLength(1);
    });
  }
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
    new URL("./compose-same-session-demo.ts", import.meta.url),
    "utf8",
  );

  it("runtime export surface is EXACTLY ['DEMO_TOPIC', 'default'] (types erase under erasable syntax; no error class mints here — received failures forward verbatim) with the owner-bound topic value", async () => {
    const mod = await import("./compose-same-session-demo.ts");
    expect(Object.keys(mod).sort()).toEqual(["DEMO_TOPIC", "default"]);
    expect(mod.default).toBe(ComposeSameSessionDemoCapability);
    expect(DEMO_TOPIC).toBe("Gnosticism in Belgrade, Serbia");
  });

  it("the hard-coded topic literal occurs EXACTLY ONCE in the module source (the file-top constant's definition — every other reference rides the import)", () => {
    expect((src.match(/Gnosticism in Belgrade, Serbia/g) ?? []).length).toBe(1);
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

  it("the callee-edge DEFAULT import is EXACTLY one default-form clause bound to the co-shipping built-in module (outside the named-clause extractor above)", () => {
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

  it("zero occurrences of SIGINT / InteractiveMode / armKillCapture / parentSession / terminal-takeover (no terminal, lineage, or hop machinery in the same-session demo)", () => {
    for (const token of [
      "SIGINT",
      "InteractiveMode",
      "armKillCapture",
      "parentSession",
      "terminal-takeover",
    ]) {
      expect(src.includes(token)).toBe(false);
    }
  });

  it("the header marks PERMANENT with the sibling CONTRAST STATEMENT (names the temporary sibling module + its cutover removal + the single placement difference) and carries ZERO occurrences of the uppercase TEMPORARY substring (deletion-sweep safety)", () => {
    expect(src.includes("PERMANENT")).toBe(true);
    expect(src.includes("compose-new-session-demo")).toBe(true);
    expect(src.includes("bulk-migration cutover")).toBe(true);
    expect(src.includes("TEMPORARY")).toBe(false);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});

// ─── Suite source guards (the row-1 proof) ──────────────────────────────

describe("suite source guards (the row-1 proof)", () => {
  const suiteSrc = readFileSync(
    new URL("./compose-same-session-demo.test.ts", import.meta.url),
    "utf8",
  );

  it("ZERO physics-world identifiers over the suite's own source — every token is SPLIT across a concatenation so the guard's own listing cannot self-match (the row-1 proof is the single shared handle: no second handle mint, no swap scripting, no takeover environment installation)", () => {
    const NO_PHYSICS_WORLD = [
      "installFrame" + "Environment",
      "teardownFrame" + "Environment",
      "active" + "Frames",
      "switch" + "Session",
      "mintPhysics" + "Handle",
      "buildPhysics" + "World",
      "script" + "Switches",
    ];
    for (const token of NO_PHYSICS_WORLD) {
      expect(suiteSrc.includes(token)).toBe(false);
    }
  });

  it("the fake SDK root fakes EXACTLY the eight valued symbols (session-construction seams plus the Landlock-bash construction floor - any session-swap or second-handle seam would be foreign physics wiring intruding into the row-1 proof)", () => {
    const factoryMatch = suiteSrc.match(
      /vi\.mock\("@earendil-works\/pi-coding-agent", \(\) => \(\{[\s\S]*?\}\)\);/,
    );
    if (!factoryMatch) throw new Error("expected the SDK vi.mock factory");
    const keys = [...factoryMatch[0].matchAll(/^\s{2}([A-Za-z_$][\w$]*):/gm)]
      .map((match) => match[1])
      .sort();
    expect(keys).toEqual(
      [
        "createAgentSessionFromServices",
        "createAgentSessionRuntime",
        "createAgentSessionServices",
        "createBashToolDefinition",
        "createLocalBashOperations",
        "defineTool",
        "getAgentDir",
        "SessionManager",
      ].sort(),
    );
  });
});
