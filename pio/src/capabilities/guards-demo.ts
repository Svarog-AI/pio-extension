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
// What it ALSO exhibits: the standing live write-gate demonstration - six
// PLAIN-PHASE gate probes after the guarded phase, under ONE span, in fixed
// order: deny (REFUSAL-ONLY - a phase that declares NOTHING attempts the
// contract-covered stray and nothing is written), allow (the declared path
// lands on pure admission), project-file (a flag-declaring phase admits the
// workspace scope and NOTHING else), project-file-not-allowed (the SAME
// workspace target REFUSED by a flag-less SILENT phase despite this
// capability's own flag-TRUE contract - the universal no-permission byte
// inside its own span), tmp-parity (scratch ADMITTED because the phase
// declares the scratch flag), and tmp-negative (the SAME scratch target
// REFUSED on the universal byte by the SILENT window that declares NOTHING -
// the scratch-flag inversion demonstrated live in both directions). The
// closing summary is a disk-check-free narration keyed only on the observed
// iteration count.
//
// What it ALSO exhibits on the COMMAND side: the fenced-bash demonstration
// - nine further PLAIN-PHASE probes after the write-tool family, under the
// SAME single span, in fixed order, each driving ONLY a bash tool call
// (no write or edit usage): bash-deny (the SHARED stray target REFUSED by
// the kernel fence over the SAME path the write gate refused earlier in TWO
// PRESCRIBED shapes, each attempted exactly once in the SAME settled run -
// the BARE invocation carries the FULL VOICE: non-zero exit, the command's
// own permission diagnostic, the trailing standing note whose listing is
// NONE, while the SEMICOLON-JOINED EXIT-0 COMPOUND proves ENFORCEMENT-
// LIVENESS over the exact shape that left the quality gate's negative
// probes note-silent: the diagnostic stays visible, the note stays
// CORRECTLY SILENT by the shipped corner, and the file NEVER LANDS in
// either shape), bash-allow
// (the canonical concrete-file shape: the phase declares the GENUINE
// file itself - the very path the fenced command creates in both
// mandated shapes, matching the capability's own coverage pattern - so
// the strictly-concrete survivor engages the composed fence over its
// ENVELOPE directory and the kernel fence admits the command's write BY
// IDENTITY: both shapes complete with NOTHING appended, and the
// admitted file is LEFT BEHIND at end of run), bash-project-file (the
// project-files SCOPE class admits the
// workspace directory the SHARED cwd target sits in; SELF-CLEANING post-rm
// after the phase), bash-project-file-not-allowed (the SAME cwd target
// REFUSED by the SILENT window despite this capability's own flag-TRUE
// contract; the template PRESCRIBES the BARE invocation so the note-bearing
// tail is guaranteed), bash-tmp-parity (the SHARED scratch target ADMITTED
// by the phase's OWN scratch flag), and bash-tmp-negative (the SAME scratch
// target REFUSED by the SILENT window; the template PRESCRIBES the BARE
// invocation so the note-bearing tail is guaranteed; its pre-phase sweep
// removes the parity residue WITHIN the run - end-of-run scratch state
// ABSENT BY DESIGN), bash-file-create (the engaged-path file-leaf family
// over the GENUINE file token - the not-yet-existing existence state: the
// phase declares the ABSOLUTE leaf alone and the fenced command creates
// it with a plain shell redirection; the clean on-list completion appends
// NOTHING), bash-file-append (the PRE-EXISTING existence state over the
// SAME leaf with no restart between frames - the fixed phase order seeds
// it: the fenced command appends one pinned short line and reads the
// WHOLE file back, so the FINAL CONTENT is the previous content PLUS the
// appended line), and bash-file-sibling (the FILE-EXACTNESS leg: the
// fenced command creates the declared leaf, which COMMITS with no appended
// note, then ATTEMPTS two UNDECLARED siblings - the pattern-non-matching
// basename and the pattern-matching one - each as a bare invocation, each
// exactly once; both may APPEAR TO SUCCEED, yet NEITHER ever reaches the
// real environment: after the run the settlement check admits ONLY the
// declared leaf and appends a machine-derived line naming exactly each
// discarded entry and rendering the allowed set - admission tracks
// EXACTLY the judgment the write and edit tools receive, so even the
// pattern-matching sibling is outside it). The three ADMITTED artifacts
// are LEFT BEHIND at end of run (the admission showcase - cross-run
// self-healing stands via the next run's pre-phase sweeps); the siblings
// leave NO residue (discarded by construction).
// Adjacent frames flip the verdict over the SAME targets across the
// tool/kernel boundary with no restart between frames - and the flip is
// ALSO visible in-transcript at every phase start: the trailing
// phase-permissions disclosure block makes the per-frame writable set
// readable (admitting windows name their class; silent windows carry no
// writable-target lines), beside the note-bearing refused attempts.
//
// Outcome model: NO raw terminal writes — the phase prompts ARE the
// in-stream statements, and the machine ledger (the terminal record's
// `outputs`) carries the settled ABSOLUTE placement once the base's settle
// seam has transformed the returned slot-relative token.
//
// Repeatable reset: immediately before each gated or probed phase the known
// artifacts are unlink-swallowed - repeatability HYGIENE (the sweeps are
// writes, not checks): a surviving stale copy would let a prior run's
// residue contaminate this run's readings, and swallowing is deliberate so
// a stale artifact never aborts the demonstration. The end-of-run scratch
// state is ABSENT BY DESIGN: the sixth probe's pre-phase sweep removes the
// tmp-parity admitted residue WITHIN the run (cross-run self-healing stands;
// the sweeps remain writes, not checks).
//
// The guarded phase is DECLARATION-ONLY (a write declaration plus the floor;
// no stopping hook, no budget ceiling): with the floor consumed, the
// settlement gate plus its own ceiling are the SOLE settlement authority —
// the canonical teaching example. Engine faults (the ceiling-exhaustion
// ContractViolationError) propagate VERBATIM out of call() — never wrapped
// or downgraded; the base catch-all captures them into the typed ok:false
// settlement. Em dashes are U+2014 (escaped) in every pinned byte below.

