// The guards-demo capability — PERMANENT: the standing home for guard
// demonstrations (future guard tests accumulate here). Registration contrast:
// its row-2 sibling compose-new-session-demo is a temporary demonstration
// whose removal is scheduled at the bulk-migration cutover; this module stays
// registered.
//
// What it exhibits: the engine-owned expectation-guard loop over a declared
// deliverable, triggered DELIBERATELY — the guarded phase's first pass skips
// the declared write by instruction, so a live run visibly exercises the
// loop end to end: first-pass miss -> engine-denied settlement -> corrective
// note naming the exact path -> compliant second run -> settle.
//
// What it ALSO exhibits: the standing live write-gate demonstration - five
// gate probes after the guarded phase, in fixed order: deny (a
// phase-declared path admitted while an undeclared contract-covered sibling
// is refused), allow (a declared path lands), project-file (a flag-declaring
// phase admits the workspace scope and NOTHING else), the composed
// project-file-not-allowed child (the same workspace target REFUSED inside a
// span whose contract backs no scope - the decision-time clamp made visible),
// and tmp-parity (the scratch area stays open under a phase that declares no
// permissions at all). Each probe's disk outcome degrades the extended
// summary WORDING only - never a hard failure.
//
// Outcome model: NO raw terminal writes — the phase prompts ARE the
// in-stream statements, and the machine ledger (the terminal record's
// `outputs`) carries the settled ABSOLUTE placement once the base's settle
// seam has transformed the returned slot-relative token.
//
// Repeatable reset: immediately before each gated or probed phase the known
// artifacts are unlink-swallowed — pre-existing copies would let an
// observation pass silently or contaminate an ABSENT reading, and a stale
// stray would survive into the next run. Swallowing is deliberate: a
// surviving stale artifact degrades to degraded wording rather than
// aborting the demonstration. The tmp-parity residue is INTENTIONALLY left
// in place within the run (the pre-phase sweep self-heals across runs).
//
// The guarded phase is DECLARATION-ONLY (a write declaration plus the floor;
// no stopping hook, no budget ceiling): with the floor consumed, the
// settlement gate plus its own ceiling are the SOLE settlement authority —
// the canonical teaching example. Engine faults (the ceiling-exhaustion
// ContractViolationError) propagate VERBATIM out of call() — never wrapped
// or downgraded; the base catch-all captures them into the typed ok:false
// settlement. Em dashes are U+2014 (escaped) in every pinned byte below.

import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type CapabilityParams,
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";

/** The FIXED project-slot-relative artifact token (shrink-only tunable; the
 * suite rows reference this constant, never a duplicated literal). */
export const GUARDS_DEMO_ARTIFACT = "guards-demo/guard-probe.md";

/** The DENY probe's LEGAL artifact (slot-relative, covered by the demo
 * pattern; declared in-phase — the only granted target of the probe). */
export const GUARDS_DEMO_DENY_ARTIFACT = "guards-demo/deny-artifact.md";

/** The DENY probe's STRAY artifact (slot-relative, covered by the demo
 * pattern, but UNDECLARED in-phase — expected-to-be-refused as if
 * undeclared; distinct from the legal artifact). */
export const GUARDS_DEMO_DENY_STRAY = "guards-demo/deny-stray.md";

/** The ALLOW probe's artifact (slot-relative, covered by the demo pattern;
 * declared in-phase — the admission lands on it). */
export const GUARDS_DEMO_ALLOW_ARTIFACT = "guards-demo/allow-artifact.md";

/** The PROJECT-FILE probe's WORKSPACE-cwd basename — deliberately outside
 * every contract.writes pattern (a plain .txt under the launch cwd; the
 * phase admits it via the project-files SCOPE class alone). */
export const GUARDS_DEMO_PROJECT_PROBE_FILE =
  "pio-guards-demo-project-file-probe.txt";

/** The TMP-PARITY probe's unique pinned /tmp/ basename (the standing
 * real-/tmp exception: pre-phase sweep self-heals across runs; the residue
 * is intentionally left WITHIN the run). */
export const GUARDS_DEMO_TMP_PARITY_FILE =
  "pio-guards-demo-tmp-parity-scratch.txt";

/** The NOT-ALLOWED child's declared deliverable (slot-relative, CONCRETE
 * wildcard-free — the child's sole legal target; the first shipped
 * occurrence exercising the matcher dialect's literal-segment branch). */
