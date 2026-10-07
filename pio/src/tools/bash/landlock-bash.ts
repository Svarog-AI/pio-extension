// ============================================================================
// landlock-bash.ts : THE FENCED BASH INSTANCE OF THE COMMAND WRITE FENCE.
// One instantiation of the SDK's public bash tool factory over a custom
// operations object: the schema, streaming accumulation, truncation and
// fullOutputPath details, the status vocabulary, and the transcript
// renderers all belong to the FACTORY - identity by construction, nothing
// rebuilt here. The sole new behavioral surface is the operations' exec:
// every invocation runs its whole process tree under the vendored Landlock
// carrier, whose per-spawn ruleset composes from the live execution state's
// innermost-active allowlist. THIS MODULE IS THE SPAWN SITE of the command
// write fence.
//
// WHY BESIDE THE MATERIALIZER: tight coupling - the sibling materializer
// produces (kernel writable set, fault-code vocabulary, probe-line parse,
// refusal renderer, helper classify); this module ESTABLISHES + EXECUTES at
// the spawn site. It consumes the shared cores through the sibling only -
// no guard predicate is imported anywhere in this package edge.
//
// WRAP POSTURE: the ops adapter does NOT re-implement the builtin's process
// machinery. It runs the fail-closed fence block, serializes the carrier
// invocation into a single shell-evaluated script (the base64 payload
// round-trips the original command byte-for-byte - zero quoting dialect),
// then DELEGATES the spawn to the SDK's OWN exported local ops
// (`createLocalBashOperations` - a public root export documented for exactly
// this interception posture). Grace-idle wait, lineage kill (including the
// win32 arm), post-wait priority order, and stream hygiene are therefore
// the UNMODIFIED SDK code by delegation - zero drift surface, and the
// delegate's rejections propagate VERBATIM (kill paths carry NOTHING beyond
// their own bytes; the standing restriction note rides resolved NON-ZERO
// out-of-band exits ONLY - triggered by the exit code alone, never by
// output content).
//
// FAIL-CLOSED DOCTRINE: every machinery fault class maps to a typed refusal
// thrown PRE-CHILD - never an unfenced execution. The throwaway --probe
// fork is a FAST-PATH GATE and doctrine mirror, NEVER a standing permission:
// state can shift between probe and real spawn (paths, kernel, permissions),
// so the real invocation's in-band fault codes refuse IDENTICALLY at
// settlement - the soundness predicate and the interpretive authority over
// band readings sit AT THE SPAWN SITE, not with the probe verdict.
// PROBE-ONCE CACHING: the applicability verdict is pinned over the life of
// ONE fenced instance (same kernel for the frame, frozen process privilege
// state inherited identically by every fork, statically-linked read-only
// vendor binary, spawned children dead between commands), so the throwaway
// fork runs LAZILY once: the FIRST fenced invocation pays it at its current
// position (after the mirrored pre-checks and classify/compose); a PASSED
// verdict latches onto the instance and every later invocation skips the
// fork entirely (zero extra spawns); a FAILED verdict does NOT latch - each
// subsequent invocation retries the probe and refuses pre-child until it
// passes (no unfenced escape ever; a recovered environment self-heals on
// the next call). The UNIFORM BAND RULE over delegated out-of-band exits
// REMAINS the standing settlement authority either way: in-band 100-199
// still throws the typed refusal post-spawn, so enforcement completeness
// is unchanged by the cache - a hypothetical mid-frame machinery fault
// simply surfaces at settlement instead of pre-child. No invalidation hooks
// are owed: the proven property (kernel Landlock usable and ABI exact-
// identity) is independent of execution state; the state-dependent parts
// (paths, writable set) keep flowing through the composer per spawn.
// Refusals
// render through the sibling's twenty-four-line family (sole voice owner):
// this module introduces NO mechanism-refusal bytes of its own. Its new
// voice artifacts are the CONTENT-INDEPENDENT standing restriction note
// appended on non-zero out-of-band exits (module-local pinned constant),
// the ENGAGED-BRANCH verdict-discard note (trigger = machine-derived
// manifest knowledge - one or more off-list entries discarded; fires
// regardless of exit code; placed strictly before the standing note), and
// the settlement-fault refusal head (a commit-phase abort mid-settlement).
// Each states what was checked against the phase's writable set and names
// the CONCRETE kernel vector the spawn rode (composer output on the pure
// path; the plan kernelVector on the engaged path), rendered from the
// pre-spawn consult held by reference. No command output content
// participates in any trigger.
//
// PARITY SCOPE: behavior-preservation obligations bind ONLY the exec
// primitive's contract - error-message shapes (invalid-timeout x2, aborted,
// cwd-missing), stream/env/cwd/signal pass-through to the delegate, exit
// semantics, and the mirrored pre-check precedence (timeout -> abort -> cwd
// BEFORE the fence block, matching the builtin's relative ordering).
// Everything the factory owns acts UPSTREAM of the ops (resolved into
// command/cwd/env before exec sees them) and keeps working unchanged
// through the shadow.
//
// GLYPH DISCIPLINE: prose is ASCII-hyphen only; no raw em-dash glyph occurs
// anywhere in this file - the product-facing refusal/denial bytes belong to
// the sibling's renderers; the standing note ships pure ASCII from its own
// pinned constant.
// FRAMING SCOPE: the note's leading/trailing LFs are UNCONDITIONAL - zero
// observation over the streamed output exists anywhere in this module (no
// retention, no consult; the accepted artifacts are the stray blank line
// after cleanly-ended output and the phantom first line on zero-output
// failures).
//
// VEHICLE FACT: the TS side carries NONE of the composed-chain vehicle - it
// serializes absolute paths, forks the applicability probes, and consumes
// classified exit codes. The private user-and-mount realm's load-bearing
// constraints (establishment sequence, identity mapping policy,
// silence-law fault band) live in the vendored carrier itself - its pinned
// report-line grammar, its established fault-code table, and its source;
// nothing vehicle-shaped is re-implemented or mirrored here.
// FAIL-CLOSED DOCTRINE EXTENSION (engaged branch): every engaged-branch
// machinery fault refuses TYPED. PRE-CHILD faults (planner-refusal arms,
// scratch-area collision, scratch-mint faults, serializer corners, and the
// vehicle-establishment surfacing via the combined-probe verdict cells)
// reject BEFORE ANY SPAWN - the command NEVER runs. A POST-ESTABLISHMENT
// supervision fault (a resolved in-band exit, or a settlement/commit fault
// mid-walk) discards EVERY unsettled write and resolves as a typed refusal
// (a commit-stage fault best-forwards the admitted entries already landed
// before the fault - stated transparently below). The real-environment
// guarantee INTACT in every resolution: nothing OFF-VERDICT ever lands. The
// side-effect axis stands transparent: when the run was established, the
// command DID run; its file outcomes were simply not settled.
// WORST-CASE TAMPER ARGUMENT (scratch placement): the scratch triples sit
// beside the mirror mounts under the project-slot root, OUTSIDE every
// grant by default denial. A frame whose own declared tokens reach into the
// scratch area is refused TYPED pre-child by the collision guard; the
// settlement walk judges EVERY captured entry against the frozen frame
// regardless, so mid-run tampering with the trap can only surface ON-FRAME
// writes (which the frame admits anyway) - it cannot smuggle an off-frame
// write into the real environment.
// ============================================================================

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  rmdir,
  unlink,
} from "node:fs/promises";
import type {
  BashOperations,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  createBashToolDefinition,
  createLocalBashOperations,
  defineTool,
  getShellConfig,
} from "@earendil-works/pi-coding-agent";
import { materializeEffectiveSet } from "../../permission-mechanics.ts";
import type { SessionExecutionState } from "../../session-execution-state.ts";
import {
  checkLandlockHelper,
  classifyLandlockExit,
  composeKernelWritableSet,
  composeSpawnPlan,
  parseOverlayProbeReport,
  parseProbeReport,
  renderMechanismRefusal,
} from "./landlock-ruleset.ts";

