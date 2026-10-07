// ============================================================================
// landlock-ruleset.ts : THE PURE SNAPSHOT-TO-RULESET MATERIALIZER OF THE
// COMMAND WRITE FENCE. Given a fresh ExecutionSnapshot it produces (i) the
// CONCRETE kernel writable allowlist for one spawn, (ii) the helper argv
// spec, (iii) the single-source fault-code vocabulary bridging the carrier
// exit codes onto TS refusal classification, (iv) the helper-path resolver
// plus static classify, (v) the probe ABI-report line parse, (vi) the
// post-exec denial-line renderer consuming the shared byte family, and
// (vii) the per-spawn spawn-plan materializer (engaged flag, mirror mounts,
// the plan-level kernel vector, and the typed plan-refusal forms).
//
// WHY HERE: the fence machinery is tightly coupled to the fenced bash tool
// that lands beside it in this subpackage, so the materializer ships in the
// same folder. It consumes the two shared top-level cores (effective-set
// construction, denial byte family) WITHOUT coupling to the adjudicator:
// no guard predicate is imported; the post-exec renderer MIRRORS the gate's
// governance structure term-for-term, and the colocated suite locks the
// mirror against the real gate with byte-equality rows over the full window
// table.
//
// PURITY: plain values in, plain values out. The node: surface is confined
// to statSync (the TWO DEFAULT SEAMS: the synchronous helper-mode consult
// and the spawn-plan leaf-classification consult; injected seams replace
// them entirely, and the classification reach stays confined to the
// strictly-concrete survivor paths - no other node: surface appears) and
// path.join (the resolver). No env reads, no spawns, no network, no SDK;
// process.arch and the package-root
// constant are plain reads, not channels. Every public function is TOTAL
// over its value domain - invalid readings resolve to RESULT forms (loud
// typed refusals), nothing throws.
//
// SOLE OWNER of: the fault-code vocabulary (twelve machinery codes over
// 100-111, the reserved band 112-199, C-exit to TS-classification bridge),
// the kernel-set composition, the argv assembly, the twenty-four-line
// mechanism refusal renderer, the manual probe-report line parses (the
// Landlock ABI report AND the combined vehicle-and-mount report; zero regex
// by construction - the colocated source-guard scanner stays sound via its
// zero-slash-in-residue pin), the post-exec denial renderer, the
// permission-denied attribution marker, and the spawn-plan materializer
// with its verdict and refusal forms.
//
// BAND DISCIPLINE: every fault code is issued strictly pre-execve by
// construction - a completed fenced command exiting inside the band can
// ONLY mean machinery fault; 100..111 carry the twelve assigned classes
// and 112..199 stay reserved, so in-band exits are classified CONSERVATIVE:
// each named class absorbs its own code, and unassigned band exits ride the
// band-reserved reading (enforcement was active throughout - only the
// refusal text could mislabel the cause). Interpretive authority, timing
// nuance included, sits with the TS consumer at the spawn site.
//
// GLYPH DISCIPLINE: em dashes ride their ESCAPED form (\u2014 sequence) in
// every template below; raw glyph occurrences are zero across the whole
// file, comments included (ASCII-hyphen prose only).
// ============================================================================

import { statSync } from "node:fs";
import { join } from "node:path";
import { PIO_PACKAGE_ROOT } from "../../constants.ts";
import {
  renderPhaseDenial,
  UNIVERSAL_NO_PERMISSION_DENIAL,
} from "../../denial-vocabulary.ts";
import type { EffectiveSet } from "../../permission-mechanics.ts";
import { materializeEffectiveSet } from "../../permission-mechanics.ts";
import type { ExecutionSnapshot } from "../../session-execution-state.ts";

// ===========================================================================
// (i) KERNEL WRITABLE-SET COMPOSITION
// ===========================================================================

/** The matcher-dialect metacharacter set: the shared wildcard predicate's
 * three PLUS the brace pair (the anchored-glob dialect speaks braces too,
 * and dropping brace-bearing entries is the fail-closed direction). */
const MATCHER_METACHARACTERS = ["*", "?", "[", "]", "{", "}"];

/** STRICTLY CONCRETE: non-empty, absolute, free of ALL six matcher-dialect
 * metacharacters. Set computation, not validation - failing entries
 * contribute NOTHING (silently dropped; no fault surface, no second
 * dialect). */
function strictlyConcrete(entry: string): boolean {
  if (entry.length === 0 || entry[0] !== "/") return false;
  for (const meta of MATCHER_METACHARACTERS) {
    if (entry.includes(meta)) return false;
  }
  return true;
}

/** THE CONCRETE KERNEL WRITABLE ALLOWLIST FOR ONE SPAWN - the fence's
 * admission region as plain paths: strictly-concrete declared survivors
 * (wildcard-pattern entries contribute NOTHING; span layers NEVER admit)
 * plus the class additions in pinned assembly ORDER: /dev ALWAYS (the
 * machinery allowance - ubiquitous writes under the bubble's fresh device
 * mount), then /tmp iff the effective scratch proposition, then the
 * workspace cwd iff the dual project flags agree. Global first-occurrence
 * dedupe stands over the FULL assembled vector. Pure over the GIVEN
 * snapshot; fresh array per call; caller mutation is documented, not
 * defended against (same posture as the state module). The degenerate
 * minimum over ANY window is exactly ["/dev"] - never an empty vector.
 * Inputs honor the state-channel contracts (resolved absolute anchors);
 * this composer does NOT re-validate them: a non-absolute class addition
 * becomes a non-absolute vector entry that the assembler refuses pre-child
 * (defense in depth, fail-closed at the latest pure layer). */
