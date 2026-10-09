// The compose-new-session-demo capability — TEMPORARY.
//
// A throwaway demonstration of composed execution: one greeting turn on the
// caller's own session, then the sibling `research` capability invoked
// WITHOUT a session (while it runs, the child takes over the live terminal
// and hands it back), then one summary turn stating the three most important
// findings from the child's report THROUGH THE SESSION STREAM. The machine
// deliverable is the child's settled report value, passed through unchanged;
// nothing is written to the project slot (the summary only reads the report).
//
// TEMPORARY removal schedule: this registration exists solely to exercise the terminal-takeover composition end-to-end, and it is REMOVED at the bulk-migration cutover.

import type { CapabilityParams } from "../capability/base.ts";
import { PioCapability } from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import ResearchCapability from "./research.ts";

/** The hard-coded research topic (shrink-only tunable; the suite rows
 * reference this constant, never a duplicated literal). */
export const DEMO_TOPIC = "Gnosticism in Barcelona";

/** One-line catalog description (SOLE OWNER of the pinned bytes; the loader
 * suite replica names this owner). Surfaced by the on-demand catalog walk. */
export const DESCRIPTION =
  "Temporary row-2 demo: greets, hands the terminal to a fresh research run on a hard-coded topic, then reports the top 3 findings.";

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

/** The single fixed sentence for the one self-detected anomaly: a
 * successful child settlement carrying no readable report (there is no note
 * to forward in that case). PINNED bytes; the suite replica names this
 * owner. Em dash U+2014 (escaped). */
const EMPTY_REPORT_SETTLEMENT_MESSAGE =
  "compose-new-session-demo: the research child settled successfully but its outputs carry no report to read \u2014 nothing to summarize";

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

    // 2. Composition — co-shipping builtins compose over EACH OTHER'S shipped
    // modules directly (the loader's dispatch machinery is reserved for
    // startup/top-session resolution). Constructed WITHOUT a session param,
    // so the child's OWN base dispatch hops the terminal-takeover frame
    // while it runs and hands the terminal back on return — this module
    // never touches hop machinery.
    const child = new ResearchCapability({});
    const outcome = await child.run({ topic: DEMO_TOPIC });

    // 3. Child-fault settlement — VERBATIM FORWARDING: a failed child
    // re-projects its FIRST capture unchanged (type + message; failures
    // received from elsewhere mint no new types here — attribution rides
    // the record's position, top frame vs child frame). A successful
    // settlement carrying no readable report settles with the single fixed
    // sentence instead. Either way the SUMMARY NEVER RUNS behind the gate.
    if (outcome.ok === false) {
      const first = outcome.errors?.[0];
      const forwarded = new Error(first?.message ?? "");
      forwarded.name = first?.type ?? "Error";
      throw forwarded;
    }
    const report = outcome.outputs?.report;
    if (typeof report !== "string" || report.length === 0) {
      throw new Error(EMPTY_REPORT_SETTLEMENT_MESSAGE);
    }

    // 4. Summary — success path ONLY, AFTER the return hand-off (the
    // terminal belongs to the caller frame again). The report value arrives
    // VERBATIM — the base's settle seam already transformed the child's
    // file-mode output to this bubble's ABSOLUTE placement (no consumer-side
    // derivation here). Exactly ONE settled turn reads the report and states
    // the findings THROUGH THE SESSION STREAM — no file is written and
    // nothing is asked; the top-frame transcript is their durable home.
    await this.execute_phase("summary", {
      instructions: summaryInstructions(report),
      min: 1,
      max: 1,
    });

    // 5. Return — the settled report value rides the caller's own terminal
    // record (emitted by the entry through the outermost-ledger emitter);
    // the demo's own output slot is a VALUE slot, so the base passes it
    // through untransformed.
    return { report };
  }
}