import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type CapabilityParams,
  deriveStateRootFromAgentDir,
  PioCapability,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";

/** One-line catalog description (SOLE OWNER of the pinned bytes; the loader
 * suite replica names this owner). Surfaced by the on-demand catalog walk. */
export const DESCRIPTION =
  "Demonstration of missing-deliverable protection: a run deliberately skips writing its required file, the engine forces a corrected retry until the file exists, and the outcome is stated.";

/** The FIXED project-slot-relative artifact token (shrink-only tunable; the
 * suite rows reference this constant, never a duplicated literal). */
export const GUARDS_DEMO_ARTIFACT = "guards-demo/guard-probe.md";

/** The DENY probe's LEGAL artifact (slot-relative, covered by the demo
 * pattern; declared in-phase — the only granted target of the probe). */
export const GUARDS_DEMO_DENY_ARTIFACT = "guards-demo/deny-artifact.md";

/** The DENY probe's STRAY artifact (slot-relative, covered by the demo
 * pattern, but UNDECLARED in-phase — expected-to-be-refused as if
 * undeclared; distinct from the legal artifact). */
export const GUARDS_DEMO_DENY_STRAY = "guards-demo/deny-stray.md";

/** The ALLOW probe's artifact (slot-relative, covered by the demo pattern;
 * declared in-phase — the admission lands on it). */
export const GUARDS_DEMO_ALLOW_ARTIFACT = "guards-demo/allow-artifact.md";

/** The PROJECT-FILE probe's WORKSPACE-cwd basename — deliberately outside
 * every contract.writes pattern (a plain .txt under the launch cwd; the
 * phase admits it via the project-files SCOPE class alone). */
export const GUARDS_DEMO_PROJECT_PROBE_FILE =
  "pio-guards-demo-project-file-probe.txt";

/** The TMP-PARITY probe's unique pinned /tmp/ basename (the standing
 * real-/tmp exception: the pre-phase sweep self-heals across runs; the
 * end-of-run scratch state is ABSENT BY DESIGN - the sixth probe's
 * pre-phase sweep removes the admitted residue WITHIN the run). */
export const GUARDS_DEMO_TMP_PARITY_FILE =
  "pio-guards-demo-tmp-parity-scratch.txt";

/** The BASH-ALLOW probe's DECLARED FILE (slot-relative, covered by the demo
 * pattern): a GENUINE file token - the very path the fenced command
 * creates in both mandated shapes. Canonical concrete-file shape: the
 * strictly-concrete survivor engages the composed fence over its ENVELOPE
 * directory, and the kernel fence admits the path BY IDENTITY (clean
 * completion - no standing note, no discard line). Supersedes the retired
 * round-3 .md-directory device (records history: the pre-overlay
 * workaround; doctrine violation per owner rulings B+D). */
export const GUARDS_DEMO_BASH_ALLOW_FILE = "guards-demo/bash-allow.md";

/** The SHARED genuine file token for the BASH-FILE-CREATE and
 * BASH-FILE-APPEND probes (slot-relative, covered by the demo pattern):
 * ONE leaf over BOTH existence states - the not-yet-existing create state
 * and the pre-existing append state, fixed-order within ONE invocation.
 * A GENUINE file token (distinct from the bash-allow directory device). */
export const GUARDS_DEMO_BASH_FILE_LEAF = "guards-demo/bash-file-leaf.md";

/** The BASH-FILE-SIBLING probe's DECLARED leaf L (slot-relative, covered
 * by the demo pattern): the sole admitted target of the probe - the
 * file-exactness leg commits it while its undeclared siblings never land.
 */
export const GUARDS_DEMO_BASH_SIBLING_LEAF = "guards-demo/bash-sibling-leaf.md";

/** The BASH-FILE-SIBLING probe's OUT-PATTERN sibling (slot-relative): a
 * basename the coverage pattern does NOT admit (the .txt extension is the
 * discriminator) - UNDECLARED in-phase; expected-to-be-discarded by the
 * post-run check with the machine-appended named line. */
export const GUARDS_DEMO_BASH_SIBLING_OUT_PAT =
  "guards-demo/bash-sibling-out-pattern.txt";

/** The BASH-FILE-SIBLING probe's IN-PATTERN sibling (slot-relative):
 * covered by the pattern yet UNDECLARED in-phase (the strictness
 * discriminator - matching the pattern is not admitting) -
 * expected-to-be-discarded alike. */
export const GUARDS_DEMO_BASH_SIBLING_IN_PAT =
  "guards-demo/bash-sibling-in-pattern.md";

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

/** The pinned deny-probe instruction template (PINNED bytes; the suite
 * replica names this owner). REFUSAL-ONLY: a single PARAMETER (the stray
 * absolute path) - the probe performs ONLY the refused attempt and contains
 * NO write of any kind, so the phase declares NOTHING and settles with
 * nothing produced. Three beats: attempt-imperative / expectation /
 * one-sentence verdict; no em dash occurs in the body. */
function denyInstructions(absoluteStrayArtifact: string): string {
  return `Attempt to write a file ${absoluteStrayArtifact}. The expectation is that it's rejected. Describe in one sentence if it's satisfied.`;
}

/** The pinned allow-probe instruction template (PINNED bytes; the suite
 * replica names this owner). Three beats: imperative / expectation /
 * one-sentence verdict. Em dashes are U+2014 (escaped). */
function allowInstructions(absoluteArtifact: string): string {
  return `Write a file ${absoluteArtifact}. The expectation is that the write is ADMITTED with nothing special declared beyond the path itself \u2014 the phase declared exactly this one path. Describe in one sentence if it's satisfied.`;
}

