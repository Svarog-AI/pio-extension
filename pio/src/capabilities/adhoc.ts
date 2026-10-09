import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapabilityParams } from "../capability/base.ts";
import {
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { classifySpec, validateInputs } from "../capability/contract.ts";
import {
  ContractViolationError,
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
export const NO_DISPATCH_VALUE = "{}";
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

const GATHER_INSTRUCTIONS = `When the conversation has no context yet, open by asking how you can help, then ask targeted follow-up questions until you know what the user wants - use the ask_user tool for anything that is missing, including concrete input values, and stay at it until there is enough context. Never pull up the full list and ask what they want: the list below is reference material for matching, not a menu to hand over. Match the request against the capabilities and their declared inputs: if one capability obviously fits, tell the user which capability you will call, which inputs you will pass, and why - no choice to make; if several could fit, offer only the narrowed shortlist of candidates for the user to pick from; if nothing fits, say so plainly. When you are ready, define the variable '${DISPATCH_REQUEST_VAR}' with the setVar tool holding EXACTLY the JSON string {"name": "<capability>", "inputs": {...}} (values are plain strings; inputs may be empty), and end your reply right after storing; if nothing applies, leave the variable at ${NO_DISPATCH_VALUE} and end without storing. Don't do anything except what is said here - you are just gathering input.`;

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
- YES: do NOT write the '${DISPATCH_REQUEST_VAR}' variable (leave the stored value intact) and end your turn immediately.
- NO: set '${DISPATCH_REQUEST_VAR}' to the sentinel ${NO_DISPATCH_VALUE} using the setVar tool, then end your turn.
- CUSTOM FEEDBACK: apply it inline - store the AMENDED exact decision JSON with setVar (or reset '${DISPATCH_REQUEST_VAR}' to the sentinel ${NO_DISPATCH_VALUE} when the feedback kills the request), then end your turn.
Work autonomously; the program side re-validates and runs the confirmed capability between turns.`;

function renderConfirmInstructions(
  capability: ResolvedCapability,
  decoded: DecodedDecision,
): string {
  const description = capability.description ?? "(no description)";
  return [
    "The gathering phase determined a validated dispatch decision:",
    `Capability: ${capability.contract.name} - ${description}`,
    `Inputs to pass: ${JSON.stringify(decoded.inputs)}`,
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

type DecodeDefect =
  | "not-valid-json"
  | "not-a-plain-object"
  | "name-not-a-non-empty-string"
  | "inputs-not-all-string-values";

const MALFORMED_DEFECT_LINES: Record<DecodeDefect, string> = {
  "not-valid-json":
    "adhoc dispatch refused: the stored dispatch request is not valid JSON",
  "not-a-plain-object":
    "adhoc dispatch refused: the stored dispatch request is not a plain object",
  "name-not-a-non-empty-string":
    "adhoc dispatch refused: the stored dispatch request has no non-empty capability name",
  "inputs-not-all-string-values":
    "adhoc dispatch refused: the stored dispatch request inputs must be a plain object of string values",
};

const REFUSAL_RECURSION_LINE =
  "adhoc dispatch refused: adhoc cannot dispatch itself (the dispatcher cannot dispatch itself)";

interface DecodedDecision {
  readonly name: string;
  readonly inputs: Record<string, string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function decodeDispatchRequest(
  raw: string,
):
  | { ok: true; decision: DecodedDecision }
  | { ok: false; defect: DecodeDefect } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, defect: "not-valid-json" };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, defect: "not-a-plain-object" };
  }
  const name = parsed.name;
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, defect: "name-not-a-non-empty-string" };
  }
  const inputs: Record<string, string> = {};
  if (Object.hasOwn(parsed, "inputs")) {
    const candidate = parsed.inputs;
    if (!isPlainObject(candidate)) {
      return { ok: false, defect: "inputs-not-all-string-values" };
    }
    for (const [key, value] of Object.entries(candidate)) {
      if (typeof value !== "string") {
        return { ok: false, defect: "inputs-not-all-string-values" };
      }
      inputs[key] = value;
    }
  }
  return { ok: true, decision: { name, inputs } };
}

interface ValidatedDecision {
  readonly resolution: ResolvedCapability;
  readonly decoded: DecodedDecision;
}

type GateOutcome =
  | { ok: true; decision: ValidatedDecision }
  | { ok: false; refusal: string };

async function gateStoredRequest(raw: string): Promise<GateOutcome> {
  const decoded = decodeDispatchRequest(raw);
  if (decoded.ok === false) {
    return { ok: false, refusal: MALFORMED_DEFECT_LINES[decoded.defect] };
  }
  if (decoded.decision.name === ADHOC_NAME) {
    return { ok: false, refusal: REFUSAL_RECURSION_LINE };
  }
  const resolution = await resolveCapability(decoded.decision.name);
  if (!resolution.ok) {
    return { ok: false, refusal: resolution.refusal };
  }
  try {
    validateInputs(resolution.capability.contract, decoded.decision.inputs);
  } catch (error) {
    if (!(error instanceof ContractViolationError)) {
      throw error;
    }
    return { ok: false, refusal: error.violations.join("\n") };
  }
  return {
    ok: true,
    decision: { resolution: resolution.capability, decoded: decoded.decision },
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
    session.vars.declare(DISPATCH_REQUEST_VAR, "string");
    session.vars.set(DISPATCH_REQUEST_VAR, NO_DISPATCH_VALUE);
    for (;;) {
      try {
        const decision = await this.determineDecision(session, listing);
        // Session-absent construction: the callee's own base dispatch hops
        // the terminal-takeover frame on the same mounted TUI.
        const callee = new decision.resolution.ctor({});
        const outcome = await callee.run(decision.decoded.inputs);
        session.vars.set(DISPATCH_REQUEST_VAR, NO_DISPATCH_VALUE);
        await this.execute_phase("report", {
          instructions: renderReportInstructions(
            decision.decoded.name,
            outcome,
            decision.resolution.contract,
          ),
          min: 1,
        });
      } catch (error) {
        if (error instanceof PhaseInterruptionError) {
          session.vars.set(DISPATCH_REQUEST_VAR, NO_DISPATCH_VALUE);
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
      await this.execute_phase("gather", {
        instructions: renderGatherInstructions(listing, carriedRefusal),
        vars: [DISPATCH_REQUEST_VAR],
        min: 1,
        max: ADHOC_BURST_MAX_RUNS,
      });
      carriedRefusal = undefined;
      const raw = session.vars.get(DISPATCH_REQUEST_VAR);
      if (raw === undefined || raw === NO_DISPATCH_VALUE) {
        continue;
      }
      const gate = await gateStoredRequest(String(raw));
      if (gate.ok === false) {
        carriedRefusal = gate.refusal;
        session.vars.set(DISPATCH_REQUEST_VAR, NO_DISPATCH_VALUE);
        continue;
      }
      await this.execute_phase("confirm", {
        instructions: renderConfirmInstructions(
          gate.decision.resolution,
          gate.decision.decoded,
        ),
        vars: [DISPATCH_REQUEST_VAR],
        min: 1,
      });
      const recheckRaw = session.vars.get(DISPATCH_REQUEST_VAR);
      if (recheckRaw === undefined || recheckRaw === NO_DISPATCH_VALUE) {
        continue;
      }
      const recheck = await gateStoredRequest(String(recheckRaw));
      if (recheck.ok === false) {
        carriedRefusal = recheck.refusal;
        session.vars.set(DISPATCH_REQUEST_VAR, NO_DISPATCH_VALUE);
        continue;
      }
      return recheck.decision;
    }
  }
}
