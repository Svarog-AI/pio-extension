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
// produces (kernel writable set, argv assembly, fault-code vocabulary,
// probe-line parse, refusal renderer, post-exec denial renderer, helper
// classify); this module ESTABLISHES + EXECUTES at the spawn site. It
// consumes the two shared top-level cores through the sibling only - no
// guard predicate is imported anywhere in this package edge.
//
// FAIL-CLOSED DOCTRINE: every machinery fault class maps to a typed refusal
// thrown PRE-CHILD - never an unfenced execution. The throwaway --probe
// fork is a FAST-PATH GATE and doctrine mirror, NEVER a standing permission:
// state can shift between probe and spawn (paths, kernel, permissions), so
// the real spawn's in-band fault codes refuse IDENTICALLY at settlement -
// the soundness predicate and the interpretive authority over band readings
// sit AT THE SPAWN SITE, not with the probe verdict. Refusals render through
// the sibling's eleven-line family (sole voice owner): this module
// introduces NO new refusal or denial bytes; stream framing adds newlines
// only.
//
// PARITY SCOPE: behavior-preservation obligations bind ONLY the exec
// primitive's contract - error-message shapes (invalid-timeout x2, aborted,
// cwd-missing, timeout:<original-secs>), stream/env/cwd pass-through, exit
// semantics. Everything the factory owns acts UPSTREAM of the ops (resolved
// into command/cwd/env before exec sees them) and keeps working unchanged
// through the shadow.
//
// MIRROR LINEAGE: the process machinery (grace-idle wait, group-form
// lineage kill, pid bookkeeping, the mirrored constants below) is
// self-implemented over plain node primitives, mirroring the dist
// algorithms the built-in rides; the win32 lineage-kill arm is deliberately
// omitted (POSIX bubble target - the individual-fallback semantics still
// stand). Env pass-through is VERBATIM (the factory always supplies env;
// the builtin's sanitized default is NOT replicated for the unreachable
// standalone corner).
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
  defineTool,
  getShellConfig,
} from "@earendil-works/pi-coding-agent";
import type { SessionExecutionState } from "../../session-execution-state.ts";
import {
  buildHelperArgv,
  checkLandlockHelper,
  classifyLandlockExit,
  composeKernelWritableSet,
  PERMISSION_DENIED_MARKER,
  parseProbeReport,
  renderCommandLandlockDenial,
  renderMechanismRefusal,
} from "./landlock-ruleset.ts";

// ===========================================================================
// PINNED CONSTANTS (mirrored from the measured dist local-ops body - the
// comments cite the measured fact)
// ===========================================================================

/** The measured shell-config record shape. The root surface re-exports the
 * resolver but NOT the interface name, so the seam rides the resolver's own
 * return type (structurally identical - verbatim feed into the sibling
 * assembler, zero transform). */
type ShellConfig = ReturnType<typeof getShellConfig>;

/** Mirrored ceiling: the largest int32 milliseconds - above it the builtin
 * refuses with the maximum-shape message (measured dist constant). */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** The ceiling stringified over one thousand - the exact decimal token the
 * builtin's maximum-shape message interpolates (measured byte sequence).
 * Pinned as a literal so this module carries no division operator anywhere
 * (the colocated zero-slash-in-residue scan stays sound by construction). */
const MAX_TIMEOUT_SECONDS = 2147483.647;
/** Mirrored grace window: after exit, pipes falling idle for this long
 * finalize the wait (re-armed per chunk - the anti-truncation property). */
const EXIT_STDIO_GRACE_MS = 100;
/** Mirror-tail cap: advisory attribution over untrusted output must not
 * grow with output size - O(cap) retained regardless of chunk size. */
const MIRROR_TAIL_CAP_BYTES = 65536;
/** The hardcoded label of the tool being shadowed - interpolates the
 * cwd-error parity bytes verbatim (measured dist literal). */
const TOOL_LABEL = "bash";
/** The probe grammar is ONE token (vendor protocol; extra tokens fault
 * in-band on the carrier side). */
const PROBE_ARGV: readonly string[] = ["--probe"];

