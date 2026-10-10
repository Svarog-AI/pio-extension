import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { CapabilityParams } from "../capability/base.ts";
import {
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { classifySpec, validateInputs } from "../capability/contract.ts";
import {
  ContractViolationError,
  MissingVariableError,
  PhaseInterruptionError,
} from "../capability/errors.ts";
import type {
  CatalogOutcome,
  ResolvedCapability,
} from "../capability/loader.ts";
import { listCapabilities, resolveCapability } from "../capability/loader.ts";
import type { PioSession } from "../capability/pio-session.ts";
import type { CapabilityResult } from "../capability/status.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";

export const ADHOC_NAME = "adhoc";
export const DISPATCH_REQUEST_VAR = "dispatch_request";
export const ADHOC_BURST_MAX_RUNS = 30;

/** Sole owner of these bytes; the loader suite replica names this export. */
export const DESCRIPTION =
  "Describe what you need in plain language and it matches your request against the registered built-ins, runs the chosen capability right here in this conversation, and reports the result - staying available for follow-ups until you exit.";

const CATALOG_HEADER = "Available capabilities:";

function renderCatalogListing(outcomes: readonly CatalogOutcome[]): string {
  const lines: string[] = [CATALOG_HEADER];
  for (const outcome of outcomes) {
    if (outcome.ok) {
      lines.push(
        `- ${outcome.name}: ${outcome.description ?? "(no description)"}`,
      );
      if (outcome.inputs.length > 0) {
        lines.push(
          `  inputs: ${outcome.inputs.map((spec) => spec.name).join(", ")}`,
        );
      }
    } else {
      lines.push(`- ${outcome.name}: unavailable (${outcome.refusal})`);
    }
  }
  return lines.join("\n");
}

const GATHER_INSTRUCTIONS = `When the conversation has no context yet, open by asking how you can help, then ask targeted follow-up questions until you know what the user wants - use the ask_user tool for anything that is missing, including concrete input values, and stay at it until there is enough context. Never pull up the full list and ask what they want: the list below is reference material for matching, not a menu to hand over. Match the request against the capabilities and their declared inputs: if one capability obviously fits, tell the user which capability you will call, which inputs you will pass, and why - no choice to make; if several could fit, offer only the narrowed shortlist of candidates for the user to pick from; if nothing fits, say so plainly. When you are ready, define the variable '${DISPATCH_REQUEST_VAR}' with the setVar tool, passing the decision as an object value with the keys "name" (the capability name) and "inputs" (a plain object of string values; may be empty), and end your reply right after storing. If there is nothing to dispatch, store nothing and end your turn by asking the operator if there is anything else you can help them with. Don't do anything except what is said here - you are just gathering input.`;

/** THE single gather-instruction composer: settled B8 bytes over the
 * catalog listing. NO teaching channel rides any prompt (owner-directed
 * full removal) - refusals settle in-conversation (schema defects) or ride
 * THE failure report (admission faults). */
function renderGatherInstructions(listing: string): string {
  return [GATHER_INSTRUCTIONS, listing].join("\n\n");
}

const REPORT_TRAILER = `State these facts plainly and briefly in your reply. Do not re-run or dispatch anything yourself, and do not ask the user anything. End your turn right after stating them.`;

const INTERRUPT_DEGRADED_LINE = `Partial outputs could not be verified (state-root derivation fault); any durable files it committed remain under the project workspace.`;

function renderReportInstructions(
  name: string,
  outcome: CapabilityResult,
  calleeContract: Contract,
): string {
  if (outcome.ok) {
    return [
      "Facts for the report:",
      `dispatch '${name}' settled.`,
      `Outputs: ${JSON.stringify(outcome.outputs ?? {})}`,
      REPORT_TRAILER,
    ].join("\n");
  }
  const first = outcome.errors?.[0];
  const type = first?.type ?? "UnknownError";
  if (first?.type !== "PhaseInterruptionError") {
    const lines: string[] = [
      "Facts for the report:",
      `dispatch '${name}' failed (${type}).`,
    ];
    if (first?.message !== undefined) {
      lines.push(first.message);
    }
    lines.push(REPORT_TRAILER);
    return lines.join("\n");
  }
  const lines: string[] = [
    "Facts for the report:",
    `dispatch '${name}' was cancelled by the operator while it ran; its run settles as interrupted.`,
    "Any durable outputs it committed before the interruption remain readable under the project workspace.",
  ];
  try {
    const placement = join(
      deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
      "projects",
      deriveProjectKey(process.cwd()),
    );
    const survivors: string[] = [];
    for (const spec of calleeContract.outputs) {
      const resolved = classifySpec(spec, {});
      if (resolved.mode !== "file") {
        continue; // static-file slots only
      }
      const absolute = join(placement, resolved.path);
      if (!existsSync(absolute)) {
        continue;
      }
      survivors.push(`  - ${spec.name}: ${absolute}`);
    }
    if (survivors.length > 0) {
      lines.push("- Surviving declared partial outputs:", ...survivors);
    } else {
      lines.push(
        "- No declared partial outputs were found at their declared locations.",
      );
    }
  } catch {
    lines.push(INTERRUPT_DEGRADED_LINE);
  }
  lines.push(REPORT_TRAILER);
  return lines.join("\n");
}

/** THE admission-failure composer (SOLE OWNER of these bytes): the
 * owner-directed full-removal narrative - an unadmitted pick neither
 * re-teaches nor re-gathers silently; it is NARRATED through the report
 * phase and the sit re-arms on the plain baseline. Pure ASCII. */
function renderAdmissionFailureInstructions(
  name: string,
  refusal: string,
): string {
  return [
    "Facts for the report:",
    `The gathered decision names '${name}' but the program side did not admit it: ${refusal}`,
    "No capability was run.",
    REPORT_TRAILER,
  ].join("\n");
}

const REFUSAL_RECURSION_LINE =
  "adhoc dispatch refused: adhoc cannot dispatch itself (the dispatcher cannot dispatch itself)";

interface DispatchDecision {
  readonly name: string;
  readonly inputs: Record<string, string>;
}

/** Shared structural predicate: the schema base AND the narrowing helper
 * both trust it, so the funnel-admitted value and the program-read value
 * agree on what a plain object IS. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Plain-object map whose EVERY value is a string; an ABSENT inputs key is
 * judged by the caller, never here (decode-parity tolerance). */
function areStringEntries(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}

/** THE authored request shape check: EXACTLY plain objects, non-empty
 * string name, absent-or-all-string inputs. Pure predicates - the parse
 * output IS the input value (deep equality, no transform, no undefined
 * pathology). Foreign keys are PRESERVED in the stored object (recorded
 * conformance delta: the retired decoder reconstructed two-key objects).
 * Authoring messages are the contract - zero native-message drift. */
const REQUEST_SCHEMA = z
  .custom<Record<string, unknown>>(isPlainObject, {
    message: "the stored dispatch request is not a plain object",
  })
  .superRefine((decision, ctx) => {
    if (typeof decision.name !== "string" || decision.name.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "the stored dispatch request has no non-empty capability name",
      });
    }
    if (
      Object.hasOwn(decision, "inputs") &&
      !areStringEntries(decision.inputs)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["inputs"],
        message:
          "the stored dispatch request inputs must be a plain object of string values",
      });
    }
  });