/** The public shell-config shape (returned fresh per resolution by the
 * default seam - measured on this host class as an argv-transport form). */
type ShellConfig = ReturnType<typeof getShellConfig>;

// ===========================================================================
// STRUCTURAL SPAWN TYPES (the probe-fork observation surface)
// ===========================================================================

export interface LandlockSpawnOptions {
  readonly cwd: string;
  readonly detached: boolean;
  readonly env: NodeJS.ProcessEnv | undefined; // verbatim pass-through
  readonly stdio: ["pipe" | "ignore", "pipe", "pipe" | "ignore"];
  readonly windowsHide: boolean;
}

export interface ChildEventSource {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  once(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): unknown;
}

export interface ChildReadSide extends ChildEventSource {
  destroy(): void;
}

export interface ChildWriteSide extends ChildEventSource {
  end(data: string): void;
}

export interface ChildHandle extends ChildEventSource {
  readonly pid?: number;
  readonly stdout: ChildReadSide | null;
  readonly stderr: ChildReadSide | null;
  readonly stdin: ChildWriteSide | null;
}

export interface LandlockBashSeams {
  /** Default: node spawn. Receives the PROBE FORK ONLY (the real spawn is
   * delegated to the local ops) - distinguished by the --probe argv. */
  readonly spawner?: (
    command: string,
    args: readonly string[],
    options: LandlockSpawnOptions,
  ) => ChildHandle;
  /** Default: the public getShellConfig() (no argument). Per-spawn fresh
   * resolution inside the op. */
  readonly resolveShellConfig?: () => ShellConfig;
  /** Forwarded verbatim into checkLandlockHelper's own statMode seam
   * (single-site stat reach). */
  readonly statMode?: (p: string) => number | undefined;
  /** Default: the SDK's exported local bash ops (the parity machinery).
   * Hermetic rows inject a scripted stand-in to settle post-delegation
   * behavior without a real shell. */
  readonly localOps?: BashOperations;
  /** Per-spawn NONCE SOURCE (default: a fresh 16-hex-char random salt + "-"
   * + a per-process monotonic counter starting at 0 - unique across
   * CONCURRENT spawns; never time/cwd-derived alone). Hermetic rows pin
   * deterministic nonces through this seam. */
  readonly nonceSource?: () => string;
}

// ===========================================================================
// MIRRORED CONSTANTS (byte-parity pins over the measured dist local-ops
// shapes - comments cite the measured fact)
// ===========================================================================

/** Mirrored ceiling: the largest int32 milliseconds - above it the builtin
 * refuses with the maximum-shape message (measured dist constant). */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** The ceiling stringified over one thousand - the exact decimal token the
 * builtin's maximum-shape message interpolates (measured byte sequence).
 * Pinned as a literal so this module carries no division operator anywhere
 * (the colocated zero-slash-in-residue scan stays sound by construction). */
const MAX_TIMEOUT_SECONDS = 2147483.647;
/** THE carrier's pinned throwaway applicability-probe argv (one token). */
const PROBE_ARGV: readonly ["--probe"] = ["--probe"];
/** The tool being shadowed (interpolates the cwd-error parity bytes). */
const TOOL_LABEL = "bash";
/** THE pinned standing-restriction-note template (this module's SOLE new
 * voice artifact - content-INDEPENDENT by construction: the trigger is the
 * delegated exit CODE alone and the allowed-targets clause renders the
 * CONCRETE kernel writable set the spawn rode from the pre-spawn consult;
 * no command output content participates). One physical line, pure ASCII;
 * the listing joins the trailing period at the render site. */
const STANDING_NOTE_TEMPLATE =
  "Note: a per-phase Landlock write restriction is in effect and denied writes surface as permission errors in the command's own output. Landlock may be blocking changes to certain files due to lack of permissions in the current phase. Allowed targets: ";
/** The composer's ALWAYS-PRESENT machinery allowance (ubiquitous writes
 * under the bubble's fresh device mount) - absent from the model-facing
 * listing by design: it rides EVERY window including the depth-0 minimum,
 * so the empty remainder degrades onto the universal "none" form. */
const DEV_ALLOWANCE = "/dev";
/** The scratch-class allowance (present iff the effective scratch
 * proposition) - named model-facing like the house shape. */
const TMP_ALLOWANCE = "/tmp";
/** THE fixed scratch-area artifact name under the project-slot root (the
 * sole exempt fixed name under the word-use scan; the persistent hidden
 * PARENT survives between spawns, each spawn mints its unique <nonce>
 * child). */
const SCRATCH_AREA_NAME = ".fence-scratch";
/** The combined applicability arm's argv verb (one token; the value is the
 * per-invocation probe root appended at the fork site). */
const OVERLAY_PROBE_FLAG = "--overlay-probe";
/** THE pinned verdict-discard note head (this module's SECOND new voice
 * artifact, beside the standing note; SOLE BYTE OWNER - the suite replica
 * is the only second occurrence). Trigger = MACHINE-DERIVED (one or more
 * off-list entries discarded at settlement - fires REGARDLESS of exit
 * code; the masked-exit-0 corner is thereby covered; no output-content
 * participation - the enforcement-vs-advisory doctrine holds). One
 * physical line, pure ASCII, trailing period at the render site. The
 * listing degrades through the SAME clause renderer as the standing note
 * (lowercase universal form - the disclosure's CAPITAL-N empty form is a
 * DISTINCT surface and is NOT blurred by this one). */
const DISCARD_NOTE_TEMPLATE =
  "Note: the restricted run's writes were checked against the phase's writable set; the discarded entries never landed: ";
/** THE pinned settlement-fault head (this module's THIRD new voice
 * artifact). The engagement's COMMIT PHASE aborting on an unexpected fs
 * rejection resolves to this typed refusal (post-establishment supervision
 * fault): the already-committed admitted entries STAND (best-forward, the
 * side-effect axis stated transparently), everything unsettled does not
 * land, and the scratch area + surviving staged files are torn down
 * best-effort. ONE physical line, pure ASCII, trailing period at the
 * render site. */
const SETTLEMENT_FAULT_HEAD = "restricted-run settlement fault: ";

// ===========================================================================
// PROBE FORK (the fast-path gate - throwaway, no timeout; the PASS VERDICT
// CACHE lives on the CALLER INSTANCE, never here - see the header's
// PROBE-ONCE CACHING clause)
// ===========================================================================

