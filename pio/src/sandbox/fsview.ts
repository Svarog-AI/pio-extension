import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// Contract for any FsView implementation (the launcher-owned adapter lands
// together with its first consumer):
// - exists(): follows symlinks (broken link ⇒ false)
// - glob(): existing matches only (no match ⇒ [], nullglob), lexicographically
//   sorted and deduplicated — deterministic, because mount order is security
// - bash-parity single-segment wildcards: `*` never crosses `/`, `?` = one char,
//   `[seq]`/`[!seq]` classes; unsupported constructs degrade to literal matching
// - patterns are matched atomically (whitespace never splits); never throws
//   (availability-optional sections stay silent-skip: narrowing, never widening)
// - stat/readdir-class ops only — no file-content reads; zero new dependencies

export interface FsView {
  /** Existence of `p`, following symlinks (broken links report false). */
  exists(p: string): boolean;
  /** Existing matches for `pattern` (see module contract above). */
  glob(pattern: string): string[];
}

/** Predicate deciding which candidates reach `glob()`: any of `* ? [` in the text. Adapters must handle this class (see module contract). */
export function hasWildcard(text: string): boolean {
  return text.includes("*") || text.includes("?") || text.includes("[");
}

/** Follow-link existence: a broken symlink reports false (stat walks the
 * chain); any filesystem fault degrades to the same answer — availability
 * stays silent-skip, never an exception. */
function existsFollowingLinks(target: string): boolean {
  try {
    statSync(target);
    return true;
  } catch {
    return false;
  }
}

function isDirectoryFollowingLinks(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** Escape one literal character for a RegExp unless it is provably safe.
 * A backslash before a non-alphanumeric is a no-op escape in JS regexes,
 * so escaping every unsafe char is total and cannot corrupt the match. */
function escapeRegexLiteral(char: string): string {
  return /^[a-z0-9_-]$/.test(char) ? char : `\\${char}`;
}

/** Compile ONE pattern segment to an anchored matcher with bash-parity
 * single-segment wildcards: `*` spans any run within the segment (it can
 * never cross `/` because segments are split on it), `?` matches exactly
 * one character, `[seq]`/`[!seq]` carry the same character-class notation
 * as bash (a `]` directly after `[` or `[!` is a literal member). Null
 * result = an unclosed/degenerate bracket class — the caller degrades the
 * WHOLE pattern to literal comparison (narrowing, never widening). */
function compileSegment(segment: string): RegExp | null {
  const parts: string[] = [];
  let i = 0;
  while (i < segment.length) {
    const char = segment.charAt(i);
    if (char === "*") {
      parts.push(".*");
      i += 1;
    } else if (char === "?") {
      parts.push(".");
      i += 1;
    } else if (char === "[") {
      let close = i + 1;
      if (close < segment.length && segment.charAt(close) === "]") {
        close += 1;
      }
      if (close < segment.length && segment.charAt(close) === "!") {
        close += 1;
      }
      while (close < segment.length && segment.charAt(close) !== "]") {
        close += 1;
      }
      if (close >= segment.length) return null;
      const body = segment.slice(i + 1, close);
      const negated = body.startsWith("!");
      const inner = negated ? body.slice(1) : body;
      if (inner.length === 0) return null;
      parts.push(`[${negated ? "^" : ""}${inner}]`);
      i = close + 1;
    } else {
      parts.push(escapeRegexLiteral(char));
      i += 1;
    }
  }
  return new RegExp(`^${parts.join("")}$`);
}

/** Walk one pattern level by level below its fixed prefix. Recursion depth
 * equals the number of pattern segments, so symlinked directories cannot
 * extend the walk beyond the pattern itself. Intermediate levels require
 * directory descent — a regular file mid-pattern yields no matches there.
 * Final-level entries keep only existing paths (broken symlinks drop out
 * via the follow-link stat). */
function walkMatches(
  baseDir: string,
  segments: readonly (string | RegExp)[],
): string[] {
  if (segments.length === 0 || !isDirectoryFollowingLinks(baseDir)) return [];
  const [head, ...tail] = segments;
  let names: string[];
  try {
    names = readdirSync(baseDir);
  } catch {
    return [];
  }
  const candidates =
    head instanceof RegExp
      ? names.filter((name) => head.test(name))
      : names.includes(head)
        ? [head]
        : [];
  const matches: string[] = [];
  for (const name of candidates) {
    const full = path.join(baseDir, name);
    if (tail.length === 0) {
      if (existsFollowingLinks(full)) matches.push(full);
    } else {
      matches.push(...walkMatches(full, tail));
    }
  }
  return matches;
}

/** Production FsView worker over the live filesystem — sync node:fs ops
 * ONLY (stat/readdir class; file contents are never read). Glob results
 * hold existing paths alone, sorted with plain Array.prototype.sort and
 * deduplicated, so mount order is deterministic. Wildcard-free patterns
 * pass through as literal paths; unsupported constructs degrade the whole
 * pattern to literal matching. Nothing here ever throws — any fs fault
 * answers [] / false. */
export const nodeFsView: FsView = {
  exists: (target) => existsFollowingLinks(target),
  glob: (pattern) => {
    try {
      if (pattern.length === 0 || !hasWildcard(pattern)) {
        return existsFollowingLinks(pattern) ? [pattern] : [];
      }
      const segments = pattern.split("/");
      const compiled: (string | RegExp | null)[] = segments.map((segment) =>
        hasWildcard(segment) ? compileSegment(segment) : segment,
      );
      if (compiled.some((part) => part === null)) {
        // An unsupported construct narrows the WHOLE pattern to literal
        // comparison — the wildcard legs never rescue it.
        return existsFollowingLinks(pattern) ? [pattern] : [];
      }
      const matchers = compiled.filter(
        (part): part is string | RegExp => part !== null,
      );
      let prefixLength = 0;
      while (
        prefixLength < matchers.length &&
        typeof matchers[prefixLength] === "string"
      ) {
        prefixLength += 1;
      }
      const baseDir =
        prefixLength === 0 ? "." : segments.slice(0, prefixLength).join("/");
      const matches = walkMatches(baseDir, matchers.slice(prefixLength));
      return [...new Set(matches)].sort();
    } catch {
      return [];
    }
  },
};
