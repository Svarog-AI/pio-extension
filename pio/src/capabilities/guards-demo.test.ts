// Hermetic unit suite for the permanent guards-demo built-in
// (capabilities/guards-demo.ts). Self-contained island (sibling suites are
// self-contained — no cross-suite harness imports): ONE scripted-event top
// world in this file.
//
// SCRIPTED-EVENT TOP WORLD (research/compose-suite idiom): a fake SDK root
// mocking EXACTLY the five faked value symbols drives PioSession.create(cwd)
// — fake manager/services/runtime/session with subscribe/prompt/
// sendCustomMessage/sessionId/dispose plus the RECORDING sendCustomMessage
// mock (the session-present span stamps land on it); scripted prompt
// resolutions emit SYNTHETIC EVENTS ONLY (they observe, write NOTHING to
// disk by themselves) — DISK-TRUTH DUTY: the engine gate consults real
// existsSync, so rows whose trajectories depend on the deliverable existing
// perform REAL fs operations INSIDE the scripted pass implementations
// (row duty, never harness magic), creating parent dirs first where needed.
// A single-turn settle pass = agent_start · agent_end []; a write-settle
// pass adds tool_execution_start {toolName:"write", args:{path}} ·
// tool_execution_end {isError:false}. mkdtemp tmpdir per row with
// PI_CODING_AGENT_DIR pointed at <tmp>/.pi/agent (rows may DELETE or set it
// MALFORMED; saved/restored in afterEach) and process.chdir into <tmp>/work
// (restored — vitest workers share the process). Real base run() / real
// createStatusEmitter (per-row tmpdir sessionsRoot) / real exitCodeFor — no
// unit stubs of those modules. Every session-driven row mints EXACTLY ONE
// session handle through the SDK kit (single-host invariant). Expected
// placements compute in-row through the imported public channels
// (self-consistent idiom — never hardcoded slugs or keys). Replicated
// product literals carry a comment naming the SOLE OWNER. NOTE the em dashes
// are U+2014 EM DASH characters — escaped so the pinned codepoints survive
// editor and toolkit glyph mangling; never normalize.

import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import { ContractViolationError } from "../capability/errors.ts";
import {
  PioSession,
  renderCapabilityMarker,
  renderPhaseMarker,
} from "../capability/pio-session.ts";
import {
  createStatusEmitter,
  exitCodeFor,
  statusPath,
} from "../capability/status.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";
import GuardsDemoCapability, { GUARDS_DEMO_ARTIFACT } from "./guards-demo.ts";

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

/** One observed event on the shared handle, in ISSUE ORDER: a prompt send
 * or a recorded custom-message append (the interleaving the marker-order
 * pins ride). */