export function composeKernelWritableSet(
  snapshot: ExecutionSnapshot,
): string[] {
  const assembled: string[] = [];
  const seen = new Set<string>();
  const pushOnce = (entry: string): void => {
    if (!seen.has(entry)) {
      seen.add(entry);
      assembled.push(entry);
    }
  };
  // One code path: the construction core coalesces null sources onto its
  // empty base INTERNALLY, so the phase-present call needs no special-case
  // here (mirrors the gate's doctrine). A phase with no dimensions yields
  // an empty effective half, degrading the result to the machinery
  // allowance automatically.
  let scratchActive = false;
  let projectWritesActive = false;
  if (snapshot.phase !== null) {
    const effective = materializeEffectiveSet(
      snapshot.phase,
      snapshot.sources,
      snapshot.paths,
    );
    scratchActive = effective.scratchActive;
    projectWritesActive = effective.projectWritesActive;
    for (const survivor of effective.survivors) {
      if (strictlyConcrete(survivor)) pushOnce(survivor);
    }
  }
  pushOnce("/dev");
  if (scratchActive) pushOnce("/tmp");
  if (projectWritesActive) pushOnce(snapshot.paths.workspaceCwd);
  return assembled;
}

// ===========================================================================
// (ii) HELPER ARGV SPEC FOR ONE SPAWN
// ===========================================================================

/** Structurally assignable FROM the shell-config record the adjacent
 * fenced-bash consumer feeds verbatim. */
export interface ShellSpec {
  readonly shell: string;
  readonly args: readonly string[];
  readonly commandTransport?: "argv" | "stdin";
}

export type ArgvInvalidReason =
  | "empty-writable-set"
  | "non-absolute-writable-entry"
  | "empty-shell"
  | "non-absolute-shell";

export type HelperArgvVerdict =
  | {
      readonly kind: "ready";
      readonly argv: string[];
      readonly commandViaStdin: boolean;
    }
  | { readonly kind: "invalid"; readonly reason: ArgvInvalidReason };

/** PURE ASSEMBLY of the carrier argv for one spawn: --write pairs for each
 * vector entry IN VECTOR ORDER with first-occurrence dedupe (mirrors the
 * carrier's silent dedupe - double belt-and-braces for stable goldens),
 * the -- separator, then the transport tail: stdin transport leaves the
 * command OUT of the argv (it flows over the child's stdin); otherwise
 * (argv or absent transport) the command rides LAST. The command passes
 * through VERBATIM (no validation - an empty command is legal shell-wise).
 * TOTAL, never throws: invalid inputs are RESULT forms, and the validation
 * order is fixed (first violation wins) - the PROGRAM-ABSOLUTENESS contract
 * enforced at the assembly site: the carrier performs NO PATH lookup
 * (raw execve), so a relative program would die after restriction;
 * refusing pre-child is the strictly-better fail-closed point. */
export function buildHelperArgv(
  writableSet: readonly string[],
  shell: ShellSpec,
  command: string,
): HelperArgvVerdict {
  if (writableSet.length === 0) {
    return { kind: "invalid", reason: "empty-writable-set" };
  }
  for (const entry of writableSet) {
    if (!entry.startsWith("/")) {
      return { kind: "invalid", reason: "non-absolute-writable-entry" };
    }
  }
  if (shell.shell === "") {
    return { kind: "invalid", reason: "empty-shell" };
  }
  if (!shell.shell.startsWith("/")) {
    return { kind: "invalid", reason: "non-absolute-shell" };
  }
  const argv: string[] = [];
  const seen = new Set<string>();
  for (const entry of writableSet) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    argv.push("--write", entry);
  }
  argv.push("--");
  const viaStdin = shell.commandTransport === "stdin";
  argv.push(shell.shell);
  for (const arg of shell.args) {
    argv.push(arg);
  }
  if (!viaStdin) argv.push(command);
  return { kind: "ready", argv, commandViaStdin: viaStdin };
}

// ===========================================================================
// (iii) SINGLE-SOURCE FAULT-CODE VOCABULARY
// ===========================================================================

/** THE production home of the twelve machinery fault codes (the sibling
 * helper suite's local replicas bind to these through parity rows). Values
 * are the vendor README table verbatim. The seven SUPERVISOR-FAMILY codes
 * (105-111) reuse the sibling suite const-block key names byte-exact
 * (single-source continuity, no renaming at the bridge); their committed
 * class meanings ride from the vehicle protocol's fault table: supervisor-
 * table-malformed = supervisor-family argv violation incl. the combined-arm
 * arity/path corner; realm-clone-failure = the vehicle clone failed; realm-
 * map-write-failure = parent-side map open/write failure, NON-ENOENT; child-
 * early-death = the ENOENT signature at the map targets OR the continue-
 * verdict write failed; realm-unshare-failure = the in-realm private mount
 * namespace unshare failed; overlay-mount-failure = the setup / attach /
 * in-flight verification umbrella; overlay-umount-failure = the throwaway
 * arm only. Band discipline: codes are issued only pre-execve BY
 * CONSTRUCTION (the disambiguation invariant holds over 100-111 - every new
 * code issues strictly before the command execve), so a completed
 * restriction-carried command exiting in-band can ONLY mean machinery
 * fault; 112..199 stay
 * reserved (their disambiguation exists by construction, not by luck). */
export const LANDLOCK_FAULT_CODES: Readonly<{
  malformedSpec: number;
  abiMissingOrBlocked: number;
  addRuleFailure: number;
  restrictSelfFailure: number;
  execveFailure: number;
  supervisorTableMalformed: number;
  realmCloneFailure: number;
  realmMapWriteFailure: number;
  childEarlyDeath: number;
  realmUnshareFailure: number;
  overlayMountFailure: number;
  overlayUmountFailure: number;
}> = {
  malformedSpec: 100,
  abiMissingOrBlocked: 101,
  addRuleFailure: 102,
  restrictSelfFailure: 103,
  execveFailure: 104,
  supervisorTableMalformed: 105,
  realmCloneFailure: 106,
  realmMapWriteFailure: 107,
  childEarlyDeath: 108,
  realmUnshareFailure: 109,
  overlayMountFailure: 110,
  overlayUmountFailure: 111,
};

/** THE reserved fault band - the low end carries the twelve assigned
 * machinery codes (100-111), the rest stays reserved. */
