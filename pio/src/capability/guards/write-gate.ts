// Per-session write gate: one pure object per session owning enter/exit
// bookkeeping, the single effective allowlist at decision time, and denial
// rendering. Permission derives from exactly TWO declared sources (the
// active capability contract and the active phase declaration); depth-0
// turns run the IDENTICAL branch as an empty-contract span — one code path,
// no special cases, no intersection, no union.
//
// Terminology: stack entries are LAYERS ("frame" is reserved for
// composed-execution units elsewhere in this package). Enter/exit is
// save/restore bookkeeping for composition nesting — a child span suspends
// the caller's pair and restores it intact on pop.
//
// Purity: the constructor stores two LAZY PROVIDER CLOSURES — no env, no
// filesystem access, no SDK reach; provider faults propagate VERBATIM at
// first consult (never caught, wrapped, or fallen back to). Verdicts cover
// EXACTLY `write`/`edit` via string `input.path` (bash stays ungated —
// backlog); the `/tmp/` prefix is always allowed before any other
// consideration, at every depth. Every refusal RETURNS a house-style
// message — the ONLY feedback — naming the governing source (phase id,
// capability name, or no-span state), the effective allowlist inline
// ("none" when nothing is; clamped-away declarations are simply absent),
// and the /tmp/ parity clause in every line.

import { resolve } from "node:path";
import { hasWildcard } from "../../sandbox/fsview.ts";

/** Lazy channels — the ONLY way the gate learns paths. Stored at construction,
 * consulted lazily; either may THROW the producer's typed no-silent-fallback
 * error on a faulty channel — propagated verbatim. */
export interface WriteGateProviders {
  /** Project-slot root for pattern anchoring (<stateRoot>/projects/<key>), normalized, no trailing separator. */
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

/** Typed refusal for broken enter/exit bookkeeping — loud, never silent.
 * Deliberately unexported: consumers observe `name` + message bytes. */
class WriteGateBookkeepingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteGateBookkeepingError";
  }
}

const TMP_PARITY_CLAUSE = "Scratch files under /tmp/ stay open.";

// SOLE DENIAL LINE SHAPES — the suite goldens mirror these byte-for-byte.
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
  // \u2014 escaped so the em-dash bytes survive editor/toolkit glyph mangling.
  `Writing is refused \u2014 no capability span is active. Allowed targets: none. ${TMP_PARITY_CLAUSE}`;

// Pattern-direction membership: the REVERSE of FsView.glob() (pattern →
// existing files) — does a candidate target path that does NOT yet exist fall
// inside this declared slot-relative pattern? Converts the documented fsview
// dialect (fsview.ts header) per segment: equal segment counts after strict
// anchoring under `root`, {a,b} arm split with independent recursion
// (nesting honored), [seq]/[!seq] classes, ? = one char, * = zero-or-more
// WITHIN THE SEGMENT ONLY, everything else literal. Out-of-dialect text FAILS
// CLOSED: no-match, never throws, no second dialect.
type BraceScan =
  | { kind: "group"; start: number; end: number }
  | { kind: "stray" }
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

// Split a brace interior into arms at TOP-LEVEL commas. No comma ⇒ single
// arm = the whole interior (engine-faithful `{a}` → `a`).
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

// Degenerate ranges (lo > hi) fall through to literal handling —
// engine-faithful; a lone leading '-' is literal by guard.
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

// Linear (brace-free) segment match. Exhaustive literal comparison gives
// literal-special fidelity for free. Fails closed on unclosed classes, empty
// class bodies, and backslash escapes (out of the documented surface).
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
      if (close === -1) return false;
      const raw = pattern.slice(i + 1, close);
      if (raw.length === 0 || raw.includes("\\")) return false;
      const negated = raw.startsWith("!");
      if (negated && raw.length === 1) return false;
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

