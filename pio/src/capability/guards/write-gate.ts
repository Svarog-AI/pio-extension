// Per-session write gate — the pure enforcement module for agent-hook write
// interception on the pio runtime. One pure object per session owns the whole
// rule: permission derives from exactly TWO declared sources (the active
// capability contract and the active phase declaration) and ONE effective
// allowlist exists at decision time — never two sets consulted together, no
// intersection, no union, no special cases. Depth-0 turns (no span active)
// run the identical code path as an empty-contract span: one branch, where
// "the empty set" simply happens to be the running state's sources.
//
// Terminology is deliberate: a span record on the LIFO stack is a LAYER
// ("frame" is reserved for composed-execution units elsewhere in this
// package). Enter/exit is save/restore bookkeeping for composition nesting
// only — a child span pushed over the caller suspends the caller's pair and
// restores it intact on pop, so running-capability-exclusive governance falls
// out of the stack mechanics with zero policy code.
//
// Purity doctrine: the constructor stores two LAZY PROVIDER CLOSURES and
// touches nothing else — no env reads, no filesystem access (existence
// checks belong to the engine's settlement gate, never here), no SDK reach.
// A faulty channel fails LOUDLY: the producer's typed no-silent-fallback
// error propagates VERBATIM at first consult; this module never catches,
// wraps, or substitutes provider errors. Verdicts cover EXACTLY the observed
// writer-tool set (`write`/`edit` via string `input.path`); bash stays
// ungated by design (backlog territory) and there is no
// vscode_apply_workspace_edit branch (absent from the bubble roster). The
// `/tmp/` prefix parity class is always allowed before any other
// consideration, at every depth — legacy parity, exact `startsWith("/tmp/")`
// semantics (`/tmp` itself and `/tmpfoo/*` are NOT covered).
//
// Every denial RETURNS a house-style message (`{ block: true, reason }`) —
// the ONLY feedback the model gets: the single governing source named (the
// phase id, the capability name, or the no-span state), the effective
// allowlist inline ("none" when nothing is — clamped-away declarations are
// simply absent from that list), and the `/tmp/` parity clause in EVERY line.

import { resolve } from "node:path";
import { hasWildcard } from "../../sandbox/fsview.ts";

/** Lazy channels — the ONLY way the gate learns paths. Stored at
 * construction, consulted lazily; either may THROW the producer's typed
 * no-silent-fallback error (e.g. base.ts's CapabilityEnvError behind the
 * root provider) on a faulty channel — the gate propagates it verbatim,
 * never catches/wraps/falls back. */
export interface WriteGateProviders {
  /** Project-slot root for pattern anchoring: <stateRoot>/projects/<projectKey> —
   * the SAME root the base's settle seam computes (arrive normalized, no
   * trailing separator; the producer guarantees this). */
  projectSlotRoot(): string;
  /** Session launch cwd — the allowProjectWrites scope (resolved form). */
  workspaceCwd(): string;
}

/** The running capability's sources — PLAIN DATA (contract values as-is; the
 * module deliberately does NOT import contract.ts, keeping it hermetic). */
export interface CapabilitySources {
  /** Capability name — the governing source named in span denials. */
  name: string;
  /** Slot-relative pattern list (contract.writes verbatim). */
  writes: readonly string[];
  /** Legacy role retained: admits project-root files beyond the declared patterns. */
  allowProjectWrites: boolean;
}

/** Structural denial shape — assignable to the SDK's ToolCallEventResult
 * without importing it. `reason` is the ONLY feedback the model gets. */
export interface WriteGateVerdict {
  block: true;
  reason: string;
}

/** Module-local typed refusal for broken enter/exit bookkeeping — loud, never
 * silent: silent tolerance would corrupt the layer stack invisibly, and
 * enforcement integrity demands deterministic state. Deliberately NOT part
 * of the pinned export surface (consumers observe `name` + message bytes). */
class WriteGateBookkeepingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteGateBookkeepingError";
  }
}

// ---------------------------------------------------------------------------
// Denial rendering — NEW house-style lines (legacy byte-parity cut per the
// owner ruling): the message ALWAYS shows the effective permission set at
// the moment of refusal. U+2014 enters these pinned literals ONLY as the
// \u2014 escape (house discipline).
// ---------------------------------------------------------------------------

const TMP_PARITY_CLAUSE = "Scratch files under /tmp/ stay open.";

/** SOLE DENIAL LINE SHAPES — the suite goldens mirror these byte-for-byte. */
const renderPhaseDenial = (
  phaseId: string,
  survivors: readonly string[],
): string =>
  `Writing is refused during phase '${phaseId}'. Allowed targets: ${survivors.join(", ")}. ${TMP_PARITY_CLAUSE}`;

