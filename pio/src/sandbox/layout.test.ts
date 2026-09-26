import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FsView } from "./fsview.ts";
import {
  deriveProjectKey,
  ensureEngagementLayout,
  ensurePiTree,
  LayoutError,
  mintEngagementId,
  resolveStateRoot,
  slugify,
} from "./layout.ts";
import type { SandboxProfile } from "./profile.ts";
import {
  PROFILE_FILE_NAME,
  serializeProfile,
  writeProfileFile,
} from "./profile-serializer.ts";
import { renderProfile } from "./render.ts";

const FIXED_ID = "20260920T193232123Z-a1b2c3d4";
const FIXED_KEY = "home-u-dev-myrepo";

/** Recursively collect relative dir/file entries under a root; expectations
 * below are data literals compared against this walk, not recomputed paths. */
async function walkTree(
  root: string,
): Promise<{ dirs: string[]; files: string[] }> {
  const dirs: string[] = [];
  const files: string[] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirs.push(path.relative(root, full));
        await visit(full);
      } else {
        files.push(path.relative(root, full));
      }
    }
  }
  await visit(root);
  return { dirs, files };
}

describe("resolveStateRoot", () => {
  it("resolution matrix: PIO_STATE_DIR unset / empty / whitespace-only → <home>/.pio; non-empty override wins (AS-IS when clean, TRIMMED otherwise)", () => {
    const HOME = "/home/u";
    const rows: [Record<string, string | undefined>, string][] = [
      [{}, "/home/u/.pio"], // unset
      [{ PIO_STATE_DIR: "" }, "/home/u/.pio"], // empty string
      [{ PIO_STATE_DIR: "   " }, "/home/u/.pio"], // whitespace-only
      [{ PIO_STATE_DIR: "/custom/state" }, "/custom/state"], // used AS-IS
      [{ PIO_STATE_DIR: " /custom/state " }, "/custom/state"], // trimmed
    ];
    for (const [env, expected] of rows) {
      expect(resolveStateRoot(env, HOME)).toBe(expected);
    }
  });

  it("with an override set, the home argument is provably unused (garbage home + valid override → override wins)", () => {
    expect(resolveStateRoot({ PIO_STATE_DIR: "/opt/st" }, "")).toBe("/opt/st");
  });

  it("passthrough, no normalization beyond trim: trailing slash preserved VERBATIM and relative overrides forwarded UNRESOLVED (no path.resolve/cwd coupling)", () => {
    expect(resolveStateRoot({ PIO_STATE_DIR: "/st/" }, "/home/u")).toBe("/st/");
    expect(resolveStateRoot({ PIO_STATE_DIR: "rel/state" }, "/home/u")).toBe(
      "rel/state",
    );
  });
});

describe("slugify", () => {
  it("split/drop/join table: leading slash yields NO leading dash; double/trailing slashes dropped; spaces + non-ASCII survive VERBATIM inside segments; dash-collision accepted BOTH directions", () => {
    expect(slugify("/home/u/git/foo")).toBe("home-u-git-foo");
    expect(slugify("/home/u/git/foo").startsWith("-")).toBe(false);
    expect(slugify("/deep/path/to/a/repo/sub/dir")).toBe(
      "deep-path-to-a-repo-sub-dir",
    );
    expect(slugify("//x//y/")).toBe("x-y");
    expect(slugify("/home/u/my proj/ünïcode/路/x y")).toBe(
      "home-u-my proj-ünïcode-路-x y",
    );
    // Dash-collision pair — identical key, pinned in BOTH directions.
    expect(slugify("/a/b-c")).toBe("a-b-c");
    expect(slugify("/a-b/c")).toBe("a-b-c");
    expect(slugify("/a/b-c")).toBe(slugify("/a-b/c"));
  });

  it("boundaries: empty input maps to the empty string (total function — the empty-result guard lives in deriveProjectKey); dot segments survive VERBATIM (no dot-segment handling exists)", () => {
    expect(slugify("")).toBe("");
    expect(slugify("/a/./b")).toBe("a-.-b");
  });
});