export const LANDLOCK_FAULT_BAND: readonly [number, number] = [100, 199];

export type AssignedFaultClass =
  | "malformed-spec"
  | "abi-missing-or-blocked"
  | "add-rule-failure"
  | "restrict-self-failure"
  | "execve-failure"
  | "supervisor-table-malformed"
  | "realm-clone-failure"
  | "realm-map-write-failure"
  | "child-early-death"
  | "realm-unshare-failure"
  | "overlay-mount-failure"
  | "overlay-umount-failure"
  | "band-reserved";

export type LandlockExitVerdict =
  | { readonly kind: "command-exit"; readonly code: number }
  | {
      readonly kind: "mechanism-fault";
      readonly code: number;
      readonly fault: AssignedFaultClass;
    };

/** THE C-exit to TS-classification BRIDGE. Total and pure over number: any
 * integral code inside the band maps to mechanism-fault with the assigned
 * class (the twelve named codes, or band-reserved for the unassigned
 * 112..199 - the conservative reading made EXPLICIT rather than invented ad
 * hoc); anything else passes through as a command exit (kernel exit codes are
 * integral - fractional/NaN readings are spawn-domain artifacts; the
 * killed/spawn-abnormal case where the exit code is absent is the
 * spawner's domain and never reaches this classifier). Per-spawn authority
 * doctrine: no memoization, every consult is fresh. */
export function classifyLandlockExit(code: number): LandlockExitVerdict {
  if (
    !Number.isInteger(code) ||
    code < LANDLOCK_FAULT_BAND[0] ||
    code > LANDLOCK_FAULT_BAND[1]
  ) {
    return { kind: "command-exit", code };
  }
  switch (code) {
    case LANDLOCK_FAULT_CODES.malformedSpec:
      return { kind: "mechanism-fault", code, fault: "malformed-spec" };
    case LANDLOCK_FAULT_CODES.abiMissingOrBlocked:
      return { kind: "mechanism-fault", code, fault: "abi-missing-or-blocked" };
    case LANDLOCK_FAULT_CODES.addRuleFailure:
      return { kind: "mechanism-fault", code, fault: "add-rule-failure" };
    case LANDLOCK_FAULT_CODES.restrictSelfFailure:
      return { kind: "mechanism-fault", code, fault: "restrict-self-failure" };
    case LANDLOCK_FAULT_CODES.execveFailure:
      return { kind: "mechanism-fault", code, fault: "execve-failure" };
    case LANDLOCK_FAULT_CODES.supervisorTableMalformed:
      return {
        kind: "mechanism-fault",
        code,
        fault: "supervisor-table-malformed",
      };
    case LANDLOCK_FAULT_CODES.realmCloneFailure:
      return { kind: "mechanism-fault", code, fault: "realm-clone-failure" };
    case LANDLOCK_FAULT_CODES.realmMapWriteFailure:
      return {
        kind: "mechanism-fault",
        code,
        fault: "realm-map-write-failure",
      };
    case LANDLOCK_FAULT_CODES.childEarlyDeath:
      return { kind: "mechanism-fault", code, fault: "child-early-death" };
    case LANDLOCK_FAULT_CODES.realmUnshareFailure:
      return {
        kind: "mechanism-fault",
        code,
        fault: "realm-unshare-failure",
      };
    case LANDLOCK_FAULT_CODES.overlayMountFailure:
      return {
        kind: "mechanism-fault",
        code,
        fault: "overlay-mount-failure",
      };
    case LANDLOCK_FAULT_CODES.overlayUmountFailure:
      return {
        kind: "mechanism-fault",
        code,
        fault: "overlay-umount-failure",
      };
    default:
      return { kind: "mechanism-fault", code, fault: "band-reserved" };
  }
}

// ===========================================================================
// THE TWENTY-FOUR-LINE MECHANISM REFUSAL FAMILY
// ===========================================================================

export type StaticFaultKind =
  | "helper-unmapped-arch"
  | "helper-absent"
  | "helper-not-executable";

export type ProbeFaultKind = "probe-refused" | "probe-abnormal";

/** The planner-refusal arms (pre-child typed refusals over degenerate
 * mirror geometry - the spawn plan's own refusal result forms rendered
 * into the same house voice). */
type PlannerRefusalKind = "nested-mirror" | "root-mount";

/** The engaged-probe pair (parallel to the Landlock-probe siblings over
 * the combined vehicle-and-mount applicability arm). */
type CombinedProbeFaultKind =
  | "overlay-probe-refused"
  | "overlay-probe-abnormal";

/** The engaged pre-child machinery classes (scratch-area collision guard
 * and scratch-mint faults - typed BEFORE any state change). */
type ScratchMachineryKind = "scratch-area-collision" | "scratch-mint-failure";

export type MechanismFault =
  | StaticFaultKind
  | ProbeFaultKind
  | PlannerRefusalKind
  | CombinedProbeFaultKind
  | ScratchMachineryKind
  | AssignedFaultClass;

export interface RefusalContext {
  readonly arch?: string; // unmapped-arch form
  readonly helperPath?: string; // absent / not-executable forms
  readonly discoveredAbi?: number; // probe-refused form
  readonly pinnedAbi?: number; // probe-refused form
  readonly probeExit?: number | null; // probe-abnormal form (null = abnormal death)
  readonly probeOutput?: string; // probe-abnormal form (collapsed at render time)
  readonly mirrorInner?: string; // nested-mirror form (inner mount detail)
  readonly mirrorOuter?: string; // nested-mirror form (outer mount detail)
  readonly combinedRealm?: "ok" | "fail"; // overlay-probe-refused form (realm cell)
  readonly combinedStatus?: "ok" | "fail"; // overlay-probe-refused form (status cell)
  readonly combinedStage?: string; // overlay-probe-refused form (stderr stage diagnostic, collapsed at render time)
  readonly combinedProbeExit?: number | null; // overlay-probe-abnormal form (null = abnormal death)
  readonly combinedProbeOutput?: string; // overlay-probe-abnormal form (collapsed at render time)
  readonly scratchCollisionDetail?: string; // scratch-area-collision form
  readonly scratchRoot?: string; // scratch-mint-failure form
  readonly exitCode?: number; // band-reserved form
}