interface TimelineEntry {
  readonly kind: "prompt" | "custom";
  readonly text?: string;
  readonly payload?: unknown;
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
    // Fresh fakes per invocation; every row of THIS suite mints exactly ONE
    // such handle (the single-host invariant the rows pin on).
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
    const sendCustomMessage = vi.fn(async (payload: unknown): Promise<void> => {
      timeline.push({ kind: "custom", payload });
    });
    const session: FakeSession = {
      subscribe,
      prompt,
      sendCustomMessage,
      sessionId: "sess-fake-guards-01",
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
  const reset = (): void => {
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

// ─── Sole-owner replicas (byte-pinned; \u2014 escaped identically) ─────

/** Pinned greeting template replica (SOLE OWNER: GREETING_INSTRUCTIONS in
 * ./guards-demo.ts). Em dashes are U+2014 (escaped). */
const GREETING_REPLICA = `You are starting a guard demonstration.
1. Greet the operator: say hello and briefly mention that the run ahead exhibits the engine's expectation guard \u2014 a declared deliverable whose settlement is DENIED on the first pass until the file exists.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** Pinned guard-probe instruction template replica (SOLE OWNER: the
 * guardProbeInstructions owner in ./guards-demo.ts — ONE static text
 * teaches both passes). Em dashes are U+2014 (escaped). */
const guardProbeReplica = (absoluteArtifact: string): string =>
  `This run demonstrates the engine's expectation guard for a declared deliverable.
Deliverable file (absolute path): ${absoluteArtifact}

Rules for THIS run:
1. FIRST PASS \u2014 no corrective note appears below these instructions: draft the intended content in your reply ONLY and finish the run WITHOUT any write or edit call touching that file.
2. How the guard works: the engine checks the file's existence at settlement, DENIES settlement while the file is missing, and re-runs this phase with a corrective note naming the exact missing path.
3. CORRECTIVE PASS \u2014 a corrective note naming this path IS present below these instructions: create the file AT THE EXACT path above with minimal required content \u2014 a "# Guard Demo" heading plus one line stating that this run was forced by the expectation guard.
Work autonomously; do not ask the user anything during the run.`;

/** Pinned summary template replica (SOLE OWNER: the summaryInstructions
 * owner in ./guards-demo.ts): variant A (iterations >= 2) names the observed
 * run count; variant B (=== 1) is the graceful armed-but-not-triggered
 * wording. No third variant, ever. Em dashes are U+2014 (escaped). */
const summaryReplica = (
  absoluteArtifact: string,
  iterations: number,
  fileConfirmed: boolean,
): string => {
  const placementLine = fileConfirmed
    ? "The deliverable is present at (absolute path):"
    : "The declared deliverable path is (absolute):";
  const outcome =
    iterations >= 2
      ? `The guard demonstration has finished after ${iterations} runs: the engine's expectation guard DENIED first-pass settlement \u2014 the declared deliverable was missing \u2014 and FORCED the corrective re-run until the file existed.`
      : `The guard demonstration has finished after 1 run: the expectation guard's loop was ARMED but NOT triggered \u2014 the deliverable landed on the very first run, so the engine settled it immediately.`;
  return `${outcome}
${placementLine}
${absoluteArtifact}
1. State in one short sentence what was demonstrated.
2. Do nothing else \u2014 no further tools, no questions, no writes. End your turn right after that statement.`;
};

/** Engine-owned corrective-block replica (SOLE OWNER: the module-private
 * retry template in ../capability/pio-session.ts): the flanked em-dash
 * delimiter line labeled output guard above the body sentence — every
 * currently-missing resolved path (declaration order) plus the settled-run
 * count; U+2014 arrives as \u2014 escapes identically on both sides. */
const correctiveLine = (iterations: number, missing: string[]): string =>
  `\u2014\u2014 output guard \u2014\u2014\nRequired phase output(s) still missing after ${iterations} run(s): ${missing.join(", ")}. Create each listed file with the write or edit tool before you finish this run.`;

/** Engine-owned ceiling-violation line replica (SOLE OWNER: the module-
 * private violation template in ../capability/pio-session.ts): raw entry +
 * resolved path; em dash U+2014-escaped identically on both sides; N = 3
 * pinned ceiling. */
const violationLine = (
  phaseId: string,
  entry: string,
  resolvedPath: string,
): string =>
  `phase '${phaseId}' output '${entry}' missing at ${resolvedPath} \u2014 still absent after 3 expectation re-run(s); the ceiling is exhausted`;

/** Env-defect message replicas (SOLE OWNER: deriveStateRootFromAgentDir in
 * ../capability/base.ts — class CapabilityEnvError, message prefix
 * "capability:"). */
const ENV_UNSET_MESSAGE =
  "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root";
const envMalformedMessage = (value: string): string =>
  `capability: PI_CODING_AGENT_DIR is malformed ('${value}') \u2014 cannot derive the state root`;

/** The customType tag identifying pio capability markers (SOLE OWNER: the
 * module-private PIO_CAPABILITY_CUSTOM_TYPE in ../capability/pio-session.ts). */
const CUSTOM_TYPE_REPLICA = "pio-capability";

/** Engine-composed prompt texts (marker line + instructions, verbatim the
 * phase engine's composition; corrective notes sit strictly AFTER the
 * baseline). */
const greetingPromptText = (): string =>
  `${renderPhaseMarker("greeting")}\n${GREETING_REPLICA}`;
const guardProbePromptText = (absoluteArtifact: string): string =>
  `${renderPhaseMarker("guard-probe")}\n${guardProbeReplica(absoluteArtifact)}`;
const summaryPromptText = (
  absoluteArtifact: string,
  iterations: number,
  fileConfirmed: boolean,
): string =>
  `${renderPhaseMarker("summary")}\n${summaryReplica(
    absoluteArtifact,
    iterations,
    fileConfirmed,
  )}`;

/** The span-stamp payload exactly as the base seam records it (contents
 * checked against the RENDERER owner directly — reference, not
 * reconstructed bytes). */
const markerPayload = (): unknown => ({
  customType: CUSTOM_TYPE_REPLICA,
  content: renderCapabilityMarker("guards-demo"),
  display: true,
  details: undefined,
});

// ─── Shared lifecycle ───────────────────────────────────────────────────

let tmp: string;
let originalEnv: string | undefined;
let originalCwd: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  sdkKit.reset();
  originalEnv = process.env.PI_CODING_AGENT_DIR;
  originalCwd = process.cwd();
  stderrSpy = vi.spyOn(process.stderr, "write");
  tmp = await mkdtemp(join(tmpdir(), "pio-guards-demo-"));
  // The state-root channel into the bubble: the renderer's unconditional
  // <root>/.pi/agent expression over this row's own tmp tree.
  process.env.PI_CODING_AGENT_DIR = join(tmp, ".pi", "agent");
  await mkdir(join(tmp, "work"), { recursive: true });
  process.chdir(join(tmp, "work"));
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalEnv === undefined) {
    delete process.env.PI_CODING_AGENT_DIR;
  } else {
    process.env.PI_CODING_AGENT_DIR = originalEnv;
  }
  stderrSpy.mockRestore();
  await rm(tmp, { recursive: true, force: true });
});

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
 * (and ONLY the observer plane — the REAL fs write is fixture duty inside
 * the scripted pass implementation). */
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

