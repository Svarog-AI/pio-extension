// The research capability: the first resolvable built-in. A bounded web-
// research loop producing ONE growing markdown file report under the project
// slot, driven by the write-delta stopping rule over a single marker-stamped
// execute_phase.
//
// Outcome model (Step-6 settlement): the capability states its deliverable
// through the SESSION STREAM — what the live terminal presents — and the
// machine ledger (the terminal record's `outputs`) carries the frozen
// project-slot-relative token. Capability code performs NO raw terminal
// writes: preflight/env REFUSAL stderr lines remain capability-owned and
// byte-stable (their bytes, check order, and typed captures are untouched).
//
// State-root derivation (measured necessity): the bubble env quartet is
// exactly HOME / PATH / PI_SANDBOX / PI_CODING_AGENT_DIR — PIO_STATE_DIR is
// NOT propagated into the bubble, so resolveStateRoot MUST NOT be called
// in-bubble for this purpose (its PIO_STATE_DIR/HOME fallback is a
// host-side expression that would silently target the host's ~/.pio).
// PI_CODING_AGENT_DIR is the ONLY state-root channel into the bubble; the
// renderer assigns it UNCONDITIONALLY to `<root>/.pi/agent`, so the CAPABILITY
// BASE inverts that expression (moved there by the Step-6 owner placement
// ruling — the in-bubble state-root channel is a capability-layer concern;
// exactly the two levels the renderer appends: .pi + agent) to recover
// `<root>`. The project key derives from
// process.cwd() because the in-bubble cwd IS the host launch cwd (chdir),
// matching the host-side derivation. No silent fallback, ever.
//
// Provisioning backstop: web-tool availability ships as user-scope LOCAL-
// SOURCE registration — the vendored pi-native-search tree referenced by
// absolute path in the isolated agent dir's settings.json, ro bind-mounted
// into the namespace. When that provisioning layer is absent, session
// construction SUCCEEDS and BOTH getToolDefinition lookups come back
// undefined; the loud preflight consumes exactly that total-absence
// signature and refuses BEFORE any run burns.
//
// Report identity: the filename is a deterministic topic FINGERPRINT —
// sha256 of the trimmed topic, first REPORT_FINGERPRINT_LENGTH lowercase hex
// chars. Bounded, effectively collision-free, pure function of the input
// (same topic ⇒ same file, zero discovery machinery); the FULL topic persists
// durably inside the artifact itself (the report's opening heading) plus the
// transcript and terminal record — the filename is identity, not
// documentation. No CLI form, env var, or flag tunes this capability:
// RESEARCH_MAX_RUNS and REPORT_FINGERPRINT_LENGTH are shrink-only tunable
// constants.

import { createHash } from "node:crypto";
import { appendFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type CapabilityParams,
  deriveStateRootFromAgentDir,
  PioCapability,
  ResearchEnvError,
} from "../capability/base.ts";
import type { Contract } from "../capability/contract.ts";
import { classifySpec } from "../capability/contract.ts";
import {
  ContractViolationError,
  PhaseBudgetError,
} from "../capability/errors.ts";
import { deriveProjectKey } from "../sandbox/layout.ts";

// Re-exported for consumer stability — the body CO-HABITS the capability base
// per the Step-6 owner placement ruling (moved there byte-verbatim WITH its
// pinned messages; this module imports and re-exports rather than
// duplicating).
export { ResearchEnvError };

/** Run ceiling — the backstop bounding rambling-without-writing loops. */
export const RESEARCH_MAX_RUNS = 10;
/** Fingerprint width: the first N sha256-hex chars of the trimmed topic. */
export const REPORT_FINGERPRINT_LENGTH = 12;

/** The pinned preflight stderr line (module-private composition; the suite
 * replica names this owner). Check order: web_search, then web_fetch. */
function preflightStderrLine(missing: string[]): string {
  return `pio research: web tools unavailable (missing: ${missing.join(
    ", ",
  )}) \u2014 expected from the isolated agent dir's pi-native-search provisioning`;
}

