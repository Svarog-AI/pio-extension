import { hasWildcard } from "./string-match-helpers.ts";

// Collocated behavioral suite for the relocated consumer-facing routing
// predicate. Pure strings: hasWildcard answers over ANY text, so these rows
// are fs-free (no tmpdirs, no async). Re-homed here when the predicate left
// the FsView worker module; the worker's own dispatch is tested in
// fsview.test.ts.
describe("hasWildcard - the shared wildcard routing predicate", () => {
  it("answers true iff the text carries *, ? or [ - spaces and plain alphanumerics answer false", () => {
    expect(hasWildcard("a*b")).toBe(true);
    expect(hasWildcard("a?b")).toBe(true);
    expect(hasWildcard("a[b]")).toBe(true);
    expect(hasWildcard("a b")).toBe(false);
    expect(hasWildcard("/state/projects/proj-x/plain/name")).toBe(false);
  });
});