const DEGRADED_DETAIL = "n/a";

/** Missing optional context fields degrade to the placeholder instead of
 * leaking undefined into a line; numerals render via decimal string
 * conversion. */
function contextSlot(value: number | string | null | undefined): string {
  if (value === undefined || value === null) return DEGRADED_DETAIL;
  return String(value);
}

const DETAIL_SPACES = " \t\n\r\f\v";

/** Collapse an embedded diagnostic to ONE physical line (whitespace-fold
 * mirror of the launcher's detail semantics: whitespace runs fold to
 * single spaces, trimmed, empty becomes the no-message placeholder) so a
 * refusal stays exactly one line regardless of embedded diagnostics. */
function collapseDetail(raw: string): string {
  let folded = "";
  let spaceRun = true;
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index];
    if (DETAIL_SPACES.includes(ch)) {
      spaceRun = true;
      continue;
    }
    if (folded.length > 0 && spaceRun) folded += " ";
    spaceRun = false;
    folded += ch;
  }
  return folded.length > 0 ? folded : "(no message)";
}

/** THE TWENTY-FOUR mechanism-refusal lines, rendered in the ONE house
 * voice: fixed head, one escaped em dash, one physical line, trailing
 * period, measured details in parentheses. Single owner of all twenty-four
 * byte sequences - the seven supervisor-family C-exit lines cite the const-
 * block codes exactly like the five apply-mode siblings (ONE template per
 * class, used both pre-child AND at settlement); the planner-refusal,
 * combined-probe, and scratch-machinery families ride their measured detail
 * slots (degraded-detail placeholders stand for absent fields exactly like
 * the existing slots). */
export function renderMechanismRefusal(
  fault: MechanismFault,
  ctx?: RefusalContext,
): string {
  switch (fault) {
    case "helper-unmapped-arch":
      return `Command execution refused \u2014 the Landlock fence carrier cannot be resolved for host architecture '${contextSlot(ctx?.arch)}'; refusing to run unfenced.`;
    case "helper-absent":
      return `Command execution refused \u2014 the Landlock fence carrier is absent at ${contextSlot(ctx?.helperPath)}; refusing to run unfenced.`;
    case "helper-not-executable":
      return `Command execution refused \u2014 the Landlock fence carrier at ${contextSlot(ctx?.helperPath)} is not executable; refusing to run unfenced.`;
    case "probe-refused":
      return `Command execution refused \u2014 the Landlock applicability probe reported abi=${contextSlot(ctx?.discoveredAbi)} pin=${contextSlot(ctx?.pinnedAbi)} (exact identity required); refusing to run unfenced.`;
    case "probe-abnormal":
      return `Command execution refused \u2014 the Landlock applicability probe reported no usable verdict (exit=${contextSlot(ctx?.probeExit)}, output=${collapseDetail(ctx?.probeOutput ?? "")}); refusing to run unfenced.`;
    case "malformed-spec":
      return `Command execution refused \u2014 the fence carrier rejected its own specification (fault class 'malformed-spec', exit ${LANDLOCK_FAULT_CODES.malformedSpec}); refusing to run unfenced.`;
    case "abi-missing-or-blocked":
      return `Command execution refused \u2014 the Landlock fence could not be established (fault class 'abi-missing-or-blocked', exit ${LANDLOCK_FAULT_CODES.abiMissingOrBlocked}); refusing to run unfenced.`;
    case "add-rule-failure":
      return `Command execution refused \u2014 the writable allowlist could not be granted to the Landlock fence (fault class 'add-rule-failure', exit ${LANDLOCK_FAULT_CODES.addRuleFailure}); refusing to run unfenced.`;
    case "restrict-self-failure":
      return `Command execution refused \u2014 the Landlock fence could not be applied to the spawn (fault class 'restrict-self-failure', exit ${LANDLOCK_FAULT_CODES.restrictSelfFailure}); refusing to run unfenced.`;
    case "execve-failure":
      return `Command execution refused \u2014 the fenced command shell failed to start after restriction (fault class 'execve-failure', exit ${LANDLOCK_FAULT_CODES.execveFailure}); refusing to run unfenced.`;
    case "supervisor-table-malformed":
      return `Command execution refused \u2014 the supervisor mirror table was rejected before any state change (fault class 'supervisor-table-malformed', exit ${LANDLOCK_FAULT_CODES.supervisorTableMalformed}); refusing to run unfenced.`;
    case "realm-clone-failure":
      return `Command execution refused \u2014 the private user realm could not be cloned (fault class 'realm-clone-failure', exit ${LANDLOCK_FAULT_CODES.realmCloneFailure}); refusing to run unfenced.`;
    case "realm-map-write-failure":
      return `Command execution refused \u2014 the realm identity maps could not be written on the parent side (fault class 'realm-map-write-failure', exit ${LANDLOCK_FAULT_CODES.realmMapWriteFailure}); refusing to run unfenced.`;
    case "child-early-death":
      return `Command execution refused \u2014 the vehicle child died before the realm identity maps completed (fault class 'child-early-death', exit ${LANDLOCK_FAULT_CODES.childEarlyDeath}); refusing to run unfenced.`;
    case "realm-unshare-failure":
      return `Command execution refused \u2014 the private mount namespace could not be unshared inside the realm (fault class 'realm-unshare-failure', exit ${LANDLOCK_FAULT_CODES.realmUnshareFailure}); refusing to run unfenced.`;
    case "overlay-mount-failure":
      return `Command execution refused \u2014 the mirror overlay could not be mounted or verified through the merged view (fault class 'overlay-mount-failure', exit ${LANDLOCK_FAULT_CODES.overlayMountFailure}); refusing to run unfenced.`;
    case "overlay-umount-failure":
      return `Command execution refused \u2014 the throwaway probe tree could not be detached after verification (fault class 'overlay-umount-failure', exit ${LANDLOCK_FAULT_CODES.overlayUmountFailure}); refusing to run unfenced.`;
    case "nested-mirror":
      return `Command execution refused \u2014 the planned mirror mounts nest (${contextSlot(ctx?.mirrorInner)} beneath ${contextSlot(ctx?.mirrorOuter)}); refusing to run unfenced.`;
    case "root-mount":
      return `Command execution refused \u2014 the spawn plan refuses a mirror mount at the filesystem root; refusing to run unfenced.`;
    case "overlay-probe-refused":
      return `Command execution refused \u2014 the combined applicability probe reported realm=${contextSlot(ctx?.combinedRealm)} status=${contextSlot(ctx?.combinedStatus)} (stage=${collapseDetail(ctx?.combinedStage ?? "")}); refusing to run unfenced.`;
    case "overlay-probe-abnormal":
      return `Command execution refused \u2014 the combined applicability probe reported no usable verdict (exit=${contextSlot(ctx?.combinedProbeExit)}, output=${collapseDetail(ctx?.combinedProbeOutput ?? "")}); refusing to run unfenced.`;
    case "scratch-area-collision":
      return `Command execution refused \u2014 the scratch area intersects a planned mirror mount (${contextSlot(ctx?.scratchCollisionDetail)}); refusing to run unfenced.`;
    case "scratch-mint-failure":
      return `Command execution refused \u2014 the scratch triples could not be created under ${contextSlot(ctx?.scratchRoot)}; refusing to run unfenced.`;
    case "band-reserved":
      return `Command execution refused \u2014 the fenced command exited with code ${contextSlot(ctx?.exitCode)} inside the reserved fault band ${LANDLOCK_FAULT_BAND[0]}-${LANDLOCK_FAULT_BAND[1]} (interpreted conservatively as a fence machinery fault; enforcement was active throughout).`;
  }
}

