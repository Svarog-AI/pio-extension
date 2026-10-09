// The vars-demo capability - PERMANENT: the standing variable-store
// demonstration home AND the manual quality-gate leg for setting and
// composition. Registration contrast: the temporary row-2 sibling
// (compose-new-session-demo) is removed at the bulk-migration cutover; this
// module stays registered.
//
// What it exhibits live (ONE PHASE TESTS ONE THING - phase names say what
// they test):
// 1. Setting, both sides, over the ONE session variable store. The phases
//    DECLARE variables (dual-role declaration: permission AND expectation
//    faces); the model defines the note value via setVar while a TypeScript
//    hook reads that SAME value mid-run (live leg 1 - a between-runs
//    observation quoted in the closing summary, timing evidence rather than
//    end-of-run); the program defines the facts seed programmatically
//    BETWEEN phases, which the model reads back via getVar on the following
//    turn (live leg 2 - compact JSON rendering for the seeded array, bare
//    rendering for the model-authored string: cross-origin parity, one
//    store, any origin).
// 2. The variable expectation guard triggered DELIBERATELY: the guard-retry
//    phase is DECLARATION-ONLY (the canonical teaching shape) and leaves its
//    one declared variable undefined on the first pass by instruction -
//    ONE static instruction text teaches both passes, disambiguated ONLY by
//    the presence of the engine's corrective note strictly below the
//    instructions (the visible-triggering convention). A live run thus
//    exercises the loop end to end: first-pass miss -> engine-denied
//    settlement -> corrective note naming the exact variable -> compliant
//    second run -> settle.
// 3. Composition with variables over ROW-1 same-session placement: the
//    module-PRIVATE inline callee (below) is constructed WITH the caller's
//    session instance BY REFERENCE and runs its two phases in-process - no
//    spawn, no terminal change. The callee's own capability span marker
//    lands on the SAME shared transcript; its compose-read turn quotes the
//    caller's model-authored value (cross-boundary READ), and the caller
//    reads the callee's compose-write value back THROUGH THE TYPED-READ
//    SURFACE after the composition (cross-boundary WRITE) - by-identity
//    sharing, bidirectional, live. Placement property (stated, NOT acted
//    out): the row-2 terminal-handoff placement mints DISJOINT stores for
//    its composed children - nothing crosses that boundary, and no row-2
//    leg exists in this demonstration.
// 4. The mandatory-type doctrine proven live: every variable is declare()'d
//    in TypeScript BEFORE the first phase issues, so every phase listing
//    (the caller's AND the callee's) validates at arm time over the shared
//    registry, and the model's setVar stays bound to pre-declared names.
// 5. The verdict-beat discipline (inherited from the sibling guards-demo
//    probes): every PROBE turn's reply states whether its expectation was
//    satisfied - the four action probes (model-write, read-back,
//    compose-read, compose-write) each close with the explicit one-sentence
//    verdict beat, and the guard-retry replies close with the SAME verdict
//    inside each pass of the two-pass rules form (owner ruling: the rules
//    form stays structurally intact; the output gains the verdict). The
//    greeting and the summary are bookend/report turns and carry no verdict
//    beat.
//
// Outcome model: NO file deliverables - the transcript IS the product; the
// terminal record settles claim-free ok:true with the EMPTY outputs record
// (a value-less contract stays env-immune at the base settle seam by
// construction). No raw terminal writes: every narration rides the session
// stream. Engine faults (the ceiling-exhaustion ContractViolationError from
// EITHER variable phase, or from the composed callee) propagate VERBATIM
// out of call() - never wrapped or downgraded; the base catch-all captures
// them into the typed ok:false settlement. Em dashes are U+2014 (escaped)
// in every pinned byte below.
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
//      model-authored string BARE (cross-origin parity).
//   3. Gate corrective retry: the variable-guard corrective block is
//      VISIBLY triggered after the first guard-retry pass (one declared
//      variable deliberately left undefined on that pass).
//   4. Composition sharing: the callee's capability span marker appears
//      in-transcript; its compose-read turn quotes the getVar rendering of
//      the caller-authored note value (cross-boundary READ), and the
//      summary quotes the callee-written value read back through the
//      typed-read surface (cross-boundary WRITE).
//   5. Clean success settlement: the run settles ok (exit 0) with the
//      stream-only summary as the final turn.
//   6. Verdict beats: every probe turn's reply VISIBLY states whether its
//      expectation was satisfied - the four action probes (model-write,
//      read-back, compose-read, compose-write) each end with a one-sentence
//      verdict sentence, and EACH guard-retry pass (the first pass and the
//      corrective pass) ends with the same verdict.
// Direct-tool note: setVar/getVar/listVars are live in EVERY hosted session
// - the checklist MAY exercise the tools directly in the transcript (for
// example listVars for the two-key {variables, types} document).