describe("deriveProjectKey", () => {
  it("cwd-is-identity: literal mappings equal slugify(cwd) verbatim; deterministic across calls", () => {
    expect(deriveProjectKey("/home/u/dev/myrepo")).toBe("home-u-dev-myrepo");
    expect(deriveProjectKey("/a/b/c/d")).toBe("a-b-c-d");
    expect(deriveProjectKey("/home/u/dev/myrepo")).toBe(
      deriveProjectKey("/home/u/dev/myrepo"),
    );
  });

  it("empty-slug refusal: all-slash cwd THROWS a typed refusal naming the condition (no silent empty key)", () => {
    const cwds = ["/", "//", "///"];
    const failures: unknown[] = [];
    for (const cwd of cwds) {
      try {
        deriveProjectKey(cwd);
      } catch (err) {
        failures.push(err);
      }
    }
    expect(failures).toHaveLength(3);
    for (let i = 0; i < cwds.length; i++) {
      const err = failures[i];
      expect(err).toBeInstanceOf(LayoutError);
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message).toLowerCase()).toContain(
        "empty project key",
      );
      expect(String((err as Error).message)).toContain(cwds[i]);
    }
  });
});

describe("mintEngagementId", () => {
  it("fixed seams → exact pinned value (compact UTC millisecond timestamp + '-' + entropy)", () => {
    expect(
      mintEngagementId({
        now: () => Date.UTC(2026, 8, 20, 19, 32, 32, 123),
        entropy: () => "a1b2c3d4",
      }),
    ).toBe("20260920T193232123Z-a1b2c3d4");
  });

  it("single-digit milliseconds: fixed seams pin the deterministic 3-digit zero pad (never local time, never variable width)", () => {
    expect(
      mintEngagementId({
        now: () => Date.UTC(2026, 8, 20, 19, 32, 32, 5),
        entropy: () => "00112233",
      }),
    ).toBe("20260920T193232005Z-00112233");
  });

  it("default seams: shape YYYYMMDDTHHMMSSsssZ-<8 lowercase hex> on repeated mints", () => {
    for (let i = 0; i < 5; i++) {
      expect(mintEngagementId()).toMatch(/^\d{8}T\d{6}\d{3}Z-[0-9a-f]{8}$/);
    }
  });

  it("partial seams: each independent ?? fallback leg — now-only keeps the injected head with a real 8-lowercase-hex tail; entropy-only keeps the real clock's compact UTC-ms head with the injected suffix", () => {
    const nowOnly = mintEngagementId({
      now: () => Date.UTC(2026, 8, 20, 19, 32, 32, 123),
    });
    expect(nowOnly.startsWith("20260920T193232123Z-")).toBe(true);
    expect(nowOnly.slice(-8)).toMatch(/^[0-9a-f]{8}$/);
    const entropyOnly = mintEngagementId({
      entropy: () => "fedcba98",
    });
    expect(entropyOnly.endsWith("-fedcba98")).toBe(true);
    expect(entropyOnly.slice(0, -9)).toMatch(/^\d{8}T\d{6}\d{3}Z$/);
  });

  it("sortability: same entropy, now +1 ms and +1 s → lexicographically increasing ids", () => {
    const base = Date.UTC(2026, 8, 20, 19, 32, 32, 123);
    const idBase = mintEngagementId({
      now: () => base,
      entropy: () => "a1b2c3d4",
    });
    const idPlusMs = mintEngagementId({
      now: () => base + 1,
      entropy: () => "a1b2c3d4",
    });
    const idPlusSecond = mintEngagementId({
      now: () => base + 1000,
      entropy: () => "a1b2c3d4",
    });
    expect(idPlusMs > idBase).toBe(true);
    expect(idPlusSecond > idPlusMs).toBe(true);
  });

  it("uniqueness: 1000 consecutive default-seam mints → Set size === count", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(mintEngagementId());
    }
    expect(seen.size).toBe(1000);
  });
});

