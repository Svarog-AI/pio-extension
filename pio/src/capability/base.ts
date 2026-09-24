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
// Session placement is declared at construction: a provided session runs
// the capability in-process (phase execution available); an absent session
// marks cross-process placement, which is declared here but never spawned
// against. The reserved wall-clock fields bind on that path and stay
// unenforced in this module, mirroring the contract's declared-without-
// enforcement write-scope slots.

import type { Contract } from "./contract.ts";
import { validateInputs } from "./contract.ts";
import type { PhaseOptions, PhaseResult, PioSession } from "./pio-session.ts";
import { renderPhaseMarker } from "./pio-session.ts";
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
  /** Placement handle: absent marks cross-process placement (declared only). */
  protected readonly s: PioSession | undefined;
  /** Reserved for the cross-process path; retained unenforced here. */
  readonly tty: boolean | undefined;
  /** Reserved for the cross-process path; retained unenforced here. */
  readonly timeoutMs: number | undefined;
  /** Flips before the first delegated phase; the kickoff stamp fires once per instance lifetime. */
  #kickedOff = false;

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
   * value object against the contract BEFORE the body runs, executes the
   * body, and returns what was observed. The single catch-all spans both
   * steps: one thrown value wins per invocation, so this method never
   * rejects.
   */
  async run(inputs?: Record<string, unknown>): Promise<CapabilityResult> {
    const values = inputs ?? {};
    try {
      validateInputs(this.contract, values);
      const outputs = await this.call(values);
      return { ok: true, outputs };
    } catch (error) {
      return { ok: false, errors: [captureError(error)] };
    }
  }

  /**
   * In-process phase execution over the session's budgeted engine.
   * Throws a plain Error while no session is present; the first-ever
   * delegation carries the capability kickoff line below the phase marker.
   */
  async execute_phase(id: string, opts?: PhaseOptions): Promise<PhaseResult> {
    if (this.s === undefined) {
      throw new Error(
        "no session available: execute_phase requires in-process placement",
      );
    }
    let delegated = opts;
    if (!this.#kickedOff) {
      this.#kickedOff = true;
      // Fresh options object for the injection: the caller's bag is never
      // mutated, and the spread preserves the closed option-bag shape.
      const rest = opts?.instructions ?? "";
      delegated = {
        ...opts,
        instructions:
          renderPhaseMarker(this.contract.name) +
          (rest !== "" ? `\n${rest}` : ""),
      };
    }
    return this.s.execute_phase(id, delegated);
  }
}
