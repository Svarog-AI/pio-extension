// Hermetic unit suite for the permanent guards-demo built-in
// (capabilities/guards-demo.ts). Self-contained island (sibling suites are
// self-contained — no cross-suite harness imports): ONE scripted-event top
// world in this file.
//
// SCRIPTED-EVENT TOP WORLD (research/compose-suite idiom): a fake SDK root
// mocking EXACTLY the eight faked value symbols drives PioSession.create(cwd)
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
// /tmp/ prefix (the row-scoped tmp trees sit under it; in the strict-
// confirmation world /tmp/ targets are admitted ONLY by a phase that
// declares the scratch class, so the fixtures keep their roots neutral -
// resolve() is identity on literals, so they round-trip byte-exactly); the SURVIVOR listings in the asserted lines still carry
// the REAL TREE's declared paths (the live attachment), and admission-
// shaped consults may ride real-tree targets. The standing
// real-/tmp exception: the pinned scratch name is unique, the capability's
// error-swallowed pre-phase sweep self-heals across runs, and the
// end-of-run scratch state is ABSENT BY DESIGN (the last probe's
// pre-phase sweep removes the admitted residue WITHIN the run); every
// full-trajectory row still carries its OWN hygiene sweep at row end as
// IDEMPOTENT LEGACY HYGIENE (writes, not checks - nothing asserts against
// them).
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
import { composeKernelWritableSet } from "../tools/bash/landlock-ruleset.ts";
import GuardsDemoCapability, {
  GUARDS_DEMO_ALLOW_ARTIFACT,
  GUARDS_DEMO_ARTIFACT,
  GUARDS_DEMO_BASH_ALLOW_ARTIFACT,
  GUARDS_DEMO_BASH_ALLOW_DIR,
  GUARDS_DEMO_DENY_ARTIFACT,
  GUARDS_DEMO_DENY_STRAY,
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
    state.storedFactories = [];
    state.stampCarriers = [];
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
 * denyInstructions owner in ./guards-demo.ts - the REFUSAL-ONLY form: the
 * probe performs ONLY the refused attempt and contains NO write of any kind,
 * so its phase declares NOTHING; a single PARAMETER). Three beats:
 * attempt-imperative / expectation / one-sentence verdict; no em dash occurs
 * in the body. */
const denyReplica = (absoluteStrayArtifact: string): string =>
  `Attempt to write a file ${absoluteStrayArtifact}. The expectation is that it's rejected. Describe in one sentence if it's satisfied.`;

/** Pinned allow-probe instruction template replica (SOLE OWNER: the
 * allowInstructions owner in ./guards-demo.ts). Three beats: imperative /
 * expectation / one-sentence verdict. Em dashes are U+2014 (escaped). */
const allowReplica = (absoluteArtifact: string): string =>
  `Write a file ${absoluteArtifact}. The expectation is that the write is ADMITTED with nothing special declared beyond the path itself \u2014 the phase declared exactly this one path. Describe in one sentence if it's satisfied.`;

/** Pinned project-file instruction template replica (SOLE OWNER: the
 * projectFileInstructions owner in ./guards-demo.ts). Three beats:
 * imperative / expectation / one-sentence verdict. Em dashes are U+2014
 * (escaped). */
const projectFileReplica = (absoluteCwdFile: string): string =>
  `Write a file ${absoluteCwdFile}. The expectation is that it LANDS with the phase declaring the project-files SCOPE and NO specific paths. Describe in one sentence if it's satisfied.`;

/** Pinned silent-phase probe instruction template replica (SOLE OWNER: the
 * notAllowedInstructions owner in ./guards-demo.ts - the flag-less SILENT
 * plain phase; the universal no-permission byte attributes to NO layer, so
 * the template carries NO capability-attribution mandate). Three beats:
 * imperative / expectation / one-sentence verdict. Em dashes are U+2014
 * (escaped). */
const notAllowedReplica = (absoluteSharedCwdFile: string): string =>
  `Attempt to write a file ${absoluteSharedCwdFile}. The expectation is that the write comes back REFUSED \u2014 this phase declares NOTHING (no paths, no scope flag), and the running capability's own contract flag being TRUE changes nothing \u2014 the refusal states the allowed set as NONE; do not retry the target. Describe in one sentence if it's satisfied.`;

/** Pinned tmp-parity instruction template replica (SOLE OWNER: the
 * tmpParityInstructions owner in ./guards-demo.ts - the DECLARED-scratch
 * form: the grant rides the phase's own scratch flag). Three beats:
 * imperative / expectation / one-sentence verdict. Em dashes are U+2014
 * (escaped). */
const tmpParityReplica = (absoluteScratchFile: string): string =>
  `Write a file ${absoluteScratchFile}. The expectation is that the scratch write is ADMITTED because this phase declares the scratch flag \u2014 the same scratch target is REFUSED in any window where no active phase declares it (the grant is phase-declared, not ambient). Describe in one sentence if it's satisfied.`;

/** Pinned tmp-negative instruction template replica (SOLE OWNER: the
 * tmpNegativeInstructions owner in ./guards-demo.ts - the SILENT
 * scratch-refusal window over the SAME pinned scratch target the
 * tmp-parity probe admitted moments earlier). Three beats: imperative /
 * expectation / one-sentence verdict. Em dashes are U+2014 (escaped). */
const tmpNegativeReplica = (absoluteScratchFile: string): string =>
  `Attempt to write a file ${absoluteScratchFile}. The expectation is that the write comes back REFUSED \u2014 this phase declares NOTHING (no paths, no scope flag, no scratch flag), and the running capability's own contract flag being TRUE changes nothing, while the SAME target was admitted moments earlier by the adjacent probe's OWN declared scratch flag (the grant is phase-declared, not ambient); do not retry the target. Describe in one sentence if it's satisfied.`;

/** Pinned bash-deny instruction template replica (SOLE OWNER: the
 * bashDenyInstructions owner in ./guards-demo.ts - the DUAL-SHAPE SILENT
 * fenced-command refusal over the SHARED stray target the write-tool deny
 * probe refused earlier; ONE parameter - the stray absolute path - SHAPE 1
 * the BARE redirection AS THE WHOLE COMMAND (FULL VOICE: non-zero exit, the
 * diagnostic, the trailing note listing NONE) and SHAPE 2 the SAME
 * redirection SEMICOLON-JOINED with a trailing successful statement (the
 * exit-0 compound: diagnostic visible, note correctly silent by the shipped
 * corner, the file NEVER LANDS)). Three beats: attempt-imperative /
 * expectation / one-sentence verdict; no em dash occurs in the body. */
const bashDenyReplica = (absoluteStrayArtifact: string): string =>
  `Use the bash tool ONLY (never the write or edit tools) to attempt a shell write of a file ${absoluteStrayArtifact} in TWO shapes, each attempted exactly once: first the redirection AS THE WHOLE COMMAND (a bare invocation such as echo x > ${absoluteStrayArtifact}), then the SAME redirection followed by a semicolon and a trailing successful statement (such as echo x > ${absoluteStrayArtifact}; echo ok - the failed redirection fails only its own statement, so the compound exits zero). The expectation is that BOTH commands come back REFUSED - the phase-permissions context of this run names NO writable targets (this phase declares NOTHING), and the kernel fence denies the write at attempt time: the first exits non-zero with a permission error in its own output and ends with a standing restriction note whose allowed-targets listing is NONE, while the second shows the same permission error but exits zero with no trailing restriction note, and the file never exists after either attempt. Do not attempt the target beyond these two shapes. Describe in one sentence if it's satisfied.`;

/** Pinned bash-allow instruction template replica (SOLE OWNER: the
 * bashAllowInstructions owner in ./guards-demo.ts - the SOLE multi-parameter
 * probe template: directory FIRST, artifact second - the .md-directory
 * device over the declared containing directory, with TWO mandated write
 * shapes over the same path). No em dash occurs in the body. */
const bashAllowReplica = (
  absoluteDirectory: string,
  absoluteArtifact: string,
): string =>
  `Use the bash tool ONLY (never the write or edit tools) to create a file ${absoluteArtifact} under the directory ${absoluteDirectory}, in TWO shapes: first a plain shell redirection, then a program that opens the path for write (a standard utility such as touch, cp, or dd - avoid scripting-language interpreters). The expectation is that BOTH writes are ADMITTED - the phase declared the very directory the artifact lives in, so the kernel fence grants that directory and neither command produces a standing restriction note. Describe in one sentence if it's satisfied.`;

/** Pinned bash-project-file instruction template replica (SOLE OWNER: the
 * bashProjectFileInstructions owner in ./guards-demo.ts - the DECLARED
 * project-files SCOPE leg over the SHARED workspace-cwd target). No em dash
 * occurs in the body. */