// ===========================================================================
// POST-EXEC ATTRIBUTION MARKER
// ===========================================================================

/** THE exact substring common to ALL THREE measured denial forms (the dash
 * create diagnostic, the python errno traceback line, the GNU rm remove
 * diagnostic) - the production trigger home for post-exec attribution on a
 * non-zero exit whose mirrored tail carries the marker. */
export const PERMISSION_DENIED_MARKER = "Permission denied";

// ===========================================================================
// (iv) HELPER-PATH RESOLVER + STATIC CLASSIFY (launcher-trio posture)
// ===========================================================================

/** Map Node's process.arch onto the convention's uname -m arch tokens.
 * LOAD-BEARING: Node reports x64/arm64, NOT the convention tokens - never
 * assume they coincide. Exotic arch returns NULL (fail-closed downstream;
 * no silent fallback to another prebuild, ever). */
export function landlockArchToken(nodeArch: string): string | null {
  if (nodeArch === "x64") return "x86_64";
  if (nodeArch === "arm64") return "aarch64";
  return null;
}

/** Resolve the carrier path for one architecture over one package root
 * (pure string join, no fs): vendor carrier layout under bin by arch token.
 * Defaults read process.arch and the package-root constant (plain reads,
 * not channels). Unmappable arch resolves to NULL - the absence is a
 * NORMATIVE condition the classifier owns (loud refusal, never
 * unsandboxed). */
export function resolveLandlockHelperPath(
  nodeArch: string = process.arch,
  packageRoot: string = PIO_PACKAGE_ROOT,
): string | null {
  const token = landlockArchToken(nodeArch);
  if (token === null) return null;
  return join(
    packageRoot,
    "vendor",
    "landlock-helper",
    "bin",
    `${token}-linux`,
    "landlock-helper",
  );
}

export interface HelperStatSeams {
  readonly statMode?: (p: string) => number | undefined;
}

export interface HelperObservations {
  /** The RAW node arch token. */
  readonly arch: string;
  /** Null = unresolved (unmapped arch). */
  readonly path: string | null;
  /** Mode bits, or undefined = unreadable. */
  readonly mode: number | undefined;
}

export type HelperCheck =
  | { readonly ok: true; readonly path: string }
  | {
      readonly ok: false;
      readonly reason: "helper-unmapped-arch";
      readonly arch: string;
    }
  | {
      readonly ok: false;
      readonly reason: "helper-absent";
      readonly path: string;
    }
  | {
      readonly ok: false;
      readonly reason: "helper-not-executable";
      readonly path: string;
    };

/** PURE TOTAL classifier over the three observations (fixed check order,
 * never throws): unmapped arch (unresolved path) -> absent (unreadable
 * mode refuses CONSERVATIVELY under the absent naming, verifier-failure
 * posture) -> not-executable (NO exec bit at all) -> ready (ANY of the
 * three exec bits suffices). */
export function classifyHelper(observations: HelperObservations): HelperCheck {
  if (observations.path === null) {
    return {
      ok: false,
      reason: "helper-unmapped-arch",
      arch: observations.arch,
    };
  }
  if (observations.mode === undefined) {
    return { ok: false, reason: "helper-absent", path: observations.path };
  }
  if ((observations.mode & 0o111) === 0) {
    return {
      ok: false,
      reason: "helper-not-executable",
      path: observations.path,
    };
  }
  return { ok: true, path: observations.path };
}

/** The default stat seam: the real stat wrapped in try-catch so unreadable
 * observations (missing file, permission) resolve to undefined and refuse
 * conservatively downstream. Injected seams replace this entirely - there
 * is no other filesystem reach in this module. SYNCHRONOUS by design: a
 * stat-only consult (no exec happens here - the throwaway probe fork is the
 * adjacent spawn site's fast-path gate, never a standing permission;
 * per-spawn fresh consult, TOCTOU authority at the spawn site). */
function defaultStatMode(candidate: string): number | undefined {
  try {
    return statSync(candidate).mode;
  } catch {
    return undefined;
  }
}

