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
import { PIO_PACKAGE_ROOT } from "../constants.ts";
import { createProbeSession } from "../session.ts";
import { LayoutError } from "./layout.ts";
import {
  ensureOwnedExtensions,
  nodeOwnedExtensionFs,
  OWNED_EXTENSION_PACKAGES,
} from "./owned-extensions.ts";

// Hermetic suite for the owned-extension provisioning core (D1/SR3 —
// guard-and-register over user-scope LOCAL SOURCES). Every unit row
// fabricates TWO trees under os.tmpdir() — a fake PIO ROOT (fixture package
// dirs under its node_modules, fed through the pioRoot seam) and a fake
// state root supplying the piTree handle — and drives the REAL filesystem
// over them: no vi.mocks, no timers, no network. Fixture package names are
// deliberately FOREIGN (fake-ext-a/fake-ext-b) so a row cannot accidentally
// pass by touching the real install. NOTE THE ABSENCE of manifest-read
// assertions anywhere in this suite: under the existence-only ruling the
// module performs NO manifest reads (it never reads ANY package.json besides
// the settings file itself) — their absence is the pin. The closing describe
// touches the real SDK graph (the headless provisioning proof).

const A = "fake-ext-a";
const B = "fake-ext-b";

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

/** Hand-written pio root: the given fixture packages as PLAIN DIRECTORY
 * trees under its node_modules (marker file only — under the existence-only
 * ruling nothing here is ever read by the module). */
async function fabricatePioRoot(packages: readonly string[]): Promise<string> {
  const root = await tmpdir("pio-oe-root-");
  for (const name of packages) {
    const dir = path.join(root, "node_modules", name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "marker.txt"), `payload ${name}`);
  }
  return root;
}

/** Fake state root + the piTree handle (mirrors the ensurePiTree result:
 * ONE recursive mkdir of <stateRoot>/.pi, the agent dir NOT created). */
async function makeStateRoot(): Promise<{
  readonly stateRoot: string;
  readonly piTree: string;
}> {
  const stateRoot = await tmpdir("pio-oe-state-");
  const piTree = path.join(stateRoot, ".pi");
  await mkdir(piTree, { recursive: true });
  return { stateRoot, piTree };
}

const settingsPathOf = (piTree: string): string =>
  path.join(piTree, "agent", "settings.json");

async function readSettings(piTree: string): Promise<unknown> {
  return JSON.parse(await readFile(settingsPathOf(piTree), "utf8"));
}

/** rel → kind over EVERY entry under root (lstat-based kinds: symlinks
 * report "symlink" and are never followed). */
async function walkTree(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
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
      out.set(path.relative(root, full), kind);
      if (stats.isDirectory()) await visit(full);
    }
  }
  await visit(root);
  return out;
}

/** Run the provisioning expecting THE typed LayoutError family: the refusal
 * must name every needle (artifact + condition [+ remedy]). */
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

describe("registration creation (guard-all + register-all)", () => {
  it("an empty agent dir + roster [A] ⇒ the MINIMAL-shape settings file is created carrying exactly the absolute source paths in roster order — and nothing else is created anywhere under the state root (walk-empty-minus-settings: the no-copy world pinned affirmatively)", async () => {
    const pioRoot = await fabricatePioRoot([A]);
    const { stateRoot, piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });

    const absA = path.join(pioRoot, "node_modules", A);
    expect(await readSettings(piTree)).toEqual({ packages: [absA] });
    // Canonical serialization: 2-space indent + trailing newline.
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(
      `${JSON.stringify({ packages: [absA] }, null, 2)}\n`,
    );
    // NOTHING is copied anymore: the entire state-root footprint IS the
    // ensured .pi handle + the settings file it registered into.
    const walk = await walkTree(stateRoot);
    expect([...walk.keys()].sort()).toEqual([
      ".pi",
      ".pi/agent",
      ".pi/agent/settings.json",
    ]);
    for (const kind of walk.values()) {
      expect(["directory", "file"]).toContain(kind);
    }
  });

  it("an empty agent dir + roster [A, B] ⇒ BOTH entries land in ROSTER ORDER and settings.json serializes in the canonical 2-space + trailing-newline form", async () => {
    const pioRoot = await fabricatePioRoot([A, B]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] });

    const absA = path.join(pioRoot, "node_modules", A);
    const absB = path.join(pioRoot, "node_modules", B);
    expect(await readSettings(piTree)).toEqual({ packages: [absA, absB] });
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(
      `${JSON.stringify({ packages: [absA, absB] }, null, 2)}\n`,
    );
  });
});

