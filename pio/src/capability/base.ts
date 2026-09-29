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
// stays reserved-unenforced (wall-clock cap unbound here).
//
// State-root channel: the renderer assigns PI_CODING_AGENT_DIR=
// `<root>/.pi/agent` unconditionally; the inversion below recovers `<root>`
// with loud typed failure and no silent fallback. The same channels feed
// the SETTLE SEAM: file-mode contract outputs settle to this bubble's
// ABSOLUTE placement once at the base's success settlement (both
// placements); capabilities emit slot-relative tokens and consumers take
// settled values verbatim — no per-capability or consumer-side path math.
//
// Span stamps: each run() opens its capability span with EXACTLY ONE
// no-turn durable custom-message header (seam: PioSession.markCapability,
// label = this capability's OWN contract.name) emitted at span start on
// whichever branch holds the span — the session-present branch strictly
// AFTER validateInputs (a violating run settles with ZERO side effects)
// and the row-2 hop body immediately after adopting the child host (the
// earliest moment a handle and the span coexist there). Awaited BEFORE the
// body can act, the settled entry persists ABOVE the span's first phase
// line; span RETURN is implicit (section-header scoping). NO per-instance
// stamp state exists — one call site per branch per run is the entire
// enforcement (no flag, no counter, nothing to disarm), and the phase path
// (execute_phase) deliberately has NO awareness of the channel.

import { isAbsolute, join, resolve } from "node:path";
import { deriveProjectKey } from "../sandbox/layout.ts";
import type { Contract, ContractSpec } from "./contract.ts";
import { classifySpec, validateInputs } from "./contract.ts";
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
   * body in place (session present). Each branch stamps its OWN span
   * header exactly ONCE at span start — post-validation/pre-body in place;
   * post-adoption/pre-body on the hop — before any phase prompt of the
   * span can issue (the awaited seam call precedes the body wholesale).
   * Success settles ONCE at this seam:
   * file-mode output slots transform to the bubble's absolute placement —
   * in-place directly, and on the hop path inside the body so the single
   * payload serves the child record and the caller's await identically.
   * A conversion fault escapes into THIS capability's catch-all after the
   * terminal ownership is restored on every reachable path. The catch-all
   * spans both placements: this method never rejects.
   */
  async run(inputs?: Record<string, unknown>): Promise<CapabilityResult> {
    const values = inputs ?? {};
    // THE settle seam over the shipped state-root/project-key channels;
    // the derivation defers to the provider so untouched results never pay
    // for it (value-only contracts stay env-immune by construction).
    const settle = (outputs: Record<string, unknown>) =>
      settleFileModeOutputs(this.contract.outputs, outputs, () =>
        join(
          deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
          "projects",
          deriveProjectKey(process.cwd()),
        ),
      );
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
          body: async (
            childFrame: PioSession,
          ): Promise<Record<string, unknown>> => {
            this.s = childFrame;
            // THE span stamp (row-2 hop branch): on the JUST-ADOPTED handle
            // — at run() entry this instance held no handle, so adoption
            // is the earliest moment the stamp can land in the CHILD
            // frame's transcript — strictly before the body, opening the
            // callee's span above its first phase line.
            await this.s.markCapability(this.contract.name);
            return settle(await this.call(values));
          },
        });
      }
      // THE span stamp (session-present branch): strictly post-validation,
      // pre-body — the span opens before ANY phase prompt it may issue.
      await this.s.markCapability(this.contract.name);
      const outputs = await this.call(values);
      return { ok: true, outputs: settle(outputs) };
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
 * Settle FILE-MODE contract output slots to this bubble's ABSOLUTE
 * placement — the single site where "where do my file deliverables live"
 * is answered. Pure over explicit arguments: the `placementProvider`
 * defers the derivation to the CALLER's seam and is invoked LAZILY (memoized
 * per call) only when a file-mode slot actually carries a relative string.
 * Value-mode slots, non-string or missing values, and already-absolute
 * values pass through untouched; the static-file form reports the
 * contract-declared location under the slot name. When nothing transforms,
 * the INPUT record survives by reference.
 */
export function settleFileModeOutputs(
  specs: readonly ContractSpec[],
  outputs: Record<string, unknown>,
  placementProvider: () => string,
): Record<string, unknown> {
  let settled: Record<string, unknown> | undefined;
  let placement: string | undefined;
  for (const spec of specs) {
    // The shipped structural discriminator: only FILE-MODE slots settle
    // placement — value slots are untouched by construction.
    if (!("file" in spec || "paramKey" in spec)) {
      continue;
    }
    const resolved = classifySpec(spec, outputs);
    if (resolved.mode !== "file" || isAbsolute(resolved.path)) {
      continue;
    }
    // ParamKey-sourced tokens live under the paramKey; everything else
    // reports under the slot name (the classifier's own precedence).
    let key = spec.name;
    const paramKey = spec.paramKey;
    if (typeof paramKey === "string") {
      const candidate = outputs[paramKey];
      if (typeof candidate === "string" && candidate.length > 0) {
        key = paramKey;
      }
    }
    if (placement === undefined) {
      placement = placementProvider();
    }
    if (settled === undefined) {
      settled = { ...outputs };
    }
    settled[key] = join(placement, resolved.path);
  }
  return settled ?? outputs;
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
