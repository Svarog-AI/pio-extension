// Session host for capability authoring: wraps one constructed agent
// session runtime BY REFERENCE and feeds its counters store from the single
// instance-scoped listener threaded through the construction seam.
//
// The listener is the sole event feed: it is minted here, passed as a
// sessionListener option (attached exactly once at construction by the
// seam), and routes events into instance-owned observation state. The live
// subscription count stays at one at any instant — the construction seam
// owns the first attach, and rebind owns the re-attach on each reopened
// handle (subscriptions die with the disposed handle; the returned
// unsubscribe is dropped by design). No module-level mutable state.
//
// Composed frames ride the same instance surface: fromRuntime hosts a
// frame on a SETTLED shared runtime — the synchronous sibling of create,
// placement-blind (no frame-world imports, no placement branches, no
// placement flag). Counter continuity spans handle swaps: cumulative
// observation state lives in the persistent observer (JS heap), and
// reopened transcripts retain their sessionId while re-firing no events —
// re-arming the same observer after a swap-back yields exact continuity,
// no loss, no double count.
//
// Token aggregation is local on purpose: the platform's usage-totals helper
// is not exported from the installed package root (deep-importing it is
// blocked by its exports map), and the stats accessor aggregates on a
// different channel that cannot supply per-run deltas. The local accumulator
// mirrors the platform's five-field additive rules, and the exposed token
// scalar applies the same derivation the platform uses for its own stats
// total.
//
// Phase running drives settled agent runs through the session's prompt
// channel: one awaited prompt settles a whole logical run (internal
// retries, compaction continuations, and queued messages all resolve inside
// it), so the prompt promise alone is the settlement authority. Settled-end
// payloads are appended to a flat monotonic master list tracked by a
// baseline number — reads are non-consuming slices stable within a window,
// explicit resets move only the baseline, and nothing ever truncates a list
// or the cumulative counters. The same idiom spans both the committed-path
// list and the payload list.
//
// Capability-span marking rides a no-turn carrier: markCapability appends
// the span's section header (renderCapabilityMarker's line; customType
// PIO_CAPABILITY_CUSTOM_TYPE) as a durable custom message — never folded
// into prompt text, never a turn trigger. Phase ids stay BARE ids; the
// `capability:` prefix is reserved for that mark (no runtime enforcement).
// Only session-present runs are stamped, once per span (see base.ts).
//
// Settlement gate (dual face: write + vars expectations): a phase that
// declares deliverable paths and/or variable names cannot settle until EVERY
// declared expectation holds. The gate sits strictly at the normal settlement
// break (stop-rule verdict or budget break) — floor/hook continuations
// pre-break see no gate. Each settlement consults BOTH faces FRESH:
// existsSync over the resolved declared paths (directories pass mechanically;
// non-emptiness stays a capability-local quality bar) and PRESENCE over the
// retained effective variable listing — origin-blind by design (an inherited
// value from an earlier phase or a programmatic mid-flight write satisfies
// equally; permission still binds the model lane only, and the safe read
// tested against undefined is the sound presence consult because no stored
// value can ever BE undefined). Any missing expectation denies the settlement:
// a dedicated retry counter PER FACE (each independent of the iteration budget
// and the stopping rule) increments and the phase re-enters the loop body;
// iterations counts all settled runs, retries included.
//
// Durable-declaration retention: entries resolve ONCE at phase start
// (absolute normalized; relative under process.cwd()) into a list retained
// for the whole phase duration — never consumed transiently. The retained
// resolved entries arm BOTH the settlement gate (consulted at break points)
// and the execution-state feed (attached verbatim at phase start alongside
// the phase's normalized project-files scope flag, detached on every exit
// cause): the session's execution-state phase record rides this single
// retained list plus the normalized class flags and the verbatim
// variable-name list - the four declared permission dimensions. The
// effective variable listing (declaration-order, first-occurrence dedupe)
// computes ONCE at phase start the same way and retains for the whole
// duration: the arm-time registry validation and the settlement gate's
// variable face consult this same retained listing.
//
// Corrective-note channel: gate-triggered retries alone append UP TO TWO
// fresh deterministic MARKED BLOCKS strictly after the marker-leading
// baseline text: the flanked em-dash delimiter line labeled output guard
// (body sentence naming every currently-missing resolved path) and/or the
// one labeled variable guard (body sentence naming every still-undefined
// variable name), each with the settled-run count at that point. FIXED ORDER
// (output guard first, then variable guard) with a SINGLE LF between them
// when both are present; a single-face denial renders exactly the pure
// single-face shape (degradation invariant). Satisfied paths and defined
// variables drop off fresh per retry, no history accumulates, and the
// composition stays private to execute_phase.
//
// Typed failure at the ceiling: with a face's ceiling of corrective re-runs
// settled (MAX_EXPECTATION_RETRIES for files, the mirrored
// MAX_VAR_EXPECTATION_RETRIES for variables) and that face's expectations
// still unmet, the phase throws the error home's ContractViolationError
// COLLECTING ALL still-missing violations — file lines first (declaration
// order) followed by variable lines (effective-listing order; a satisfied
// face contributes zero lines) — unwrapped through the finally closeout into
// the standard containment channels on both placements.
//
// Arm-time registry validation: BEFORE the first turn issues, the phase
// validates that every listed variable name carries a base-type registration
// (fresh declarations() snapshot consult, prototype-safe); a miss faults
// LOUDLY at arm in the module-local ASCII bookkeeping voice — unsatisfiable
// phases die at arm, NEVER at the ceiling. The fault fires pre-attach and
// pre-disclosure: nothing arms, no window opens, zero prompts issue, and the
// throw escapes VERBATIM.
//
// Per-session write-gate producer wiring: create mints EXACTLY ONE
// SessionExecutionState over its two owned anchor channels (the
// project-slot root recovered through the base's loud state-root channel
// plus the launch cwd; the workspace cwd itself) and threads it into the
// construction seam's guard install alongside both tool-call handler
// closures (write row first, then var row). Each closure consults a fresh
// snapshot through its stateless predicate per call: a faulty channel
// faults every call verbatim (fail-safe tail), with no containment.
// fromRuntime
// discovers the state from the settled handle's symbol stamp via cast-free
// instanceof narrowing; an unstamped foreign handle carries NO state and
// every gate operation no-ops cleanly. execute_phase feeds its resolved
// declarations, class flags, and verbatim variable-name list into the top
// span strictly at phase start (attaches when any dimension is declared;
// none declared attaches nothing) and detaches on
// every exit cause. rebind leaves the execution state UNTOUCHED on every
// path - span integrity belongs to the balanced enter/exit lifecycle, not
// to the swap. The enterCapability / exitCapability pair is the
// instance-level span-producer surface; no public verdict surface exists,
// verdicts firing exclusively inside the interceptor closure.
//
// Command-write fencing threads the SAME way: create builds EXACTLY ONE
// Landlock-bash instance over the SAME execution state the guard install
// stamps - BY REFERENCE, so the instance's per-invocation fresh snapshot
// consult tracks span and phase churn identically to the write-handler
// closure and late binding survives handle swaps. The entries ride the
// UNCONDITIONAL customTools slot - the fenced bash entry plus the
// variable trio constructed ONCE over create's OWN minted variable store:
// the stored-factory closure re-spreads the very same instances on every
// session re-creation (composed frames share them within one runtime;
// a separate process mints its own through its own create), so no
// placement adds wiring. session.ts stays the generic channel and is
// unchanged; the guard-handler list gains NO member, because the kernel
// adjudicates command writes and the tool renders only: a single refusal
// site, rendered from the pre-spawn consult.
//
// Phase-permission disclosure (the transcript-visible carrier): every
// execute_phase consults the execution state FRESH - ONCE, strictly AFTER
// its own attach completes (late binding, never pre-attach), OUTSIDE the
// try (a channel fault escapes verbatim through the standard containment
// channels; the channel adds no try/catch) - and appends the rendered
// block AT THE END of the marker-led composition into the SAME text
// payload, so the listing trails EVERY observed run of the phase,
// corrective retries included. UNCONDITIONAL: a stateless or governing-empty window renders
// the delimiter line alone (silence is not fault). The block answers WHICH
// FILES THE PHASE MAY WRITE from the user's perspective: the shared core's
// surviving declared paths VERBATIM (one materializeEffectiveSet consult -
// declaration order, first-occurrence dedupe, plus the two CLAMPED class
// propositions, never re-judged here), each class on its own line,
// assembly order files then project then scratch, NO sentence terminators
// anywhere.
// Unsupported declaration shapes ride along raw, unfiltered: the block
// mirrors the shared core AND the gate's own refusal voice, which already
// lists such tokens. The exported renderer is the
// block's SOLE BYTE OWNER; its fixed wording lives in the module-private
// disclosure static.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  AgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { materializeEffectiveSet } from "../permission-mechanics.ts";
import { slugify } from "../sandbox/layout.ts";
import { createPioSession, EXECUTION_STATE_STAMP } from "../session.ts";
import type { ExecutionSnapshot } from "../session-execution-state.ts";
import { SessionExecutionState } from "../session-execution-state.ts";
import { createLandlockBash } from "../tools/bash/landlock-bash.ts";
import { createVarTools } from "../tools/vars/var-tools.ts";
import { deriveStateRootFromAgentDir } from "./base.ts";
import {
  ContractViolationError,
  PhaseInterruptionError,
  VariableRejectionError,
} from "./errors.ts";
import type { CapabilitySources } from "./guards/guard-vocabulary.ts";
import { decideVarWrite } from "./guards/var-gate.ts";
import { decideWrite } from "./guards/write-gate.ts";

