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
export const DISPATCH_CONFIRM_VAR = "dispatch_confirm";
export const ADHOC_BURST_MAX_RUNS = 30;

/** Sole owner of these bytes; the loader suite replica names this export. */
export const DESCRIPTION =
  "Describe what you need in plain language and it matches your request against the registered built-ins, confirms the pick with you, runs the chosen capability right here in this conversation, and reports the result - staying available for follow-ups until you exit.";

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

function renderGatherInstructions(
  listing: string,
  carriedRefusal: string | undefined,
): string {
  const parts: string[] = [GATHER_INSTRUCTIONS, listing];
  if (carriedRefusal !== undefined) {
    parts.push(carriedRefusal);
  }
  return parts.join("\n\n");
}

const CONFIRM_GRAMMAR = `Confirm this exact decision with the operator using the ask_user tool in ONE single call, offering: Yes / No / free-form custom feedback. Act on the reply exactly:
- YES: store the value true in the variable '${DISPATCH_CONFIRM_VAR}' with the setVar tool, then end your turn immediately.
- NO: store the value false in the variable '${DISPATCH_CONFIRM_VAR}' with the setVar tool, then end your turn.
- CUSTOM FEEDBACK: store the value false in the variable '${DISPATCH_CONFIRM_VAR}' with the setVar tool, whether the feedback would change or kill the request - the flow returns to gathering, where you will hear the operator's requested changes directly; write NO other variable during this round, then end your turn.
Work autonomously; the program side re-validates and runs the confirmed capability between turns.`;

function renderConfirmInstructions(
  capability: ResolvedCapability,
  decision: DispatchDecision,
): string {
  const description = capability.description ?? "(no description)";
  return [
    "The gathering phase determined a validated dispatch decision:",
    `Capability: ${capability.contract.name} - ${description}`,
    `Inputs to pass: ${JSON.stringify(decision.inputs)}`,
    CONFIRM_GRAMMAR,
  ].join("\n");
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

type GateOutcome =
  | { ok: true; decision: ValidatedDecision }
  | { ok: false; refusal: string };

async function gateStoredRequest(
  decision: DispatchDecision,
): Promise<GateOutcome> {
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
    // DUAL UNSEEDED typed lanes: the request lane carries the authored
    // object schema (displays its label), the answer lane rides the
    // built-in boolean type (displays the built-in spelling). Both are
    // naturally absent on a fresh session - the round-top clear inside
    // determineDecision is the sole erasure site and re-establishes
    // absence at every round head (incl. repeat-invocation residue).
    session.vars.declare(DISPATCH_REQUEST_VAR, {
      label: "dispatch decision",
      schema: REQUEST_SCHEMA,
    });
    session.vars.declare(DISPATCH_CONFIRM_VAR, "boolean");
    for (;;) {
      try {
        const decision = await this.determineDecision(session, listing);
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
        // clear the lanes carry the consumed pick + answer across the
        // hosted run and the report; model writes to the lanes are
        // refused throughout (those phases list no variables) and the
        // program reads nothing there.
      } catch (error) {
        if (error instanceof PhaseInterruptionError) {
          // An aborted settling run may have left partial lane stores -
          // the next round-top clear disarms them. The gate-verdict
          // catches sit strictly INNER to this handler, so an abort
          // always settles first.
          continue;
        }
        throw error;
      }
    }
  }

  private async determineDecision(
    session: PioSession,
    listing: string,
  ): Promise<ValidatedDecision> {
    let carriedRefusal: string | undefined;
    for (;;) {
      // ROUND-TOP CLEAR - the SOLE erasure site: every re-entry passes
      // through here, so ONE chokepoint covers every residue class
      // (stale picks, partial abort stores, repeat-invocation leftovers);
      // clearing a declared-but-absent name is an idempotent no-op.
      session.vars.clear(DISPATCH_REQUEST_VAR);
      session.vars.clear(DISPATCH_CONFIRM_VAR);
      try {
        await this.execute_phase("gather", {
          instructions: renderGatherInstructions(listing, carriedRefusal),
          vars: [DISPATCH_REQUEST_VAR],
          min: 1,
          max: ADHOC_BURST_MAX_RUNS,
        });
      } catch (error) {
        if (!(error instanceof MissingVariableError)) {
          throw error;
        }
        // A silent round: nothing was stored, so the fresh burst renders
        // the plain baseline - no fact attached (the model saw the failed
        // exchange in context).
        carriedRefusal = undefined;
        continue;
      }
      carriedRefusal = undefined;
      const raw = session.vars.get(DISPATCH_REQUEST_VAR);
      if (!isDispatchDecision(raw)) {
        // Defensive-unreachable: the settle-time presence gate guarantees
        // a present lane after a settled gather; bare continue, no crash.
        continue;
      }
      const gate = await gateStoredRequest(raw);
      if (gate.ok === false) {
        carriedRefusal = gate.refusal;
        continue; // the offending pick is disarmed by the next round-top clear
      }
      try {
        await this.execute_phase("confirm", {
          instructions: renderConfirmInstructions(
            gate.decision.resolution,
            gate.decision.decision,
          ),
          vars: [DISPATCH_CONFIRM_VAR],
          min: 1,
        });
      } catch (error) {
        if (!(error instanceof MissingVariableError)) {
          throw error;
        }
        // Silence at confirm is no longer an answer: the model lived the
        // failed round in-context and the token grammar re-sends on every
        // confirm prompt, so nothing needs teaching.
        carriedRefusal = undefined;
        continue;
      }
      // A settled confirm guarantees a PRESENT answer value (the gate's
      // own judgment), so the typed read back cannot fault here.
      const answer = session.vars.get(DISPATCH_CONFIRM_VAR, "boolean");
      if (answer !== true) {
        // Decline or change-request: both discard the stored pick (the
        // round-top clear disarms it) and the operator's words already
        // reached the model in-conversation - no fact rides.
        continue;
      }
      const readback = session.vars.get(DISPATCH_REQUEST_VAR);
      if (!isDispatchDecision(readback)) {
        // Defensive-unreachable: the answer-lane-only permission listing
        // means the request lane cannot change mid-confirm.
        continue;
      }
      const verified = await gateStoredRequest(readback);
      if (verified.ok === false) {
        carriedRefusal = verified.refusal;
        continue;
      }
      return verified.decision;
    }
  }
}
