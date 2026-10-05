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
// refusal renderer, post-exec denial renderer, helper classify); this
// module ESTABLISHES + EXECUTES at the spawn site. It consumes the shared
// cores through the sibling only - no guard predicate is imported anywhere
// in this package edge.
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
// delegate's rejections propagate VERBATIM (kill paths carry no denial
// noise; attribution settles ONLY on resolved out-of-band exits).
//
// FAIL-CLOSED DOCTRINE: every machinery fault class maps to a typed refusal
// thrown PRE-CHILD - never an unfenced execution. The throwaway --probe
// fork is a FAST-PATH GATE and doctrine mirror, NEVER a standing permission:
// state can shift between probe and real spawn (paths, kernel, permissions),
// so the real invocation's in-band fault codes refuse IDENTICALLY at
// settlement - the soundness predicate and the interpretive authority over
// band readings sit AT THE SPAWN SITE, not with the probe verdict. Refusals
// render through the sibling's eleven-line family (sole voice owner): this
// module introduces NO new refusal or denial bytes; stream framing adds
// newlines only.
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
// anywhere in this file - the product-facing line bytes are owned by the
// sibling's renderers and consumed escaped.
// ============================================================================

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
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
import type { SessionExecutionState } from "../../session-execution-state.ts";
import {
  checkLandlockHelper,
  classifyLandlockExit,
  composeKernelWritableSet,
  PERMISSION_DENIED_MARKER,
  parseProbeReport,
  renderCommandLandlockDenial,
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
/** Mirror-tail retention cap: advisory attribution must stay O(cap) over
 * untrusted command output regardless of total volume. */
const MIRROR_TAIL_CAP_BYTES = 65_536;
/** The protocol's throwaway applicability-probe invocation (one token). */
const PROBE_ARGV: readonly ["--probe"] = ["--probe"];
/** The tool being shadowed (interpolates the cwd-error parity bytes). */
const TOOL_LABEL = "bash";

// ===========================================================================
// PROBE FORK (the fast-path gate - throwaway, no timeout, no memoization)
// ===========================================================================

interface ProbeReading {
  readonly exit: number | null;
  readonly output: string;
}

/** One throwaway spawn over --probe: stdout-only capture (the protocol's
 * single-line channel - captured in TOTAL, no truncation), honored neither
 * by timeouts nor abort signals (a wedged probe is host pathology outside
 * the fenced scope; the fail-closed posture means no unsandboxed escape).
 * Settles on normal termination OR spawned-fault alike - anomalies RESOLVE
 * (never reject) so the caller classifies them conservatively: a sync
 * spawner throw (TOCTOU drift between classify and probe - carried in this
 * fork's sole fault-handling catch) and the wait's error rejection both map
 * to the null-exit reading. */
async function runProbe(
  spawner: NonNullable<LandlockBashSeams["spawner"]>,
  carrierPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
): Promise<ProbeReading> {
  const chunks: Buffer[] = [];
  let child: ChildHandle;
  try {
    child = spawner(carrierPath, PROBE_ARGV, {
      cwd,
      detached: process.platform !== "win32",
      env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
  } catch {
    return { exit: null, output: "" };
  }
  child.stdout?.on("data", (raw: unknown) => {
    if (Buffer.isBuffer(raw)) chunks.push(raw);
  });
  const collected = (): string => Buffer.concat(chunks).toString("utf8");
  return new Promise<ProbeReading>((resolve) => {
    let settled = false;
    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      resolve({ exit: exitCode, output: collected() });
    };
    child.once("error", () => {
      finish(null);
    });
    child.once("exit", (code: unknown) => {
      finish(typeof code === "number" ? code : null);
    });
  });
}

// ===========================================================================
// MIRROR TAIL (bounded retention for post-exec attribution)
// ===========================================================================

interface MirrorTail {
  buffer: Buffer;
}

function createMirrorTail(): MirrorTail {
  return { buffer: Buffer.alloc(0) };
}

/** Copy-discipline ring: retain the last cap bytes (copy-on-truncate) so
 * marker consultation stays O(cap) regardless of total streamed volume. */
function advanceMirrorTail(tail: MirrorTail, chunk: Buffer): void {
  let combined = Buffer.concat([tail.buffer, chunk]);
  if (combined.length > MIRROR_TAIL_CAP_BYTES) {
    combined = Buffer.from(
      combined.subarray(combined.length - MIRROR_TAIL_CAP_BYTES),
    );
  }
  tail.buffer = combined;
}

function mirrorTailEndsInLf(tail: MirrorTail): boolean {
  return tail.buffer.length > 0 && tail.buffer[tail.buffer.length - 1] === 0x0a;
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
      // 3. Compose the concrete kernel writable set (pure, total).
      const writableSet = composeKernelWritableSet(snapshot);
      // 4. Throwaway --probe fork (fast-path gate; NEVER a standing
      // permission - settlement consults the band identically below).
      const probe = await runProbe(spawner, carrierPath, cwd, options.env);
      const probeLine = probe.output.endsWith("\n")
        ? probe.output.slice(0, probe.output.length - 1)
        : probe.output;
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
      // 5. Shell-config resolution (per-spawn fresh; the SAME call the
      // builtin uses - identical transport by construction). A throwing
      // resolution propagates VERBATIM.
      const shellConfig = resolveShellConfig();
      // 6. Serialized carrier invocation (single-site validation).
      const serialized = buildWrappedScript(
        carrierPath,
        writableSet,
        shellConfig,
        command,
      );
      if (serialized.kind === "invalid") {
        throw new Error(renderMechanismRefusal("malformed-spec"));
      }

      // ---- DELEGATION (the parity machinery runs UNMODIFIED) ----
      // The tap retains a bounded tail for post-exec attribution while
      // forwarding EVERY chunk verbatim to the provided data channel (same
      // Buffer reference - pristine bytes).
      const tail = createMirrorTail();
      const tappedOnData = (chunk: Buffer): void => {
        advanceMirrorTail(tail, chunk);
        options.onData(chunk);
      };
      const result = await localOps.exec(serialized.script, cwd, {
        ...options,
        onData: tappedOnData,
      });

      // ---- SETTLEMENT (post-filter over the delegated resolution) ----
      // Kill/abort/timeout rejections already propagated VERBATIM above -
      // kill paths carry NO denial noise by construction.
      if (result.exitCode === null) {
        return { exitCode: null };
      }
      const verdict = classifyLandlockExit(result.exitCode);
      if (verdict.kind === "mechanism-fault") {
        // THE UNIFORM BAND RULE: whether the carrier issued the code
        // pre-execve or a coincidental command exited in-band is OPAQUE to
        // the wrapper; the conservative reading stands - enforcement was
        // active throughout. These refusals ride the standard containment
        // channels (typed failure, one physical line).
        throw new Error(
          renderMechanismRefusal(verdict.fault, { exitCode: result.exitCode }),
        );
      }
      // Attribution matrix (fires ONLY on out-of-band NON-ZERO exits):
      // one framed payload through the SAME data channel before resolving.
      // Muted corners: masked-exit-0 stays silent; markerless non-zero
      // passes through plainly; evicted markers (deeper than the cap) are
      // an acceptable advisory false negative.
      if (
        result.exitCode !== 0 &&
        tail.buffer.includes(PERMISSION_DENIED_MARKER)
      ) {
        const lead = mirrorTailEndsInLf(tail) ? "" : "\n";
        options.onData(
          Buffer.from(`${lead}${renderCommandLandlockDenial(snapshot)}\n`),
        );
      }
      return result;
    },
  };
}

// ===========================================================================
// THE FACTORY CREATOR (identity by construction)
// ===========================================================================

/** One instantiation of the SDK's public bash factory with the fenced ops
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
