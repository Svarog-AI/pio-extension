// pio CLI core: strict argument parsing + capability dispatch.
//
// Design notes:
// - `parse` is pure and UI-neutral: it classifies argv into a descriptor and
//   emits unprefixed error messages; `main` renders the `pio: ` prefix.
// - Strict flag surface: the only recognized top-level forms are `--help`,
//   `help`, `--version`, and `run`; `--input k=v` is recognized in run
//   position ONLY (after a capability name was consumed). Every other dash
//   token (anywhere) is an unknown option — there are no short forms and no
//   stub flags.
// - Builtins load only through the single dynamic import issued after a
//   successful parse+dispatch, so the cheap forms (help, version, errors)
//   never pay for evaluating a builtin graph — the run path's graph pulls in
//   the SDK. The sole static import is the version constant and the sole
//   dynamic literal is `./sandbox/run.ts`.
// - EVERY name delegates onward to the run path: its loader-based gate owns
//   admission, and its refusal line reaches the user through the same IO
//   sink this module threads — this file carries no refusal bytes of its own.
import { PIO_VERSION } from "./version.ts";

/** Descriptors of a parsed argv (program name excluded). `error.message` is unprefixed. */
export type ParsedCommand =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "reserved" } // bare `pio` and bare `pio run`
  // `inputs`: insertion-ordered key→value map — ALWAYS present on run
  // descriptors (EMPTY `{}` by default); a plain object, so JS string-key
  // insertion order IS the declared order.
  | { kind: "run"; capability: string; inputs: Record<string, string> }
  | { kind: "error"; message: string };

/** Injectable IO sink. Writers receive a line WITHOUT trailing newline; `main` appends it. */
export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

/** Canonical run-grammar usage string — ONE constant feeds ALL THREE host
 * occurrences: the help usage line and both error-template tails (S03 lifts
 * the S02 usage-byte freeze PRECISELY for these strings because the grammar
 * grew). NOTE the trailing ellipsis is the U+2026 HORIZONTAL ELLIPSIS
 * character — pinned codepoint, never normalized to three dots. */
const RUN_USAGE = "pio run <capability> [--input k=v …]";

const UNKNOWN_OPTION = (token: string): string =>
  `unknown option: ${token} (try: pio --help)`;
const UNKNOWN_COMMAND = (token: string): string =>
  `unknown command: ${token} (try: pio --help)`;
const UNEXPECTED_ARGUMENT = (token: string): string =>
  `unexpected argument: ${token} (usage: ${RUN_USAGE})`;
const MISSING_CAPABILITY = `expected capability name after 'run' (usage: ${RUN_USAGE})`;
const MALFORMED_INPUT_PAIR = (token: string): string =>
  `malformed input pair: '${token}' (--input expects k=v; usage: ${RUN_USAGE})`;
const DUPLICATE_INPUT_KEY = (key: string): string =>
  `duplicate input key: '${key}' (each key may appear once; usage: ${RUN_USAGE})`;

const HELP_LINES: readonly string[] = [
  "pio — goal-driven project management CLI",
  "",
  "Usage:",
  `  ${RUN_USAGE}`,
  "  pio --help",
  "  pio --version",
  "",
  "Built-in capabilities:",
  // NOTE the em dash is the U+2014 EM DASH character — pinned codepoint,
  // matching line-0 house style; the quoted <topic> documents the
  // shell-quoted multi-word-as-ONE-value grammar.
  "  research — bounded web-research loop producing a markdown file report",
  '  pio run research --input topic="<topic>"',
  "  compose-new-session-demo — TEMPORARY: greets the operator, runs research in the taken-over terminal, then reports the top 3 findings",
  "  pio run compose-new-session-demo",
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
  // Post-capability tail: the `--input k=v` pair scan — the ONE grammar three
  // consumers share (host parse here, renderer emission, in-namespace entry
  // parse). ZERO transform: split on the FIRST `=`, no trimming anywhere, the
  // value is the ENTIRE remainder (may be EMPTY, may hold further `=`). The
  // flag token consumes the NEXT token AS-IS as the pair candidate BEFORE any
  // dash classification — so a glued `--input=k=v` never matches the flag
  // token and degrades to the unknown-option arm below, deterministically in
  // every consumer. First violation wins (fail-fast).
  const inputs: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--input") {
      const pair = rest[i + 1];
      if (pair === undefined) {
        return { kind: "error", message: MALFORMED_INPUT_PAIR("--input") };
      }
      i++; // consume the pair candidate (it gets NO dash classification)
      const eq = pair.indexOf("=");
      const key = eq <= 0 ? "" : pair.slice(0, eq);
      if (eq < 0 || key.length === 0) {
        return { kind: "error", message: MALFORMED_INPUT_PAIR(pair) };
      }
      if (Object.hasOwn(inputs, key)) {
        return { kind: "error", message: DUPLICATE_INPUT_KEY(key) };
      }
      inputs[key] = pair.slice(eq + 1); // whole remainder (EMPTY allowed)
      continue;
    }
    if (startsWithDash(token)) {
      return { kind: "error", message: UNKNOWN_OPTION(token) };
    }
    return { kind: "error", message: UNEXPECTED_ARGUMENT(token) };
  }
  return { kind: "run", capability: second, inputs };
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
        // EVERY name delegates onward through ONE lazy import over the run
        // path — see the header note on lazy loading. It must export
        // runCapability(name, io?, seams?, inputs?): Promise<number> (the
        // exit code).
        let runPath: {
          runCapability(
            capabilityName: string,
            io?: { stderr(line: string): void },
            seams?: unknown,
            inputs?: Record<string, string>,
          ): Promise<number>;
        };
        try {
          runPath = await import("./sandbox/run.ts");
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          out.stderr(`pio: failed to load built-in '${name}': ${detail}`);
          return 1;
        }
        // Every name delegates onward: the run path's loader-based gate
        // owns admission, and its refusal line reaches the user through
        // the same IO sink. The parsed inputs record rides the additive
        // fourth slot ALWAYS (four-arg uniformity — an empty map when no
        // pairs were given; explicit `undefined` in the seams slot).
        return await runPath.runCapability(name, out, undefined, parsed.inputs);
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