const bashProjectFileReplica = (absoluteCwdFile: string): string =>
  `Use the bash tool ONLY (never the write or edit tools) to write a file ${absoluteCwdFile} with a shell command. The expectation is that it LANDS - the phase declares the project-files SCOPE, so the kernel fence admits the workspace directory the file sits in. Describe in one sentence if it's satisfied.`;

/** Pinned bash-project-file-not-allowed instruction template replica (SOLE
 * OWNER: the bashProjectFileNotAllowedInstructions owner in ./guards-demo.ts -
 * the SILENT window over the SAME shared cwd target; the do-not-retry mandate
 * rides the template, and the ADDED bare-invocation prescription clause
 * between the imperative and the expectation GUARANTEES the note-bearing
 * tail). No em dash occurs in the body. */
const bashProjectFileNotAllowedReplica = (
  absoluteSharedCwdFile: string,
): string =>
  `Use the bash tool ONLY (never the write or edit tools) to attempt a shell write of a file ${absoluteSharedCwdFile}. Issue the redirection AS THE WHOLE COMMAND (a bare invocation). The expectation is that the command comes back REFUSED - this phase declares NOTHING (no paths, no scope flag), so the kernel fence grants nothing beyond the machine allowance and the output ends with a standing restriction note whose allowed-targets listing is NONE, while the SAME target was admitted earlier by the adjacent probe's OWN declared scope. Do not retry the target. Describe in one sentence if it's satisfied.`;

/** Pinned bash-tmp-parity instruction template replica (SOLE OWNER: the
 * bashTmpParityInstructions owner in ./guards-demo.ts - the DECLARED-scratch
 * fenced-command form: the grant rides the phase's OWN scratch flag). No em
 * dash occurs in the body. */
const bashTmpParityReplica = (absoluteScratchFile: string): string =>
  `Use the bash tool ONLY (never the write or edit tools) to write a file ${absoluteScratchFile} with a shell command. The expectation is that the scratch write is ADMITTED - the phase declares the scratch flag, so the kernel fence grants the /tmp/ prefix class (the grant is phase-declared, not ambient). Describe in one sentence if it's satisfied.`;

/** Pinned bash-tmp-negative instruction template replica (SOLE OWNER: the
 * bashTmpNegativeInstructions owner in ./guards-demo.ts - the SILENT
 * scratch-refusal window over the SAME pinned scratch target the adjacent
 * probe admitted moments earlier; the ADDED bare-invocation prescription
 * clause between the imperative and the expectation GUARANTEES the
 * note-bearing tail). No em dash occurs in the body. */
const bashTmpNegativeReplica = (absoluteSharedScratchFile: string): string =>
  `Use the bash tool ONLY (never the write or edit tools) to attempt a shell write of a file ${absoluteSharedScratchFile}. Issue the redirection AS THE WHOLE COMMAND (a bare invocation). The expectation is that the command comes back REFUSED - this phase declares NOTHING (no paths, no scope flag, no scratch flag), so the kernel fence grants nothing beyond the machine allowance and the output ends with a standing restriction note whose allowed-targets listing is NONE, while the SAME target was admitted moments earlier by the adjacent probe's OWN declared scratch flag. Do not retry the target. Describe in one sentence if it's satisfied.`;

/** Pinned summary template replica (SOLE OWNER: the summaryInstructions
 * owner in ./guards-demo.ts): variant A (iterations >= 2) names the observed
 * run count; variant B (=== 1) is the armed-but-not-triggered wording. No
 * third variant, ever. Disk-check-free closing narration: the placement line
 * is FIXED (the presence-keyed legacy element retired with every disk check)
 * and no per-probe booleans exist. Em dashes are U+2014 (escaped). */
