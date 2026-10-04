// ============================================================================
// landlock-ruleset.ts : THE PURE SNAPSHOT-TO-RULESET MATERIALIZER OF THE
// COMMAND WRITE FENCE. Given a fresh ExecutionSnapshot it produces (i) the
// CONCRETE kernel writable allowlist for one spawn, (ii) the helper argv
// spec, (iii) the single-source fault-code vocabulary bridging the carrier
// exit codes onto TS refusal classification, (iv) the helper-path resolver
// plus static classify, (v) the probe ABI-report line parse, and (vi) the
// post-exec denial-line renderer consuming the shared byte family.
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
// to statSync (the DEFAULT STAT SEAM of the synchronous helper consult;
// injected seams replace it entirely) and path.join (the resolver). No env
// reads, no spawns, no network, no SDK; process.arch and the package-root
// constant are plain reads, not channels. Every public function is TOTAL
// over its value domain - invalid readings resolve to RESULT forms (loud
// typed refusals), nothing throws.
//
// SOLE OWNER of: the fault-code vocabulary (five machinery codes, reserved
// band, C-exit to TS-classification bridge), the kernel-set composition,
// the argv assembly, the eleven-line mechanism refusal renderer, the manual
// probe-line parse (zero regex by construction - the colocated source-guard
// scanner stays sound via its zero-slash-in-residue pin), the post-exec
// denial renderer, and the permission-denied attribution marker.
//
// BAND DISCIPLINE: every fault code is issued strictly pre-execve by
// construction - a completed fenced command exiting inside the band can
// ONLY mean machinery fault; 105..199 stay reserved, and in-band exits are
// classified conservatively (enforcement was active throughout - only the
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

/** THE production home of the five machinery fault codes (the sibling
 * helper suite's local replicas bind to these through parity rows). Values
 * are the vendor README table verbatim. Band discipline: codes are issued
 * only pre-execve BY CONSTRUCTION, so a completed fenced command exiting
 * in-band can ONLY mean machinery fault; 105..199 stay reserved (their
 * disambiguation exists by construction, not by luck). */
export const LANDLOCK_FAULT_CODES: Readonly<{
  malformedSpec: number;
  abiMissingOrBlocked: number;
  addRuleFailure: number;
  restrictSelfFailure: number;
  execveFailure: number;
}> = {
  malformedSpec: 100,
  abiMissingOrBlocked: 101,
  addRuleFailure: 102,
  restrictSelfFailure: 103,
  execveFailure: 104,
};

/** THE reserved fault band - the low end carries the five assigned
 * machinery codes, the rest stays reserved. */
export const LANDLOCK_FAULT_BAND: readonly [number, number] = [100, 199];

export type AssignedFaultClass =
  | "malformed-spec"
  | "abi-missing-or-blocked"
  | "add-rule-failure"
  | "restrict-self-failure"
  | "execve-failure"
  | "band-reserved";

export type FenceExitVerdict =
  | { readonly kind: "command-exit"; readonly code: number }
  | {
      readonly kind: "mechanism-fault";
      readonly code: number;
      readonly fault: AssignedFaultClass;
    };

/** THE C-exit to TS-classification BRIDGE. Total and pure over number: any
 * integral code inside the band maps to mechanism-fault with the assigned
 * class (the five named codes, or band-reserved for the unassigned 105..199
 * - the conservative reading made EXPLICIT rather than invented ad hoc);
 * anything else passes through as a command exit (kernel exit codes are
 * integral - fractional/NaN readings are spawn-domain artifacts; the
 * killed/spawn-abnormal case where the exit code is absent is the
 * spawner's domain and never reaches this classifier). Per-spawn authority
 * doctrine: no memoization, every consult is fresh. */
export function classifyFenceExit(code: number): FenceExitVerdict {
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
    default:
      return { kind: "mechanism-fault", code, fault: "band-reserved" };
  }
}

// ===========================================================================
// THE ELEVEN-LINE MECHANISM REFUSAL FAMILY
// ===========================================================================

export type StaticFaultKind =
  | "helper-unmapped-arch"
  | "helper-absent"
  | "helper-not-executable";

export type ProbeFaultKind = "probe-refused" | "probe-abnormal";

export type MechanismFault =
  | StaticFaultKind
  | ProbeFaultKind
  | AssignedFaultClass;

export interface RefusalContext {
  readonly arch?: string; // unmapped-arch form
  readonly helperPath?: string; // absent / not-executable forms
  readonly discoveredAbi?: number; // probe-refused form
  readonly pinnedAbi?: number; // probe-refused form
  readonly probeExit?: number | null; // probe-abnormal form (null = abnormal death)
  readonly probeOutput?: string; // probe-abnormal form (collapsed at render time)
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

/** THE TEN Kinds + the conservative in-band reading, rendered as the house
 * voice: one escaped em dash per line, one physical line, trailing period,
 * measured details in parentheses. Single owner of all eleven bytes. */
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
// (v) PROBE ABI-REPORT LINE PARSE
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
export function renderCommandFenceDenial(snapshot: ExecutionSnapshot): string {
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
