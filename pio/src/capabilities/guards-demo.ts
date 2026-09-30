// The guards-demo capability — PERMANENT: the standing home for guard
// demonstrations (future guard tests accumulate here). Registration contrast:
// its row-2 sibling compose-new-session-demo is a temporary demonstration
// whose removal is scheduled at the bulk-migration cutover; this module stays
// registered.
//
// What it exhibits: the engine-owned expectation-guard loop over a declared
// deliverable, triggered DELIBERATELY — the guarded phase's first pass skips
// the declared write by instruction, so a live run visibly exercises the
// loop end to end: first-pass miss -> engine-denied settlement -> corrective
// note naming the exact path -> compliant second run -> settle.
//
// Outcome model: NO raw terminal writes — the phase prompts ARE the
// in-stream statements, and the machine ledger (the terminal record's
// `outputs`) carries the settled ABSOLUTE placement once the base's settle
// seam has transformed the returned slot-relative token.
//
// Repeatable reset: immediately before the guarded phase the known artifact
// is unlink-swallowed — a pre-existing artifact would let the gate pass
// silently and the demonstration would not trigger. Swallowing is deliberate:
// a surviving stale artifact degrades to the graceful (already-present)
// settle rather than aborting the demonstration.
//
// The guarded phase is DECLARATION-ONLY (a write declaration plus the floor;
// no stopping hook, no budget ceiling): with the floor consumed, the
// settlement gate plus its own ceiling are the SOLE settlement authority —
// the canonical teaching example. Engine faults (the ceiling-exhaustion
// ContractViolationError) propagate VERBATIM out of call() — never wrapped
// or downgraded; the base catch-all captures them into the typed ok:false
// settlement. Em dashes are U+2014 (escaped) in every pinned byte below.

import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type CapabilityParams,
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";

/** The FIXED project-slot-relative artifact token (shrink-only tunable; the
 * suite rows reference this constant, never a duplicated literal). */
export const GUARDS_DEMO_ARTIFACT = "guards-demo/guard-probe.md";

/** The pinned greeting template (PINNED bytes; the suite replica names this
 * owner). One settled turn: greet the operator and briefly name what the
 * demo exhibits (the expectation guard denying first-pass settlement until
 * the declared file exists), then order a clean end of turn with no tool-use
 * mandate. Em dashes are U+2014 (escaped). */
const GREETING_INSTRUCTIONS = `You are starting a guard demonstration.
1. Greet the operator: say hello and briefly mention that the run ahead exhibits the engine's expectation guard \u2014 a declared deliverable whose settlement is DENIED on the first pass until the file exists.
2. Do nothing else in this turn \u2014 no tools, no questions. End your turn right after the greeting.`;

/** The pinned guard-probe instruction template (PINNED bytes; the suite
 * replica names this owner). ONE static text teaches both passes: the same
 * baseline rides every run, so the first-pass skip directive and the
 * compliant-create directive coexist, disambiguated ONLY by the presence or
 * absence of the engine's corrective note strictly after the baseline.
 * Em dashes are U+2014 (escaped). */
function guardProbeInstructions(absoluteArtifact: string): string {
  return `This run demonstrates the engine's expectation guard for a declared deliverable.
Deliverable file (absolute path): ${absoluteArtifact}

Rules for THIS run:
1. FIRST PASS \u2014 no corrective note appears below these instructions: draft the intended content in your reply ONLY and finish the run WITHOUT any write or edit call touching that file.
2. How the guard works: the engine checks the file's existence at settlement, DENIES settlement while the file is missing, and re-runs this phase with a corrective note naming the exact missing path.
3. CORRECTIVE PASS \u2014 a corrective note naming this path IS present below these instructions: create the file AT THE EXACT path above with minimal required content \u2014 a "# Guard Demo" heading plus one line stating that this run was forced by the expectation guard.
Work autonomously; do not ask the user anything during the run.`;
}

