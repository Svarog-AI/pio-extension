// Terminal status record machinery for capability engagements.
//
// One emitter per process writes the terminal record EXACTLY ONCE, to
// `<sessionsRoot>/top/status.json` beside the top transcript. The record is
// TERMINAL by definition: never updated afterwards, and each fresh run mints
// a new engagement dir, so prior records are untouched. Mid-run progress lives
// in the transcript; this module owns only the three terminal outcomes —
// clean completion (ok:true), typed/unknown failure escaping the capability
// body (ok:false with captured errors), and a SIGTERM mid-run partial
// (ok:false, cause "kill").
//
// Leaf purity: the module takes LIVE ACCESSORS (token scalar, transcript
// path) instead of session references, so it imports nothing beyond node
// builtins and the error home — no SDK graph, no sibling modules. The entry
// point wires the accessors to the live session and owns the single emitter
// instance.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { CapabilityErrorCause, SessionStatusError } from "./errors.ts";
import { ContractViolationError, PhaseBudgetError } from "./errors.ts";

/** Machine-readable classification of a capability failure. */
export interface SessionStatus {
  /** Outcome flag; drives the exit-code map (true => 0, false => 1). */
  readonly ok: boolean;
  /** Identity stamped at assembly: caller name/version plus the v1 source literal. */
  readonly capability: Readonly<{
    readonly name: string;
    readonly version: string;
    readonly source: "builtin"; // v1 literal
  }>;
  /** Deliverables observed by the run; always serializes (defaults to {}). */
  readonly outputs: Record<string, unknown>;
  /** Captured failures; absent when ok. */
  readonly errors?: SessionStatusError[];
  /** Transcript location RELATIVE to the engagement dir; omitted when unnamed. */
  readonly transcriptRef?: string;
  /** Token scalar read verbatim from the session counters at emit time. */
  readonly tokens: number;
  /** Run span in ms: emitter construction to emission. */
  readonly durationMs: number;
}

/**
 * The capability-scope completion payload: what the capability body OBSERVED
 * (succeeded + deliverables, or failed + captured errors) — NOT the full
 * SessionStatus; the emitter completes that with placement, counters, clock,
 * and transcript. Invariant: ok:false implies errors provided non-empty;
 * ok:true implies errors absent.
 */
export interface CapabilityResult {
  readonly ok: boolean;
  readonly outputs?: Record<string, unknown>;
  /** Non-empty when ok is false. */
  readonly errors?: SessionStatusError[];
}

/**
 * What emit() resolves: the completed terminal record plus its mapped exit
 * code as one atomic pair — an emission OF THE STATUS.
 */
export interface StatusEmissionResult {
  readonly status: SessionStatus;
  readonly exitCode: number;
}

/** Where the kill-capture handler attaches. Default: process (production —
 * only the session process receives these signals; armKillCapture() prepends
 * onto it AFTER the InteractiveMode instance exists). The seam exists so the
 * co-located suite can drive listener dispatch order hermetically —
 * last-prepended-runs-first — which a real process cannot be made to do.
 * Named for its mechanism ("kill-capture" is the canonical session-side
 * flow name); this is the attach TARGET, not the handler. */
export interface KillCaptureTarget {
  prependListener(signal: "SIGTERM", handler: () => void): void;
}

/** Closure inputs for one terminal-record writer. */
export interface StatusEmitterOptions {
  /** The --sessions-root value: `<engagementDir>/.sessions`. */
  readonly sessionsRoot: string;
  /** Identity from the caller's contract; the emitter stamps source:"builtin". */
  readonly capability: Readonly<{
    readonly name: string;
    readonly version: string;
  }>;
  /** Live token-scalar accessor: production wiring feeds the session
   * counters' token scalar verbatim. Injected so the suite supplies
   * hand-computed fixtures and the module stays free of session imports. */
  readonly tokens: () => number;
  /** Live transcript-path accessor (absolute path, or undefined while the
   * platform has not named the file). Production wiring reads the session
   * runtime's transcript getter; injection keeps the reach path owned by the
   * entry point and the module a leaf. */
  readonly sessionFile: () => string | undefined;
  /** Clock: mints the run start at CONSTRUCTION and spans emission.
   * Default: Date.now. Injected so durations pin deterministically. */
  readonly now?: () => number;
  /** Termination sink for the kill path only. Default: process.exit.
   * Injected so the suite observes — rather than ends — the requested code. */
  readonly exit?: (code: number) => void;
  /** Kill-capture registration target. Default: process. */
  readonly signals?: KillCaptureTarget;
  /** Best-effort live-run settlement attempted before the partial record is
   * assembled. Absent => skip straight to as-is capture; every fault is
   * swallowed. The session exposes no public stop channel, so the entry
   * point may supply one; the suite drives timeout/fault/fast rows through
   * pendable promises. */
  readonly settleLiveRun?: () => Promise<void>;
  /** Settlement bound in milliseconds. Default: DEFAULT_KILL_GRACE_MS. */
  readonly graceMs?: number;
}

