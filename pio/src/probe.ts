import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { InteractiveMode } from "@earendil-works/pi-coding-agent";
import { createProbeSession } from "./session.ts";

// Built-in probe target: one fixed opening line into pi's own InteractiveMode
// TUI over inherited stdio. Exists solely to exercise the session-setup path
// end-to-end (R1 durable asset); flat top-level module, deliberately not a
// capability.

/** Fixed self-identifying opening line sent as the session's initialMessage. FROZEN (A4). */
export const PROBE_OPENING_TEXT =
  "pio probe — diagnostic session. This proves the setup only; everything below behaves exactly like a normal pi session. Ctrl-C quits cleanly.";

/** Structural TTY stream view — injectable, process streams satisfy it. */
export interface TtyStream {
  readonly isTTY?: boolean;
}

/** True iff BOTH streams are TTYs (interactive-capable). Pure, synchronous. */
export function isInteractiveTty(input: TtyStream, output: TtyStream): boolean {
  return input.isTTY === true && output.isTTY === true;
}

/** Injectable stderr sink (CliIO lineage — Step 2 D10 principle). Lines arrive WITHOUT trailing newline. */
export interface ProbeIO {
  stderr(line: string): void;
}

export const TTY_REFUSAL_LINE =
  "pio: 'probe' needs an interactive terminal (TTY); headless mode lands in R4";

/** Builtin entry dispatched by cli.ts. Resolves THE process exit code (0 clean / 1 failure). Never rejects. */
export async function run(io?: ProbeIO): Promise<number> {
  const sink: ProbeIO = io ?? {
    stderr: (line) => process.stderr.write(`${line}\n`),
  };

  // Preflight BEFORE any construction: a headless invocation must fail fast
  // with exactly one line and exit 1 — no SDK, no session, no TUI.
  if (!isInteractiveTty(process.stdin, process.stdout)) {
    sink.stderr(TTY_REFUSAL_LINE);
    return 1;
  }

  let runtime: AgentSessionRuntime | null = null;
  let im: InteractiveMode | null = null;
  try {
    runtime = await createProbeSession(process.cwd());
    im = new InteractiveMode(runtime, { initialMessage: PROBE_OPENING_TEXT });
    await im.run();
  } catch (cause) {
    // Best-effort teardown in native shutdown order (stop before dispose);
    // secondary faults are swallowed so the primary cause always reaches stderr.
    if (im !== null) {
      try {
        im.stop();
      } catch {
        // Partially initialized instance; stop() is internally gated — swallow.
      }
    }
    if (runtime !== null) {
      try {
        await runtime.dispose();
      } catch {
        // Same swallowing rule — the primary cause must survive to stderr.
      }
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    sink.stderr(`pio: probe failed: ${detail}`);
    return 1;
  }

  // Defensive success path: unreachable on 0.85.1 because the native quit path
  // (double Ctrl-C / Ctrl-D / /quit) stops the TUI, disposes the runtime, and
  // process.exit(0)s before im.run() resolves (P4(b)). Retained as upstream-drift
  // insurance; keep the stop-before-dispose ordering.
  if (im !== null) {
    im.stop();
  }
  if (runtime !== null) {
    await runtime.dispose();
  }
  return 0;
}