const renderCapabilityDenial = (
  sources: CapabilitySources,
  workspaceCwd: string | undefined,
): string => {
  const parts: string[] = [...sources.writes];
  if (sources.allowProjectWrites && workspaceCwd !== undefined) {
    parts.push(`project files under ${workspaceCwd}`);
  }
  const allowlist = parts.length === 0 ? "none" : parts.join(", ");
  return `Writing is refused during capability '${sources.name}'. Allowed targets: ${allowlist}. ${TMP_PARITY_CLAUSE}`;
};

const renderNoSpanDenial = (): string =>
  // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
  `Writing is refused \u2014 no capability span is active. Allowed targets: none. ${TMP_PARITY_CLAUSE}`;

// ---------------------------------------------------------------------------
// The pattern-direction membership predicate — the REVERSE of FsView.glob()
// (pattern → existing files): does this candidate target path, which does
// NOT yet exist, fall inside this declared slot-relative pattern? Converts
// the documented fsview glob dialect (fsview.ts header) to permission
// direction per segment: equal segment counts after anchoring, per-segment
// {a,b} arm split with independent recursion (nesting honored), [seq]/[!seq]
// classes with ! negation and ranges, ? = one char, * = zero-or-more WITHIN
// THE SEGMENT ONLY, every non-metacharacter literal (regex specials escaped
// by exhaustive literal comparison). Out-of-dialect text FAILS CLOSED:
// reports no-match, never throws, invents no second dialect.
// ---------------------------------------------------------------------------

/** Locate the FIRST well-formed top-level brace group in `text`. */
type BraceScan =
  | { kind: "group"; start: number; end: number }
  | { kind: "stray" } // unpaired close, or an open left unclosed
  | { kind: "none" };

function scanFirstBrace(text: string): BraceScan {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      if (depth === 0) return { kind: "stray" };
      depth -= 1;
      if (depth === 0) return { kind: "group", start, end: i };
    }
  }
  return depth > 0 ? { kind: "stray" } : { kind: "none" };
}

/** Split a brace-group interior into arms at TOP-LEVEL commas (nested brace
 * groups keep their commas). No comma ⇒ single arm = the whole interior
 * (engine-faithful `{a}` → `a`). */
function splitTopLevelArms(interior: string): string[] {
  const arms: string[] = [];
  let depth = 0;
  let cursor = 0;
  for (let i = 0; i < interior.length; i += 1) {
    const ch = interior[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      arms.push(interior.slice(cursor, i));
      cursor = i + 1;
    }
  }
  arms.push(interior.slice(cursor));
  return arms;
}

/** Membership of one character in a translated `[seq]` body (negation handled
 * by the caller). Degenerate ranges (lo > hi) fall through to literal
 * handling — engine-faithful; a lone leading '-' is literal by guard. */
function classContains(body: string, ch: string): boolean {
  let i = 0;
  while (i < body.length) {
    const lo = body[i];
    const mid = body[i + 1];
    const hi = body[i + 2];
    if (
      mid === "-" &&
      hi !== undefined &&
      lo !== "-" &&
      hi !== "-" &&
      lo <= hi
    ) {
      if (lo <= ch && ch <= hi) return true;
      i += 3;
      continue;
    }
    if (lo === ch) return true;
    i += 1;
  }
  return false;
}

/** Linear (brace-free) segment match: `[cls]`, `?`, `*` (segment-confined
 * by construction — segments never contain '/') and exhaustive literal
 * comparison, which gives literal-special fidelity for free. Fails closed on
 * unclosed classes, empty class bodies, and backslash escapes (out of the
 * documented surface). */
function linearSegmentMatches(pattern: string, target: string): boolean {
  let i = 0;
  let j = 0;
  while (i < pattern.length) {
    const token = pattern[i];
    if (token === "*") {
      for (let k = j; k <= target.length; k += 1) {
        if (linearSegmentMatches(pattern.slice(i + 1), target.slice(k)))
          return true;
      }
      return false;
    }
    if (token === "?") {
      if (j >= target.length) return false;
      i += 1;
      j += 1;
      continue;
    }
    if (token === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) return false; // unclosed class — fail closed
      const raw = pattern.slice(i + 1, close);
      if (raw.length === 0 || raw.includes("\\")) return false;
      const negated = raw.startsWith("!");
      if (negated && raw.length === 1) return false; // '[!' — fail closed
      const body = negated ? raw.slice(1) : raw;
      if (j >= target.length) return false;
      if (classContains(body, target[j]) === negated) return false;
      i = close + 1;
      j += 1;
      continue;
    }
    if (token === "}" || j >= target.length || token !== target[j])
      return false;
    i += 1;
    j += 1;
  }
  return j === target.length;
}

