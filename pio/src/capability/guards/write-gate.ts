// ── guards/write-gate.ts — STATELESS PREDICATE (value imports: node:path,
// ../../sandbox/fsview.ts; type-only: ./guard-vocabulary.ts,
// ./session-execution-state.ts — the latter ERASED at compile time;
// COMPLETE surface: exactly THREE exports) ──
//
// Half of the two-component write gate — the stateless decision point (PDP):
// given ONE tool call plus the GIVEN inputs, it answers whether the write/edit
// is allowed. It stores nothing and owns no lifecycle; the interceptor runner
// (which tool_call reaches the agent) and the per-session execution state
// (which records what is executing right now and supplies the snapshot) are
// its siblings. This file consumes the snapshot GIVEN at call time — plain
// values, no closures — and judges per call.
//
// Purity: the snapshot carries the session's path anchors as RESOLVED STRINGS,
// so this module reads no env, touches no filesystem, and reaches no SDK
// (channel-free by construction). Coverage is EXACTLY `write`/`edit` via
// string `input.path` (bash stays ungated). The verdict order is pinned, one
// pass per target:
//   1. `/tmp/` (exact prefix) — always allowed, every depth;
//   2. an active phase with a NON-EMPTY declaration governs exclusively over
//      its EFFECTIVE set (declared ∩ contract-covered, materialized per call —
//      an empty effective set confers NO phase governance and falls through);
//   3. span admission over the running capability's sources (null coalesces
//      to the empty base — one code path, no special cases);
//   4. deny.
// Every refusal RETURNS a house-style message — the ONLY feedback — naming
// the governing source (phase id, capability name, or no-span state), the
// effective allowlist inline ("none" when nothing is; over-declared,
// contract-uncovered entries simply absent — never granted, never listed),
// and the /tmp/ parity clause in every line.
//
// Terminology: stack entries are LAYERS ("frame" is reserved for
// composed-execution units elsewhere in this package).

import { resolve } from "node:path";
import { hasWildcard } from "../../sandbox/fsview.ts";
import type { CapabilitySources, PathAnchors } from "./guard-vocabulary.ts";
import type { ExecutionSnapshot } from "./session-execution-state.ts";

/** Structural denial shape — assignable to the SDK's ToolCallEventResult
 * without importing it. `reason` is the ONLY feedback the model gets. */
export interface WriteGateVerdict {
  block: true;
  reason: string;
}

/** One tool-call verdict: `undefined` = allowed; a verdict = the refusal.
 * Judges PER CALL over the RAW snapshot — the phase branch's contract-
 * existence half runs HERE at decision time; there is no attach-time
 * confirmation anywhere. */
export function decideWrite(
  snapshot: ExecutionSnapshot,
  toolName: string,
  input: unknown,
): WriteGateVerdict | undefined {
  const target = WRITER_TOOLS.has(toolName) ? extractTarget(input) : null;
  if (target === null) return undefined;
  if (target.startsWith("/tmp/")) return undefined;
  const sources = snapshot.sources ?? BASE_SOURCES;
  const phase = snapshot.phase;
  if (phase !== null && phase.declared.length > 0) {
    // Effective set: declared ∩ contract-covered, materialized FRESH per call
    // — declaration order, first-occurrence dedupe. EMPTY confers NO phase
    // governance: the lazy fall-through below keeps one code path.
    const effective: string[] = [];
    const seen = new Set<string>();
    for (const declared of phase.declared) {
      if (seen.has(declared)) continue;
      if (admittedBy(sources, declared, snapshot.paths)) {
        seen.add(declared);
        effective.push(declared);
      }
    }
    if (effective.length > 0) {
      if (effective.includes(target)) return undefined;
      return { block: true, reason: renderPhaseDenial(phase.id, effective) };
    }
  }
  if (admittedBy(sources, target, snapshot.paths)) return undefined;
  return {
    block: true,
    reason:
      snapshot.sources === null
        ? renderNoSpanDenial()
        : renderCapabilityDenial(snapshot.sources, snapshot.paths.workspaceCwd),
  };
}

// THE single disjunction used by BOTH the span verdict and the effective-set
// filter — one coverage definition, no drift between the two sites. Disjunct
// (i) consults the slot-root anchor ONLY when `writes` is non-empty; (ii) the
// cwd anchor ONLY when the flag is set; empty sources consult NOTHING. Pure
// over plain values — no channels exist here to fault.
function admittedBy(
  sources: CapabilitySources,
  target: string,
  anchors: PathAnchors,
): boolean {
  if (sources.writes.length > 0) {
    for (const pattern of sources.writes) {
      if (matchesAnchoredGlob(pattern, anchors.projectSlotRoot, target))
        return true;
    }
  }
  return (
    sources.allowProjectWrites && target.startsWith(`${anchors.workspaceCwd}/`)
  );
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
  workspaceCwd: string,
): string => {
  const parts: string[] = [...sources.writes];
  if (sources.allowProjectWrites) {
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

// The observed writer-tool set only (local const; the observer's
// FILE_TOOL_NAMES is deliberately not imported). Any other tool — including
// bash — yields no target: allowed by silence.
const WRITER_TOOLS = new Set(["edit", "write"]);

// The session-base pair — the EMPTY set: total default-deny beyond the /tmp/
// parity class, computed through the identical branch as an empty-contract
// span. Null sources coalesce onto this — one code path, no special cases.
const BASE_SOURCES: CapabilitySources = {
  name: "",
  writes: [],
  allowProjectWrites: false,
};

// A non-null object carrying a STRING `path`, normalized with path.resolve;
// any other shape yields `null` — no target, no consultation, no side effect.
function extractTarget(input: unknown): string | null {
  if (input === null || typeof input !== "object") return null;
  const pathValue = (input as Record<string, unknown>).path;
  if (typeof pathValue !== "string") return null;
  return resolve(pathValue);
}
