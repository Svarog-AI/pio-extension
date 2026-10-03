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
// editor and toolkit glyph mangling; never normalize. Verdict-shaped
// assertions drive the REAL write-gate predicate over FRESH snapshot()
// readings of the recovered shared execution state — mid-pass consults
// capture the verdict during the scripted pass and assert AFTER the settled
// run (a fault inside the pass would otherwise settle as an ok:false
// capture and mask itself); the asserted bytes ARE the ToolCallEventResult
// reason the real interceptor would return — never faked. Denial-SHAPED
// consult targets ride LITERAL ABSOLUTE POSIX ROOTS that escape the OS
// /tmp/ prefix (the row-scoped tmp trees sit under it, and the gate's
// /tmp/ parity class would admit any such target before any span/phase
// judgment — resolve() is identity on literals, so they round-trip
// byte-exactly); the SURVIVOR listings in the asserted lines still carry
// the REAL TREE's declared paths (the live attachment), and admission-
// shaped consults may ride real-tree targets. The standing
// real-/tmp exception: the pinned scratch name is unique, the capability's
// error-swallowed pre-phase sweep self-heals across runs, and every
// full-trajectory row carries its OWN hygiene sweep at row end (the
// post-run residue assertion lands WITHIN the row, before any sweep).
// NOTE the host() helper also drives the stored runtime-factory closure
// ONCE per construction: the real seam stamps the minted execution state
// onto the additive from-services carrier handle, the helper recovers that
// state cast-free (descriptor read plus instanceof) and enters the pinned
// empty-contract fixture span, so every guarded phase in this suite runs
// against a live span exactly as production does. Return shape is ADDITIVE:
// { instance, round, state } — state is the recovered stamped
// SessionExecutionState reference for MID-PASS real-predicate consults;
// existing destructuring consumers of { instance, round } are unaffected.

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
import type { WriteGateVerdict } from "../capability/guards/write-gate.ts";
import { decideWrite } from "../capability/guards/write-gate.ts";
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
import { EXECUTION_STATE_STAMP } from "../session.ts";
import { SessionExecutionState } from "../session-execution-state.ts";
import GuardsDemoCapability, {
  GUARDS_DEMO_ALLOW_ARTIFACT,
  GUARDS_DEMO_ARTIFACT,
  GUARDS_DEMO_DENY_ARTIFACT,
  GUARDS_DEMO_DENY_STRAY,
  GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT,
  GUARDS_DEMO_PROJECT_PROBE_FILE,
  GUARDS_DEMO_TMP_PARITY_FILE,
} from "./guards-demo.ts";

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

/** Structural fake of the stored runtime-factory closure input (erased
 * harness typing is sanctioned): deliberately wider than the SDK type. */
type StoredClosure = (input: {
  cwd: string;
  agentDir: string;
  sessionManager: { getCwd: () => string };
  sessionStartEvent: unknown;
}) => Promise<unknown>;

// ─── Scripted-event top world (fake SDK root) ──────────────────────────