/** Composes the defaults: host arch token -> conventional path -> the
 * default (or injected) stat seam -> the total classifier. */
export function checkLandlockHelper(seams?: HelperStatSeams): HelperCheck {
  const arch = process.arch;
  const path = resolveLandlockHelperPath();
  const consult = seams?.statMode ?? defaultStatMode;
  const mode = path === null ? undefined : consult(path);
  return classifyHelper({ arch, path, mode });
}

// ===========================================================================
// (v) PROBE-REPORT LINE PARSING (both arms - zero regex by construction)
// ===========================================================================

export interface ProbeReport {
  readonly abi: number;
  readonly pin: number;
  /** Discriminant-narrowed - never a raw cast. */
  readonly status: "ok" | "fail";
}

/** Digit runs above nine digits refuse deliberately (precision safety) -
 * STRICTER than an imprecise wider parse; the fail-closed direction. */
const PROBE_MAX_DIGITS = 9;

/** Digit value by char code (48..57, i.e. the characters 0 through 9);
 * anything else refuses. Cast-free numeric route over the bounded digit
 * run - lossless by construction. */
function digitValue(char: string): number | null {
  const codePoint = char.charCodeAt(0);
  if (codePoint < 48 || codePoint > 57) return null;
  return codePoint - 48;
}

/** prefix + 1..9 digits or NULL: the manual field reader of the total
 * probe-line parse (zero regex by construction). */
function readDigitField(token: string, prefix: string): number | null {
  if (!token.startsWith(prefix)) return null;
  const digits = token.slice(prefix.length);
  if (digits.length === 0 || digits.length > PROBE_MAX_DIGITS) return null;
  let value = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = digitValue(digits[index]);
    if (digit === null) return null;
    value = value * 10 + digit;
  }
  return value;
}

/** TOTAL MANUAL parse of the pinned single-line ABI report (the line
 * WITHOUT its trailing newline - the caller strips exactly one terminator;
 * any embedded LF or CR refuses structurally): exactly five single-space-
 * separated tokens; the program word and the verb word by exact equality;
 * the abi and pin fields as bounded digit runs; the status field by EXACT
 * membership in the two measured literals. Any deviation (off-form,
 * truncated, extra tokens, zero-digit, over-long, wrong program, wrong
 * word order, unknown status) refuses with null. Semantics encoded
 * (measured): status ok means discovered equals pin (EXACT IDENTITY) and
 * the full probe sequence completed, hence exit 0; status fail means exit
 * with the ABI fault code (both-direction identity refusal and
 * blocked/unsupported alike). The probe is the THROWAWAY applicability
 * check - never applied to the long-lived agent process. This parser is
 * the verbatim consumption point of the spawn-site fast-path gate and
 * decides NOTHING itself: authority sits at the spawn site. */
export function parseProbeReport(line: string): ProbeReport | null {
  const tokens = line.split(" ");
  if (tokens.length !== 5) return null;
  if (tokens[0] !== "landlock-helper") return null;
  if (tokens[1] !== "probe") return null;
  const abi = readDigitField(tokens[2], "abi=");
  if (abi === null) return null;
  const pin = readDigitField(tokens[3], "pin=");
  if (pin === null) return null;
  if (tokens[4] === "status=ok") return { abi, pin, status: "ok" };
  if (tokens[4] === "status=fail") return { abi, pin, status: "fail" };
  return null;
}

/** THE discriminated result of the combined-arm report-line parse. All
 * FOUR syntactic cells are ACCEPTED (incl. the documented-unreachable
 * (status=ok, realm=fail) cell - the parser stays TOTAL over syntax;
 * reachability is the consumer's concern, never the parser's). */
export interface OverlayProbeReport {
  readonly realm: "ok" | "fail";
  readonly status: "ok" | "fail";
}

/** TOTAL MANUAL parse of the pinned single-line combined-arm report (the
 * line WITHOUT its trailing newline - the caller strips exactly one
 * terminator; any embedded LF or CR refuses structurally): exactly four
 * single-space-separated tokens; the program word and the verb word by
 * EXACT equality; the realm and status fields by exact membership in the
 * two measured literals each (the same two-literal style as the adjacent
 * parseProbeReport status field). Any deviation (off-form, truncated,
 * extra tokens, double spaces, wrong program, wrong word order, unknown
 * cell) refuses with null. Never throws; zero regex (the module's
 * zero-slash-in-residue charter holds). Semantics encoded (measured): the
 * ONLY ok cell is (status=ok, realm=ok) with exit 0 - the full vehicle
 * plus mount sequence completed; (status=fail, realm=fail) localizes the
 * FIRST failing stage to a VEHICLE stage; (status=fail, realm=ok)
 * localizes later-stage failures to the non-vehicle legs; (status=ok,
 * realm=fail) is UNREACHABLE - accepted here, unreachable at the arm.
 * EXIT CODE IS AUTHORITATIVE IN ALL CASES - this parser is the verbatim
 * consumption point of the spawn-site second latch and decides NOTHING
 * itself: authority sits at the spawn site. */
export function parseOverlayProbeReport(
  line: string,
): OverlayProbeReport | null {
  const tokens = line.split(" ");
  if (tokens.length !== 4) return null;
  if (tokens[0] !== "landlock-helper") return null;
  if (tokens[1] !== "overlay") return null;
  const realmCell = tokens[2];
  const statusCell = tokens[3];
  if (realmCell !== "realm=ok" && realmCell !== "realm=fail") return null;
  if (statusCell !== "status=ok" && statusCell !== "status=fail") return null;
  return {
    realm: realmCell === "realm=ok" ? "ok" : "fail",
    status: statusCell === "status=ok" ? "ok" : "fail",
  };
}

// ===========================================================================
// (vi) POST-EXEC DENIAL-LINE RENDERER
// ===========================================================================