/** Handle over one process's single terminal-record writer. */
export interface StatusEmitter {
  /** One authoritative write per emitter; losers await the winner's result. */
  emit(result: CapabilityResult): Promise<StatusEmissionResult>;
  /** Installs the SIGTERM kill-capture handler; idempotent. */
  armKillCapture(): void;
}

/**
 * Pure serialization of the terminal record.
 *
 * Assembles the plain object in CANONICAL KEY ORDER — ok, capability
 * (name, version, source), outputs, errors, transcriptRef, tokens, durationMs
 * — dropping any nullish optional key (absent, never null), then pretty-
 * prints with 2-space indent plus a trailing newline for human auditability.
 * outputs is required, so a failing record still shows the key with an empty
 * object; absence is reserved for the genuinely-optional errors/transcriptRef.
 */
export function serializeStatus(status: SessionStatus): string {
  const record: Record<string, unknown> = {
    ok: status.ok,
    capability: {
      name: status.capability.name,
      version: status.capability.version,
      source: status.capability.source,
    },
    outputs: status.outputs,
    ...(status.errors !== undefined ? { errors: status.errors } : {}),
    ...(status.transcriptRef !== undefined
      ? { transcriptRef: status.transcriptRef }
      : {}),
    tokens: status.tokens,
    durationMs: status.durationMs,
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** Pure placement derivation: the terminal record lands in the top session dir. */
export function statusPath(sessionsRoot: string): string {
  return join(sessionsRoot, "top", "status.json");
}

/** Pinned default settlement bound: balances settle odds against exit latency. */
export const DEFAULT_KILL_GRACE_MS: number = 250;

/** Pure exit-code map: success 0, failure 1. 130 never maps here — the
 * user-interrupt path exits natively before any status consumer runs. */
export function exitCodeFor(status: SessionStatus): number {
  return status.ok ? 0 : 1;
}

/** Closed mirror of the error-home cause vocabulary. The union exported by
 * the error home is the single source of truth; this tuple locks step with it
 * by TYPE (a typo or a missed member fails tsc), so cause adoption in
 * captureError accepts exactly the closed set and nothing else. */
const KNOWN_CAUSES: readonly CapabilityErrorCause[] = [
  "budget",
  "kill",
  "spawn",
  "contract",
  "author-halt",
];

/**
 * Reduce a thrown value to JSON-safe captured-failure data.
 *
 * Ladder order: typed-class branches first, closed-vocabulary cause adoption
 * second, bare identity fallback last. Typed classes take precedence, so a
 * ContractViolationError's own cause never falls through to the generic
 * Error path. message is OMITTED when it would be empty/undefined (keys
 * absent, never empty-string noise); violations appears ONLY in the
 * ContractViolationError branch. Adoption of the standard ES Error.cause
 * applies only to CLOSED-VOCABULARY members — authors signal deliberate
 * halts by throwing an Error carrying cause:"author-halt"; foreign causes are
 * dropped.
 */
export function captureError(error: unknown): SessionStatusError {
  if (error instanceof ContractViolationError) {
    return {
      type: "ContractViolationError",
      cause: "contract",
      ...(error.message ? { message: error.message } : {}),
      violations: error.violations,
    };
  }
  if (error instanceof PhaseBudgetError) {
    return {
      type: "PhaseBudgetError",
      cause: "budget",
      ...(error.message ? { message: error.message } : {}),
    };
  }
  if (error instanceof Error) {
    // Return the MIRRORED member (not the raw input string) so the adopted
    // value carries the union type without a cast.
    const candidate = error.cause;
    let adopted: CapabilityErrorCause | undefined;
    if (typeof candidate === "string") {
      for (const member of KNOWN_CAUSES) {
        if (member === candidate) {
          adopted = member;
          break;
        }
      }
    }
    return {
      type: error.name,
      ...(adopted !== undefined ? { cause: adopted } : {}),
      ...(error.message ? { message: error.message } : {}),
    };
  }
  const rendered = String(error);
  return {
    type: "UnknownError",
    ...(rendered ? { message: rendered } : {}),
  };
}

/**
 * Build one terminal-record writer.
 *
 * Mints the run-start timestamp at CONSTRUCTION (durationMs spans construction
 * to emission). A small claim record shared by both consumer paths enforces
 * the TERMINAL discipline: the FIRST claimant drives the single write, every
 * later consumer (a completion emit after a kill claim, or the signal handler
 * after a completion record) performs no second write and resolves with the
 * WINNER'S StatusEmissionResult — file bytes stay stable under racing
 * consumers. emit never rejects: a write fault degrades silently and still
 * resolves the assembled pair.
 */
export function createStatusEmitter(
  options: StatusEmitterOptions,
): StatusEmitter {
  const now = options.now ?? Date.now;
  const exitSink = options.exit ?? ((code: number): void => process.exit(code));
  const target: KillCaptureTarget = options.signals ?? process;
  const graceMs = options.graceMs ?? DEFAULT_KILL_GRACE_MS;
  const startMs = now();

  const claim: {
    owner: "completion" | "kill" | null;
    result: Promise<StatusEmissionResult> | null;
  } = { owner: null, result: null };

  const capabilityStamp: SessionStatus["capability"] = {
    name: options.capability.name,
    version: options.capability.version,
    source: "builtin",
  };

  /** Engagement-relative transcript location, or undefined while unnamed. */
  function transcriptRefOf(file: string | undefined): string | undefined {
    return file === undefined
      ? undefined
      : relative(dirname(options.sessionsRoot), file);
  }

  /** Complete a consumed payload into the full record. */
  function buildStatus(
    ok: boolean,
    outputs: Record<string, unknown>,
    errors: SessionStatusError[] | undefined,
    tokens: number,
    file: string | undefined,
  ): SessionStatus {
    const ref = transcriptRefOf(file);
    return {
      ok,
      capability: capabilityStamp,
      outputs,
      ...(errors !== undefined ? { errors } : {}),
      ...(ref !== undefined ? { transcriptRef: ref } : {}),
      tokens,
      durationMs: now() - startMs,
    };
  }

  /** One defensive write: parent mkdir (layout already creates it) + UTF-8 file. */
  async function writeRecord(status: SessionStatus): Promise<void> {
    const path = statusPath(options.sessionsRoot);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, serializeStatus(status), "utf8");
    } catch {
      // Best-effort last mile: a write fault must not mask the primary error
      // the caller's boundary already reports.
    }
  }

  /** Best-effort live-run settlement bounded by the grace window; every
   * fault (rejection, throw, overrun) is swallowed. Absent hook skips the
   * race entirely — immediate as-is capture. */
  async function settleWithinGrace(): Promise<void> {
    const settle = options.settleLiveRun;
    if (settle === undefined) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => settle()),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, graceMs);
        }),
      ]);
    } catch {
      // A faulty settlement must never break capture.
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /** The completion path: assemble at emit time, write, map the exit code. */
  async function completionEmission(
    result: CapabilityResult,
  ): Promise<StatusEmissionResult> {
    // Errors pass through on failure, are dropped on success.
    const errors = result.ok ? undefined : result.errors;
    const status = buildStatus(
      result.ok,
      result.outputs ?? {},
      errors,
      options.tokens(),
      options.sessionFile(),
    );
    await writeRecord(status);
    return { status, exitCode: exitCodeFor(status) };
  }

  /** The kill path: settle best-effort, THEN assemble the partial record from
   * the PRE-SETTLE snapshots — deterministic whether settlement succeeds,
   * faults, or overruns — write it, and hand back the mapped exit code. */
  async function killEmission(
    preTokens: number,
    preFile: string | undefined,
  ): Promise<StatusEmissionResult> {
    await settleWithinGrace();
    const status = buildStatus(
      false,
      {},
      [{ type: "SIGTERM", cause: "kill" }],
      preTokens,
      preFile,
    );
    await writeRecord(status);
    return { status, exitCode: exitCodeFor(status) };
  }

  function emit(result: CapabilityResult): Promise<StatusEmissionResult> {
    if (claim.result !== null) {
      // A winner already owns the record: pure delegation, no second write.
      return claim.result;
    }
    const pending = completionEmission(result);
    claim.owner = "completion";
    claim.result = pending;
    return pending;
  }

  /** In-namespace SIGTERM kill-capture: synchronous prelude claims the record
   * and snapshots the as-is counters/transcript AT SIGNAL TIME (authoritative
   * for the partial record), then runs the kill emission. Only the claimant
   * force-exits (mapped code 1); repeat deliveries after the first claim are
   * no-ops, and a completion-owned claim defers entirely. The body never
   * throws — secondary faults are silent, mirroring the probe catch style. */
  function handleSigterm(): void {
    try {
      if (claim.result !== null) {
        return;
      }
      const preTokens = options.tokens();
      const preFile = options.sessionFile();
      const pending = killEmission(preTokens, preFile).then((result) => {
        exitSink(exitCodeFor(result.status));
        return result;
      });
      claim.owner = "kill";
      claim.result = pending;
    } catch {
      // Silent: a signal listener must never throw into runtime dispatch.
    }
  }

  let armed = false;

  function armKillCapture(): void {
    if (armed) {
      return;
    }
    armed = true;
    target.prependListener("SIGTERM", handleSigterm);
  }

  return { emit, armKillCapture };
}
