import { existsSync, globSync } from "node:fs";

// Contract for any FsView implementation (the launcher-owned adapter lands
// together with its first consumer):
// - exists(): follows symlinks (broken link ⇒ false)
// - glob(): expands the pattern via node:fs's built-in glob surface; results
//   are lexicographically sorted and deduplicated — deterministic, because
//   mount order is security; unmatched pattern ⇒ [] (nullglob)
// - pattern syntax is the documented glob surface with bash-parity
//   single-segment semantics: `*` never crosses `/`, `?` = one char,
//   `[seq]`/`[!seq]` classes — and `{a,b}` brace expansion is a supported,
//   documented construct (each arm expands independently)
// - results carry whatever the expansion resolves — INCLUDING DANGLING
//   SYMLINKS: a broken entry may make its consumer fail loudly later (e.g.
//   a sandbox bind refusing an unresolvable source); existence follow-link
//   semantics belong to exists() alone
// - patterns are matched atomically (whitespace never splits); depth stays
//   bounded by the pattern's segment count even through symlinked
//   directories; never throws (availability-optional sections silent-skip)
// - directory-walk-class ops only — no file-content reads; zero new dependencies

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

/** Production FsView worker over the live filesystem — sync node:fs ops
 * ONLY. The pattern passes VERBATIM to the built-in glob surface; the one
 * Set + sort post-process holds the deterministic-mount-order pin
 * independent of library internals, and the try/catch keeps the
 * never-throws liveness contract (any fault answers []). File contents are
 * never read. */
export const nodeFsView: FsView = {
  /** Follow-link existence: existsSync walks the chain, so a broken link
   * (or a missing target) reports false; it never throws. */
  exists: (target) => existsSync(target),
  glob: (pattern) => {
    try {
      return [...new Set(globSync(pattern))].sort();
    } catch {
      return [];
    }
  },
};
