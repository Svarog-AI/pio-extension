// The vars-demo capability - PERMANENT: the standing variable-cell
// demonstration home AND the manual quality-gate leg for setting.
// Registration contrast: the temporary row-2 sibling
// (compose-new-session-demo) is removed at the bulk-migration cutover; this
// module stays registered.
//
// What it exhibits live (ONE PHASE TESTS ONE THING - phase names say what
// they test):
// 1. Setting, both sides, over the SAME live cells. The model defines the
//    note value via setVar while a TypeScript hook reads that SAME value
//    mid-run (live leg 1 - a between-runs observation quoted in the closing
//    summary, timing evidence rather than end-of-run); the program defines
//    the facts seed programmatically BETWEEN phases, which the model reads
//    back via getVar on the following turn (live leg 2 - compact JSON
//    rendering for the seeded array, bare rendering for the model-authored
//    string: cross-origin parity, one cell substrate, any origin).
// 2. The variable expectation guard triggered DELIBERATELY: the guard-retry
//    phase is DECLARATION-ONLY (the canonical teaching shape) and leaves its
//    one declared variable undefined on the first pass by instruction -
//    ONE static instruction text teaches both passes, disambiguated ONLY by
//    the presence of the engine's corrective note strictly below the
//    instructions (the visible-triggering convention). A live run thus
//    exercises the loop end to end: first-pass miss -> engine-denied
//    settlement -> corrective note naming the exact variable -> compliant
//    second run -> settle.
// 3. Pre-minted cells (zero prompts): the four cells are minted at
//    instance construction BEFORE any phase issues, so every phase listing
//    binds pre-minted cells, and the model's setVar reaches only the
//    granted cells.
// 4. The verdict-beat discipline (inherited from the sibling guards-demo
//    probes): every PROBE turn's reply states whether its expectation was
//    satisfied - the THREE action probes (model-write, read-back,
//    refusal-probe) each close with the explicit one-sentence verdict beat,
//    and the guard-retry replies close with the SAME verdict inside each
//    pass of the two-pass rules form (owner ruling: the rules form stays
//    structurally intact; the output gains the verdict). The greeting and
//    the summary are bookend/report turns and carry no verdict beat.
// 5. The out-of-permission write refusal (the refusal-witness leg): the
//    refusal-probe phase binds TWO cells - the writable companion FIRST
//    (its grant supplies the moment's write-grant listing) and the target
//    READ-ONLY - and instructs the model to ATTEMPT the write anyway; the
//    readable mid-turn gate-family line naming the variable plus that
//    listing IS the expected outcome, quoted verbatim in the turn.
//
// Outcome model: NO file deliverables - the transcript IS the product; the
// terminal record settles claim-free ok:true with the EMPTY outputs record
// (a value-less contract stays env-immune at the base settle seam by
// construction). No raw terminal writes: every narration rides the session
// stream. Engine faults (the ceiling-exhaustion ContractViolationError
// from EITHER variable phase) propagate VERBATIM out of call() - never
// wrapped or downgraded; the base catch-all captures them into the typed
// ok:false settlement. Em dashes are U+2014 (escaped) in every pinned byte
// below.
//
// Manual quality-gate leg (code-side home of the live verification; the
// canonical invocation is the BARE form - the demo takes nothing; sandbox
// posture per ops discipline):
//   pio run vars-demo
// Live checklist (each item is TUI/transcript-observable in ONE run):
//   1. Model -> TS same-run read: the closing summary QUOTES the mid-run
//      hook observation of the model-authored note value (read BETWEEN the
//      settled runs, not after them).
//   2. TS -> model following-turn read: the read-back turn narrates the
//      getVar renderings - the TS-seeded array as COMPACT JSON and the
//      model-authored string BARE (cross-origin parity). Its READ-ONLY
//      bindings make the default-read grant LOAD-BEARING: every bound
//      variable is readable with no write grant declared.
//   3. Gate corrective retry: the variable-guard corrective block is
//      VISIBLY triggered after the first guard-retry pass (one declared
//      variable deliberately left undefined on that pass).
//   4. Out-of-permission write refusal: the refusal-probe turn VISIBLY
//      quotes the gate-family line - the readable mid-turn rendering names
//      the refused variable plus the moment's write listing (exactly one
//      entry, the writable companion), and the turn quotes it verbatim.
//   5. Clean success settlement: the run settles ok (exit 0) with the
//      stream-only summary as the final turn.
//   6. Verdict beats: every probe turn's reply VISIBLY states whether its
//      expectation was satisfied - the THREE action probes (model-write,
//      read-back, refusal-probe) each end with a one-sentence verdict
//      sentence, and EACH guard-retry pass (the first pass and the
//      corrective pass) ends with the same verdict.
// Direct-tool note: setVar/getVar/listVars are live in EVERY hosted
// session, resolved against the ACTIVE PHASE'S BOUND CELLS (view-scoped -
// nothing global); the checklist MAY exercise the tools directly in the
// transcript (for example listVars for the two-key {variables, types}
// document).