/** Structural narrowing mirroring schema conformance (plain object,
 * non-empty string name, absent-or-all-string inputs) - the SOLE gate
 * between the untyped-safe read and the typed consumption. */
function isDispatchDecision(value: unknown): value is DispatchDecision {
  if (!isPlainObject(value)) {
    return false;
  }
  const name = value.name;
  if (typeof name !== "string" || name.length === 0) {
    return false;
  }
  if (Object.hasOwn(value, "inputs") && !areStringEntries(value.inputs)) {
    return false;
  }
  return true;
}

interface ValidatedDecision {
  readonly resolution: ResolvedCapability;
  readonly decision: DispatchDecision;
}

type AdmissionOutcome =
  | { ok: true; decision: ValidatedDecision }
  | { ok: false; refusal: string };

/** THE program-side adjudicator of a settled stored pick (main-loop seat,
 * owner-directed full removal): three checks in pinned order - recursion
 * guard, existence (loader table authority), inputs conformance against
 * the RESOLVED callee contract (per-callee specs - the shared static schema
 * can only assert structure). Byte-behavior-unchanged from the retired
 * between-turn gate; the refusal voice now feeds the failure report
 * instead of a teaching burst. */
async function admitDecision(
  decision: DispatchDecision,
): Promise<AdmissionOutcome> {
  // Roles retained byte-behavior-unchanged, same order: recursion guard,
  // existence check, inputs conformance.
  if (decision.name === ADHOC_NAME) {
    return { ok: false, refusal: REFUSAL_RECURSION_LINE };
  }
  const resolution = await resolveCapability(decision.name);
  if (!resolution.ok) {
    return { ok: false, refusal: resolution.refusal };
  }
  // An ABSENT inputs key degrades to the empty map (schema-tolerated;
  // validator-reached - decode parity over the legacy defaulting).
  const inputs = decision.inputs ?? {};
  try {
    validateInputs(resolution.capability.contract, inputs);
  } catch (error) {
    if (!(error instanceof ContractViolationError)) {
      throw error;
    }
    return { ok: false, refusal: error.violations.join("\n") };
  }
  return {
    ok: true,
    decision: {
      resolution: resolution.capability,
      decision: { name: decision.name, inputs },
    },
  };
}