/** The pinned thrown message behind the preflight refusal. */
function preflightThrownMessage(missing: string[]): string {
  return `web tools unavailable: missing tool definitions for ${missing.join(
    ", ",
  )} (provisioning: isolated agent dir 'pi-native-search' local-source registration)`;
}

/** The {RESUME} variants of the instruction template (PINNED bytes). */
function resumeLine(topic: string, reportExists: boolean): string {
  return reportExists
    ? "The report already exists. Read it FIRST: every existing section is an answered question \u2014 do not duplicate or repeat it; continue from the first question that is still open or unanswered."
    : `The report does not exist yet. Create it on your first write, starting with the heading "# Research: ${topic}".`;
}

/** The per-run instruction template (authored per D4 — the template this
 * step ships is what Step 5 distills into the authoring guide). Built
 * conditionally on reportExists; module-private, observed through prompt
 * text. Em dashes are U+2014 (escaped). */
function composeInstructions(
  topic: string,
  absolutePath: string,
  reportExists: boolean,
): string {
  return `You are researching the topic: ${topic}

Report file (absolute path): ${absolutePath}
${resumeLine(topic, reportExists)}

How to work:
1. Keep a running list of open questions about the topic; start broad, then refine and advance them as you learn.
2. Answer questions using the web_search and web_fetch tools; batch several questions into a single run.
3. Each answered question gets its OWN markdown section APPENDED to the report with the write or edit tool: a "## <question>" heading, then the answer with the source URLs cited inline. Append only \u2014 never rewrite, reorder, or delete earlier sections.
4. Only updates committed by the write/edit tool count. Appending with shell redirection (echo, tee, ...) is invisible to the completion check and will never end this loop.
5. When no useful open questions remain, finish the run WITHOUT touching the report file \u2014 ending a run without a report write is how you signal completion.
Work autonomously; do not ask the user anything during the run.`;
}

/** The pinned budget-breach truncation note appended after existing content
 * (<N> = the breached iteration count). */
function truncationNote(iterations: number): string {
  return `\n## Truncated at run budget\n\nStopped after ${iterations} runs: the run budget was hit before the topic ran dry. Sections above cover answered questions only.\n`;
}

/** The pinned sanity-violation line: actionable, ONE physical line,
 * em dash U+2014. <target> = the project-slot-joined absolute report path. */
function sanityViolationLine(target: string): string {
  return `output 'report' is missing or empty at ${target} \u2014 the research phase ended without producing the report`;
}

/** Typed refusal for the loud web-tools preflight miss. */
export class WebToolsMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebToolsMissingError";
  }
}

/**
 * Deterministic topic fingerprint: sha256 over the TRIMMED topic (UTF-8),
 * first REPORT_FINGERPRINT_LENGTH chars of the hex digest (lowercase hex).
 * Trim is the SOLE normalization — deliberate honesty about what counts as
 * the same topic: distinct text yields distinct fingerprints, and degenerate
 * topics (hazard-only characters included) still yield a well-formed digest.
 */
export function reportFingerprint(topic: string): string {
  return createHash("sha256")
    .update(topic.trim(), "utf8")
    .digest("hex")
    .slice(0, REPORT_FINGERPRINT_LENGTH);
}

export default class ResearchCapability extends PioCapability {
  readonly contract: Contract = {
    name: "research",
    version: "0.1.0",
    inputs: [{ name: "topic" }],
    outputs: [{ name: "report", paramKey: "report" }],
    writes: ["research/*.md"],
    allowProjectWrites: true,
  };

  constructor(params: CapabilityParams) {
    super(params);
  }

