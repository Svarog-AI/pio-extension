// Dedicated top-session entry: strict positional parse (a fixed
// capability + --sessions-root core, then trailing --input k=v pairs — the
// SAME strict grammar as the host CLI's run position) + a SINGLE-PATH lazy
// pipeline — loader gate → in-namespace TTY fast-fail → fresh session →
// instantiation → the process-lifetime terminal mounted over the
// engagement's runtime BY REFERENCE → base run() under the live terminal →
// teardown (stop → dispose) → terminal status emission → mapped exit code.
//
// Every admitted run executes with its live terminal up: ONE terminal per
// engagement, constructed exactly once at the explicit mount step (after
// kill-capture arming, before the run) over the engagement's RUNTIME —
// never a session object — and torn down (best-effort stop, then runtime
// dispose; every secondary fault swallowed) on EVERY exit path, natural
// completion AND escaping rejection, BEFORE any terminal-record emission or
// degrade-line write. End-state binding discipline: mount and teardown
// reference the RUNTIME only, so the presentation follows whatever session
// the runtime currently holds natively; surfacing other sessions rides the
// runtime's own session machinery with zero presentation changes — that is
// the later composition goal's territory (no promises made here).
//
// Terminal-ownership doctrine: while the terminal is actively rendering it
// is the SOLE writer to the process streams. Human-facing entry lines land
// OUTSIDE its active window — pre-run refusals print on the terminal's
// STATIC initial frame (default rendering is event-dirty with no idle
// repaint timer, so the frame stays static until stop) or before the
// terminal exists at all (the loader miss prints pre-launch), and post-run
// lines (the degrade line) print only after teardown restored cooked mode.
// The entry composes NO product-outcome bytes on ANY path — zero stdout
// writes on every row (suite-spied); the capability states its deliverable
// in the session stream (which is what the terminal presents) and the
// machine ledger carries the frozen project-slot-relative token.
//
// Consumer modules load ONLY through dynamic literal thunks issued after a
// successful parse: the loader thunk fires on every name past parse; the
// leaf-pure launcher thunk (SDK-free) fires immediately after loader
// admission for the TTY fast-fail; the session, emitter, and terminal-class
// thunks fire only past the gates. Cheap paths — parse errors, the miss
// refusal, the TTY refusal — never pay for evaluating those consumer
// graphs, whose reach includes the SDK (evaluated EXACTLY ONCE, at the
// mount step). The static clauses are pure `import type` — erased under
// erasable syntax: zero runtime module evaluation.

import type { KillCaptureTarget, StatusEmitter } from "./capability/status.ts";
import type { TtyStream } from "./sandbox/launcher.ts";

const USAGE =
  "pio-run-session <capability> --sessions-root <dir> [--input k=v …]";

/** THE in-namespace TTY refusal line (module-private; the suite replica
 * names this owner). One physical line, this entry's own product prefix,
 * stating the requirement and the consequence. Deliberately DISTINCT from
 * the host gate's neutral launcher literal (two owners, two byte forms). */
const TTY_REFUSAL_LINE =
  "pio-run-session: running a capability needs an interactive terminal (TTY); piped invocations are refused";

/** Injectable stderr sink — lines arrive WITHOUT a trailing newline; the
 * writer appends it. Production default: the process.stderr writer below. */
export interface RunSessionIO {
  stderr(line: string): void;
}

/** Test-facing seam over the emitter's termination plumbing plus the
 * terminal stream descriptors. Production defaults (process / process.exit
 * / process.stdin / process.stdout) apply when fields are absent. */
export interface RunSessionSeams {
  /** Kill-capture registration target. Default: process. */
  readonly signals?: KillCaptureTarget;
  /** Termination sink for the kill path only. Default: process.exit. */
  readonly exit?: (code: number) => void;
  /** Terminal stream descriptors for the in-namespace TTY fast-fail.
   * Defaults: process.stdin / process.stdout. */
  readonly tty?: Readonly<{
    readonly input: TtyStream;
    readonly output: TtyStream;
  }>;
}

/** Structural view of the entry's terminal binding — the ONLY surface the
 * entry drives: start the independent render loop at the mount step, stop
 * it at teardown. Named for its EFFECT (the execution's live terminal), not
 * a component class. */