describe("ensureEngagementLayout", () => {
  it("fresh fake root: the created tree is EXACTLY the pinned dir set — nothing else (no files, no stray dirs)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-nesting-"));
    await ensureEngagementLayout({
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: FIXED_ID,
    });
    const tree = await walkTree(root);
    expect(tree.files).toEqual([]);
    expect([...tree.dirs].sort()).toEqual([
      "projects",
      `projects/${FIXED_KEY}`,
      `projects/${FIXED_KEY}/engagements`,
      `projects/${FIXED_KEY}/engagements/${FIXED_ID}`,
      `projects/${FIXED_KEY}/engagements/${FIXED_ID}/.sessions`,
      `projects/${FIXED_KEY}/engagements/${FIXED_ID}/.sessions/top`,
    ]);
  });

  it("returned handles deep-equal hand-built path.join expectations for all five fields", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-handles-"));
    const paths = await ensureEngagementLayout({
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: FIXED_ID,
    });
    const engagementDir = path.join(
      root,
      "projects",
      FIXED_KEY,
      "engagements",
      FIXED_ID,
    );
    expect(paths).toEqual({
      stateRoot: root,
      projectSlot: path.join(root, "projects", FIXED_KEY),
      engagementDir,
      sessionsDir: path.join(engagementDir, ".sessions"),
      topSessionDir: path.join(engagementDir, ".sessions", "top"),
    });
  });

  it("EEXIST race tolerance: pre-existing engagement tree + sentinel profile.json survive a re-ensure byte-identically (resolves, no clobber, equal handles)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-eexist-"));
    const input = {
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: FIXED_ID,
    };
    const first = await ensureEngagementLayout(input);
    const sentinel = "SENTINEL-BYTES-v1\n";
    await writeFile(path.join(first.engagementDir, "profile.json"), sentinel);
    const second = await ensureEngagementLayout(input);
    expect(second).toEqual(first);
    expect(
      await readFile(path.join(first.engagementDir, "profile.json"), "utf8"),
    ).toBe(sentinel);
  });

  it("sibling survival on re-ensure: two engagements under one fresh root — re-ensuring A leaves B's subtree intact with sentinel bytes UNCHANGED (the steady-state global-root shape)", async () => {
    const ID_B = "20260920T193233000Z-00ff11ee";
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-siblings-"));
    const inputA = {
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: FIXED_ID,
    };
    const inputB = {
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: ID_B,
    };
    const pathsA = await ensureEngagementLayout(inputA);
    const pathsB = await ensureEngagementLayout(inputB);
    const siblingBytes = "SIBLING-SENTINEL-v1\n";
    const siblingFile = path.join(pathsB.engagementDir, "profile.json");
    await writeFile(siblingFile, siblingBytes);
    const reA = await ensureEngagementLayout(inputA);
    expect(reA).toEqual(pathsA);
    expect(await readFile(siblingFile, "utf8")).toBe(siblingBytes);
    const tree = await walkTree(root);
    expect(tree.dirs).toContain(
      `projects/${FIXED_KEY}/engagements/${ID_B}/.sessions/top`,
    );
    const slot = path.join(root, "projects", FIXED_KEY);
    const dirA = path.join(slot, "engagements", FIXED_ID);
    const dirB = path.join(slot, "engagements", ID_B);
    expect(pathsA).toEqual({
      stateRoot: root,
      projectSlot: slot,
      engagementDir: dirA,
      sessionsDir: path.join(dirA, ".sessions"),
      topSessionDir: path.join(dirA, ".sessions", "top"),
    });
    expect(pathsB).toEqual({
      stateRoot: root,
      projectSlot: slot,
      engagementDir: dirB,
      sessionsDir: path.join(dirB, ".sessions"),
      topSessionDir: path.join(dirB, ".sessions", "top"),
    });
  });

  it("genuine fs failures propagate (no catch-and-swallow): a regular file blocking the tree rejects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-fail-"));
    await writeFile(path.join(root, "projects"), "a file, not a dir");
    await expect(
      ensureEngagementLayout({
        stateRoot: root,
        projectKey: "k",
        engagementId: FIXED_ID,
      }),
    ).rejects.toThrow();
  });

  it("retention proof: two sequential engagements under one fake root keep BOTH profile.json files with their correct bytes — the second write never disturbs the first", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-retention-"));
    const e1 = await ensureEngagementLayout({
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: FIXED_ID,
    });
    const e2 = await ensureEngagementLayout({
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: "20260920T193233000Z-00ff11ee",
    });
    const p1: SandboxProfile = {
      baseFlags: ["--unshare-all"],
      mounts: [{ sourcePath: "/one", mode: "ro" }],
      env: [{ key: "K1", value: "v1" }],
      chdir: "/",
      target: { executable: "/bin/t1", args: ["a"] },
    };
    const p2: SandboxProfile = {
      baseFlags: [],
      mounts: [],
      env: [],
      chdir: "/w",
      target: { executable: "/bin/t2", args: [] },
    };
    await writeProfileFile(e1.engagementDir, p1);
    await writeProfileFile(e2.engagementDir, p2);
    expect(
      await readFile(path.join(e1.engagementDir, PROFILE_FILE_NAME), "utf8"),
    ).toBe(serializeProfile(p1));
    expect(
      await readFile(path.join(e2.engagementDir, PROFILE_FILE_NAME), "utf8"),
    ).toBe(serializeProfile(p2));
  });

  it("cross-step continuity: the renderer-derived --sessions-root target arg deep-equals ensureEngagementLayout's sessionsDir for the SAME engagement (the two .sessions derivations can never drift)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s03-xstep-"));
    const paths = await ensureEngagementLayout({
      stateRoot: root,
      projectKey: FIXED_KEY,
      engagementId: FIXED_ID,
    });
    // Derived from the ensure itself — the renderer's .pi candidate and the
    // created tree cannot drift (two derivations, one expression).
    const piTree = await ensurePiTree(paths.stateRoot);
    const existing = new Set([
      "/etc/ssl",
      "/etc/resolv.conf",
      "/usr/local",
      "/home/u/dev/myrepo",
      paths.stateRoot,
      paths.projectSlot,
      piTree,
    ]);
    const view: FsView = {
      exists: (p) => existing.has(p),
      glob: () => [],
    };
    const rendered = renderProfile({
      cwd: "/home/u/dev/myrepo",
      home: "/home/u",
      projectKey: FIXED_KEY,
      engagementDir: paths.engagementDir,
      stateRoot: paths.stateRoot,
      projectSlot: paths.projectSlot,
      capabilityName: "probe",
      fsView: view,
      identity: { uid: 1000, gid: 1000 },
      runtimeDir: "/usr/local",
      mountSources: { readOnly: [], readWrite: [], extraMounts: [] },
      // Row focus is the .sessions derivation — the vehicle-provisioning
      // vendored members are out of scope here (the hermetic fake view does
      // not wire the default real paths).
      vendoredExtensions: [],
    });
    const flagIndex = rendered.target.args.indexOf("--sessions-root");
    expect(rendered.target.args[flagIndex + 1]).toBe(paths.sessionsDir);
    // The ensured .pi member composes into the render at its declared slot.
    expect(rendered.mounts).toContainEqual({ sourcePath: piTree, mode: "rw" });
  });
});