/** The pinned project-file instruction template (PINNED bytes; the suite
 * replica names this owner). Three beats: imperative / expectation /
 * one-sentence verdict. No stray-attempt mandate — deterministic single
 * creation; the exclusive-governance proof lives in the suite's mid-pass
 * consultation. Em dashes are U+2014 (escaped). */
function projectFileInstructions(absoluteCwdFile: string): string {
  return `Write a file ${absoluteCwdFile}. The expectation is that it LANDS with the phase declaring the project-files SCOPE and NO specific paths. Describe in one sentence if it's satisfied.`;
}

/** The pinned not-allowed probe instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE settled turn for
 * the flag-less SILENT plain phase: attempt the SAME shared workspace target
 * the sibling project-file probe admitted moments earlier; expect the
 * refusal (this phase declares NOTHING and the running capability's own
 * flag-TRUE contract changes nothing); the universal byte attributes to NO
 * layer, so there is NO capability-attribution mandate. Three beats:
 * attempt-imperative / expectation / one-sentence verdict. Em dashes are
 * U+2014 (escaped). */
function notAllowedInstructions(absoluteSharedCwdFile: string): string {
  return `Attempt to write a file ${absoluteSharedCwdFile}. The expectation is that the write comes back REFUSED \u2014 this phase declares NOTHING (no paths, no scope flag), and the running capability's own contract flag being TRUE changes nothing \u2014 the refusal states the allowed set as NONE; do not retry the target. Describe in one sentence if it's satisfied.`;
}

/** The pinned tmp-parity instruction template (PINNED bytes; the suite
 * replica names this owner). The DECLARED-scratch form: the grant rides the
 * phase's own scratch flag, while the same target is refused in any window
 * where no active phase declares it. Three beats: imperative / expectation /
 * one-sentence verdict. Em dashes are U+2014 (escaped). */
function tmpParityInstructions(absoluteScratchFile: string): string {
  return `Write a file ${absoluteScratchFile}. The expectation is that the scratch write is ADMITTED because this phase declares the scratch flag \u2014 the same scratch target is REFUSED in any window where no active phase declares it (the grant is phase-declared, not ambient). Describe in one sentence if it's satisfied.`;
}

/** The pinned tmp-negative instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). ONE settled turn for the
 * SILENT scratch-refusal window over the SAME pinned scratch target the
 * tmp-parity probe admitted moments earlier: expect the refusal (this phase
 * declares NOTHING - no paths, no scope flag, no scratch flag - and the
 * running capability's own flag-TRUE contract changes nothing, while the
 * SAME target was admitted moments earlier by the adjacent probe's OWN
 * declared scratch flag: the grant is phase-declared, not ambient); the
 * universal byte attributes to NO layer, so there is NO
 * capability-attribution mandate. Three beats: attempt-imperative /
 * expectation / one-sentence verdict. Em dashes are U+2014 (escaped). */
function tmpNegativeInstructions(absoluteScratchFile: string): string {
  return `Attempt to write a file ${absoluteScratchFile}. The expectation is that the write comes back REFUSED \u2014 this phase declares NOTHING (no paths, no scope flag, no scratch flag), and the running capability's own contract flag being TRUE changes nothing, while the SAME target was admitted moments earlier by the adjacent probe's OWN declared scratch flag (the grant is phase-declared, not ambient); do not retry the target. Describe in one sentence if it's satisfied.`;
}

/** The pinned bash-deny instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). ONE parameter (the stray
 * absolute path - REUSED verbatim from the write-tool deny probe): the
 * fenced command attempts the SAME off-list target the write gate refused
 * earlier in TWO PRESCRIBED shapes, each exactly once within the SAME
 * settled run - SHAPE 1 the BARE redirection AS THE WHOLE COMMAND (the FULL
 * VOICE: non-zero exit, the command's own permission diagnostic, the
 * trailing standing note whose model-facing listing degrades to NONE
 * because this phase declares NOTHING) and SHAPE 2 the SAME redirection
 * joined by a SEMICOLON with a trailing successful statement (the POSIX
 * last-statement liveness leg over the exact shape that left the quality
 * gate's negative probes note-silent: the diagnostic stays visible, the
 * compound exits zero, the note stays CORRECTLY SILENT by the shipped
 * corner, the file NEVER LANDS); the expectation references the
 * phase-permissions context CONCEPTUALLY (names NO writable targets) and
 * POSITION-NEUTRALLY (shipped placement is trailing; no direction is
 * asserted). Three beats: attempt-imperative / expectation / one-sentence
 * verdict. No em dash occurs in the body. */
function bashDenyInstructions(absoluteStrayArtifact: string): string {
  return `Use the bash tool ONLY (never the write or edit tools) to attempt a shell write of a file ${absoluteStrayArtifact} in TWO shapes, each attempted exactly once: first the redirection AS THE WHOLE COMMAND (a bare invocation such as echo x > ${absoluteStrayArtifact}), then the SAME redirection followed by a semicolon and a trailing successful statement (such as echo x > ${absoluteStrayArtifact}; echo ok - the failed redirection fails only its own statement, so the compound exits zero). The expectation is that BOTH commands come back REFUSED - the phase-permissions context of this run names NO writable targets (this phase declares NOTHING), and the kernel fence denies the write at attempt time: the first exits non-zero with a permission error in its own output and ends with a standing restriction note whose allowed-targets listing is NONE, while the second shows the same permission error but exits zero with no trailing restriction note, and the file never exists after either attempt. Do not attempt the target beyond these two shapes. Describe in one sentence if it's satisfied.`;
}