interface OverlayProbeReading {
  readonly exit: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Strip EXACTLY ONE trailing LF (the caller-side terminator convention of
 * both pinned single-line report channels; an embedded LF refuses at the
 * parser instead). */
function stripOneTrailingLf(value: string): string {
  return value.endsWith("\n") ? value.slice(0, value.length - 1) : value;
}

/** ONE throwaway probe fork over a pinned argv shape (probe #1 passes the
 * --probe token with stderr UNCAPTURED - the carrier's pinned single-line
 * stdout report channel stands byte-stable; the combined arm passes its
 * verb + the per-invocation root WITH stderr CAPTURED - deliberate
 * contrast, justified by the arm's dual-channel emission). Honored neither by timeouts nor
 * abort signals (a wedged probe is host pathology outside the machinery's
 * scope; the fail-closed posture means no ungoverned escape). Settles on
 * normal termination OR spawned-fault alike - anomalies RESOLVE (never
 * reject) so the caller classifies them conservatively: a sync spawner throw and the
 * wait's error rejection both map to the null-exit reading (empty
 * capture). */
async function runProbeFork(
  spawner: NonNullable<LandlockBashSeams["spawner"]>,
  carrierPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
  argv: readonly [string, ...string[]],
  captureStderr: boolean,
): Promise<OverlayProbeReading> {
  const outChunks: Buffer[] = [];
  const errChunks: Buffer[] = [];
  let child: ChildHandle;
  const stdio: ["ignore", "pipe", "ignore" | "pipe"] = [
    "ignore",
    "pipe",
    captureStderr ? "pipe" : "ignore",
  ];
  try {
    child = spawner(carrierPath, [...argv], {
      cwd,
      detached: process.platform !== "win32",
      env,
      stdio,
      windowsHide: true,
    });
  } catch {
    return { exit: null, stdout: "", stderr: "" };
  }
  child.stdout?.on("data", (raw: unknown) => {
    if (Buffer.isBuffer(raw)) outChunks.push(raw);
  });
  child.stderr?.on("data", (raw: unknown) => {
    if (Buffer.isBuffer(raw)) errChunks.push(raw);
  });
  return new Promise<OverlayProbeReading>((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      resolve({
        exit: exitCode,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
      });
    };
    // SETTLEMENT ORDERING DOCTRINE (measured race, pinned by the
    // concurrency legs): the child's 'exit' can fire BEFORE the last
    // buffered stdout chunk is delivered over the pipe - resolving on
    // 'exit' alone therefore loses probe lines under concurrent forks
    // (empty report over a successful probe). Settlement therefore
    // drains FIRST: every captured stream must signal end-of-stream
    // ('close') before the reading settles; the exit code is recorded on
    // 'exit' and consumed at settlement. A bounded post-exit grace
    // (idempotent through the settled guard) keeps a stuck stream from
    // hanging the op forever - the conservative reading wins late.
    let exitCode: number | null = null;
    let exitSeen = false;
    const sinks: Array<ChildReadSide | undefined> = [
      child.stdout ?? undefined,
      captureStderr ? (child.stderr ?? undefined) : undefined,
    ];
    let drainedCount = 0;
    let sinkTotal = 0;
    for (const sink of sinks) {
      if (sink === undefined) continue;
      sinkTotal += 1;
      sink.on("close", () => {
        drainedCount += 1;
        if (drainedCount >= sinkTotal && exitSeen) {
          finish(exitCode);
        }
      });
      sink.on("error", () => {
        // A drained-or-broken stream still counts as finished (the
        // partial capture rides the conservative reading).
        drainedCount += 1;
        if (drainedCount >= sinkTotal && exitSeen) {
          finish(exitCode);
        }
      });
    }
    child.once("error", () => {
      finish(null);
    });
    child.once("exit", (code: unknown) => {
      exitCode = typeof code === "number" ? code : null;
      exitSeen = true;
      if (drainedCount >= sinkTotal) {
        finish(exitCode);
      } else {
        // Grace fallback: everything already dead but a stream never
        // signals - settle with whatever drained (never hang the op).
        const timer = setTimeout(() => finish(exitCode), 50);
        timer.unref?.();
      }
    });
  });
}

// ===========================================================================
// STANDING RESTRICTION NOTE (content-INDEPENDENT settlement framing)
// ===========================================================================

/** Project the CONCRETE kernel writable set onto model-facing listing
 * elements in COMPOSITION order: strictly-concrete survivors ride raw (the
 * composer already dropped wildcard-pattern entries - the listing stays
 * conservative and truthful: it names what the kernel grants); the class
 * additions name like the house shapes ("project files under <cwd>",
 * "scratch files under /tmp/"); the always-present /dev machinery allowance
 * is absent from the model-facing grant (identity classification: an entry
 * equal to a class token takes that element's naming - still a truthful
 * member of the granted set). Bare clause - stream framing (leading/trailing
 * LFs) belongs to the call site. */
function renderAllowedTargetsClause(
  writableSet: readonly string[],
  workspaceCwd: string,
): string {
  const parts: string[] = [];
  for (const entry of writableSet) {
    if (entry === DEV_ALLOWANCE) continue;
    if (entry === TMP_ALLOWANCE) {
      parts.push("scratch files under /tmp/");
      continue;
    }
    if (entry === workspaceCwd) {
      parts.push(`project files under ${entry}`);
      continue;
    }
    parts.push(entry);
  }
  return parts.length === 0 ? "none" : parts.join(", ");
}

// ===========================================================================
// WRAPPED-SCRIPT SERIALIZATION (the single validation site for the carrier
// invocation grammar - no second absoluteness dialect)
// ===========================================================================

type SerializerVerdict =
  | { readonly kind: "ready"; readonly script: string }
  | {
      readonly kind: "invalid";
      readonly reason:
        | "empty-writable-set"
        | "non-absolute-writable-entry"
        | "empty-shell"
        | "non-absolute-shell"
        | "stdin-transport";
    };

/** POSIX single-quoting escape (slash-free split/join - the house
 * zero-regex-literal charter stays intact): every embedded quote closes and
 * reopens the quoted region with an escaped quote between. */