describe("entry-shape pin (local-source form locked independent of any dist citation)", () => {
  it('the registered entry string EQUALS exactly path.join(fabricatedPioRoot, "node_modules", n) — ABSOLUTE, no npm: prefix, no trailing slash (a raw local path, verbatim)', async () => {
    const pioRoot = await fabricatePioRoot([A]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });

    const entry = (await readSettings(piTree)) as { packages: unknown[] };
    const expected = path.join(pioRoot, "node_modules", A);
    expect(entry.packages[0]).toBe(expected);
    expect((entry.packages[0] as string) === expected).toBe(true);
    expect(path.isAbsolute(entry.packages[0] as string)).toBe(true);
    expect(entry.packages[0]).not.toMatch(/^npm:/);
    expect((entry.packages[0] as string).endsWith("/")).toBe(false);
  });
});

describe("steady-state zero-write (idempotency)", () => {
  it("a second run over steady state ⇒ the settings file's BYTES AND mtime are untouched and the state-root walk reveals NO NEW files (total no-op: per-package stat + one settings read, ZERO writes)", async () => {
    const pioRoot = await fabricatePioRoot([A, B]);
    const { stateRoot, piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A, B] as const };
    await ensureOwnedExtensions(piTree, seams);

    const beforeBytes = await readFile(settingsPathOf(piTree), "utf8");
    const beforeMtime = (await lstat(settingsPathOf(piTree))).mtimeMs;
    const beforeWalk = await walkTree(stateRoot);

    await ensureOwnedExtensions(piTree, seams);

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(beforeBytes);
    expect((await lstat(settingsPathOf(piTree))).mtimeMs).toBe(beforeMtime);
    expect(await walkTree(stateRoot)).toEqual(beforeWalk);
  });
});

describe("settings upsert (ONE atomic write covering the whole roster)", () => {
  it("pre-existing settings with unrelated top-level keys + pre-existing packages entries (incl. foreign strings and one OBJECT-form entry) ⇒ missing roster entries appended EXACTLY once each in roster order; deep-equal modulo the additions (keys/entries/order survive)", async () => {
    const pioRoot = await fabricatePioRoot([A, B]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A, B] as const };
    await ensureOwnedExtensions(piTree, seams);
    // Replace the settings file with an accumulated config: unrelated keys
    // around the array, foreign entry types, and A's entry ALREADY present.
    const absA = path.join(pioRoot, "node_modules", A);
    const preseeded = {
      theme: "dark",
      packages: [absA, "/some/foreign/path", 42, { x: 1 }],
      editor: { tabSize: 2 },
    };
    await writeFile(
      settingsPathOf(piTree),
      `${JSON.stringify(preseeded, null, 2)}\n`,
    );

    await ensureOwnedExtensions(piTree, seams);

    const absB = path.join(pioRoot, "node_modules", B);
    expect(await readSettings(piTree)).toEqual({
      theme: "dark",
      packages: [absA, "/some/foreign/path", 42, { x: 1 }, absB],
      editor: { tabSize: 2 },
    });
    // Top-level key ORDER preserved (insertion order survived the round-trip).
    const updated = (await readSettings(piTree)) as Record<string, unknown>;
    expect(Object.keys(updated)).toEqual(["theme", "packages", "editor"]);
    // A's pre-existing entry is never doubled.
    const packages = (updated as { packages: unknown[] }).packages;
    expect(packages.filter((entry) => entry === absA)).toHaveLength(1);
  });

  it("ALL roster entries pre-seeded alongside unrelated keys ⇒ the settings file's BYTES AND mtime are untouched (never-doubled: nothing missing ⇒ no write at all)", async () => {
    const pioRoot = await fabricatePioRoot([A]);
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });
    const preseeded = {
      packages: [path.join(pioRoot, "node_modules", A), "/some/other"],
      theme: "dark",
    };
    const rawPreseed = `${JSON.stringify(preseeded, null, 2)}\n`;
    await writeFile(settingsPathOf(piTree), rawPreseed);
    const mtimeBefore = (await lstat(settingsPathOf(piTree))).mtimeMs;

    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A] });

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(rawPreseed);
    expect((await lstat(settingsPathOf(piTree))).mtimeMs).toBe(mtimeBefore);
  });

  it("created-from-absent: guards pass but the settings FILE was lost from an established tree ⇒ the SAME minimal shape is recreated BYTE-IDENTICAL to the original and nothing else is written anywhere (deterministic recreation, single settings touch)", async () => {
    const pioRoot = await fabricatePioRoot([A, B]);
    const { stateRoot, piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A, B] as const };
    await ensureOwnedExtensions(piTree, seams);
    const originalBytes = await readFile(settingsPathOf(piTree), "utf8");
    await rm(settingsPathOf(piTree));

    // Snapshot everything EXCEPT the legitimate re-creation target.
    const beforeWalk = [...(await walkTree(stateRoot))].filter(
      ([rel]) => rel !== ".pi/agent/settings.json",
    );

    await ensureOwnedExtensions(piTree, seams);

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(originalBytes);
    const afterWalk = [...(await walkTree(stateRoot))].filter(
      ([rel]) => rel !== ".pi/agent/settings.json",
    );
    expect(afterWalk).toEqual(beforeWalk);
  });
});