/** Match one pattern segment against one target segment (recursive descent:
 * each brace arm is substituted and re-parsed as a whole segment, so arms
 * carry wildcards/nested braces freely). `hasWildcard` is a FAST-PATH HINT
 * ONLY — brace-only segments take the full transform even when it reports
 * false. Never throws; out-of-dialect text answers no-match. */
function segmentMatches(pattern: string, target: string): boolean {
  // A stray '}' with no opener is out-of-dialect too — fail closed even
  // though the fast-path hint (and the brace test) would not see it.
  if (
    !hasWildcard(pattern) &&
    !pattern.includes("{") &&
    !pattern.includes("}")
  ) {
    return pattern === target;
  }
  const scan = scanFirstBrace(pattern);
  if (scan.kind === "stray") return false;
  if (scan.kind === "group") {
    const arms = splitTopLevelArms(pattern.slice(scan.start + 1, scan.end));
    const head = pattern.slice(0, scan.start);
    const tail = pattern.slice(scan.end + 1);
    for (const arm of arms) {
      if (segmentMatches(head + arm + tail, target)) return true;
    }
    return false;
  }
  return linearSegmentMatches(pattern, target);
}

/** The pattern-direction membership predicate. Anchors strictly under `root`
 * (target === root is no match; out-of-root targets never match, even when
 * the suffix textually fits — compare on full resolved strings first), then
 * requires EQUAL segment counts and a per-segment dialect match. */