export const GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT =
  "guards-demo/project-file-not-allowed.md";

/** The pinned greeting template (PINNED bytes; the suite replica names this
 * owner). One settled turn: greet the operator and briefly name what the
 * demo exhibits (the expectation guard denying first-pass settlement until
 * the declared file exists), then order a clean end of turn with no tool-use
 * mandate. Em dashes are U+2014 (escaped). */
const GREETING_INSTRUCTIONS = `You are starting a guard demonstration.
1. Greet the operator: say hello and briefly mention that the run ahead exhibits the engine's expectation guard \u2014 a declared deliverable whose settlement is DENIED on the first pass until the file exists.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** The pinned guard-probe instruction template (PINNED bytes; the suite
 * replica names this owner). ONE static text teaches both passes: the same
 * baseline rides every run, so the first-pass skip directive and the
 * compliant-create directive coexist, disambiguated ONLY by the presence or
 * absence of the engine's corrective note strictly after the baseline.
 * Em dashes are U+2014 (escaped). */
function guardProbeInstructions(absoluteArtifact: string): string {
  return `This run demonstrates the engine's expectation guard for a declared deliverable.
Deliverable file (absolute path): ${absoluteArtifact}

Rules for THIS run:
1. FIRST PASS \u2014 no corrective note appears below these instructions: draft the intended content in your reply ONLY and finish the run WITHOUT any write or edit call touching that file.
2. How the guard works: the engine checks the file's existence at settlement, DENIES settlement while the file is missing, and re-runs this phase with a corrective note naming the exact missing path.
3. CORRECTIVE PASS \u2014 a corrective note naming this path IS present below these instructions: create the file AT THE EXACT path above with minimal required content \u2014 a "# Guard Demo" heading plus one line stating that this run was forced by the expectation guard.
Work autonomously; do not ask the user anything during the run.`;
}

/** The pinned deny-probe instruction template (PINNED bytes; the suite
 * replica names this owner). One settled turn: create the LEGAL artifact,
 * THEN attempt the stray (named explicitly as expected-to-be-refused),
 * state what the refusal reported, never retry. Em dashes are U+2014
 * (escaped). */
function denyInstructions(
  absoluteLegalArtifact: string,
  absoluteStrayArtifact: string,
): string {
  return `This run demonstrates the write gate's phase-level path enforcement.
Legal artifact (absolute path): ${absoluteLegalArtifact}
Stray artifact (absolute path): ${absoluteStrayArtifact}

Rules for THIS run:
1. Create the LEGAL artifact AT ITS EXACT absolute path above with minimal content \u2014 a short heading line stating that the write gate admitted it.
2. THEN attempt to write the STRAY artifact AT ITS EXACT absolute path above. Name it explicitly in your reply as expected to be refused \u2014 this phase declared only the legal path, so the stray must come back refused.
3. STATE WHAT THE REFUSAL REPORTED in your reply (quote the allowed-targets part of the refusal if you can).
4. DO NOT retry the same target. End your turn right after that statement.`;
}

/** The pinned allow-probe instruction template (PINNED bytes; the suite
 * replica names this owner). One settled turn: create the declared artifact
 * at its exact absolute path and state that the admission needed nothing
 * beyond the declaration itself. Em dashes are U+2014 (escaped). */
function allowInstructions(absoluteArtifact: string): string {
  return `This run demonstrates write-gate ADMISSION of a phase-declared path.
Artifact (absolute path): ${absoluteArtifact}

Rules for THIS run:
1. Create the file AT THAT EXACT absolute path with minimal content \u2014 a short heading line.
2. Briefly state in your reply that the write succeeded despite nothing special being declared beyond the file itself \u2014 the phase declared exactly this one path, and the gate admitted it.
3. Do nothing else. End your turn right after that statement.`;
}

/** The pinned project-file instruction template (PINNED bytes; the suite
 * replica names this owner). One settled turn: create the workspace-cwd file
 * under a phase that declares the project-files SCOPE and NO specific paths.
 * No stray-attempt mandate — deterministic single creation; the exclusive-
 * governance proof lives in the suite's mid-pass consultation. Em dashes are
 * U+2014 (escaped). */
function projectFileInstructions(absoluteCwdFile: string): string {
  return `This run demonstrates the write gate's project-files SCOPE class for a phase that declares the scope and NO specific paths.