/** Tool names whose successful executions commit a file path. */
const FILE_TOOL_NAMES: ReadonlySet<string> = new Set(["write", "edit"]);

/** Exact tool name matched for the ask-user counter. */
const ASK_USER_TOOL_NAME = "ask_user";

/** Transcript segment marker: two em dashes flanking the label (U+2014 x2, single spaces). */
export function renderPhaseMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 ${label} \u2014\u2014`;
}

/** Capability-span marker: the `capability:` prefix inside the dash flank
 * of the phase-marker layout (U+2014 x2, single spaces). No input
 * validation; no trailing newline. */
export function renderCapabilityMarker(label: string): string {
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  return `\u2014\u2014 capability: ${label} \u2014\u2014`;
}

/** The customType namespace identifying pio capability markers among
 * foreign custom messages. Module-private on purpose: an entry-filtering
 * tag, not consumer API. */
const PIO_CAPABILITY_CUSTOM_TYPE = "pio-capability";

/** Ceiling for corrective expectation re-runs (shrink-only, no per-phase
 * override; module-private — the export surface stays at the pinned five
 * keys and the suite pins the ceiling behaviorally). */
const MAX_EXPECTATION_RETRIES = 3;

/** One corrective MARKED BLOCK for a gate-triggered retry: the flanked
 * em-dash delimiter line (U+2014-escaped like every other pinned byte in
 * this module) labeled output guard above the body sentence — every
 * currently-missing resolved path (declaration order) plus the settled-run
 * count at the denial point; fresh per retry, so landed paths drop off.
 * Two lines joined by a single LF; no trailing newline. */
function renderExpectationRetryLine(
  iterations: number,
  missing: readonly string[],
): string {
  return `\u2014\u2014 output guard \u2014\u2014\nRequired phase output(s) still missing after ${iterations} run(s): ${missing.join(", ")}. Create each listed file with the write or edit tool before you finish this run.`;
}

/** One collect-all violation line per still-missing declared path at the
 * exhausted ceiling (<entry> raw, <resolvedPath> resolved; the em dash is
 * U+2014-escaped like every other pinned byte in this module). */
function renderMissingOutputLine(
  phaseId: string,
  entry: string,
  resolvedPath: string,
): string {
  return `phase '${phaseId}' output '${entry}' missing at ${resolvedPath} \u2014 still absent after ${MAX_EXPECTATION_RETRIES} expectation re-run(s); the ceiling is exhausted`;
}

/** Mirrors MAX_EXPECTATION_RETRIES; distinct constant; shrink-only,
 * module-private; no public configurability in v1. */
const MAX_VAR_EXPECTATION_RETRIES = 3;

/** One corrective MARKED BLOCK for a variable-gate denial: the flanked
 * em-dash delimiter line labeled variable guard above the body sentence —
 * every still-undefined variable name (effective-listing order) plus the
 * settled-run count at the denial point; fresh per retry. Two lines joined
 * by a single LF; no trailing newline. */
function renderVariableRetryLine(
  iterations: number,
  missing: readonly string[],
): string {
  return `\u2014\u2014 variable guard \u2014\u2014\nRequired variable(s) still missing after ${iterations} run(s): ${missing.join(", ")}. Define each listed variable with the setVar tool before you finish this run.`;
}

/** ONE collect-all violation line per still-missing declared variable at
 * the exhausted ceiling (the name renders RAW — variables have no
 * resolved-path analog; the 3 embeds the cap CONSTANT like the file
 * renderer's shape — never a live counter value). */
function renderMissingVariableLine(phaseId: string, name: string): string {
  return `phase '${phaseId}' variable '${name}' missing \u2014 still undefined after ${MAX_VAR_EXPECTATION_RETRIES} variable expectation re-run(s); the ceiling is exhausted`;
}

/** ONE arm-time fault line (PURE ASCII — no em dashes; developer-facing):
 * names the phase and every listed-but-unregistered variable in
 * effective-listing order. */
function renderPhaseVarFaultLine(
  phaseId: string,
  misses: readonly string[],
): string {
  return `phase '${phaseId}': variable(s) listed without a declared base type: ${misses.join(", ")}`;
}

/** Declaration-order, first-occurrence dedupe of the phase's variable
 * listing — identical semantics to the guard's judgment-time listing, so
 * both faces judge over the SAME set; mirrored locally, fresh array per
 * call. */
function effectiveVarListing(list: readonly string[]): string[] {
  const seen: Set<string> = new Set();
  const result: string[] = [];
  for (const entry of list) {
    if (!seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
  }
  return result;
}

/** THE phase-permission DISCLOSURE BLOCK's fixed bytes (module-private -
 * the single literal home for the label, the joiner, and the two class
 * elements; the exported renderer below is the block's SOLE BYTE OWNER).
 * Element wording carries NO sentence terminator (minimal message). */
const PHASE_DISCLOSURE_STATIC = {
  label: "Phase Permissions",
  filesJoin: ", ",
  projectElementLeadIn: "project files at ",
  scratchElementLiteral: "scratch files at /tmp",
};

/** THE phase-permission DISCLOSURE renderer (SOLE BYTE OWNER of the block):
 * pure over plain values, fed a FRESH snapshot consult result (never a
 * stored object reference) - no side effects, no I/O, no clock. Body
 * derivation is ONE shared-core consult (materializeEffectiveSet): the
 * surviving declared paths render VERBATIM as the files line (declaration
 * order, first-occurrence dedupe - exactly the shared core's survivor list,
 * unsupported declaration shapes riding along raw, unfiltered), and the two
 * CLAMPED class propositions render as their own lines, never re-judged
 * here. Assembly order: files line, project class line, scratch class line.
 * A stateless reading short-circuits to the DELIMITER LINE ALONE with NO
 * shared-core consult: an absent execution state arrives as undefined, a
 * depth-0/no-attach window arrives as a null-phase record - one code path
 * per case; the core requires a non-null phase record and is never
 * consulted without one. NO trailing period anywhere; lines are LF-joined;
 * no trailing newline. */
export function renderPhasePermissionDisclosure(
  snapshot?: ExecutionSnapshot,
): string {
  const { label, filesJoin, projectElementLeadIn, scratchElementLiteral } =
    PHASE_DISCLOSURE_STATIC;
  const lines: string[] = [`${label}:`];
  if (snapshot !== undefined && snapshot.phase !== null) {
    // One consult, one code path: the shared core owns the survivor filter
    // and the clamped class propositions alike.
    const effective = materializeEffectiveSet(
      snapshot.phase,
      snapshot.sources,
      snapshot.paths,
    );
    if (effective.survivors.length > 0) {
      lines.push(effective.survivors.join(filesJoin));
    }
    if (effective.projectWritesActive) {
      lines.push(`${projectElementLeadIn}${snapshot.paths.workspaceCwd}`);
    }
    if (effective.scratchActive) {
      lines.push(scratchElementLiteral);
    }
  }

  if (lines.length === 1) {
    lines.push("None");
  }
  return lines.join("\n");
}

/** Closed option bag for one phase execution. */
export interface PhaseOptions {
  /** Sent below the marker line at every run of the phase. */
  readonly instructions?: string;
  /** Floor: the phase always executes at least this many runs. */
  readonly min?: number;
  /** Ceiling: bounds execution — continuation still demanded at it ends
   * the loop; the phase resolves with the bounded result. */
  readonly max?: number;
  /** Runs after every settled run; `true` ends the phase, `false` demands another run. */
  readonly shouldStopLoop?: (ctx: IterationCtx) => Promise<boolean>;
  /** Declared deliverable PATHS the phase MUST produce before it may
   * settle (absent or empty = no expectations; presence turns enforcement
   * ON — mandatory, always on, no opt-out). Entries are paths: absolute
   * entries pass through normalized; relative entries resolve under
   * process.cwd(). Non-empty retained entries additionally feed the
   * session's execution state (attached verbatim at phase start), arming
   * the per-phase write permission frame. */
  readonly write?: readonly string[];
  /** The phase's project-files (workspace-cwd) SCOPE declaration:
   * CLAMPED at decision time against the running capability's contract
   * flag - an unbacked flag is INVISIBLE (never granted, never listed).
   * With the other declarations it forms the phase's four permission
   * dimensions (all feed the session's execution state verbatim); absent
   * means false. */
  readonly allowProjectWrites?: boolean;
  /** The phase's SCRATCH (/tmp/) declaration: a SINGLE phase flag with NO
   * contract-side counterpart - judged only at decision time (there is no
   * clamp to speak of - single-flag doctrine). With the other declarations
   * it forms the phase's four permission dimensions (all feed the
   * session's execution state verbatim); absent means false. */
  readonly tmpDirAllowed?: boolean;
  /** Declared variable names: while the phase is attached, the model's
   * setVar writes are admitted exactly against these names (judged at
   * decision time over the stored listing, deduplicated to first
   * occurrence). EXPECTATION face: every listed name must be present in the
   * session variable store — ANY ORIGIN (an inherited value or a programmatic
   * mid-flight write satisfies) — before the phase may settle; a missing name
   * burns a corrective re-run on a dedicated counter independent of the budget
   * and the stopping rule, capped at the module-private default, terminating
   * in the typed failure. ARM TIME: every listed name must carry a base-type
   * registration before the first turn — a miss faults loudly at arm, so an
   * unsatisfiable declaration dies at arm, never at the ceiling. Stored
   * verbatim beside the other dimensions; absent or empty confers no variable
   * governance. The governed tool is the registered setVar definition - the
   * model-side write channel; the read lanes are unrestricted. */
  readonly vars?: readonly string[];
}

/** Decision window handed to the between-runs hook. */
export interface IterationCtx {
  /** Fresh session-cumulative snapshot taken after the settling run. */
  readonly counters: SessionCounters;
  /** Committed paths of the just-settled run (fresh slice per hook invocation). */
  readonly filesWritten: string[];
  /** Per-run settled-run delta of started ask-user tool executions (this run only; contrast counters.askUserCalls, session-cumulative). */
  readonly askUserCalls: number;
  /** The session variable store, passed by reference: the SAME instance the
   * model's variable tools write during the run — a hook reading it mid-run
   * observes the LIVE values, including writes landed during the
   * just-settled run. */
  readonly vars: SessionVariableStore;
}

/** Outcome of a completed phase. */
export interface PhaseResult {
  /** True on every return. */
  readonly done: boolean;
  /** Settled runs executed. */
  readonly iterations: number;
  /** Concatenated settled-end payloads of the phase, in event order. */
  readonly messages: unknown[];
  /** Unreported by design in v1: the store IS the live state every reader
   * can consult directly; the change-record rationale was retired by owner
   * ruling. */
  readonly varsDelta: Record<string, unknown>;
  /** One fresh cumulative snapshot taken after the final run settles. */
  readonly counters: SessionCounters;
  /** Always equals counters.tokens. */
  readonly tokens: number;
}

/** Cumulative run-observation counters over one session lifetime. */
export interface SessionCounters {
  /** Committed successful write/edit end count; equals the master path-list length. */
  readonly filesWritten: number;
  /** Tool executions started under the matched ask-user name. */
  readonly askUserCalls: number;
  /** Per-name count of started tool executions, failures included. */
  readonly toolUses: Record<string, number>;
  /** Sum of observed assistant usages: input + output + cacheRead + cacheWrite. */
  readonly tokens: number;
}

/** Base types of the session variable store — the six legacy types,
 * module-owned here (the per-phase guard deals in names only; the model
 * tool params validate against these literals at the schema level). */
export type VarType =
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "object"
  | "null";

/** A capability-authored NAMED SHAPE CHECK for a session variable: a
 * human-readable LABEL (its DISPLAYED name — how the listing surfaces the
 * shape the variable carries; nothing at write time consumes it) plus the
 * CHECK ITSELF expressed as a zod schema (owner ruling). The loose ZodType
 * base is the declared schema slot: authors pass CONCRETE schemas (objects,
 * enums, refined/transformed chains, records); the store never introspects
 * schema internals. Type-only surface: erased under erasable syntax — the
 * runtime half is the instanceof z.ZodType recognition executed at
 * declaration admission. */
export interface CustomVarSpec {
  readonly label: string;
  readonly schema: z.ZodType;
}

/** Concrete TypeScript type per declared base type — the compile-time
 * half of the typed-read guarantee (conditional type; erased at runtime).
 * null falls through as the final branch: a type that is none of the
 * five structural types can only be the null slot. */
export type VarValueOf<T extends VarType> = T extends "boolean"
  ? boolean
  : T extends "number"
    ? number
    : T extends "string"
      ? string
      : T extends "array"
        ? unknown[]
        : T extends "object"
          ? Record<string, unknown>
          : null;

/**
 * Bookkeeping corruption over the variable REGISTRY: conflicting or
 * malformed declarations. Developer-facing, PURE ASCII (no em dashes),
 * model-invisible — the separate ASCII fault voice class (à la
 * ExecutionStateError) deliberately DISTINCT from the model-visible
 * VariableRejectionError (name, message prefix, and dash discipline all
 * differ). Unexported on purpose: the suite asserts by name only.
 */
class VarRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VarRegistryError";
  }
}

/**
 * Bookkeeping corruption over the PHASE VARIABLE DECLARATION: a phase lists
 * variable names without base-type registrations. Developer-facing, PURE
 * ASCII (no em dashes), model-invisible — deliberately DISTINCT from the
 * model-visible VariableRejectionError (same doctrine as VarRegistryError /
 * ExecutionStateError). Unexported on purpose: the suite asserts by name
 * only. NO ES cause member (bare-identity capture reduces to {type,
 * message}).
 */
class PhaseVarDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhaseVarDeclarationError";
  }
}

/** Closed fault taxonomy of the shared conversion core: one category per
 * rejection shape, detail-free by design — the clause renderer below is
 * the SOLE byte owner mapping category to the pinned line, and the
 * offending value is NEVER echoed (a cyclic input would blow up any
 * serialization; the clause grammar dodges the hazard by construction). */
type VarRejectReason =
  | "value-undefined"
  | "value-function"
  | "value-symbol"
  | "value-bigint"
  | "number-nan"
  | "number-plus-infinity"
  | "number-minus-infinity"
  | "class-instance"
  | "reference-cycle"
  | "boolean-token"
  | "shape-array"
  | "shape-object"
  | "does-not-coerce";

/** Shared conversion outcome: success carries the CONVERSION RESULT
 * (never the raw input); a fault carries the closed category. */
type VarConversion =
  | { readonly converted: unknown }
  | { readonly rejected: VarRejectReason };

/** Plainness predicate of the stored-by-reference integrity: admits
 * exactly the Object.prototype-or-null prototype shapes (JSON-plain;
 * class instances, wrappers, and exotic prototypes reject). */
function isPlainVarObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// The ancestor path lives in a module-level Set scoped to ONE walk: walks
// never nest across calls (single-threaded, synchronous descent, and every
// walk fully unwinds via its finally before any other runs), so the cursor
// keeps the walker argument-free while staying strictly per-walk.
const varWalkAncestors: Set<object> = new Set();

/** Recursive stored-by-reference integrity walk: PLAIN prototypes
 * everywhere (arrays included as containers), ACYCLIC by ANCESTOR-PATH
 * tracking (shared substructures admit; back-edges reject), no class
 * instances at ANY depth. Scalar leaves need no walk. Pure over the input
 * (mutates nothing; the ancestor cursor is internal bookkeeping that
 * always unwinds). */
function walkVarIntegrity(value: unknown): VarConversion {
  if (typeof value !== "object" || value === null) {
    return { converted: value }; // scalar leaf — admitted, walked through
  }
  if (!Array.isArray(value) && !isPlainVarObject(value)) {
    return { rejected: "class-instance" };
  }
  if (varWalkAncestors.has(value)) {
    return { rejected: "reference-cycle" };
  }
  varWalkAncestors.add(value);
  try {
    const children: unknown[] = Array.isArray(value)
      ? [...value]
      : Object.keys(value).map((key) => value[key]);
    for (const child of children) {
      const result = walkVarIntegrity(child);
      if ("rejected" in result) return result;
    }
    return { converted: value };
  } finally {
    varWalkAncestors.delete(value);
  }
}

/** THE shared admission/conversion core (one voice, one table): the SAME
 * pure function serves BOTH the validated write entry point (declared-name
 * path) and the typed reads (stored-value path) — consistency by
 * construction (what set admits, read converts). Type-preserving: the
 * converted value equals the declared type. Never throws; a fault resolves
 * to the closed category the clause renderers turn into the pinned line. */
function convertVarValue(value: unknown, type: VarType): VarConversion {
  switch (type) {
    case "boolean": {
      // Type-preserving admission: the four sanctioned forms ONLY (native
      // booleans verbatim, the two exact textual tokens). Retires the
      // legacy silent-false fallback AND the "1"/"yes"/"0"/"no" tokens and
      // bare 0/1.
      if (typeof value === "boolean") return { converted: value };
      if (value === "true") return { converted: true };
      if (value === "false") return { converted: false };
      return {
        rejected:
          typeof value === "string" ? "boolean-token" : varScalarReason(value),
      };
    }
    case "number": {
      // Finite numbers verbatim; numeric strings trimmed-nonempty and
      // finite-parse (so "42", " 42 ", "0x1A", "1e3" convert). Retires
      // ""→0, null→0, true→1, [5]→5, NaN, ±Infinity.
      if (typeof value === "number" && Number.isFinite(value)) {
        return { converted: value };
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return { converted: parsed };
      }
      return { rejected: varScalarReason(value) };
    }
    case "string": {
      // Strings verbatim; finite numbers and booleans take the String()
      // form. Retires the String() catch-all (arrays/objects/null reject;
      // non-finite numbers take the finiteness clause).
      if (typeof value === "string") return { converted: value };
      if (typeof value === "number" && Number.isFinite(value)) {
        return { converted: String(value) };
      }
      if (typeof value === "boolean") return { converted: String(value) };
      return { rejected: varScalarReason(value) };
    }
    case "array": {
      if (!Array.isArray(value)) return { rejected: varScalarReason(value) };
      return walkVarIntegrity(value);
    }
    case "object": {
      if (!isPlainVarObject(value)) {
        return { rejected: varScalarReason(value) };
      }
      return walkVarIntegrity(value);
    }
    case "null": {
      // Universal null rule: null converts ONLY to type "null"; present-
      // but null read/stored against any other type is a conversion fault.
      if (value === null) return { converted: null };
      return { rejected: varScalarReason(value) };
    }
  }
}

/** Fault-category resolver for an UNCOERCIBLE top-level value: first-match
 * over the closed taxonomy. Container shape mismatches (array/object vs a
 * different demanded type) resolve to the shape clauses BEFORE any
 * structural walk — the walk runs only for array/object demands. The one
 * type-context exception (string INTO boolean takes the token clause) is
 * applied at the boolean demand site, where the type is known. */
function varScalarReason(value: unknown): VarRejectReason {
  if (value === undefined) return "value-undefined";
  if (typeof value === "function") return "value-function";
  if (typeof value === "symbol") return "value-symbol";
  if (typeof value === "bigint") return "value-bigint";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number-nan";
    if (value === Number.POSITIVE_INFINITY) return "number-plus-infinity";
    if (value === Number.NEGATIVE_INFINITY) return "number-minus-infinity";
    return "does-not-coerce";
  }
  if (value === null) return "does-not-coerce";
  if (Array.isArray(value)) return "shape-array";
  if (typeof value === "object") {
    return isPlainVarObject(value) ? "shape-object" : "class-instance";
  }
  // Remaining scalars (booleans and anything unexpected past erasure):
  // the generic clause.
  return "does-not-coerce";
}

/** TYPE SPELLING of a value for the pinned lines: typeof spelling with
 * null spelled explicitly (JS typeof null misleads with "object"). */
function varTypeSpelling(value: unknown): string {
  if (value === null) return "null";
  return typeof value;
}

/** THE CLAUSE half of a coercion-reject line, keyed on the closed fault
 * taxonomy (SOLE byte owner alongside the line renderers below); the type
 * appears verbatim only in the does-not-coerce clause. */
function varRejectClause(reason: VarRejectReason, type: VarType): string {
  switch (reason) {
    case "value-undefined":
      return "value is undefined";
    case "value-function":
      return "value is a function";
    case "value-symbol":
      return "value is a symbol";
    case "value-bigint":
      return "value is a bigint";
    case "number-nan":
      return "number is not finite (NaN)";
    case "number-plus-infinity":
      return "number is not finite (+Infinity)";
    case "number-minus-infinity":
      return "number is not finite (-Infinity)";
    case "class-instance":
      return "value is a class instance";
    case "reference-cycle":
      return "value contains a reference cycle";
    case "boolean-token":
      return "token is not a recognized boolean form";
    case "shape-array":
      return "value is an array";
    case "shape-object":
      return "value is an object";
    default:
      return `value does not coerce to '${type}'`;
  }
}

/** ONE coercion-reject line (declared-name write path): names the
 * VARIABLE, the incoming type spelling, the DECLARED TYPE, and the
 * category clause. The value is never echoed; LF discipline per the other
 * renderers (lines stand alone; the family constructor joins them). */
function renderVarCoercionRejectLine(
  name: string,
  type: VarType,
  value: unknown,
  reason: VarRejectReason,
): string {
  return `variable '${name}' cannot take a value of type '${varTypeSpelling(value)}' as declared type '${type}' \u2014 ${varRejectClause(reason, type)}`;
}

/** ONE undeclared-write line (mandatory-type doctrine): names the variable
 * and the ABSENCE of a type ON PURPOSE — it names no incoming value or
 * candidate type (that would guess authoring data). */
function renderVarUndeclaredWriteLine(name: string): string {
  return `variable '${name}' has no declared base type \u2014 a base type must be declared before writing`;
}

/** ONE typed-read ABSENT line. */
function renderVarReadAbsentLine(name: string, type: VarType): string {
  return `read of variable '${name}' as '${type}' failed \u2014 variable is absent`;
}

/** ONE typed-read CONVERSION-FAULT line with the STORED VALUE spelling: a
 * stored null is spelled distinctly per the explicit ruling (overrides the
 * legacy Number(null)→0 / String(null)→"null" leniency outright). */
function renderVarReadConvertLine(
  name: string,
  type: VarType,
  stored: unknown,
): string {
  const description =
    stored === null
      ? "stored value is null"
      : `stored value of type '${varTypeSpelling(stored)}'`;
  return `read of variable '${name}' as '${type}' failed \u2014 ${description} cannot convert to '${type}'`;
}

/** THE display resolver (SOLE byte owner of the literal-self / spec-label
 * mapping): six literals display THEMSELVES; a spec displays its LABEL.
 * Feeds BOTH the display-valued declarations() snapshot and the
 * declarationDisplay() companion query — zero casts on either face. */
function displayVarDeclaration(type: VarType | CustomVarSpec): string {
  return typeof type === "string" ? type : type.label;
}

/** ONE malformed-spec LABEL line (class 1 — a NON-STRING or EMPTY label;
 * ONE line covering both, echoing NOTHING: the offending value fails the
 * gate before any echo could happen). Developer-facing pure-ASCII
 * bookkeeping voice. */
function renderVarSpecLabelLine(name: string): string {
  return `var registry: invalid spec label for variable '${name}': label must be a non-empty string`;
}

/** ONE built-in-SHADOWING line (class 2 — the label proved a NON-EMPTY
 * STRING through class 1 and therefore echoes VERBATIM: house echo
 * practice à la the legacy foreign-type echo). Developer-facing pure-ASCII
 * bookkeeping voice. */
function renderVarSpecShadowLine(name: string, label: string): string {
  return `var registry: invalid spec label for variable '${name}': label '${label}' shadows a built-in type name`;
}

/** ONE unrecognized-SCHEMA line (class 3 — the schema member failed the
 * library's own type guard for the pinned major; nothing echoed).
 * Developer-facing pure-ASCII bookkeeping voice. */
function renderVarSpecSchemaLine(name: string): string {
  return `var registry: invalid spec schema for variable '${name}': schema is not a recognizable zod schema`;
}

/** Structural issue slice (type-only, erased under erasable syntax) carrying exactly the two members the defect-line grammar consumes. */
interface VarShapeIssue {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/** Sole byte owner of the spec-lane defect line: the store-owned frame over the check's findings carried verbatim, collect-all in issue-array order, '; '-joined statements with non-empty paths dot-prefixed (numeric segments in decimal). */
function renderVarSpecDefectLine(
  name: string,
  issues: readonly VarShapeIssue[],
): string {
  const statements: string[] = issues.map((issue) =>
    issue.path.length === 0
      ? issue.message
      : `${issue.path.join(".")}: ${issue.message}`,
  );
  return `variable '${name}' does not satisfy its declared shape check \u2014 ${statements.join("; ")}`;
}

/** Sole byte owner of the dedicated check-fault line: settlement for a declared shape check that threw while running (every thrown kind, the payload referenced nowhere), deliberately outside the closed six-type taxonomy. */
function renderVarSpecFaultLine(name: string): string {
  return `variable '${name}' cannot be shape-checked \u2014 the declared shape check itself faulted while checking the value`;
}

/** Registry-voice erasure fault line for clear() over an undeclared name (pure-ASCII bookkeeping voice, no em dash). */
function renderVarClearUndeclaredLine(name: string): string {
  return `var registry: cannot clear variable '${name}': the variable is not declared`;
}

/** THE single type-level seam of the union storage: writes an admitted
 * declaration VALUE into the registry map through its WIDENED view — the
 * six-literal annotation stays exact at every FUNNEL READ site (the shared
 * conversion switch, set()/get()/list(), and the renderers all resolve
 * against the literal-typed getter) while a well-formed SPEC rides the
 * widened view into the ONE ordered map. Runtime behavior is identity
 * (Map.set unchanged); zero assertions on either side of the call. */
function storeUnionDeclaration(
  registry: Map<string, unknown>,
  name: string,
  value: unknown,
): void {
  registry.set(name, value);
}

/** Malformed-type guard (reachable only via runtime foreignness past type
 * erasure — the union is exhaustive at compile time): the plain equality
 * chain keeps the check cast-free. */
function isDeclaredType(type: string): boolean {
  return (
    type === "boolean" ||
    type === "number" ||
    type === "string" ||
    type === "array" ||
    type === "object" ||
    type === "null"
  );
}

/**
 * THE session variable store — settled validated-core design, extended IN
 * PLACE on this very class (not replaced, not renamed — the wrap decision's
 * landing form). One store per session instance: minted in the
 * PioSession constructor, reached as the vars handle (PioSession.vars,
 * IterationCtx.vars BY REFERENCE).
 *
 * MANDATORY-TYPE DOCTRINE: every variable carries a declared base type —
 * declare() is the SOLE registry writer (explicit authoring-side call;
 * no inference, no engine-side minting), and set() is THE single
 * validated entry point for ALL variable writes from EVERY origin, where
 * an unregistered name faults before any shape work, a built-in literal
 * stores the shared table's CONVERSION RESULT, and a custom spec skips
 * base conversion entirely — parsing through the schema's safe-parse
 * entry point, storing the PARSE OUTPUT on conformance, and settling a
 * contained refusal (composed defect line, or the dedicated check-fault
 * line behind the parse-only containment wrap) with the prior value
 * intact. Set polices SHAPE only, and bookkeeping corruption (registry
 * faults) rides the module-local pure-ASCII VarRegistryError, never the
 * model-visible family.
 *
 * ERASURE CHANNEL: clear(name) is the SOLE program-owned emptying
 * operation (the model lane never erases) — it bypasses set() entirely,
 * keeps the declaration while dropping a declared name's entry, and
 * faults an undeclared name in the pure-ASCII bookkeeping voice.
 *
 * READ SURFACE: get(name) stays the SAFE channel (stored value or
 * undefined; never throws); the overloaded typed read get(name, type)
 * returns the CONCRETE type (VarValueOf) and throws the family on
 * absent/unconvertible values — reads mutate nothing. The store IS the live
 * state every reader consults directly: current values, current
 * declarations, no change record riding elsewhere. Deliberately distinct
 * from the root tree's richer same-named class (different package,
 * different surface).
 */
export class SessionVariableStore {
  #entries: Map<string, unknown> = new Map();
  /** Union-value registry (name to declaration VALUE, insertion-ordered), written ONLY by declare: six literals store VERBATIM and well-formed specs BY REFERENCE under the UNCHANGED six-literal annotation — the spec-lane arm of set() binds them cast-free via bottom-type assignment over the typeof-guarded never branch, and deep-equality over schema objects is deliberately never consulted. */
  #types: Map<string, VarType> = new Map();

  /** Safe channel: the stored value, or undefined when the name is
   * absent. Never throws — the typed overload below is the faulting
   * read surface. */
  get(name: string): unknown;
  /** Typed read: resolves the CONCRETE declared type (compile-time
   * guarantee) and THROWS the family — never undefined — when the
   * variable is absent or the stored value cannot convert to the claimed
   * type (the shared conversion table governs read-conversion too).
   * Mutates nothing. */
  get<T extends VarType>(name: string, type: T): VarValueOf<T>;
  get(name: string, type?: VarType): unknown {
    const stored = this.#entries.get(name);
    if (type === undefined) return stored;
    if (!this.#entries.has(name)) {
      throw new VariableRejectionError([renderVarReadAbsentLine(name, type)]);
    }
    const result = convertVarValue(stored, type);
    if ("rejected" in result) {
      throw new VariableRejectionError([
        renderVarReadConvertLine(name, type, stored),
      ]);
    }
    // The shared core returned the CONVERSION RESULT for this type; the
    // overload pair carries the concrete-typing promise and the table the
    // runtime truth (zero-cast discipline: no assertion needed here).
    return result.converted;
  }

  /** THE base-type registry writer (mandatory-type doctrine): registers
   * the base type OR a capability-authored CUSTOM SPEC ({label, schema})
   * for a name, scoped to this session instance. Runtime dispatch past
   * type erasure (fixed): a STRING payload takes the LEGACY LITERAL LANE
   * BYTE-STABLE (the six literals register as today; a foreign string
   * settles the EXISTING malformed line unchanged); a NON-NULL, NON-ARRAY
   * OBJECT payload enters the SPEC LANE under the FIXED FIRST-FAULT TRIAGE
   * (label well-formed, no built-in shadowing, schema recognized — the
   * first fault settles LOUDLY and mints NOTHING); EVERYTHING ELSE
   * (numbers, booleans, null, symbols, functions, bigints, AND arrays)
   * keeps the EXISTING line with its historical ${payload} spelling. Re-
   * declaration over an already-registered name settles by KIND THEN
   * DISPLAY: same-kind + same-display is an IDEMPOTENT no-op (the original
   * registration wins inertly); ANY other mix conflicts LOUDLY in the
   * developer-facing ASCII bookkeeping family with the UNCHANGED form, now
   * fed with DISPLAY names (literals display themselves, specs their
   * labels — literal-over-literal reproduces the legacy bytes exactly).
   * Registration touches the registry ONLY — an already-stored value is
   * never retroactively revalidated (every stored value passed validation
   * at ITS write moment; a stale-shaped value, should one ever exist,
   * faults per the table on typed read and an overwrite replaces it). */
  declare(name: string, type: VarType | CustomVarSpec): void {
    let display: string;
    if (typeof type === "string") {
      // LEGACY LITERAL LANE (byte-stable): the existing equality chain
      // governs — the six literals admit; a foreign string settles the
      // EXISTING malformed line with unchanged bytes.
      if (!isDeclaredType(type)) {
        throw new VarRegistryError(
          `var registry: invalid base type '${type}' for variable '${name}'`,
        );
      }
      display = type;
    } else if (
      typeof type !== "object" ||
      type === null ||
      Array.isArray(type)
    ) {
      // EVERYTHING ELSE (non-string primitives, null, AND arrays — an
      // array is never a plausible spec candidate): the EXISTING legacy
      // line with its historical ${payload} template spelling —
      // byte-stable for every such payload that ever reached it.
      throw new VarRegistryError(
        `var registry: invalid base type '${type}' for variable '${name}'`,
      );
    } else {
      // SPEC LANE: fixed FIRST-FAULT triage over the runtime payload
      // (cast-free; the interface types lie past erasure, so every member
      // is re-adjudicated at runtime — the first fault settles, collect-
      // all is barred; the voice is single-line single-fault). Nothing
      // mints before the triage settles.
      const label = type.label;
      if (typeof label !== "string" || label === "") {
        throw new VarRegistryError(renderVarSpecLabelLine(name));
      }
      if (isDeclaredType(label)) {
        throw new VarRegistryError(renderVarSpecShadowLine(name, label));
      }
      if (!(type.schema instanceof z.ZodType)) {
        throw new VarRegistryError(renderVarSpecSchemaLine(name));
      }
      display = label;
    }
    const existing = this.#types.get(name);
    if (existing !== undefined) {
      const existingDisplay = displayVarDeclaration(existing);
      if (existingDisplay !== display) {
        throw new VarRegistryError(
          `var registry: cannot declare '${name}' as '${display}': already declared as '${existingDisplay}'`,
        );
      }
      // SAME-KIND + SAME-DISPLAY: idempotent no-op — the ORIGINAL
      // registration wins inertly (deep-equality over schema objects is
      // deliberately NOT consulted: a same-label re-declaration with a
      // differently-edited schema is a SILENT no-op, matching the
      // "registration lands exactly once per name" doctrine).
      return;
    }
    // Registration lands exactly once per name, at first declaration:
    // the conflict case has already thrown above, so what remains here is
    // a fresh name (insert). THE MARKED SEAM of the union storage: every
    // RUNTIME admission decision has settled above it (fixed triage, then
    // idempotency/conflict), and the widened-view write lets the
    // well-formed spec ride into a field whose declared type stays the
    // six-literal funnel view: byte-conservatism holds, with the
    // six-type conversion core, the clause/line renderers, and the
    // typed-read pair keeping their exact bytes, while spec payloads are
    // adjudicated by the spec-lane arm of set(), which skips base
    // conversion by the runtime-kind guard, so they never reach the
    // shared switch.
    storeUnionDeclaration(this.#types, name, type);
  }

  /** THE single validated write entry point for ALL origins (shape policing only — permission belongs to the per-phase guard): an unregistered name faults first with the pinned undeclared-write line; a literal-declared name converts via the shared table and stores the CONVERSION RESULT; a spec-declared name skips base conversion, parses through the schema's safeParse, stores the PARSE OUTPUT on success, settles a structured failure as the composed defect line and a throwing check as the dedicated fault line behind the parse-only containment wrap — always with the prior value intact, and with null flowing through the ordinary parse path like any other incoming value. */
  set(name: string, value: unknown): void {
    const type = this.#types.get(name);
    if (type === undefined) {
      throw new VariableRejectionError([renderVarUndeclaredWriteLine(name)]);
    }
    if (typeof type === "string") {
      // LEGACY LITERAL LANE (preserved statement-for-statement): the
      // shared table converts and the CONVERSION RESULT is what stores.
      const result = convertVarValue(value, type);
      if ("rejected" in result) {
        throw new VariableRejectionError([
          renderVarCoercionRejectLine(name, type, value, result.rejected),
        ]);
      }
      this.#entries.set(name, result.converted);
      return;
    }
    // Bottom-type assignment: the guard narrowed this branch to never,
    // so the payload binds cast-free (the funnel trusts the triaged
    // registry entry).
    const spec: CustomVarSpec = type;
    let parsed: z.ZodSafeParseResult<unknown>;
    // Wrapping ONLY the parse call: author schema code can throw even on
    // merely-failing values, and every thrown kind settles the fault line.
    try {
      parsed = spec.schema.safeParse(value);
    } catch {
      throw new VariableRejectionError([renderVarSpecFaultLine(name)]);
    }
    if (!parsed.success) {
      // Cast-free narrowing to the structural slice: symbol path segments
      // filter out by type-predicate (plain array ops).
      const issues: readonly VarShapeIssue[] = parsed.error.issues.map(
        (issue) => ({
          message: issue.message,
          path: issue.path.filter(
            (segment): segment is string | number =>
              typeof segment !== "symbol",
          ),
        }),
      );
      throw new VariableRejectionError([renderVarSpecDefectLine(name, issues)]);
    }
    this.#entries.set(name, parsed.data);
  }

  /** Sole program-owned erasure (the model lane never erases): an undeclared name faults the pure-ASCII bookkeeping voice leaving entries and registry verbatim, and a declared name drops its entry — idempotent over absence — while the declaration survives, with post-clear writes re-entering the funnel from scratch (set() bypassed entirely). */
  clear(name: string): void {
    if (!this.#types.has(name)) {
      throw new VarRegistryError(renderVarClearUndeclaredLine(name));
    }
    this.#entries.delete(name);
  }

  /** Insertion-ordered, deduplicated key list (stored names only; a
   * declared-but-never-set name stays OUT). */
  list(): string[] {
    return [...this.#entries.keys()];
  }

  /** THE registry query surface: fresh plain object per call listing every
   * declared name to its DISPLAY name in DECLARATION order (independent of
   * stored values): six literals display themselves, specs display their
   * label (ONE module-private display resolver feeds this face and the
   * declarationDisplay() companion below). Callers may retain freely
   * (counters() doctrine); derive declared-or-not AND display from this
   * snapshot (the single registry introspection face). */
  declarations(): Readonly<Record<string, string>> {
    const snapshot: Record<string, string> = {};
    for (const [name, type] of this.#types) {
      snapshot[name] = displayVarDeclaration(type);
    }
    return snapshot;
  }

  /** COMPANION QUERY over the registry: the DISPLAYED name of ONE
   * declaration — a literal displays itself, a spec its label — or
   * UNDEFINED for an undeclared name. Safe channel: introspection, not
   * admission — never throws, mutates nothing, mints nothing (parallel to
   * the untyped-safe get(name) channel doctrine). THE surface the
   * model-facing lanes render listings WITHOUT spec-internals awareness. */
  declarationDisplay(name: string): string | undefined {
    const stored = this.#types.get(name);
    if (stored === undefined) return undefined;
    return displayVarDeclaration(stored);
  }
}

// Additive usage totals mirroring the platform's five-field struct. Cost is
// tracked to keep the struct shape identical, though nothing exposes it yet.
interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

// Instance-owned observation state fed exclusively by the single
// instance-scoped listener. Owns the per-tool start counts, the
// toolCallId-correlated pending-path map (interrupted starts are drained at
// each run start), the monotonic committed-path master list with its
// baseline cursor, the monotonic settled-payload master list with its
// baseline cursor, the assistant usage accumulator, and the per-run-window
// aborted mark (an assistant message_end carrying stopReason "aborted";
// anchored at every run start, consumed once by the settle-side consult).
class SessionObserver {
  #toolUses: Record<string, number> = {};
  #askUserCalls = 0;
  #askUserBaseline = 0;
  #pendingPaths: Map<string, string> = new Map();
  #masterList: string[] = [];
  #pathBaseline = 0;
  #payloadMaster: unknown[] = [];
  #messageBaseline = 0;
  #runAborted = false;
  #usageTotals: UsageTotals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };

  handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        // An interrupted execution's dangling start must not leak into a
        // later run's committed-path partition - the same doctrine anchors
        // the abort window: an unconsumed stale mark dies with the window.
        this.#pendingPaths.clear();
        this.#runAborted = false;
        break;
      case "tool_execution_start": {
        const { toolCallId, toolName, args } = event;
        this.#toolUses[toolName] = (this.#toolUses[toolName] ?? 0) + 1;
        if (toolName === ASK_USER_TOOL_NAME) {
          this.#askUserCalls += 1;
        }
        if (FILE_TOOL_NAMES.has(toolName)) {
          // Optional chaining keeps this null-safe; duplicate call ids
          // overwrite.
          const path = args?.path;
          if (typeof path === "string" && path.length > 0) {
            this.#pendingPaths.set(toolCallId, path);
          }
        }
        break;
      }
      case "tool_execution_end":
        // The end event carries no args: the path came from the matching
        // start, and the outcome decides whether it commits.
        this.#resolveEnd(event.toolCallId, event.isError);
        break;
      case "message_end": {
        // Only assistant persistence carries main-LLM usage; tool results
        // carry their own tool-execution accounting and must stay out.
        const message = event.message;
        if (message.role === "assistant") {
          const totals = this.#usageTotals;
          totals.input += message.usage.input;
          totals.output += message.usage.output;
          totals.cacheRead += message.usage.cacheRead;
          totals.cacheWrite += message.usage.cacheWrite;
          totals.cost += message.usage.cost.total;
          // Only the FINAL assistant message of a run can physically carry
          // "aborted" (an abort terminates the whole run) - marking on any
          // such event in the window is sound and order-independent.
          if (message.stopReason === "aborted") {
            this.#runAborted = true;
          }
        }
        break;
      }
      case "agent_end": {
        // Per-attempt payloads are disjoint, so appending composes across
        // internal retries; the retry flag is deliberately unread — the
        // prompt promise owns settlement.
        for (const payload of event.messages) {
          this.#payloadMaster.push(payload);
        }
        break;
      }
      default:
        // Everything else — tool_execution_update, turn_*, agent_settled,
        // queue/compaction/retry/summarization events — is
        // observation-neutral.
        break;
    }
  }

  /** Fresh snapshot object; callers may retain or mutate it freely. */
  snapshot(): SessionCounters {
    const totals = this.#usageTotals;
    return {
      // Derived from the master list: the invariant "count equals
      // committed paths" holds by construction.
      filesWritten: this.#masterList.length,
      askUserCalls: this.#askUserCalls,
      toolUses: { ...this.#toolUses },
      tokens:
        totals.input + totals.output + totals.cacheRead + totals.cacheWrite,
    };
  }

  /** Non-consuming slice of committed paths since the last baseline advance. */
  filesWrittenDelta(): string[] {
    return this.#masterList.slice(this.#pathBaseline);
  }

  /** Move the path baseline past every committed observation. */
  resetPathBaseline(): void {
    this.#pathBaseline = this.#masterList.length;
  }

  /** Non-consuming slice of recorded payloads since the last baseline advance. */
  runMessages(): unknown[] {
    return this.#payloadMaster.slice(this.#messageBaseline);
  }

  /** Move the payload baseline past every recorded observation. */
  resetMessageBaseline(): void {
    this.#messageBaseline = this.#payloadMaster.length;
  }

  /** Non-consuming take of started ask-user executions since the last
   * baseline advance — this run's window (failures included; near-names
   * excluded by the exact-match constant). */
  askUserCallsDelta(): number {
    return this.#askUserCalls - this.#askUserBaseline;
  }

  /** Move the ask-user baseline past every observed start; the cumulative
   * counter is untouched. */
  resetAskUserCallsBaseline(): void {
    this.#askUserBaseline = this.#askUserCalls;
  }

  /** Consume-once take of the current window's aborted mark: returns the
   * just-settled run's observation AND clears it (each run's mark belongs
   * to that run; the agent_start anchor is the second protection against
   * an unconsumed stale value). */
  takeRunAborted(): boolean {
    const observed = this.#runAborted;
    this.#runAborted = false;
    return observed;
  }

  #resolveEnd(toolCallId: string, isError: boolean): void {
    // Commit first, drop after: a fault between the two leaves the entry
    // replayable (a later end commits it exactly once) rather than lost,
    // and no duplicate commit is possible because a dropped id finds no
    // entry on any later end.
    const path = this.#pendingPaths.get(toolCallId);
    if (!isError && path !== undefined) {
      this.#masterList.push(path);
    }
    this.#pendingPaths.delete(toolCallId);
  }
}

/**
 * Refusal raised when rebind is handed a FOREIGN handle — its sessionId
 * differs from this frame's identity. The message is constructed at the
 * throw site over the two session ids (claim first, frame second). Bare
 * identity capture reduces via captureError to {type, message}; NO cause.
 */
export class SessionHandleRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionHandleRefusalError";
  }
}

/**
 * Host for one capability engagement: owns the constructed session runtime
 * by reference plus the run observation fed by its single attached
 * listener, and runs budgeted phase engines over the session's prompt
 * channel. Construction settles before an instance is ever handed out.
 */
export class PioSession {
  /** Identity of the settled session handle. */
  readonly id: string;
  /** Constructed runtime by reference — reach path for runs and teardown. */
  readonly runtime: AgentSessionRuntime;
  /** The per-instance variable store - minted in create() and shared BY
   * REFERENCE with the registered model-tool trio (one identity at every
   * hop; the single validated entry point for every variable write,
   * declare-then-set; hooks and phases reach the LIVE values by
   * reference). Composed hosts from fromRuntime mint their OWN stores
   * through the constructor default (disjoint by design). */
  readonly vars: SessionVariableStore;

  #observer: SessionObserver;
  /** Last-bound handle MARKER — rebind's same-handle comparison only. */
  #lastBound: AgentSession;
  /** Execution state minted by create or discovered through the settled
   * handle's symbol stamp (fromRuntime); ABSENT means no state — every
   * gate operation on such an instance no-ops cleanly. */
  #executionState: SessionExecutionState | undefined;

  /** Private by design: the two public factories (create / fromRuntime)
   * are the only construction paths. The OPTIONAL fourth parameter binds
   * a PRE-MINTED variable store (create passes its own mint); the
   * DEFAULT is a fresh mint, so composed frames stay disjoint-store by
   * construction (no placement branch, no flag). */
  private constructor(
    runtime: AgentSessionRuntime,
    observer: SessionObserver,
    executionState: SessionExecutionState | undefined = undefined,
    vars: SessionVariableStore = new SessionVariableStore(),
  ) {
    this.id = runtime.session.sessionId;
    this.#lastBound = runtime.session;
    this.runtime = runtime;
    this.vars = vars;
    this.#observer = observer;
    this.#executionState = executionState;
  }

  /**
   * The only standalone construction path: mints the observer and its
   * single instance-scoped listener PLUS the one per-session execution
   * state over the owned anchor channels PLUS the ONE variable store and
   * the model-facing variable trio built over it (threaded onto the
   * UNCONDITIONAL customTools slot behind the fenced bash entry), threads
   * the listener and the UNCONDITIONAL guard install (state + both
   * tool-call handler closures) through the construction seam (exactly
   * one live subscription at any instant), and returns the ready instance.
   * The composed-frame sibling (fromRuntime) hosts an already-settled
   * runtime instead.
   */
  static async create(cwd: string, sessionsRoot?: string): Promise<PioSession> {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    // THE one per-session execution state: minted over the two owned anchor
    // channels (storage ONLY — resolution defers to snapshot(), zero env/
    // fs at construction).
    const executionState = new SessionExecutionState({
      projectSlotRoot: () =>
        join(
          deriveStateRootFromAgentDir(process.env.PI_CODING_AGENT_DIR),
          "projects",
          slugify(cwd),
        ),
      workspaceCwd: () => resolve(cwd),
    });
    // THE write tool-call handler closure: every tool-call verdict consults
    // a FRESH snapshot through the stateless predicate — late binding
    // survives rebind swaps and span churn; no containment anywhere.
    const writeToolCallHandler = (toolName: string, input: unknown) =>
      decideWrite(executionState.snapshot(), toolName, input);
    // Var tool-call handler: same fresh-snapshot-per-call doctrine as the
    // write row; the two rows share one guarded install (first refusal wins).
    const varToolCallHandler = (toolName: string, input: unknown) =>
      decideVarWrite(executionState.snapshot(), toolName, input);
    // THE one fenced bash instance: built over the SAME execution state the
    // guard install stamps BY REFERENCE - the per-invocation fresh snapshot
    // consult makes late binding sufficient (identical doctrine to the
    // closure above); the instance may persist while the frames it consults
    // churn.
    const landlockBash = createLandlockBash(cwd, executionState);
    // THE one variable store: minted HERE strictly pre-construction so
    // the trio can bind it before the session exists - the SAME instance
    // the finished host exposes as its vars handle (one identity at every
    // hop; composed frames take the constructor's fresh-mint default).
    const vars = new SessionVariableStore();
    // THE model-facing variable trio: constructed ONCE over the minted
    // store and appended to the customTools slot behind the fenced bash
    // entry (set -> get -> list; bash keeps its stable leading position).
    const varTools = createVarTools(vars);
    const runtime = await createPioSession(cwd, sessionsRoot, {
      sessionListener: listener,
      customTools: [landlockBash, ...varTools],
      guardInstall: {
        executionState,
        handlers: [writeToolCallHandler, varToolCallHandler],
      },
    });
    return new PioSession(runtime, observer, executionState, vars);
  }

  /**
   * Synchronous factory over an ALREADY-SETTLED runtime — the composed-
   * frame sibling of create (cf. dist SessionManager.create/open/inMemory).
   * Mints a fresh observer and listener routed to it, subscribes EXACTLY
   * ONCE on the runtime's CURRENT handle, DISCOVERS the execution state
   * from that handle's symbol stamp (cast-free narrowing; absent for a
   * foreign handle), and constructs through the same private constructor.
   * Zero SDK-construction reach; no defensive input validation — the type
   * contract carries the guarantee.
   */
  static fromRuntime(runtime: AgentSessionRuntime): PioSession {
    const observer = new SessionObserver();
    const listener: AgentSessionEventListener = (event) => {
      observer.handle(event);
    };
    runtime.session.subscribe(listener);
    // Cast-free discovery over the settled handle's symbol stamp: the
    // Reflect.get read lands in an unknown local, narrowed by instanceof.
    // A pio-constructed shared handle FINDS THE EXACT object minted at
    // create (composed frames share it by handle identity); an unstamped
    // foreign handle resolves undefined — no execution state, every gate
    // operation below no-ops.
    const stamped: unknown = Reflect.get(
      runtime.session,
      EXECUTION_STATE_STAMP,
    );
    const executionState =
      stamped instanceof SessionExecutionState ? stamped : undefined;
    return new PioSession(runtime, observer, executionState);
  }

  /**
   * Re-arm the persistent observer on a freshly applied handle after a
   * platform session replacement. Gates, fixed order: IDENTITY — a claimed
   * handle whose sessionId differs from this frame's id refuses LOUDLY
   * and mutates nothing; NO-OP — the already-bound handle (by reference)
   * never double-subscribes. Otherwise a FRESH listener closure routed to
   * the SAME persistent observer subscribes on the claimed handle and the
   * last-bound marker moves. Accepted edge: rearms assume the previously
   * bound handle died via platform dispose (switchSession tears down
   * first). The returned unsubscribe is deliberately dropped
   * (construction-seam doctrine). The execution state is left INTACT
   * across the swap on purpose: span layers belong to the balanced
   * enter/exit lifecycle and survive a handle replacement. Never reads
   * this.runtime.session — the explicit argument is the seam.
   */
  rebind(session: AgentSession): void {
    if (session.sessionId !== this.id) {
      throw new SessionHandleRefusalError(
        `pio-session: rebind refused \u2014 handle '${session.sessionId}' is not this frame's session ('${this.id}')`,
      );
    }
    if (session === this.#lastBound) {
      return;
    }
    const listener: AgentSessionEventListener = (event) => {
      this.#observer.handle(event);
    };
    session.subscribe(listener);
    this.#lastBound = session;
  }

  /** Push the running capability's sources as a span layer on the session's
   * execution state. No-op when the instance carries no execution state. */
  enterCapability(sources: CapabilitySources): void {
    this.#executionState?.enterCapability(sources);
  }

  /** Pop the session's execution-state span layer (span settlement).
   * No-op when the instance carries no execution state. */
  exitCapability(): void {
    this.#executionState?.exitCapability();
  }

  /** Session-cumulative snapshot (fresh object per call). */
  counters(): SessionCounters {
    return this.#observer.snapshot();
  }

  /**
   * Append the span's section header as a durable custom message WITHOUT
   * triggering an LLM turn (no options object = the SDK's append-only idle
   * branch). Same handle reach as execute_phase (the runtime's CURRENT
   * handle). Awaited before the body acts, so the header precedes the
   * span's first phase prompt in transcript order.
   */
  async markCapability(label: string): Promise<void> {
    await this.runtime.session.sendCustomMessage({
      customType: PIO_CAPABILITY_CUSTOM_TYPE,
      content: renderCapabilityMarker(label),
      display: true,
      details: undefined,
    });
  }

  /**
   * One phase = a budgeted sequence of settled agent runs driven through the
   * session's prompt channel; the once-composed marker line leads every
   * run's text and the between-runs hook observes each settling run.
   * Declared deliverable paths (write) and declared variable names (vars)
   * arm the dual-face settlement gate: every normal break point passes the
   * fresh EXISTS-and-PRESENCE consults before settling — a denial burns one
   * corrective re-run per denying face (mirrored ceilings) and exhaustion
   * throws the error home's ContractViolationError collecting ALL
   * still-missing violations (file lines first, then variable lines). Arm
   * time: every listed variable name must carry a base-type registration
   * before the first turn — a miss faults LOUDLY at arm (module-local ASCII
   * bookkeeping voice) and never reaches the ceiling. Every exit closes both
   * windows so the phase leaks nothing into the next one.
   */
  async execute_phase(id: string, opts?: PhaseOptions): Promise<PhaseResult> {
    const min = opts?.min ?? 1;
    const max = opts?.max ?? Infinity;
    // Resolved once at phase start and retained for the whole duration:
    // the settlement gate, the ceiling failure, and the execution-state
    // feed all consult this same retained list.
    const declarations = (opts?.write ?? []).map((entry) => ({
      entry,
      resolved: resolve(entry),
    }));
    // Normalized primitives (absent implies false) fed VERBATIM beside the
    // retained list: the phase's project-files scope declaration (judged
    // only at decision time - clamped there against the contract flag) and
    // its scratch declaration (judged only at decision time, never clamped
    // - no contract-side counterpart exists); the variable-name list joins
    // them by reference (admission is plain inclusion over the stored,
    // deduped listing).
    const allowProjectWrites = Boolean(opts?.allowProjectWrites);
    const tmpDirAllowed = Boolean(opts?.tmpDirAllowed);
    // Rides by reference (verbatim carriage - no copy or transform):
    // present-and-non-empty arms the phase's variable governance.
    const declaredVars = opts?.vars ?? [];
    // Retained for the whole duration, parallel to the retained write
    // declarations: declaration-order, first-occurrence dedupe — the SAME
    // semantics the guard applies at judgment time.
    const effectiveVars = effectiveVarListing(declaredVars);
    // ARM-TIME REGISTRY VALIDATION (strictly between the listing computation
    // and the attach, pre-disclosure, pre-try): a miss FAULTS LOUDLY before
    // the first turn — nothing is attached (no detach needed, no window
    // opens, zero prompts issue) and the throw escapes VERBATIM through the
    // standard containment channels.
    const registrySnapshot = this.vars.declarations();
    const varMisses = effectiveVars.filter(
      (name) => !Object.hasOwn(registrySnapshot, name),
    );
    if (varMisses.length > 0) {
      throw new PhaseVarDeclarationError(
        renderPhaseVarFaultLine(id, varMisses),
      );
    }
    // Paths, both class flags, and the variable-name list feed the
    // execution state when any dimension is declared: attach STRICTLY AT PHASE START
    // (outside the try block, so a loud bookkeeping fault escapes with no
    // finally-side bookkeeping to untangle); the attached flags keep the
    // closeout detach symmetric over every exit cause. No dimension
    // declared attaches NOTHING - the span sources supply the clamp ceiling
    // unchanged (they admit nothing on their own).
    const declaredPaths = declarations.map(
      (declaration) => declaration.resolved,
    );
    let attached = false;
    if (
      this.#executionState !== undefined &&
      (declaredPaths.length > 0 ||
        allowProjectWrites ||
        tmpDirAllowed ||
        declaredVars.length > 0)
    ) {
      this.#executionState.attachPhase(
        id,
        declaredPaths,
        allowProjectWrites,
        tmpDirAllowed,
        declaredVars,
      );
      attached = true;
    }
    // THE phase-permission DISCLOSURE: ONE fresh snapshot consult strictly
    // AFTER the attach completes (late binding - the block reflects the
    // window this very phase just armed, never a pre-attach reading) and
    // OUTSIDE the try (a channel fault escapes verbatim - no containment).
    // Appended AT THE END of the marker-led composition into the SAME text
    // payload so the block trails every observed run incl. corrective
    // retries (corrective notes ride strictly after it).
    const disclosure = renderPhasePermissionDisclosure(
      this.#executionState?.snapshot(),
    );
    // Composed once per phase: the marker line and the instructions, then
    // the trailing disclosure block; re-runs re-send the identical bytes.
    const text =
      renderPhaseMarker(id) +
      (opts?.instructions ? `\n${opts.instructions}` : "") +
      "\n\n" +
      disclosure;
    let iterations = 0;
    // Independent of budget and stop rule; never surfaced on PhaseResult.
    let expectationRetries = 0;
    // The variable face's twin counter (mirrored ceiling; same isolation).
    let varExpectationRetries = 0;
    // Next run's corrective block: set only at a gate denial, consumed once —
    // floor/hook continuations re-send the untouched baseline.
    let pendingNote: string | undefined;
    try {
      for (;;) {
        // Close the previous run's window before this run's can open.
        this.#observer.resetPathBaseline();
        this.#observer.resetAskUserCallsBaseline();
        iterations += 1;
        const outgoing =
          pendingNote !== undefined ? `${text}\n${pendingNote}` : text;
        pendingNote = undefined;
        await this.runtime.session.prompt(outgoing);
        // Between-turns interruption consult - FIRST post-settlement
        // decision, preemptive over floor/hook/budget and both gate faces:
        // an aborted settling run ends the phase as a typed cancellation
        // instead of resuming into further iterations.
        if (this.#observer.takeRunAborted()) {
          throw new PhaseInterruptionError();
        }
        const counters = this.#observer.snapshot();
        const filesWritten = this.#observer.filesWrittenDelta();
        const askUserCalls = this.#observer.askUserCallsDelta();
        let proceed = iterations < min;
        const shouldStopLoop = opts?.shouldStopLoop;
        if (shouldStopLoop) {
          const verdict = await shouldStopLoop({
            counters,
            filesWritten,
            askUserCalls,
            vars: this.vars,
          });
          proceed = proceed || !verdict;
        }
        if (!proceed || iterations >= max) {
          // Dual-face settlement gate — this break path only: fresh
          // existsSync over the retained resolved declarations plus FRESH
          // PRESENCE over the retained effective variable listing
          // (origin-blind — an inherited or programmatic value satisfies
          // equally). A face with no declarations settles identically to
          // the ungated case.
          const missing = declarations.filter(
            (declaration) => !existsSync(declaration.resolved),
          );
          const missingVars = effectiveVars.filter(
            (name) => this.vars.get(name) === undefined,
          );
          if (missing.length > 0 || missingVars.length > 0) {
            // Cap check BEFORE any increment (mirror of the file comparison
            // order): a face at ITS OWN cap with expectations still unmet
            // ends the phase.
            const fileAtCap =
              missing.length > 0 &&
              expectationRetries >= MAX_EXPECTATION_RETRIES;
            const varAtCap =
              missingVars.length > 0 &&
              varExpectationRetries >= MAX_VAR_EXPECTATION_RETRIES;
            if (fileAtCap || varAtCap) {
              // Collect-all: file lines first (declaration order), then
              // variable lines (effective-listing order); satisfied faces
              // contribute zero lines.
              throw new ContractViolationError([
                ...missing.map((declaration) =>
                  renderMissingOutputLine(
                    id,
                    declaration.entry,
                    declaration.resolved,
                  ),
                ),
                ...missingVars.map((name) =>
                  renderMissingVariableLine(id, name),
                ),
              ]);
            }
            // One corrective note per denying face, FIXED ORDER (output
            // guard first, then variable guard), single LF when both
            // present; a single-face denial degrades to the pure bytes.
            const notes: string[] = [];
            if (missing.length > 0) {
              expectationRetries += 1;
              notes.push(
                renderExpectationRetryLine(
                  iterations,
                  missing.map((declaration) => declaration.resolved),
                ),
              );
            }
            if (missingVars.length > 0) {
              varExpectationRetries += 1;
              notes.push(renderVariableRetryLine(iterations, missingVars));
            }
            pendingNote = notes.join("\n");
            continue; // denied settlement: re-enter the loop body
          }
          break;
        }
      }
      const messages = this.#observer.runMessages();
      const finalSnapshot = this.#observer.snapshot();
      return {
        done: true,
        iterations,
        messages,
        varsDelta: {},
        counters: finalSnapshot,
        tokens: finalSnapshot.tokens,
      };
    } finally {
      // Windows never leak into the next phase regardless of the exit cause.
      this.#observer.resetPathBaseline();
      this.#observer.resetAskUserCallsBaseline();
      this.#observer.resetMessageBaseline();
      if (attached) this.#executionState?.detachPhase();
    }
  }
}