  async call(
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const topic = String(inputs.topic);
    // Derivation escapes pre-everything (zero prompts on an env defect): the
    // typed capture in the terminal record IS the human-facing surfacing.
    const stateRoot = deriveStateRootFromAgentDir(
      process.env.PI_CODING_AGENT_DIR,
    );
    const projectKey = deriveProjectKey(process.cwd());

    // Loud preflight (D1), before ANY run burns: read both definitions off
    // the session (a missing session yields both-missing by construction).
    const session = this.s;
    const searchDef = session?.runtime.session.getToolDefinition("web_search");
    const fetchDef = session?.runtime.session.getToolDefinition("web_fetch");
    const missing: string[] = [];
    if (searchDef === undefined) missing.push("web_search");
    if (fetchDef === undefined) missing.push("web_fetch");
    if (missing.length > 0) {
      process.stderr.write(`${preflightStderrLine(missing)}\n`);
      throw new WebToolsMissingError(preflightThrownMessage(missing));
    }

    // Report placement under the project slot: a pure function of state root,
    // project key, and topic fingerprint — survives re-runs with zero
    // discovery machinery (the project slot is rw-bound wholesale).
    const projectSlot = join(stateRoot, "projects", projectKey);
    const fingerprint = reportFingerprint(topic);
    const relativeForm = `research/${fingerprint}.md`;
    const absolutePath = join(projectSlot, "research", `${fingerprint}.md`);

    // Resume detection (C10 files-over-memory): an existing report steers
    // the instructions; there is no cursor machinery.
    const reportExists = (await stat(absolutePath).catch(() => null)) !== null;

    try {
      await this.execute_phase("research", {
        instructions: composeInstructions(topic, absolutePath, reportExists),
        // min = 1 documents the floor's role in a no-report-start world;
        // the cap (not any stall counter) bounds rambles-without-writing.
        min: 1,
        max: RESEARCH_MAX_RUNS,
        shouldStopLoop: (ctx) =>
          // Write-delta stopping rule (SR4): CONTINUE iff the PER-RUN delta
          // of COMMITTED write/edit tool paths contains the ABSOLUTE report
          // path; the first settled run without a report write ends the
          // phase. Shell-redirect appends never appear in that observable.
          Promise.resolve(!ctx.filesWritten.includes(absolutePath)),
      });
    } catch (error) {
      // Budget span (D5 fail meaning — no silent skip): annotate the
      // partial report so it stays COHERENT for a reader of the file alone,
      // then re-throw THE SAME error so its typed identity + iterations
      // datum reach the terminal record through the base catch-all. No
      // other error class is annotated; non-budget errors propagate
      // untouched.
      if (error instanceof PhaseBudgetError) {
        // appendFile CREATES the file when the model never wrote it — the
        // note-only degenerate partial is accepted (coherent beats elaborate).
        await appendFile(absolutePath, truncationNote(error.iterations));
      }
      throw error;
    }

    // Post-phase sanity (D4/D8 — capability-local, MINIMAL), reached only on
    // NATURAL stop: the DECLARED file slot must resolve to an EXISTING AND
    // NON-EMPTY file joined against the KNOWN PROJECT-SLOT BASE — NO silent
    // empty-success.
    const values = { report: relativeForm };
    // Shared resolver seam: paramKey precedence over the locally-constructed
    // values object settles file-mode here by construction — no other mode
    // can occur (documented, not branched on).
    const resolved = classifySpec(this.contract.outputs[0], values);
    if (resolved.mode !== "file") {
      throw new Error(
        `unreachable: output slot resolved to '${resolved.mode}', expected 'file'`,
      );
    }
    const target = join(projectSlot, resolved.path);
    const info = await stat(target).catch(() => null);
    if (info === null || info.size === 0) {
      throw new ContractViolationError([sanityViolationLine(target)]);
    }

    // Outcome-model settlement (Step 6): the capability states its
    // deliverable through the SESSION STREAM (what the live terminal
    // presents) — no raw terminal writes from capability code; the machine
    // ledger publishes `outputs` unchanged (frozen project-slot-relative
    // token). Deterministic delivery receipts beyond the in-stream statement
    // are the FUTURE DEFAULT-CAPABILITY's territory (recorded downstream; not
    // built here).
    return values;
  }
}