describe("ensurePiTree", () => {
  it("first use: absent before ⇒ resolves; <root>/.pi exists AND IS EMPTY (empty-dir-only proof folded in)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s06-pi-first-"));
    expect(await readdir(root)).toEqual([]); // .pi absent before
    const resolved = await ensurePiTree(root);
    expect(resolved).toBe(path.join(root, ".pi"));
    expect(await readdir(path.join(root, ".pi"))).toEqual([]);
    const tree = await walkTree(root);
    expect(tree.files).toEqual([]); // nothing else was ever written
    expect([...tree.dirs].sort()).toEqual([".pi"]);
  });

  it("idempotency: a second call against the existing tree is a clean no-op (still exactly the empty .pi)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s06-pi-idem-"));
    const first = await ensurePiTree(root);
    const second = await ensurePiTree(root);
    expect(second).toBe(first);
    const tree = await walkTree(root);
    expect(tree.dirs).toEqual([".pi"]);
    expect(tree.files).toEqual([]);
  });

  it("never clobbers: pre-seeded sentinel bytes under .pi survive byte-identically (steady-state content survives re-ensure)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s06-pi-keep-"));
    const sentinelPath = path.join(root, ".pi", "agent", "models.json");
    const sentinel = "OPERATOR-CUSTOMIZATION-BYTES\n";
    await mkdir(path.dirname(sentinelPath), { recursive: true });
    await writeFile(sentinelPath, sentinel);
    await ensurePiTree(root);
    expect(await readFile(sentinelPath, "utf8")).toBe(sentinel);
  });

  it("state-root co-creation: a NONEXISTENT state root under a fresh parent yields BOTH the root and .pi", async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), "pio-s06-pi-co-"));
    const root = path.join(parent, "absent-root");
    const resolved = await ensurePiTree(root);
    expect(resolved).toBe(path.join(root, ".pi"));
    const tree = await walkTree(parent);
    expect([...tree.dirs].sort()).toEqual(["absent-root", "absent-root/.pi"]);
    expect(tree.files).toEqual([]);
  });

  it("return echo + drift proof: the value deep-equals the hand-built path.join AND feeds the renderer candidate verbatim (a renderProfile over ONLY pio-state members composes the trio)", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s06-pi-drift-"));
    const slot = path.join(root, "projects", FIXED_KEY);
    const resolved = await ensurePiTree(root);
    expect(resolved).toEqual(path.join(root, ".pi"));
    const existing = new Set([
      "/etc/ssl",
      "/etc/resolv.conf",
      "/usr/local",
      "/home/u/dev/myrepo",
      root,
      slot,
      resolved,
    ]);
    const view: FsView = {
      exists: (p) => existing.has(p),
      glob: () => [],
    };
    const rendered = renderProfile({
      cwd: "/home/u/dev/myrepo",
      home: "/home/u",
      projectKey: FIXED_KEY,
      engagementDir: path.join(slot, "engagements", FIXED_ID),
      stateRoot: root,
      projectSlot: slot,
      capabilityName: "probe",
      fsView: view,
      identity: { uid: 1000, gid: 1000 },
      runtimeDir: "/usr/local",
      mountSources: { readOnly: [], readWrite: [], extraMounts: [] },
      // Row focus is the .pi drift proof ("ONLY pio-state members") — the
      // vehicle-provisioning vendored members are out of scope here (the
      // hermetic fake view does not wire the default real paths).
      vendoredExtensions: [],
    });
    // A(3) + the pio-state trio + cwd LAST — the created tree's .pi member
    // lands EXACTLY where the renderer derives its candidate (if the two
    // derivations drifted, the exists-check above would refuse).
    expect(rendered.mounts).toEqual([
      { sourcePath: "/etc/ssl", mode: "ro" },
      { sourcePath: "/etc/resolv.conf", mode: "ro" },
      { sourcePath: "/usr/local", mode: "ro" },
      { sourcePath: root, mode: "ro" },
      { sourcePath: slot, mode: "rw" },
      { sourcePath: resolved, mode: "rw" },
      { sourcePath: "/home/u/dev/myrepo", mode: "rw" },
    ]);
  });

  it("genuine fs failures propagate (no catch-and-swallow): a regular file blocking the .pi path rejects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pio-s06-pi-fail-"));
    await writeFile(path.join(root, ".pi"), "a file, not a dir");
    await expect(ensurePiTree(root)).rejects.toThrow();
  });
});