function quotePosix(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

/** Serialize the carrier invocation into ONE shell-evaluated script:
 * `exec <carrier> --write D... -- <shell-abs> -c "<base64-decode>"`. The
 * outer shell RE-EXECS the carrier (process-group leadership persists -
 * lineage kills target the same group); the carrier spawns the inner shell
 * UNDER the restriction; the base64 payload round-trips the original
 * command byte-for-byte (zero quoting dialect - hostile metasyntax rides
 * the alphabet, not the grammar). All FOUR assembler corners map onto the
 * SAME malformed-spec refusal line (uniform-line doctrine; the defensive
 * stdin-transport corner is unreachable on shipped Linux but refuses loudly
 * rather than degrading fidelity). */
function buildWrappedScript(
  carrierPath: string,
  writableSet: readonly string[],
  shellConfig: ShellConfig,
  command: string,
): SerializerVerdict {
  if (writableSet.length === 0) {
    return { kind: "invalid", reason: "empty-writable-set" };
  }
  for (const entry of writableSet) {
    if (!entry.startsWith("/")) {
      return { kind: "invalid", reason: "non-absolute-writable-entry" };
    }
  }
  const shell = shellConfig.shell;
  if (shell === "") {
    return { kind: "invalid", reason: "empty-shell" };
  }
  if (!shell.startsWith("/")) {
    return { kind: "invalid", reason: "non-absolute-shell" };
  }
  if (shellConfig.commandTransport === "stdin") {
    return { kind: "invalid", reason: "stdin-transport" };
  }
  const payload = Buffer.from(command, "utf8").toString("base64");
  const writeArgs = writableSet
    .map((dir) => `${quotePosix("--write")} ${quotePosix(dir)}`)
    .join(" ");
  const script = `exec ${quotePosix(carrierPath)} ${writeArgs} ${quotePosix(
    "--",
  )} ${quotePosix(shell)} ${quotePosix("-c")} "$(printf '%s' ${quotePosix(payload)} | base64 -d)"`;
  return { kind: "ready", script };
}

// ===========================================================================
// ENGAGED-PATH MACHINERY (the composed-chain spawn leg - scratch geometry,
// supervisor-preamble serialization, settlement walk/verdict/commit, and
// the tolerant teardown purger. The pure path never evaluates any of this.
// ===========================================================================

/** Split a normalized absolute path into its parent dir + basename
 * (string methods only - the last separator occurrence; a direct-under-
 * root path keeps "/" as its dir). String literals carry the separator so
 * the module's zero-slash-in-residue scan stays sound by construction. */
function pathBase(p: string): readonly [string, string] {
  const i = p.lastIndexOf("/");
  if (i === 0) return ["/", p.slice(1)];
  return [p.slice(0, i), p.slice(i + 1)];
}

/** Strictly-under containment over normalized absolute paths (equality OR
 * proper subpath - the prefix test takes the separator WITH it, so sibling
 * prefixes like /a/b1 vs /a/b never false-positive). */
function isWithin(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

/** The APPLY-LAYER corner reasons (the EXISTING serializer's dialect,
 * untouched - one shared refusal line renders them all at the call site).
 */
type ApplyLayerCorner =
  | "empty-writable-set"
  | "non-absolute-writable-entry"
  | "empty-shell"
  | "non-absolute-shell"
  | "stdin-transport";

/** THE composed-script serializer VERDICT - the single-site validation
 * doctrine EXTENDED to the supervisor preamble + carrier-tail grammar
 * (uniform-line doctrine, no second absoluteness dialect): SUPERVISOR-
 * PREAMBLE corners (non-empty/absolute/not-root triple values, empty table)
 * refuse under the COMMITTED supervisor-table-malformed class (the pre-
 * child twin of the carrier's own silent 105); APPLY-LAYER corners keep
 * the EXISTING malformed-spec line untouched. Fixed cheap-first order, first
 * violation wins, TOTAL over the value domain (never throws). */
type ComposedSerializerVerdict =
  | { readonly kind: "ready"; readonly script: string }
  | {
      readonly kind: "invalid";
      readonly arm: "supervisor-table" | ApplyLayerCorner;
    };

/** Serialize the COMPOSED-CHAIN invocation into ONE shell-evaluated
 * script: `exec <carrier> [--mount L U W ...] -- <carrier> --write E... --
 * <shell> -c "$(base64-decode)"`. The supervisor preamble carries the
 * mirror triples IN MIRROR-MOUNTS ORDER (values absolute: mount = lowerdir;
 * upper/work = the session-minted scratch triple paths - the MINT STAYS
 * SESSION-SIDE, the carrier only mounts) OVER the EXISTING apply-form tail
 * (same carrier, the ENGAGED kernel vector - envelope dirs in place of the
 * leaves, leaves absent), so the composed chain is realm -> private mount
 * namespace -> mirrors -> Landlock -> shell: Landlock applies INSIDE the
 * realm over the overlaid world. The outer shell RE-EXECS the carrier
 * (process-group leadership persists across the whole fork/exec chain -
 * lineage kills target the same group). The base64 payload transport stays
 * UNCHANGED (round-trips the original command byte-for-byte - zero quoting
 * dialect). Re-validation here is DEFENSE IN DEPTH at the latest pure layer
 * (the planner already validated its inputs); no new absoluteness dialect. */
function buildComposedScript(
  carrierPath: string,
  kernelVector: readonly string[],
  mirrorMounts: readonly string[],
  scratchTriples: ReadonlyArray<readonly [string, string, string]>,
  shellConfig: ShellConfig,
  command: string,
): ComposedSerializerVerdict {
  // ---- Supervisor-preamble corners (committed 105 class) ----
  if (
    mirrorMounts.length === 0 ||
    mirrorMounts.length !== scratchTriples.length
  ) {
    return { kind: "invalid", arm: "supervisor-table" };
  }
  for (let index = 0; index < mirrorMounts.length; index += 1) {
    const triple = scratchTriples[index];
    const values: readonly string[] = [
      mirrorMounts[index],
      triple[0],
      triple[1],
    ];
    for (const value of values) {
      if (value === "" || value[0] !== "/" || value === "/") {
        return { kind: "invalid", arm: "supervisor-table" };
      }
    }
  }
  // ---- Apply-layer corners (existing dialect, existing line) ----
  if (kernelVector.length === 0) {
    return { kind: "invalid", arm: "empty-writable-set" };
  }
  for (const entry of kernelVector) {
    if (!entry.startsWith("/")) {
      return { kind: "invalid", arm: "non-absolute-writable-entry" };
    }
  }
  const shell = shellConfig.shell;
  if (shell === "") {
    return { kind: "invalid", arm: "empty-shell" };
  }
  if (!shell.startsWith("/")) {
    return { kind: "invalid", arm: "non-absolute-shell" };
  }
  if (shellConfig.commandTransport === "stdin") {
    return { kind: "invalid", arm: "stdin-transport" };
  }
  // ---- Serialization (byte form pinned by the suite goldens) ----
  const payload = Buffer.from(command, "utf8").toString("base64");
  const mountArgs = mirrorMounts
    .map((_mirror, index) => {
      const triple = scratchTriples[index];
      return `${quotePosix("--mount")} ${quotePosix(triple[0])} ${quotePosix(
        triple[1],
      )} ${quotePosix(triple[2])}`;
    })
    .join(" ");
  const writeArgs = kernelVector
    .map((entry) => `${quotePosix("--write")} ${quotePosix(entry)}`)
    .join(" ");
  const script = `exec ${quotePosix(carrierPath)} ${mountArgs} ${quotePosix("--")} ${quotePosix(carrierPath)} ${writeArgs} ${quotePosix("--")} ${quotePosix(shell)} ${quotePosix("-c")} "$(printf '%s' ${quotePosix(payload)} | base64 -d)"`;
  return { kind: "ready", script };
}

// ===========================================================================
// SETTLEMENT MACHINERY (manifest walk -> verdict -> selective commit; the
// frozen-frame record is judged per entry over the surviving declarations
// - files-only - and the tolerant teardown purger rides every outcome)
// ===========================================================================

/** One manifest entry read conservatively from an upper tree (the upper
 * started EMPTY - every present entry IS a modification). `target` = the
 * REAL environment path (mirror mount prefix + relative upper path,
 * separator-normalized); `upperPath` = the CoW location walked at
 * settlement. */
interface WalkEntry {
  readonly target: string;
  readonly upperPath: string;
  readonly kind: "file" | "dir" | "whiteout" | "undecidable";
}

/** Recursive DFS over ONE upper tree, children TOP-DOWN in lexicographically
 * sorted entry-name order (deterministic, golden-stable). Entry kinds read
 * via async lstat CONSERVATIVELY: any stat fault on an entry treats it as
 * undecidable DISCARD + noted (never crash, never commit); WHITEOUT =
 * character-device entry with rdev major=0 AND minor=0 (encoded form:
 * rdev === 0); every other kind
 * (symlink, fifo, socket, non-whiteout device) is undecidable-by-default
 * discard material. A READ FAULT enumerating the upper ROOT itself escapes
 * the caller (the manifest is impossible - a post-establishment supervision
 * fault, not a per-entry reading). Never commits anything itself. */
/** Recursively enumerate ONE upper tree into the manifest sink (deterministic
 * top-down sorted DFS): children are listed BEFORE descent and recorded AFTER
 * their parent (top-down order preserved); the RELATIVE PATH accumulates per
 * level so every entry's REAL target is separator-normalized to the FULL
 * depth under its mirror mount (a nested leaf under a created subdirectory
 * targets `<mount>/sub/leaf`, never the mount root). Root-level enumeration
 * fault ESCAPES (manifest-impossible settlement fault downstream); per-entry
 * and per-subtree faults degrade conservatively (undecidable / trapped -
 * never crash, never commit). */
async function walkUpperTree(
  upperRoot: string,
  mount: string,
  sink: WalkEntry[],
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(upperRoot);
  } catch (fault) {
    throw new Error(
      `manifest enumeration failed for ${upperRoot}: ${faultErrorReason(fault)}`,
    );
  }
  names.sort();
  for (const name of names) {
    await collectWalkEntry(upperRoot, mount, name, sink);
  }
}

/** Collect ONE entry at full RELATIVE depth `rel` beneath the mirror mount:
 * `upperPath = <upperDir>/<rel>` (CoW location walked now),
 * `target = <mount>/<rel>` (real-environment path judged and committed).
 * Conservative kind readings via lstat: whiteout = char-device rdev===0;
 * dir = descend AFTER recording; file = materializable; anything else (or an
 * unreadable entry) = undecidable (discard + note - the fail-closed
 * direction). Sub-directories that cannot be LISTED keep their descendants
 * trapped (they still surface as the dir entry, which commits or discards
 * on its own judgment - no crash, nothing lost silently). */
async function collectWalkEntry(
  upperRoot: string,
  mount: string,
  rel: string,
  sink: WalkEntry[],
): Promise<void> {
  // BOTH locations derive from the SAME accumulated relative path: the CoW
  // site sits under the immutable upper root, the real target under its
  // mirror mount (depth parity by construction at every level).
  const upperPath = `${upperRoot}/${rel}`;
  const target = `${mount}/${rel}`;
  let info: Awaited<ReturnType<typeof lstat>> | undefined;
  try {
    info = await lstat(upperPath);
  } catch {
    sink.push({ target, upperPath, kind: "undecidable" });
    return;
  }
  if (info.isCharacterDevice() && info.rdev === 0) {
    sink.push({ target, upperPath, kind: "whiteout" });
    return;
  }
  if (info.isDirectory()) {
    sink.push({ target, upperPath, kind: "dir" });
    // Descend AFTER the parent is recorded (top-down order preserved).
    let children: string[];
    try {
      children = await readdir(upperPath);
    } catch {
      return; // sub-tree unreadable: entries below stay trapped (safe)
    }
    children.sort();
    for (const child of children) {
      await collectWalkEntry(upperRoot, mount, `${rel}/${child}`, sink);
    }
    return;
  }
  if (info.isFile()) {
    sink.push({ target, upperPath, kind: "file" });
    return;
  }
  sink.push({ target, upperPath, kind: "undecidable" });
}

/** Collapse a thrown fault onto its message text (cast-free structural
 * narrowing via the discriminant chain - unknown faults without a readable
 * message degrade to their String form). */
function faultErrorReason(fault: unknown): string {
  if (typeof fault === "string") return fault;
  if (
    typeof fault === "object" &&
    fault !== null &&
    "message" in fault &&
    typeof fault.message === "string"
  ) {
    return fault.message;
  }
  return String(fault);
}

/** THE SETTLEMENT COMMIT PHASE over one walked manifest (engaged branch,
 * out-of-band resolved exits ONLY): every entry judged AGAINST THE FULL
 * FRAME by the caller-supplied verdict predicate (frozen-frame record -
 * the surviving declarations under the files-only invariant; class
 * propositions verbatim the gate's prefix forms). Deterministic walk order = top-down sorted DFS per upper in mirror order.
 * Materialized kinds v1 (conservative policy): REGULAR FILES stage BESIDE
 * THE TARGET (same directory => same filesystem by construction; the
 * staging basename EMBEDS THE PER-SPAWN NONCE so two walks committing the
 * same declared leaf race over DISTINCT staging files into one final path
 * via atomic rename - benign last-writer-wins parity with plain racing
 * shells) then atomic rename; DIRECTORIES ensure the real path exists with
 * a SINGLE-LEVEL mkdir ONLY IF ABSENT (the mount point itself can never be
 * absent - the lower existed by the attach precondition; newly created SUB-
 * directories can; parents are ensured BEFORE their children by the walk
 * order); WHITEOUTS unlink the admitted real path with ENOENT-TOLERANT
 * verification (absence IS the committed state - idempotent whiteout
 * commit: a concurrent frame deleting the same declared leaf first is
 * SUCCESS, never a spurious refusal). EVERY OTHER KIND discards + notes
 * (undecidable means NEVER commit - the fail-closed direction). Renames are
 * NOT special-cased (per-entry judgment composes mechanically: both
 * endpoints admitted => commits as a move; rename-away of a declared leaf
 * => the whiteout commits, the off-list new name discards). ANY unexpected
 * fs rejection mid-commit throws a typed settlement fault AFTER recording
 * the discarded list up to that point - already-committed admitted entries
 * STAND (best-forward; the side-effect axis is stated transparently at the
 * voice site). Every staged path lands on the op-local tracker for the
 * finally-walk's best-effort cleanup. */
async function commitAdmittedEntries(
  entries: readonly WalkEntry[],
  nonce: string,
  admit: (target: string) => boolean,
  stagedTracker: string[],
): Promise<string[]> {
  const discarded: string[] = [];
  for (const entry of entries) {
    if (!admit(entry.target)) {
      discarded.push(entry.target);
      continue;
    }
    if (entry.kind === "file") {
      const [dir, base] = pathBase(entry.target);
      const stagingPath = `${dir}/.${base}.${nonce}`;
      await copyFile(entry.upperPath, stagingPath);
      // Track BEFORE the rename: a fault between landing and renaming
      // still leaves the staged file tracked for the finally-walk's
      // best-effort cleanup (no residue on any outcome).
      stagedTracker.push(stagingPath);
      try {
        await rename(stagingPath, entry.target);
      } catch (fault) {
        throw new Error(
          `settlement commit aborted while landing ${entry.target}: ${faultErrorReason(fault)}`,
        );
      }
    } else if (entry.kind === "dir") {
      let dirMissing: boolean;
      try {
        await mkdir(entry.target);
        dirMissing = false;
      } catch (fault) {
        dirMissing = true;
        if (
          typeof fault === "object" &&
          fault !== null &&
          "code" in fault &&
          fault.code === "EEXIST"
        ) {
          dirMissing = false; // present already - single-level mkdir iff absent
        } else {
          throw new Error(
            `settlement commit aborted while ensuring ${entry.target}: ${faultErrorReason(fault)}`,
          );
        }
      }
      if (dirMissing) {
        let info: Awaited<ReturnType<typeof lstat>> | undefined;
        try {
          info = await lstat(entry.target);
        } catch {
          info = undefined;
        }
        if (info === undefined || !info.isDirectory()) {
          throw new Error(
            `settlement commit aborted: ${entry.target} is not a settled directory`,
          );
        }
      }
    } else if (entry.kind === "whiteout") {
      try {
        await unlink(entry.target);
      } catch {
        // ENOENT-tolerant: absence IS the committed state (idempotent
        // whiteout commit) - verify the end state instead of trusting the
        // errno class.
        let info: Awaited<ReturnType<typeof lstat>> | undefined;
        try {
          info = await lstat(entry.target);
        } catch {
          info = undefined;
        }
        if (info !== undefined) {
          throw new Error(
            `settlement commit aborted: whiteout of ${entry.target} left the real path present`,
          );
        }
      }
    } else {
      discarded.push(entry.target); // undecidable - discard + note
    }
  }
  return discarded;
}

// ===========================================================================
// TEARDOWN / FINALLY (ALL outcomes: tolerant, best-effort, always LAST -
// residue can never mask a row outcome because assertions precede teardown)
// ===========================================================================

/** Best-effort recursive removal TOLERANT to the kernel-managed mode-000
 * workdir metadata dir (measured physics: a dying realm without umount
 * leaves a mode-000 `work` subdir inside the caller's workdir, owned by the
 * session uid, EMPTY after a nominal run - naive readdir-descent faults
 * EACCES listing it although the owner CAN rmdir it directly). Purger
 * recipe: chmod-owner-visible + retry + rmdir-each-level, swallow-all (a
 * genuinely unreadable leaf is left behind - tolerated hygiene doctrine).
 */
async function purgeDirEntriesTolerant(dir: string): Promise<void> {
  let names: string[] = [];
  let listed: boolean;
  try {
    names = await readdir(dir);
    listed = true;
  } catch {
    listed = false;
  }
  if (!listed) {
    try {
      await chmod(dir, 0o700);
      names = await readdir(dir);
    } catch {
      return; // genuinely unreadable: leave the leaf, best-effort
    }
  }
  for (const name of names) {
    const childPath = `${dir}/${name}`;
    let info: Awaited<ReturnType<typeof lstat>> | undefined;
    try {
      info = await lstat(childPath);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      await purgeDirEntriesTolerant(childPath);
      try {
        await rmdir(childPath);
      } catch {
        try {
          await chmod(childPath, 0o700);
          await rmdir(childPath);
        } catch {
          // best-effort teardown - swallowed by doctrine
        }
      }
    } else {
      try {
        await rm(childPath);
      } catch {
        // swallow-all teardown (see above)
      }
    }
  }
}

/** Remove the ENTIRE per-spawn scratch root AND best-effort-unlink any
 * tracked surviving staged files (staged files live BESIDE targets in the
 * REAL environment, NOT under the scratch root - the teardown must cover
 * them explicitly). Swallow-all; the persistent hidden PARENT survives
 * (idempotent re-creation per spawn). */
async function purgeScratchArea(
  scratchRoot: string,
  staged: string[],
): Promise<void> {
  await purgeDirEntriesTolerant(scratchRoot);
  try {
    await rmdir(scratchRoot);
  } catch {
    try {
      await chmod(scratchRoot, 0o700);
      await rmdir(scratchRoot);
    } catch {
      // swallow-all (mode-000 metadata corner, see above)
    }
  }
  for (const stagedPath of staged) {
    try {
      await unlink(stagedPath);
    } catch {
      // renamed-into-place or already gone - both fine
    }
  }
}

// ===========================================================================
// THE OPS PRIMITIVE
// ===========================================================================

/** Default spawner: forwards the seam-shaped invocation onto node spawn
 * (explicit rebuild keeps the structural options assignable without casts).
 * Receives the PROBE FORK ONLY in production wiring. */
function defaultSpawner(
  command: string,
  args: readonly string[],
  options: LandlockSpawnOptions,
): ChildHandle {
  const stdio: ["pipe" | "ignore", "pipe", "pipe" | "ignore"] = [
    options.stdio[0],
    options.stdio[1],
    options.stdio[2],
  ];
  return spawn(command, [...args], {
    cwd: options.cwd,
    detached: options.detached,
    env: options.env,
    stdio,
    windowsHide: options.windowsHide,
  });
}

export function createLandlockBashOperations(
  _cwd: string,
  executionState: SessionExecutionState,
  seams?: LandlockBashSeams,
): BashOperations {
  // The construction cwd is the factory-side identity (captured by
  // createBashToolDefinition); the op mirrors the exec's cwd parameter
  // verbatim everywhere it consults a path.
  const spawner = seams?.spawner ?? defaultSpawner;
  const resolveShellConfig =
    seams?.resolveShellConfig ?? (() => getShellConfig());
  const localOps = seams?.localOps ?? createLocalBashOperations();
  // PROBE-ONCE CACHE STATE (closure-scoped deliberately - per-instance keeps
  // ZERO cross-session shared mutable state): latches ONLY after a passed
  // verdict; failed verdicts leave it false so every subsequent invocation
  // retries the probe pre-child (see the header's PROBE-ONCE CACHING clause).
  let probePassed = false;
  // SECOND per-instance closure latch over the combined applicability arm
  // (PROBE-ONCE analog: an ok verdict LATCHES; a FAILED verdict NEVER
  // latches and retries per invocation - the self-healing doctrine carries;
  // neither probe is a standing permission).
  let overlayProbePassed = false;
  // Per-process monotonic NONCE counter (starts at 0; the fresh random salt
  // does cross-instance uniqueness, the counter the in-process ordering -
  // unique across CONCURRENT spawns; never time/cwd-derived alone).
  let nonceCounter = 0;
  const mintNonce =
    seams?.nonceSource ??
    (() => {
      const salt = randomBytes(8).toString("hex");
      const sequence = nonceCounter;
      nonceCounter += 1;
      return `${salt}-${sequence}`;
    });

  /** Applicability proof #1 (PROBE-ONCE - lazy, cached per instance): the
   * FIRST invocation runs the throwaway --probe fork at its current
   * position; a PASSED verdict latches onto the instance and every later
   * invocation skips the fork entirely (zero extra spawns). A FAILED
   * verdict does NOT latch - the next invocation retries pre-child; NEVER a
   * standing permission (settlement consults the band identically below).
   * The composed chain STILL gates on this probe: Landlock applies INSIDE
   * the realm, so the first leg's applicability is load-bearing for BOTH
   * branches. */
  const ensureLandlockProbe = async (
    carrierPath: string,
    cwd: string,
    env: NodeJS.ProcessEnv | undefined,
  ): Promise<void> => {
    if (probePassed) return;
    const probe = await runProbeFork(
      spawner,
      carrierPath,
      cwd,
      env,
      PROBE_ARGV,
      false,
    );
    const probeLine = stripOneTrailingLf(probe.stdout);
    const report = parseProbeReport(probeLine);
    if (!(report !== null && probe.exit === 0 && report.status === "ok")) {
      if (report !== null && report.status === "fail" && probe.exit === 101) {
        throw new Error(
          renderMechanismRefusal("probe-refused", {
            discoveredAbi: report.abi,
            pinnedAbi: report.pin,
          }),
        );
      }
      throw new Error(
        renderMechanismRefusal("probe-abnormal", {
          probeExit: probe.exit,
          probeOutput: probeLine,
        }),
      );
    }
    probePassed = true;
  };

  return {
    async exec(command, cwd, options) {
      // ---- Pre-checks (mirrored byte-parity; precedence preserved) ----
      const timeout = options.timeout;
      if (
        timeout !== undefined &&
        (!Number.isFinite(timeout) || timeout <= 0)
      ) {
        throw new Error("Invalid timeout: must be a finite number of seconds");
      }
      if (timeout !== undefined && timeout * 1000 > MAX_TIMEOUT_MS) {
        throw new Error(
          `Invalid timeout: maximum is ${MAX_TIMEOUT_SECONDS} seconds`,
        );
      }
      // Pre-abort (byte-parity) BEFORE any other work - fence included.
      if (options.signal?.aborted) {
        throw new Error("aborted");
      }
      // Cwd F_OK (byte-parity) - the cheap fs consult precedes the costly
      // fork, so parity bytes win early exactly as the builtin orders them.
      try {
        await access(cwd, constants.F_OK);
      } catch {
        throw new Error(
          `Working directory does not exist: ${cwd}\nCannot execute ${TOOL_LABEL} commands.`,
        );
      }

      // ---- FENCE BLOCK (all refusals pre-child; ZERO delegate consults) ----
      // 1. Fresh snapshot, held BY REFERENCE over the shared state record
      // (late binding survives span/phase churn; channel faults escape
      // VERBATIM - the state module's first-fault-escapes doctrine).
      const snapshot = executionState.snapshot();
      // 2. Static classify (synchronous, per-spawn fresh - no memoization).
      const check = checkLandlockHelper(
        seams?.statMode !== undefined
          ? { statMode: seams.statMode }
          : undefined,
      );
      if (!check.ok) {
        const ctx =
          check.reason === "helper-unmapped-arch"
            ? { arch: check.arch }
            : { helperPath: check.path };
        throw new Error(renderMechanismRefusal(check.reason, ctx));
      }
      const carrierPath = check.path;
      // 3. SPAWN PLAN (pure, total) - THE branch selection. Planner REFUSAL
      // arms refuse TYPED pre-child BEFORE any scratch mint or spawn
      // (cheapest-first, zero state change - defense in depth beside the
      // carrier's own root-component rejection + the kernel overlap
      // refusals).
      const plan = composeSpawnPlan(snapshot);
      if (plan.kind === "nested-mirror") {
        throw new Error(
          renderMechanismRefusal("nested-mirror", {
            mirrorInner: plan.inner,
            mirrorOuter: plan.outer,
          }),
        );
      }
      if (plan.kind === "root-mount") {
        throw new Error(renderMechanismRefusal("root-mount"));
      }

      // ================= PURE PATH (plan not engaged) =================
      // TODAY'S SEQUENCE EXACTLY - zero perturbation (the common case:
      // silent windows, class-only frames, coverage-filtered or
      // pattern-only declarations):
      // compose via the retained composer (byte-identical at this call
      // site; element-for-element equal to plan.kernelVector by
      // construction over non-engaged windows - pinned in the suite),
      // probe #1, apply-form serialization, delegation, band settlement,
      // standing note.
      if (!plan.engaged) {
        const writableSet = composeKernelWritableSet(snapshot);
        await ensureLandlockProbe(carrierPath, cwd, options.env);
        // Shell-config resolution (per-spawn fresh; the SAME call the
        // builtin uses - identical transport by construction). A throwing
        // resolution propagates VERBATIM.
        const shellConfig = resolveShellConfig();
        const serialized = buildWrappedScript(
          carrierPath,
          writableSet,
          shellConfig,
          command,
        );
        if (serialized.kind === "invalid") {
          throw new Error(renderMechanismRefusal("malformed-spec"));
        }
        const result = await localOps.exec(serialized.script, cwd, options);
        if (result.exitCode === null) {
          return { exitCode: null };
        }
        const verdict = classifyLandlockExit(result.exitCode);
        if (verdict.kind === "mechanism-fault") {
          // THE UNIFORM BAND RULE: whether the carrier issued the code
          // pre-execve or a coincidental command exited in-band is OPAQUE
          // to the wrapper; the conservative reading stands - enforcement
          // was active throughout. These refusals ride the standard
          // containment channels (typed failure, one physical line).
          throw new Error(
            renderMechanismRefusal(verdict.fault, {
              exitCode: result.exitCode,
            }),
          );
        }
        // Standing restriction note (CONTENT-INDEPENDENT): the trigger is
        // the exit CODE alone (a kernel fact) - no output-content consult
        // anywhere. ONE framed append through the SAME data channel,
        // strictly AFTER all raw chunks: leading LF ALWAYS, trailing LF
        // always. The clause renders the CONCRETE kernel set THIS spawn
        // rode (the pre-spawn consult - late binding survives span/phase
        // churn by construction).
        if (result.exitCode !== 0) {
          options.onData(
            Buffer.from(
              `\n${STANDING_NOTE_TEMPLATE}${renderAllowedTargetsClause(writableSet, snapshot.paths.workspaceCwd)}.\n`,
            ),
          );
        }
        return result;
      }

      // ================= ENGAGED PATH (mirror mechanic live) ============
      // (a) SCRATCH MINT - the session process (UNRESTRICTED by the ratchet
      // doctrine) mints under <projectSlotRoot>/.fence-scratch/<nonce>/:
      // the persistent hidden PARENT idempotently (parallel mints race
      // safely), then ONE subdirectory PER MIRROR MOUNT named by its decimal
      // INDEX holding EMPTY upper/ + work/ (created before the probes - the
      // probe root needs an existing directory). OUTSIDE every grant by
      // default denial (worst-case tamper argument: header).
      const slotRoot = snapshot.paths.projectSlotRoot;
      const scratchArea = `${slotRoot}/${SCRATCH_AREA_NAME}`;
      const nonce = mintNonce();
      const scratchRoot = `${scratchArea}/${nonce}`;
      // COLLISION GUARD (PURE, cheapest-first - NO state change precedes
      // it): the scratch area must not intersect ANY planned mirror mount
      // in EITHER direction (defense-in-depth twin of the kernel overlap
      // refusal - prefix tests over normalized absolute paths).
      for (const mount of plan.mirrorMounts) {
        if (isWithin(scratchRoot, mount) || isWithin(mount, scratchRoot)) {
          throw new Error(
            renderMechanismRefusal("scratch-area-collision", {
              scratchCollisionDetail: `${scratchRoot} intersects ${mount}`,
            }),
          );
        }
      }
      // The session-minted ABSOLUTE triples (mount = lowerdir; upper/work =
      // the scratch geometry) - THE MINT STAYS SESSION-SIDE, the carrier
      // only mounts them.
      const triples: Array<[string, string, string]> = [];
      for (let index = 0; index < plan.mirrorMounts.length; index += 1) {
        const base = `${scratchRoot}/${index}`;
        triples.push([
          plan.mirrorMounts[index],
          `${base}/upper`,
          `${base}/work`,
        ]);
      }
      try {
        await mkdir(scratchArea, { recursive: true });
      } catch {
        // Idempotent PARENT creation - a genuine fault surfaces loudly at
        // the nonce mint below (never a silent skip).
      }
      let mintOk = false;
      try {
        await mkdir(scratchRoot, { recursive: false });
        for (const triple of triples) {
          await mkdir(triple[1], { recursive: true });
          await mkdir(triple[2], { recursive: true });
        }
        mintOk = true;
      } catch {
        mintOk = false;
      }
      if (!mintOk) {
        throw new Error(
          renderMechanismRefusal("scratch-mint-failure", { scratchRoot }),
        );
      }
      // (b)-(f) POST-MINT WORK: the engagement wraps everything in
      // try/finally - assertions/settlement PRECEDE teardown so residue
      // can never mask a row outcome; the tolerant purger runs LAST on
      // EVERY outcome (kill/abort/timeout rejects propagate VERBATIM while
      // the discard-all teardown completes beneath them).
      const staged: string[] = [];
      try {
        // APPLICABILITY: probe #1 FIRST (as shipped - the composed chain
        // applies Landlock INSIDE the realm), then the COMBINED probe #2
        // under the second per-instance closure latch: the fork rides the
        // per-invocation nonce root (cleaned by the same finally-walk),
        // captures BOTH streams, strips exactly one trailing LF from
        // stdout, parses TOTAL; PASS iff parsed ok-cell AND exit 0
        // (latches). (status=fail, realm=fail) => refused; ANYTHING ELSE
        // (null parse, exit/status mismatch, null exit, sync spawner throw,
        // child error event) => abnormal. Refusals PRE-CHILD, zero
        // delegate consults.
        await ensureLandlockProbe(carrierPath, cwd, options.env);
        if (!overlayProbePassed) {
          const combined = await runProbeFork(
            spawner,
            carrierPath,
            cwd,
            options.env,
            [OVERLAY_PROBE_FLAG, scratchRoot],
            true,
          );
          const reportLine = stripOneTrailingLf(combined.stdout);
          const report = parseOverlayProbeReport(reportLine);
          if (
            report !== null &&
            report.realm === "ok" &&
            report.status === "ok" &&
            combined.exit === 0
          ) {
            overlayProbePassed = true;
          } else if (
            report !== null &&
            report.realm === "fail" &&
            report.status === "fail"
          ) {
            throw new Error(
              renderMechanismRefusal("overlay-probe-refused", {
                combinedRealm: report.realm,
                combinedStatus: report.status,
                combinedStage: combined.stderr,
              }),
            );
          } else {
            throw new Error(
              renderMechanismRefusal("overlay-probe-abnormal", {
                combinedProbeExit: combined.exit,
                combinedProbeOutput: reportLine,
              }),
            );
          }
        }
        // SERIALIZATION (single-site validation EXTENDED to the supervisor
        // preamble + carrier-tail grammar; uniform-line doctrine, no second
        // absoluteness dialect).
        const shellConfig = resolveShellConfig();
        const composed = buildComposedScript(
          carrierPath,
          plan.kernelVector,
          plan.mirrorMounts,
          triples,
          shellConfig,
          command,
        );
        if (composed.kind === "invalid") {
          throw new Error(
            composed.arm === "supervisor-table"
              ? renderMechanismRefusal("supervisor-table-malformed")
              : renderMechanismRefusal("malformed-spec"),
          );
        }
        // DELEGATION (UNCHANGED seam; the options bag passes
        // UNTRANSFORMED; the group-kill lineage now spans the full
        // fork/exec chain by the committed pgid doctrine - no new kill
        // plumbing anywhere).
        const outcome = await (async (): Promise<
          | {
              readonly kind: "resolved";
              readonly value: { readonly exitCode: number | null };
            }
          | { readonly kind: "fault"; readonly error: unknown }
        > => {
          try {
            return {
              kind: "resolved",
              value: await localOps.exec(composed.script, cwd, options),
            };
          } catch (error) {
            return { kind: "fault", error };
          }
        })();
        if (outcome.kind === "fault") {
          // Kill/abort/timeout rejects propagate VERBATIM (contract bytes
          // untouched) AND drive DISCARD-ALL teardown (the finally-walk);
          // NOTHING commits and NO verdict line rides (content-
          // independence extends to the new channel).
          throw outcome.error;
        }
        const delegated = outcome.value;
        // SETTLEMENT over resolved exits: exitCode null => discard-all,
        // no verdict line, no notes.
        if (delegated.exitCode === null) {
          return { exitCode: null };
        }
        const verdict = classifyLandlockExit(delegated.exitCode);
        if (verdict.kind === "mechanism-fault") {
          // THE UNIFORM BAND RULE over the EXTENDED vocabulary (in-band
          // 100-199 - now incl. every committed 105-111 class and the
          // narrowed 112-199 band-reserved): discard-all teardown THEN the
          // typed refusal (the finally-walk completes before the rejection
          // reaches the caller); the conservative reading is UNCHANGED
          // under the full chain's exit transparency.
          throw new Error(
            renderMechanismRefusal(verdict.fault, {
              exitCode: delegated.exitCode,
            }),
          );
        }
        // Out-of-band resolved exit: MANIFEST WALK -> VERDICT -> SELECTIVE
        // COMMIT over the CAPTURED pre-spawn snapshot record (frozen-frame
        // invariant - the SAME object taken at pre-spawn plan computation
        // feeds the judgment; the settle path RE-READS NOTHING from disk or state).
        if (snapshot.phase === null) {
          // Unreachable by contract (an engaged plan proves a live frame):
          // a frameless settled exit cannot be judged against any writable
          // set, so fail CLOSED - discard-all teardown (the finally-walk)
          // plus a typed settlement-fault refusal.
          throw new Error(
            `${SETTLEMENT_FAULT_HEAD}the settled exit carried no consultable permission frame. The run's writes were checked against the phase's writable set; nothing committed; everything else did not land.`,
          );
        }
        const effective = materializeEffectiveSet(
          snapshot.phase,
          snapshot.sources,
          snapshot.paths,
        );
        const workspaceCwd = snapshot.paths.workspaceCwd;
        // THE VERDICT predicate (FILES-ONLY ADMISSION): identity or
        // subtree-prefix over the surviving declarations - every surviving
        // declaration is a file token (the subtree form beneath a leaf is
        // vacuously safe: the kernel refuses paths beneath a regular file
        // at attempt time) - plus the gate's standing class prefix forms
        // VERBATIM over the one fresh effective-set consult above.
        const isAdmitted = (target: string): boolean => {
          for (const survivor of effective.survivors) {
            if (target === survivor || target.startsWith(`${survivor}/`)) {
              return true;
            }
          }
          if (
            effective.projectWritesActive &&
            target.startsWith(`${workspaceCwd}/`)
          ) {
            return true;
          }
          if (effective.scratchActive && target.startsWith("/tmp/")) {
            return true;
          }
          return false;
        };
        let discarded: string[];
        try {
          const manifest: WalkEntry[] = [];
          for (const triple of triples) {
            await walkUpperTree(triple[1], triple[0], manifest);
          }
          discarded = await commitAdmittedEntries(
            manifest,
            nonce,
            isAdmitted,
            staged,
          );
        } catch (fault) {
          // Commit-stage / manifest-impossible fault: discard-all + typed
          // refusal (post-establishment supervision fault; already-
          // committed admitted entries STAND - best-forward, the side-
          // effect axis stated transparently).
          throw new Error(
            `${SETTLEMENT_FAULT_HEAD}${faultErrorReason(fault)}. The run's writes were checked against the phase's writable set; admitted entries committed before the fault stand; everything else did not land.`,
          );
        }
        // VOICE (PINNED ORDER over the data channel): raw chunks ->
        // verdict-discard note (iff discards - MACHINE-DERIVED, fires
        // REGARDLESS of exit code) -> standing note (iff non-zero exit;
        // trigger/template/bytes UNTOUCHED; the listing renders the
        // RIDDEN vector - kernelVector engaged: envelope dirs present as
        // raw elements, file leaves ABSENT - they were never kernel-
        // granted). A clean all-committed exit-0 appends NOTHING
        // (transcript clean).
        if (discarded.length > 0) {
          options.onData(
            Buffer.from(
              `\n${DISCARD_NOTE_TEMPLATE}${discarded.join(", ")}. Allowed targets: ${renderAllowedTargetsClause(plan.kernelVector, workspaceCwd)}.\n`,
            ),
          );
        }
        if (delegated.exitCode !== 0) {
          options.onData(
            Buffer.from(
              `\n${STANDING_NOTE_TEMPLATE}${renderAllowedTargetsClause(plan.kernelVector, workspaceCwd)}.\n`,
            ),
          );
        }
        return delegated;
      } finally {
        await purgeScratchArea(scratchRoot, staged);
      }
    },
  };
}

// ===========================================================================
// THE FACTORY CREATOR (identity by construction)
// ===========================================================================

/** One instantiation of the SDK's public bash factory with the
 * restriction-carried ops
 * threaded through its operations slot. The concrete factory return is
 * wrapped via the SDK's inference-preserving `defineTool` seam so the
 * instance is assignable to bare `ToolDefinition` / `ToolDefinition[]`
 * consumption sites (strict-function variance on the transcript-renderer
 * properties) while preserving the concrete generics downstream. */
export function createLandlockBash(
  cwd: string,
  executionState: SessionExecutionState,
  seams?: LandlockBashSeams,
): ToolDefinition {
  return defineTool(
    createBashToolDefinition(cwd, {
      operations: createLandlockBashOperations(cwd, executionState, seams),
    }),
  );
}
