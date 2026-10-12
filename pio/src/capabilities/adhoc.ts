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
import type { CapabilityResult } from "../capability/status.ts";
import type { VarCell } from "../capability/var-cell.ts";
import { declareVar } from "../capability/var-cell.ts";
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
 * the context-lane fact post immediately ahead of the uniform report
 * (admission faults). */
function renderGatherInstructions(listing: string): string {
  return [GATHER_INSTRUCTIONS, listing].join("\n\n");
}

const REPORT_TRAILER = `State these facts plainly and briefly in your reply. Do not re-run or dispatch anything yourself, and do not ask the user anything. End your turn right after stating them.`;

/** THE single uniform report instruction (SOLE OWNER of these bytes):
 * BYTE-IDENTICAL across ALL outcomes - the fixed opener points at the
 * outcome facts just posted to the context lane (the custom message
 * preceding this prompt in transcript order) and the trailer discipline
 * trails VERBATIM. Pure ASCII. */
const UNIFORM_REPORT_INSTRUCTION = `The outcome facts were posted to your context lane immediately before this phase - the custom message that precedes this prompt in the conversation.\n${REPORT_TRAILER}`;

const INTERRUPT_DEGRADED_LINE = `Partial outputs could not be verified (state-root derivation fault); any durable files it committed remain under the project workspace.`;

/** THE dispatched-outcome fact renderer (SOLE OWNER of these fact lines):
 * facts ONLY - no heading, no trailer; the carriage moved to the
 * context-lane post ahead of the uniform report. The three internal
 * branches retain the retired composer's computation verbatim. */
function renderDispatchOutcomeFacts(
  name: string,
  outcome: CapabilityResult,
  calleeContract: Contract,
): string {
  if (outcome.ok) {
    return [
      `dispatch '${name}' settled.`,
      `Outputs: ${JSON.stringify(outcome.outputs ?? {})}`,
    ].join("\n");
  }
  const first = outcome.errors?.[0];
  const type = first?.type ?? "UnknownError";
  if (first?.type !== "PhaseInterruptionError") {
    const lines: string[] = [`dispatch '${name}' failed (${type}).`];
    if (first?.message !== undefined) {
      lines.push(first.message);
    }
    return lines.join("\n");
  }
  const lines: string[] = [
    `dispatch '${name}' was cancelled by the operator while it ran; its run settles as interrupted.`,
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
  return lines.join("\n");
}

/** THE admission-refusal fact renderer (SOLE OWNER of these fact lines):
 * the refusal line plus the runner line, byte-for-byte as carried by the
 * retired composer - no heading, no trailer. Facts only. */
function renderAdmissionRefusalFacts(name: string, refusal: string): string {
  return [
    `The gathered decision names '${name}' but the program side did not admit it: ${refusal}`,
    "No capability was run.",
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
export const REQUEST_SCHEMA = z
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
 * between-turn gate; the refusal voice now rides the context-lane fact
 * post ahead of the uniform report instead of a teaching burst. */
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
    // THE single request lane: minted FRESH PER SITTING - stale residue is
    // unrepresentable by construction; the round-top reset inside
    // determineDecision stays the sole erasure site across the sitting's
    // repeated listings.
    const requestCell = declareVar(DISPATCH_REQUEST_VAR, {
      label: "dispatch decision",
      schema: REQUEST_SCHEMA,
    });
    const listing = renderCatalogListing(await listCapabilities());
    for (;;) {
      try {
        const pick = await this.determineDecision(listing, requestCell);
        const admission = await admitDecision(pick);
        let facts: string; // THE outcome-fact decision (only per-outcome fork)
        if (!admission.ok) {
          // ADMISSION FAILURE (main-loop seat): the refused pick's facts
          // post to the context lane immediately ahead of the uniform
          // report - no teaching burst, no silent re-gather; the following
          // outer pass re-arms the plain baseline where the operator steers
          // in-conversation.
          facts = renderAdmissionRefusalFacts(pick.name, admission.refusal);
        } else {
          const decision = admission.decision;
          // Session-absent construction: the callee's own base dispatch
          // hops the terminal-takeover frame on the same mounted TUI.
          const callee = new decision.resolution.ctor({});
          const outcome = await callee.run(decision.decision.inputs);
          facts = renderDispatchOutcomeFacts(
            decision.decision.name,
            outcome,
            decision.resolution.contract,
          );
        }
        // THE single convergence tail (ALL outcomes): ONE context-lane
        // post (no options bag - the engine's flowed-through visible
        // default), THEN ONE uniform report.
        await this.send_context_message(facts);
        await this.execute_phase("report", {
          instructions: UNIFORM_REPORT_INSTRUCTION,
          min: 1,
        });
        // DELIBERATE WINDOW: between admission and the next round-top
        // reset the lane carries the consumed pick across the hosted run
        // and the report; model writes to the lane are refused throughout
        // (those phases bind nothing - no write grant anywhere in those
        // windows settles the universal line) and the program reads
        // nothing there.
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
    listing: string,
    requestCell: VarCell,
  ): Promise<DispatchDecision> {
    for (;;) {
      // ROUND-TOP RESET - the SOLE erasure site: every re-entry passes
      // through here, so ONE chokepoint covers every residue class
      // (stale picks, partial abort stores, repeat-invocation leftovers);
      // resetting a set-but-absent cell is a silent no-op (idempotent over
      // absence), and post-reset writes re-enter the same settle path.
      requestCell.reset();
      try {
        await this.execute_phase("gather", {
          instructions: renderGatherInstructions(listing),
          vars: [{ cell: requestCell, write: true }],
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
      const raw = requestCell.read();
      if (!isDispatchDecision(raw)) {
        // Defensive-unreachable: the settle-time presence gate guarantees
        // a present cell after a settled gather AND the funnel schema
        // guarantees conformance; the narrowing is the zero-cast type
        // boundary only. Bare continue, no crash.
        continue;
      }
      return raw;
    }
  }
}
