// ── sandbox/string-match-helpers.ts — PATTERN-DIRECTION STRING HELPERS
// (pure strings; never touches the filesystem) - the anchored-glob matcher
// chain plus the shared hasWildcard routing predicate. Sole owner of
// matchesAnchoredGlob (the guards write gate re-exports it) AND hasWildcard
// (the profile renderer consumes it from here). Converts the documented
// fsview dialect (see the fsview.ts header). Out-of-dialect text FAILS
// CLOSED: no match, never throws, no second dialect.
// ──

/** Predicate deciding which glob candidates carry wildcards: any of `* ? [`
 * in the text. Shared consumer-facing routing predicate (candidate triage)
 * for both the anchored-glob matcher below and the profile renderer; the
 * FsView adapters in fsview.ts must handle this class. */
export function hasWildcard(text: string): boolean {
  return text.includes("*") || text.includes("?") || text.includes("[");
}

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
