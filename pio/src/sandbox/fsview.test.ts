import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hasWildcard, nodeFsView } from "./fsview.ts";

/** Fixture tree shared by every row — seeded once per test under a fresh
 * tmpdir so no row depends on real $HOME or system state. Layout:
 *
 *   root/alpha                     file — exists positive / literal target
 *   root/beta, root/gamma          files — brace-expansion arms
 *   root/broken -> missing-target  broken symlink — carried raw into glob results
 *   root/valid -> alpha            valid symlink — follow-link inclusion
 *   root/my dir/x y                spaced dir/file — atomic matching
 *   root/plain/name                file — wildcard-free literal glob
 *   root/q/{ab,ac,abc}             files — single-char `?` table
 *   root/c/{a,b,d,A}               files — character-class table
 *   root/sub/a                     file   — direct child match
 *   root/sub/deep/x                file   — deeper than one segment: NO match
 *   root/sub/file1                 file   — mid-pattern descent dead end
 *   root/sub/dir1/x.txt            file   — mid-pattern descent success
 *   root/link-sub -> ./sub         dir symlink — descent THROUGH the link
 *   root/sorted/{zeta,alpha,mango} files — seeded OUT OF ORDER on purpose */
async function seedTree(root: string): Promise<void> {
  await mkdir(path.join(root, "sorted"));
  await writeFile(path.join(root, "sorted", "zeta"), "");
  await writeFile(path.join(root, "sorted", "alpha"), "");
  await writeFile(path.join(root, "sorted", "mango"), "");
  await writeFile(path.join(root, "alpha"), "");
  await writeFile(path.join(root, "beta"), "");
  await writeFile(path.join(root, "gamma"), "");
  await symlink("missing-target", path.join(root, "broken"));
  await symlink("./alpha", path.join(root, "valid"));
  await mkdir(path.join(root, "my dir"));
  await writeFile(path.join(root, "my dir", "x y"), "");
  await mkdir(path.join(root, "plain"));
  await writeFile(path.join(root, "plain", "name"), "");
  await mkdir(path.join(root, "q"));
  await writeFile(path.join(root, "q", "ab"), "");
  await writeFile(path.join(root, "q", "ac"), "");
  await writeFile(path.join(root, "q", "abc"), "");
  await mkdir(path.join(root, "c"));
  await writeFile(path.join(root, "c", "a"), "");
  await writeFile(path.join(root, "c", "b"), "");
  await writeFile(path.join(root, "c", "d"), "");
  await writeFile(path.join(root, "c", "A"), "");
  await mkdir(path.join(root, "sub", "deep"), { recursive: true });
  await writeFile(path.join(root, "sub", "a"), "");
  await writeFile(path.join(root, "sub", "deep", "x"), "");
  await writeFile(path.join(root, "sub", "file1"), "");
  await mkdir(path.join(root, "sub", "dir1"));
  await writeFile(path.join(root, "sub", "dir1", "x.txt"), "");
  await symlink("./sub", path.join(root, "link-sub"));
}

describe("nodeFsView.exists", () => {
  it("follow-link existence: regular file ⇒ true; missing ⇒ false; BROKEN SYMLINK ⇒ false; valid symlink to an existing file ⇒ true", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-exists-"));
    await seedTree(root);
    expect(nodeFsView.exists(path.join(root, "alpha"))).toBe(true);
    expect(nodeFsView.exists(path.join(root, "ghost"))).toBe(false);
    expect(nodeFsView.exists(path.join(root, "broken"))).toBe(false);
    expect(nodeFsView.exists(path.join(root, "valid"))).toBe(true);
  });
});