/** THE command fence's attribution line, rendered from the SHARED byte
 * family - the standard TWO shapes ONLY, byte-IDENTICAL to what write/edit
 * receive in the SAME window (the bare line: no mechanism preamble, no
 * trailing newline - stream framing belongs to the spawn site).
 * Governance structure MIRRORED term-for-term from the gate (documented
 * here; the colocated suite binds the mirror against the real gate with
 * byte-equality rows over the full window table): a phase whose
 * declaration confers governance governs exclusively over its EFFECTIVE
 * construction (shared core, fresh per call); an EMPTY effective
 * construction confers no governance and falls through lazily; EVERY
 * non-governing window renders the universal constant verbatim (the
 * parameter-free import - one code path, never a local replica). The
 * listing shows the MOMENT'S effective construction exactly as the gate
 * sees it: declared survivors RAW (any wildcard-pattern entries the kernel
 * set drops are still listed here - listed-but-not-granted is a known,
 * owned semantic divergence between the model-facing VOICE and the
 * machinery). */
export function renderCommandLandlockDenial(
  snapshot: ExecutionSnapshot,
): string {
  const phase = snapshot.phase;
  if (
    phase !== null &&
    (phase.declared.length > 0 ||
      phase.allowProjectWrites ||
      phase.tmpDirAllowed)
  ) {
    const effective: EffectiveSet = materializeEffectiveSet(
      phase,
      snapshot.sources,
      snapshot.paths,
    );
    if (
      effective.survivors.length > 0 ||
      effective.projectWritesActive ||
      effective.scratchActive
    ) {
      return renderPhaseDenial(
        phase.id,
        effective.survivors,
        effective.projectWritesActive ? snapshot.paths.workspaceCwd : null,
        effective.scratchActive,
      );
    }
  }
  return UNIVERSAL_NO_PERMISSION_DENIAL;
}

// ===========================================================================
// (vii) PER-SPAWN SPAWN-PLAN MATERIALIZER
// ===========================================================================

/** THE leaf-classification reading: regular file / directory / the
 * catch-all unknown (absent, unreadable, non-regular). */
export type PathKind = "file" | "dir" | "unknown";

/** Classification seam bag (the HelperStatSeams precedent): an injected
 * classifyPath REPLACES the statSync-backed default ENTIRELY - there is no
 * partial override, and the planner consults ONLY strictly-concrete
 * survivors, ONCE each, in declaration order. */
export interface PathClassifySeams {
  readonly classifyPath?: (p: string) => PathKind;
}

/** THE per-spawn SPAWN-PLAN VERDICT - total over the snapshot's value
 * domain (result forms, never throws). Ready carries the engagement
 * decision, the deduped mirror mount points (declaration order,
 * first-occurrence; EMPTY iff not engaged - the engaged flag holds IFF the
 * list is non-empty by construction), and the plan-level kernel vector
 * (leaves swapped for their envelopes IN PLACE at the survivor's own
 * assembly position; the class channel exactly as the composer builds it;
 * one global first-occurrence dedupe over the FULL assembled vector).
 * The refusal arms are the two degenerate corners, checked AFTER mount
 * collection in FIXED cheap-first order: any planned mount point of "/"
 * refuses TYPED rather than planning an overlay over the real root (the
 * mirror-channel analogue of the retained structural fact "never grant /");
 * one planned mount point beneath ANOTHER refuses TYPED rather than
 * composing nested overlays, reported DETERMINISTIC FIRST-HIT (inner
 * candidates in mirrorMounts order, the first proper-ancestor hit wins; the
 * pair names the measured detail the downstream renderer consumes). Both
 * arms leave the ready-form fields ABSENT entirely (discriminated arms -
 * degraded-detail rendering belongs to the spawn site's voice layer). */
export type SpawnPlanVerdict =
  | {
      readonly kind: "ready";
      readonly engaged: boolean;
      readonly mirrorMounts: readonly string[];
      readonly kernelVector: readonly string[];
    }
  | {
      readonly kind: "nested-mirror";
      readonly inner: string;
      readonly outer: string;
    }
  | { readonly kind: "root-mount" };

/** The CONTAINING DIRECTORY of a strictly-concrete absolute path: the
 * prefix up to (EXCLUDING) the last path separator - string methods only
 * (lastIndexOf over the separator literal, which sits inside a string
 * literal and keeps the residue slash-free - no regex, no dirname import).
 * An EMPTY result (a direct-under-root leaf) normalizes to "/" BEFORE
 * validation. Input domain is the strictly-concrete survivors (always begin
 * with the separator), so the index is never negative. */
function containingDir(leaf: string): string {
  const prefix = leaf.slice(0, leaf.lastIndexOf("/"));
  return prefix === "" ? "/" : prefix;
}

/** The DEFAULT classification seam: ONE statSync consult wrapped in
 * try-catch, built EXACTLY like the sibling defaultStatMode (the same
 * single node:fs reach already imported - no new node: surface appears).
 * Readable REGULAR FILE => "file"; readable DIRECTORY => "dir"; EVERYTHING
 * ELSE - absent, unreadable, or non-regular (char devices, fifos,
 * sockets) - falls into the "unknown" catch-all. Unknown reads as the
 * CREATE-INTENT leaf downstream: the absent state must engage the gate,
 * and the fail-closed pairing with the downstream attach-fault refusal
 * keeps a wrongly assumed leaf safe end-to-end (it dies later as the typed
 * pre-child refusal - never an ungoverned write). SYNCHRONOUS by design
 * (same posture as the helper consult: no exec happens here; authority at
 * the spawn site). */
function defaultClassifyPath(candidate: string): PathKind {
  try {
    const info = statSync(candidate);
    if (info.isFile()) return "file";
    if (info.isDirectory()) return "dir";
  } catch {
    // Absent, unreadable, or non-regular alike fall to the catch-all.
  }
  return "unknown";
}

