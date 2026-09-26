// Dedicated top-session entry: strict positional parse (a fixed
// capability + --sessions-root core, then trailing --input k=v pairs — the
// SAME strict grammar as the host CLI's run position) + a SINGLE-PATH lazy
// pipeline — loader gate → fresh session → instantiation → base run() →
// terminal status emission → mapped exit code. Consumer modules load ONLY
// through dynamic literal thunks issued after a successful parse (and past
// the loader gate), so cheap paths — parse errors, the miss refusal — never
// pay for evaluating a consumer graph, whose reach includes the SDK. No TTY
// gate exists here: v1 runs are headless-by-design programmatic phase
// execution. The single static clause is a pure `import type` — erased under
// erasable syntax: zero runtime module evaluation.

import type { KillCaptureTarget, StatusEmitter } from "./capability/status.ts";

const USAGE =
  "pio-run-session <capability> --sessions-root <dir> [--input k=v …]";

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
  | {
      ok: true;
      capability: string;
      sessionsRoot: string;
      /** Always present — `{}` when no pairs were given (insertion order).
       * THE single record handed to base `run(values)` by reference. */
      inputs: Record<string, string>;
    }
  | { ok: false; message: string }; // unprefixed — the dispatch layer renders the prefix

function startsWithDash(token: string): boolean {
  return token.startsWith("-");
}

/** Strict positional entry grammar: a non-empty non-dash capability, then
 * EXACTLY the `--sessions-root` flag, then a non-empty non-dash value, then
 * zero or more trailing `--input k=v` pairs — the SAME strict grammar as
 * the host CLI's run position (first-'=' split, no trimming anywhere, the
 * glued form unknown, duplicate key refused; first violation wins).
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
  // Trailing tail: the `--input k=v` pair scan (flag token consumes the NEXT
  // token AS-IS as the pair candidate BEFORE any dash classification — so a
  // glued `--input=k=v` never matches the flag and degrades to the
  // unknown-option arm below). A duplicated `--sessions-root` also lands
  // here via the dash-surplus arm. First violation wins (fail-fast).
  const inputs: Record<string, string> = {};
  for (let i = 0; i < surplus.length; i++) {
    const token = surplus[i];
    if (token === "--input") {
      const pair = surplus[i + 1];
      if (pair === undefined) {
        return {
          ok: false,
          message: `malformed input pair: '--input' (--input expects k=v; usage: ${USAGE})`,
        };
      }
      i++; // consume the pair candidate (it gets NO dash classification)
      const eq = pair.indexOf("=");
      const key = eq <= 0 ? "" : pair.slice(0, eq);
      if (eq < 0 || key.length === 0) {
        return {
          ok: false,
          message: `malformed input pair: '${pair}' (--input expects k=v; usage: ${USAGE})`,
        };
      }
      if (Object.hasOwn(inputs, key)) {
        return {
          ok: false,
          message: `duplicate input key: '${key}' (each key may appear once; usage: ${USAGE})`,
        };
      }
      inputs[key] = pair.slice(eq + 1); // whole remainder (EMPTY allowed)
      continue;
    }
    if (startsWithDash(token)) {
      return {
        ok: false,
        message: `unknown option: ${token} (usage: ${USAGE})`,
      };
    }
    return {
      ok: false,
      message: `unexpected argument: ${token} (usage: ${USAGE})`,
    };
  }
  return { ok: true, capability, sessionsRoot: third, inputs };
}

/** Top-session entry: strict positional parse + lazy dispatch. Resolves THE
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
    // Single-path pipeline. The loader thunk fires UNCONDITIONALLY on every
    // name: a miss prints the LOADER-OWNED refusal line verbatim + 1 BEFORE
    // the session/status thunks fire — cheap, pre-launch, zero construction.
    // No TTY gate here: v1 runs are headless-by-design programmatic phase
    // execution.
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
    // THE single parsed record, passed BY REFERENCE (no spread/copy at the
    // handoff point): zero-pair invocations hand the EMPTY object — the old
    // "run() invoked with no arguments" contract is superseded.
    const result = await instance.run(parsed.inputs);
    const { exitCode } = await emitter.emit(result);
    return exitCode;
  } catch (cause) {
    // Last-resort boundary: any escaping rejection degrades to one readable
    // line + exit 1; a doubly-faulting sink degrades silently. Once the
    // emitter exists (post-emitter faults only), the captured record
    // settles FIRST through it — best-effort: the emit never rejects and
    // the swallow keeps the degrade plain. Pre-emitter faults skip the
    // settle step (no instance) and degrade plainly.
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