/** The pinned bash-allow instruction template (SOLE OWNER of these PINNED
 * bytes; the suite replica names this owner). ONE parameter (the DECLARED
 * file's absolute path - the GENUINE file token the phase declares): the
 * fenced command creates the declared file ITSELF in the SAME TWO shapes
 * (a plain shell redirection AS THE WHOLE COMMAND, then a program opening
 * the path for write - coreutils-steered, interpreter-avoided; the
 * dual-shape discipline carried verbatim from the retired device era).
 * The kernel fence admits the declared path BY IDENTITY: clean transcript
 * (neither command produces a standing restriction note or a discard
 * line) and the file EXISTS after the run. Three beats: imperative /
 * expectation / one-sentence verdict. No em dash occurs in the body. The
 * multi-parameter claim belongs to bashFileSiblingInstructions alone. */
function bashAllowInstructions(absoluteFile: string): string {
  return `Use the bash tool ONLY (never the write or edit tools) to create a file ${absoluteFile} AT THE EXACT path in TWO shapes: first a plain shell redirection AS THE WHOLE COMMAND (such as echo '<short line>' > ${absoluteFile}), then a program that opens the path for write (a standard utility such as touch, cp, or dd - avoid scripting-language interpreters). The expectation is that BOTH writes are ADMITTED - the phase declares the very path the file lands on, so the kernel fence admits that path by identity and neither command produces a standing restriction note or a discard line: the file EXISTS after the run and the transcript stays clean. Describe in one sentence if it's satisfied.`;
}

/** The pinned bash-project-file instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE parameter (the
 * SHARED workspace-cwd absolute path - REUSED verbatim from the write-tool
 * twin): the phase declares the project-files SCOPE, so the kernel fence
 * admits the workspace directory the file sits in. Three beats: imperative
 * / expectation / one-sentence verdict. No em dash occurs in the body. */
function bashProjectFileInstructions(absoluteCwdFile: string): string {
  return `Use the bash tool ONLY (never the write or edit tools) to write a file ${absoluteCwdFile} with a shell command. The expectation is that it LANDS - the phase declares the project-files SCOPE, so the kernel fence admits the workspace directory the file sits in. Describe in one sentence if it's satisfied.`;
}

/** The pinned bash-project-file-not-allowed instruction template (SOLE
 * OWNER of these PINNED bytes; the suite replica names this owner). ONE
 * parameter (the SAME shared cwd absolute path the adjacent probe admitted
 * moments earlier): the SILENT window (no paths, no scope flag) leaves the
 * kernel set at the machine allowance, so the attempt comes back REFUSED
 * with the standing note's listing rendering NONE - the do-not-retry
 * mandate rides the template, and the template records ONE additive
 * shape-prescription clause (the BARE invocation, inserted between the
 * imperative and the expectation) so the note-bearing tail is GUARANTEED
 * rather than dependent on agent whim. Three beats: attempt-imperative /
 * expectation / one-sentence verdict. No em dash occurs in the body. */
function bashProjectFileNotAllowedInstructions(
  absoluteSharedCwdFile: string,
): string {
  return `Use the bash tool ONLY (never the write or edit tools) to attempt a shell write of a file ${absoluteSharedCwdFile}. Issue the redirection AS THE WHOLE COMMAND (a bare invocation). The expectation is that the command comes back REFUSED - this phase declares NOTHING (no paths, no scope flag), so the kernel fence grants nothing beyond the machine allowance and the output ends with a standing restriction note whose allowed-targets listing is NONE, while the SAME target was admitted earlier by the adjacent probe's OWN declared scope. Do not retry the target. Describe in one sentence if it's satisfied.`;
}

/** The pinned bash-tmp-parity instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE parameter (the
 * SHARED scratch absolute path - REUSED verbatim from the write-tool
 * twin): the grant rides the phase's OWN scratch flag (phase-declared, not
 * ambient), so the kernel fence grants the /tmp/ prefix class. Three beats:
 * imperative / expectation / one-sentence verdict. No em dash occurs in
 * the body. */
function bashTmpParityInstructions(absoluteScratchFile: string): string {
  return `Use the bash tool ONLY (never the write or edit tools) to write a file ${absoluteScratchFile} with a shell command. The expectation is that the scratch write is ADMITTED - the phase declares the scratch flag, so the kernel fence grants the /tmp/ prefix class (the grant is phase-declared, not ambient). Describe in one sentence if it's satisfied.`;
}

/** The pinned bash-tmp-negative instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE parameter (the
 * SAME pinned scratch absolute path the adjacent probe admitted moments
 * earlier): the SILENT window (no paths, no scope flag, no scratch flag)
 * leaves the kernel set at the machine allowance, so the attempt comes
 * back REFUSED with the standing note's listing rendering NONE - the
 * do-not-retry mandate rides the template, and the template records ONE
 * additive shape-prescription clause (the BARE invocation, inserted
 * between the imperative and the expectation) so the note-bearing tail is
 * GUARANTEED rather than dependent on agent whim. Three beats:
 * attempt-imperative / expectation / one-sentence verdict. No em dash
 * occurs in the body. */
function bashTmpNegativeInstructions(
  absoluteSharedScratchFile: string,
): string {
  return `Use the bash tool ONLY (never the write or edit tools) to attempt a shell write of a file ${absoluteSharedScratchFile}. Issue the redirection AS THE WHOLE COMMAND (a bare invocation). The expectation is that the command comes back REFUSED - this phase declares NOTHING (no paths, no scope flag, no scratch flag), so the kernel fence grants nothing beyond the machine allowance and the output ends with a standing restriction note whose allowed-targets listing is NONE, while the SAME target was admitted moments earlier by the adjacent probe's OWN declared scratch flag. Do not retry the target. Describe in one sentence if it's satisfied.`;
}

/** Pinned bash-file-create instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE parameter (the
 * SHARED genuine file leaf absolute path): the engaged-path create state
 * over the not-yet-existing existence state - the fenced command creates
 * the declared leaf with a PLAIN shell redirection, so the write is
 * ADMITTED by identity with a CLEAN completion (nothing restriction-shaped
 * is appended). Three beats: imperative / expectation / one-sentence
 * verdict. No em dash occurs in the body. */