const sdkKit = vi.hoisted(() => {
  const state: {
    rounds: Round[];
    storedFactories: StoredClosure[];
    stampCarriers: FakeSession[];
  } = {
    rounds: [],
    storedFactories: [],
    stampCarriers: [],
  };
  const create = vi.fn((cwd: string) => ({
    getCwd: (): string => cwd,
  }));
  const getAgentDir = vi.fn((): string => "/agent/dir");
  const createAgentSessionServices = vi.fn(async () => ({
    marker: "fake-services",
  }));
  const createAgentSessionFromServices = vi.fn(async () => {
    // Additive stamp carrier: the real seam stamps the minted execution
    // state onto the created handle; host() reads back that descriptor.
    const carrier: FakeSession = {
      subscribe: vi.fn((): (() => void) => () => {}),
      prompt: vi.fn(async (): Promise<void> => {}),
      sendCustomMessage: vi.fn(async (): Promise<void> => {}),
      sessionId: "sess-fake-guards-01",
      dispose: vi.fn(),
    };
    state.stampCarriers.push(carrier);
    return { extensionsResult: {}, session: carrier };
  });
  const createAgentSessionRuntime = vi.fn(async (factory?: StoredClosure) => {
    if (factory !== undefined) state.storedFactories.push(factory);
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
    state.storedFactories = [];
    state.stampCarriers = [];
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

/** Pinned deny-probe instruction template replica (SOLE OWNER: the
 * denyInstructions owner in ./guards-demo.ts). Em dashes are U+2014
 * (escaped). */
const denyReplica = (
  absoluteLegalArtifact: string,
  absoluteStrayArtifact: string,
): string =>
  `This run demonstrates the write gate's phase-level path enforcement.
Legal artifact (absolute path): ${absoluteLegalArtifact}
Stray artifact (absolute path): ${absoluteStrayArtifact}

Rules for THIS run:
1. Create the LEGAL artifact AT ITS EXACT absolute path above with minimal content \u2014 a short heading line stating that the write gate admitted it.
2. THEN attempt to write the STRAY artifact AT ITS EXACT absolute path above. Name it explicitly in your reply as expected to be refused \u2014 this phase declared only the legal path, so the stray must come back refused.
3. STATE WHAT THE REFUSAL REPORTED in your reply (quote the allowed-targets part of the refusal if you can).
4. DO NOT retry the same target. End your turn right after that statement.`;

/** Pinned allow-probe instruction template replica (SOLE OWNER: the
 * allowInstructions owner in ./guards-demo.ts). Em dashes are U+2014
 * (escaped). */
const allowReplica = (absoluteArtifact: string): string =>
  `This run demonstrates write-gate ADMISSION of a phase-declared path.
Artifact (absolute path): ${absoluteArtifact}

Rules for THIS run:
1. Create the file AT THAT EXACT absolute path with minimal content \u2014 a short heading line.
2. Briefly state in your reply that the write succeeded despite nothing special being declared beyond the file itself \u2014 the phase declared exactly this one path, and the gate admitted it.
3. Do nothing else. End your turn right after that statement.`;

/** Pinned project-file instruction template replica (SOLE OWNER: the
 * projectFileInstructions owner in ./guards-demo.ts). Em dashes are U+2014
 * (escaped). */
const projectFileReplica = (absoluteCwdFile: string): string =>
  `This run demonstrates the write gate's project-files SCOPE class for a phase that declares the scope and NO specific paths.
Workspace file (absolute path): ${absoluteCwdFile}

Rules for THIS run:
1. Create the file AT THAT EXACT absolute path with minimal content \u2014 a short heading line.
2. State in your reply that it landed with the phase declaring the project-files scope and NO specific paths.
3. Do not attempt any other write. End your turn right after that statement.`;

/** Pinned not-allowed probe instruction template replica (SOLE OWNER: the
 * notAllowedProbeInstructions owner in ./guards-demo.ts — the composed
 * child's single quiet phase). Em dashes are U+2014 (escaped). */
const notAllowedProbeReplica = (
  absoluteSharedCwdFile: string,
  absoluteDeclaredDeliverable: string,
): string =>
  `This run demonstrates the decision-time CLAMP for a capability whose contract carries NO project-writes scope.
Shared workspace file (absolute path): ${absoluteSharedCwdFile}
Declared deliverable (absolute path, NOT touched by this probe): ${absoluteDeclaredDeliverable}

Context: the sibling project-file probe earlier in this engagement created the shared workspace file above and then REMOVED it again - under a phase whose running capability granted the project-files scope.

Rules for THIS run:
1. Attempt to create the SHARED workspace file AT ITS EXACT absolute path with minimal content \u2014 one short heading line. Your phase declares the project-files scope, but this capability's contract does not back it - the scope class is INVISIBLE at the source, so the attempt must come back refused.
2. STATE WHAT THE REFUSAL REPORTED in your reply, including which capability the refusal attributed.
3. DO NOT retry the same target and DO NOT write the declared deliverable. End your turn right after that statement.`;

/** Pinned tmp-parity instruction template replica (SOLE OWNER: the
 * tmpParityInstructions owner in ./guards-demo.ts). Em dashes are U+2014
 * (escaped). */
const tmpParityReplica = (absoluteScratchFile: string): string =>
  `This run demonstrates the /tmp/ parity class under a phase that declares NO permissions at all.
Scratch file (absolute path): ${absoluteScratchFile}

Rules for THIS run:
1. Create the scratch file AT THAT EXACT absolute path with minimal content \u2014 a short heading line.
2. State in your reply that the scratch area stayed open DESPITE the phase declaring no permissions at all \u2014 the invariant this probe exists to demonstrate: /tmp/ parity precedes every other rule.
3. Do not attempt any other write. End your turn right after that statement.`;

/** Pinned summary template replica (SOLE OWNER: the summaryInstructions
 * owner in ./guards-demo.ts): variant A (iterations >= 2) names the observed
 * run count; variant B (=== 1) is the graceful armed-but-not-triggered
 * wording. No third variant, ever. The five trailing booleans degrade each
 * gate-probe observation sentence individually (wording only — never a hard
 * failure). Em dashes are U+2014 (escaped). */
const summaryReplica = (
  absoluteArtifact: string,
  iterations: number,
  fileConfirmed: boolean,
  strayAbsent: boolean,
  allowPresent: boolean,
  projectPresent: boolean,
  notAllowedTargetAbsent: boolean,
  tmpPresent: boolean,
): string => {
  const placementLine = fileConfirmed
    ? "The deliverable is present at (absolute path):"
    : "The declared deliverable path is (absolute):";
  const outcome =
    iterations >= 2
      ? `The guard demonstration has finished after ${iterations} runs: the engine's expectation guard DENIED first-pass settlement \u2014 the declared deliverable was missing \u2014 and FORCED the corrective re-run until the file existed.`
      : `The guard demonstration has finished after 1 run: the expectation guard's loop was ARMED but NOT triggered \u2014 the deliverable landed on the very first run, so the engine settled it immediately.`;
  const observations = [
    strayAbsent
      ? "the deny probe's stray was refused and left ABSENT on disk"
      : "the deny probe's stray could not be confirmed absent (degraded wording)",
    allowPresent
      ? "the allow probe's declared artifact is PRESENT"
      : "the allow probe's artifact could not be confirmed present (degraded wording)",
    projectPresent
      ? "the project-file probe's workspace file was confirmed PRESENT before the self-clean removed it"
      : "the project-file probe's workspace file could not be confirmed present (degraded wording)",
    notAllowedTargetAbsent
      ? "the not-allowed probe left the shared workspace target ABSENT - the refusal held"
      : "the not-allowed probe's shared target could not be confirmed absent (degraded wording)",
    tmpPresent
      ? "the tmp-parity scratch is PRESENT under /tmp/ despite the undeclared phase"
      : "the tmp-parity scratch could not be confirmed present (degraded wording)",
  ];
  return `${outcome}
${placementLine}
${absoluteArtifact}
Gate-probe observations:
${observations.map((line) => `- ${line}`).join("\n")}
1. State in one short sentence what was demonstrated, naming the five gate probes above.
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

// ─── Denial-shape fixture roots (hermetic fixture doctrine) ────────────
// Literal absolute POSIX roots for VERDICT-shaped consult targets: they
// escape the OS /tmp/ prefix by construction (any /tmp/-derived target
// would be parity-admitted before span/phase judgment), and resolve()
// normalizes them to themselves (byte-exact round-trip). Row-local
// literals - no module-owned token duplicates them.

const FIXTURE_SLOT_ROOT = "/state/projects/guards-demo-row";
const FIXTURE_WORKSPACE_CWD = "/workspace/guards-demo-row";
const FIXTURE_DENY_STRAY_TARGET =
  "/state/projects/guards-demo/deny-stray-fixture.md";
const FIXTURE_SLOT_STRAY_TARGET =
  "/state/projects/guards-demo/slot-stray-fixture.md";
const FIXTURE_SHARED_CWD_TARGET = "/workspace/guards-demo/shared-target.txt";

// ─── Born golden replica builders (first home of the denial-line goldens) ─
// Each mirrors its named renderer in ../capability/guards/write-gate.ts
// BYTE-FOR-BYTE over the grown phase line (survivors in declaration order,
// the scope element appended LAST iff non-null, join-or-"none", the closing
// /tmp/ parity clause). The renderer is untouched by this suite's step —
// the byte-parity claim is exercised against the REAL decideWrite verdict
// bytes, never against hand-typed strings alone. \u2014 arrives escaped
// identically on both sides.

/** Denial-line replica builder (SOLE OWNER: renderPhaseDenial in
 * ../capability/guards/write-gate.ts). */
const replicaPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
): string => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${parts.length === 0 ? "none" : parts.join(", ")}. Scratch files under /tmp/ stay open.`;
};

/** Denial-line replica builder (SOLE OWNER: renderCapabilityDenial in
 * ../capability/guards/write-gate.ts). */
const replicaCapabilityDenial = (
  name: string,
  writesRawTokens: readonly string[],
  workspaceCwd: string | null,
): string => {
  const parts: string[] = [...writesRawTokens];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
  return `Writing is refused during capability '${name}'. Allowed targets: ${parts.length === 0 ? "none" : parts.join(", ")}. Scratch files under /tmp/ stay open.`;
};

/** Denial-line replica builder (SOLE OWNER: renderNoSpanDenial in
 * ../capability/guards/write-gate.ts — the U+2014 em dash arrives escaped
 * in the module literal; compared UNESCAPED here, the established
 * comparison idiom). */
const replicaNoSpanDenial = (): string =>
  `Writing is refused \u2014 no capability span is active. Allowed targets: none. Scratch files under /tmp/ stay open.`;

/** Engine-composed prompt texts (marker line + instructions, verbatim the
 * phase engine's composition; corrective notes sit strictly AFTER the
 * baseline). */
const greetingPromptText = (): string =>
  `${renderPhaseMarker("greeting")}\n${GREETING_REPLICA}`;
const guardProbePromptText = (absoluteArtifact: string): string =>
  `${renderPhaseMarker("guard-probe")}\n${guardProbeReplica(absoluteArtifact)}`;
const denyPromptText = (
  absoluteLegalArtifact: string,
  absoluteStrayArtifact: string,
): string =>
  `${renderPhaseMarker("deny")}\n${denyReplica(
    absoluteLegalArtifact,
    absoluteStrayArtifact,
  )}`;
const allowPromptText = (absoluteArtifact: string): string =>
  `${renderPhaseMarker("allow")}\n${allowReplica(absoluteArtifact)}`;
const projectFilePromptText = (absoluteCwdFile: string): string =>
  `${renderPhaseMarker("project-file")}\n${projectFileReplica(absoluteCwdFile)}`;
const notAllowedProbePromptText = (
  absoluteSharedCwdFile: string,
  absoluteDeclaredDeliverable: string,
): string =>
  `${renderPhaseMarker("project-file-not-allowed-probe")}\n${notAllowedProbeReplica(
    absoluteSharedCwdFile,
    absoluteDeclaredDeliverable,
  )}`;
const tmpParityPromptText = (absoluteScratchFile: string): string =>
  `${renderPhaseMarker("tmp-parity")}\n${tmpParityReplica(absoluteScratchFile)}`;
const summaryPromptText = (
  absoluteArtifact: string,
  iterations: number,
  fileConfirmed: boolean,
  strayAbsent: boolean,
  allowPresent: boolean,
  projectPresent: boolean,
  notAllowedTargetAbsent: boolean,
  tmpPresent: boolean,
): string =>
  `${renderPhaseMarker("summary")}\n${summaryReplica(
    absoluteArtifact,
    iterations,
    fileConfirmed,
    strayAbsent,
    allowPresent,
    projectPresent,
    notAllowedTargetAbsent,
    tmpPresent,
  )}`;

/** The span-stamp payload exactly as the base seam records it (contents
 * checked against the RENDERER owner directly — reference, not
 * reconstructed bytes). */
const markerPayload = (label: string = "guards-demo"): unknown => ({
  customType: CUSTOM_TYPE_REPLICA,
  content: renderCapabilityMarker(label),
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

/** Pinned empty-contract fixture span: confers no governance - purely the
 * structural precondition a non-empty declaration attaches against. */
const FIXTURE_SPAN = {
  name: "host-fixture",
  writes: [],
  allowProjectWrites: false,
};

/** Build the SINGLE host handle plus the construction round backing it.
 * Span-precondition accommodation: the stored closure is driven ONCE so
 * the real seam stamps the minted execution state onto the from-services
 * carrier, the state is recovered cast-free (descriptor read plus
 * instanceof), and the pinned fixture span enters before any guarded
 * phase runs. The RECOVERED STAMPED STATE rides out additively: trajectory
 * rows drive the REAL write-gate predicate over FRESH snapshot() readings
 * of it mid-pass. */
async function host(): Promise<{
  instance: PioSession;
  round: Round;
  state: SessionExecutionState;
}> {
  const instance = await PioSession.create(process.cwd());
  const round = lastRound();
  const factory =
    sdkKit.state.storedFactories[sdkKit.state.storedFactories.length - 1];
  if (!factory) throw new Error("expected a stored runtime factory");
  await factory({
    cwd: process.cwd(),
    agentDir: "/agent/dir",
    sessionManager: { getCwd: () => process.cwd() },
    sessionStartEvent: undefined,
  });
  const carrier =
    sdkKit.state.stampCarriers[sdkKit.state.stampCarriers.length - 1];
  if (!carrier) throw new Error("expected a stamped carrier handle");
  const stamped = Object.getOwnPropertyDescriptor(
    carrier,
    EXECUTION_STATE_STAMP,
  )?.value;
  if (!(stamped instanceof SessionExecutionState)) {
    throw new Error("expected the carrier to carry a minted execution state");
  }
  stamped.enterCapability(FIXTURE_SPAN);
  return { instance, round, state: stamped };
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

/** Self-consistent placement derivation for the FIVE live gate probes, via
 * the SAME public channels (slot-relative tokens resolved under the
 * project slot; the cwd basename and the pinned /tmp/ basename resolved
 * against their own anchors). Computed after the row-scoped chdir — the
 * controlled workspace cwd binds the anchor. */
function probePlacements(): {
  absDenyArtifact: string;
  absDenyStray: string;
  absAllowArtifact: string;
  absCwdFile: string;
  absTmpScratch: string;
  absChildDeclared: string;
  cwd: string;
} {
  const { projectSlot } = artifactPlacement();
  return {
    absDenyArtifact: join(projectSlot, GUARDS_DEMO_DENY_ARTIFACT),
    absDenyStray: join(projectSlot, GUARDS_DEMO_DENY_STRAY),
    absAllowArtifact: join(projectSlot, GUARDS_DEMO_ALLOW_ARTIFACT),
    absCwdFile: join(process.cwd(), GUARDS_DEMO_PROJECT_PROBE_FILE),
    absTmpScratch: join("/tmp", GUARDS_DEMO_TMP_PARITY_FILE),
    absChildDeclared: join(
      projectSlot,
      GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT,
    ),
    cwd: process.cwd(),
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
  it("C1 full happy chain (BINDING leg): pass one skips the write => the engine denies settlement and the pass-two prompt carries the IDENTICAL baseline PLUS the pinned DELIMITED corrective block (delimiter line above the unchanged body; run count 1, naming the tmpdir-ABSOLUTE path) => pass two commits the REAL fs write and settles at iterations === 2, then the FIVE gate probes run in pinned order (deny, allow, project-file, the composed not-allowed child, tmp-parity LAST) with their MID-PASS real-predicate consults (stray refused FULL-LINE as undeclared-while-covered, admission undefined, exclusive scope-element-only listing, the capability-named child refusal with the scope element ABSENT, /tmp/ healing vantage) => ok:true with the ABSOLUTE settled outputs.report, the terminal record carries version 0.2.0 and exit 0 — EXACTLY 9 prompts + EXACTLY TWO span stamps (child marker strictly between the project-file and child-phase prompts) = 11 unified-timeline entries", async () => {
    const placement = artifactPlacement();
    const probes = probePlacements();
    const { instance, round, state } = await host();
    // Cross-run healing row: a stale real-/tmp scratch seeded BEFORE the
    // run simulates a crashed prior run; the capability's error-swallowed
    // pre-phase sweep must leave it ABSENT by the time the pass seeds.
    await writeFile(probes.absTmpScratch, "stale scratch\n");
    let strayVerdict: WriteGateVerdict | undefined;
    let allowAdmission: WriteGateVerdict | undefined;
    let exclusiveVerdict: WriteGateVerdict | undefined;
    let childRefusal: WriteGateVerdict | undefined;
    let tmpAbsentBeforeSeed = false;
    // Trajectory: greeting quiet; probe pass ONE quiet (no events, no fs);
    // probe pass TWO commits the REAL fs write + the synthetic settle pair;
    // the four parent probes commit their REAL fs writes + settle pairs with
    // the MID-PASS real-predicate consults captured for post-run assertion;
    // the child pass writes NOTHING (the refusal held — disk-truth duty);
    // summary quiet.
    scriptRuns(round, quietSettle());
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absDenyArtifact, "# Deny legal\n");
      emit(round, ...writeSettle(probes.absDenyArtifact, "w-deny"));
      // MID-PASS consultation (fresh snapshot over the shared state):
      // the contract-covered stray is UNDECLARED during the deny phase -
      // the FULL-LINE refusal is the pinned leg-4 narrowing LIVE. The
      // consult target is a LITERAL NON-/TMP root (the row tree itself sits
      // under the OS /tmp/ prefix, which the parity class would admit);
      // the SURVIVOR in the asserted line still carries the REAL TREE's
      // declared artifact.
      strayVerdict = decideWrite(state.snapshot(), "write", {
        path: FIXTURE_DENY_STRAY_TARGET,
      });
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
      // The declared artifact is ADMITTED (no verdict) - the row-tree path
      // admits by coverage and by the /tmp/ parity alike; the pinned
      // observable is the admission itself.
      allowAdmission = decideWrite(state.snapshot(), "write", {
        path: probes.absAllowArtifact,
      });
    });
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Project file probe\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-project"));
      // EXCLUSIVE governance proof: a slot-pattern target DURING the
      // flag-only phase refuses with the scope element as the ONLY listing
      // element (literal non-/tmp target; the scope element text carries
      // the REAL controlled cwd anchor).
      exclusiveVerdict = decideWrite(state.snapshot(), "write", {
        path: FIXTURE_SLOT_STRAY_TARGET,
      });
    });
    round.passes.push(async (): Promise<void> => {
      // The model honored the refusal: NO disk write in this pass.
      emit(round, ...quietSettle());
      // Inside the CHILD span: the shared cwd target (literal non-/tmp
      // standing in for the real workspace-cwd file) refuses CAPABILITY-
      // NAMED - the unbacked flag renders the scope class invisible at the
      // source; the listing carries the RAW contract token.
      childRefusal = decideWrite(state.snapshot(), "write", {
        path: FIXTURE_SHARED_CWD_TARGET,
      });
    });
    round.passes.push(async (): Promise<void> => {
      // Healing vantage: post-sweep, pre-model-write the scratch must be
      // ABSENT (cross-run healing of the stale seed).
      tmpAbsentBeforeSeed = !existsSync(probes.absTmpScratch);
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    // Prompt-total arithmetic: 1 + 2 + 4 + 1 + 1 = 9 — a wrong total
    // reveals a corrective block attributed to the wrong phase or a stray
    // prompt.
    expect(round.session.prompt).toHaveBeenCalledTimes(9);
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
    // The five gate probes in pinned order, all-baseline (no corrective
    // blocks reach them on the happy trajectory).
    expect(sentAt(round, 3)).toBe(
      denyPromptText(probes.absDenyArtifact, probes.absDenyStray),
    );
    expect(sentAt(round, 4)).toBe(allowPromptText(probes.absAllowArtifact));
    expect(sentAt(round, 5)).toBe(projectFilePromptText(probes.absCwdFile));
    expect(sentAt(round, 6)).toBe(
      notAllowedProbePromptText(probes.absCwdFile, probes.absChildDeclared),
    );
    expect(sentAt(round, 7)).toBe(tmpParityPromptText(probes.absTmpScratch));
    expect(sentAt(round, 8)).toBe(
      summaryPromptText(
        placement.absoluteArtifact,
        2,
        true,
        true,
        true,
        true,
        true,
        true,
      ),
    );

    // Span stamps: EXACTLY TWO (parent + child), the pinned payloads.
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    expect(round.session.sendCustomMessage).toHaveBeenNthCalledWith(
      1,
      markerPayload("guards-demo"),
    );
    expect(round.session.sendCustomMessage).toHaveBeenNthCalledWith(
      2,
      markerPayload("project-file-not-allowed"),
    );
    // Parent STRICTLY BEFORE the first prompt (log-order pin).
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
    // Child STRICTLY BETWEEN the project-file prompt (index 5) and the
    // child-phase prompt (index 6) — the double span boundary is visible
    // in transcript order.
    expect(round.session.prompt.mock.invocationCallOrder[5]).toBeLessThan(
      round.session.sendCustomMessage.mock.invocationCallOrder[1],
    );
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[1],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[6]);
    // The unified timeline confirms the same ordering end to end:
    // EXACTLY 11 entries.
    expect(round.timeline).toEqual([
      { kind: "custom", payload: markerPayload("guards-demo") },
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
        text: denyPromptText(probes.absDenyArtifact, probes.absDenyStray),
      },
      { kind: "prompt", text: allowPromptText(probes.absAllowArtifact) },
      { kind: "prompt", text: projectFilePromptText(probes.absCwdFile) },
      {
        kind: "custom",
        payload: markerPayload("project-file-not-allowed"),
      },
      {
        kind: "prompt",
        text: notAllowedProbePromptText(
          probes.absCwdFile,
          probes.absChildDeclared,
        ),
      },
      { kind: "prompt", text: tmpParityPromptText(probes.absTmpScratch) },
      {
        kind: "prompt",
        text: summaryPromptText(
          placement.absoluteArtifact,
          2,
          true,
          true,
          true,
          true,
          true,
          true,
        ),
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

    // Mid-pass real-predicate consults (captured DURING the passes; the
    // asserted bytes ARE the ToolCallEventResult.reason the real
    // interceptor would return).
    expect(strayVerdict).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("deny", [probes.absDenyArtifact], null),
    });
    expect(allowAdmission).toBeUndefined();
    expect(exclusiveVerdict).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("project-file", [], probes.cwd),
    });
    expect(childRefusal).toStrictEqual({
      block: true,
      reason: replicaCapabilityDenial(
        "project-file-not-allowed",
        [GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT],
        null,
      ),
    });
    expect(tmpAbsentBeforeSeed).toBe(true);

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
      version: "0.2.0",
      source: "builtin",
    });
    expect(record.outputs).toEqual({
      report: placement.absoluteArtifact,
    });
    expect(record.errors).toBeUndefined();
    // Disk truth (post-run): the committed guard-probe content; the deny
    // stray ABSENT; the allow artifact PRESENT; the project-file probe file
    // GONE (self-clean removed it and the child's refusal held); the
    // /tmp/ scratch RESIDUE intentionally left within the run.
    expect(readFileSync(placement.absoluteArtifact, "utf8")).toBe(
      "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
    );
    expect(existsSync(probes.absDenyStray)).toBe(false);
    expect(existsSync(probes.absAllowArtifact)).toBe(true);
    expect(existsSync(probes.absCwdFile)).toBe(false);
    expect(existsSync(probes.absTmpScratch)).toBe(true);
    // Row-local hygiene sweep of the standing real-/tmp exception (the
    // residue assertion above already landed).
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });

  it("C2 disobedient-compliance: the model commits the file on PASS ONE (real fs write inside the scripted pass) => the gate passes on the FIRST break — all-baseline prompt texts, ZERO corrective blocks, iterations === 1 — the five gate probes ride along all-baseline, and the SUMMARY observes the graceful ARMED-BUT-NOT-TRIGGERED variant (variant B) over the extended signature — ok:true, EXACTLY 8 prompts + 2 stamps (1 + 1 + 4 + 1 + 1)", async () => {
    const placement = artifactPlacement();
    const probes = probePlacements();
    const { instance, round } = await host();
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nLanded on the first run.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absDenyArtifact, "# Deny legal\n");
      emit(round, ...writeSettle(probes.absDenyArtifact, "w-deny"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
    });
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Project file probe\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-project"));
    });
    // The child pass writes NOTHING (the refusal held — disk-truth duty).
    scriptRuns(round, quietSettle());
    // The tmp-parity pass commits the REAL fs seed (disk-truth duty).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    // 1 + 1 + 4 + 1 + 1 = 8 — a wrong total reveals a corrective block or a
    // stray prompt anywhere in the five-probe shape.
    expect(round.session.prompt).toHaveBeenCalledTimes(8);
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    // All-baseline: strict equality PROVES zero corrective blocks.
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    expect(sentAt(round, 2)).toBe(
      denyPromptText(probes.absDenyArtifact, probes.absDenyStray),
    );
    expect(sentAt(round, 3)).toBe(allowPromptText(probes.absAllowArtifact));
    expect(sentAt(round, 4)).toBe(projectFilePromptText(probes.absCwdFile));
    expect(sentAt(round, 5)).toBe(
      notAllowedProbePromptText(probes.absCwdFile, probes.absChildDeclared),
    );
    expect(sentAt(round, 6)).toBe(tmpParityPromptText(probes.absTmpScratch));
    // Graceful-path assertion: the composed variant-B statement (armed but
    // not triggered), concrete count 1, over the extended signature.
    expect(sentAt(round, 7)).toBe(
      summaryPromptText(
        placement.absoluteArtifact,
        1,
        true,
        true,
        true,
        true,
        true,
        true,
      ),
    );

    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(2);
    expect(round.session.sendCustomMessage).toHaveBeenNthCalledWith(
      1,
      markerPayload("guards-demo"),
    );
    expect(round.session.sendCustomMessage).toHaveBeenNthCalledWith(
      2,
      markerPayload("project-file-not-allowed"),
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
    // Row-local hygiene sweep of the standing real-/tmp exception.
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
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

  it("C4 repeatability: a pre-existing artifact (REAL fs seed BEFORE call()) is REMOVED by the repeatable reset before the guarded phase — observable: during the first guard-probe run a sync fs read reports ABSENT — and the first-pass gate fires IDENTICALLY (same corrective block, same trajectory as the unseeded happy chain over the full five-probe shape), ok:true, EXACTLY 9 prompts", async () => {
    const placement = artifactPlacement();
    const probes = probePlacements();
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
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absDenyArtifact, "# Deny legal\n");
      emit(round, ...writeSettle(probes.absDenyArtifact, "w-deny"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
    });
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Project file probe\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-project"));
    });
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    expect(observedAbsentDuringPassOne).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(9);
    // Identical trajectory to the unseeded happy chain: the same
    // baseline/corrective framing over the same absolute path, the five
    // probes riding along all-baseline.
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    expect(sentAt(round, 2)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(1, [placement.absoluteArtifact])}`,
    );
    expect(sentAt(round, 3)).toBe(
      denyPromptText(probes.absDenyArtifact, probes.absDenyStray),
    );
    expect(sentAt(round, 7)).toBe(tmpParityPromptText(probes.absTmpScratch));
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
    expect(existsSync(probes.absTmpScratch)).toBe(true);
    // Row-local hygiene sweep of the standing real-/tmp exception.
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });
});

// ─── F rows: instruction framing (byte replicas) ──────────────────────

describe("instruction framing (F rows)", () => {
  it("F1 pinned BYTE REPLICA of the first-pass guard-probe instructions (marker-leading baseline = renderPhaseMarker('guard-probe') + '\\n' + template), the FIVE new probe templates pinned against their replicas, and the MARKER-LEADING INVARIANT holds for EVERY run's text in ALL NINE runs (happy-chain trajectory)", async () => {
    const placement = artifactPlacement();
    const probes = probePlacements();
    const { instance, round } = await host();
    scriptRuns(round, quietSettle(), quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nForced re-run.\n",
      );
      emit(round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absDenyArtifact, "# Deny legal\n");
      emit(round, ...writeSettle(probes.absDenyArtifact, "w-deny"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
    });
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Project file probe\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-project"));
    });
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
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
    // The five new probe templates pinned against their replicas (byte
    // parity; \u2014 escaped identically on both sides).
    expect(sentAt(round, 3)).toBe(
      denyPromptText(probes.absDenyArtifact, probes.absDenyStray),
    );
    expect(sentAt(round, 4)).toBe(allowPromptText(probes.absAllowArtifact));
    expect(sentAt(round, 5)).toBe(projectFilePromptText(probes.absCwdFile));
    expect(sentAt(round, 6)).toBe(
      notAllowedProbePromptText(probes.absCwdFile, probes.absChildDeclared),
    );
    expect(sentAt(round, 7)).toBe(tmpParityPromptText(probes.absTmpScratch));
    // Marker-leading invariant over EVERY run's text in all nine runs:
    // first physical line === renderPhaseMarker(<phase id>).
    const phaseIds = [
      "greeting",
      "guard-probe",
      "guard-probe",
      "deny",
      "allow",
      "project-file",
      "project-file-not-allowed-probe",
      "tmp-parity",
      "summary",
    ];
    for (let i = 0; i < 9; i++) {
      const text = sentAt(round, i);
      const firstLine = text.split("\n", 1)[0] ?? "";
      expect(firstLine).toBe(renderPhaseMarker(phaseIds[i] ?? ""));
    }
    // Row-local hygiene sweep of the standing real-/tmp exception.
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });

  it("F2 BOTH composed summary statements pinned over the EXTENDED signature: variant A with the CONCRETE observed run count (2) on the happy trajectory, variant B (armed-but-not-triggered, count 1) on the disobedient trajectory — never a third variant, never a hard failure on model non-determinism", async () => {
    const placement = artifactPlacement();
    const probes = probePlacements();
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
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absDenyArtifact, "# Deny legal\n");
      emit(round, ...writeSettle(probes.absDenyArtifact, "w-deny"));
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
    });
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Project file probe\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-project"));
    });
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(sentAt(round, 8)).toBe(
      `${renderPhaseMarker("summary")}\n${summaryReplica(placement.absoluteArtifact, 2, true, true, true, true, true, true)}`,
    );

    // Variant B (iterations === 1): the disobedient-compliant chain on a
    // fresh host (single-host per host() call; two mints total here).
    const second = await host();
    const secondProbes = probePlacements();
    scriptRuns(second.round, quietSettle());
    second.round.passes.push(async (): Promise<void> => {
      await seedArtifact(
        placement.absoluteArtifact,
        "# Guard Demo\n\nLanded first run.\n",
      );
      emit(second.round, ...writeSettle(placement.absoluteArtifact, "w1"));
    });
    second.round.passes.push(async (): Promise<void> => {
      await seedArtifact(secondProbes.absDenyArtifact, "# Deny legal\n");
      emit(
        second.round,
        ...writeSettle(secondProbes.absDenyArtifact, "w-deny"),
      );
    });
    second.round.passes.push(async (): Promise<void> => {
      await seedArtifact(secondProbes.absAllowArtifact, "# Allow\n");
      emit(
        second.round,
        ...writeSettle(secondProbes.absAllowArtifact, "w-allow"),
      );
    });
    second.round.passes.push(async (): Promise<void> => {
      await writeFile(secondProbes.absCwdFile, "# Project file probe\n");
      emit(second.round, ...writeSettle(secondProbes.absCwdFile, "w-project"));
    });
    scriptRuns(second.round, quietSettle());
    second.round.passes.push(async (): Promise<void> => {
      await writeFile(secondProbes.absTmpScratch, "# Tmp parity\n");
      emit(second.round, ...writeSettle(secondProbes.absTmpScratch, "w-tmp"));
    });
    scriptRuns(second.round, quietSettle());
    const secondCap = new GuardsDemoCapability({ session: second.instance });
    const secondResult = await secondCap.run();
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) throw new Error("unreachable");
    expect(sentAt(second.round, 7)).toBe(
      `${renderPhaseMarker("summary")}\n${summaryReplica(placement.absoluteArtifact, 1, true, true, true, true, true, true)}`,
    );
    // The graceful wording IS present (variant-B signature phrase).
    expect(sentAt(second.round, 7)).toContain("ARMED but NOT triggered");
    expect(sdkKit.state.rounds).toHaveLength(2);
    // Row-local hygiene sweep of the standing real-/tmp exception (both
    // legs seeded the same pinned scratch name).
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });
});

// ─── Module-driven write-gate rows (real state + real predicate) ───────

describe("module-driven write-gate rows (real execution state + decideWrite composition)", () => {
  /** Hand-built plain-data sources mirroring the grown contract literal
   * (row-local copy keeps the pin meaningful; SOLE OWNER: the contract
   * field on GuardsDemoCapability in ./guards-demo.ts). */
  const DEMO_SOURCES = {
    name: "guards-demo",
    writes: ["guards-demo/*.md"],
    allowProjectWrites: true,
  };

  /** One fresh per-row execution state over LITERAL NON-/TMP ANCHORS
   * (hermetic fixture doctrine — the OS /tmp/ parity class would admit
   * any row-tree target before judgment). snapshot() still resolves the
   * closures FRESH per call: the freshness property holds structurally,
   * with the literals standing in for the row-scoped channels. */
  function drivenState(): {
    state: SessionExecutionState;
    slotRoot: string;
    cwd: string;
    covered: string;
    uncovered: string;
    cwdFile: string;
  } {
    const state = new SessionExecutionState({
      projectSlotRoot: () => FIXTURE_SLOT_ROOT,
      workspaceCwd: () => FIXTURE_WORKSPACE_CWD,
    });
    const anchors = state.snapshot().paths;
    const slotRoot = anchors.projectSlotRoot;
    const workspaceCwd = anchors.workspaceCwd;
    return {
      state,
      slotRoot,
      cwd: workspaceCwd,
      covered: join(slotRoot, GUARDS_DEMO_ARTIFACT),
      // Row-local uncovered target: the roster constraint is
      // slot-relative AND pattern-uncovered (no roster constant satisfies
      // both at once, so the value stays row-local — the constants key
      // every TRAJECTORY row instead).
      uncovered: join(slotRoot, "outside-the-pattern", "scratch.md"),
      cwdFile: join(workspaceCwd, "driven-probe.txt"),
    };
  }

  it("clamped: an over-layer co-declared scratch entry NEVER covered by the contract is INVISIBLE at decision time - absent from the refusal listing, refused AS IF UNDECLARED (capability named, both listing elements)", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    d.state.attachPhase("clamped", [d.uncovered], false);
    const verdict = decideWrite(d.state.snapshot(), "write", {
      path: d.uncovered,
    });
    d.state.detachPhase();
    d.state.exitCapability();
    expect(verdict).toStrictEqual({
      block: true,
      reason: replicaCapabilityDenial(
        "guards-demo",
        ["guards-demo/*.md"],
        d.cwd,
      ),
    });
  });

  it("inherited: NOTHING attached confers no phase governance - the demo's own sources govern unchanged: the pattern hit is ADMITTED, the cwd-scope target is ADMITTED, the miss-target refuses CAPABILITY-NAMED with BOTH listing elements", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    const hit = decideWrite(d.state.snapshot(), "write", { path: d.covered });
    const scope = decideWrite(d.state.snapshot(), "edit", {
      path: d.cwdFile,
    });
    const miss = decideWrite(d.state.snapshot(), "write", {
      path: d.uncovered,
    });
    d.state.exitCapability();
    expect(hit).toBeUndefined();
    expect(scope).toBeUndefined();
    expect(miss).toStrictEqual({
      block: true,
      reason: replicaCapabilityDenial(
        "guards-demo",
        ["guards-demo/*.md"],
        d.cwd,
      ),
    });
  });

  it("no-span: drained to depth 0 via the frozen reset() FIRST (deliberate TEST choice on the documented handle-reset-hygiene path - NOT a production precedent) yields the empty-set NO-SPAN refusal line (full-line golden with the escaped U+2014 compare)", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    // Drain to depth 0 BEFORE the consultation (uniform setup, deliberate
    // reset-first idiom).
    d.state.reset();
    const verdict = decideWrite(d.state.snapshot(), "write", {
      path: d.cwdFile,
    });
    expect(verdict).toStrictEqual({
      block: true,
      reason: replicaNoSpanDenial(),
    });
  });

  it("unbacked flag is INVISIBLE: child-shaped sources (contract flag ABSENT) with a flag-PRESENT phase refuse the cwd target CAPABILITY-NAMED, byte-identical to the phase-null reading, with the scope element ABSENT from the listing", () => {
    const d = drivenState();
    // Child-shaped sources - plain data mirroring the composed child's
    // contract stub (the concrete wildcard-free token; the scope flag
    // ABSENT normalizes to false at span entry).
    const childShaped = {
      name: "project-file-not-allowed",
      writes: ["guards-demo/not-allowed-child.md"],
      allowProjectWrites: false,
    };
    d.state.enterCapability(childShaped);
    d.state.attachPhase("not-allowed-probe", [], true);
    const flagged = decideWrite(d.state.snapshot(), "write", {
      path: d.cwdFile,
    });
    d.state.detachPhase();
    const unflagged = decideWrite(d.state.snapshot(), "write", {
      path: d.cwdFile,
    });
    d.state.exitCapability();
    expect(flagged).toStrictEqual({
      block: true,
      reason: replicaCapabilityDenial(
        "project-file-not-allowed",
        ["guards-demo/not-allowed-child.md"],
        null,
      ),
    });
    // Byte-identical to the phase-null reading (the clamp at the source).
    expect(unflagged).toStrictEqual(flagged);
    expect(flagged?.reason ?? "").not.toContain("project files under ");
  });

  it("backed flag admits the class ALONE: demo sources plus a flag-declaring phase (NO paths) admit the workspace-cwd target", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    d.state.attachPhase("scope-only", [], true);
    const verdict = decideWrite(d.state.snapshot(), "write", {
      path: d.cwdFile,
    });
    d.state.detachPhase();
    d.state.exitCapability();
    expect(verdict).toBeUndefined();
  });

  it("flag-only attach confers EXCLUSIVE class governance: the slot-pattern target is REFUSED with the phase named and the scope element as the ONLY listing element", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    d.state.attachPhase("scope-only", [], true);
    const verdict = decideWrite(d.state.snapshot(), "write", {
      path: d.covered,
    });
    d.state.detachPhase();
    d.state.exitCapability();
    expect(verdict).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("scope-only", [], d.cwd),
    });
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
      version: "0.2.0",
      inputs: [],
      outputs: [{ name: "report", paramKey: "report" }],
      writes: ["guards-demo/*.md"],
      allowProjectWrites: true,
    });
  });

  it("runtime export surface is EXACTLY EIGHT keys: default plus the seven token constants (the nested child class is NOT exported)", async () => {
    const mod = await import("./guards-demo.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "GUARDS_DEMO_ALLOW_ARTIFACT",
      "GUARDS_DEMO_ARTIFACT",
      "GUARDS_DEMO_DENY_ARTIFACT",
      "GUARDS_DEMO_DENY_STRAY",
      "GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT",
      "GUARDS_DEMO_PROJECT_PROBE_FILE",
      "GUARDS_DEMO_TMP_PARITY_FILE",
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

  it("the SEVEN-token constant roster holds: each constant's VALUE occurs EXACTLY ONCE in the module source (split-count idiom — no regex escaping of metacharacters, no duplicated literals; every other reference rides the constant identifier)", () => {
    const roster = [
      GUARDS_DEMO_ARTIFACT,
      GUARDS_DEMO_DENY_ARTIFACT,
      GUARDS_DEMO_DENY_STRAY,
      GUARDS_DEMO_ALLOW_ARTIFACT,
      GUARDS_DEMO_PROJECT_PROBE_FILE,
      GUARDS_DEMO_TMP_PARITY_FILE,
      GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT,
    ];
    for (const token of roster) {
      expect(src.split(token).length - 1).toBe(1);
    }
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