Workspace file (absolute path): ${absoluteCwdFile}

Rules for THIS run:
1. Create the file AT THAT EXACT absolute path with minimal content \u2014 a short heading line.
2. State in your reply that it landed with the phase declaring the project-files scope and NO specific paths.
3. Do not attempt any other write. End your turn right after that statement.`;
}

/** The pinned not-allowed probe instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE settled turn for
 * the composed child's single quiet phase: narrate the sibling probe's
 * create-and-remove act, attempt the SAME shared workspace target, expect
 * the refusal (the capability's contract backs no scope), state what the
 * refusal attributed, never retry. Em dashes are U+2014 (escaped). */
function notAllowedProbeInstructions(
  absoluteSharedCwdFile: string,
  absoluteDeclaredDeliverable: string,
): string {
  return `This run demonstrates the decision-time CLAMP for a capability whose contract carries NO project-writes scope.
Shared workspace file (absolute path): ${absoluteSharedCwdFile}
Declared deliverable (absolute path, NOT touched by this probe): ${absoluteDeclaredDeliverable}

Context: the sibling project-file probe earlier in this engagement created the shared workspace file above and then REMOVED it again - under a phase whose running capability granted the project-files scope.

Rules for THIS run:
1. Attempt to create the SHARED workspace file AT ITS EXACT absolute path with minimal content \u2014 one short heading line. Your phase declares the project-files scope, but this capability's contract does not back it - the scope class is INVISIBLE at the source, so the attempt must come back refused.
2. STATE WHAT THE REFUSAL REPORTED in your reply, including which capability the refusal attributed.
3. DO NOT retry the same target and DO NOT write the declared deliverable. End your turn right after that statement.`;
}

/** The pinned tmp-parity instruction template (PINNED bytes; the suite
 * replica names this owner). One settled turn: create the pinned scratch
 * file under /tmp/ under a phase that declares NO permissions at all, and
 * state that the scratch area stayed open regardless. Em dashes are U+2014
 * (escaped). */
function tmpParityInstructions(absoluteScratchFile: string): string {
  return `This run demonstrates the /tmp/ parity class under a phase that declares NO permissions at all.
Scratch file (absolute path): ${absoluteScratchFile}