describe("corruption refusals (loud failure over clobbering an accumulator)", () => {
  it("MALFORMED settings JSON ⇒ the typed refusal naming the file and the file left BYTE-UNTOUCHED afterwards (the re-run neither repairs nor overwrites it)", async () => {
    const pioRoot = await fabricatePioRoot([A]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A] as const };
    await ensureOwnedExtensions(piTree, seams);
    const corrupted = '{ "packages": ["/tmp/whatever", oops';
    await writeFile(settingsPathOf(piTree), corrupted);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, seams),
      [settingsPathOf(piTree), "malformed"],
    );

    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(corrupted);
  });

  it('a structurally WRONG "packages" (non-array) ⇒ the typed refusal naming the file and the file left BYTE-UNTOUCHED', async () => {
    const pioRoot = await fabricatePioRoot([A]);
    const { piTree } = await makeStateRoot();
    const seams = { pioRoot, packages: [A] as const };
    await ensureOwnedExtensions(piTree, seams);
    const corrupted = `${JSON.stringify(
      { packages: path.join(pioRoot, "node_modules", A), keep: 1 },
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

describe("existence guard (fail-fast PRE-registration)", () => {
  it("a MISSING fixture package dir ⇒ the actionable refusal naming the source path + the remediation hint; PRE-registration: the settings file is ABSENT and not even the agent dir is mkdir'd (nothing written anywhere)", async () => {
    const pioRoot = await fabricatePioRoot([]);
    const { stateRoot, piTree } = await makeStateRoot();

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      [path.join(pioRoot, "node_modules", A), "reinstall"],
    );

    expect(
      (await lstat(settingsPathOf(piTree)).catch(() => "absent")) as string,
    ).toBe("absent");
    expect(await readdir(stateRoot)).toEqual([".pi"]);
    expect(await readdir(piTree)).toEqual([]);
  });

  it("a SYMLINKED fixture source (pnpm-style layout) ⇒ a DISTINCT actionable refusal (identity binds of links dangle in-bubble where the link target is unmounted); the pre-seeded settings file stays BYTE-IDENTICAL (all guards precede any registration)", async () => {
    const pioRoot = await fabricatePioRoot([A]);
    // Re-point the fixture dir: real directory elsewhere, LINK in place.
    const realElsewhere = path.join(pioRoot, "elsewhere", A);
    await mkdir(realElsewhere, { recursive: true });
    await writeFile(path.join(realElsewhere, "marker.txt"), "outside bytes");
    await rm(path.join(pioRoot, "node_modules", A), { recursive: true });
    await symlink(realElsewhere, path.join(pioRoot, "node_modules", A));

    const { piTree } = await makeStateRoot();
    // Pre-seed an accumulated settings file beside the would-be registration
    // (parent mkdir — the registration itself would create it).
    await mkdir(path.dirname(settingsPathOf(piTree)), { recursive: true });
    const preseeded = { packages: [], guard: "preseeded" };
    const rawPreseed = `${JSON.stringify(preseeded, null, 2)}\n`;
    await writeFile(settingsPathOf(piTree), rawPreseed);

    const message = await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A] }),
      [path.join(pioRoot, "node_modules", A), "symlink"],
    );
    // Distinct from the absent-face line (its own remedy text).
    expect(message).not.toContain("is missing");

    // Register-after-guard: the settings file was never reached.
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(rawPreseed);
  });
});

describe("multi-package rows (ordering + failure isolation)", () => {
  it("both sources present + both entries missing ⇒ EXACTLY ONE settings write lands (single-pass atomic pin via the injected-fs counting spy) carrying BOTH entries in roster order, on the unique temp sibling IN THE SAME DIRECTORY", async () => {
    const pioRoot = await fabricatePioRoot([A, B]);
    const { piTree } = await makeStateRoot();
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

    // The WHOLE roster registered in ONE atomic settings write: exactly one
    // op-surface write, landing on the unique temp sibling beside
    // settings.json (rename over the final name is what the counter cannot
    // see — its effect is the settled content asserted next).
    expect(writes).toHaveLength(1);
    expect(writes[0]?.startsWith(`${settingsPathOf(piTree)}.`)).toBe(true);
    expect(writes[0]?.endsWith(".tmp")).toBe(true);
    expect(await readSettings(piTree)).toEqual({
      packages: [
        path.join(pioRoot, "node_modules", A),
        path.join(pioRoot, "node_modules", B),
      ],
    });
  });

  it("FAILURE ISOLATION (A present + B's source missing) ⇒ the refusal; a pre-seeded settings file stays BYTE-IDENTICAL (nothing registered); fixing B and re-running lands BOTH entries (retryable idempotent self-heal — the old 'sibling partially materialized' residual state is UNREACHABLE: nothing is ever copied)", async () => {
    const pioRoot = await fabricatePioRoot([A]);
    const { piTree } = await makeStateRoot();
    await mkdir(path.dirname(settingsPathOf(piTree)), { recursive: true });
    const preseeded = { packages: [], isolated: true };
    const rawPreseed = `${JSON.stringify(preseeded, null, 2)}\n`;
    await writeFile(settingsPathOf(piTree), rawPreseed);

    await expectRefusal(
      () => ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] }),
      [path.join(pioRoot, "node_modules", B)],
    );

    // …and the failed run registered NOTHING: settings bytes untouched.
    expect(await readFile(settingsPathOf(piTree), "utf8")).toBe(rawPreseed);

    // Healing re-run after pio's own install is repaired.
    const bDir = path.join(pioRoot, "node_modules", B);
    await mkdir(bDir, { recursive: true });
    await writeFile(path.join(bDir, "marker.txt"), "beta payload");
    await ensureOwnedExtensions(piTree, { pioRoot, packages: [A, B] });

    expect(await readSettings(piTree)).toEqual({
      packages: [
        path.join(pioRoot, "node_modules", A),
        path.join(pioRoot, "node_modules", B),
      ],
      isolated: true,
    });
  });
});

describe("default-guard derivations (mechanical anti-coupling)", () => {
  it("the default roster deep-equals ['pi-native-search']", () => {
    expect([...OWNED_EXTENSION_PACKAGES]).toEqual(["pi-native-search"]);
  });

  it("production defaults (NO seams — real roster, real pioRoot via src/constants.ts, real fs): the registered entry EQUALS the constant-derived vendored path by identity (===) — the wiring pin (the URL-arithmetic pin belongs to constants.test.ts alone)", async () => {
    const { piTree } = await makeStateRoot();
    await ensureOwnedExtensions(piTree); // NO seams

    const expected = path.join(
      PIO_PACKAGE_ROOT,
      "node_modules",
      "pi-native-search",
    );
    const parsed = (await readSettings(piTree)) as { packages: unknown[] };
    expect(parsed.packages[0]).toBe(expected);
    expect(parsed.packages[0] === expected).toBe(true);
  });

  it("the module's value export surface is EXACTLY the pinned set (interfaces erase under erasable syntax; no helper leaks)", async () => {
    expect(Object.keys(await import("./owned-extensions.ts")).sort()).toEqual([
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
  // the registered local source resolves in PLACE against the vendored tree
  // (no npm resolver involvement at all — the whole point).
  afterEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
  });

  it("web_search AND web_fetch are DEFINED over a session constructed (through the delivered session.ts seam) from the temp agent dir registered by the REAL production path — provisioning verified end-to-end (loader mechanics + in-place resolution sufficiency)", async () => {
    const base = await tmpdir("pio-headless-");
    const piTree = path.join(base, ".pi");
    await mkdir(piTree, { recursive: true });
    // Provision through the REAL production path: default roster, real
    // pioRoot, the real installed pio/node_modules/pi-native-search —
    // guards + upsert exercised end-to-end over the real artifact.
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

  it("SILENT-SKIP POSTURE (load-time rule pinned behaviorally): a settings packages entry pointing at an ABSENT path ⇒ session construction SUCCEEDS without error, BOTH getToolDefinitions UNDEFINED, no crash, no stall — offline-safe by construction; provisioning gaps surface through Step 4's loud preflight, never through construction (and nothing reaches for a registry)", async () => {
    const base = await tmpdir("pio-headless-skip-");
    const agentDir = path.join(base, ".pi", "agent");
    // Hand-written settings (skip provisioning entirely): a LOCAL SOURCE whose
    // resolved path does not exist.
    const absentTarget = path.join(base, "absent-vendored-tree");
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, "settings.json"),
      `${JSON.stringify(
        { packages: [absentTarget], theme: "dark" },
        null,
        2,
      )}\n`,
    );

    process.env.PI_CODING_AGENT_DIR = agentDir;
    const cwd = await tmpdir("pio-headless-skip-cwd-");
    const runtime = await createProbeSession(cwd);

    expect(runtime.session.getToolDefinition("web_search")).toBeUndefined();
    expect(runtime.session.getToolDefinition("web_fetch")).toBeUndefined();
  }, 120_000);
});
