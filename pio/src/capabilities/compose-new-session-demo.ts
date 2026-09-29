// The compose-new-session-demo capability — TEMPORARY.
//
// A throwaway demonstration of composed execution: one greeting turn on the
// caller's own session, then the registered `research` capability invoked
// WITHOUT a session (while it runs, the child takes over the live terminal
// and hands it back), then one summary turn stating the three most important
// findings from the child's report THROUGH THE SESSION STREAM. The machine
// deliverable is the child's frozen report token, passed through unchanged;
// nothing is written to the project slot (the summary only reads the report).
//
// TEMPORARY removal schedule: this registration exists solely to exercise the terminal-takeover composition end-to-end, and it is REMOVED at the bulk-migration cutover.

import { join } from "node:path";
import type { CapabilityParams } from "../capability/base.ts";
import {
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { resolveCapability } from "../capability/loader.ts";
import type { CapabilityResult } from "../capability/status.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";

/** The hard-coded research topic (shrink-only tunable; the suite rows
 * reference this constant, never a duplicated literal). */
export const DEMO_TOPIC = "Gnosticism in Barcelona";

/** Typed settlement fault for a child outcome that cannot settle the demo
 * (unsuccessful child settlement, a missing/empty report token on a
 * successful one, or an unresolvable callee). Bare identity — the capture
 * reduces to {type:'ChildOutcomeError', message:<…>}. */
export class ChildOutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChildOutcomeError";
  }
}

/** The pinned greeting template (PINNED bytes; the suite replica names this
 * owner). One settled turn: greet the operator and briefly name what comes
 * (a handover to a research run on a fixed topic), then order a clean end of
 * turn with no tool-use mandate. Em dashes are U+2014 (escaped). */
const GREETING_INSTRUCTIONS = `You are starting a research handoff demonstration.
1. Greet the operator: say hello and briefly mention that the terminal is about to be handed over to a research run on a fixed topic.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** The pinned summary template (PINNED bytes; the suite replica names this
 * owner). One settled turn: read the child's report (by ABSOLUTE PATH) first,
 * state the THREE most important findings ranked and grounded strictly in
 * the report as a short numbered list, then order a clean end of turn. Em
 * dashes are U+2014 (escaped). */
function summaryInstructions(reportPath: string): string {
  return `The research run has finished. Its full report is at:
${reportPath}
1. Read that file.
2. Distill the THREE most important findings from it \u2014 ranked by importance, grounded strictly in the report's content (nothing invented, no outside knowledge).
3. Present the three findings in your reply as a numbered list: one finding per line, one or two sentences each.
4. Do nothing else \u2014 no further tools, no questions, no writes. End your turn right after presenting the three findings.`;
}

/** The failure-payload form of the settlement message: the child's first
 * captured error type + message embedded verbatim. */
function childFailureMessage(
  name: string,
  version: string,
  type: string,
  message: string,
): string {
  return `compose-new-session-demo: child capability '${name}@${version}' settled unsuccessfully: ${type}: ${message}`;
}

/** The malformed-success form: a successful child settlement carrying no
 * usable report token. Em dash U+2014 (escaped). */
function noReportTokenMessage(name: string, version: string): string {
  return `compose-new-session-demo: child capability '${name}@${version}' returned no report token \u2014 refusing to settle`;
}

/** The resolve-refusal form: the named callee did not resolve at all
 * (defensive — shipped registrations always resolve). Em dash U+2014
 * (escaped). */
function unresolvedChildMessage(): string {
  return `compose-new-session-demo: child capability 'research' did not resolve \u2014 refusing to compose`;
}

export default class ComposeNewSessionDemoCapability extends PioCapability {
  readonly contract: Contract = {
    name: "compose-new-session-demo",
    version: "0.1.0",
    inputs: [],
    outputs: [{ name: "report" }],
    writes: [],
  };

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // `inputs` is {} by construction through the base seam (zero declared
    // inputs — the host gate already refused anything else); the method
    // keeps the standard signature and reads no input values.
    void inputs;

    // 1. Greeting — exactly ONE settled turn on this capability's OWN
    // session (the terminal belongs to the caller frame at this moment and
    // the greeting rides the session stream). No stopping rule: with min: 1
    // the engine breaks after the first settled run, so the phase is one
    // turn and max: 1 documents intent (budget paths structurally
    // unreachable).
    await this.execute_phase("greeting", {
      instructions: GREETING_INSTRUCTIONS,
      min: 1,
      max: 1,
    });

    // 2. Composition — loader-mediated against the in-artifact table
    // (production-faithful admission; the direct sibling import would add an
    // edge production never walks). The child is constructed WITHOUT a
    // session param so ITS OWN base dispatch hops the terminal-takeover
    // frame (this module never touches hop machinery; the loader owns the
    // callee-edge thunk internally).
    const resolved = await resolveCapability("research");
    if (!resolved.ok) {
      // Coverage boundary: bundled registrations always resolve in the
      // shipped artifact, so this defensive refusal is unreachable
      // hermetically — pinned by the structural clause set and observed
      // through the manual E2E runbook legs rather than rowed.
      throw new ChildOutcomeError(unresolvedChildMessage());
    }
    const capName = resolved.capability.contract.name;
    const capVersion = resolved.capability.contract.version;
    const child = new resolved.capability.ctor({});
    const outcome: CapabilityResult = await child.run({ topic: DEMO_TOPIC });

    // 3. Failure settlement (success-path gate): any non-well-settled child
    // throws BEFORE derivation or summarizing — the summary never starts.
    // Masking interaction (settled semantics): a kill fired mid-child
    // settles this await RESOLVED with the typed kill capture; the demo
    // mirrors it into its own typed capture, and run() never rejects.
    const reportToken = outcome.ok ? outcome.outputs?.report : undefined;
    const wellSettled =
      outcome.ok === true &&
      typeof reportToken === "string" &&
      reportToken.length > 0;
    if (!wellSettled) {
      if (outcome.ok === false) {
        const first = outcome.errors?.[0];
        throw new ChildOutcomeError(
          childFailureMessage(
            capName,
            capVersion,
            first?.type ?? "UnknownError",
            first?.message ?? "",
          ),
        );
      }
      throw new ChildOutcomeError(noReportTokenMessage(capName, capVersion));
    }

    // 4. Summary — success path ONLY, AFTER the return hand-off (the
    // terminal belongs to the caller frame again). The report's ABSOLUTE
    // path is PASSTHROUGH-ABSOLUTIZED: the child's token consumed VERBATIM,
    // joined against the derived state root and project key (the same
    // shipped channels the child uses; loud typed escape, NO silent
    // fallback). Exactly ONE settled turn reads the report and states the
    // findings THROUGH THE SESSION STREAM — no file is written and nothing
    // is asked; the top-frame transcript is their durable home.
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());
    const absoluteReportPath = join(
      stateRoot,
      "projects",
      projectKey,
      reportToken,
    );
    await this.execute_phase("summary", {
      instructions: summaryInstructions(absoluteReportPath),
      min: 1,
      max: 1,
    });

    // 5. Return — the PASSTHROUGH token rides the caller's own terminal
    // record (emitted by the entry through the outermost-ledger emitter).
    return { report: reportToken };
  }
}