/** The pinned summary template (PINNED bytes; the suite replica names this
 * owner). Variant selection keys ONLY on the observed iteration count (A:
 * >= 2 — the guard forced the corrective re-run, naming the count; B: === 1
 * — armed but NOT triggered, graceful); there is no third variant and never
 * a hard failure on model non-determinism. Both variants name the ABSOLUTE
 * artifact path and end with the sibling one-shot ordering. The disk
 * observation only degrades the wording (no throw site). Em dashes are
 * U+2014 (escaped). */
function summaryInstructions(
  absoluteArtifact: string,
  iterations: number,
  fileConfirmed: boolean,
): string {
  const placementLine = fileConfirmed
    ? "The deliverable is present at (absolute path):"
    : "The declared deliverable path is (absolute):";
  const outcome =
    iterations >= 2
      ? `The guard demonstration has finished after ${iterations} runs: the engine's expectation guard DENIED first-pass settlement \u2014 the declared deliverable was missing \u2014 and FORCED the corrective re-run until the file existed.`
      : `The guard demonstration has finished after 1 run: the expectation guard's loop was ARMED but NOT triggered \u2014 the deliverable landed on the very first run, so the engine settled it immediately.`;
  return `${outcome}
${placementLine}
${absoluteArtifact}
1. State in one short sentence what was demonstrated.
2. Do nothing else \u2014 no further tools, no questions, no writes. End your turn right after that statement.`;
}

export default class GuardsDemoCapability extends PioCapability {
  readonly contract: Contract = {
    name: "guards-demo",
    version: "0.1.0",
    inputs: [],
    outputs: [{ name: "report", paramKey: "report" }],
    writes: ["guards-demo/*.md"],
    allowProjectWrites: true,
  };

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    // Zero declared inputs — the host gate already refused anything else;
    // the standard signature survives untouched.
    void inputs;

    // Derivation escapes PRE-EVERYTHING (zero prompts on an env defect): the
    // typed capture in the terminal record IS the human-facing surfacing.
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());
    const projectSlot = join(stateRoot, "projects", projectKey);
    const absoluteArtifact = join(projectSlot, GUARDS_DEMO_ARTIFACT);

    // 1. Greeting — exactly ONE settled turn through the session stream.
    await this.execute_phase("greeting", {
      instructions: GREETING_INSTRUCTIONS,
      min: 1,
      max: 1,
    });

    // 2. Repeatability reset — error-SWALLOWED, deterministic,
    // capability-owned: a surviving stale artifact degrades to the graceful
    // settle instead of aborting the demonstration. No prompts, no logging.
    await rm(absoluteArtifact, { force: true }).catch(() => {});

    // 3. Guarded phase — DECLARATION-ONLY: the write declaration plus the
    // floor; NO stopping hook, NO budget ceiling. With the floor consumed,
    // the settlement gate plus its own ceiling are the SOLE settlement
    // authority. Awaited UNWRAPPED: a ceiling-exhaustion
    // ContractViolationError escapes call() VERBATIM (the base catch-all
    // captures it into the typed ok:false settlement).
    const result = await this.execute_phase("guard-probe", {
      instructions: guardProbeInstructions(absoluteArtifact),
      min: 1,
      write: [absoluteArtifact],
    });

    // 4. Post-phase observation backing the summary wording: the gate
    // already guarantees existence at settle, so a null stat degrades the
    // WORDING only — no new throw site, never a hard failure.
    const fileConfirmed =
      (await stat(absoluteArtifact).catch(() => null)) !== null;

    // 5. Summary — success-gated by control flow (a rejecting guarded phase
    // never reaches it): ONE settled turn stating the observed trajectory
    // THROUGH THE SESSION STREAM.
    await this.execute_phase("summary", {
      instructions: summaryInstructions(
        absoluteArtifact,
        result.iterations,
        fileConfirmed,
      ),
      min: 1,
      max: 1,
    });

    // 6. Return — the RELATIVE token; the base's settle seam absolutizes it
    // exactly once at success settlement (NEVER the absolute path here).
    return { report: GUARDS_DEMO_ARTIFACT };
  }
}