import type { CapabilityParams } from "../capability/base.ts";
import { PioCapability } from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { ContractViolationError } from "../capability/errors.ts";

/** One-line catalog description (SOLE OWNER of the pinned bytes; the loader
 * suite replica names this owner). Surfaced by the on-demand catalog walk. */
export const DESCRIPTION =
  "Demonstration of the shared variable store: within one run, the AI and the program code set and read the same variables, one step is deliberately retried, and a value written by a nested sub-run is read back in the main run.";

/** The private inline callee's contract name + span-marker label (SOLE
 * OWNER of the pinned literal; shrink-only tunable - the suite rows
 * reference this constant, never a duplicated literal). */
export const CALLEE_NAME = "vars-demo-callee";

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

/** Callee-phase-defined into the SHARED store; caller typed-read back after
 * the composition (the cross-boundary WRITE). */
export const CALLEE_NOTE_VAR = "note_from_callee";

/** Pinned model-set value (plain ASCII - transcript-safe). */
export const MODEL_NOTE_VALUE = "vars-demo: authored by the model";

/** Pinned model-set value for the corrective pass. */
export const GATE_PROBE_VALUE = "vars-demo: authored on the corrective pass";

/** Pinned programmatic seed (array - the compact-JSON rendering leg). */
export const TS_FACTS_VALUE: readonly string[] = [
  "vars-demo fact one",
  "vars-demo fact two",
];

/** Pinned callee-set value across the composed boundary. */
export const CALLEE_NOTE_VALUE =
  "vars-demo: authored across the composed boundary";

/** The pinned greeting template (PINNED bytes; the suite replica names this
 * owner). One settled turn: greet the operator and briefly name what the
 * run ahead exhibits (both-sides variable setting with a live mid-run TS
 * read, the deliberately-triggered expectation-guard retry, and a composed
 * callee sharing the store), then order a clean end of turn. Em dashes are
 * U+2014 (escaped). */
const GREETING_INSTRUCTIONS = `You are starting a session-variable demonstration.
1. Greet the operator: say hello and briefly mention that the run ahead exhibits session variables set from BOTH sides - the model defining a note that TypeScript code reads mid-run and the program defining facts the model reads back on a following turn - together with a deliberately-triggered variable expectation-guard retry and a composed callee that shares this one variable store.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** The pinned model-write instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). Three beats: imperative (the
 * model defines the note variable with the setVar tool at the pinned value)
 * / expectation (the value LANDS as stored - the store round-trips the exact
 * value the entry point admitted) / the SIBLING'S VERBATIM one-sentence
 * verdict beat - then the standing closing-order trailer. No em dash occurs
 * in the body. */
function modelWriteInstructions(): string {
  return `Use the setVar tool to define ${MODEL_NOTE_VAR} with the EXACT value: ${MODEL_NOTE_VALUE}. The expectation is that the value LANDS as stored - the store round-trips the exact value the entry point admitted. Describe in one sentence if it's satisfied. End your turn right after (no further tools).`;
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
 * model-authored string renders BARE - cross-origin parity, one store, any
 * origin) / the SIBLING'S VERBATIM one-sentence verdict beat - then the
 * standing closing-order trailer. No em dash occurs in the body. */
function readBackInstructions(): string {
  return `Use the getVar tool to read ${TS_FACTS_VAR} and ${MODEL_NOTE_VAR}, and state both renderings in your reply, one line each, quoting them exactly. The expectation is that the seeded array renders as COMPACT JSON and the model-authored string renders BARE - cross-origin parity, one store, any origin. Describe in one sentence if it's satisfied. End your turn right after (listVars is available but not required).`;
}