Rules for THIS run:
1. Create the scratch file AT THAT EXACT absolute path with minimal content \u2014 a short heading line.
2. State in your reply that the scratch area stayed open DESPITE the phase declaring no permissions at all \u2014 the invariant this probe exists to demonstrate: /tmp/ parity precedes every other rule.
3. Do not attempt any other write. End your turn right after that statement.`;
}

/** The pinned summary template (PINNED bytes; the suite replica names this
 * owner). Variant selection keys ONLY on the observed iteration count (A:
 * >= 2 — the guard forced the corrective re-run, naming the count; B: === 1
 * — armed but NOT triggered, graceful); there is no third variant. The five
 * trailing booleans degrade each gate-probe OBSERVATION sentence individually
 * (wording only — never a hard failure on model non-determinism). Both
 * variants name the ABSOLUTE artifact path and end with the closing
 * ordering. Em dashes are U+2014 (escaped). */
function summaryInstructions(
  absoluteArtifact: string,
  iterations: number,
  fileConfirmed: boolean,
  strayAbsent: boolean,
  allowPresent: boolean,
  projectPresent: boolean,
  notAllowedTargetAbsent: boolean,
  tmpPresent: boolean,
): string {
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
}

/** One disk-truth observation (WORDING-only feeder for the summary): true
 * when the path EXISTS. A missing path degrades the observation sentence,
 * never a throw site. */
async function isPresent(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

export default class GuardsDemoCapability extends PioCapability {
  readonly contract: Contract = {
    name: "guards-demo",
    version: "0.2.0",
    inputs: [],
    outputs: [{ name: "report", paramKey: "report" }],
    writes: ["guards-demo/*.md"],
    allowProjectWrites: true,
  };

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Zero declared inputs — the host gate already refused anything else;
    // the standard signature survives untouched.
    void inputs;

    // Derivation escapes PRE-EVERYTHING (zero prompts on an env defect):
    // the typed capture in the terminal record IS the human-facing surfacing.
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());
    const projectSlot = join(stateRoot, "projects", projectKey);
    const absoluteArtifact = join(projectSlot, GUARDS_DEMO_ARTIFACT);
    const absoluteDenyArtifact = join(projectSlot, GUARDS_DEMO_DENY_ARTIFACT);
    const absoluteDenyStray = join(projectSlot, GUARDS_DEMO_DENY_STRAY);
    const absoluteAllowArtifact = join(projectSlot, GUARDS_DEMO_ALLOW_ARTIFACT);
    const absoluteCwdFile = join(process.cwd(), GUARDS_DEMO_PROJECT_PROBE_FILE);
    const absoluteTmpScratch = join("/tmp", GUARDS_DEMO_TMP_PARITY_FILE);

    // 1. Greeting — exactly ONE settled turn through the session stream.
    await this.execute_phase("greeting", {
      instructions: GREETING_INSTRUCTIONS,
      min: 1,
      max: 1,
    });

    // 2. Repeatability reset — error-SWALLOWED, deterministic,
    // capability-owned: a surviving stale artifact degrades to the graceful
    // settle instead of aborting the demonstration. No prompts, no logging.
    await rm(absoluteArtifact, { force: true }).catch(() => {});

    // 3. Guarded phase — DECLARATION-ONLY: the write declaration plus the
    // floor; NO stopping hook, NO budget ceiling. With the floor consumed,
    // the settlement gate plus its own ceiling are the SOLE settlement
    // authority. Awaited UNWRAPPED: a ceiling-exhaustion
    // ContractViolationError escapes call() VERBATIM (the base catch-all
    // captures it into the typed ok:false settlement).
    const result = await this.execute_phase("guard-probe", {
      instructions: guardProbeInstructions(absoluteArtifact),
      min: 1,
      write: [absoluteArtifact],
    });

    // 4. Post-phase observation backing the summary wording: the gate
    // already guarantees existence at settle, so a null stat degrades the
    // WORDING only — no new throw site, never a hard failure.
    const fileConfirmed = await isPresent(absoluteArtifact);

    // 5. DENY probe — the phase declares the LEGAL artifact ONLY: the
    // contract-covered stray is UNDECLARED and must be refused as if
    // undeclared. Pre-phase sweep clears BOTH targets (a surviving stale
    // stray must not contaminate the ABSENT observation). One settled run.
    await rm(absoluteDenyArtifact, { force: true }).catch(() => {});
    await rm(absoluteDenyStray, { force: true }).catch(() => {});
    await this.execute_phase("deny", {
      instructions: denyInstructions(absoluteDenyArtifact, absoluteDenyStray),
      min: 1,
      max: 1,
      write: [absoluteDenyArtifact],
    });
    // 6. Disk-truth observation for the summary (ABSENT expected; the
    // wording degrades, never throws).
    const strayAbsent = !(await isPresent(absoluteDenyStray));

    // 7. ALLOW probe — declares its own artifact; the write lands BY
    // ADMISSION. Pre-phase sweep heals a stale copy from a crashed run.
    await rm(absoluteAllowArtifact, { force: true }).catch(() => {});
    await this.execute_phase("allow", {
      instructions: allowInstructions(absoluteAllowArtifact),
      min: 1,
      max: 1,
      write: [absoluteAllowArtifact],
    });
    const allowPresent = await isPresent(absoluteAllowArtifact);

    // 8. PROJECT-FILE probe — the phase declares the project-files SCOPE
    // ONLY (no write bag): the effective set is the cwd-scope class ALONE,
    // backed by this capability's own contract flag. No stray-attempt
    // mandate in the live template - deterministic single creation; the
    // exclusive-governance proof is the suite's mid-pass consultation.
    // SELF-CLEANING: the probe file is removed after confirmation (no
    // standing artifact in the repo working dir); the pre-phase sweep covers
    // a crash-survivor copy.
    await rm(absoluteCwdFile, { force: true }).catch(() => {});
    await this.execute_phase("project-file", {
      instructions: projectFileInstructions(absoluteCwdFile),
      min: 1,
      max: 1,
      allowProjectWrites: true,
    });
    const projectPresent = await isPresent(absoluteCwdFile);
    await rm(absoluteCwdFile, { force: true }).catch(() => {});

    // 9. NOT-ALLOWED probe — the composed child span (CANONICAL ROW-1
    // channels): constructed WITH the caller's session INSTANCE BY
    // REFERENCE; its OWN base span window, span stamp, and LIFO nesting/
    // re-governance ride the shipped machinery. Awaited UNWRAPPED with NO
    // result inspection and NO catch-all: run() never rejects (typed faults
    // settle as ok:false captures at this await), and the sole realistic
    // fault source - the env-root derivation - is common-mode with this
    // capability's own successful derivation moments earlier, hence
    // unreachable here. A swallow/catch-all would hide the typed capture
    // from the operator and is rejected; a manual span push through the
    // public seam is likewise rejected (it would skip the span stamp and
    // name a capability never visibly opened).
    const child = new ProjectFileNotAllowedProbe({ session: this.s });
    await child.run();
    const notAllowedTargetAbsent = !(await isPresent(absoluteCwdFile));

    // 10. TMP-PARITY probe — NEITHER dimension declared (attach abstention;
    // the capability's own sources govern via fall-through). The /tmp/
    // parity class precedes every other rule, so the scratch lands
    // regardless. The pre-phase sweep still runs FIRST (cross-run
    // self-healing); the residue is INTENTIONALLY left in place within the
    // run.
    await rm(absoluteTmpScratch, { force: true }).catch(() => {});
    await this.execute_phase("tmp-parity", {
      instructions: tmpParityInstructions(absoluteTmpScratch),
      min: 1,
      max: 1,
    });
    const tmpPresent = await isPresent(absoluteTmpScratch);

    // 11. Summary — success-gated by control flow (a rejecting guarded
    // phase never reaches it): ONE settled turn stating the observed
    // trajectory THROUGH THE SESSION STREAM.
    await this.execute_phase("summary", {
      instructions: summaryInstructions(
        absoluteArtifact,
        result.iterations,
        fileConfirmed,
        strayAbsent,
        allowPresent,
        projectPresent,
        notAllowedTargetAbsent,
        tmpPresent,
      ),
      min: 1,
      max: 1,
    });

    // 12. Return — the RELATIVE token; the base's settle seam absolutizes it
    // exactly once at success settlement (NEVER the absolute path here).
    return { report: GUARDS_DEMO_ARTIFACT };
  }
}

// The FIFTH probe — a MODULE-PRIVATE nested capability (NOT exported, NOT
// loader-registered, never surfaced in any terminal record): its contract
// stub carries the scope flag NOWHERE, so the decision-time clamp renders
// its phase-declared scope INVISIBLE at the source. It attempts the SAME
// shared workspace-cwd target the parent's flag-declaring project-file phase
// admitted — identical target, OPPOSITE verdicts across the span boundary.
class ProjectFileNotAllowedProbe extends PioCapability {
  readonly contract: Contract = {
    name: "project-file-not-allowed",
    version: "0.1.0",
    inputs: [],
    outputs: [{ name: "report" }],
    writes: [GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT],
  };

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    void inputs;
    // Own absolute-path computation over the SAME derivation helpers (the
    // env-root channel is verified pre-everything, common-mode with the
    // parent's earlier successful derivation).
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());
    const projectSlot = join(stateRoot, "projects", projectKey);
    const absoluteSharedCwdFile = join(
      process.cwd(),
      GUARDS_DEMO_PROJECT_PROBE_FILE,
    );
    const absoluteDeclaredDeliverable = join(
      projectSlot,
      GUARDS_DEMO_PROJECT_FILE_NOT_ALLOWED_ARTIFACT,
    );
    // Crash-survivor coverage BETWEEN the parent's self-clean and here: a
    // residual copy must not contaminate the ABSENT observation the parent
    // takes after this run.
    await rm(absoluteSharedCwdFile, { force: true }).catch(() => {});
    // The single quiet phase DECLARES THE FLAG (no write bag) — the
    // sharpened contrast: phase flag PRESENT, contract flag ABSENT, so the
    // clamp renders the scope class invisible at the source.
    await this.execute_phase("project-file-not-allowed-probe", {
      instructions: notAllowedProbeInstructions(
        absoluteSharedCwdFile,
        absoluteDeclaredDeliverable,
      ),
      min: 1,
      max: 1,
      allowProjectWrites: true,
    });
    // The report slot is a VALUE slot (never inspected, never recorded):
    // one stable non-empty statement stands for the observed refusal.
    return {
      report:
        "shared workspace target refused by the not-allowed span (refusal observed, nothing written)",
    };
  }
}
