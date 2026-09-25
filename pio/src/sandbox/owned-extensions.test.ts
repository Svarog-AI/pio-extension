import { readFileSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProbeSession } from "../session.ts";
import { LayoutError } from "./layout.ts";
import {
  DEFAULT_PIO_ROOT,
  ensureOwnedExtensions,
  nodeOwnedExtensionFs,
  OWNED_EXTENSION_PACKAGES,
} from "./owned-extensions.ts";

// Hermetic suite for the owned-extension materialization core (D1/SR3). Every
// unit row fabricates TWO trees under os.tmpdir() — a fake PIO ROOT (hand-
// written package.json + fixture packages under its node_modules, fed through
// the pioRoot seam) and a fake state root supplying the piTree handle — and
// drives the REAL filesystem over them: no vi.mocks, no timers, no network.
// Fixture package names are deliberately FOREIGN (fake-ext-a/fake-ext-b) so a
// row cannot accidentally pass by touching the real install. The closing
// describe touches the real SDK graph (the headless provisioning proof).

const A = "fake-ext-a";
const B = "fake-ext-b";

interface FixturePackage {
  readonly name: string;
  readonly version: string;
  /** relPath → content (UTF-8), written beside the generated package.json. */
  readonly files?: Record<string, string>;
}

const FIXTURE_A: FixturePackage = {
  name: A,
  version: "1.0.0",
  files: { "data/alpha.txt": "alpha payload", "extra.txt": "a-extra" },
};
const FIXTURE_B: FixturePackage = {
  name: B,
  version: "1.0.0",
  files: { "payload.txt": "beta payload" },
};

const temps: string[] = [];

async function tmpdir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  }
});

/** Hand-written pio root: manifest with the given dependencies map + the
 * given fixture packages under its node_modules. */
