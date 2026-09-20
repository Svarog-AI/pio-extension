import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FsView } from "./fsview.ts";
import {
  deriveProjectKey,
  ensureEngagementLayout,
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

  it("default seams: shape YYYYMMDDTHHMMSSsssZ-<8 lowercase hex> on repeated mints", () => {
    for (let i = 0; i < 5; i++) {
      expect(mintEngagementId()).toMatch(/^\d{8}T\d{6}\d{3}Z-[0-9a-f]{8}$/);
    }
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
    const existing = new Set([
      "/etc/ssl",
      "/etc/resolv.conf",
      "/usr/local",
      "/home/u/dev/myrepo",
      paths.stateRoot,
      paths.projectSlot,
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
    });
    const flagIndex = rendered.target.args.indexOf("--sessions-root");
    expect(rendered.target.args[flagIndex + 1]).toBe(paths.sessionsDir);
  });
});