function bashFileCreateInstructions(absoluteLeaf: string): string {
  return `Use the bash tool ONLY (never the write or edit tools) to create a file ${absoluteLeaf} AT THE EXACT path with a PLAIN shell redirection (such as echo '<short line>' > ${absoluteLeaf}) writing one minimal short line of content and nothing else in the command. The expectation is that the write is ADMITTED because THIS PHASE DECLARED EXACTLY THIS FILE (the phase's writable set names it): the command completes without error and appends NOTHING - no standing restriction note, no discard line (the clean on-list completion). Describe in one sentence if it's satisfied.`;
}

/** Pinned bash-file-append instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). ONE parameter (the
 * SAME shared genuine file leaf - the pre-existing existence state: the
 * fixed phase order guarantees the seed from the immediately preceding
 * probe, no restart between frames): the fenced command APPENDS one pinned
 * short line with a standard utility and reads the WHOLE file back within
 * the same settled run; the FINAL CONTENT is the previous content PLUS
 * the appended line, the read sees the real content while the write lands
 * via the capture-then-commit path, and the verdict beat demands the
 * final-content statement. Beats: precondition / imperative / expectation
 * / one-sentence verdict. No em dash occurs in the body. */
function bashFileAppendInstructions(absoluteLeaf: string): string {
  return `The file ${absoluteLeaf} EXISTS from the immediately preceding probe (same session, fixed phase order - no restart between frames). Use the bash tool ONLY (never the write or edit tools) to APPEND one pinned short line to the file with a standard utility (such as printf '<one line>'\\n >> ${absoluteLeaf} or cat >> ${absoluteLeaf}), then read the WHOLE file back (such as cat ${absoluteLeaf}) within the same settled run. The expectation is that the read-back shows BOTH the earlier created content AND the appended line - the FINAL CONTENT is the previous content PLUS the appended line: the read sees the real content while the write lands via the capture-then-commit path, and nothing restriction-shaped is appended. Your verdict must STATE that the file now contains the previously written content plus the appended line. Describe in one sentence if it's satisfied.`;
}

/** Pinned bash-file-sibling instruction template (SOLE OWNER of these
 * PINNED bytes; the suite replica names this owner). THREE parameters (the
 * declared leaf FIRST, then the two UNDECLARED siblings - the out-pattern
 * basename, then the in-pattern one): the FILE-EXACTNESS leg - beat one
 * creates the declared leaf (ADMITTED, lands with no appended note), beats
 * two and three ATTEMPT the siblings each exactly once, each prescribed as
 * a BARE invocation (the redirection IS the whole command; the clause
 * repeats once per prescribed attempt so each shape is GUARANTEED rather
 * than dependent on agent whim), in the prescribed order with the
 * do-not-retry mandate. Both sibling attempts may APPEAR TO SUCCEED (the
 * masked exit is not the verdict): after the run, ONLY the declared leaf
 * is admitted - admission follows EXACTLY the same judgment the write and
 * edit tools receive (identity over the declared leaf; this window
 * activates neither class scope) - and EACH sibling's run ends with the
 * machine-appended line naming exactly the discarded entry and rendering
 * the allowed set; the pattern-matching sibling is OUTSIDE the admission
 * alike (matching the pattern is not declaring). Beats: three-beat attempt
 * sequence / shipped-form expectation / one-sentence verdict. No em dash
 * occurs in the body. */
function bashFileSiblingInstructions(
  absoluteLeaf: string,
  absoluteOutPattern: string,
  absoluteInPattern: string,
): string {
  return `Use the bash tool ONLY (never the write or edit tools). Beat 1: create the declared leaf ${absoluteLeaf} with a plain shell redirection (such as echo '<short line>' > ${absoluteLeaf}) writing one minimal short line - it is ADMITTED (this phase declared it) and must land with no appended note. Beat 2: then ATTEMPT the out-pattern sibling ${absoluteOutPattern} exactly once: Issue the redirection AS THE WHOLE COMMAND (a bare invocation). Beat 3: then ATTEMPT the in-pattern sibling ${absoluteInPattern} exactly once: Issue the redirection AS THE WHOLE COMMAND (a bare invocation). Prescribed order: the declared leaf first, then the out-pattern sibling, then the in-pattern sibling; DO NOT RETRY either target, and do not attempt any other file. The expectation is that BOTH sibling attempts may APPEAR TO SUCCEED (no permission error in their own output - the command's view accepts them; the exit is not the verdict), yet NEITHER sibling file EXISTS afterward (after the run, the fence checks what the command wrote against the phase's writable set and DISCARDS everything the frame did not admit); admission follows EXACTLY the same judgment the write and edit tools receive: ONLY the declared file itself is admitted (this phase declares no workspace- or scratch-scope grants, so no class scope admits anything here), and EVEN the sibling matching the frame's own file pattern is OUTSIDE the admission (matching the pattern is not declaring); EACH sibling's run ends with a MACHINE-APPENDED LINE naming exactly the discarded entry and rendering the allowed set (that line, not the command's own output, is the readable refusal). Describe in one sentence if it's satisfied.`;
}

/** The pinned summary template (PINNED bytes; the suite replica names this
 * owner). Variant selection keys ONLY on the observed iteration count (A:
 * >= 2 — the guard denied first-pass settlement and forced the corrective
 * re-run, naming the count; B: === 1 — armed but NOT triggered); there is no
 * third variant. Disk-check-free closing narration: the placement line is
 * FIXED (naming the ABSOLUTE artifact path) and no per-probe disk booleans
 * exist — the module performs no disk observation feeding any wording. It
 * ends with the standard closing order (state what was demonstrated, naming
 * the fifteen gate probes, then end the turn right after). Em dashes are
 * U+2014 (escaped). */