export function matchesAnchoredGlob(
  pattern: string,
  root: string,
  target: string,
): boolean {
  const prefix = `${root}/`;
  if (!target.startsWith(prefix)) return false;
  const remainder = target.slice(prefix.length);
  const patternSegments = pattern.split("/");
  const targetSegments = remainder.split("/");
  if (patternSegments.length !== targetSegments.length) return false;
  for (let index = 0; index < patternSegments.length; index += 1) {
    if (!segmentMatches(patternSegments[index], targetSegments[index]))
      return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The gate object — bookkeeping (single scalar pair per layer) + verdict.
// ---------------------------------------------------------------------------

/** One entry of the LIFO layer stack — the ENTIRE permission world while it
 * sits innermost: the running capability's sources plus its current phase
 * entry (or none). The verdict consults ONLY the innermost layer's pair. */
interface PhaseEntry {
  id: string;
  /** Surviving confirmed paths (already-resolved absolute, declaration
   * order, deduplicated). EMPTY confers no phase governance (fall-through). */
  survivors: string[];
  /** Save/restore half: whatever occupied the slot before this entry
   * attached (production flows mirror entries, so normally null). */
  previous: PhaseEntry | null;
}

interface GateLayer {
  sources: CapabilitySources;
  phase: PhaseEntry | null;
}

/** The running writer-tool coverage — the OBSERVED set only (local const;
 * the observer's FILE_TOOL_NAMES is deliberately not imported). Any other
 * tool (including bash) yields no target: allowed by silence. */
const WRITER_TOOLS = new Set(["edit", "write"]);

/** The session-base pair at depth 0 — the EMPTY set (owner ruling 6):
 * total default-deny beyond the `/tmp/` parity class, computed through the
 * IDENTICAL branch as an empty-contract span. One code path, no special case. */
const BASE_SOURCES: CapabilitySources = {
  name: "",
  writes: [],
  allowProjectWrites: false,
};

/** The per-session write gate: a pure in-memory enforcement object fed by
 * lazy providers and explicit enter/exit calls from producers. */
export class WriteGate {
  private readonly providers: WriteGateProviders;
  /** LIFO capability layers; depth 0 = the empty-set session base. */
  private layers: GateLayer[] = [];

  /** Closure storage ONLY — no env, no fs, no defaults from process state. */
  constructor(providers: WriteGateProviders) {
    this.providers = providers;
  }

  /** Push a capability layer (span start). Saves the suspended outer pair by
   * stack mechanics — the new layer's pair is the whole world while active. */
  enterCapability(sources: CapabilitySources): void {
    this.layers.push({ sources, phase: null });
  }

  /** Pop the capability layer (span settlement — success AND catch-all).
   * Mismatched exits throw: underflow OR an outstanding phase entry. */
  exitCapability(): void {
    const top = this.layers[this.layers.length - 1];
    if (top === undefined) {
      throw new WriteGateBookkeepingError(
        "write gate: exitCapability() with no active capability layer",
      );
    }
    if (top.phase !== null) {
      throw new WriteGateBookkeepingError(
        // Escaped so the U+2014 bytes survive editor and toolkit glyph mangling.
        "write gate: exitCapability() with an outstanding phase entry \u2014 exitPhase() first",
      );
    }
    this.layers.pop();
  }

  /** Confirm/clamp `declaredPaths` (ALREADY-RESOLVED absolute paths — the
   * producer resolves once at phase start; consumed VERBATIM, never
   * re-resolved) against the current top layer's sources; attach the
   * surviving set as the phase entry. Uncovered entries are DROPPED AT ENTRY
   * — silent, never granted, absent from every denial listing. Validates
   * ALL confirmation before mutating: a provider fault mid-confirmation
   * escapes with the layer untouched (the phase never entered). An empty
   * declaration is a valid no-op confirmation (empty set ⇒ no phase
   * governance) so the paired exit stays symmetric. */
  enterPhase(phaseId: string, declaredPaths: readonly string[]): void {
    const top = this.layers[this.layers.length - 1];
    if (top === undefined) {
      throw new WriteGateBookkeepingError(
        "write gate: enterPhase() with no active capability layer",
      );
    }
    const survivors = new Set<string>();
    for (const target of declaredPaths) {
      if (this.admittedBy(top.sources, target).allowed) survivors.add(target);
    }
    top.phase = { id: phaseId, survivors: [...survivors], previous: top.phase };
  }

  /** Restore the pre-phase state (symmetric, every exit cause). */
  exitPhase(): void {
    const top = this.layers[this.layers.length - 1];
    if (top === undefined || top.phase === null) {
      throw new WriteGateBookkeepingError(
        "write gate: exitPhase() with no active phase entry",
      );
    }
    top.phase = top.phase.previous;
  }

  /** Drain to depth-0, idempotent — the sanctioned non-mirrored path. */
  reset(): void {
    this.layers.length = 0;
  }

  /** One tool-call verdict: `undefined` = allowed; a verdict = the refusal
   * message. Pinned verdict order, one pass per target: (1) the `/tmp/`
   * prefix is ALWAYS allowed, before any other consideration, at every
   * depth; (2) a NON-EMPTY confirmed set is exhaustive — exact string-set
   * membership, span sources never consulted alongside it; (3)+(4) ONE
   * branch — the active capability span governs (pattern membership OR the
   * project-scope disjunct), where depth 0 computes the identical
   * computation over the empty base sources. Every DENY returns a
   * house-style message: the ONLY feedback (no terminate, no steering).
   * Non-writer tools and missing/non-string paths yield NO target:
   * `undefined` with zero provider consultations and zero bookkeeping. */
  decide(toolName: string, input: unknown): WriteGateVerdict | undefined {
    const target = WRITER_TOOLS.has(toolName) ? extractTarget(input) : null;
    if (target === null) return undefined;
    if (target.startsWith("/tmp/")) return undefined;
    const layer = this.layers[this.layers.length - 1];
    const phase = layer?.phase ?? null;
    if (phase !== null && phase.survivors.length > 0) {
      if (phase.survivors.includes(target)) return undefined;
      return {
        block: true,
        reason: renderPhaseDenial(phase.id, phase.survivors),
      };
    }
    const admission = this.admittedBy(layer?.sources ?? BASE_SOURCES, target);
    if (admission.allowed) return undefined;
    const reason =
      layer === undefined
        ? renderNoSpanDenial()
        : renderCapabilityDenial(layer.sources, admission.cwd);
    return { block: true, reason };
  }

  /** Single disjunction used by BOTH the span verdict and phase-entry
   * confirmation — one coverage definition, no drift between the two.
   * Disjunct (i) consults the root provider ONLY when `writes` is
   * non-empty; disjunct (ii) the cwd provider ONLY when the flag is set;
   * empty sources consult NOTHING (the one-code-path guarantee). Provider
   * faults escape verbatim. */
  private admittedBy(
    sources: CapabilitySources,
    target: string,
  ): { allowed: true } | { allowed: false; cwd?: string } {
    if (sources.writes.length > 0) {
      const root = this.providers.projectSlotRoot();
      for (const pattern of sources.writes) {
        if (matchesAnchoredGlob(pattern, root, target))
          return { allowed: true };
      }
    }
    if (sources.allowProjectWrites) {
      const cwd = this.providers.workspaceCwd();
      if (target.startsWith(`${cwd}/`)) return { allowed: true };
      return { allowed: false, cwd };
    }
    return { allowed: false };
  }
}

/** Extract the resolved target from a writer-tool call: a non-null object
 * input carrying a STRING `path`, normalized with path.resolve. Any other
 * shape yields `null` — no target, no consultation, no bookkeeping. */
function extractTarget(input: unknown): string | null {
  if (input === null || typeof input !== "object") return null;
  const pathValue = (input as Record<string, unknown>).path;
  if (typeof pathValue !== "string") return null;
  return resolve(pathValue);
}