/** The zero-length mirror-tail seed (carries no data; the plain Buffer
 * annotation keeps the generic widening consistent with the advances). */
const EMPTY_TAIL: Buffer = Buffer.from("");

// ===========================================================================
// SEAMS BAG + STRUCTURAL SPAWN TYPES (the hermetic observation surface)
// ===========================================================================

/** Spawn options the op hands to the spawner seam. The stdio tuple admits
 * EXACTLY the three production shapes: probe (ignore/pipe/ignore) and the
 * real spawn's two transports (argv: ignore/pipe/pipe; stdin:
 * pipe/pipe/pipe); position 1 stays strictly "pipe" across all three. */
export interface LandlockSpawnOptions {
  readonly cwd: string;
  readonly detached: boolean;
  /** Verbatim pass-through of the op's env (never transformed). */
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly stdio: ["pipe" | "ignore", "pipe", "pipe" | "ignore"];
  readonly windowsHide: boolean;
}

/** Minimal event surface the machinery touches on any child face. Real
 * ChildProcess conformances and hermetic fakes both satisfy this by method-
 * parameter bivariance - zero casts at either boundary. */
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
  /** Optional by declaration (real children expose it optionally); the
   * machinery guards every consult with a defined-check. */
  readonly pid?: number;
  readonly stdout: ChildReadSide | null;
  readonly stderr: ChildReadSide | null;
  readonly stdin: ChildWriteSide | null;
}

/** All seams optional with faithful defaults; injected seams replace the
 * defaults ENTIRELY (house seam doctrine). Defaults are the production
 * behavior: node spawn, the public shell-config call, the single-site stat
 * consult inside the sibling classifier, and the module-private pid ledger.
 */
export interface LandlockBashSeams {
  /** Default: node spawn. Receives BOTH the probe fork and the real spawn
   * (one seam, distinguished by argv). */
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
  /** Pid-track hygiene sink (module-private ledger by default). add on
   * successful spawn, remove in finally. */
  readonly pidLedger?: { add(p: number): void; remove(p: number): void };
}

// ===========================================================================
// SELF-IMPLEMENTED PROCESS MACHINERY (~70 LOC mirror, module-private)
// ===========================================================================

/** Mirrored timeout validation (byte-parity over the measured dist shapes,
 * including the /1000 stringification). */
function validateTimeoutMs(timeout: number | undefined): number | undefined {
  if (timeout === undefined) return undefined;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("Invalid timeout: must be a finite number of seconds");
  }
  const timeoutMs = timeout * 1000;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(
      `Invalid timeout: maximum is ${MAX_TIMEOUT_SECONDS} seconds`,
    );
  }
  return timeoutMs;
}

/** GROUP-FORM lineage termination (POSIX arm): the carrier spawns detached,
 * so it leads its own process group and -pid reaches the whole lineage
 * (shell, children, grandchildren). Individual fallback when the group kill
 * misses (already reaped), swallow - the kill paths never throw. The dist's
 * win32 taskkill arm is deliberately omitted (POSIX bubble target; the
 * fallback ladder still stands there). */
function killLineage(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already dead
    }
  }
}

/** Mirror-tail advance: retain the last CAP bytes of current+chunk with
 * COPY discipline (Buffer.from over the subarray) so the retained slice owns
 * its allocation - O(cap) retained memory guaranteed regardless of chunk
 * size. */
function advanceTail(current: Buffer, chunk: Buffer): Buffer {
  const combined: Buffer = Buffer.concat([current, chunk]);
  if (combined.byteLength <= MIRROR_TAIL_CAP_BYTES) return combined;
  const truncated: Buffer = Buffer.from(
    combined.subarray(combined.byteLength - MIRROR_TAIL_CAP_BYTES),
  );
  return truncated;
}