function summaryInstructions(
  absoluteArtifact: string,
  iterations: number,
): string {
  const outcome =
    iterations >= 2
      ? `The guard demonstration has finished after ${iterations} runs: the engine's expectation guard DENIED first-pass settlement \u2014 the declared deliverable was missing \u2014 and FORCED the corrective re-run until the file existed.`
      : `The guard demonstration has finished after 1 run: the expectation guard's loop was ARMED but NOT triggered \u2014 the deliverable landed on the very first run, so the engine settled it immediately.`;
  return `${outcome}
The deliverable is placed at (absolute path):
${absoluteArtifact}
1. State in one short sentence what was demonstrated, naming the fifteen gate probes: deny, allow, project-file, project-file-not-allowed, tmp-parity, tmp-negative, and the nine bash-command probes: bash-deny, bash-allow, bash-project-file, bash-project-file-not-allowed, bash-tmp-parity, bash-tmp-negative, bash-file-create, bash-file-append, bash-file-sibling.
2. Do nothing else \u2014 no further tools, no questions, no writes. End your turn right after that statement.`;
}

export default class GuardsDemoCapability extends PioCapability {
  readonly contract: Contract = {
    name: "guards-demo",
    version: "0.7.0",
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

    // Derivation escapes PRE-EVERYTHING (zero prompts on an env defect):
    // the typed capture in the terminal record IS the human-facing surfacing.
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());
    const projectSlot = join(stateRoot, "projects", projectKey);
    const absoluteArtifact = join(projectSlot, GUARDS_DEMO_ARTIFACT);
    const absoluteDenyArtifact = join(projectSlot, GUARDS_DEMO_DENY_ARTIFACT);
    const absoluteDenyStray = join(projectSlot, GUARDS_DEMO_DENY_STRAY);
    const absoluteAllowArtifact = join(projectSlot, GUARDS_DEMO_ALLOW_ARTIFACT);
    const absoluteCwdFile = join(process.cwd(), GUARDS_DEMO_PROJECT_PROBE_FILE);
    const absoluteTmpScratch = join("/tmp", GUARDS_DEMO_TMP_PARITY_FILE);
    const absoluteBashAllowFile = join(
      projectSlot,
      GUARDS_DEMO_BASH_ALLOW_FILE,
    );
    const absoluteBashFileLeaf = join(projectSlot, GUARDS_DEMO_BASH_FILE_LEAF);
    const absoluteBashSiblingLeaf = join(
      projectSlot,
      GUARDS_DEMO_BASH_SIBLING_LEAF,
    );
    const absoluteBashSiblingOutPattern = join(
      projectSlot,
      GUARDS_DEMO_BASH_SIBLING_OUT_PAT,
    );
    const absoluteBashSiblingInPattern = join(
      projectSlot,
      GUARDS_DEMO_BASH_SIBLING_IN_PAT,
    );

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

    // 4. DENY probe - REFUSAL-ONLY: the probe performs ONLY the refused
    // attempt and contains NO write of any kind (the stray at its exact
    // absolute path comes back refused on the universal byte), so the
    // phase declares NOTHING (options EXACTLY { instructions, min, max } -
    // attach abstention) and settles with nothing produced. Pre-phase sweeps
    // clear BOTH targets (idempotent cross-run hygiene - the legal sweep
    // defends against legacy artifacts of older vehicle shapes). One settled
    // run.
    await rm(absoluteDenyArtifact, { force: true }).catch(() => {});
    await rm(absoluteDenyStray, { force: true }).catch(() => {});
    await this.execute_phase("deny", {
      instructions: denyInstructions(absoluteDenyStray),
      min: 1,
      max: 1,
    });

    // 5. ALLOW probe — declares its own artifact; the write lands BY
    // ADMISSION. Pre-phase sweep heals a stale copy from a crashed run.
    await rm(absoluteAllowArtifact, { force: true }).catch(() => {});
    await this.execute_phase("allow", {
      instructions: allowInstructions(absoluteAllowArtifact),
      min: 1,
      max: 1,
      write: [absoluteAllowArtifact],
    });

    // 6. PROJECT-FILE probe — the phase declares the project-files SCOPE
    // ONLY (no write bag): the effective set is the cwd-scope class ALONE,
    // backed by this capability's own contract flag. No stray-attempt
    // mandate in the live template - deterministic single creation; the
    // exclusive-governance proof is the suite's mid-pass consultation.
    // SELF-CLEANING: the probe file is removed after the phase (a hygiene
    // WRITE, not a check; no standing artifact in the repo working dir); the
    // pre-phase sweep covers a crash-survivor copy.
    await rm(absoluteCwdFile, { force: true }).catch(() => {});
    await this.execute_phase("project-file", {
      instructions: projectFileInstructions(absoluteCwdFile),
      min: 1,
      max: 1,
      allowProjectWrites: true,
    });
    await rm(absoluteCwdFile, { force: true }).catch(() => {});

    // 7. PROJECT-FILE-NOT-ALLOWED probe - the SAME shared workspace-cwd
    // target under a FLAG-LESS SILENT phase: the options object is EXACTLY
    // { instructions, min, max } (option ABSENCE is the silence - no bag,
    // no flag, so the phase slot stays EMPTY: attach abstention). DESPITE
    // this capability's own flag-TRUE contract the SAME target the
    // project-file probe admitted moments earlier is REFUSED on the
    // universal no-permission byte - the exact case the ruling retired.
    // The pre-phase sweep (error-swallowed unlink) stays PURE HYGIENE: a
    // crash-survivor copy must not contaminate the run; it is a write, not
    // a check.
    await rm(absoluteCwdFile, { force: true }).catch(() => {});
    await this.execute_phase("project-file-not-allowed", {
      instructions: notAllowedInstructions(absoluteCwdFile),
      min: 1,
      max: 1,
    });

