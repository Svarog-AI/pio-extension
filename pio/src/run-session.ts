// Dedicated top-session entry: strict two-value parse + lazy dispatch. The
// probe arm keeps its direct builtin dispatch byte-stable; the non-probe
// arm runs the v1 pipeline — loader gate → fresh session → instantiation →
// base run() → terminal status emission → mapped exit code. Consumer
// modules load ONLY through dynamic literal thunks issued after a
// successful parse (and past the loader gate), so cheap paths — parse
// errors, the miss refusal — never pay for evaluating a consumer graph,
// whose reach includes the SDK. The single static clause is a pure
// `import type` — erased under erasable syntax: zero runtime module
// evaluation.

import type { KillCaptureTarget, StatusEmitter } from "./capability/status.ts";

const USAGE = "pio-run-session <capability> --sessions-root <dir>";

/** Injectable stderr sink — lines arrive WITHOUT a trailing newline; the
 * writer appends it. Production default: the process.stderr writer below. */
export interface RunSessionIO {
  stderr(line: string): void;
}

/** Test-facing seam over the emitter's termination plumbing. Production
 * defaults (process / process.exit) apply when fields are absent. */
export interface RunSessionSeams {
  /** Kill-capture registration target. Default: process. */
  readonly signals?: KillCaptureTarget;
  /** Termination sink for the kill path only. Default: process.exit. */
  readonly exit?: (code: number) => void;
}

type ParsedEntry =
  | { ok: true; capability: string; sessionsRoot: string }
  | { ok: false; message: string }; // unprefixed — the dispatch layer renders the prefix

function startsWithDash(token: string): boolean {
  return token.startsWith("-");
}

/** Strict positional entry grammar: a non-empty non-dash capability, then
 * EXACTLY the `--sessions-root` flag, then a non-empty non-dash value.
 * Syntactic ONLY — no existence, absoluteness, or shape checks on the value;
 * producers emit absolute paths and consumers own validity. No flag-position
 * flexibility — a reordered flag lands as a dash in the capability slot. */
function parseEntry(argv: readonly string[]): ParsedEntry {
  const [first, second, third, ...surplus] = argv;
  if (first === undefined || first === "") {
    return { ok: false, message: `expected capability name (usage: ${USAGE})` };
  }
  if (startsWithDash(first)) {
    return { ok: false, message: `unknown option: ${first} (usage: ${USAGE})` };
  }
  const capability = first;
  if (second === undefined) {
    return {
      ok: false,
      message: `expected --sessions-root <dir> after '${capability}' (usage: ${USAGE})`,
    };
  }
  if (second !== "--sessions-root") {
    return {
      ok: false,
      message: startsWithDash(second)
        ? `unknown option: ${second} (usage: ${USAGE})`
        : `unexpected argument: ${second} (usage: ${USAGE})`,
    };
  }
  if (third === undefined || third === "") {
    return {
      ok: false,
      message: `expected a value for --sessions-root (usage: ${USAGE})`,
    };
  }
  if (startsWithDash(third)) {
    return { ok: false, message: `unknown option: ${third} (usage: ${USAGE})` };
  }
  // Surplus tokens: the first one is named — a duplicated `--sessions-root`
  // lands here via the dash-surplus arm.
  if (surplus.length > 0) {
    const extra = surplus[0];
    return {
      ok: false,
      message: startsWithDash(extra)
        ? `unknown option: ${extra} (usage: ${USAGE})`
        : `unexpected argument: ${extra} (usage: ${USAGE})`,
    };
  }
  return { ok: true, capability, sessionsRoot: third };
}

/** Top-session entry: strict two-value parse + lazy dispatch. Resolves THE
 * exit code; never rejects. Defaults: argv = process.argv.slice(2),
 * io = the process.stderr writer, seams = the production termination
 * defaults (process / process.exit). Escaping failures degrade to
 * `pio-run-session: unexpected error: <detail>` on the sink + exit 1 — and
 * once a status emitter exists, the boundary first settles the terminal
 * record through it (best-effort, never masking the degrade). */
