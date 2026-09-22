// pio CLI core: strict argument parsing + capability dispatch.
//
// Design notes:
// - `parse` is pure and UI-neutral: it classifies argv into a descriptor and
//   emits unprefixed error messages; `main` renders the `pio: ` prefix.
// - Strict flag surface: the only recognized top-level forms are `--help`,
//   `help`, `--version`, and `run`. Every other dash token (anywhere) is an
//   unknown option — there are no short forms and no stub flags.
// - Builtins load only through the dynamic import issued after a successful
//   parse+dispatch, so the cheap forms (help, version, errors) never pay for
//   evaluating a builtin graph — the run path's graph pulls in the SDK.
//   The sole static import is the version constant.
// - `probe` is the only resolvable target, handled as an explicit special
//   case in `main`'s dispatch — no abstraction around it.
import { PIO_VERSION } from "./version.ts";

/** Descriptors of a parsed argv (program name excluded). `error.message` is unprefixed. */
export type ParsedCommand =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "reserved" } // bare `pio` and bare `pio run`
  | { kind: "run"; capability: string }
  | { kind: "error"; message: string };

/** Injectable IO sink. Writers receive a line WITHOUT trailing newline; `main` appends it. */
export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

const UNKNOWN_OPTION = (token: string): string =>
  `unknown option: ${token} (try: pio --help)`;
const UNKNOWN_COMMAND = (token: string): string =>
  `unknown command: ${token} (try: pio --help)`;
const UNEXPECTED_ARGUMENT = (token: string): string =>
  `unexpected argument: ${token} (usage: pio run <capability>)`;
const MISSING_CAPABILITY =
  "expected capability name after 'run' (usage: pio run <capability>)";

const HELP_LINES: readonly string[] = [
  "pio — goal-driven project management CLI",
  "",
  "Usage:",
  "  pio run <capability>",
  "  pio --help",
  "  pio --version",
  "",
  "Built-in capabilities:",
  "  probe — built-in diagnostic: verifies session/TUI/transcript plumbing (currently the only resolvable target)",
];

function startsWithDash(token: string): boolean {
  return token.startsWith("-");
}

/** Pure, synchronous argument parser. No IO, no imports at call time, no side effects. */
export function parse(argv: readonly string[]): ParsedCommand {
  const [first, second, ...rest] = argv;

  if (first === undefined) {
    return { kind: "reserved" };
  }
  // Terminal forms: everything after them is ignored by design.
  if (first === "--help" || first === "help") {
    return { kind: "help" };
  }
  if (first === "--version") {
    return { kind: "version" };
  }
  if (first !== "run") {
    return {
      kind: "error",
      message: startsWithDash(first)
        ? UNKNOWN_OPTION(first)
        : UNKNOWN_COMMAND(first),
    };
  }
  // `run <capability>`: the second token decides.
  if (second === undefined) {
    return { kind: "reserved" };
  }
  if (second === "") {
    return { kind: "error", message: MISSING_CAPABILITY };
  }
  if (startsWithDash(second)) {
    return { kind: "error", message: UNKNOWN_OPTION(second) };
  }
  if (rest.length > 0) {
    const extra = rest[0];
    return {
      kind: "error",
      message: startsWithDash(extra)
        ? UNKNOWN_OPTION(extra)
        : UNEXPECTED_ARGUMENT(extra),
    };
  }
  return { kind: "run", capability: second };
}

/** Entry point. `argv` = user args (process.argv.slice(2) in the real bin).
 *  `io` defaults to process.stdout/process.stderr writers. Resolves to the process exit code;
 *  the bin sinks it into process.exitCode. Never rejects — escaping failures degrade to
 *  the `pio: unexpected error: <detail>` line on stderr + exit 1. */
export async function main(
  argv: readonly string[],
  io?: CliIO,
): Promise<number> {
  const out: CliIO = io ?? {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  };

  try {
    const parsed = parse(argv);
    switch (parsed.kind) {
      case "help":
        for (const line of HELP_LINES) {
          out.stdout(line);
        }
        return 0;
      case "version":
        out.stdout(PIO_VERSION);
        return 0;
      case "reserved":
        out.stderr("pio: default workflow capability not available yet");
        return 1;
      case "error":
        out.stderr(`pio: ${parsed.message}`);
        return 1;
      case "run": {
        const name = parsed.capability;
        if (name !== "probe") {
          // Single owner of the catalog line. A fault loading the module
          // purely for the constant rides the last-resort boundary — this
          // path is already degenerate; no dedicated line is owed.
          const catalog = await import("./sandbox/run.ts");
          out.stderr(catalog.CAPABILITY_NOT_IMPLEMENTED(name));
          return 1;
        }
        // `probe` enters through the run path (host-side launch). Dynamic
        // import — see the header note on lazy loading. It must export
        // runCapability(name, io?): Promise<number> (the exit code).
        let runPath: {
          runCapability(
            capabilityName: string,
            io?: { stderr(line: string): void },
          ): Promise<number>;
        };
        try {
          runPath = await import("./sandbox/run.ts");
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          out.stderr(`pio: failed to load built-in '${name}': ${detail}`);
          return 1;
        }
        return await runPath.runCapability("probe", out);
      }
    }
  } catch (cause) {
    // Last-resort boundary: any escaping rejection degrades to one readable line + exit 1.
    const detail = cause instanceof Error ? cause.message : String(cause);
    try {
      out.stderr(`pio: unexpected error: ${detail}`);
    } catch {
      // Sink faulted twice — the handler itself must never throw either.
    }
    return 1;
  }
}
