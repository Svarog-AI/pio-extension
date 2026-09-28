// Base authoring unit for pio capabilities. Subclasses assign a `contract`
// and implement `call()` — the authored body. Everything about executing a
// capability funnels through the concrete, base-provided `run()`: pre-spawn
// input validation against the declared contract, then the body, then the
// observed outcome assembled into the result payload.
//
// Returning from `call()` IS completion: there is no completion method.
// This module observes and reports what the run did; it never emits or
// writes status records — the process boundary completes the terminal
// record from the returned payload.
//
// Session placement binds at construction: a provided session runs the
// capability in-process (phase execution available); an ABSENT session
// routes the run through the row-2 terminal-takeover frame — composed-
// frame engagement that takes the engaged entry's live terminal under a
// fresh session hosted on the caller's runtime (lazy module import,
// evaluated ONLY on that path; the live result payload at the await is the
// PRIMARY channel, the per-frame status record the SECONDARY). After a
// completed hop the slot RETAINS the adopted child host, so a subsequent
// run() takes the session-present path against that host (accepted edge —
// engagements construct fresh instances). The `tty` reserved field freezes
// HERE as the interactive sequential-frame meaning (takes and returns the
// terminal); `timeoutMs` stays reserved-unenforced — the wall-clock cap is
// deferred (Step 6 tracks it).
//
// State-root channel (in-bubble): the bubble env quartet gives exactly one
// state-root channel — PI_CODING_AGENT_DIR, assigned UNCONDITIONALLY by the
// renderer to `<root>/.pi/agent` (PIO_STATE_DIR does NOT propagate in). The
// inversion below recovers `<root>` from it; loud typed failure, NO silent
// fallback, ever. Every capability addressing the durable project slot
// needs this channel, which is why it rides with the authoring base (the
// Step-6 owner placement ruling — a capability-layer concern, not a sandbox
// leaf).

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
   * The sole composition seam — never overridden. Validates the caller's
   * value object against the contract BEFORE the placement branch (a
   * violation settles the capture with ZERO hop side effects), then either
   * hops the row-2 frame (session absent — the dynamic literal import is
   * this module's only edge to the takeover mechanics) or executes the body
   * in place (session present, byte-identical behavior). The single
   * catch-all spans both placements: one thrown value wins per invocation,
   * so this method never rejects.
   */
  async run(inputs?: Record<string, unknown>): Promise<CapabilityResult> {
    const values = inputs ?? {};
    try {
      validateInputs(this.contract, values);
      if (this.s === undefined) {
        // THE row-2 placement branch: one composed frame per run; the body
        // closure performs the slot adoption (the takeover module never
        // assigns the slot itself).
        const takeover = await import("./terminal-takeover.ts");
        return await takeover.materializeFrame({
          contract: {
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