// Recursive descent: each brace arm is substituted and re-parsed as a whole
// segment, so arms carry wildcards/nested braces freely. `hasWildcard` is a
// FAST-PATH HINT ONLY — brace-only segments take the full transform even
// when it reports false; a stray '}' fails closed on the fast path too.
function segmentMatches(pattern: string, target: string): boolean {
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

/** Anchors strictly under `root` (target === root is no match; out-of-root
 * targets never match, even when the suffix textually fits), then requires
 * EQUAL segment counts and a per-segment dialect match. Pure. Never throws. */
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

interface PhaseEntry {
  id: string;
  /** Surviving confirmed paths (already-resolved absolute, declaration
   * order, deduplicated). EMPTY confers no phase governance (fall-through). */
  survivors: string[];
  /** Save/restore half: whatever occupied the slot before this entry. */
  previous: PhaseEntry | null;
}

interface GateLayer {
  sources: CapabilitySources;
  phase: PhaseEntry | null;
}

// The observed writer-tool set only (local const; the observer's
// FILE_TOOL_NAMES is deliberately not imported). Any other tool — including
// bash — yields no target: allowed by silence.
const WRITER_TOOLS = new Set(["edit", "write"]);

// The session-base pair at depth 0 — the EMPTY set: total default-deny
// beyond the /tmp/ parity class, computed through the identical branch as an
// empty-contract span.
const BASE_SOURCES: CapabilitySources = {
  name: "",
  writes: [],
  allowProjectWrites: false,
};

/** The per-session write gate: a pure in-memory enforcement object fed by
 * lazy providers and explicit enter/exit calls from producers. */
export class WriteGate {
  private readonly providers: WriteGateProviders;
  private layers: GateLayer[] = [];

  /** Closure storage ONLY — no env, no fs, no defaults from process state. */
  constructor(providers: WriteGateProviders) {
    this.providers = providers;
  }

  /** Push a capability layer (span start); the new pair governs exclusively. */
  enterCapability(sources: CapabilitySources): void {
    this.layers.push({ sources, phase: null });
  }

  /** Pop the capability layer (span settlement — success AND catch-all).
   * Throws on underflow OR an outstanding phase entry (LIFO symmetry). */
  exitCapability(): void {
    const top = this.layers[this.layers.length - 1];
    if (top === undefined) {
      throw new WriteGateBookkeepingError(
        "write gate: exitCapability() with no active capability layer",
      );
    }
    if (top.phase !== null) {
      throw new WriteGateBookkeepingError(
        "write gate: exitCapability() with an outstanding phase entry \u2014 exitPhase() first",
      );
    }
    this.layers.pop();
  }

  /** Confirm/clamp ALREADY-RESOLVED absolute paths (consumed verbatim, never
   * re-resolved) against the top layer's sources; attach the surviving set.
   * Uncovered entries are DROPPED AT ENTRY — silent, never granted, absent
   * from every denial listing. Validates ALL confirmation before mutating:
   * a provider fault mid-confirmation escapes with the layer untouched. An
   * empty declaration is a valid no-op confirmation (no phase governance). */
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

  /** One tool-call verdict: `undefined` = allowed; a verdict = the refusal.
   * Pinned order, one pass per target: (1) `/tmp/` always allowed, every
   * depth; (2) a NON-EMPTY confirmed set is exhaustive — exact membership,
   * span sources never consulted alongside it; (3)+(4) ONE branch — the
   * active span governs, depth 0 computing over the empty base sources.
   * Non-writer tools and missing/non-string paths yield NO target: allowed
   * with zero provider consultations and zero bookkeeping change. */
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

  // Single disjunction used by BOTH the span verdict and phase-entry
  // confirmation — one coverage definition, no drift between the two.
  // Disjunct (i) consults the root provider ONLY when `writes` is non-empty;
  // (ii) the cwd provider ONLY when the flag is set; empty sources consult
  // NOTHING. Provider faults escape verbatim.
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

// A non-null object carrying a STRING `path`, normalized with path.resolve;
// any other shape yields `null` — no target, no consultation, no bookkeeping.
function extractTarget(input: unknown): string | null {
  if (input === null || typeof input !== "object") return null;
  const pathValue = (input as Record<string, unknown>).path;
  if (typeof pathValue !== "string") return null;
  return resolve(pathValue);
}