/** Queue one synthetic settlement per scheduled prompt send (in order). */
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

/** Self-consistent artifact-placement derivation via the SAME public
 * channels the BASE SETTLE SEAM derives (never hardcoded slugs or keys). */
function artifactPlacement(): {
  stateRoot: string;
  projectKey: string;
  projectSlot: string;
  absoluteArtifact: string;
} {
  const stateRoot = deriveStateRootFromAgentDir(
    process.env.PI_CODING_AGENT_DIR,
  );
  const projectKey = deriveProjectKey(process.cwd());
  const projectSlot = join(stateRoot, "projects", projectKey);
  return {
    stateRoot,
    projectKey,
    projectSlot,
    absoluteArtifact: join(projectSlot, GUARDS_DEMO_ARTIFACT),
  };
}

function stderrText(): string {
  return stderrSpy.mock.calls
    .map((call: readonly unknown[]) => String(call[0]))
    .join("");
}

/** Seed the real artifact file in the tmp tree (fixture duty, parent dirs
 * included). */
async function seedArtifact(
  absoluteArtifact: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(absoluteArtifact), { recursive: true });
  await writeFile(absoluteArtifact, content);
}

// ─── C rows: the expectation-guard demonstration flow ───────────────────

describe("expectation-guard demonstration flow (C rows)", () => {
  it("C1 full happy chain (BINDING leg): pass one skips the write => the engine denies settlement and the pass-two prompt carries the IDENTICAL baseline PLUS the pinned DELIMITED corrective block (delimiter line above the unchanged body; run count 1, naming the tmpdir-ABSOLUTE path) => pass two commits the REAL fs write and settles at iterations === 2, the span stamp lands EXACTLY ONCE strictly before the first prompt, ok:true with the ABSOLUTE settled outputs.report (the base seam engaged), the terminal record + exit code 0 — EXACTLY 4 prompts (1 greeting + 2 guard-probe + 1 summary)", async () => {
    const placement = artifactPlacement();
    const { instance, round } = await host();
    // Trajectory: greeting quiet; probe pass ONE quiet (no events, no fs);
    // probe pass TWO commits the REAL fs write + the synthetic settle pair;
    // summary quiet.
    scriptRuns(round, quietSettle(), quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    // Prompt-total arithmetic: 1 + 2 + 1 = 4 — a wrong total reveals a
    // corrective block attributed to the wrong phase or a stray prompt.
    expect(round.session.prompt).toHaveBeenCalledTimes(4);
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    // Pass two: marker-leading baseline UNCHANGED + ONE appended fresh
    // corrective block (two lines: delimiter above the body; settled-run
    // count 1, the tmpdir-absolute path).
    expect(sentAt(round, 2)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(1, [placement.absoluteArtifact])}`,
    );
    expect(sentAt(round, 3)).toBe(
      summaryPromptText(placement.absoluteArtifact, 2, true),
    );

    // Span stamp: EXACTLY ONCE, the sibling-pinned payload, STRICTLY BEFORE
    // the first prompt (log-order pin).
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(round.session.sendCustomMessage).toHaveBeenCalledWith(
      markerPayload(),
    );
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
    // The unified timeline confirms the same ordering end to end.
    expect(round.timeline).toEqual([
      { kind: "custom", payload: markerPayload() },
      { kind: "prompt", text: greetingPromptText() },
      {
        kind: "prompt",
        text: guardProbePromptText(placement.absoluteArtifact),
      },
      {
        kind: "prompt",
        text: `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(1, [placement.absoluteArtifact])}`,
      },
      {
        kind: "prompt",
        text: summaryPromptText(placement.absoluteArtifact, 2, true),
      },
    ]);

    // Settlement: ok:true with the ABSOLUTE settled placement (the returned
    // relative token was absolutized EXACTLY ONCE by the base's settle
    // seam).
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({
      report: placement.absoluteArtifact,
    });

    // Real emitter chain: terminal record + exit map (no unit stubs).
    const sessionsRoot = join(tmp, ".sessions");
    const emitter = createStatusEmitter({
      sessionsRoot,
      capability: { name: cap.contract.name, version: cap.contract.version },
      tokens: () => instance.counters().tokens,
      sessionFile: () => undefined,
    });
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
      name: "guards-demo",
      version: "0.1.0",
      source: "builtin",
    });
    expect(record.outputs).toEqual({
      report: placement.absoluteArtifact,
    });
    expect(record.errors).toBeUndefined();
    // Disk truth: the committed content the scripted pass wrote.
    expect(readFileSync(placement.absoluteArtifact, "utf8")).toBe(
      "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
    );
    expect(stderrText()).toBe("");
  });

  it("C2 disobedient-compliance: the model commits the file on PASS ONE (real fs write inside the scripted pass) => the gate passes on the FIRST break — all-baseline prompt texts, ZERO corrective blocks, iterations === 1 — and the SUMMARY observes the graceful ARMED-BUT-NOT-TRIGGERED variant (variant B) — ok:true, EXACTLY 3 prompts (1 + 1 + 1)", async () => {
    const placement = artifactPlacement();
    const { instance, round } = await host();
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nLanded on the first run.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    expect(round.session.prompt).toHaveBeenCalledTimes(3);
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    // All-baseline: strict equality PROVES zero corrective blocks.
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    // Graceful-path assertion: the composed variant-B statement (armed but
    // not triggered), concrete count 1.
    expect(sentAt(round, 2)).toBe(
      summaryPromptText(placement.absoluteArtifact, 1, true),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({
      report: placement.absoluteArtifact,
    });
    const sessionsRoot = join(tmp, ".sessions");
    const emitter = createStatusEmitter({
      sessionsRoot,
      capability: { name: cap.contract.name, version: cap.contract.version },
      tokens: () => instance.counters().tokens,
      sessionFile: () => undefined,
    });
    const emission = await emitter.emit(result);
    expect(emission.status.ok).toBe(true);
    expect(emission.exitCode).toBe(0);
    expect(exitCodeFor(emission.status)).toBe(0);
    expect(stderrText()).toBe("");
  });

  it("C3 never-write: quiet passes burn the ceiling — the guard-probe receives EXACTLY 4 prompts (texts 2–4 each equal the baseline PLUS ONE appended corrective block, run counts 1..3), execute_phase REJECTS with the pinned ContractViolationError forwarded VERBATIM through call() (engine-level violations carry EXACTLY the pinned line naming the tmpdir target; no wrap/downgrade), the base capture is ok:false with the typed CVE shape, the emitted status.json NAMES the missing file, exit code 1, and the SUMMARY NEVER RAN (EXACTLY 5 prompts total — no sixth)", async () => {
    const placement = artifactPlacement();
    const line = violationLine(
      "guard-probe",
      placement.absoluteArtifact,
      placement.absoluteArtifact,
    );
    const { instance, round } = await host();
    // Five quiet passes: 1 greeting + 4 guard-probe (the ceiling).
    scriptRuns(
      round,
      quietSettle(),
      quietSettle(),
      quietSettle(),
      quietSettle(),
      quietSettle(),
    );
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    expect(round.session.prompt).toHaveBeenCalledTimes(5);
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    // Guard-probe runs 1..4: the FIRST is all-baseline; runs 2-4 carry ONE
    // appended fresh corrective block each (run counts 1, 2, 3).
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    expect(sentAt(round, 2)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(1, [placement.absoluteArtifact])}`,
    );
    expect(sentAt(round, 3)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(2, [placement.absoluteArtifact])}`,
    );
    expect(sentAt(round, 4)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(3, [placement.absoluteArtifact])}`,
    );
    // SUMMARY NEVER RAN: no prompt text leads with the summary marker.
    for (let i = 0; i < 5; i++) {
      expect(sentAt(round, i).startsWith(renderPhaseMarker("summary"))).toBe(
        false,
      );
    }

    // Base capture: the CVE travels VERBATIM (typed-first ladder —
    // violations preserved, cause contract).
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors).toStrictEqual([
      {
        type: "ContractViolationError",
        cause: "contract",
        message: `Contract violation: ${line}`,
        violations: [line],
      },
    ]);
    const sessionsRoot = join(tmp, ".sessions");
    const emitter = createStatusEmitter({
      sessionsRoot,
      capability: { name: cap.contract.name, version: cap.contract.version },
      tokens: () => instance.counters().tokens,
      sessionFile: () => undefined,
    });
    const emission = await emitter.emit(result);
    expect(emission.status.ok).toBe(false);
    expect(emission.exitCode).toBe(1);
    expect(exitCodeFor(emission.status)).toBe(1);
    const record = JSON.parse(
      readFileSync(statusPath(sessionsRoot), "utf8"),
    ) as { ok: boolean; errors?: Array<{ violations?: string[] }> };
    expect(record.ok).toBe(false);
    // The terminal record NAMES the missing file.
    expect(record.errors?.[0]?.violations).toEqual([line]);

    // ENGINE-LEVEL verbatim proof: driving call() DIRECTLY (base bypassed)
    // rejects with the un-wrapped ContractViolationError carrying the same
    // pinned line — no wrap or downgrade anywhere along the way.
    const second = await host();
    scriptRuns(
      second.round,
      quietSettle(),
      quietSettle(),
      quietSettle(),
      quietSettle(),
      quietSettle(),
    );
    const directCap = new GuardsDemoCapability({ session: second.instance });
    let thrown: unknown;
    try {
      await directCap.call({});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as ContractViolationError).violations).toEqual([line]);
    expect(stderrText()).toBe("");
  });

  it("C4 repeatability: a pre-existing artifact (REAL fs seed BEFORE call()) is REMOVED by the repeatable reset before the guarded phase — observable: during the first guard-probe run a sync fs read reports ABSENT — and the first-pass gate fires IDENTICALLY (same corrective block, same trajectory as the unseeded happy chain), ok:true, EXACTLY 4 prompts", async () => {
    const placement = artifactPlacement();
    await seedArtifact(placement.absoluteArtifact, "stale artifact\n");
    const { instance, round } = await host();
    scriptRuns(round, quietSettle());
    let observedAbsentDuringPassOne = false;
    round.passes.push(async (): Promise<void> => {
      // Post-reset, pre-settle vantage point: the stale artifact must be
      // GONE by the time the first guard-probe run executes.
      observedAbsentDuringPassOne = !existsSync(placement.absoluteArtifact);
      emit(round, ...quietSettle());
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    expect(observedAbsentDuringPassOne).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(4);
    // Identical trajectory to the unseeded happy chain: the same
    // baseline/corrective framing over the same absolute path.
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    expect(sentAt(round, 2)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(1, [placement.absoluteArtifact])}`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.outputs).toStrictEqual({
      report: placement.absoluteArtifact,
    });
    // The post-settle disk content is the FRESH committed write, not the
    // stale seed.
    expect(readFileSync(placement.absoluteArtifact, "utf8")).toBe(
      "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
    );
    expect(stderrText()).toBe("");
  });
});

// ─── F rows: instruction framing (byte replicas) ──────────────────────

describe("instruction framing (F rows)", () => {
  it("F1 pinned BYTE REPLICA of the first-pass guard-probe instructions (marker-leading baseline = renderPhaseMarker('guard-probe') + '\\n' + template) and the MARKER-LEADING INVARIANT holds for EVERY run's text in ALL THREE phases (happy-chain trajectory)", async () => {
    const placement = artifactPlacement();
    const { instance, round } = await host();
    scriptRuns(round, quietSettle(), quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);

    // Byte replica of the FIRST-PASS guard-probe prompt: the marker-leading
    // baseline is exactly renderer + "\\n" + the pinned template (no
    // corrective block yet on run one).
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    expect(sentAt(round, 1)).toBe(
      `${renderPhaseMarker("guard-probe")}\n${guardProbeReplica(placement.absoluteArtifact)}`,
    );
    // Marker-leading invariant over EVERY run's text in all three phases:
    // first physical line === renderPhaseMarker(<phase id>).
    const phaseIds = ["greeting", "guard-probe", "guard-probe", "summary"];
    for (let i = 0; i < 4; i++) {
      const text = sentAt(round, i);
      const firstLine = text.split("\n", 1)[0] ?? "";
      expect(firstLine).toBe(renderPhaseMarker(phaseIds[i] ?? ""));
    }
    expect(stderrText()).toBe("");
  });

  it("F2 BOTH composed summary statements pinned: variant A with the CONCRETE observed run count (2) on the happy trajectory, variant B (armed-but-not-triggered, count 1) on the disobedient trajectory — never a third variant, never a hard failure on model non-determinism", async () => {
    const placement = artifactPlacement();
    // Variant A (iterations >= 2): the happy chain.
    const { instance, round } = await host();
    scriptRuns(round, quietSettle(), quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nForced re-run.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(sentAt(round, 3)).toBe(
      `${renderPhaseMarker("summary")}\n${summaryReplica(placement.absoluteArtifact, 2, true)}`,
    );

    // Variant B (iterations === 1): the disobedient-compliant chain on a
    // fresh host (single-host per host() call; two mints total here).
    const second = await host();
    scriptRuns(second.round, quietSettle());
    second.round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nLanded first run.\n",
      );
      emit(second.round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    scriptRuns(second.round, quietSettle());
    const secondCap = new GuardsDemoCapability({ session: second.instance });
    const secondResult = await secondCap.run();
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) throw new Error("unreachable");
    expect(sentAt(second.round, 2)).toBe(
      `${renderPhaseMarker("summary")}\n${summaryReplica(placement.absoluteArtifact, 1, true)}`,
    );
    // The graceful wording IS present (variant-B signature phrase).
    expect(sentAt(second.round, 2)).toContain("ARMED but NOT triggered");
    expect(sdkKit.state.rounds).toHaveLength(2);
    expect(stderrText()).toBe("");
  });
});

// ─── Module surface and mechanical source guards ──────────────────────

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
    const names = (match[2].match(/[A-Za-z_$][\w$]*/g) ?? []).filter(
      (name) => name !== "type",
    );
    out.push({
      typeOnly: match[1] !== undefined,
      names,
      specifier: match[3],
    });
  }
  return out;
}

describe("module surface and mechanical guards", () => {
  const src = readFileSync(
    new URL("./guards-demo.ts", import.meta.url),
    "utf8",
  );

  it("defaults to a concrete bundled subclass instantiable with the empty bag, exposing the pinned contract literal and the pinned token constant", () => {
    expect(Object.getPrototypeOf(GuardsDemoCapability.prototype)).toBe(
      PioCapability.prototype,
    );
    expect(GUARDS_DEMO_ARTIFACT).toBe("guards-demo/guard-probe.md");
    const instance = new GuardsDemoCapability({});
    // Pinned contract literal — the SOLE OWNER is the contract field on
    // GuardsDemoCapability in capabilities/guards-demo.ts; the copy keeps the
    // pin meaningful.
    expect(instance.contract).toStrictEqual({
      name: "guards-demo",
      version: "0.1.0",
      inputs: [],
      outputs: [{ name: "report", paramKey: "report" }],
      writes: ["guards-demo/*.md"],
      allowProjectWrites: true,
    });
  });

  it("runtime export surface is EXACTLY the one named export (the token constant) beside the default export", async () => {
    const mod = await import("./guards-demo.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "GUARDS_DEMO_ARTIFACT",
      "default",
    ]);
    expect(mod.default).toBe(GuardsDemoCapability);
  });

  it("contains ZERO occurrences of the SDK specifier in the module source (static value graph reaches no SDK module)", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("static import-clause discipline per the sibling pattern (post-format reality): VALUE clauses exactly {node:fs/promises (rm, stat), node:path (join), ../capability/base.ts (CapabilityParams inline-type + deriveStateRootFromAgentDir + PioCapability), ../sandbox/layout.ts (deriveProjectKey)} in canonical order — TYPE clauses exactly {../capability/contract.ts (Contract)}", () => {
    const clauses = staticImportClauses(src);
    const valueClauses = clauses.filter((clause) => !clause.typeOnly);
    const typeClauses = clauses.filter((clause) => clause.typeOnly);
    expect(valueClauses).toEqual([
      {
        typeOnly: false,
        names: ["rm", "stat"],
        specifier: "node:fs/promises",
      },
      { typeOnly: false, names: ["join"], specifier: "node:path" },
      {
        typeOnly: false,
        names: [
          "CapabilityParams",
          "deriveStateRootFromAgentDir",
          "PioCapability",
        ],
        specifier: "../capability/base.ts",
      },
      {
        typeOnly: false,
        names: ["deriveProjectKey"],
        specifier: "../sandbox/layout.ts",
      },
    ]);
    expect(typeClauses).toEqual([
      {
        typeOnly: true,
        names: ["Contract"],
        specifier: "../capability/contract.ts",
      },
    ]);
  });

  it("ZERO dynamic-import occurrences (co-shipping static imports only — the loader owns the registration thunk internally)", () => {
    expect(src.includes("import(")).toBe(false);
  });

  it("the fixed artifact token literal occurs EXACTLY ONCE in the module source (the exported constant's definition — every other reference rides the constant)", () => {
    expect((src.match(/guards-demo\/guard-probe\.md/g) ?? []).length).toBe(1);
  });

  it("zero hop/terminal-takeover machinery tokens (no terminal, lineage, or hop machinery in this module) and the header marks PERMANENT with the temporary-sibling CONTRAST STATEMENT (names the temporary sibling module + its cutover removal) while carrying ZERO uppercase TEMPORARY substrings (deletion-sweep safety)", () => {
    for (const token of [
      "SIGINT",
      "InteractiveMode",
      "armKillCapture",
      "parentSession",
      "terminal-takeover",
    ]) {
      expect(src.includes(token)).toBe(false);
    }
    expect(src.includes("PERMANENT")).toBe(true);
    expect(src.includes("compose-new-session-demo")).toBe(true);
    expect(src.includes("bulk-migration cutover")).toBe(true);
    expect(src.includes("TEMPORARY")).toBe(false);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });
});

// ─── Suite source guards (self-containment proof) ─────────────────────

describe("suite source guards", () => {
  it("the fake SDK root fakes EXACTLY the five valued symbols (session-construction seams only — a sixth fake symbol would be foreign wiring intruding into the island)", () => {
    const suiteSrc = readFileSync(
      new URL("./guards-demo.test.ts", import.meta.url),
      "utf8",
    );
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
        "getAgentDir",
        "SessionManager",
      ].sort(),
    );
  });
});

// ─── E rows: env defects (mirror the research pair) ────────────────────

describe("env defects (E rows)", () => {
  it("E1 PI_CODING_AGENT_DIR DELETED from env escapes pre-everything: the pinned typed UNSET capture (imported from ../capability/base.ts), ZERO prompts — the loud typed env failure intact", async () => {
    const { instance, round } = await host();
    delete process.env.PI_CODING_AGENT_DIR;
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors).toStrictEqual([
      { type: "CapabilityEnvError", message: ENV_UNSET_MESSAGE },
    ]);
    expect(round.session.prompt).toHaveBeenCalledTimes(0);
    expect(stderrText()).toBe("");
  });

  it("E2 a MALFORMED (relative) PI_CODING_AGENT_DIR likewise: the pinned typed MALFORMED capture naming the raw value, ZERO prompts", async () => {
    const { instance, round } = await host();
    process.env.PI_CODING_AGENT_DIR = "rel/.pi/agent";
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors).toStrictEqual([
      {
        type: "CapabilityEnvError",
        message: envMalformedMessage("rel/.pi/agent"),
      },
    ]);
    expect(round.session.prompt).toHaveBeenCalledTimes(0);
    expect(stderrText()).toBe("");
  });
});