import type { CapabilityParams } from "../capability/base.ts";
import { PioCapability } from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { declareVar } from "../capability/var-cell.ts";

/** One-line catalog description (SOLE OWNER of the pinned bytes; the loader
 * suite replica names this owner). Surfaced by the on-demand catalog walk. */
export const DESCRIPTION =
  "Demonstration of the no-store variable model: within one run, the AI and the program code set and read the SAME cells by reference, the program observes an AI write mid-run, one guarded value is deliberately retried until it lands, and one out-of-permission write renders its readable refusal.";

/** Model-defined on the model-write pass and read by the TS hook mid-run
 * (live leg 1; dual-role declaration - the permission face admits the
 * model's write, the expectation face demands presence at settlement). */
export const MODEL_NOTE_VAR = "note_from_model";

/** Model-defined, DELIBERATELY skipped on the guard-retry first pass (the
 * visible-triggering convention - one static text, two passes). */
export const GATE_PROBE_VAR = "gate_probe";

/** TS-defined programmatically between phases; model getVar read on the
 * following turn (live leg 2; the compact-JSON rendering leg). */
export const TS_FACTS_VAR = "facts_from_ts";

/** Pinned programmatic seed (array - the compact-JSON rendering leg). */
export const TS_FACTS_VALUE: readonly string[] = [
  "vars-demo fact one",
  "vars-demo fact two",
];

/** Pinned model-set value (plain ASCII - transcript-safe). */
export const MODEL_NOTE_VALUE = "vars-demo: authored by the model";

/** Pinned model-set value for the corrective pass. */
export const GATE_PROBE_VALUE = "vars-demo: authored on the corrective pass";

/** TS-defined programmatically between phases; DELIBERATELY REFUSED on the
 * refusal-probe pass (the read-only binding leg - the gate-family refusal
 * rendering IS the expected outcome). */
export const REFUSAL_PROBE_VAR = "refusal_probe";

/** Pinned programmatic seed (plain ASCII - transcript-safe; names the
 * program-side seeding). The instructed rewrite reuses these bytes, so the
 * refusal stays permission-derived by construction. */
export const REFUSAL_PROBE_VALUE = "vars-demo: seeded by the program";

/** The pinned greeting template (PINNED bytes; the suite replica names this
 * owner). One settled turn: greet the operator and briefly name what the
 * run ahead exhibits (both-sides variable setting over the same live cells
 * with a live mid-run TS read, the deliberately-triggered
 * expectation-guard retry, and the refused out-of-permission write), then
 * order a clean end of turn. Em dashes are U+2014 (escaped). */