/** Grace-idle wait (mirror of the dist algorithm): resolves the exit code
 * (null when signal-killed) without hanging on inherited stdio handles held
 * by detached descendants. After exit, finalization waits for the pipes to
 * fall idle (EXIT_STDIO_GRACE_MS, re-armed on every chunk while
 * exited-and-unsettled - output still arriving past exit defers
 * finalization instead of truncating the tail); close finalizes immediately;
 * the error event rejects (settled-once). Finalize clears timers, removes
 * ALL listeners, destroys both streams. Unknown-narrowing idiom throughout
 * (event payloads arrive unknown; no assertions). */
function waitChild(child: ChildHandle): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    let settled = false;
    let exited = false;
    let exitCode: number | null = null;
    let postExitTimer: ReturnType<typeof setTimeout> | undefined;
    let stdoutEnded = child.stdout === null;
    let stderrEnded = child.stderr === null;

    const cleanup = (): void => {
      if (postExitTimer !== undefined) {
        clearTimeout(postExitTimer);
        postExitTimer = undefined;
      }
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.removeListener("close", onClose);
      child.stdout?.removeListener("end", onStdoutEnd);
      child.stderr?.removeListener("end", onStderrEnd);
      child.stdout?.removeListener("data", onData);
      child.stderr?.removeListener("data", onData);
    };
    const finalize = (code: number | null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(code);
    };
    const maybeFinalizeAfterExit = (): void => {
      if (!exited || settled) return;
      if (stdoutEnded && stderrEnded) {
        finalize(exitCode);
      }
    };
    const armIdleTimer = (): void => {
      if (postExitTimer !== undefined) {
        clearTimeout(postExitTimer);
      }
      postExitTimer = setTimeout(() => finalize(exitCode), EXIT_STDIO_GRACE_MS);
    };
    const onData = (): void => {
      // Output still arriving after exit: defer finalizing so the stream is
      // not destroyed mid-write (the anti-truncation property).
      if (exited && !settled) armIdleTimer();
    };
    const onStdoutEnd = (): void => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };
    const onStderrEnd = (): void => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };
    const onError = (reason: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const onExit = (raw: unknown): void => {
      exited = true;
      exitCode = typeof raw === "number" ? raw : null;
      maybeFinalizeAfterExit();
      if (!settled) {
        armIdleTimer();
      }
    };
    const onClose = (raw: unknown): void => {
      finalize(typeof raw === "number" ? raw : null);
    };

    child.stdout?.once("end", onStdoutEnd);
    child.stderr?.once("end", onStderrEnd);
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}

// ===========================================================================
// DEFAULTS (production behavior behind the seams)
// ===========================================================================

/** Module-private pid bookkeeping - hygiene mirror of the dist track trio;
 * exposed only through the seam sink (no process-global hook registration
 * from tool modules). */
const trackedPids = new Set<number>();
const DEFAULT_PID_LEDGER: { add(p: number): void; remove(p: number): void } = {
  add: (p: number) => {
    trackedPids.add(p);
  },
  remove: (p: number) => {
    trackedPids.delete(p);
  },
};

/** Default spawner: node spawn (receives both forks; argv distinguishes). */
const DEFAULT_SPAWNER: NonNullable<LandlockBashSeams["spawner"]> = (
  command,
  args,
  options,
) => spawn(command, [...args], options);

/** Default shell resolution: the SAME public call the builtin uses -
 * identical transport by construction, per-spawn fresh. */
const DEFAULT_RESOLVE_SHELL_CONFIG = (): ShellConfig => getShellConfig();

// ===========================================================================
// THE THROWAWAY PROBE FORK (fast-path gate - never a standing permission)
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
  return waitChild(child).then(
    (exit) => ({ exit, output: collected() }),
    () => ({ exit: null, output: collected() }),
  );
}

// ===========================================================================
// PUBLIC SURFACE
// ===========================================================================

/** THE EXEC PRIMITIVE CREATOR: an ops object conforming to the SDK
 * BashOperations contract whose exec implements the fail-closed fenced
 * lifecycle. The construction cwd aligns the public surface with the
 * factory creator; the per-invocation value resolves UPSTREAM (the factory's
 * precedence) and arrives as the exec's cwd parameter, which the op honors
 * verbatim everywhere (cwd consult, probe fork, real spawn). */