describe("nodeFsView.glob", () => {
  it("nullglob: wildcard with no existing matches ⇒ [] (never the raw pattern)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-nullglob-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "nomatch-*"))).toEqual([]);
    expect(nodeFsView.glob(path.join(root, "sub", "*zzz"))).toEqual([]);
    expect(nodeFsView.glob(path.join(root, "sorted", "[!q-z]"))).toEqual([]);
  });

  it("wildcard-free patterns pass through as LITERAL paths (existing ⇒ [path], missing ⇒ [])", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-literal-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "plain", "name"))).toEqual([
      path.join(root, "plain", "name"),
    ]);
    expect(nodeFsView.glob(path.join(root, "plain", "ghost"))).toEqual([]);
    // The uniform built-in glob surface decides this (a wildcard-free
    // pattern resolves as a literal path); hasWildcard is NOT the worker's
    // dispatch — it is a consumer-facing routing predicate (candidate
    // triage), whose pinned predicate is asserted here.
    expect(hasWildcard(path.join(root, "plain", "name"))).toBe(false);
    expect(hasWildcard("a*b")).toBe(true);
    expect(hasWildcard("a?b")).toBe(true);
    expect(hasWildcard("a[b]")).toBe(true);
    expect(hasWildcard("a b")).toBe(false);
  });

  it("multi-match results are lexicographically sorted AND deduplicated (seeded out of order ⇒ ascending; re-calls deep-equal)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-sort-"));
    await seedTree(root);
    const expected = ["alpha", "mango", "zeta"].map((n) =>
      path.join(root, "sorted", n),
    );
    const first = nodeFsView.glob(path.join(root, "sorted", "*"));
    expect(first).toEqual(expected);
    expect([...new Set(first)].length).toBe(first.length);
    expect(nodeFsView.glob(path.join(root, "sorted", "*"))).toEqual(first);
  });

  it("single-segment wildcards: `*` NEVER crosses `/` — sub/* matches the direct children, not sub/deep/x", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-onese-"));
    await seedTree(root);
    const expected = ["a", "deep", "dir1", "file1"]
      .map((n) => path.join(root, "sub", n))
      .sort();
    expect(nodeFsView.glob(path.join(root, "sub", "*"))).toEqual(expected);
    expect(
      nodeFsView
        .glob(path.join(root, "sub", "*"))
        .includes(path.join(root, "sub", "deep", "x")),
    ).toBe(false);
  });

  it("`?` matches exactly ONE character: a? takes ab+ac, not abc; a?? takes abc only", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-q-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "q", "a?"))).toEqual([
      path.join(root, "q", "ab"),
      path.join(root, "q", "ac"),
    ]);
    expect(nodeFsView.glob(path.join(root, "q", "a??"))).toEqual([
      path.join(root, "q", "abc"),
    ]);
  });

  it("character classes: [ab] two-member set, [a-c] range, [!a-z] negated range (only the non-lowercase name survives)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-class-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "c", "[ab]"))).toEqual([
      path.join(root, "c", "a"),
      path.join(root, "c", "b"),
    ]);
    expect(nodeFsView.glob(path.join(root, "c", "[a-c]"))).toEqual([
      path.join(root, "c", "a"),
      path.join(root, "c", "b"),
    ]);
    expect(nodeFsView.glob(path.join(root, "c", "[!a-z]"))).toEqual([
      path.join(root, "c", "A"),
    ]);
    expect(nodeFsView.glob(path.join(root, "c", "[!A]"))).toEqual([
      path.join(root, "c", "a"),
      path.join(root, "c", "b"),
      path.join(root, "c", "d"),
    ]);
  });

  it("BRACE EXPANSION: {beta,gamma} expands EVERY arm (both land sorted); a ghost arm contributes nothing (per-arm nullglob); overlapping arms dedupe so each surviving path lands ONCE", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-brace-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "{beta,gamma}"))).toEqual([
      path.join(root, "beta"),
      path.join(root, "gamma"),
    ]);
    // One resolvable arm + one ghost arm: the ghost expands to nothing,
    // the survivor stands (per-arm nullglob, bash parity).
    expect(nodeFsView.glob(path.join(root, "{beta,ghost}"))).toEqual([
      path.join(root, "beta"),
    ]);
    // Overlapping arms: Set dedup at the worker level keeps each path once.
    expect(nodeFsView.glob(path.join(root, "{beta,beta,gamma}"))).toEqual([
      path.join(root, "beta"),
      path.join(root, "gamma"),
    ]);
  });

  it("patterns are matched ATOMICALLY: whitespace never splits — 'my dir/*' finds the spaced file verbatim", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-space-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "my dir", "*"))).toEqual([
      path.join(root, "my dir", "x y"),
    ]);
  });

  it("DANGLING SYMLINK INCLUSION: results carry what the expansion resolves — root/* INCLUDES the broken link alongside everything else; existence follow-link filtering belongs to exists() alone, a broken entry may later fail its consumer loudly (e.g. a bind)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-links-"));
    await seedTree(root);
    const expected = [
      "alpha",
      "beta",
      "broken",
      "c",
      "gamma",
      "link-sub",
      "my dir",
      "plain",
      "q",
      "sorted",
      "sub",
      "valid",
    ]
      .map((n) => path.join(root, n))
      .sort();
    expect(nodeFsView.glob(path.join(root, "*"))).toEqual(expected);
  });

  it("intermediate segments require DIRECTORY descent: sub/*/x.txt descends dir1 (match) but dies at the file file1; sub/*/a ⇒ [] because sub/a is a file mid-pattern; a symlinked-dir segment (link-sub/*) descends DIRECT CHILDREN ONLY — the segment count bounds depth THROUGH the link", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-descent-"));
    await seedTree(root);
    expect(nodeFsView.glob(path.join(root, "sub", "*", "x.txt"))).toEqual([
      path.join(root, "sub", "dir1", "x.txt"),
    ]);
    expect(nodeFsView.glob(path.join(root, "sub", "*", "a"))).toEqual([]);
    const linkedExpected = ["a", "deep", "dir1", "file1"]
      .map((n) => path.join(root, "link-sub", n))
      .sort();
    expect(nodeFsView.glob(path.join(root, "link-sub", "*"))).toEqual(
      linkedExpected,
    );
    expect(
      nodeFsView
        .glob(path.join(root, "link-sub", "*"))
        .includes(path.join(root, "link-sub", "deep", "x")),
    ).toBe(false);
  });

  it("NEVER THROWS: nonexistent parent ⇒ [], a regular FILE as a glob base ⇒ [], garbage patterns ⇒ [] (silence is narrowing)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-nothrow-"));
    await seedTree(root);
    expect(nodeFsView.glob("/definitely/not/a/real/place/*/deep/*")).toEqual(
      [],
    );
    expect(nodeFsView.glob(path.join(root, "plain", "name", "*"))).toEqual([]);
    expect(nodeFsView.glob("*[")).toEqual([]);
    expect(nodeFsView.glob("")).toEqual([]);
    expect(nodeFsView.exists("/definitely/not/a/real/place")).toBe(false);
  });

  it("determinism: repeated calls on the same fixture tree return byte-identical arrays (mount order is security)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-fsview-determ-"));
    await seedTree(root);
    const wide = path.join(root, "**");
    const narrow = path.join(root, "sub", "*");
    const wideRuns: string[][] = [];
    const narrowRuns: string[][] = [];
    for (let i = 0; i < 3; i++) {
      wideRuns.push(nodeFsView.glob(wide));
      narrowRuns.push(nodeFsView.glob(narrow));
    }
    for (const run of wideRuns.slice(1)) {
      expect(run).toEqual(wideRuns[0]);
    }
    for (const run of narrowRuns.slice(1)) {
      expect(run).toEqual(narrowRuns[0]);
    }
  });
});