const GREETING_INSTRUCTIONS = `You are starting a session-variable demonstration.
1. Greet the operator: say hello and briefly mention that the run ahead exhibits session variables set from BOTH sides - the model defining a note that TypeScript code reads mid-run and the program defining facts the model reads back on a following turn - together with a deliberately-triggered variable expectation-guard retry and an out-of-permission write whose readable refusal the model quotes.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** The pinned model-write instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). Three beats: imperative (the
 * model defines the note variable with the setVar tool at the pinned value)
 * / expectation (the value LANDS as stored - the cell holds the exact value
 * the settle entry admitted) / the SIBLING'S VERBATIM one-sentence verdict
 * beat - then the standing closing-order trailer. No em dash occurs
 * in the body. */
function modelWriteInstructions(): string {
  return `Use the setVar tool to define ${MODEL_NOTE_VAR} with the EXACT value: ${MODEL_NOTE_VALUE}. The expectation is that the value LANDS as stored - the cell holds the exact value the settle entry admitted. Describe in one sentence if it's satisfied. End your turn right after (no further tools).`;
}

/** The pinned guard-retry instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). ONE STATIC text teaches both
 * passes: the same baseline rides every run, so the first-pass skip
 * directive and the compliant-create directive coexist, disambiguated ONLY
 * by the presence or absence of the engine's corrective note strictly after
 * the baseline. Ruling-honored hybrid (OWNER RULING): the two-pass RULES
 * skeleton stays BYTE-STABLE - the numbered-rule lines survive unchanged and
 * disambiguation rides solely on the corrective note's presence - while the
 * inserted standalone unnumbered verdict-OUTPUT directive makes EACH pass's
 * reply close with the SAME one-sentence expectation-satisfaction verdict
 * the action probes carry (the sibling's verbatim beat). Em dashes are
 * U+2014 (escaped) at the rule-line positions only. */
function guardRetryInstructions(): string {
  return `This run demonstrates the variable expectation guard over ${GATE_PROBE_VAR}.
Rules for THIS run:
1. FIRST PASS \u2014 no corrective note appears below these instructions: draft the intended ${GATE_PROBE_VAR} content in your reply ONLY and finish the run WITHOUT any setVar call touching ${GATE_PROBE_VAR}.
2. CORRECTIVE PASS \u2014 a corrective note naming ${GATE_PROBE_VAR} IS present below these instructions: define ${GATE_PROBE_VAR} with the setVar tool using the EXACT value: ${GATE_PROBE_VALUE}.
In EVERY pass, close your reply with the expectation-satisfaction verdict the other probes carry. Describe in one sentence if it's satisfied.
Work autonomously; do not ask the user anything during the run.`;
}

/** The pinned read-back instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). Three beats: imperative (the
 * model getVars BOTH readings - the TS-seeded array and the model-authored
 * string - stating both renderings in the reply, one line each, quoted
 * exactly) / expectation (the seeded array renders as COMPACT JSON and the
 * model-authored string renders BARE - cross-origin parity, one cell
 * substrate, any origin) / the SIBLING'S VERBATIM one-sentence verdict beat
 * - then the standing closing-order trailer. No em dash occurs in the body.
 */
function readBackInstructions(): string {
  return `Use the getVar tool to read ${TS_FACTS_VAR} and ${MODEL_NOTE_VAR}, and state both renderings in your reply, one line each, quoting them exactly. The expectation is that the seeded array renders as COMPACT JSON and the model-authored string renders BARE - cross-origin parity, one cell substrate, any origin. Describe in one sentence if it's satisfied. End your turn right after (listVars is available but not required).`;
}

/** The pinned refusal-probe instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). Three beats:
 * imperative (the model ATTEMPTS the setVar on the read-only-bound variable
 * with the EXACT value the program already seeded - the rewrite of the
 * program's seeded value) / expectation (satisfaction is THE REFUSAL
 * HAVING RENDERED READABLY - the tool refuses the write and the visible
 * mid-turn line names the variable plus the phase's write listing, quoted
 * verbatim in the reply) / the SIBLING'S VERBATIM one-sentence verdict beat
 * - then the standing closing-order trailer. No em dash occurs in the body.
 */
