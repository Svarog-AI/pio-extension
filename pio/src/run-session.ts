// Dedicated top-session entry: strict two-value parse + lazy dispatch into
// the built-in diagnostic. The consumer modules load only through dynamic
// literal thunks issued after a successful parse (and past the capability
// gate), so cheap paths — parse errors, the catalog refusal — never pay for
// evaluating a consumer graph, whose reach includes the SDK. There are no
// static imports anywhere in this module.

const USAGE = "pio-run-session <capability> --sessions-root <dir>";

/** Injectable stderr sink — lines arrive WITHOUT a trailing newline; the
 * writer appends it. Production default: the process.stderr writer below. */
export interface RunSessionIO {
  stderr(line: string): void;
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
 * io = the process.stderr writer. Escaping failures degrade to
 * `pio-run-session: unexpected error: <detail>` on the sink + exit 1. */
export async function runSession(
  argv: readonly string[] = process.argv.slice(2),
  io?: RunSessionIO,
): Promise<number> {
  const sink: RunSessionIO = io ?? {
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
  try {
    const parsed = parseEntry(argv);
    if (!parsed.ok) {
      sink.stderr(`pio-run-session: ${parsed.message}`);
      return 1;
    }
    const { capability, sessionsRoot } = parsed;
    // Capability gate fires BEFORE the TTY preflight — mirrors the run
    // path's gate order. The catalog thunk fires ONLY on the non-probe arm:
    // a probe name never loads it. A fault loading the module purely for
    // the constant rides the last-resort boundary below — developer-error
    // surface; no dedicated line is owed.
    if (capability !== "probe") {
      const catalog = await import("./sandbox/run.ts");
      sink.stderr(catalog.CAPABILITY_NOT_IMPLEMENTED(capability));
      return 1;
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
    // line + exit 1; a doubly-faulting sink degrades silently.
    const detail = cause instanceof Error ? cause.message : String(cause);
    try {
      sink.stderr(`pio-run-session: unexpected error: ${detail}`);
    } catch {
      // Sink faulted twice — the handler itself must never throw either.
    }
    return 1;
  }
}
