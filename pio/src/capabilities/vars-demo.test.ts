// Hermetic unit suite for the PERMANENT vars-demo built-in. Self-contained
// island (sibling suites are self-contained - no cross-suite harness
// imports): ONE scripted-event top world in this file.
//
// SCRIPTED-EVENT TOP WORLD (compose-same-session-island idiom): a fake SDK
// root mocking exactly the EIGHT faked value symbols drives the REAL
// PioSession.create(cwd). The fake createAgentSessionRuntime STORES the
// construction factory instead of driving it; a row-explicit closure drive
// then hands back the recorded from-services arg, and the real customTools
// array (the fenced bash entry followed by the variable trio over the
// minted store) is recovered CAST-FREE off it. The fake session's
// prompt(text) records the text FIRST on the unified per-handle TIMELINE
// (issue order: prompt sends AND recorded sendCustomMessage appends) then
// resolves a SCRIPTED SETTLE PASS; synthetic events ride the attached
// listener only (quietSettle = agent_start + empty agent_end). Scripted
// passes drive the REAL trio bodies (real var-tools.ts over the real
// minted store) INSIDE the pass, between agent_start and agent_end - a
// write driven in pass N therefore "lands during run N" and is observed by
// the stop hook and the settlement gate immediately after that run settles.
// mkdtemp tmpdir roots with PI_CODING_AGENT_DIR pointed at <tmp>/.pi/agent
// (engine rows choose SET; the env-defect rows leave it UNSET/MALFORMED
// from the start; saved/restored per row) and process.chdir into <tmp>/work
// (restored). Every session-driven row mints EXACTLY ONE session handle
// through the SDK kit - the single-host invariant IS the row-1 proof: the
// composed callee rides the CALLER'S handle by reference, so no second
// mint ever happens.
//
// SEAM INVENTORY: exactly ONE marked cast seam - driveVarEntry presents ONE
// real threaded definition behind the widened five-argument execute view
// with an inert context argument (no body ever reads it); every other
// observation crosses a structural view or a parse boundary instead of an
// annotation. Replicated product literals carry a comment naming the SOLE
// OWNER (identity-over-goldens doctrine). Mock scope is file-local: the
// loader/cli suites load the REAL modules and stay drift-free. NOTE the em
// dashes inside replicated bytes are U+2014 EM DASH characters - escaped so
// the pinned codepoints survive editor and toolkit glyph mangling; the
// module under test carries NO raw U+2014 bytes at all (mechanical row).

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
import type { CapabilityTable } from "../capability/loader.ts";
import {
  capabilityRefusalLine,
  resolveCapability,
} from "../capability/loader.ts";
import {
  PioSession,
  renderCapabilityMarker,
  renderPhaseMarker,
} from "../capability/pio-session.ts";
import VarsDemoCapability, {
  CALLEE_NAME,
  CALLEE_NOTE_VALUE,
  CALLEE_NOTE_VAR,
  GATE_PROBE_VALUE,
  GATE_PROBE_VAR,
  MODEL_NOTE_VALUE,
  MODEL_NOTE_VAR,
  TS_FACTS_VALUE,
  TS_FACTS_VAR,
} from "./vars-demo.ts";

type Listener = (event: AgentSessionEvent) => void;

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

/** Structural fake of the services options shape (erased harness typing is
 * sanctioned): deliberately wider than the SDK type. */
interface ServicesOpts {
  cwd: string;
  agentDir?: string;
  resourceLoaderOptions?: {
    extensionFactories?: ReadonlyArray<(pi: object) => void | Promise<void>>;
  };
}

/** Suite-local structural view of the from-services options arg (wider-than-
 * SDK convention, established in the sibling island): rows read the
 * threaded custom-tools entries CAST-FREE off the recorded factory call. */
interface ThreadedToolView {
  name: string;
  execute: unknown;
  operations?: unknown;
}

interface FromServicesArg {
  services: unknown;
  sessionManager: unknown;
  sessionStartEvent: unknown;
  customTools?: ReadonlyArray<ThreadedToolView>;
}

// ─── Scripted-event top world (fake SDK root) ──────────────────────────