const summaryReplica = (
  absoluteArtifact: string,
  iterations: number,
): string => {
  const outcome =
    iterations >= 2
      ? `The guard demonstration has finished after ${iterations} runs: the engine's expectation guard DENIED first-pass settlement \u2014 the declared deliverable was missing \u2014 and FORCED the corrective re-run until the file existed.`
      : `The guard demonstration has finished after 1 run: the expectation guard's loop was ARMED but NOT triggered \u2014 the deliverable landed on the very first run, so the engine settled it immediately.`;
  return `${outcome}
The deliverable is placed at (absolute path):
${absoluteArtifact}
1. State in one short sentence what was demonstrated, naming the twelve gate probes: deny, allow, project-file, project-file-not-allowed, tmp-parity, tmp-negative, and the six bash-command probes: bash-deny, bash-allow, bash-project-file, bash-project-file-not-allowed, bash-tmp-parity, bash-tmp-negative.
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
// escape the OS /tmp/ prefix by construction (in the strict-confirmation
// world /tmp/ targets are admitted ONLY by a phase that declares the
// scratch class, so the fixture roots stay neutral), and resolve()
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
// Each mirrors its named owner in ../capability/guards/write-gate.ts
// BYTE-FOR-BYTE: the grown phase line (survivors in declaration order, the
// scope element appended iff the class is active, the scratch element LAST
// iff the phase's flag is active, join-or-"none") and the SOLE tail shape -
// the universal no-permission byte (the capability-named and no-span tail
// renderers retired with the strict-confirmation ruling; no /tmp/ clause
// anywhere). The byte-parity claim is exercised against the REAL decideWrite
// verdict bytes, never against hand-typed strings alone. \u2014 arrives
// escaped identically on both sides.

/** Denial-line replica builder (SOLE OWNER: renderPhaseDenial in
 * ../capability/guards/write-gate.ts). */
const replicaPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
  workspaceCwd: string | null,
  scratchActive: boolean,
): string => {
  const parts: string[] = [...survivors];
  if (workspaceCwd !== null) parts.push(`project files under ${workspaceCwd}`);
  if (scratchActive) parts.push("scratch files under /tmp/");
  return `Writing is refused during phase '${phaseId}'. Allowed targets: ${parts.length === 0 ? "none" : parts.join(", ")}.`;
};

/** Sole TAIL replica (SOLE OWNER: the module-private universal no-permission
 * constant in ../capability/guards/write-gate.ts - the owner-pinned verbatim
 * byte emitted for EVERY non-governing window regardless of span presence;
 * it supersedes BOTH the retired capability renderer and the retired no-span
 * renderer. The U+2014 em dash arrives escaped in the module literal;
 * compared UNESCAPED here, the established comparison idiom). */
const replicaUniversalDenial = (): string =>
  `Writing is refused \u2014 no write permission is declared by any active phase. Allowed targets: none.`;

/** Replica of the phase-permission disclosure block (SOLE OWNER: the
 * renderPhasePermissionDisclosure export in ../capability/pio-session.ts;
 * re-typed locally per the suite's established pattern - plain header
 * line, comma joiner, and the owner-worded class elements).
 *
 * Shape args mirror the shared-core consult outcome for the window each
 * phase arms: surviving declared paths (verbatim), the clamped
 * project-class proposition (workspace cwd), the single scratch flag. A
 * window with NO qualifying body line gains the empty-form None line
 * (mirroring the renderer's own condition). */
function disclosureReplica(
  files?: readonly string[],
  projectCwd?: string,
  scratch?: boolean,
): string {
  const parts: string[] = ["Phase Permissions:"];
  if (files !== undefined && files.length > 0) parts.push(files.join(", "));
  if (projectCwd !== undefined) parts.push(`project files at ${projectCwd}`);
  if (scratch === true) parts.push("scratch files at /tmp");
  if (parts.length === 1) parts.push("None");
  return parts.join("\n");
}

/** Engine-composed prompt texts (marker line + instructions, then the
 * trailing disclosure block - verbatim the phase engine's composition;
 * corrective notes sit strictly AFTER the baseline). */
const greetingPromptText = (): string =>
  `${renderPhaseMarker("greeting")}\n${GREETING_REPLICA}\n\n${disclosureReplica()}`;
const guardProbePromptText = (absoluteArtifact: string): string =>
  `${renderPhaseMarker("guard-probe")}\n${guardProbeReplica(absoluteArtifact)}\n\n${disclosureReplica([absoluteArtifact])}`;
const denyPromptText = (absoluteStrayArtifact: string): string =>
  `${renderPhaseMarker("deny")}\n${denyReplica(absoluteStrayArtifact)}\n\n${disclosureReplica()}`;
const allowPromptText = (absoluteArtifact: string): string =>
  `${renderPhaseMarker("allow")}\n${allowReplica(absoluteArtifact)}\n\n${disclosureReplica([absoluteArtifact])}`;
const projectFilePromptText = (absoluteCwdFile: string): string =>
  `${renderPhaseMarker("project-file")}\n${projectFileReplica(absoluteCwdFile)}\n\n${disclosureReplica(undefined, process.cwd())}`;
const notAllowedPromptText = (absoluteSharedCwdFile: string): string =>
  `${renderPhaseMarker("project-file-not-allowed")}\n${notAllowedReplica(absoluteSharedCwdFile)}\n\n${disclosureReplica()}`;
const tmpParityPromptText = (absoluteScratchFile: string): string =>
  `${renderPhaseMarker("tmp-parity")}\n${tmpParityReplica(absoluteScratchFile)}\n\n${disclosureReplica(undefined, undefined, true)}`;
const tmpNegativePromptText = (absoluteScratchFile: string): string =>
  `${renderPhaseMarker("tmp-negative")}\n${tmpNegativeReplica(absoluteScratchFile)}\n\n${disclosureReplica()}`;
const bashDenyPromptText = (absoluteStrayArtifact: string): string =>
  `${renderPhaseMarker("bash-deny")}\n${bashDenyReplica(absoluteStrayArtifact)}\n\n${disclosureReplica()}`;
const bashAllowPromptText = (
  absoluteDirectory: string,
  absoluteArtifact: string,
): string =>
  `${renderPhaseMarker("bash-allow")}\n${bashAllowReplica(
    absoluteDirectory,
    absoluteArtifact,
  )}\n\n${disclosureReplica([absoluteDirectory])}`;
const bashProjectFilePromptText = (absoluteCwdFile: string): string =>
  `${renderPhaseMarker("bash-project-file")}\n${bashProjectFileReplica(absoluteCwdFile)}\n\n${disclosureReplica(undefined, process.cwd())}`;
const bashProjectFileNotAllowedPromptText = (
  absoluteSharedCwdFile: string,
): string =>
  `${renderPhaseMarker("bash-project-file-not-allowed")}\n${bashProjectFileNotAllowedReplica(absoluteSharedCwdFile)}\n\n${disclosureReplica()}`;
const bashTmpParityPromptText = (absoluteScratchFile: string): string =>
  `${renderPhaseMarker("bash-tmp-parity")}\n${bashTmpParityReplica(absoluteScratchFile)}\n\n${disclosureReplica(undefined, undefined, true)}`;
const bashTmpNegativePromptText = (absoluteScratchFile: string): string =>
  `${renderPhaseMarker("bash-tmp-negative")}\n${bashTmpNegativeReplica(absoluteScratchFile)}\n\n${disclosureReplica()}`;
const summaryPromptText = (
  absoluteArtifact: string,
  iterations: number,
): string =>
  `${renderPhaseMarker("summary")}\n${summaryReplica(
    absoluteArtifact,
    iterations,
  )}\n\n${disclosureReplica()}`;

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

/** Self-consistent placement derivation for the TWELVE live gate probes,
 * via the SAME public channels (slot-relative tokens resolved under the
 * project slot; the cwd basename and the pinned /tmp/ basename resolved
 * against their own anchors). Computed after the row-scoped chdir — the
 * controlled workspace cwd binds the anchor. */
function probePlacements(): {
  absDenyArtifact: string;
  absDenyStray: string;
  absAllowArtifact: string;
  absCwdFile: string;
  absTmpScratch: string;
  absBashAllowDir: string;
  absBashAllowArtifact: string;
  cwd: string;
} {
  const { projectSlot } = artifactPlacement();
  return {
    absDenyArtifact: join(projectSlot, GUARDS_DEMO_DENY_ARTIFACT),
    absDenyStray: join(projectSlot, GUARDS_DEMO_DENY_STRAY),
    absAllowArtifact: join(projectSlot, GUARDS_DEMO_ALLOW_ARTIFACT),
    absCwdFile: join(process.cwd(), GUARDS_DEMO_PROJECT_PROBE_FILE),
    absTmpScratch: join("/tmp", GUARDS_DEMO_TMP_PARITY_FILE),
    absBashAllowDir: join(projectSlot, GUARDS_DEMO_BASH_ALLOW_DIR),
    absBashAllowArtifact: join(projectSlot, GUARDS_DEMO_BASH_ALLOW_ARTIFACT),
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
  it("C1 full happy chain (BINDING leg): pass one skips the write => the engine denies settlement and the pass-two prompt carries the IDENTICAL baseline PLUS the pinned DELIMITED corrective block (delimiter line above the unchanged body; run count 1, naming the tmpdir-ABSOLUTE path) => pass two commits the REAL fs write and settles at iterations === 2, then the TWELVE PLAIN-PHASE gate probes run in pinned order under ONE span (write-tool family: deny REFUSAL-ONLY, allow, project-file, the SILENT flag-less project-file-not-allowed phase, declared-scratch tmp-parity, the SILENT scratch-refusal tmp-negative; bash-command family: bash-deny over the SHARED stray target, bash-allow over the .md-directory device, bash-project-file under the DECLARED scope class, the SILENT bash-project-file-not-allowed over the SAME cwd target, bash-tmp-parity under the phase's OWN scratch flag, the SILENT bash-tmp-negative LAST) with their MID-PASS consults (real-predicate verdicts: stray + scratch REFUSED on the UNIVERSAL byte in the declare-nothing deny window, admission undefined, exclusive scope-element-only listing, the silent-phase FULL-LINE refusal on the UNIVERSAL byte with the phase observed NULL, scratch ADMITTED in the declared-flag window, the SAME scratch target REFUSED on the UNIVERSAL byte in the silent tmp-negative window with the phase observed NULL, /tmp/ healing vantage; kernel-vector consults: the MINIMUM fence over the SILENT bash-deny window, the surviving declared directory FIRST beside the machine allowance over bash-allow, the workspace-cwd class appended over bash-project-file, back to the MINIMUM fence over the SILENT bash-project-file-not-allowed window - the late-binding flip over the SAME stamped state - and the /tmp/ class appended over bash-tmp-parity) => ok:true with the ABSOLUTE settled outputs.report, the end-of-run scratch state ABSENT BY DESIGN, the terminal record carries version 0.5.0 and exit 0, EXACTLY 16 prompts + EXACTLY ONE span stamp strictly before the first prompt = 17 unified-timeline entries", async () => {
    const placement = artifactPlacement();
    const probes = probePlacements();
    const { instance, round, state } = await host();
    // Cross-run healing row: a stale real-/tmp scratch seeded BEFORE the
    // run simulates a crashed prior run; the capability's error-swallowed
    // pre-phase sweep must leave it ABSENT by the time the pass seeds.
    await writeFile(probes.absTmpScratch, "stale scratch\n");
    let strayVerdict: WriteGateVerdict | undefined;
    let denyWindowScratchRefusal: WriteGateVerdict | undefined;
    let allowAdmission: WriteGateVerdict | undefined;
    let exclusiveVerdict: WriteGateVerdict | undefined;
    let silentFullLine: WriteGateVerdict | undefined;
    let silentPhaseObservedNull = false;
    let tmpParityAdmission: WriteGateVerdict | undefined;
    let tmpAbsentBeforeSeed = false;
    let tmpNegativeRefusal: WriteGateVerdict | undefined;
    let tmpNegativePhaseObservedNull = false;
    let bashDenyVector: string[] | undefined;
    let bashAllowVector: string[] | undefined;
    let bashProjectFileVector: string[] | undefined;
    let bashSilentVector: string[] | undefined;
    let bashTmpParityVector: string[] | undefined;
    // Trajectory: greeting quiet; probe pass ONE quiet (no events, no fs);
    // probe pass TWO commits the REAL fs write + the synthetic settle pair;
    // the deny pass goes QUIET (REFUSAL-ONLY: neither target is seeded -
    // both deny-window consults land during it); allow and project-file
    // commit their REAL fs writes + settle pairs; the SILENT not-allowed
    // pass writes NOTHING (the refusal held - disk-truth duty); tmp-parity
    // commits the REAL fs seed under its DECLARED scratch flag; the SILENT
    // tmp-negative pass writes NOTHING (the refusal held - disk-truth
    // duty; its consult lands during it); the six BASH passes follow the
    // same discipline - bash-deny performs its TWO prescribed refused
    // attempts (the bare full-voice leg and the exit-0 compound - nothing
    // lands) and the two SILENT windows write NOTHING (their refusals held;
    // the kernel-vector consults land during them) while bash-allow,
    // bash-project-file, and bash-tmp-parity commit
    // their REAL fs writes to the declared/shared targets; summary quiet.
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
      // QUIET settle pair only: the REFUSAL-ONLY deny pass performs no disk
      // write (neither target is seeded - the probe contains no write of any
      // kind). The phase declares NOTHING, so both deny-window consults
      // observe a NULL phase slot and ride the non-admitting tail.
      emit(round, ...quietSettle());
      // MID-PASS consultation (fresh snapshot over the shared state):
      // the contract-covered stray is UNDECLARED during the deny window -
      // coverage by the running contract confers nothing without a phase
      // confirmation, so the FULL-LINE refusal is the UNIVERSAL byte (the
      // confirmation principle LIVE). The consult target is a LITERAL
      // NON-/TMP root (the row tree itself sits under the OS /tmp/ prefix,
      // where only a declaring phase admits).
      strayVerdict = decideWrite(state.snapshot(), "write", {
        path: FIXTURE_DENY_STRAY_TARGET,
      });
      // SCRATCH-CONTRAST PAIR (refusal half): the SAME real pinned scratch
      // path consulted DURING the declare-nothing deny window refuses on the
      // universal byte alike - undeclared scratch is refused at every depth.
      denyWindowScratchRefusal = decideWrite(state.snapshot(), "write", {
        path: probes.absTmpScratch,
      });
    });
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
      // The declared artifact is ADMITTED (no verdict) - the row-tree path
      // admits by SURVIVOR membership (the phase confirmed it); the pinned
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
      // SILENT-phase consultation (swap-in for the retired span-site
      // capture): a FRESH snapshot over the shared state shows the phase
      // slot EMPTY (attach abstention - the bare options object declares
      // nothing), and the shared cwd target (literal non-/tmp standing in
      // for the real workspace-cwd file) refuses on the UNIVERSAL
      // no-permission byte INSIDE the demo's own flag-TRUE span.
      const silentSnapshot = state.snapshot();
      silentPhaseObservedNull = silentSnapshot.phase === null;
      silentFullLine = decideWrite(silentSnapshot, "write", {
        path: FIXTURE_SHARED_CWD_TARGET,
      });
    });
    round.passes.push(async (): Promise<void> => {
      // Healing vantage: post-sweep, pre-model-write the scratch must be
      // ABSENT (cross-run healing of the stale seed).
      tmpAbsentBeforeSeed = !existsSync(probes.absTmpScratch);
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
      // SCRATCH-CONTRAST PAIR (admission half): the SAME real pinned
      // scratch path consulted DURING the declared-flag tmp-parity window
      // is ADMITTED - the grant is phase-declared, not ambient.
      tmpParityAdmission = decideWrite(state.snapshot(), "write", {
        path: probes.absTmpScratch,
      });
    });
    round.passes.push(async (): Promise<void> => {
      // The model honored the refusal: NO disk write in this pass (the
      // SAME target the tmp-parity probe admitted moments earlier is
      // refused again - disk-truth duty).
      emit(round, ...quietSettle());
      // SILENT-window scratch consultation: a FRESH snapshot shows the
      // phase slot EMPTY (attach abstention - the bare options object
      // declares nothing), and the SAME real pinned scratch path refuses
      // on the UNIVERSAL no-permission byte INSIDE the demo's own
      // flag-TRUE span (honest same-target idiom).
      const tmpNegativeSnapshot = state.snapshot();
      tmpNegativePhaseObservedNull = tmpNegativeSnapshot.phase === null;
      tmpNegativeRefusal = decideWrite(tmpNegativeSnapshot, "write", {
        path: probes.absTmpScratch,
      });
    });
    round.passes.push(async (): Promise<void> => {
      // BASH-DENY pass goes QUIET (the kernel fence denied BOTH prescribed
      // attempts at attempt time - the model's acts are the bare refusal
      // and the exit-0 compound; nothing lands - disk-truth duty).
      emit(round, ...quietSettle());
      // MID-PASS KERNEL-VECTOR consult (fresh snapshot over the SAME
      // stamped state): the SILENT window attaches NOTHING, so the fence
      // settles on its MINIMUM form - the machine allowance alone.
      bashDenyVector = composeKernelWritableSet(state.snapshot());
    });
    round.passes.push(async (): Promise<void> => {
      // Disk-truth duty: the production mkdir already created the DECLARED
      // directory in the fixture state root; the pass commits the REAL fs
      // write of the inner artifact (the subtree grant over the declared
      // directory ADMITS both shapes live).
      await writeFile(probes.absBashAllowArtifact, "# Bash allow\n");
      emit(round, ...writeSettle(probes.absBashAllowArtifact, "w-bash-allow"));
      // MID-PASS KERNEL-VECTOR consult: the surviving DECLARED DIRECTORY
      // rides the vector FIRST (assembly order - survivors before the
      // class additions); the uncovered inner artifact contributes NOTHING
      // (kernel-invisible).
      bashAllowVector = composeKernelWritableSet(state.snapshot());
    });
    round.passes.push(async (): Promise<void> => {
      // Disk-truth duty: the SHARED workspace-cwd target LANDS over the
      // SCOPE class (REAL fs write inside the scripted pass).
      await writeFile(probes.absCwdFile, "# Bash project file\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-bash-project"));
      // MID-PASS KERNEL-VECTOR consult: the dual project flags agree, so
      // the workspace-cwd class joins AFTER the machine allowance.
      bashProjectFileVector = composeKernelWritableSet(state.snapshot());
    });
    round.passes.push(async (): Promise<void> => {
      // The model honored the refusal: NO disk write in this pass (the
      // SAME cwd target the bash-project-file probe admitted moments
      // earlier is refused again - disk-truth duty).
      emit(round, ...quietSettle());
      // LATE-BINDING PROOF: over the SAME stamped state the consulted
      // snapshot flips with the active phase - the SILENT window (attach
      // abstention despite the contract's own flag-TRUE) degenerates to
      // the MINIMUM fence again.
      bashSilentVector = composeKernelWritableSet(state.snapshot());
    });
    round.passes.push(async (): Promise<void> => {
      // Disk-truth duty: the SHARED scratch target LANDS over the phase's
      // OWN scratch flag (REAL fs write inside the scripted pass).
      await writeFile(probes.absTmpScratch, "# Bash tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-bash-tmp"));
      // MID-PASS KERNEL-VECTOR consult: the effective scratch proposition
      // admits the /tmp/ prefix class AFTER the machine allowance.
      bashTmpParityVector = composeKernelWritableSet(state.snapshot());
    });
    round.passes.push(async (): Promise<void> => {
      // The model honored the refusal: NO disk write in this pass (the
      // SAME scratch target the bash-tmp-parity probe admitted moments
      // earlier is refused again - disk-truth duty; its pre-phase sweep
      // removed the parity residue WITHIN the run).
      emit(round, ...quietSettle());
    });
    scriptRuns(round, quietSettle());
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    // Prompt-total arithmetic: 1 + 2 + 12 + 1 = 16 - a wrong total
    // reveals a corrective block attributed to the wrong phase or a stray
    // prompt.
    expect(round.session.prompt).toHaveBeenCalledTimes(16);
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
    expect(sentAt(round, 3)).toBe(denyPromptText(probes.absDenyStray));
    expect(sentAt(round, 4)).toBe(allowPromptText(probes.absAllowArtifact));
    expect(sentAt(round, 5)).toBe(projectFilePromptText(probes.absCwdFile));
    expect(sentAt(round, 6)).toBe(notAllowedPromptText(probes.absCwdFile));
    expect(sentAt(round, 7)).toBe(tmpParityPromptText(probes.absTmpScratch));
    expect(sentAt(round, 8)).toBe(tmpNegativePromptText(probes.absTmpScratch));
    // The six BASH-command probes in pinned order, all-baseline (no
    // corrective blocks reach them on the happy trajectory).
    expect(sentAt(round, 9)).toBe(bashDenyPromptText(probes.absDenyStray));
    expect(sentAt(round, 10)).toBe(
      bashAllowPromptText(probes.absBashAllowDir, probes.absBashAllowArtifact),
    );
    expect(sentAt(round, 11)).toBe(
      bashProjectFilePromptText(probes.absCwdFile),
    );
    expect(sentAt(round, 12)).toBe(
      bashProjectFileNotAllowedPromptText(probes.absCwdFile),
    );
    expect(sentAt(round, 13)).toBe(
      bashTmpParityPromptText(probes.absTmpScratch),
    );
    expect(sentAt(round, 14)).toBe(
      bashTmpNegativePromptText(probes.absTmpScratch),
    );
    expect(sentAt(round, 15)).toBe(
      summaryPromptText(placement.absoluteArtifact, 2),
    );

    // Span stamp: EXACTLY ONE (the parent's markCapability - the vehicle
    // composes no nested span), the pinned payload, STRICTLY before the
    // first prompt (strict single-boundary ordering pin).
    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(round.session.sendCustomMessage).toHaveBeenNthCalledWith(
      1,
      markerPayload("guards-demo"),
    );
    expect(
      round.session.sendCustomMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(round.session.prompt.mock.invocationCallOrder[0]);
    // The unified timeline confirms the same ordering end to end:
    // EXACTLY 17 entries.
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
        text: denyPromptText(probes.absDenyStray),
      },
      { kind: "prompt", text: allowPromptText(probes.absAllowArtifact) },
      { kind: "prompt", text: projectFilePromptText(probes.absCwdFile) },
      {
        kind: "prompt",
        text: notAllowedPromptText(probes.absCwdFile),
      },
      { kind: "prompt", text: tmpParityPromptText(probes.absTmpScratch) },
      { kind: "prompt", text: tmpNegativePromptText(probes.absTmpScratch) },
      { kind: "prompt", text: bashDenyPromptText(probes.absDenyStray) },
      {
        kind: "prompt",
        text: bashAllowPromptText(
          probes.absBashAllowDir,
          probes.absBashAllowArtifact,
        ),
      },
      {
        kind: "prompt",
        text: bashProjectFilePromptText(probes.absCwdFile),
      },
      {
        kind: "prompt",
        text: bashProjectFileNotAllowedPromptText(probes.absCwdFile),
      },
      { kind: "prompt", text: bashTmpParityPromptText(probes.absTmpScratch) },
      {
        kind: "prompt",
        text: bashTmpNegativePromptText(probes.absTmpScratch),
      },
      {
        kind: "prompt",
        text: summaryPromptText(placement.absoluteArtifact, 2),
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
    // Declare-nothing deny window: BOTH targets refuse on the universal
    // byte - contract coverage confers nothing without a phase confirmation,
    // and undeclared scratch is refused at every depth.
    expect(strayVerdict).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
    expect(denyWindowScratchRefusal).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
    expect(allowAdmission).toBeUndefined();
    expect(exclusiveVerdict).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("project-file", [], probes.cwd, false),
    });
    // Attach-abstention witness: the bare options object (no bag, no flag)
    // keeps the phase slot EMPTY during the silent phase's pass.
    expect(silentPhaseObservedNull).toBe(true);
    // The silent-phase FULL-LINE refusal: ONE fixed universal byte - no
    // capability name, no clause - inside the demo's own flag-TRUE span.
    expect(silentFullLine).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
    // Scratch-contrast admission half: the declared flag governs.
    expect(tmpParityAdmission).toBeUndefined();
    expect(tmpAbsentBeforeSeed).toBe(true);
    // Attach-abstention witness over the scratch-refusal window: the bare
    // options object keeps the phase slot EMPTY during tmp-negative's
    // pass.
    expect(tmpNegativePhaseObservedNull).toBe(true);
    // The SAME real pinned scratch path refuses on the single fixed
    // universal byte (no capability name, no clause) - the refused half
    // of the scratch-flag inversion, live in the silent window.
    expect(tmpNegativeRefusal).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
    // Kernel-vector consults (captured DURING the bash passes over the
    // SAME stamped state - the fence tracks the frame, late-bound; the
    // MINIMUM fence over ANY window is exactly ["/dev"]; assembly order
    // keeps the surviving declarations FIRST):
    expect(bashDenyVector).toEqual(["/dev"]);
    expect(bashAllowVector).toEqual([probes.absBashAllowDir, "/dev"]);
    expect(bashProjectFileVector).toEqual(["/dev", probes.cwd]);
    expect(bashSilentVector).toEqual(["/dev"]);
    expect(bashTmpParityVector).toEqual(["/dev", "/tmp"]);

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
      version: "0.5.0",
      source: "builtin",
    });
    expect(record.outputs).toEqual({
      report: placement.absoluteArtifact,
    });
    expect(record.errors).toBeUndefined();
    // Disk truth (post-run): the committed guard-probe content; the deny
    // stray ABSENT (refused by the write gate AND by the kernel - nothing
    // written; neither deny target is seeded); the allow artifact PRESENT;
    // the bash-allow directory + inner artifact LEFT BEHIND (the admission
    // showcase - no post-rm; the recursive reset self-heals across runs);
    // the project-file probe file GONE (the SELF-CLEANING post-rm removed
    // it and both silent-window refusals held); the /tmp/ scratch ABSENT
    // BY DESIGN (the last probe's pre-phase sweep removed the admitted
    // parity residue WITHIN the run).
    expect(readFileSync(placement.absoluteArtifact, "utf8")).toBe(
      "# Guard Demo\n\nThis run was forced by the expectation guard.\n",
    );
    expect(existsSync(probes.absDenyStray)).toBe(false);
    expect(existsSync(probes.absAllowArtifact)).toBe(true);
    expect(existsSync(probes.absBashAllowDir)).toBe(true);
    expect(existsSync(probes.absBashAllowArtifact)).toBe(true);
    expect(existsSync(probes.absCwdFile)).toBe(false);
    expect(existsSync(probes.absTmpScratch)).toBe(false);
    // Row-end hygiene sweep stands as IDEMPOTENT LEGACY HYGIENE (a write,
    // not a check - the in-run sweep already cleared the residue).
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });

  it("C2 disobedient-compliance: the model commits the file on PASS ONE (real fs write inside the scripted pass) => the gate passes on the FIRST break, all-baseline prompt texts, ZERO corrective blocks, iterations === 1, the TWELVE PLAIN-PHASE gate probes ride along all-baseline under ONE span (the two SILENT bash windows write NOTHING - their refusals held), and the SUMMARY observes the graceful ARMED-BUT-NOT-TRIGGERED variant (variant B) over the shrunk signature - ok:true, EXACTLY 15 prompts + 1 stamp (1 + 1 + 12 + 1)", async () => {
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
    // The REFUSAL-ONLY deny pass goes QUIET (no disk write - the model's
    // sole act is the refused attempt).
    scriptRuns(round, quietSettle());
    round.passes.push(async (): Promise<void> => {
      await seedArtifact(probes.absAllowArtifact, "# Allow\n");
      emit(round, ...writeSettle(probes.absAllowArtifact, "w-allow"));
    });
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Project file probe\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-project"));
    });
    // The SILENT not-allowed pass writes NOTHING (the refusal held -
    // disk-truth duty).
    scriptRuns(round, quietSettle());
    // The tmp-parity pass commits the REAL fs seed (disk-truth duty) under
    // its DECLARED scratch flag.
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-tmp"));
    });
    // The SILENT tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty: the model honored the refusal).
    scriptRuns(round, quietSettle());
    // BASH-DENY: QUIET (the kernel denied BOTH prescribed attempts - the
    // model's acts are the bare and the exit-0 compound; nothing lands).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-ALLOW: commits the REAL fs write of the inner artifact (the
    // production mkdir already created the declared directory in the
    // fixture state root).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absBashAllowArtifact, "# Bash allow\n");
      emit(round, ...writeSettle(probes.absBashAllowArtifact, "w-bash-allow"));
    });
    // BASH-PROJECT-FILE: commits the REAL fs write of the SHARED cwd target
    // (SELF-CLEANING post-rm after the phase).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Bash project file\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-bash-project"));
    });
    // The SILENT bash-project-file-not-allowed pass writes NOTHING (the
    // refusal held - disk-truth duty).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-TMP-PARITY: commits the REAL fs write of the SHARED scratch
    // target under the phase's OWN scratch flag.
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Bash tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-bash-tmp"));
    });
    // The SILENT bash-tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty; its pre-sweep removed the parity residue WITHIN the
    // run).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    // 1 + 1 + 12 + 1 = 15 - a wrong total reveals a corrective block or a
    // stray prompt anywhere in the twelve-probe shape.
    expect(round.session.prompt).toHaveBeenCalledTimes(15);
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    // All-baseline: strict equality PROVES zero corrective blocks.
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    expect(sentAt(round, 2)).toBe(denyPromptText(probes.absDenyStray));
    expect(sentAt(round, 3)).toBe(allowPromptText(probes.absAllowArtifact));
    expect(sentAt(round, 4)).toBe(projectFilePromptText(probes.absCwdFile));
    expect(sentAt(round, 5)).toBe(notAllowedPromptText(probes.absCwdFile));
    expect(sentAt(round, 6)).toBe(tmpParityPromptText(probes.absTmpScratch));
    expect(sentAt(round, 7)).toBe(tmpNegativePromptText(probes.absTmpScratch));
    expect(sentAt(round, 8)).toBe(bashDenyPromptText(probes.absDenyStray));
    expect(sentAt(round, 9)).toBe(
      bashAllowPromptText(probes.absBashAllowDir, probes.absBashAllowArtifact),
    );
    expect(sentAt(round, 10)).toBe(
      bashProjectFilePromptText(probes.absCwdFile),
    );
    expect(sentAt(round, 11)).toBe(
      bashProjectFileNotAllowedPromptText(probes.absCwdFile),
    );
    expect(sentAt(round, 12)).toBe(
      bashTmpParityPromptText(probes.absTmpScratch),
    );
    expect(sentAt(round, 13)).toBe(
      bashTmpNegativePromptText(probes.absTmpScratch),
    );
    // Graceful-path assertion: the variant-B statement (armed but not
    // triggered), concrete count 1, over the SHRUNK signature.
    expect(sentAt(round, 14)).toBe(
      summaryPromptText(placement.absoluteArtifact, 1),
    );

    expect(round.session.sendCustomMessage).toHaveBeenCalledTimes(1);
    expect(round.session.sendCustomMessage).toHaveBeenNthCalledWith(
      1,
      markerPayload("guards-demo"),
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

  it("C4 repeatability: a pre-existing artifact (REAL fs seed BEFORE call()) is REMOVED by the repeatable reset before the guarded phase — observable: during the first guard-probe run a sync fs read reports ABSENT — and the first-pass gate fires IDENTICALLY (same corrective block, same trajectory as the unseeded happy chain over the full twelve-probe shape), ok:true, EXACTLY 16 prompts", async () => {
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
    // The REFUSAL-ONLY deny pass goes QUIET (no disk write - the model's
    // sole act is the refused attempt).
    scriptRuns(round, quietSettle());
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
    // The SILENT tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty: the model honored the refusal).
    scriptRuns(round, quietSettle());
    // BASH-DENY: QUIET (the kernel denied BOTH prescribed attempts - the
    // model's acts are the bare and the exit-0 compound; nothing lands).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-ALLOW: commits the REAL fs write of the inner artifact (the
    // production mkdir already created the declared directory in the
    // fixture state root).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absBashAllowArtifact, "# Bash allow\n");
      emit(round, ...writeSettle(probes.absBashAllowArtifact, "w-bash-allow"));
    });
    // BASH-PROJECT-FILE: commits the REAL fs write of the SHARED cwd target
    // (SELF-CLEANING post-rm after the phase).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Bash project file\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-bash-project"));
    });
    // The SILENT bash-project-file-not-allowed pass writes NOTHING (the
    // refusal held - disk-truth duty).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-TMP-PARITY: commits the REAL fs write of the SHARED scratch
    // target under the phase's OWN scratch flag.
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Bash tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-bash-tmp"));
    });
    // The SILENT bash-tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty; its pre-sweep removed the parity residue WITHIN the
    // run).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();

    expect(observedAbsentDuringPassOne).toBe(true);
    expect(round.session.prompt).toHaveBeenCalledTimes(16);
    // Identical trajectory to the unseeded happy chain: the same
    // baseline/corrective framing over the same absolute path, the eleven
    // remaining probe prompts riding along all-baseline.
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    expect(sentAt(round, 2)).toBe(
      `${guardProbePromptText(placement.absoluteArtifact)}\n${correctiveLine(1, [placement.absoluteArtifact])}`,
    );
    expect(sentAt(round, 3)).toBe(denyPromptText(probes.absDenyStray));
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
    // End-of-run scratch ABSENT BY DESIGN (the last probe's pre-phase
    // sweep removed the admitted parity residue WITHIN the run).
    expect(existsSync(probes.absTmpScratch)).toBe(false);
    // Row-end hygiene sweep stands as IDEMPOTENT LEGACY HYGIENE (a write,
    // not a check - the in-run sweep already cleared the residue).
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });
});

// ─── F rows: instruction framing (byte replicas) ──────────────────────

describe("instruction framing (F rows)", () => {
  it("F1 pinned BYTE REPLICA of the first-pass guard-probe instructions (marker-leading baseline = renderPhaseMarker('guard-probe') + '\\n' + template with the disclosure block TRAILING), the SIX write-probe and the SIX bash-command probe templates pinned against their replicas, and the MARKER-LEADING PLUS DISCLOSURE-TRAILING INVARIANTS hold for EVERY run's text in ALL SIXTEEN runs (happy-chain trajectory)", async () => {
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
    // The REFUSAL-ONLY deny pass goes QUIET (no disk write - the model's
    // sole act is the refused attempt).
    scriptRuns(round, quietSettle());
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
    // The SILENT tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty: the model honored the refusal).
    scriptRuns(round, quietSettle());
    // BASH-DENY: QUIET (the kernel denied BOTH prescribed attempts - the
    // model's acts are the bare and the exit-0 compound; nothing lands).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-ALLOW: commits the REAL fs write of the inner artifact (the
    // production mkdir already created the declared directory in the
    // fixture state root).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absBashAllowArtifact, "# Bash allow\n");
      emit(round, ...writeSettle(probes.absBashAllowArtifact, "w-bash-allow"));
    });
    // BASH-PROJECT-FILE: commits the REAL fs write of the SHARED cwd target
    // (SELF-CLEANING post-rm after the phase).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Bash project file\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-bash-project"));
    });
    // The SILENT bash-project-file-not-allowed pass writes NOTHING (the
    // refusal held - disk-truth duty).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-TMP-PARITY: commits the REAL fs write of the SHARED scratch
    // target under the phase's OWN scratch flag.
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Bash tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-bash-tmp"));
    });
    // The SILENT bash-tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty; its pre-sweep removed the parity residue WITHIN the
    // run).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);

    // Byte replica of the FIRST-PASS guard-probe prompt: the
    // marker-leading baseline is exactly marker + the pinned template,
    // the disclosure block trailing (no corrective block yet on run one).
    expect(sentAt(round, 0)).toBe(greetingPromptText());
    expect(sentAt(round, 1)).toBe(
      guardProbePromptText(placement.absoluteArtifact),
    );
    // The twelve probe templates pinned against their replicas (byte
    // parity; the six bash templates are EM-DASH-FREE by design; the
    // existing rows escape U+2014 identically on both sides).
    expect(sentAt(round, 3)).toBe(denyPromptText(probes.absDenyStray));
    expect(sentAt(round, 4)).toBe(allowPromptText(probes.absAllowArtifact));
    expect(sentAt(round, 5)).toBe(projectFilePromptText(probes.absCwdFile));
    expect(sentAt(round, 6)).toBe(notAllowedPromptText(probes.absCwdFile));
    expect(sentAt(round, 7)).toBe(tmpParityPromptText(probes.absTmpScratch));
    expect(sentAt(round, 8)).toBe(tmpNegativePromptText(probes.absTmpScratch));
    expect(sentAt(round, 9)).toBe(bashDenyPromptText(probes.absDenyStray));
    expect(sentAt(round, 10)).toBe(
      bashAllowPromptText(probes.absBashAllowDir, probes.absBashAllowArtifact),
    );
    expect(sentAt(round, 11)).toBe(
      bashProjectFilePromptText(probes.absCwdFile),
    );
    expect(sentAt(round, 12)).toBe(
      bashProjectFileNotAllowedPromptText(probes.absCwdFile),
    );
    expect(sentAt(round, 13)).toBe(
      bashTmpParityPromptText(probes.absTmpScratch),
    );
    expect(sentAt(round, 14)).toBe(
      bashTmpNegativePromptText(probes.absTmpScratch),
    );
    // Marker-leading plus disclosure-trailing invariant over EVERY run's
    // text in all sixteen runs: the marker line leads, the shape-true
    // block trails.
    type RunShape = {
      files?: readonly string[];
      projectCwd?: string;
      scratch?: boolean;
    };
    const runShapes: RunShape[] = [
      {},
      { files: [placement.absoluteArtifact] },
      { files: [placement.absoluteArtifact] },
      {},
      { files: [probes.absAllowArtifact] },
      { projectCwd: process.cwd() },
      {},
      { scratch: true },
      {},
      {},
      { files: [probes.absBashAllowDir] },
      { projectCwd: process.cwd() },
      {},
      { scratch: true },
      {},
      {},
    ];
    const phaseIds = [
      "greeting",
      "guard-probe",
      "guard-probe",
      "deny",
      "allow",
      "project-file",
      "project-file-not-allowed",
      "tmp-parity",
      "tmp-negative",
      "bash-deny",
      "bash-allow",
      "bash-project-file",
      "bash-project-file-not-allowed",
      "bash-tmp-parity",
      "bash-tmp-negative",
      "summary",
    ];
    for (let i = 0; i < 16; i++) {
      const text = sentAt(round, i);
      const shape = runShapes[i] ?? {};
      const firstLine = text.split("\n", 1)[0] ?? "";
      expect(firstLine).toBe(renderPhaseMarker(phaseIds[i] ?? ""));
      // The sole corrective retry (guard-probe pass two) rides its pinned
      // note strictly AFTER the trailing block.
      const tail =
        i === 2
          ? `${disclosureReplica(shape.files, shape.projectCwd, shape.scratch)}\n${correctiveLine(1, [placement.absoluteArtifact])}`
          : disclosureReplica(shape.files, shape.projectCwd, shape.scratch);
      expect(text.endsWith(tail)).toBe(true);
    }
    // Row-local hygiene sweep of the standing real-/tmp exception.
    await rm(probes.absTmpScratch, { force: true }).catch(() => {});
    expect(stderrText()).toBe("");
  });

  it("F2 BOTH summary statements pinned over the SHRUNK two-parameter signature: variant A with the CONCRETE observed run count (2) on the happy trajectory, variant B (armed-but-not-triggered, count 1) on the fresh-host disobedient trajectory - never a third variant", async () => {
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
    // The REFUSAL-ONLY deny pass goes QUIET (no disk write - the model's
    // sole act is the refused attempt).
    scriptRuns(round, quietSettle());
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
    // The SILENT tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty: the model honored the refusal).
    scriptRuns(round, quietSettle());
    // BASH-DENY: QUIET (the kernel denied BOTH prescribed attempts - the
    // model's acts are the bare and the exit-0 compound; nothing lands).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-ALLOW: commits the REAL fs write of the inner artifact (the
    // production mkdir already created the declared directory in the
    // fixture state root).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absBashAllowArtifact, "# Bash allow\n");
      emit(round, ...writeSettle(probes.absBashAllowArtifact, "w-bash-allow"));
    });
    // BASH-PROJECT-FILE: commits the REAL fs write of the SHARED cwd target
    // (SELF-CLEANING post-rm after the phase).
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absCwdFile, "# Bash project file\n");
      emit(round, ...writeSettle(probes.absCwdFile, "w-bash-project"));
    });
    // The SILENT bash-project-file-not-allowed pass writes NOTHING (the
    // refusal held - disk-truth duty).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    // BASH-TMP-PARITY: commits the REAL fs write of the SHARED scratch
    // target under the phase's OWN scratch flag.
    round.passes.push(async (): Promise<void> => {
      await writeFile(probes.absTmpScratch, "# Bash tmp parity\n");
      emit(round, ...writeSettle(probes.absTmpScratch, "w-bash-tmp"));
    });
    // The SILENT bash-tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty; its pre-sweep removed the parity residue WITHIN the
    // run).
    round.passes.push(async (): Promise<void> => {
      emit(round, ...quietSettle());
    });
    const cap = new GuardsDemoCapability({ session: instance });
    const result = await cap.run();
    expect(result.ok).toBe(true);
    expect(sentAt(round, 15)).toBe(
      `${renderPhaseMarker("summary")}\n${summaryReplica(placement.absoluteArtifact, 2)}\n\n${disclosureReplica()}`,
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
    // The REFUSAL-ONLY deny pass goes QUIET (no disk write - the model's
    // sole act is the refused attempt).
    scriptRuns(second.round, quietSettle());
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
    // The SILENT tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty: the model honored the refusal).
    scriptRuns(second.round, quietSettle());
    // BASH-DENY: QUIET (the kernel denied BOTH prescribed attempts - the
    // model's acts are the bare and the exit-0 compound; nothing lands).
    second.round.passes.push(async (): Promise<void> => {
      emit(second.round, ...quietSettle());
    });
    // BASH-ALLOW: commits the REAL fs write of the inner artifact (the
    // production mkdir already created the declared directory in the
    // fixture state root).
    second.round.passes.push(async (): Promise<void> => {
      await writeFile(secondProbes.absBashAllowArtifact, "# Bash allow\n");
      emit(
        second.round,
        ...writeSettle(secondProbes.absBashAllowArtifact, "w-bash-allow"),
      );
    });
    // BASH-PROJECT-FILE: commits the REAL fs write of the SHARED cwd target
    // (SELF-CLEANING post-rm after the phase).
    second.round.passes.push(async (): Promise<void> => {
      await writeFile(secondProbes.absCwdFile, "# Bash project file\n");
      emit(
        second.round,
        ...writeSettle(secondProbes.absCwdFile, "w-bash-project"),
      );
    });
    // The SILENT bash-project-file-not-allowed pass writes NOTHING (the
    // refusal held - disk-truth duty).
    second.round.passes.push(async (): Promise<void> => {
      emit(second.round, ...quietSettle());
    });
    // BASH-TMP-PARITY: commits the REAL fs write of the SHARED scratch
    // target under the phase's OWN scratch flag.
    second.round.passes.push(async (): Promise<void> => {
      await writeFile(secondProbes.absTmpScratch, "# Bash tmp parity\n");
      emit(
        second.round,
        ...writeSettle(secondProbes.absTmpScratch, "w-bash-tmp"),
      );
    });
    // The SILENT bash-tmp-negative pass writes NOTHING (the refusal held -
    // disk-truth duty; its pre-sweep removed the parity residue WITHIN the
    // run).
    second.round.passes.push(async (): Promise<void> => {
      emit(second.round, ...quietSettle());
    });
    const secondCap = new GuardsDemoCapability({ session: second.instance });
    const secondResult = await secondCap.run();
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) throw new Error("unreachable");
    expect(sentAt(second.round, 14)).toBe(
      `${renderPhaseMarker("summary")}\n${summaryReplica(placement.absoluteArtifact, 1)}\n\n${disclosureReplica()}`,
    );
    // The graceful wording IS present (variant-B signature phrase).
    expect(sentAt(second.round, 14)).toContain("ARMED but NOT triggered");
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
   * (hermetic fixture doctrine - in the strict-confirmation world /tmp/
   * targets are admitted ONLY by a declaring phase, so the anchors stay
   * neutral). snapshot() still resolves the closures FRESH per call: the
   * freshness property holds structurally, with the literals standing in
   * for the row-scoped channels. */
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

  it("clamped: an over-layer co-declared scratch entry NEVER covered by the contract is INVISIBLE at decision time - refused AS IF UNDECLARED on the universal no-permission byte (the pure plain-data clamp-at-source CORNER stands: uncovered entries invisible, nothing named)", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    d.state.attachPhase("clamped", [d.uncovered], false, false);
    const verdict = decideWrite(d.state.snapshot(), "write", {
      path: d.uncovered,
    });
    d.state.detachPhase();
    d.state.exitCapability();
    expect(verdict).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
  });

  it("inverted inherited: NOTHING attached confers NO phase governance and the SPAN SITE ADMITS NOTHING - the pattern hit is now REFUSED (the universal no-permission byte over the demo's own flag-TRUE sources), and the cwd and miss readings converge on the SAME fixed string", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    // Strict confirmation: even the demo's OWN pattern-covered artifact is
    // refused while no phase confirms it:
    const hit = decideWrite(d.state.snapshot(), "write", { path: d.covered });
    const scope = decideWrite(d.state.snapshot(), "edit", {
      path: d.cwdFile,
    });
    const miss = decideWrite(d.state.snapshot(), "write", {
      path: d.uncovered,
    });
    d.state.exitCapability();
    // The three readings CONVERGE on the same fixed byte over the demo's
    // own flag-TRUE sources:
    expect(hit).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
    expect(scope).toStrictEqual(hit);
    expect(miss).toStrictEqual(hit);
  });

  it("no-span: drained to depth 0 via the frozen reset() FIRST (deliberate TEST choice on the documented handle-reset-hygiene path - NOT a production precedent) yields the UNIVERSAL no-permission byte (full-line golden with the escaped U+2014 compare - identical to every non-governing span-present reading)", () => {
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
      reason: replicaUniversalDenial(),
    });
  });

  it("unbacked flag is INVISIBLE: pure plain-data sources (contract flag ABSENT) with a flag-PRESENT phase refuse the cwd target on the UNIVERSAL BYTE, byte-identical to the phase-null reading (strongest form trivially holds), with the scope element ABSENT from the listing", () => {
    const d = drivenState();
    // Pure plain-data fixture isolating the clamp-at-source corner (scope
    // flag ABSENT at the span site - it normalizes to false there; the
    // wildcard-free token is a declared pattern like any other).
    const unbackedSources = {
      name: "unbacked-flag-fixture",
      writes: ["guards-demo/unbacked-flag-fixture.md"],
      allowProjectWrites: false,
    };
    d.state.enterCapability(unbackedSources);
    d.state.attachPhase("flag-present-no-paths", [], true, false);
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
      reason: replicaUniversalDenial(),
    });
    // Byte-identical to the phase-null reading (the clamp at the source).
    expect(unflagged).toStrictEqual(flagged);
    expect(flagged?.reason ?? "").not.toContain("project files under ");
  });

  it("backed flag admits the class ALONE: demo sources plus a flag-declaring phase (NO paths) admit the workspace-cwd target", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    d.state.attachPhase("scope-only", [], true, false);
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
    d.state.attachPhase("scope-only", [], true, false);
    const verdict = decideWrite(d.state.snapshot(), "write", {
      path: d.covered,
    });
    d.state.detachPhase();
    d.state.exitCapability();
    expect(verdict).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("scope-only", [], d.cwd, false),
    });
  });

  it("scratch-class plain data: DEMO_SOURCES plus a tmp-flag-only phase confers EXCLUSIVE scratch governance - the /tmp/ target ADMITTED, the slot-pattern target REFUSED with the phase named and the scratch element as the ONLY listing element; a survivor-carrying phase WITHOUT the flag refuses the SAME /tmp/ target phase-named with the survivor-only listing", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    d.state.attachPhase("scratch-only", [], false, true);
    const scratchAdmitted = decideWrite(d.state.snapshot(), "write", {
      path: "/tmp/gd-scratch.txt",
    });
    const slotRefusal = decideWrite(d.state.snapshot(), "write", {
      path: d.covered,
    });
    d.state.detachPhase();
    // The twin: a survivor-carrying phase WITHOUT the flag keeps /tmp/
    // closed.
    d.state.attachPhase("survivor-tmp-off", [d.covered], false, false);
    const scratchRefused = decideWrite(d.state.snapshot(), "write", {
      path: "/tmp/gd-scratch.txt",
    });
    d.state.detachPhase();
    d.state.exitCapability();
    expect(scratchAdmitted).toBeUndefined();
    expect(slotRefusal).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("scratch-only", [], null, true),
    });
    expect(scratchRefused).toStrictEqual({
      block: true,
      reason: replicaPhaseDenial("survivor-tmp-off", [d.covered], null, false),
    });
  });

  it("negative-scratch CORNER over the demo's own flag-TRUE sources: NOTHING attached with the span present refuses a ROW-LOCAL /tmp/ literal on the UNIVERSAL no-permission byte, byte-identical to the uncovered-slot miss reading over the SAME span (convergence idiom)", () => {
    const d = drivenState();
    d.state.enterCapability(DEMO_SOURCES);
    // NOTHING attached (no phase): the scratch target consulted row-locally
    // (house idiom - a literal /tmp/ token, cf. the scratch-class row)
    // rides the non-admitting tail alike.
    const scratch = decideWrite(d.state.snapshot(), "write", {
      path: "/tmp/gd-negative-scratch.txt",
    });
    const miss = decideWrite(d.state.snapshot(), "write", {
      path: d.uncovered,
    });
    d.state.exitCapability();
    expect(scratch).toStrictEqual({
      block: true,
      reason: replicaUniversalDenial(),
    });
    // Byte-identical companion reading over the same span: every
    // non-governing window lands on the one fixed byte.
    expect(miss).toStrictEqual(scratch);
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
      version: "0.5.0",
      inputs: [],
      outputs: [{ name: "report", paramKey: "report" }],
      writes: ["guards-demo/*.md"],
      allowProjectWrites: true,
    });
  });

  it("runtime export surface is EXACTLY NINE keys: default plus the eight token constants", async () => {
    const mod = await import("./guards-demo.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "GUARDS_DEMO_ALLOW_ARTIFACT",
      "GUARDS_DEMO_ARTIFACT",
      "GUARDS_DEMO_BASH_ALLOW_ARTIFACT",
      "GUARDS_DEMO_BASH_ALLOW_DIR",
      "GUARDS_DEMO_DENY_ARTIFACT",
      "GUARDS_DEMO_DENY_STRAY",
      "GUARDS_DEMO_PROJECT_PROBE_FILE",
      "GUARDS_DEMO_TMP_PARITY_FILE",
      "default",
    ]);
    expect(mod.default).toBe(GuardsDemoCapability);
  });

  it("contains ZERO occurrences of the SDK specifier in the module source (static value graph reaches no SDK module)", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("static import-clause discipline per the sibling pattern (post-format reality): VALUE clauses exactly {node:fs/promises (mkdir and rm), node:path (join), ../capability/base.ts (CapabilityParams inline-type + deriveStateRootFromAgentDir + PioCapability), ../sandbox/layout.ts (deriveProjectKey)} in canonical order \u2014 TYPE clauses exactly {../capability/contract.ts (Contract)}", () => {
    const clauses = staticImportClauses(src);
    const valueClauses = clauses.filter((clause) => !clause.typeOnly);
    const typeClauses = clauses.filter((clause) => clause.typeOnly);
    expect(valueClauses).toEqual([
      {
        typeOnly: false,
        names: ["mkdir", "rm"],
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

  it("the EIGHT-token constant roster holds: each constant's QUOTED value literal occurs EXACTLY ONCE in the module source (quoted-literal split-count idiom - the bash-allow directory token is a strict prefix of the artifact token, so the count binds the quoted form instead of the raw substring; no duplicated literals; every other reference rides the constant identifier)", () => {
    const roster = [
      GUARDS_DEMO_ARTIFACT,
      GUARDS_DEMO_DENY_ARTIFACT,
      GUARDS_DEMO_DENY_STRAY,
      GUARDS_DEMO_ALLOW_ARTIFACT,
      GUARDS_DEMO_PROJECT_PROBE_FILE,
      GUARDS_DEMO_TMP_PARITY_FILE,
      GUARDS_DEMO_BASH_ALLOW_DIR,
      GUARDS_DEMO_BASH_ALLOW_ARTIFACT,
    ];
    for (const token of roster) {
      expect(src.split(`"${token}"`).length - 1).toBe(1);
    }
  });

  it("shape-prescription fragment pins over the repinned negative bash bytes (quoted-fragment split-count idiom over each extracted owner region): the bare-invocation clause occurs EXACTLY ONCE inside each of the two simple-negative owners, and the semicolon-compound example occurs EXACTLY ONCE inside the bash-deny owner", () => {
    const ownerRegion = (ownerName: string): string => {
      const start = src.indexOf(`function ${ownerName}(`);
      if (start === -1) throw new Error(`expected owner function ${ownerName}`);
      const rest = src.slice(start);
      const nextDoc = rest.search(/\n\/\*\*/);
      return nextDoc === -1 ? rest : rest.slice(0, nextDoc);
    };
    const BARE_INVOCATION_CLAUSE =
      "Issue the redirection AS THE WHOLE COMMAND (a bare invocation).";
    for (const ownerName of [
      "bashProjectFileNotAllowedInstructions",
      "bashTmpNegativeInstructions",
    ]) {
      expect(
        ownerRegion(ownerName).split(BARE_INVOCATION_CLAUSE).length - 1,
      ).toBe(1);
    }
    // The load-bearing separator check: the SEMICOLON compound form (never
    // the short-circuiting && join) appears exactly once in the owner.
    expect(
      ownerRegion("bashDenyInstructions").split("; echo ok").length - 1,
    ).toBe(1);
  });

  it("zero hop/terminal-takeover machinery tokens (no terminal, lineage, or hop machinery in this module) and the header marks PERMANENT with the temporary-sibling CONTRAST STATEMENT (names the temporary sibling module + its cutover removal) while carrying ZERO uppercase TEMPORARY substrings (deletion-sweep safety), plus the module-scoped retirement sweep (the retired identifiers AND the substring 'child' at zero occurrences)", () => {
    for (const token of [
      "SIGINT",
      "InteractiveMode",
      "armKillCapture",
      "parentSession",
      "terminal-takeover",
      "ProjectFileNotAllowedProbe",
      "GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT",
      "project-file-not-allowed-probe",
    ]) {
      expect(src.includes(token)).toBe(false);
    }
    // Module-scoped zero-reference sweep: the retired identifier family AND
    // the substring 'child' vanish from the module source (other pio files
    // legitimately use 'child' for compose vocabulary - the sweep is
    // module-scoped).
    expect(src.includes("child")).toBe(false);
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
  it("the fake SDK root fakes EXACTLY the eight valued symbols (session-construction seams plus the Landlock-bash construction floor - any further fake symbol would be foreign wiring intruding into the island)", () => {
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
        "createBashToolDefinition",
        "createLocalBashOperations",
        "defineTool",
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