    // 8. TMP-PARITY probe - the STANDING LIVE DEMONSTRATION OF GRANTED
    // SCRATCH: the phase DECLARES the scratch flag (single-flag doctrine -
    // no contract-side counterpart), so the /tmp/ prefix class is ACTIVE
    // while this phase governs - and in any window where no active phase
    // declares it the SAME target is refused (the grant is phase-declared,
    // not ambient). The pre-phase sweep runs FIRST (cross-run self-healing);
    // the admitted residue is removed again by the next probe's pre-phase
    // sweep (end-of-run state ABSENT BY DESIGN).
    await rm(absoluteTmpScratch, { force: true }).catch(() => {});
    await this.execute_phase("tmp-parity", {
      instructions: tmpParityInstructions(absoluteTmpScratch),
      min: 1,
      max: 1,
      tmpDirAllowed: true,
    });

    // 9. TMP-NEGATIVE probe - the NEGATIVE-SCRATCH direction (the house
    // ADMIT-then-REFUSE same-target pair precedent over the scratch pole):
    // the SAME pinned scratch target that tmp-parity admitted moments
    // earlier is now REFUSED on the universal no-permission byte by the
    // SILENT window that declares NOTHING (options EXACTLY { instructions,
    // min, max } - attach abstention, so the phase slot stays EMPTY: the
    // grant is phase-declared, not ambient, and nothing is demanded, so
    // the settlement gate is armed for nothing - the scratch-flag
    // inversion demonstrated live in both directions). The pre-phase sweep
    // runs FIRST (identical hygiene idiom - a WRITE, not a check): it
    // self-heals cross-run residue AND removes the admitted tmp-parity
    // residue WITHIN the run (end-of-run state ABSENT BY DESIGN). One
    // settled run.
    await rm(absoluteTmpScratch, { force: true }).catch(() => {});
    await this.execute_phase("tmp-negative", {
      instructions: tmpNegativeInstructions(absoluteTmpScratch),
      min: 1,
      max: 1,
    });

    // 10. BASH-DENY probe - the fenced-command OFF-LIST leg over the SHARED
    // stray target the write-tool deny probe refused earlier: the kernel
    // fence denies the write at attempt time over the SAME path (cross-
    // mechanism same-target refusal), the command exits non-zero with its
    // own permission diagnostic plus the standing restriction note whose
    // model-facing listing renders NONE (this phase declares NOTHING - the
    // minimum fence). Pre-sweep (error-swallowed unlink - a WRITE, not a
    // check) clears a crash-survivor copy. Options EXACTLY { instructions,
    // min, max } - attach abstention. One settled run.
    await rm(absoluteDenyStray, { force: true }).catch(() => {});
    await this.execute_phase("bash-deny", {
      instructions: bashDenyInstructions(absoluteDenyStray),
      min: 1,
      max: 1,
    });

    // 11. BASH-ALLOW probe - the fenced-command ON-LIST leg over the
    // canonical concrete-file shape: the phase declares the GENUINE file
    // itself (the strictly-concrete survivor engaging the composed fence
    // over its ENVELOPE directory), and the fenced command creates the
    // declared file ITSELF in both mandated shapes - the kernel fence
    // admits the path BY IDENTITY (clean completion: no standing note, no
    // discard line). Pre-phase sweep: the PLAIN error-swallowed unlink the
    // sibling leaf probes use (a WRITE, not a check; a stale survivor
    // degrades to an overwrite). Bag: ONE entry (the declared ABSOLUTE
    // file). Options EXACTLY { instructions, min, max, write: [file] }.
    // The declared file is LEFT BEHIND at end of run (the admission
    // showcase; the plain sweep self-heals across runs). One settled run.
    await rm(absoluteBashAllowFile, { force: true }).catch(() => {});
    await this.execute_phase("bash-allow", {
      instructions: bashAllowInstructions(absoluteBashAllowFile),
      min: 1,
      max: 1,
      write: [absoluteBashAllowFile],
    });

    // 12. BASH-PROJECT-FILE probe - the SAME shared workspace-cwd target the
    // write-tool twin admitted moments earlier, now over the SCOPE class:
    // the phase declares the project-files flag (NO write bag), so the
    // kernel set gains the workspace-cwd class and the command's write
    // LANDS. SELF-CLEANING: the probe file is removed after the phase (a
    // hygiene WRITE, not a check - no standing artifact in the repo working
    // dir); the pre-phase sweep covers a crash-survivor copy.
    await rm(absoluteCwdFile, { force: true }).catch(() => {});
    await this.execute_phase("bash-project-file", {
      instructions: bashProjectFileInstructions(absoluteCwdFile),
      min: 1,
      max: 1,
      allowProjectWrites: true,
    });
    await rm(absoluteCwdFile, { force: true }).catch(() => {});

    // 13. BASH-PROJECT-FILE-NOT-ALLOWED probe - the SAME shared cwd target
    // under the FLAG-LESS SILENT window: options EXACTLY { instructions,
    // min, max } (option ABSENCE is the silence - no bag, no flag, so the
    // phase slot stays EMPTY: attach abstention), so the kernel set is the
    // minimum machinery allowance and the command's attempt comes back
    // REFUSED with the standing note's listing rendering NONE - DESPITE
    // this capability's own flag-TRUE contract, mirroring the write-tool
    // twin. Pre-sweep only (crash-survivor hygiene - a WRITE, not a check;
    // no post-rm, mirroring the write-tool twin).
    await rm(absoluteCwdFile, { force: true }).catch(() => {});
    await this.execute_phase("bash-project-file-not-allowed", {
      instructions: bashProjectFileNotAllowedInstructions(absoluteCwdFile),
      min: 1,
      max: 1,
    });