function refusalProbeInstructions(): string {
  return `Use the setVar tool to define ${REFUSAL_PROBE_VAR} with the EXACT value: ${REFUSAL_PROBE_VALUE}. The expectation is NOT that the value lands: this write is deliberately out of permission for this phase, so the tool REFUSES it and the visible mid-turn line names the variable plus this phase's write listing - quote that rendered refusal VERBATIM in your reply. Describe in one sentence if it's satisfied. End your turn right after (no further tools).`;
}

/** The pinned summary template (SOLE OWNER of these PINNED bytes; the suite
 * replica names this owner). Variant selection keys ONLY on the OBSERVED
 * guard-retry iteration count (A: >= 2 - the guard denied first-pass
 * settlement and forced the corrective re-run, naming the count and echoing
 * the guarded value's side effect; B: === 1 - the loop was ARMED but NOT
 * triggered: the model defined the guarded variable on the first pass
 * despite the skip directive). Both variants quote the MID-RUN
 * hook-observed note value (timing evidence - read between runs, not
 * after) AND STATE the refusal-witness outcome (static narrative
 * restatement - the stop-rule hook observes cells, never tool results, so
 * nothing machine-observed rides that item). Ends with the standard closing
 * order. Em dashes are U+2014 (escaped). */
function summaryInstructions(iterations: number, observedNote: string): string {
  const outcome =
    iterations >= 2
      ? `The variable demonstration finished with the guard-retry phase settling after ${iterations} runs: the variable expectation guard DENIED first-pass settlement \u2014 the declared variable was still undefined \u2014 and FORCED the corrective re-run, which defined it (${GATE_PROBE_VALUE}).`
      : `The variable demonstration finished with the guard-retry phase settling after 1 run: the variable guard's loop was ARMED but NOT triggered \u2014 the model defined the guarded variable on the very first pass despite the skip directive.`;
  return `${outcome}
1. Quote the value the TypeScript hook OBSERVED MID-RUN from ${MODEL_NOTE_VAR}: "${observedNote}" (read between the settled runs, not after them - the timing evidence that the model's setVar landed while the program was still running).
2. State that the refusal-probe leg witnessed its outcome: the model's out-of-permission write of the refusal variable was REFUSED by the tool and the mid-turn gate line rendered visibly, naming the variable and the phase's write listing.
3. Do nothing else \u2014 no further tools, no questions. End your turn right after that statement.`;
}

export default class VarsDemoCapability extends PioCapability {
  readonly contract: Contract = {
    name: "vars-demo",
    version: "0.1.0",
    inputs: [],
    outputs: [],
    writes: [],
  };

  /** Pre-minted CELLS (constructive-impossibility successor to the
   * mandatory-type proof): the field initializers run at instance
   * construction, BEFORE any prompt - every later listing binds these
   * pre-minted cells. */
  readonly modelNoteCell = declareVar(MODEL_NOTE_VAR, "string");
  readonly gateProbeCell = declareVar(GATE_PROBE_VAR, "string");
  readonly tsFactsCell = declareVar(TS_FACTS_VAR, "array");
  readonly refusalProbeCell = declareVar(REFUSAL_PROBE_VAR, "string");

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Zero declared inputs - the host gate already refused anything else.
    void inputs;

    // Hook bag + observer hook (the live-leg-1 seam): a call()-scoped
    // mutable bag captured by the model-write phase's stop-rule closure.
    const hookBag: { note?: string } = {};

    // 1. Greeting - exactly ONE settled turn (attach abstention - no
    // dimensions).
    await this.execute_phase("greeting", {
      instructions: GREETING_INSTRUCTIONS,
      min: 1,
      max: 1,
    });