/** THE pure snapshot-to-spawn-plan materializer: given the moment's
 * ExecutionSnapshot it decides WHETHER THE MIRROR MECHANIC ENGAGES and
 * assembles the three facts a ready verdict carries. Pinned algorithmic
 * order (deterministic, golden-stable):
 * (1) effective construction - ONE fresh materializeEffectiveSet consult
 * over the phase/sources/paths triple; a NULL phase degrades to no
 * survivors and both class propositions false (mirrors the composer's exact
 * structure - one code path; the core coalesces null sources internally);
 * (2) the strictly-concrete filter over the survivors (declaration order
 * preserved; wildcard-pattern text drops HERE, before any consult);
 * (3) the classification of each filtered survivor, ONCE each, in
 * declaration order (injected seam or the statSync-backed default);
 * (4) the leaf set - readings "file" OR "unknown" (the create-intent
 * reading), and the mirror mounts: the containing dirs of the leaves in
 * declaration order, first-occurrence dedupe mirroring the composer, the
 * empty-residue form normalized to "/" before validation;
 * (5) the kernel vector rebuilt by the SAME single global first-occurrence
 * dedupe pass over the FULL assembled vector: each DIRECTORY-shaped
 * survivor emits ITSELF (shipped behavior), each LEAF-shaped survivor
 * emits its ENVELOPE IN PLACE AT ITS OWN ASSEMBLY POSITION (minimal
 * perturbation - every unengaged vector element-for-element equals the
 * composer's output, by construction), then the class additions trail in
 * the shipped order (/dev ALWAYS, /tmp iff scratch active, the workspace
 * cwd iff the dual project flags agree);
 * (6) validation AFTER mount collection, fixed cheap-first order: the
 * root-mount corner BEFORE the deterministic nested first-hit scan;
 * (7) the ready form. No early return before (6) except via the result
 * arms; no second dedupe dialect.
 *
 * ENVELOPE-AS-PLUMBING DOCTRINE: LSM-hook semantics require writes through
 * the overlay to still fire the path hooks, so the mirrored dirs carry a
 * covering kernel grant or legal writes die EPERM before the copy-on-write
 * layer; the precision lives in the spawn-site verdict, never here - the
 * envelope is plumbing, not policy. FRESHNESS: every call re-materializes
 * AND re-classifies (per-spawn fresh consult doctrine, no memoization
 * anywhere). NO NEW ABSOLUTENESS DIALECT: the planner adds no extra
 * absoluteness checks on any input - it honors the state-channel
 * resolved-absolute contract and re-validates NOTHING; a non-absolute
 * channel value degrades exactly as today (the assembler-side pre-child
 * refusal remains the latest pure-layer guard - defense in depth unchanged).
 * TOTAL, never throws: hostile inputs (degenerate anchors, relative
 * survivors, empty declarations, null-source-with-phase shapes) RESOLVE to
 * result forms. */
export function composeSpawnPlan(
  snapshot: ExecutionSnapshot,
  seams?: PathClassifySeams,
): SpawnPlanVerdict {
  const classify = seams?.classifyPath ?? defaultClassifyPath;
  const concrete: string[] = [];
  const kinds = new Map<string, PathKind>();
  let scratchActive = false;
  let projectWritesActive = false;
  if (snapshot.phase !== null) {
    const effective = materializeEffectiveSet(
      snapshot.phase,
      snapshot.sources,
      snapshot.paths,
    );
    scratchActive = effective.scratchActive;
    projectWritesActive = effective.projectWritesActive;
    for (const survivor of effective.survivors) {
      if (!strictlyConcrete(survivor)) continue;
      concrete.push(survivor);
      kinds.set(survivor, classify(survivor));
    }
  }
  // THE MIRROR MOUNTS: the deduped containing dirs of the LEAF-shaped
  // survivors ONLY (declaration order, first-occurrence). Dir-shaped
  // survivors and the class tokens NEVER land here - a mount exists because
  // of a declared leaf, never because a class flag is active.
  const mirrorMounts: string[] = [];
  const mountSeen = new Set<string>();
  let engaged = false;
  for (const survivor of concrete) {
    const kind = kinds.get(survivor);
    if (kind === "dir") continue;
    engaged = true;
    const envelope = containingDir(survivor);
    if (!mountSeen.has(envelope)) {
      mountSeen.add(envelope);
      mirrorMounts.push(envelope);
    }
  }
  // THE KERNEL VECTOR: the Landlock grant list - NOT the mount table. Same
  // single global first-occurrence dedupe as the mounts: each dir-shaped
  // survivor emits ITSELF, each leaf its envelope IN PLACE, then the class
  // channel exactly as the shipped composer builds it (/dev ALWAYS, /tmp iff
  // scratch active, workspace cwd iff the dual project flags agree). Coarse
  // by design: the grants are plumbing for the LSM path hooks, not precision
  // - file-exactness settles in the spawn-site verdict over the captured
  // upperdir.
  const kernelVector: string[] = [];
  const vectorSeen = new Set<string>();
  const pushOnce = (entry: string): void => {
    if (!vectorSeen.has(entry)) {
      vectorSeen.add(entry);
      kernelVector.push(entry);
    }
  };
  for (const survivor of concrete) {
    const kind = kinds.get(survivor);
    pushOnce(kind === "dir" ? survivor : containingDir(survivor));
  }
  pushOnce("/dev");
  if (scratchActive) pushOnce("/tmp");
  if (projectWritesActive) pushOnce(snapshot.paths.workspaceCwd);
  for (const mount of mirrorMounts) {
    if (mount === "/") return { kind: "root-mount" };
  }
  for (let innerIndex = 0; innerIndex < mirrorMounts.length; innerIndex += 1) {
    const inner = mirrorMounts[innerIndex];
    for (
      let outerIndex = 0;
      outerIndex < mirrorMounts.length;
      outerIndex += 1
    ) {
      const outer = mirrorMounts[outerIndex];
      if (inner !== outer && inner.startsWith(`${outer}/`)) {
        return { kind: "nested-mirror", inner, outer };
      }
    }
  }
  return { kind: "ready", engaged, mirrorMounts, kernelVector };
}