export function createLandlockBashOperations(
  _cwd: string,
  executionState: SessionExecutionState,
  seams?: LandlockBashSeams,
): BashOperations {
  const spawner = seams?.spawner ?? DEFAULT_SPAWNER;
  const statMode = seams?.statMode;
  const resolveShellConfig =
    seams?.resolveShellConfig ?? DEFAULT_RESOLVE_SHELL_CONFIG;
  const pidLedger = seams?.pidLedger ?? DEFAULT_PID_LEDGER;

  return {
    exec: async (command, execCwd, options) => {
      const { onData, signal, timeout, env } = options;

      // -- pinned pre-spawn order (parity-first, fence-authority-second,
      // -- single-site-validation-last) ------------------------------------

      // 1. Timeout validation (byte-parity; mirrored module-private).
      const timeoutMs = validateTimeoutMs(timeout);

      // 2. Pre-abort (byte-parity) BEFORE any other work - fence included.
      if (signal?.aborted) {
        throw new Error("aborted");
      }

      // 3. Cwd F_OK (byte-parity): the cheap fs consult precedes the costly
      // fork; the hardcoded label carries the parity bytes verbatim.
      try {
        await access(execCwd, constants.F_OK);
      } catch {
        throw new Error(
          `Working directory does not exist: ${execCwd}\nCannot execute ${TOOL_LABEL} commands.`,
        );
      }

      // -- the fence block (every refusal below throws PRE-CHILD) ----------

      // Fresh snapshot held BY REFERENCE over the shared state record (the
      // same record the live gate consults - late binding survives span and
      // phase churn over the same threaded instance; a faulty anchor channel
      // escapes VERBATIM, the state module's first-fault-escapes doctrine).
      // ONE consult per invocation; reused at settlement so attribution
      // names the frame that rode the spawn.
      const snapshot = executionState.snapshot();

      // Static classify (synchronous, per-spawn fresh - NO memoization
      // anywhere; TOCTOU authority sits at this spawn site).
      const check = checkLandlockHelper(
        statMode !== undefined ? { statMode } : undefined,
      );
      if (!check.ok) {
        throw new Error(
          check.reason === "helper-unmapped-arch"
            ? renderMechanismRefusal("helper-unmapped-arch", {
                arch: check.arch,
              })
            : renderMechanismRefusal(check.reason, { helperPath: check.path }),
        );
      }
      const carrierPath = check.path;

      // Compose the concrete kernel writable set (pure, total; the minimum
      // over any window is ["/dev"]).
      const writableSet = composeKernelWritableSet(snapshot);

      // Throwaway --probe fork (fast-path gate ONLY - even a passed probe
      // confers no standing permission: the real spawn's in-band codes
      // refuse identically at settlement).
      const probe = await runProbe(spawner, carrierPath, execCwd, env);
      const probeLine = probe.output.endsWith("\n")
        ? probe.output.slice(0, -1)
        : probe.output;
      const report = parseProbeReport(probeLine);
      if (report !== null && report.status === "fail" && probe.exit === 101) {
        throw new Error(
          renderMechanismRefusal("probe-refused", {
            discoveredAbi: report.abi,
            pinnedAbi: report.pin,
          }),
        );
      }
      if (report === null || report.status !== "ok" || probe.exit !== 0) {
        throw new Error(
          renderMechanismRefusal("probe-abnormal", {
            probeExit: probe.exit,
            probeOutput: probe.output,
          }),
        );
      }

      // Shell-config resolution (per-spawn FRESH - the same public call the
      // builtin uses; a throwing resolution propagates VERBATIM - on the
      // shipped Unix path the call cannot throw, and the relative sh
      // fallback it can return is refused at the next item).
      const shellConfig = resolveShellConfig();

      // Argv assembly (SINGLE-SITE validation - the total assembler; the
      // program-absoluteness contract enforced HERE pre-child beats dying
      // in-band after restriction; all invalid reasons ride the same line).
      const assembled = buildHelperArgv(writableSet, shellConfig, command);
      if (assembled.kind === "invalid") {
        throw new Error(renderMechanismRefusal("malformed-spec"));
      }

      // -- SPAWN the carrier (mirror shape of the builtin spawn section) ---
      const child = spawner(carrierPath, assembled.argv, {
        cwd: execCwd,
        detached: process.platform !== "win32",
        env,
        stdio: [assembled.commandViaStdin ? "pipe" : "ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      if (assembled.commandViaStdin) {
        child.stdin?.on("error", () => undefined);
        child.stdin?.end(command);
      }
      if (child.pid !== undefined) {
        pidLedger.add(child.pid);
      }

      // Bounded mirror tap: update the tail THEN forward the pristine bytes
      // (same Buffer reference) to the primary channel.
      let tail: Buffer = EMPTY_TAIL;
      const onChunk = (raw: unknown): void => {
        if (Buffer.isBuffer(raw)) {
          tail = advanceTail(tail, raw);
          onData(raw);
        }
      };
      let timedOut = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const onAbort = (): void => {
        if (child.pid !== undefined) killLineage(child.pid);
      };

      try {
        if (timeoutMs !== undefined) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            if (child.pid !== undefined) killLineage(child.pid);
          }, timeoutMs);
        }
        child.stdout?.on("data", onChunk);
        child.stderr?.on("data", onChunk);
        if (signal !== undefined) {
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }
        const exitCode = await waitChild(child);

        // Post-wait (byte-parity, PRIORITY ORDER PINNED): abort wins over
        // timeout. Kill paths carry NO denial noise - attribution settles
        // below, reached only by the non-kill exits.
        if (signal?.aborted) {
          throw new Error("aborted");
        }
        if (timedOut) {
          throw new Error(`timeout:${timeout}`);
        }
        if (exitCode === null) {
          return { exitCode: null };
        }
        const verdict = classifyLandlockExit(exitCode);
        if (verdict.kind === "mechanism-fault") {
          // THE UNIFORM BAND RULE: whether the carrier issued the code
          // pre-execve or a coincidental command exited in-band is OPAQUE
          // to the spawner (after execve the command's code rides the same
          // channel); the conservative reading stands - enforcement was
          // active throughout. These refusals are POST-SPAWN (two spawn
          // receipts: probe + real).
          throw new Error(renderMechanismRefusal(verdict.fault, { exitCode }));
        }
        // Attribution matrix (fires ONLY on out-of-band NON-ZERO exits):
        // one framed payload through the SAME data channel before
        // resolving. Muted corners: masked-exit-0 stays silent; markerless
        // non-zero passes through plainly; a marker evicted deeper than the
        // cap is an acceptable advisory false negative.
        if (exitCode !== 0 && tail.includes(PERMISSION_DENIED_MARKER)) {
          const leadsNewline =
            tail.length > 0 && tail[tail.length - 1] === 0x0a ? "" : "\n";
          onData(
            Buffer.from(
              `${leadsNewline}${renderCommandLandlockDenial(snapshot)}\n`,
            ),
          );
        }
        return { exitCode };
      } finally {
        // Resource hygiene (mirror shape): untrack, clear, detach, then
        // tear down the tap (finalize already did on the wait path - the
        // destroy calls are idempotent no-ops guarded there).
        if (child.pid !== undefined) {
          pidLedger.remove(child.pid);
        }
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
        if (signal !== undefined) {
          signal.removeEventListener("abort", onAbort);
        }
        child.stdout?.removeListener("data", onChunk);
        child.stderr?.removeListener("data", onChunk);
        child.stdout?.destroy();
        child.stderr?.destroy();
      }
    },
  };
}

/** THE FACTORY CREATOR: one instantiation of the root-exported factory over
 * the fenced ops (schema/streaming/truncation/status/renderers identity by
 * construction; cwd captured at construction, aligned with the state's
 * workspace channel; the per-invocation precedence is factory-side). The
 * defineTool wrap preserves the concrete inference through consumption
 * sites such as customTools arrays (the SDK's sanctioned seam for exactly
 * this widening) while keeping every field identity intact. */
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