const sdkKit = vi.hoisted(() => {
  const state: {
    rounds: Round[];
    storedFactories: Array<(input: unknown) => Promise<unknown>>;
    managers: Array<{ getCwd: () => string }>;
    servicesArgs: ServicesOpts[];
    fromServicesArgs: FromServicesArg[];
  } = {
    rounds: [],
    storedFactories: [],
    managers: [],
    servicesArgs: [],
    fromServicesArgs: [],
  };
  const create = vi.fn((cwd: string) => {
    const manager = { getCwd: (): string => cwd };
    state.managers.push(manager);
    return manager;
  });
  const getAgentDir = vi.fn((): string => "/agent/dir");
  const createAgentSessionServices = vi.fn(async (options: ServicesOpts) => {
    state.servicesArgs.push(options);
    return { marker: "fake-services" };
  });
  const createAgentSessionFromServices = vi.fn(
    async (options: FromServicesArg) => {
      // Additive record: rows read the threaded customTools CAST-FREE off
      // the widened view; the stamp carrier stays minimal (the real seam
      // stamps it; no row touches the carrier thereafter).
      state.fromServicesArgs.push(options);
      return { extensionsResult: {}, session: {} };
    },
  );
  const createAgentSessionRuntime = vi.fn(
    async (factory?: (input: unknown) => Promise<unknown>) => {
      if (factory !== undefined) state.storedFactories.push(factory);
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
      // Recording mock for the no-turn custom-message seam (required harness
      // plumbing: session-present runs always stamp).
      const sendCustomMessage = vi.fn(
        async (payload: unknown): Promise<void> => {
          timeline.push({ kind: "custom", payload });
        },
      );
      const session: FakeSession = {
        subscribe,
        prompt,
        sendCustomMessage,
        sessionId: "sess-fake-vars-01",
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
    },
  );
  // Construction floor for the unconditional customTools threading: the
  // real PioSession.create builds the Landlock-bash instance eagerly at the
  // construction seam; these fakes absorb the construction-time SDK value
  // reaches (this island drives ONLY the variable trio; the bare static
  // shape suffices here, as in the sibling island).
  const createBashToolDefinition = vi.fn(
    (_cwd: string, options: { operations: unknown }) => ({
      name: "bash",
      operations: options.operations,
    }),
  );
  const defineTool = vi.fn((tool: unknown) => tool);
  const createLocalBashOperations = vi.fn(() => ({}));
  const reset = (): void => {
    state.rounds = [];
    state.storedFactories = [];
    state.managers = [];
    state.servicesArgs = [];
    state.fromServicesArgs = [];
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

// ─── Sole-owner replicas (byte-pinned; \u2014 escaped identically) ─────

/** Pinned greeting template (SOLE OWNER: GREETING_INSTRUCTIONS in
 * ./vars-demo.ts). Em dashes are U+2014 (escaped). */
const GREETING_REPLICA = `You are starting a session-variable demonstration.
1. Greet the operator: say hello and briefly mention that the run ahead exhibits session variables set from BOTH sides - the model defining a note that TypeScript code reads mid-run and the program defining facts the model reads back on a following turn - together with a deliberately-triggered variable expectation-guard retry and a composed callee that shares this one variable store.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** Pinned model-write template (SOLE OWNER: the modelWriteInstructions owner
 * in ./vars-demo.ts - three beats ending in the sibling's verbatim verdict
 * beat; no em dash occurs in the body). */
const modelWriteReplica = (): string =>
  `Use the setVar tool to define ${MODEL_NOTE_VAR} with the EXACT value: ${MODEL_NOTE_VALUE}. The expectation is that the value LANDS as stored - the store round-trips the exact value the entry point admitted. Describe in one sentence if it's satisfied. End your turn right after (no further tools).`;

/** Pinned guard-retry template (SOLE OWNER: the guardRetryInstructions owner
 * in ./vars-demo.ts - ONE static text, two passes; the ruling-honored hybrid
 * keeps the RULES skeleton byte-stable and inserts the standalone unnumbered
 * verdict-OUTPUT directive between rule 2 and the autonomy line). Em dashes
 * are U+2014 (escaped). */
const guardRetryReplica = (): string =>
  `This run demonstrates the variable expectation guard over ${GATE_PROBE_VAR}.
Rules for THIS run:
1. FIRST PASS \u2014 no corrective note appears below these instructions: draft the intended ${GATE_PROBE_VAR} content in your reply ONLY and finish the run WITHOUT any setVar call touching ${GATE_PROBE_VAR}.
2. CORRECTIVE PASS \u2014 a corrective note naming ${GATE_PROBE_VAR} IS present below these instructions: define ${GATE_PROBE_VAR} with the setVar tool using the EXACT value: ${GATE_PROBE_VALUE}.
In EVERY pass, close your reply with the expectation-satisfaction verdict the other probes carry. Describe in one sentence if it's satisfied.
Work autonomously; do not ask the user anything during the run.`;

/** Pinned read-back template (SOLE OWNER: the readBackInstructions owner in
 * ./vars-demo.ts - three beats ending in the sibling's verbatim verdict
 * beat; no em dash occurs in the body). */
const readBackReplica = (): string =>
  `Use the getVar tool to read ${TS_FACTS_VAR} and ${MODEL_NOTE_VAR}, and state both renderings in your reply, one line each, quoting them exactly. The expectation is that the seeded array renders as COMPACT JSON and the model-authored string renders BARE - cross-origin parity, one store, any origin. Describe in one sentence if it's satisfied. End your turn right after (listVars is available but not required).`;

/** Pinned summary template (SOLE OWNER: the summaryInstructions owner in
 * ./vars-demo.ts - variants A/B keyed ONLY on the observed iteration count).
 * Em dashes are U+2014 (escaped). */
const summaryReplica = (
  iterations: number,
  observedNote: string,
  calleeNote: string,
): string => {
  const outcome =
    iterations >= 2
      ? `The variable demonstration finished with the guard-retry phase settling after ${iterations} runs: the variable expectation guard DENIED first-pass settlement \u2014 the declared variable was still undefined \u2014 and FORCED the corrective re-run, which defined it (${GATE_PROBE_VALUE}).`
      : `The variable demonstration finished with the guard-retry phase settling after 1 run: the variable guard's loop was ARMED but NOT triggered \u2014 the model defined the guarded variable on the very first pass despite the skip directive.`;
  return `${outcome}
1. Quote the value the TypeScript hook OBSERVED MID-RUN from ${MODEL_NOTE_VAR}: "${observedNote}" (read between the settled runs, not after them - the timing evidence that the model's setVar landed while the program was still running).
2. Quote the value read back AFTER the composition through the typed-read surface from ${CALLEE_NOTE_VAR}: "${calleeNote}" (defined by the composed callee inside its own turns - the store shared by instance identity).
3. State the documented row-2 property: the terminal-handoff placement mints DISJOINT variable stores for its composed children, so nothing crosses that boundary (documented property, stated - nothing is acted out).
4. Do nothing else \u2014 no further tools, no questions. End your turn right after that statement.`;
};

/** Pinned compose-read template (SOLE OWNER: the composeReadInstructions
 * owner in ./vars-demo.ts - three beats ending in the sibling's verbatim
 * verdict beat; no em dash occurs in the body). */
const composeReadReplica = (): string =>
  `Use the getVar tool to read ${MODEL_NOTE_VAR} and state its EXACT rendering in your reply. The expectation is that it renders the exact value authored earlier in this same session - the store is shared by instance identity. Describe in one sentence if it's satisfied. End your turn right after (no other tools).`;

/** Pinned compose-write template (SOLE OWNER: the composeWriteInstructions
 * owner in ./vars-demo.ts - three beats ending in the sibling's verbatim
 * verdict beat; no em dash occurs in the body). */
const composeWriteReplica = (): string =>
  `Use the setVar tool to define ${CALLEE_NOTE_VAR} with the EXACT value: ${CALLEE_NOTE_VALUE}. The expectation is that the value LANDS as stored in the shared store the caller reads back after the composition. Describe in one sentence if it's satisfied. End your turn right after (no other tools).`;

/** Sibling verdict-phrase replica (SOLE OWNER: the guards-demo probe
 * template family in ./guards-demo.ts - reused VERBATIM per the settled
 * ruling). Holds exactly the one-sentence verdict beat the re-pinned probe
 * templates close with. */
const VERDICT_PHRASE_REPLICA = "Describe in one sentence if it's satisfied.";

/** Pinned guard-retry numbered-rule fragments (SOLE OWNER: the
 * guardRetryInstructions owner in ./vars-demo.ts - the two-pass RULES
 * skeleton survives the repin BYTE-IDENTICALLY at these positions). Em
 * dashes are U+2014 (escaped). */
const GUARD_RULE_1 = `1. FIRST PASS \u2014 no corrective note appears below these instructions: draft the intended ${GATE_PROBE_VAR} content in your reply ONLY and finish the run WITHOUT any setVar call touching ${GATE_PROBE_VAR}.`;
const GUARD_RULE_2 = `2. CORRECTIVE PASS \u2014 a corrective note naming ${GATE_PROBE_VAR} IS present below these instructions: define ${GATE_PROBE_VAR} with the setVar tool using the EXACT value: ${GATE_PROBE_VALUE}.`;

/** Replica of the variable-gate corrective block (SOLE OWNER:
 * renderVariableRetryLine in ../capability/pio-session.ts). Two lines joined
 * by a single LF; no trailing newline. Em dashes are U+2014 (escaped). */
const varGuardBlock = (runs: number, names: readonly string[]): string =>
  `\u2014\u2014 variable guard \u2014\u2014\nRequired variable(s) still missing after ${runs} run(s): ${names.join(", ")}. Define each listed variable with the setVar tool before you finish this run.`;

/** Replica of the output-guard delimiter line (SOLE OWNER: the
 * renderExpectationRetryLine owner in ../capability/pio-session.ts) - used
 * NEGATIVELY (single-face degradation: the demo declares no file
 * expectations, so no output-guard byte may appear anywhere). */
const OUTPUT_GUARD_LABEL = "\u2014\u2014 output guard \u2014\u2014";

/** Replica of the ceiling violation line for the callee's write phase (SOLE
 * OWNER: renderMissingVariableLine in ../capability/pio-session.ts). The 3
 * embeds the mirrored cap constant. Em dash U+2014 (escaped). */
const CEILING_LINE = `phase 'compose-write' variable '${CALLEE_NOTE_VAR}' missing \u2014 still undefined after 3 variable expectation re-run(s); the ceiling is exhausted`;

/** Replica of the family default-message composer over that line (SOLE
 * OWNER: the ContractViolationError constructor in ../capability/errors.ts). */
const CEILING_MESSAGE = `Contract violation: ${CEILING_LINE}`;

/** Replicas of the pinned state-root escape messages (SOLE OWNER:
 * deriveStateRootFromAgentDir in ../capability/base.ts). Em dashes are
 * U+2014 (escaped). */
const ENV_UNSET_REPLICA =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";
const envMalformedReplica = (value: string): string =>
  `capability: PI_CODING_AGENT_DIR is malformed ('${value}') \u2014 cannot derive the state root`;

/** Replicated miss-line literal (SOLE OWNER: capabilityRefusalLine in
 * ../capability/loader.ts - imported alongside for the cross-check). */
const CALLEE_MISS_LINE =
  "pio: capability 'vars-demo-callee' is not implemented yet";

/** Trio result renderings (SOLE OWNER: the settle lane of var-tools.ts -
 * setVar success echoes the STORED conversion result as compact JSON;
 * getVar renders strings BARE and everything else compact JSON). */
const setSuccessReplica = (name: string, value: unknown): string =>
  `variable '${name}' set to ${JSON.stringify(value)}.`;
const getRenderingReplica = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

/** The customType tag identifying pio capability markers (SOLE OWNER: the
 * module-private PIO_CAPABILITY_CUSTOM_TYPE in ../capability/pio-session.ts). */
const CUSTOM_TYPE_REPLICA = "pio-capability";

/** The two recorded marker payloads (contents checked against the RENDERER
 * OWNERS directly - renderCapabilityMarker reference, not reconstructed
 * bytes). */
const demoMarkerPayload = (): unknown => ({
  customType: CUSTOM_TYPE_REPLICA,
  content: renderCapabilityMarker("vars-demo"),
  display: true,
  details: undefined,
});
const calleeMarkerPayload = (): unknown => ({
  customType: CUSTOM_TYPE_REPLICA,
  content: renderCapabilityMarker(CALLEE_NAME),
  display: true,
  details: undefined,
});

/** Engine-composed prompt texts (marker line + instructions, then the
 * trailing disclosure block - verbatim the phase engine's composition).
 * The worlds here ride the EMPTY-FORM block (every demo phase declares at
 * most the variable dimension, which never renders - header plus capital-N
 * None line, re-typed locally per the suite's established pattern). */
const DISCLOSURE_EMPTY_FORM_REPLICA = "Phase Permissions:\nNone";
const promptOf = (phaseId: string, instructions: string): string =>
  `${renderPhaseMarker(phaseId)}\n${instructions}\n\n${DISCLOSURE_EMPTY_FORM_REPLICA}`;

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
    join(tmpdir(), `pio-vars-${String(++tempCursor).padStart(2, "0")}-`),
  );
  tempRoots.push(root);
  return root;
}

beforeEach(() => {
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

/** Drive the LAST stored construction factory to completion (the seam the
 * real runtime would have driven itself) and hand back the recorded
 * from-services arg (storage-only; the stamp carrier stays private). */
async function driveStoredClosure(): Promise<FromServicesArg> {
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

/** Recover the real threaded tool instances off the recorded from-services
 * arg, indexed BY NAME (belt-and-braces: the pinned name sequence asserts
 * before any index is trusted). */
async function recoverTools(): Promise<Record<string, unknown>> {
  const arg = await driveStoredClosure();
  const tools = arg.customTools ?? [];
  expect(tools.map((tool) => tool.name)).toEqual([
    "bash",
    "setVar",
    "getVar",
    "listVars",
  ]);
  const index: Record<string, unknown> = {};
  for (const tool of tools) index[tool.name] = tool;
  return index;
}

/** MARKED cast seam (the single documented seam - seam inventory):
 * presents ONE real threaded definition behind the widened five-argument
 * execute view with an inert context argument (the S04 driveVarEntry
 * idiom); no body ever reads the context. */
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
  return execute("tc-vars-demo", params, undefined, undefined, {});
}

/** Queue one scripted pass that emits a run start, drives the given REAL
 * trio calls IN BETWEEN (each lands DURING the run), and settles the run. */
function scriptToolPass(
  round: Round,
  tools: Record<string, unknown>,
  results: DrivenSettlement[],
  actions: Array<{ name: string; input: Record<string, unknown> }>,
): void {
  round.passes.push(async (): Promise<void> => {
    emit(round, { type: "agent_start" });
    for (const action of actions) {
      const entry = tools[action.name];
      if (entry === undefined) {
        throw new Error(`expected a threaded tool named ${action.name}`);
      }
      results.push(await driveVarEntry(entry, action.input));
    }
    emit(round, { type: "agent_end", messages: [], willRetry: false });
  });
}

/** Caller-side scripted passes (greeting -> model-write -> guard-retry xN
 * -> read-back) over the REAL trio bodies. With gateProbeEarly FALSE the
 * instructed happy trajectory plays out (pass 1 skips, the corrective note
 * directs pass 2); with TRUE the degenerate no-trigger variant plays out
 * (the guarded variable lands on pass 1 despite the skip directive). */
function scriptCallerPhases(
  round: Round,
  tools: Record<string, unknown>,
  results: DrivenSettlement[],
  gateProbeEarly: boolean,
): void {
  // Greeting: one quiet settled run (nothing driven).
  round.passes.push(async (): Promise<void> => {
    emit(round, { type: "agent_start" });
    emit(round, { type: "agent_end", messages: [], willRetry: false });
  });
  // Model-write: the REAL setVar body lands DURING the run (live leg 1 -
  // the observer hook sees it immediately after settlement).
  scriptToolPass(round, tools, results, [
    {
      name: "setVar",
      input: { name: MODEL_NOTE_VAR, type: "string", value: MODEL_NOTE_VALUE },
    },
  ]);
  // Guard-retry pass 1: the instructed skip (nothing driven) OR the early
  // compliant definition (the degenerate no-trigger variant).
  scriptToolPass(
    round,
    tools,
    results,
    gateProbeEarly
      ? [
          {
            name: "setVar",
            input: {
              name: GATE_PROBE_VAR,
              type: "string",
              value: GATE_PROBE_VALUE,
            },
          },
        ]
      : [],
  );
  // Guard-retry pass 2 (corrective) - ABSENT in the no-trigger variant.
  if (!gateProbeEarly) {
    scriptToolPass(round, tools, results, [
      {
        name: "setVar",
        input: {
          name: GATE_PROBE_VAR,
          type: "string",
          value: GATE_PROBE_VALUE,
        },
      },
    ]);
  }
  // Read-back: the REAL getVar bodies for both origins (cross-origin
  // parity - the seeded array renders COMPACT JSON, the model-authored
  // string renders BARE).
  scriptToolPass(round, tools, results, [
    { name: "getVar", input: { name: TS_FACTS_VAR } },
    { name: "getVar", input: { name: MODEL_NOTE_VAR } },
  ]);
}

/** Callee-side scripted passes (compose-read -> compose-write xN) over the
 * REAL trio bodies ON THE SAME HANDLE. With calleeWrites TRUE the variable
 * lands during the sole compose-write run; with FALSE the variable is NEVER
 * driven (three corrective denials, then the ceiling throw after the fourth
 * prompt - ten prompts total across the chain). */
function scriptCalleePhases(
  round: Round,
  tools: Record<string, unknown>,
  results: DrivenSettlement[],
  calleeWrites: boolean,
): void {
  // Compose-read: the cross-boundary READ turn quotes the caller-authored
  // value (the real getVar body driven inside the callee's own run).
  scriptToolPass(round, tools, results, [
    { name: "getVar", input: { name: MODEL_NOTE_VAR } },
  ]);
  const composeWriteActions: Array<{
    name: string;
    input: Record<string, unknown>;
  }> = calleeWrites
    ? [
        {
          name: "setVar",
          input: {
            name: CALLEE_NOTE_VAR,
            type: "string",
            value: CALLEE_NOTE_VALUE,
          },
        },
      ]
    : [];
  const composeWriteRuns = calleeWrites ? 1 : 4;
  for (let i = 0; i < composeWriteRuns; i++) {
    scriptToolPass(round, tools, results, composeWriteActions);
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

// ─── C rows: admission / composition / settlement ───────────────────────

describe("admission, composition, settlement (C rows)", () => {
  it("C1 loader admission (real pipeline over the shipped thunk): resolving 'vars-demo' through a single-entry table resolves ok with ctor by REFERENCE identity (the default export) and the contract by STRICT DEEP EQUALITY - the no-inputs/no-outputs/no-writes identity IS the pin", async () => {
    // The real resolution pipeline over the demo's own shipped module
    // (thunk -> strict descent -> throwaway construction -> contract
    // check); default-table membership is the loader suite's pin
    // territory, so this suite stays registration-agnostic by driving the
    // module's own thunk.
    const table: CapabilityTable = {
      "vars-demo": () => import("./vars-demo.ts"),
    };
    const result = await resolveCapability("vars-demo", table);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal}`);
    expect(result.capability.ctor).toBe(VarsDemoCapability);
    expect(result.capability.contract).toStrictEqual({
      name: "vars-demo",
      version: "0.1.0",
      inputs: [],
      outputs: [],
      writes: [],
    });
  });

  it("C2 the full happy chain (the BINDING leg): EXACTLY the expected sequence on the ONE shared handle IN ORDER (demo marker, greeting, model-write, guard-retry pass 1, guard-retry pass 2 + corrective note, read-back, callee marker, compose-read, compose-write, summary variant A); the REAL trio bodies driven DURING runs (setVar echo / getVar compact JSON / getVar bare renderings); BOTH round-trips observable (mid-run hook observation quoted in the summary; the typed read-back reached - the summary ran); the store holds all FOUR pinned values post-run; ZERO demo-side filesystem writes; clean stderr; ok:true with the EMPTY outputs record", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const tools = await recoverTools();
    const driven: DrivenSettlement[] = [];
    scriptCallerPhases(round, tools, driven, false);
    scriptCalleePhases(round, tools, driven, true);
    const demo = new VarsDemoCapability({ session: instance });
    const result = await demo.run();
    // Settlement: ok:true with the EMPTY outputs record (the transcript IS
    // the product - no deliverable slot to settle).
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({});
    // THE unified timeline on the ONE shared handle: the demo's marker
    // STRICTLY BEFORE the greeting prompt, the callee's marker STRICTLY
    // BEFORE its compose-read prompt, the summary LAST with no further
    // marker (implicit span-return) - each stamped EXACTLY ONCE.
    expect(round.timeline).toEqual([
      { kind: "custom", payload: demoMarkerPayload() },
      { kind: "prompt", text: promptOf("greeting", GREETING_REPLICA) },
      { kind: "prompt", text: promptOf("model-write", modelWriteReplica()) },
      { kind: "prompt", text: promptOf("guard-retry", guardRetryReplica()) },
      {
        kind: "prompt",
        text:
          promptOf("guard-retry", guardRetryReplica()) +
          "\n" +
          varGuardBlock(1, [GATE_PROBE_VAR]),
      },
      { kind: "prompt", text: promptOf("read-back", readBackReplica()) },
      { kind: "custom", payload: calleeMarkerPayload() },
      { kind: "prompt", text: promptOf("compose-read", composeReadReplica()) },
      {
        kind: "prompt",
        text: promptOf("compose-write", composeWriteReplica()),
      },
      {
        kind: "prompt",
        text: promptOf(
          "summary",
          summaryReplica(2, MODEL_NOTE_VALUE, CALLEE_NOTE_VALUE),
        ),
      },
    ]);
    expect(round.session.prompt).toHaveBeenCalledTimes(8);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    // Single-host invariant (the row-1 proof): EXACTLY ONE session mint
    // through the SDK kit.
    expect(sdkKit.state.rounds).toHaveLength(1);
    // THE driven REAL trio settlements rendered the owners' pinned lines:
    // setVar success echo (compact JSON), getVar compact JSON (the seeded
    // array), getVar BARE (the model-authored string) - cross-origin
    // parity, including INSIDE the callee's own compose-read turn.
    expect(driven.map((settlement) => settlement.content[0]?.text)).toEqual([
      setSuccessReplica(MODEL_NOTE_VAR, MODEL_NOTE_VALUE),
      setSuccessReplica(GATE_PROBE_VAR, GATE_PROBE_VALUE),
      getRenderingReplica(TS_FACTS_VALUE),
      getRenderingReplica(MODEL_NOTE_VALUE),
      getRenderingReplica(MODEL_NOTE_VALUE),
      setSuccessReplica(CALLEE_NOTE_VAR, CALLEE_NOTE_VALUE),
    ]);
    // The store holds ALL FOUR pinned values post-run (by name, imported
    // constants - by-instance-identity sharing end state).
    expect(instance.vars.get(MODEL_NOTE_VAR)).toBe(MODEL_NOTE_VALUE);
    expect(instance.vars.get(GATE_PROBE_VAR)).toBe(GATE_PROBE_VALUE);
    expect(instance.vars.get(TS_FACTS_VAR)).toStrictEqual(TS_FACTS_VALUE);
    expect(instance.vars.get(CALLEE_NOTE_VAR)).toBe(CALLEE_NOTE_VALUE);
    // Module-visible effect of live leg 1: the summary prompt QUOTES the
    // MID-RUN hook observation (the pinned model-set value).
    expect(sentAt(round, 7)).toContain(MODEL_NOTE_VALUE);
    // Zero demo-side writes anywhere under the owned tree (scripted events
    // observe only; nothing seeds or writes files here).
    expect(readdirSync(tmp).sort()).toEqual(["work"]);
    expect(readdirSync(join(tmp, "work"))).toEqual([]);
    // No product lines on stderr.
    expect(stderrText()).toBe("");
  });

  it("C2b the corrective-note byte pin: the guard-retry run-2 prompt deep-equals the baseline + LF + the VARIABLE-GUARD block replica (pinned 'still missing after 1 run(s)' body; identity-over-goldens - the owner is renderVariableRetryLine in pio-session.ts), and NO output-guard block appears ANYWHERE (single-face degradation invariant - the demo declares no file expectations)", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const tools = await recoverTools();
    const driven: DrivenSettlement[] = [];
    scriptCallerPhases(round, tools, driven, false);
    scriptCalleePhases(round, tools, driven, true);
    const demo = new VarsDemoCapability({ session: instance });
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Run-2 prompt: the baseline + LF + the single-face variable-guard
    // block, strictly after the marker-led baseline.
    const corrected = sentAt(round, 3);
    expect(corrected).toBe(
      promptOf("guard-retry", guardRetryReplica()) +
        "\n" +
        varGuardBlock(1, [GATE_PROBE_VAR]),
    );
    // Single-face degradation: NO output-guard byte anywhere in the chain.
    for (const call of round.session.prompt.mock.calls) {
      expect(String(call[0])).not.toContain(OUTPUT_GUARD_LABEL);
    }
    expect(stderrText()).toBe("");
  });

  it("C2c the degenerate no-trigger variant: the guarded variable is driven on the FIRST pass (the model defined it despite the skip directive) - the guard-retry phase settles at iterations === 1, NO prompt carries the variable-guard label, the summary carries VARIANT B (armed but not triggered), and the chain otherwise matches C2 minus the corrective prompt (SEVEN prompts total)", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const tools = await recoverTools();
    const driven: DrivenSettlement[] = [];
    scriptCallerPhases(round, tools, driven, true);
    scriptCalleePhases(round, tools, driven, true);
    const demo = new VarsDemoCapability({ session: instance });
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({});
    // The chain: C2's shape MINUS the corrective prompt (seven prompts).
    expect(round.timeline).toEqual([
      { kind: "custom", payload: demoMarkerPayload() },
      { kind: "prompt", text: promptOf("greeting", GREETING_REPLICA) },
      { kind: "prompt", text: promptOf("model-write", modelWriteReplica()) },
      { kind: "prompt", text: promptOf("guard-retry", guardRetryReplica()) },
      { kind: "prompt", text: promptOf("read-back", readBackReplica()) },
      { kind: "custom", payload: calleeMarkerPayload() },
      { kind: "prompt", text: promptOf("compose-read", composeReadReplica()) },
      {
        kind: "prompt",
        text: promptOf("compose-write", composeWriteReplica()),
      },
      {
        kind: "prompt",
        text: promptOf(
          "summary",
          summaryReplica(1, MODEL_NOTE_VALUE, CALLEE_NOTE_VALUE),
        ),
      },
    ]);
    expect(round.session.prompt).toHaveBeenCalledTimes(7);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    // NO prompt carries the variable-guard label (the loop was ARMED but
    // NOT triggered).
    for (const call of round.session.prompt.mock.calls) {
      expect(String(call[0])).not.toContain(
        "\u2014\u2014 variable guard \u2014\u2014",
      );
    }
    // Store holds all four pinned values post-run (the guarded variable
    // landed on pass 1).
    expect(instance.vars.get(GATE_PROBE_VAR)).toBe(GATE_PROBE_VALUE);
    expect(instance.vars.get(CALLEE_NOTE_VAR)).toBe(CALLEE_NOTE_VALUE);
    expect(sdkKit.state.rounds).toHaveLength(1);
    expect(readdirSync(tmp).sort()).toEqual(["work"]);
    expect(stderrText()).toBe("");
  });

  it("C2d the verdict-beat structural row (over REAL module bytes): the SIX probe prompts - model-write, guard-retry pass 1, guard-retry corrective pass 2, read-back, compose-read, compose-write - each CONTAIN the sibling's verbatim verdict-phrase replica (index 3 rides under the appended variable-guard block, which carries no verdict phrase of its own), while the bookends - the greeting (index 0) and the summary (index 7) - contain it NOWHERE (negative controls: bookend/report turns carry no verdict beat)", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const tools = await recoverTools();
    const driven: DrivenSettlement[] = [];
    scriptCallerPhases(round, tools, driven, false);
    scriptCalleePhases(round, tools, driven, true);
    const demo = new VarsDemoCapability({ session: instance });
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // The SIX probe prompts each carry the one-sentence verdict beat in
    // their instructed output.
    for (const index of [1, 2, 3, 4, 5, 6]) {
      expect(sentAt(round, index)).toContain(VERDICT_PHRASE_REPLICA);
    }
    // Bookend negative controls: the greeting and the summary NEVER carry
    // the verdict beat.
    expect(sentAt(round, 0)).not.toContain(VERDICT_PHRASE_REPLICA);
    expect(sentAt(round, 7)).not.toContain(VERDICT_PHRASE_REPLICA);
    expect(stderrText()).toBe("");
  });

  it("C2e the rules-skeleton survival row: BOTH pre-repin numbered-rule lines of the guard-retry template survive BYTE-IDENTICALLY (the corrective-note-disambiguation clauses intact, rule 1 before rule 2 in order), AND the verdict-phrase replica occurs in the single static text that teaches both passes (the inserted unnumbered verdict-OUTPUT directive)", () => {
    const replica = guardRetryReplica();
    const ruleOneIndex = replica.indexOf(GUARD_RULE_1);
    const ruleTwoIndex = replica.indexOf(GUARD_RULE_2);
    expect(ruleOneIndex).toBeGreaterThanOrEqual(0);
    expect(ruleTwoIndex).toBeGreaterThan(ruleOneIndex);
    expect(replica).toContain(VERDICT_PHRASE_REPLICA);
  });

  it("C3 callee-exhaustion fault forwarding (REAL ceiling - no locally-minted error): the callee's variable is NEVER driven - its compose-write phase runs 1 + 3 corrective passes (FOUR prompts, notes naming the variable after 1/2/3 run(s)), the fourth break hits the cap and throws the collect-all ceiling failure; the child's run() settles ok:false and the demo RESOLVES (never rejects) ok:false with the child's capture forwarded VERBATIM (family shape {type, cause, message, violations}); the summary NEVER STARTS (TEN prompts total, two markers); the store carries the three earlier values with the callee variable ABSENT; clean stderr", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const tools = await recoverTools();
    const driven: DrivenSettlement[] = [];
    scriptCallerPhases(round, tools, driven, false);
    scriptCalleePhases(round, tools, driven, false);
    const demo = new VarsDemoCapability({ session: instance });
    const result = await demo.run();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // THE verbatim family shape: the child's FIRST capture, unchanged -
    // type + cause + the family-composed message + the single violation
    // line (replicas name their owners above).
    expect(result.errors).toStrictEqual([
      {
        type: "ContractViolationError",
        cause: "contract",
        message: CEILING_MESSAGE,
        violations: [CEILING_LINE],
      },
    ]);
    // Stopping exactly where the callee's ceiling throw lands: the
    // timeline ends after the callee's FOURTH compose-write prompt (notes
    // naming the variable after 1/2/3 run(s)) - NO summary prompt.
    expect(round.timeline).toEqual([
      { kind: "custom", payload: demoMarkerPayload() },
      { kind: "prompt", text: promptOf("greeting", GREETING_REPLICA) },
      { kind: "prompt", text: promptOf("model-write", modelWriteReplica()) },
      { kind: "prompt", text: promptOf("guard-retry", guardRetryReplica()) },
      {
        kind: "prompt",
        text:
          promptOf("guard-retry", guardRetryReplica()) +
          "\n" +
          varGuardBlock(1, [GATE_PROBE_VAR]),
      },
      { kind: "prompt", text: promptOf("read-back", readBackReplica()) },
      { kind: "custom", payload: calleeMarkerPayload() },
      { kind: "prompt", text: promptOf("compose-read", composeReadReplica()) },
      {
        kind: "prompt",
        text: promptOf("compose-write", composeWriteReplica()),
      },
      {
        kind: "prompt",
        text:
          promptOf("compose-write", composeWriteReplica()) +
          "\n" +
          varGuardBlock(1, [CALLEE_NOTE_VAR]),
      },
      {
        kind: "prompt",
        text:
          promptOf("compose-write", composeWriteReplica()) +
          "\n" +
          varGuardBlock(2, [CALLEE_NOTE_VAR]),
      },
      {
        kind: "prompt",
        text:
          promptOf("compose-write", composeWriteReplica()) +
          "\n" +
          varGuardBlock(3, [CALLEE_NOTE_VAR]),
      },
    ]);
    expect(round.session.prompt).toHaveBeenCalledTimes(10);
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    // The store carries the three earlier values with the callee variable
    // ABSENT (safe read returns undefined; the gate denied settlement four
    // times over the absence).
    expect(instance.vars.get(CALLEE_NOTE_VAR)).toBeUndefined();
    expect(instance.vars.get(MODEL_NOTE_VAR)).toBe(MODEL_NOTE_VALUE);
    expect(instance.vars.get(GATE_PROBE_VAR)).toBe(GATE_PROBE_VALUE);
    expect(instance.vars.get(TS_FACTS_VAR)).toStrictEqual(TS_FACTS_VALUE);
    expect(sdkKit.state.rounds).toHaveLength(1);
    expect(readdirSync(tmp).sort()).toEqual(["work"]);
    expect(stderrText()).toBe("");
  });

  it("C4 callee-not-registered boundary: the inline callee is module-private - resolving ITS name over the DEFAULT table yields the standard miss refusal line (byte-equal to BOTH the owner line AND the replicated literal)", async () => {
    const result = await resolveCapability(CALLEE_NAME);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.refusal).toBe(capabilityRefusalLine(CALLEE_NAME));
    expect(result.refusal).toBe(CALLEE_MISS_LINE);
  });

  const envDefectVariants: ReadonlyArray<{
    label: string;
    prepare: () => void;
    message: string;
  }> = [
    {
      label: "PI_CODING_AGENT_DIR UNSET",
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
    it(`C5 env defect (${variant.label}), defective FROM THE START pre-construction: the snapshot-channel fault at the FIRST phase's post-attach disclosure consult escapes PRE-EVERYTHING - the unified timeline is EXACTLY the one span-marker append, ZERO prompts issued, ONE mint, and the typed CapabilityEnvError capture is bare-identity ({type, message} - NO cause key); clean stderr`, async () => {
      const tmp = newTempRoot();
      mkdirSync(join(tmp, "work"), { recursive: true });
      process.chdir(join(tmp, "work"));
      variant.prepare();
      const { instance, round } = await host();
      const demo = new VarsDemoCapability({ session: instance });
      const result = await demo.run();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      // Bare-identity capture: the typed env error carries type + message
      // ONLY (no cause adoption, no violations key).
      expect(result.errors).toStrictEqual([
        { type: "CapabilityEnvError", message: variant.message },
      ]);
      // The span stamp landed BEFORE the body could act; the first phase's
      // disclosure consult is the fault site - zero prompts anywhere.
      expect(round.timeline).toEqual([
        { kind: "custom", payload: demoMarkerPayload() },
      ]);
      expect(round.session.prompt).toHaveBeenCalledTimes(0);
      expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
      expect(sdkKit.state.rounds).toHaveLength(1);
      expect(readdirSync(tmp).sort()).toEqual(["work"]);
      expect(stderrText()).toBe("");
    });
  }

  it("C6 row-1 placement pin (observable-effect form): the composed callee rides the SAME single handle (ONE mint; its span stamp AND its phase prompts land on the CALLER'S OWN timeline) and the callee-written value is visible on the CALLER'S store instance afterwards THROUGH THE TYPED-READ SURFACE (one store, one observer, one mint)", async () => {
    const tmp = newTempRoot();
    enterWorkTree(tmp);
    const { instance, round } = await host();
    const tools = await recoverTools();
    const driven: DrivenSettlement[] = [];
    scriptCallerPhases(round, tools, driven, false);
    scriptCalleePhases(round, tools, driven, true);
    const demo = new VarsDemoCapability({ session: instance });
    const result = await demo.run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // The callee's span stamp AND its phase prompts ride the caller's OWN
    // timeline (the private class keeps no bag recorder - the PUBLIC
    // EFFECT is the pin).
    expect(round.timeline).toEqual(
      expect.arrayContaining([
        { kind: "custom", payload: calleeMarkerPayload() },
        {
          kind: "prompt",
          text: promptOf("compose-read", composeReadReplica()),
        },
        {
          kind: "prompt",
          text: promptOf("compose-write", composeWriteReplica()),
        },
      ]),
    );
    // Single host: the SAME handle served both spans (no second mint).
    expect(sdkKit.state.rounds).toHaveLength(1);
    // By-identity sharing: the callee's written value is readable on the
    // CALLER'S store through the TYPED-READ surface afterwards.
    expect(instance.vars.get(CALLEE_NOTE_VAR, "string")).toBe(
      CALLEE_NOTE_VALUE,
    );
    expect(stderrText()).toBe("");
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

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + 1);
  }
  return count;
}

describe("module surface and mechanical source guards", () => {
  const src = readFileSync(new URL("./vars-demo.ts", import.meta.url), "utf8");

  it("runtime export surface is EXACTLY the ten named constants + default (sorted-key pin; the private callee is UNREACHABLE - no export)", async () => {
    const mod = await import("./vars-demo.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "CALLEE_NAME",
      "CALLEE_NOTE_VALUE",
      "CALLEE_NOTE_VAR",
      "DESCRIPTION",
      "GATE_PROBE_VALUE",
      "GATE_PROBE_VAR",
      "MODEL_NOTE_VALUE",
      "MODEL_NOTE_VAR",
      "TS_FACTS_VALUE",
      "TS_FACTS_VAR",
      "default",
    ]);
    expect(mod.default).toBe(VarsDemoCapability);
  });

  it("every pinned literal occurs EXACTLY ONCE in the module source (the constant definitions - every other reference rides the identifier)", () => {
    const needles: Array<[string, string]> = [
      ["CALLEE_NAME", CALLEE_NAME],
      ["MODEL_NOTE_VAR", MODEL_NOTE_VAR],
      ["GATE_PROBE_VAR", GATE_PROBE_VAR],
      ["TS_FACTS_VAR", TS_FACTS_VAR],
      ["CALLEE_NOTE_VAR", CALLEE_NOTE_VAR],
      ["MODEL_NOTE_VALUE", MODEL_NOTE_VALUE],
      ["GATE_PROBE_VALUE", GATE_PROBE_VALUE],
      ["CALLEE_NOTE_VALUE", CALLEE_NOTE_VALUE],
    ];
    for (const [label, needle] of needles) {
      expect(countOccurrences(src, needle), label).toBe(1);
    }
    for (const element of TS_FACTS_VALUE) {
      expect(countOccurrences(src, String(element))).toBe(1);
    }
  });

  it("named static VALUE clauses are EXACTLY {../capability/base.ts (PioCapability), ../capability/errors.ts (ContractViolationError)} in canonical order - and TYPE clauses exactly {../capability/base.ts (CapabilityParams), ../capability/contract.ts (Contract)}", () => {
    const clauses = staticImportClauses(src);
    const valueClauses = clauses.filter((clause) => !clause.typeOnly);
    const typeClauses = clauses.filter((clause) => clause.typeOnly);
    expect(valueClauses).toEqual([
      {
        typeOnly: false,
        names: ["PioCapability"],
        specifier: "../capability/base.ts",
      },
      {
        typeOnly: false,
        names: ["ContractViolationError"],
        specifier: "../capability/errors.ts",
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

  it("ZERO dynamic-import occurrences (zero module-load graph growth - the callee is module-private and needs no thunk) and zero occurrences of the SDK specifier", () => {
    expect(src.includes("import(")).toBe(false);
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("ZERO process-member accesses (no file deliverables - placement math lives at the base's settle seam, which this value-less contract never consults; zero env or cwd reads survive in this module)", () => {
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

  it("the header marks PERMANENT and names the demo's role (variable-store demonstration home + manual quality-gate leg) with ZERO occurrences of the uppercase TEMPORARY substring (deletion-sweep safety)", () => {
    expect(src.includes("PERMANENT")).toBe(true);
    expect(src.includes("variable-store")).toBe(true);
    expect(src.includes("quality-gate leg")).toBe(true);
    expect(src.includes("TEMPORARY")).toBe(false);
  });

  it("glyph discipline: NO raw U+2014 bytes anywhere in the module source - every em dash rides the \\u2014 escape (stronger than the sibling convention; prose uses ASCII hyphens)", () => {
    expect(src.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it("dev-process-marker scan: zero ISO dates, step/S##/D#N tokens, section signs, or planning-doc references (close-out hygiene)", () => {
    expect(/\d{4}-\d{2}-\d{2}/.test(src)).toBe(false);
    expect(/\bstep\s+\d+/i.test(src)).toBe(false);
    expect(/\bS\d{2}\b/.test(src)).toBe(false);
    expect(/\bD#\d+\b/.test(src)).toBe(false);
    expect(src.includes("\u00a7")).toBe(false);
    expect(src.includes("TASK.md")).toBe(false);
    expect(src.includes("PLAN.md")).toBe(false);
    expect(src.includes("GOAL.md")).toBe(false);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});

// ─── Suite source guards (the row-1 proof) ──────────────────────────────

describe("suite source guards (the row-1 proof)", () => {
  const suiteSrc = readFileSync(
    new URL("./vars-demo.test.ts", import.meta.url),
    "utf8",
  );

  it("ZERO physics-world identifiers over the suite's own source - every token is SPLIT across a concatenation so the guard's own listing cannot self-match (the row-1 proof is the single shared handle: no second handle mint, no swap scripting, no takeover environment installation)", () => {
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

  it("ZERO delta-primitive needles over the suite's own source (split-concatenated; the residue sweep over the package source already covers the module automatically - this explicit row documents intent over the retired change-record vocabulary)", () => {
    const NO_DELTA_PRIMITIVES = [
      "resetVars" + "Delta",
      "getVars" + "Delta",
      "delta" + "Baseline",
    ];
    for (const token of NO_DELTA_PRIMITIVES) {
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