/** The pinned summary template (SOLE OWNER of these PINNED bytes; the suite
 * replica names this owner). Variant selection keys ONLY on the OBSERVED
 * guard-retry iteration count (A: >= 2 - the guard denied first-pass
 * settlement and forced the corrective re-run, naming the count and echoing
 * the guarded value's side effect; B: === 1 - the loop was ARMED but NOT
 * triggered: the model defined the guarded variable on the first pass
 * despite the skip directive). Both variants quote (a) the MID-RUN
 * hook-observed note value (timing evidence - read between runs, not
 * after), (b) the post-composition TYPED-READ callee value (by-identity
 * sharing evidence), and (c) the fixed ROW-2 disjointness sentence
 * (documented property, stated - not acted out). Ends with the standard
 * closing order. Em dashes are U+2014 (escaped). */
function summaryInstructions(
  iterations: number,
  observedNote: string,
  calleeNote: string,
): string {
  const outcome =
    iterations >= 2
      ? `The variable demonstration finished with the guard-retry phase settling after ${iterations} runs: the variable expectation guard DENIED first-pass settlement \u2014 the declared variable was still undefined \u2014 and FORCED the corrective re-run, which defined it (${GATE_PROBE_VALUE}).`
      : `The variable demonstration finished with the guard-retry phase settling after 1 run: the variable guard's loop was ARMED but NOT triggered \u2014 the model defined the guarded variable on the very first pass despite the skip directive.`;
  return `${outcome}
1. Quote the value the TypeScript hook OBSERVED MID-RUN from ${MODEL_NOTE_VAR}: "${observedNote}" (read between the settled runs, not after them - the timing evidence that the model's setVar landed while the program was still running).
2. Quote the value read back AFTER the composition through the typed-read surface from ${CALLEE_NOTE_VAR}: "${calleeNote}" (defined by the composed callee inside its own turns - the store shared by instance identity).
3. State the documented row-2 property: the terminal-handoff placement mints DISJOINT variable stores for its composed children, so nothing crosses that boundary (documented property, stated - nothing is acted out).
4. Do nothing else \u2014 no further tools, no questions. End your turn right after that statement.`;
}

/** The pinned compose-read instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). The pure cross-boundary READ
 * turn. Three beats: imperative (the callee's model getVars the
 * caller-authored note value, stating its EXACT rendering in the reply) /
 * expectation (it renders the exact value authored earlier in this same
 * session - the store is shared by instance identity) / the SIBLING'S
 * VERBATIM one-sentence verdict beat - then the standing closing-order
 * trailer. No em dash occurs in the body. */
function composeReadInstructions(): string {
  return `Use the getVar tool to read ${MODEL_NOTE_VAR} and state its EXACT rendering in your reply. The expectation is that it renders the exact value authored earlier in this same session - the store is shared by instance identity. Describe in one sentence if it's satisfied. End your turn right after (no other tools).`;
}

/** The pinned compose-write instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). The gated
 * cross-boundary WRITE turn. Three beats: imperative (the callee's model
 * sets the callee-note variable with the setVar tool at the pinned value) /
 * expectation (the value LANDS as stored in the shared store the caller
 * reads back after the composition) / the SIBLING'S VERBATIM one-sentence
 * verdict beat - then the standing closing-order trailer. No em dash occurs
 * in the body. */
function composeWriteInstructions(): string {
  return `Use the setVar tool to define ${CALLEE_NOTE_VAR} with the EXACT value: ${CALLEE_NOTE_VALUE}. The expectation is that the value LANDS as stored in the shared store the caller reads back after the composition. Describe in one sentence if it's satisfied. End your turn right after (no other tools).`;
}

// THE module-private inline callee (UNEXPORTED - the loader table is the
// registration surface and this class is NOT registered: its name resolves
// to the standard miss refusal line). The smallest compliant shape: the
// four existing built-ins write no variables, so an inline class is the
// only conformant vehicle for the cross-boundary WRITE. Its write phase
// validates at arm over the SHARED declarations() - the caller's
// pre-declaration of the variable is a HARD precondition (arm-time
// enforcement makes this mechanical, not advisory).
class VarsDemoCallee extends PioCapability {
  readonly contract: Contract = {
    name: CALLEE_NAME,
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
    // Zero declared inputs - the host gate already refused anything else.
    void inputs;

    // Compose-read turn: the PURE cross-boundary READ (attach abstention -
    // nothing is being written, so no dimension is declared and nothing
    // attaches).
    await this.execute_phase("compose-read", {
      instructions: composeReadInstructions(),
      min: 1,
      max: 1,
    });

    // Compose-write turn: the gated cross-boundary WRITE (the variable
    // listing arms the expectation gate AND admits the model's setVar
    // against exactly this name while the phase governs).
    await this.execute_phase("compose-write", {
      instructions: composeWriteInstructions(),
      min: 1,
      max: 1,
      vars: [CALLEE_NOTE_VAR],
    });
    return {};
  }
}