    // 14. BASH-TMP-PARITY probe - the SHARED scratch target the write-tool
    // tmp-parity probe admitted moments earlier, now over the phase's OWN
    // scratch flag (single-flag doctrine - no contract-side counterpart):
    // the /tmp/ prefix class is ACTIVE while this phase governs (the grant
    // is phase-declared, not ambient), so the command's write LANDS.
    // Pre-sweep runs FIRST (cross-run self-healing); the admitted residue
    // is removed again by the next probe's pre-phase sweep (end-of-run
    // state ABSENT BY DESIGN).
    await rm(absoluteTmpScratch, { force: true }).catch(() => {});
    await this.execute_phase("bash-tmp-parity", {
      instructions: bashTmpParityInstructions(absoluteTmpScratch),
      min: 1,
      max: 1,
      tmpDirAllowed: true,
    });

    // 15. BASH-TMP-NEGATIVE probe - the NEGATIVE direction over the SAME
    // pinned scratch target the previous probe admitted moments earlier:
    // the SILENT window (options EXACTLY { instructions, min, max } -
    // attach abstention) confers no grant beyond the machine allowance, so
    // the command's attempt comes back REFUSED with the standing note's
    // listing rendering NONE. The pre-phase sweep runs FIRST (identical
    // hygiene idiom - a WRITE, not a check): it self-heals cross-run
    // residue AND removes the admitted parity residue WITHIN the run
    // (end-of-run state ABSENT BY DESIGN). One settled run.
    await rm(absoluteTmpScratch, { force: true }).catch(() => {});
    await this.execute_phase("bash-tmp-negative", {
      instructions: bashTmpNegativeInstructions(absoluteTmpScratch),
      min: 1,
      max: 1,
    });

    // 16. BASH-FILE-CREATE probe - the engaged-path file-leaf family over
    // the SHARED genuine file token (the not-yet-existing existence state):
    // the phase declares the ABSOLUTE leaf ALONE, and the fenced command
    // creates it with a plain shell redirection - the clean on-list
    // completion appends NOTHING (no standing note, no discard line).
    // Pre-phase sweep removes prior-run residue INCLUDING appended content
    // (the repeatable create trajectory - the next run resets). Options
    // EXACTLY { instructions, min, max, write: [leaf] } - no scope flag, no
    // scratch flag. The committed leaf is LEFT BEHIND at end of run (the
    // admission showcase; the next run's pre-phase sweep self-heals). One
    // settled run.
    await rm(absoluteBashFileLeaf, { force: true }).catch(() => {});
    await this.execute_phase("bash-file-create", {
      instructions: bashFileCreateInstructions(absoluteBashFileLeaf),
      min: 1,
      max: 1,
      write: [absoluteBashFileLeaf],
    });

    // 17. BASH-FILE-APPEND probe - the PRE-EXISTING existence state over
    // the SAME leaf: the fixed-order seed dependency stands - NO pre-phase
    // sweep here (sweeping would destroy the premise; the create block's
    // sweep is the cross-run self-heal). The fenced command appends one
    // pinned short line and reads the WHOLE file back in the SAME settled
    // run: the FINAL CONTENT is the previous content PLUS the appended
    // line, the read sees the real content while the write lands via the
    // capture-then-commit path, and nothing restriction-shaped is
    // appended. Options EXACTLY { instructions, min, max, write: [leaf] }
    // (the SAME leaf). One settled run.
    await this.execute_phase("bash-file-append", {
      instructions: bashFileAppendInstructions(absoluteBashFileLeaf),
      min: 1,
      max: 1,
      write: [absoluteBashFileLeaf],
    });

    // 18. BASH-FILE-SIBLING probe - the FILE-EXACTNESS leg over the
    // declared leaf: the fenced command creates the declared leaf (it
    // LANDS with no appended note), then ATTEMPTS two UNDECLARED siblings -
    // the out-pattern basename and the pattern-matching one - each as a
    // bare invocation, exactly once, in the prescribed order. Both
    // siblings may APPEAR TO SUCCEED (the masked exit is not the verdict):
    // after the run, the settlement check keeps ONLY the declared leaf and
    // DISCARDS everything else, appending a machine-derived line naming
    // exactly the discarded entry and rendering the allowed set (admission
    // tracks EXACTLY the write/edit judgment - matching the pattern is not
    // declaring). Pre-phase sweeps over ALL THREE artifacts defend against
    // legacy residue (crash-survivor hygiene - writes, not checks; the
    // siblings can never exist in the real environment). The bag carries
    // ONLY the declared leaf (declaring the siblings would admit them by
    // identity and void the probe). Options EXACTLY { instructions, min,
    // max, write: [leaf] }. The committed leaf is LEFT BEHIND at end of
    // run (the admission showcase); the siblings leave NO residue
    // (discarded by construction). One settled run.
    await rm(absoluteBashSiblingLeaf, { force: true }).catch(() => {});
    await rm(absoluteBashSiblingOutPattern, { force: true }).catch(() => {});
    await rm(absoluteBashSiblingInPattern, { force: true }).catch(() => {});
    await this.execute_phase("bash-file-sibling", {
      instructions: bashFileSiblingInstructions(
        absoluteBashSiblingLeaf,
        absoluteBashSiblingOutPattern,
        absoluteBashSiblingInPattern,
      ),
      min: 1,
      max: 1,
      write: [absoluteBashSiblingLeaf],
    });

    // 19. Summary — success-gated by control flow (a rejecting guarded
    // phase never reaches it): ONE settled turn - the DISK-CHECK-FREE
    // closing narration keyed ONLY on the observed iteration count, stated
    // THROUGH THE SESSION STREAM.
    await this.execute_phase("summary", {
      instructions: summaryInstructions(absoluteArtifact, result.iterations),
      min: 1,
      max: 1,
    });

    // 20. Return — the RELATIVE token; the base's settle seam absolutizes it
    // exactly once at success settlement (NEVER the absolute path here).
    return { report: GUARDS_DEMO_ARTIFACT };
  }
}
