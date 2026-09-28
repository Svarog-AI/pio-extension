// Base authoring unit for pio capabilities. Subclasses assign `contract`
// and implement `call()`; execution funnels through the base-provided
// `run()` (pre-spawn validation, then the body). Returning from `call()`
// IS completion; this module never emits or writes status records — the
// process boundary does.
//
// Session placement binds at construction: a provided session runs in
// process; an ABSENT session hops the row-2 terminal-takeover frame under
// a fresh child host (lazy import, evaluated on that path only; the await
// payload is the primary channel, the per-frame record the secondary).
// After a completed hop the slot retains the adopted host, so the next
// run() takes the session-present path (accepted edge — engagements
// construct fresh instances). `tty` freezes as the interactive
// sequential-frame meaning (takes and returns the terminal); `timeoutMs`
// stays reserved-unenforced (wall-clock cap deferred to Step 6).
//
// State-root channel: the renderer assigns PI_CODING_AGENT_DIR=
// `<root>/.pi/agent` unconditionally; the inversion below recovers `<root>`
// with loud typed failure and no silent fallback.

import { isAbsolute, resolve } from "node:path";
import type { Contract } from "./contract.ts";
import { validateInputs } from "./contract.ts";
import type { PhaseOptions, PhaseResult, PioSession } from "./pio-session.ts";
import type { CapabilityResult } from "./status.ts";
import { captureError } from "./status.ts";

/** Constructor parameters for one capability engagement. */
export interface CapabilityParams {
  /** Present = same placement (in-process); absent = cross-process marker. */
  session?: PioSession;
  /** Reserved — binds on the cross-process path, unenforced here. */
  tty?: boolean;
  /** Reserved — binds on the cross-process path, unenforced here. */
  timeoutMs?: number;
}

/**
 * Authoring base for pio capabilities. Authors supply the identity/IO
 * vocabulary through `contract` and the behavior through `call()`; the
 * base owns the composition seam (`run`) and the in-process phase-execution
 * wrapper around the session's budgeted engine.
 */
export abstract class PioCapability {
  /** Authored identity plus IO vocabulary — supplied by every concrete subclass. */
  declare readonly contract: Contract;
  /** Placement handle: absent marks row-2 frame engagement (internally
   * adoptable — the base assigns the child host at the hop's body stage;
   * authors never touch the slot). */
  protected s: PioSession | undefined;
  /** Reserved for the cross-process path; retained unenforced here. */
  readonly tty: boolean | undefined;
  /** Reserved for the cross-process path; retained unenforced here. */
  readonly timeoutMs: number | undefined;

  constructor(params: CapabilityParams) {
    this.s = params.session;
    this.tty = params.tty;
    this.timeoutMs = params.timeoutMs;
  }

  /** The authored capability body — the ONLY thing authors implement. */
  abstract call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /**
   * The sole composition seam — never overridden. Validates inputs before
   * the placement branch (a violation settles the capture with zero hop
   * side effects), then hops the row-2 frame (session absent) or runs the
   * body in place (session present). The catch-all spans both placements:
   * this method never rejects.
   */
  async run(inputs?: Record<string, unknown>): Promise<CapabilityResult> {
    const values = inputs ?? {};
    try {
      validateInputs(this.contract, values);
      if (this.s === undefined) {
        // Row-2 frame: the body closure adopts the child host into the
        // slot (the takeover module never assigns the slot itself).
        const takeover = await import("./terminal-takeover.ts");
        return await takeover.materializeFrame({
          capability: {
            name: this.contract.name,
            version: this.contract.version,
          },
          body: (childFrame: PioSession): Promise<Record<string, unknown>> => {
            this.s = childFrame;
            return this.call(values);
          },
        });
      }
      const outputs = await this.call(values);
      return { ok: true, outputs };
    } catch (error) {
      return { ok: false, errors: [captureError(error)] };
    }
  }

  /**
   * In-process phase execution over the session's budgeted engine.
   * Throws a plain Error while no session is present; delegates the option
   * bag verbatim to the session's own composition.
   */
  async execute_phase(id: string, opts?: PhaseOptions): Promise<PhaseResult> {
    if (this.s === undefined) {
      throw new Error(
        "no session available: execute_phase requires in-process placement",
      );
    }
    return this.s.execute_phase(id, opts);
  }
}

/** Typed refusal for an absent or malformed PI_CODING_AGENT_DIR channel
 * (capability-generic — every capability addressing the durable project slot
 * throws this; named for its layer, not any single capability). */
export class CapabilityEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityEnvError";
  }
}

/**
 * Invert the renderer's unconditional `PI_CODING_AGENT_DIR=<root>/.pi/agent`
 * assignment to recover the state root. Pure; loud typed failure — NO silent
 * fallback, ever.
 */
export function deriveStateRootFromAgentDir(
  agentDir: string | undefined,
): string {
  const trimmed = agentDir?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new CapabilityEnvError(
      // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
      "capability: PI_CODING_AGENT_DIR is unset \u2014 cannot derive the state root",
    );
  }
  if (!isAbsolute(trimmed)) {
    throw new CapabilityEnvError(
      `capability: PI_CODING_AGENT_DIR is malformed ('${trimmed}') \u2014 cannot derive the state root`,
    );
  }
  return resolve(trimmed, "..", "..");
}
