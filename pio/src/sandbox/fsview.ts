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