export default class AdhocCapability extends PioCapability {
  readonly contract: Contract = {
    name: ADHOC_NAME,
    version: "0.1.0",
    inputs: [],
    outputs: [],
    writes: [],
  };

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    void inputs;
    const session = this.s;
    if (session === undefined) {
      throw new Error(
        "no session available: adhoc requires in-process placement",
      );
    }
    const listing = renderCatalogListing(await listCapabilities());
    // SINGLE UNSEEDED typed lane (owner-directed full removal): the request
    // lane carries the authored object schema (displays its label); the
    // retired answer lane is gone. The lane is naturally absent on a fresh
    // session - the round-top clear inside determineDecision is the sole
    // erasure site and re-establishes absence at every round head (incl.
    // repeat-invocation residue).
    session.vars.declare(DISPATCH_REQUEST_VAR, {
      label: "dispatch decision",
      schema: REQUEST_SCHEMA,
    });
    for (;;) {
      try {
        const pick = await this.determineDecision(session, listing);
        const admitted = await admitDecision(pick);
        if (!admitted.ok) {
          // ADMISSION FAILURE (main-loop seat): the refused pick is
          // narrated THROUGH the report phase - no teaching burst, no
          // silent re-gather; the following outer pass re-arms the plain
          // baseline where the operator steers in-conversation.
          await this.execute_phase("report", {
            instructions: renderAdmissionFailureInstructions(
              pick.name,
              admitted.refusal,
            ),
            min: 1,
          });
          continue;
        }
        const decision = admitted.decision;
        // Session-absent construction: the callee's own base dispatch hops
        // the terminal-takeover frame on the same mounted TUI.
        const callee = new decision.resolution.ctor({});
        const outcome = await callee.run(decision.decision.inputs);
        await this.execute_phase("report", {
          instructions: renderReportInstructions(
            decision.decision.name,
            outcome,
            decision.resolution.contract,
          ),
          min: 1,
        });
        // DELIBERATE WINDOW: between admission and the next round-top
        // clear the lane carries the consumed pick across the hosted run
        // and the report; model writes to the lane are refused throughout
        // (those phases list no variables) and the program reads nothing
        // there.
      } catch (error) {
        if (error instanceof PhaseInterruptionError) {
          // An aborted settling run may have left partial lane stores -
          // the next round-top clear disarms them. An interrupt always
          // beats a gate verdict or a report settlement.
          continue;
        }
        throw error;
      }
    }
  }

  /** THE interaction transaction: settle ONE stored pick via the gather
   * burst. Returns the raw request type (owner-directed: adjudication lives
   * in the main loop, NOT here). Silent bursts pay the ruled four-prompt
   * physics into the dedicated verdict class; the round-top clear is the
   * sole erasure site. */
  private async determineDecision(
    session: PioSession,
    listing: string,
  ): Promise<DispatchDecision> {
    for (;;) {
      // ROUND-TOP CLEAR - the SOLE erasure site: every re-entry passes
      // through here, so ONE chokepoint covers every residue class
      // (stale picks, partial abort stores, repeat-invocation leftovers);
      // clearing a declared-but-absent name is an idempotent no-op.
      session.vars.clear(DISPATCH_REQUEST_VAR);
      try {
        await this.execute_phase("gather", {
          instructions: renderGatherInstructions(listing),
          vars: [DISPATCH_REQUEST_VAR],
          min: 1,
          max: ADHOC_BURST_MAX_RUNS,
        });
      } catch (error) {
        if (!(error instanceof MissingVariableError)) {
          throw error;
        }
        // A silent round: nothing was stored - the fresh burst renders the
        // plain baseline (in-band interpretation of the gate verdict).
        continue;
      }
      const raw = session.vars.get(DISPATCH_REQUEST_VAR);
      if (!isDispatchDecision(raw)) {
        // Defensive-unreachable: the settle-time presence gate guarantees
        // a present lane after a settled gather AND the funnel schema
        // guarantees conformance; the narrowing is the zero-cast type
        // boundary only. Bare continue, no crash.
        continue;
      }
      return raw;
    }
  }
}