    // 2. Model-write (tests: the model writes, the program reads LIVE) -
    // one instructed settled run. The hook is a PURE OBSERVER: after each
    // settling run it SAFE-reads the note value through the cell's
    // never-throwing read (typeof-narrowed, cast-free) and ALWAYS resolves
    // true - deterministic floor break, no terminator role. A skipping
    // model rides the gate's own corrective loop (or the typed ceiling
    // failure) - bounded either way.
    // Awaited UNWRAPPED: a ceiling-exhaustion ContractViolationError
    // escapes call() VERBATIM (the base catch-all captures it into the
    // typed ok:false settlement).
    await this.execute_phase("model-write", {
      instructions: modelWriteInstructions(),
      min: 1,
      max: 1,
      vars: [{ cell: this.modelNoteCell, write: true }],
      shouldStopLoop: async ({ vars }) => {
        const seen = vars.get(MODEL_NOTE_VAR);
        if (typeof seen === "string") {
          hookBag.note = seen;
        }
        return Promise.resolve(true);
      },
    });

    // 3. Guard-retry (tests: a skipped required value IS caught) -
    // DECLARATION-ONLY: no stopping hook, no budget ceiling; with the floor
    // consumed, the settlement gate plus its own ceiling are the SOLE
    // settlement authority (the canonical teaching shape). ONE static text
    // teaches both passes; disambiguation rides solely on the corrective
    // note's presence. Awaited for the iteration count the summary variant
    // keys on; UNWRAPPED like the previous phase.
    const result = await this.execute_phase("guard-retry", {
      instructions: guardRetryInstructions(),
      min: 1,
      vars: [{ cell: this.gateProbeCell, write: true }],
    });

    // 4. TS SEED GLUE (zero prompts): programmatic definition between
    // phases - the cells' own settle is the funnel entry (pre-minted and
    // well-typed, so neither can fault). Seeding the refusal cell BEFORE
    // the probe phase makes its settlement gate deterministically
    // satisfied (both bound cells non-empty at the break point -
    // origin-blind presence).
    this.tsFactsCell.set(TS_FACTS_VALUE);
    this.refusalProbeCell.set(REFUSAL_PROBE_VALUE);

    // 5. Read-back (tests: the model reads TS-defined values FOLLOWING
    // TURN) - one settled turn. READ-ONLY bindings (NO write grants):
    // default-read scoping is LOAD-BEARING here - the model's getVar calls
    // resolve both cells while the gate's universal line governs any write
    // attempt in that window.
    await this.execute_phase("read-back", {
      instructions: readBackInstructions(),
      min: 1,
      max: 1,
      vars: [{ cell: this.tsFactsCell }, { cell: this.modelNoteCell }],
    });

    // 6. Refusal-probe (tests: an out-of-permission write settles the
    // readable gate-family refusal MID-TURN) - one instructed settled run.
    // TWO bindings ride the phase frame: the writable companion FIRST
    // (binding order sets the moment's write-grant listing to exactly the
    // companion's granted name - it supplies the line's listing content)
    // and the target READ-ONLY. The expected outcome IS the mid-turn refusal
    // itself: permission-derived, never shape-derived, because the
    // instructed value reuses the well-formed seed bytes, so a shape or
    // clause reject is inexpressible on this leg. Deterministic first-pass
    // settlement by construction (no loop, no ceiling path - the two bound
    // cells are non-empty at the break point regardless of the model's
    // move).
    await this.execute_phase("refusal-probe", {
      instructions: refusalProbeInstructions(),
      min: 1,
      max: 1,
      vars: [
        { cell: this.modelNoteCell, write: true },
        { cell: this.refusalProbeCell },
      ],
    });

    // 7. Summary - success path ONLY, ONE settled turn stated THROUGH THE
    // SESSION STREAM; variant selection keys ONLY on the observed
    // guard-retry iteration count, and the hook bag degrades to the fixed
    // unobserved token (never a fault on model non-determinism).
    await this.execute_phase("summary", {
      instructions: summaryInstructions(
        result.iterations,
        hookBag.note ?? "<unobserved>",
      ),
      min: 1,
      max: 1,
    });

    // 8. Return - the EMPTY outputs record passes the base settle seam
    // untransformed (no file-mode slot; env-immune by construction).
    return {};
  }
}