interface LiveTerminal {
  run(): Promise<void>;
  stop(): void;
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
 * io = the process.stderr writer, seams = the production defaults (process
 * / process.exit / process.stdin / process.stdout). Every admitted run
 * executes under the process-lifetime terminal mounted over the engagement's
 * runtime (mounted after arming; probe-native teardown before the record).
 * Escaping failures degrade to
 * `pio-run-session: unexpected error: <detail>` on the sink + exit 1 —
 * AFTER the teardown, and once a status emitter exists the boundary first
 * settles the terminal record through it (best-effort, never masking the
 * degrade). */
export async function runSession(
  argv: readonly string[] = process.argv.slice(2),
  io?: RunSessionIO,
  seams?: RunSessionSeams,
): Promise<number> {
  const sink: RunSessionIO = io ?? {
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
  let emitter: StatusEmitter | undefined;
  /** The engagement's runtime, present once construction settles (single-
   * runtime fact: one engagement, one runtime, one terminal). Teardown's
   * dispose leg references it — the RUNTIME, never a session object. */
  let runtime: { dispose(): Promise<void> } | undefined;
  /** The runtime-bound terminal; set only once its constructor succeeded —
   * the tracked mounted state (the stop leg skips when it is undefined). */
  let terminal: LiveTerminal | undefined;

  /** Probe-native teardown pair: best-effort stop (throw swallowed; skipped
   * when the constructor never succeeded) BEFORE runtime dispose (rejection
   * swallowed — the runtime always exists once set). Guaranteed on every
   * exit path and completing BEFORE any out-of-window write, so cooked mode
   * is restored before the record or the degrade line touches the process
   * streams. Never throws — every secondary fault yields to the primary. */
  const teardown = async (): Promise<void> => {
    if (terminal !== undefined) {
      try {
        terminal.stop();
      } catch {
        // Secondary fault — swallowed (terminal ownership: never log).
      }
    }
    if (runtime !== undefined) {
      try {
        await runtime.dispose();
      } catch {
        // Secondary fault — swallowed so the primary cause survives.
      }
    }
  };

  try {
    const parsed = parseEntry(argv);
    if (!parsed.ok) {
      sink.stderr(`pio-run-session: ${parsed.message}`);
      return 1;
    }
    const { capability, sessionsRoot } = parsed;
    // Single-path pipeline. The loader thunk fires UNCONDITIONALLY on every
    // name: a miss prints the LOADER-OWNED refusal line verbatim + 1 BEFORE
    // any TTY consideration — cheap, pre-launch, zero construction (mirrors
    // host discipline).
    const loader = await import("./capability/loader.ts");
    const resolution = await loader.resolveCapability(capability);
    if (!resolution.ok) {
      sink.stderr(resolution.refusal);
      return 1;
    }
    // In-namespace TTY fast-fail (leaf-pure launcher thunk — SDK-free, so
    // cheap-path-safe): the standalone entry bypasses host gates entirely,
    // so the analogous depth lives here — piped invocations refuse BEFORE
    // any construction: no session, no emitter, no terminal, the SDK graph
    // unevaluated.
    const { isInteractiveTty } = await import("./sandbox/launcher.ts");
    const ttyInput = seams?.tty?.input ?? process.stdin;
    const ttyOutput = seams?.tty?.output ?? process.stdout;
    if (!isInteractiveTty(ttyInput, ttyOutput)) {
      sink.stderr(TTY_REFUSAL_LINE);
      return 1;
    }
    const { PioSession } = await import("./capability/pio-session.ts");
    const session = await PioSession.create(process.cwd(), sessionsRoot);
    runtime = session.runtime;
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
    // Arm BEFORE the mount: kill-capture precedes the terminal's own signal
    // plumbing; the prepend-ordering interplay with the terminal's handlers
    // is a MEASUREMENT point (QG), not a redesign.
    emitter.armKillCapture();
    // MOUNT STEP (imperative, process-scoped): the terminal is constructed
    // EXACTLY ONCE over the engagement's runtime BY REFERENCE — no options
    // bag (execute_phase's prompts are the turn actors) — and started
    // WITHOUT awaiting: its render loop runs independently of the pipeline,
    // and its rejection is swallowed (secondary-fault discipline — a
    // terminal-loop fault must never mask the PRIMARY capability fault;
    // never log — terminal ownership). Bound by reference: idempotence by
    // construction (one linear flow, one process, one mount).
    const { InteractiveMode } = await import("@earendil-works/pi-coding-agent");
    terminal = new InteractiveMode(session.runtime);
    void terminal.run().catch(() => {
      // Secondary fault — swallowed (never log — terminal ownership).
    });
    // THE single parsed record, passed BY REFERENCE (no spread/copy at the
    // handoff point): zero-pair invocations hand the EMPTY object — the old
    // "run() invoked with no arguments" contract is superseded.
    const result = await instance.run(parsed.inputs);
    // Teardown (probe-native order) BEFORE the record emission: cooked mode
    // is restored before anything else touches the process streams.
    await teardown();
    const { exitCode } = await emitter.emit(result);
    return exitCode;
  } catch (cause) {
    // Last-resort boundary: any escaping rejection degrades to one readable
    // line + exit 1; a doubly-faulting sink degrades silently. Teardown
    // runs FIRST (best-effort — cooked-mode recovery precedes the
    // out-of-window writes below). Once the emitter exists (post-emitter
    // faults only), the captured record settles NEXT through it —
    // best-effort: the emit never rejects and the swallow keeps the degrade
    // plain. Pre-emitter faults skip the settle step (no instance) and
    // degrade plainly.
    await teardown();
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