async function fabricatePioRoot(
  dependencies: Record<string, string>,
  packages: readonly FixturePackage[],
): Promise<string> {
  const root = await tmpdir("pio-oe-root-");
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "pio", version: "0.1.0", dependencies }, null, 2)}\n`,
  );
  for (const fixture of packages) {
    const dir = path.join(root, "node_modules", fixture.name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "package.json"),
      `${JSON.stringify(
        { name: fixture.name, version: fixture.version },
        null,
        2,
      )}\n`,
    );
    for (const [rel, content] of Object.entries(fixture.files ?? {})) {
      const file = path.join(dir, rel);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, content);
    }
  }
  return root;
}

/** Fake state root + the piTree handle (mirrors the ensurePiTree result).
 * Guard rows pass createPiTree: false to keep the root walkable as EMPTY. */
async function makeStateRoot(
  createPiTree = true,
): Promise<{ readonly stateRoot: string; readonly piTree: string }> {
  const stateRoot = await tmpdir("pio-oe-state-");
  const piTree = path.join(stateRoot, ".pi");
  if (createPiTree) await mkdir(piTree, { recursive: true });
  return { stateRoot, piTree };
}

const targetDirOf = (piTree: string, name: string): string =>
  path.join(piTree, "agent", "npm", "node_modules", name);
const settingsPathOf = (piTree: string): string =>
  path.join(piTree, "agent", "settings.json");

async function readSettings(piTree: string): Promise<unknown> {
  return JSON.parse(await readFile(settingsPathOf(piTree), "utf8"));
}

/** rel → {kind, mtimeMs} over EVERY entry under root (lstat-based kinds:
 * symlinks report "symlink" and are never followed). */
async function walkTree(
  root: string,
): Promise<Map<string, { readonly kind: string; readonly mtimeMs: number }>> {
  const out = new Map<
    string,
    { readonly kind: string; readonly mtimeMs: number }
  >();
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const stats = await lstat(full);
      const kind = stats.isSymbolicLink()
        ? "symlink"
        : stats.isDirectory()
          ? "directory"
          : stats.isFile()
            ? "file"
            : "other";
      out.set(path.relative(root, full), { kind, mtimeMs: stats.mtimeMs });
      if (stats.isDirectory()) await visit(full);
    }
  }
  await visit(root);
  return out;
}

/** rel → bytes over every REGULAR FILE under root (symlinks excluded —
 * the suite trips the symlink defense before ever asserting bytes there). */
async function fileBytes(root: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full);
      } else if (entry.isFile()) {
        out.set(path.relative(root, full), await readFile(full));
      }
    }
  }
  await visit(root);
  return out;
}

/** Run the materialization expecting THE typed LayoutError family: the
 * refusal must name every needle (artifact + condition [+ remedy]). */
async function expectRefusal(
  action: () => Promise<void>,
  needles: readonly string[],
): Promise<string> {
  try {
    await action();
  } catch (cause) {
    expect(cause).toBeInstanceOf(LayoutError);
    const message = (cause as Error).message;
    for (const needle of needles) {
      expect(message).toContain(needle);
    }
    return message;
  }
  throw new Error(
    `expected a LayoutError naming: ${needles.join(" + ")} (nothing thrown)`,
  );
}

describe("creation (materialize-all + register-all)", () => {
  it("an empty agent dir + roster [A] ⇒ A's tree lands with the EXACT source walk (file set + bytes + regular files only, no symlinks) and settings.json is created as exactly {packages:['npm:fake-ext-a']}", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });

    const target = targetDirOf(piTree, A);
    const source = path.join(pioRoot, "node_modules", A);
    // Exact walk equality: same entry set (dirs + files) AND byte-identical
    // regular files.
    const sourceWalk = await walkTree(source);
    const targetWalk = await walkTree(target);
    expect([...targetWalk.keys()].sort()).toEqual(
      [...sourceWalk.keys()].sort(),
    );
    expect(await fileBytes(target)).toEqual(await fileBytes(source));
    // lstat sweep across the materialized tree proves REGULAR files only.
    for (const entry of targetWalk.values()) {
      expect(["file", "directory"]).toContain(entry.kind);
    }
    expect(targetWalk.size).toBeGreaterThan(1); // at least one file + a dir
    expect(await readSettings(piTree)).toEqual({ packages: [`npm:${A}`] });
  });

  it("an empty agent dir + roster [A, B] ⇒ BOTH trees land (exact walk equality) and settings.json parses to EXACTLY the two entries in roster order, serialized in the canonical 2-space + trailing-newline form", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0", [B]: "1.0.0" }, [
      FIXTURE_A,
      FIXTURE_B,
    ]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] });

    for (const name of [A, B]) {
      expect(await fileBytes(targetDirOf(piTree, name))).toEqual(
        await fileBytes(path.join(pioRoot, "node_modules", name)),
      );
    }
    expect(await readSettings(piTree)).toEqual({
      packages: [`npm:${A}`, `npm:${B}`],
    });
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(
      `${JSON.stringify({ packages: [`npm:${A}`, `npm:${B}`] }, null, 2)}\n`,
    );
  });
});

describe("steady-state composites (idempotency + minimal touch)", () => {
  it("a second run over steady state ⇒ contents AND mtimes untouched for EVERY file (all package files + settings.json captured before/after)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0", [B]: "1.0.0" }, [
      FIXTURE_A,
      FIXTURE_B,
    ]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A, B] as const };
    await ensureOwnedExtensions(piTree, seams);
    const agentRoot = path.join(piTree, "agent");
    const beforeWalk = await walkTree(agentRoot);
    const beforeBytes = await fileBytes(agentRoot);
    await ensureOwnedExtensions(piTree, seams);
    expect(await walkTree(agentRoot)).toEqual(beforeWalk);
    expect(await fileBytes(agentRoot)).toEqual(beforeBytes);
  });

  it("a version-matched install whose CONTENT was mutated externally survives a re-run INTACT (trust-installed: the fresh source bytes do not overwrite) and the SOURCE tree is touched NOTHING (bytes + mtimes)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A] as const };
    await ensureOwnedExtensions(piTree, seams);

    // Mutate the INSTALLED copy (version + settings entry kept as-is).
    const installedExtra = path.join(targetDirOf(piTree, A), "extra.txt");
    const MUTATION = "externally mutated — must survive";
    await writeFile(installedExtra, MUTATION);

    const source = path.join(pioRoot, "node_modules", A);
    const sourceBefore = await fileBytes(source);
    const sourceWalkBefore = await walkTree(source);

    await ensureOwnedExtensions(piTree, seams);

    expect(await readFile(installedExtra, "utf8")).toBe(MUTATION);
    // The skip path reads the source NOTHING: bytes AND mtimes untouched.
    expect(await fileBytes(source)).toEqual(sourceBefore);
    expect(await walkTree(source)).toEqual(sourceWalkBefore);
  });

  it("a STALE installed version ⇒ wipe + fresh re-copy of the WHOLE package dir: the mutated file is back to source bytes AND a planted stale extra file is GONE (wipe semantics, not merge); the settings entry being present leaves the settings file's mtime untouched", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A] as const };
    await ensureOwnedExtensions(piTree, seams);

    const target = targetDirOf(piTree, A);
    // Corrupt the installed copy: stale version + mutated content + a file
    // the current source no longer ships.
    await writeFile(
      path.join(target, "package.json"),
      `${JSON.stringify({ name: A, version: "0.9.9" }, null, 2)}\n`,
    );
    await writeFile(path.join(target, "extra.txt"), "stale garbage");
    await writeFile(path.join(target, "planted-stale.txt"), "residue");

    const settingsMtimeBefore = (await lstat(settingsPathOf(piTree))).mtimeMs;

    await ensureOwnedExtensions(piTree, seams);

    expect(await readFile(path.join(target, "extra.txt"), "utf8")).toBe(
      "a-extra",
    );
    const walk = await walkTree(target);
    expect(walk.has("planted-stale.txt")).toBe(false);
    expect(await fileBytes(target)).toEqual(
      await fileBytes(path.join(pioRoot, "node_modules", A)),
    );
    const installedVersion = JSON.parse(
      await readFile(path.join(target, "package.json"), "utf8"),
    ).version as string;
    expect(installedVersion).toBe("1.0.0");
    // Per-axis independence: entry present ⇒ the single Phase-2 pass writes
    // NOTHING to settings (mtime pin).
    expect((await lstat(settingsPathOf(piTree))).mtimeMs).toBe(
      settingsMtimeBefore,
    );
  });
});

describe("settings upsert (register-all — ONE read-modify-write per run)", () => {
  it("pre-existing settings with unrelated top-level keys + pre-existing packages entries (incl. one roster entry) ⇒ missing roster entries appended exactly once each in roster order; foreign keys/entries/key ORDER survive deep-equal modulo the additions", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0", [B]: "1.0.0" }, [
      FIXTURE_A,
      FIXTURE_B,
    ]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A, B] as const };
    await ensureOwnedExtensions(piTree, seams);
    // Replace the settings file with an accumulated config: unrelated keys
    // around the array, foreign entry types, and A's entry ALREADY present.
    const preseeded = {
      theme: "dark",
      packages: [`npm:${A}`, "npm:unrelated", 42, { x: 1 }],
      editor: { tabSize: 2 },
    };
    await writeFile(
      settingsPathOf(piTree),
      `${JSON.stringify(preseeded, null, 2)}\n`,
    );

    await ensureOwnedExtensions(piTree, seams);

    const updated = await readSettings(piTree);
    expect(updated).toEqual({
      theme: "dark",
      packages: [`npm:${A}`, "npm:unrelated", 42, { x: 1 }, `npm:${B}`],
      editor: { tabSize: 2 },
    });
    // Top-level key ORDER preserved (insertion order survived the round-trip).
    expect(Object.keys(updated as Record<string, unknown>)).toEqual([
      "theme",
      "packages",
      "editor",
    ]);
    // A's pre-existing entry is never doubled.
    const packages = (updated as { packages: unknown[] }).packages;
    expect(packages.filter((entry) => entry === `npm:${A}`)).toHaveLength(1);
  });

  it("ALL roster entries pre-seeded alongside unrelated keys ⇒ the settings file's BYTES AND mtime are untouched (no rewrite at all)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });
    const preseeded = { packages: [`npm:${A}`, "npm:other"], theme: "dark" };
    const rawPreseed = `${JSON.stringify(preseeded, null, 2)}\n`;
    await writeFile(settingsPathOf(piTree), rawPreseed);
    const mtimeBefore = (await lstat(settingsPathOf(piTree))).mtimeMs;

    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(rawPreseed);
    expect((await lstat(settingsPathOf(piTree))).mtimeMs).toBe(mtimeBefore);
  });

  it("packages present + version-matched but the settings FILE absent ⇒ the minimal shape carrying EVERY roster entry is created and the PACKAGE bytes/mtimes stay untouched (Phase-2-only write path)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0", [B]: "1.0.0" }, [
      FIXTURE_A,
      FIXTURE_B,
    ]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A, B] as const };
    await ensureOwnedExtensions(piTree, seams);
    await rm(settingsPathOf(piTree));

    // Snapshot the PACKAGE trees ONLY — settings.json is the legitimate new
    // write this row pins for the Phase-2-only pass.
    const aTarget = targetDirOf(piTree, A);
    const bTarget = targetDirOf(piTree, B);
    const aBeforeWalk = await walkTree(aTarget);
    const bBeforeWalk = await walkTree(bTarget);
    const aBeforeBytes = await fileBytes(aTarget);
    const bBeforeBytes = await fileBytes(bTarget);

    await ensureOwnedExtensions(piTree, seams);

    expect(await readSettings(piTree)).toEqual({
      packages: [`npm:${A}`, `npm:${B}`],
    });
    expect(await walkTree(aTarget)).toEqual(aBeforeWalk);
    expect(await walkTree(bTarget)).toEqual(bBeforeWalk);
    expect(await fileBytes(aTarget)).toEqual(aBeforeBytes);
    expect(await fileBytes(bTarget)).toEqual(bBeforeBytes);
  });
});

describe("corruption refusals (loud failure over clobbering an accumulator)", () => {
  it("MALFORMED settings JSON ⇒ the typed refusal and the file left BYTE-UNTOUCHED afterwards (the re-run neither repairs nor overwrites it)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A] as const };
    await ensureOwnedExtensions(piTree, seams);
    const corrupted = '{ "packages": ["npm:fake-ext-a", oops';
    await writeFile(settingsPathOf(piTree), corrupted);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, seams),
      [settingsPathOf(piTree), "malformed"],
    );

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(corrupted);
  });

  it('a structurally WRONG "packages" (non-array) ⇒ the typed refusal and the file left BYTE-UNTOUCHED', async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A] as const };
    await ensureOwnedExtensions(piTree, seams);
    const corrupted = `${JSON.stringify(
      { packages: `npm:${A}`, keep: 1 },
      null,
      2,
    )}\n`;
    await writeFile(settingsPathOf(piTree), corrupted);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, seams),
      [settingsPathOf(piTree), "not an array"],
    );

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(corrupted);
  });
});

describe("symlink defense (post-copy sweep — reject, never dereference)", () => {
  it("a fixture SOURCE containing a symlink ⇒ the typed refusal NAMING the offending link; the pre-seeded settings file stays UNTOUCHED (materialize-before-register ordering) and the sweep refuses rather than dragging out-of-tree content in", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [FIXTURE_A]);
    const source = path.join(pioRoot, "node_modules", A);
    const outsideSecret = path.join(pioRoot, "outside-secret.txt");
    await writeFile(outsideSecret, "content OUTSIDE the package tree");
    await symlink(outsideSecret, path.join(source, "link.txt"));

    const { piTree } = await makeStateRoot();
    // Pre-seed an accumulated settings file beside the would-be registration
    // (parent mkdir — the materialization itself would create it).
    await mkdir(path.dirname(settingsPathOf(piTree)), { recursive: true });
    const preseeded = { packages: [`npm:${A}`], guard: "preseeded" };
    const rawPreseed = `${JSON.stringify(preseeded, null, 2)}\n`;
    await writeFile(settingsPathOf(piTree), rawPreseed);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      [path.join(targetDirOf(piTree, A), "link.txt")],
    );

    // Register-after-materialize: the settings file was never reached.
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(rawPreseed);
    // The sweep refuses AFTER the faithful re-create: the escaping entry is
    // still a LINK in the rejected tree (never dereferenced into a regular
    // file carrying out-of-tree bytes) — rejection, not absorption.
    const leak = path.join(targetDirOf(piTree, A), "link.txt");
    expect((await lstat(leak)).isSymbolicLink()).toBe(true);
  });
});

describe("source-side refusals (pio's own install is the source of truth)", () => {
  it("a MISSING fixture package dir (declared exact pin, no node_modules tree) ⇒ the actionable refusal naming the source path + the remediation hint; NOTHING materialized, no settings file", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, []);
    const { stateRoot, piTree } = await makeStateRoot();

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      [path.join(pioRoot, "node_modules", A), "reinstall"],
    );

    expect(
      (await lstat(targetDirOf(piTree, A)).catch(() => "absent")) as string,
    ).toBe("absent");
    expect(
      (await lstat(settingsPathOf(piTree)).catch(() => "absent")) as string,
    ).toBe("absent");
    expect(await readdir(stateRoot)).toEqual([".pi"]);
    expect(await readdir(path.join(piTree, "agent")).catch(() => [])).toEqual(
      [],
    );
  });

  it("a DRIFTED source (fixture manifest version ≠ the declared exact pin, recopy path) ⇒ the typed refusal naming the DRIFT (both versions present) — pio's owned install disagreeing with its own manifest is actionable, not silently absorbed", async () => {
    const drifting: FixturePackage = {
      name: A,
      version: "2.0.0",
      files: { "extra.txt": "drifted bytes" },
    };
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0" }, [drifting]);
    const { piTree } = await makeStateRoot();

    const message = await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      ["2.0.0", "1.0.0", path.join(pioRoot, "node_modules", A)],
    );
    expect(message).toMatch(/drift/i);
  });
});

describe("exact-owned-dep guard (fail-fast PRE-materialization)", () => {
  it("a roster name ABSENT from the pio manifest's dependencies ⇒ the refusal naming the package + the remedy; PRE-materialization — the state root is walked EMPTY and no settings file exists", async () => {
    const pioRoot = await fabricatePioRoot({}, []);
    const { stateRoot, piTree } = await makeStateRoot(false);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      [A, "EXACT"],
    );

    expect(await readdir(stateRoot)).toEqual([]);
    expect(
      (await lstat(settingsPathOf(piTree)).catch(() => "absent")) as string,
    ).toBe("absent");
  });

  it("a RANGE-typed pin ('^1.0.0') ⇒ the refusal (exactness required — a range is not an ownership declaration); equally PRE-materialization (state root EMPTY)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "^1.0.0" }, []);
    const { stateRoot, piTree } = await makeStateRoot(false);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      [A, "EXACT"],
    );

    expect(await readdir(stateRoot)).toEqual([]);
  });
});

describe("multi-package rows (ordering + failure isolation)", () => {
  it("MIXED staleness (A fresh + B stale, both settings entries missing) ⇒ A's mtimes stay untouched, B is wiped + recopied, and EXACTLY ONE settings write lands carrying BOTH entries (single-pass atomic pin via the fs-seam write counter)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0", [B]: "1.0.0" }, [
      FIXTURE_A,
      FIXTURE_B,
    ]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] });

    // Drive B stale and drop the settings file (both entries missing).
    await writeFile(
      path.join(targetDirOf(piTree, B), "package.json"),
      `${JSON.stringify({ name: B, version: "0.9.9" }, null, 2)}\n`,
    );
    await rm(settingsPathOf(piTree));
    const aWalkBefore = await walkTree(targetDirOf(piTree, A));

    const writes: string[] = [];
    const countingFs = {
      ...nodeOwnedExtensionFs,
      writeFile: async (file: string, data: string): Promise<void> => {
        writes.push(file);
        await nodeOwnedExtensionFs.writeFile(file, data);
      },
    };
    await ensureOwnedExtensions(piTree, {
      pioRoot,
      packages: [A, B],
      fs: countingFs,
    });

    // A: version-matched ⇒ skip path touches nothing (mtime pin).
    expect(await walkTree(targetDirOf(piTree, A))).toEqual(aWalkBefore);
    // B: wiped + recopied to the fresh source bytes.
    expect(await fileBytes(targetDirOf(piTree, B))).toEqual(
      await fileBytes(path.join(pioRoot, "node_modules", B)),
    );
    expect(
      JSON.parse(
        await readFile(
          path.join(targetDirOf(piTree, B), "package.json"),
          "utf8",
        ),
      ).version as string,
    ).toBe("1.0.0");
    // The WHOLE roster registered in ONE atomic settings write: exactly one
    // op-surface write, landing on the UNIQUE temp sibling IN THE SAME
    // DIRECTORY (rename over the final name is what the counter cannot see —
    // its effect is the settled content asserted next).
    expect(writes).toHaveLength(1);
    expect(writes[0]?.startsWith(`${settingsPathOf(piTree)}.`)).toBe(true);
    expect(writes[0]?.endsWith(".tmp")).toBe(true);
    expect(await readSettings(piTree)).toEqual({
      packages: [`npm:${A}`, `npm:${B}`],
    });
  });

  it("FAILURE ISOLATION (A copies ok, B's source missing) ⇒ the refusal; A REMAINS materialized and a healing re-run completes; the pre-seeded settings file stays UNTOUCHED by the failed run (register-after-materialize)", async () => {
    const pioRoot = await fabricatePioRoot({ [A]: "1.0.0", [B]: "1.0.0" }, [
      FIXTURE_A,
    ]);
    const { piTree } = await makeStateRoot();
    await mkdir(path.dirname(settingsPathOf(piTree)), { recursive: true });
    const preseeded = { packages: [], isolated: true };
    const rawPreseed = `${JSON.stringify(preseeded, null, 2)}\n`;
    await writeFile(settingsPathOf(piTree), rawPreseed);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] }),
      [path.join(pioRoot, "node_modules", B)],
    );

    // A survived the failed run, fully materialized + retryable…
    expect(await fileBytes(targetDirOf(piTree, A))).toEqual(
      await fileBytes(path.join(pioRoot, "node_modules", A)),
    );
    // …and the failed run registered NOTHING: settings bytes untouched.
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(rawPreseed);

    // Healing re-run after pio's own install is repaired.
    const bDir = path.join(pioRoot, "node_modules", B);
    await mkdir(bDir, { recursive: true });
    await writeFile(
      path.join(bDir, "package.json"),
      `${JSON.stringify({ name: B, version: "1.0.0" }, null, 2)}\n`,
    );
    await writeFile(path.join(bDir, "payload.txt"), "beta payload");
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] });

    expect(await readSettings(piTree)).toEqual({
      packages: [`npm:${A}`, `npm:${B}`],
      isolated: true,
    });
    expect(await fileBytes(targetDirOf(piTree, B))).toEqual(
      await fileBytes(bDir),
    );
  });
});

describe("default-guard derivations (mechanical anti-coupling)", () => {
  it("the default roster deep-equals ['pi-native-search']", () => {
    expect([...OWNED_EXTENSION_PACKAGES]).toEqual(["pi-native-search"]);
  });

  it("the default pioRoot === the hand-computed fileURLToPath(new URL('../..', <module URL>)) (pins the URL arithmetic incl. the level count — the module sits two levels down at src/sandbox/)", () => {
    const moduleUrl = new URL("./owned-extensions.ts", import.meta.url);
    expect(DEFAULT_PIO_ROOT).toBe(fileURLToPath(new URL("../..", moduleUrl)));
    // Sanity: the resolved root really carries the pio manifest.
    const manifest = JSON.parse(
      readFileSync(path.join(DEFAULT_PIO_ROOT, "package.json"), "utf8"),
    ) as { name: string };
    expect(manifest.name).toBe("pio");
  });

  it("production defaults (real roster, real pioRoot, real owned pin): a STALE-seeded temp piTree self-heals to the ACTUAL pio/package.json dependencies entry read fresh in the test — expectedVersion derivation pinned behaviorally (N=1 validation of the generic core)", async () => {
    const { piTree } = await makeStateRoot();
    const installed = targetDirOf(piTree, "pi-native-search");
    await mkdir(installed, { recursive: true });
    await writeFile(
      path.join(installed, "package.json"),
      `${JSON.stringify({ name: "pi-native-search", version: "0.0.0-stale" })}\n`,
    );
    await writeFile(path.join(installed, "stale-garbage.txt"), "garbage");

    await ensureOwnedExtensions(piTree); // NO seams — the production defaults

    const manifest = JSON.parse(
      await readFile(path.join(DEFAULT_PIO_ROOT, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const declared = manifest.dependencies["pi-native-search"];
    expect(typeof declared).toBe("string");
    const walk = await walkTree(installed);
    expect(walk.has("stale-garbage.txt")).toBe(false);
    const installedManifest = JSON.parse(
      await readFile(path.join(installed, "package.json"), "utf8"),
    ) as { version: string };
    expect(installedManifest.version).toBe(declared);
    expect(await readSettings(piTree)).toEqual({
      packages: ["npm:pi-native-search"],
    });
  });

  it("the module's value export surface is EXACTLY the pinned set (interfaces erase under erasable syntax; no helper leaks)", async () => {
    expect(Object.keys(await import("./owned-extensions.ts")).sort()).toEqual([
      "DEFAULT_PIO_ROOT",
      "OWNED_EXTENSION_PACKAGES",
      "ensureOwnedExtensions",
      "nodeOwnedExtensionFs",
    ]);
  });
});

describe("headless provisioning proof (open assumptions 1–2 — the REAL SDK graph)", () => {
  // Deliberately separated from the unit rows: this block touches the real
  // installed SDK (session construction under a fabricated PI_CODING_AGENT_DIR)
  // instead of the fabricated pio roots. Env discipline: PI_CODING_AGENT_DIR is
  // process-global within the vitest worker — set per-row, RESTORED in
  // afterEach. Construction must need no model/auth seeding and no network:
  // the materialized tree satisfies the offline resolver (the whole point).
  afterEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
  });

  it("web_search AND web_fetch are DEFINED over a session constructed (through the delivered session.ts seam) from the materialized temp agent dir — provisioning verified end-to-end (loader mechanics + copied-tree sufficiency)", async () => {
    const base = await tmpdir("pio-headless-");
    const piTree = path.join(base, ".pi");
    await mkdir(piTree, { recursive: true });
    // Materialize through the REAL production path: default roster, real
    // pioRoot, the real installed pio/node_modules/pi-native-search.
    await ensureOwnedExtensions(piTree);

    const agentDir = path.join(piTree, "agent");
    // getAgentDir() honors $PI_CODING_AGENT_DIR read at CALL time (measured
    // dist config.js) — set BEFORE construction.
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const cwd = await tmpdir("pio-headless-cwd-");
    const runtime = await createProbeSession(cwd);

    expect(runtime.session.getToolDefinition("web_search")).toBeDefined();
    expect(runtime.session.getToolDefinition("web_fetch")).toBeDefined();
  }, 120_000);
});