export default class VarsDemoCapability extends PioCapability {
  readonly contract: Contract = {
    name: "vars-demo",
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
    // Zero declared inputs - the host gate already refused anything else.
    void inputs;

    // Cast-free narrowing: the base wrapper faults plainly without a
    // session, so the remainder of the body reaches the handle through the
    // narrowed local alone.
    const s = this.s;
    if (s === undefined) {
      throw new Error(
        "no session available: vars-demo requires in-process placement",
      );
    }

    // MANDATORY-TYPE PROOF (zero prompts): every variable is declare()'d
    // FIRST - this is what makes every later phase's vars listing
    // arm-time-valid (the caller's AND the callee's) and what bounds the
    // model's setVar to pre-declared names.
    s.vars.declare(MODEL_NOTE_VAR, "string");
    s.vars.declare(GATE_PROBE_VAR, "string");
    s.vars.declare(TS_FACTS_VAR, "array");
    s.vars.declare(CALLEE_NOTE_VAR, "string");

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
    // settling run it SAFE-reads the note value (typeof-narrowed, cast-free
    // - the typed overload would THROW on absence and must not be used on
    // the normal path) and ALWAYS resolves true - deterministic floor
    // break, no terminator role. A skipping model rides the gate's own
    // corrective loop (or the typed ceiling failure) - bounded either way.
    // Awaited UNWRAPPED: a ceiling-exhaustion ContractViolationError
    // escapes call() VERBATIM (the base catch-all captures it into the
    // typed ok:false settlement).
    await this.execute_phase("model-write", {
      instructions: modelWriteInstructions(),
      min: 1,
      max: 1,
      vars: [MODEL_NOTE_VAR],
      shouldStopLoop: (ctx) => {
        const seen = ctx.vars.get(MODEL_NOTE_VAR);
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
      vars: [GATE_PROBE_VAR],
    });

    // 4. TS SEED GLUE (zero prompts): programmatic definition between
    // phases - registered AND well-typed, so the entry point cannot fault.
    s.vars.set(TS_FACTS_VAR, TS_FACTS_VALUE);

    // 5. Read-back (tests: the model reads TS-defined values FOLLOWING
    // TURN) - one settled turn (attach abstention).
    await this.execute_phase("read-back", {
      instructions: readBackInstructions(),
      min: 1,
      max: 1,
    });

    // 6. Composition (row-1): constructed WITH the caller's session
    // instance BY REFERENCE - nothing else crosses the boundary; the
    // callee's OWN base dispatch stamps ITS span marker on the shared
    // transcript and runs its phases in-process (no spawn, no terminal
    // change).
    const child = new VarsDemoCallee({ session: s });
    const outcome = await child.run();

    // 7. VERBATIM FAULT FORWARDING (success gate): a failed child re-
    // projects its FIRST capture unchanged - the family instance is
    // reconstructed over the forwarded record's own violations and message
    // (failures received from elsewhere mint no NEW types here), so the
    // outer capture settles the SAME family shape. The summary NEVER RUNS
    // behind the gate.
    if (outcome.ok === false) {
      const first = outcome.errors?.[0];
      throw new ContractViolationError(first?.violations ?? [], first?.message);
    }

    // 8. TYPED READ-BACK (zero prompts, success path): the typed-read
    // surface over the SHARED store. Cannot fault here - the callee's
    // ok:true implies its compose-write phase settled, and settlement
    // REQUIRES the declared variable present (the gate guarantees it), so
    // presence is GATE-GUARANTEED and no defensive corner exists.
    const calleeNote = s.vars.get(CALLEE_NOTE_VAR, "string");

    // 9. Summary - success path ONLY, ONE settled turn stated THROUGH THE
    // SESSION STREAM; variant selection keys ONLY on the observed
    // guard-retry iteration count, and the hook bag degrades to the fixed
    // unobserved token (never a fault on model non-determinism).
    await this.execute_phase("summary", {
      instructions: summaryInstructions(
        result.iterations,
        hookBag.note ?? "<unobserved>",
        calleeNote,
      ),
      min: 1,
      max: 1,
    });

    // 10. Return - the EMPTY outputs record passes the base settle seam
    // untransformed (no file-mode slot; env-immune by construction).
    return {};
  }
}