export async function runSession(
  argv: readonly string[] = process.argv.slice(2),
  io?: RunSessionIO,
  seams?: RunSessionSeams,
): Promise<number> {
  const sink: RunSessionIO = io ?? {
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
  let emitter: StatusEmitter | undefined;
  try {
    const parsed = parseEntry(argv);
    if (!parsed.ok) {
      sink.stderr(`pio-run-session: ${parsed.message}`);
      return 1;
    }
    const { capability, sessionsRoot } = parsed;
    // v1 non-probe pipeline. The loader thunk fires ONLY on this arm (a
    // probe name never loads it); a miss prints the LOADER-OWNED refusal
    // line verbatim + 1 BEFORE the session/status thunks fire — cheap,
    // pre-launch, zero construction. No TTY gate here: v1 runs are
    // headless-by-design programmatic phase execution.
    if (capability !== "probe") {
      const loader = await import("./capability/loader.ts");
      const resolution = await loader.resolveCapability(capability);
      if (!resolution.ok) {
        sink.stderr(resolution.refusal);
        return 1;
      }
      const { PioSession } = await import("./capability/pio-session.ts");
      const session = await PioSession.create(process.cwd(), sessionsRoot);
      const instance = new resolution.capability.ctor({ session });
      const { createStatusEmitter } = await import("./capability/status.ts");
      // Identity stamped from the RESOLVED contract (mandatory fields —
      // guaranteed well-formed by the loader); accessors stay LIVE (the
      // emitter snapshots at emit/signal time). Module defaults own
      // now/graceMs/settleLiveRun — no stop channel exists to feed a
      // settlement.
      emitter = createStatusEmitter({
        sessionsRoot,
        capability: {
          name: resolution.capability.contract.name,
          version: resolution.capability.contract.version,
        },
        tokens: () => session.counters().tokens,
        sessionFile: () => session.runtime.session.sessionFile,
        signals: seams?.signals,
        exit: seams?.exit,
      });
      // Arm BEFORE the run begins: v1 runs carry no InteractiveMode, so
      // this prepend precedes every SIGTERM handler in the process.
      emitter.armKillCapture();
      const result = await instance.run();
      const { exitCode } = await emitter.emit(result);
      return exitCode;
    }
    // Preflight BEFORE any construction: a headless invocation must fail
    // fast with exactly one line and exit 1 — no session, no TUI.
    // Direct builtin dispatch: the in-namespace process carries the sandbox
    // marker in its environment, so routing through the run path would
    // refuse on its anti-nesting gate instead of running the session.
    // Dynamic import — see the header note on lazy loading. It must export
    // run(io?, opts?): Promise<number>.
    const probe = await import("./probe.ts");
    if (!probe.isInteractiveTty(process.stdin, process.stdout)) {
      sink.stderr(probe.TTY_REFUSAL_LINE);
      return 1;
    }
    return await probe.run(sink, { sessionsRoot });
  } catch (cause) {
    // Last-resort boundary: any escaping rejection degrades to one readable
    // line + exit 1; a doubly-faulting sink degrades silently. Once the
    // emitter exists (post-emitter faults only), the captured record
    // settles FIRST through it — best-effort: the emit never rejects and
    // the swallow keeps the degrade plain. Pre-emitter faults skip the
    // settle step (no instance) and degrade plainly; the probe arm keeps
    // today's shape (its emitter stays undefined).
    if (emitter !== undefined) {
      const { captureError } = await import("./capability/status.ts");
      await emitter
        .emit({ ok: false, errors: [captureError(cause)] })
        .catch(() => {});
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    try {
      sink.stderr(`pio-run-session: unexpected error: ${detail}`);
    } catch {
      // Sink faulted twice — the handler itself must never throw either.
    }
    return 1;
  }
}
