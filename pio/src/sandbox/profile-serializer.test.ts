import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FsView } from "./fsview.ts";
import type { SandboxProfile } from "./profile.ts";
import {
  buildArgv,
  formatProfileLines,
  PROFILE_FILE_NAME,
  serializeProfile,
  writeProfileFile,
} from "./profile-serializer.ts";
import { type RenderInput, renderProfile } from "./render.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..", "..");
const PKG_BIN = path.join(PKG_ROOT, "bin", "pio");

/** Worked anchor row: hand-crafted profile, not a renderProfile output. */
const anchor: SandboxProfile = {
  baseFlags: [
    "--unshare-all",
    "--uid",
    "777",
    "--gid",
    "888",
    "--share-net",
    "--die-with-parent",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
  ],
  mounts: [
    { sourcePath: "/etc/ssl", mode: "ro" },
    { sourcePath: "/data/proj", mode: "rw" },
  ],
  env: [
    { key: "HOME", value: "/home/u" },
    { key: "PATH", value: "/rt/bin:/x" },
    { key: "PI_SANDBOX", value: "1" },
  ],
  chdir: "/home/u/dev",
  target: {
    executable: "/abs/pkg/bin/pio",
    args: [
      "session-run",
      "probe",
      "--sessions-root",
      "/st/projects/k/engagements/e1/.sessions",
    ],
  },
};

describe("buildArgv", () => {
  it("emits the full token order for the worked anchor (head → flags → mounts → chdir → setenv → -- → target)", () => {
    const cmd = buildArgv(anchor);
    expect(cmd.argv).toEqual([
      "bwrap",
      "--unshare-all",
      "--uid",
      "777",
      "--gid",
      "888",
      "--share-net",
      "--die-with-parent",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--tmpfs",
      "/tmp",
      "--ro-bind",
      "/etc/ssl",
      "/etc/ssl",
      "--bind",
      "/data/proj",
      "/data/proj",
      "--chdir",
      "/home/u/dev",
      "--setenv",
      "HOME",
      "/home/u",
      "--setenv",
      "PATH",
      "/rt/bin:/x",
      "--setenv",
      "PI_SANDBOX",
      "1",
      "--",
      "/abs/pkg/bin/pio",
      "session-run",
      "probe",
      "--sessions-root",
      "/st/projects/k/engagements/e1/.sessions",
    ]);
    expect(cmd.envSet).toEqual([
      ["HOME", "/home/u"],
      ["PATH", "/rt/bin:/x"],
      ["PI_SANDBOX", "1"],
    ]);
    expect(cmd.target).toEqual(anchor.target);
  });
});

/** S01 cross-step continuity wiring: local copy of the worked-anchor input
 * fixture (keeps this suite decoupled from render.test.ts). */
const ANCHOR_EXISTING = [
  // A. always-ro system set
  "/etc/ssl",
  "/etc/resolv.conf",
  "/usr/local",
  // B. conservative table (tilde-expanded against /home/u; glob via map)
  "/usr",
  "/lib",
  "/lib64",
  "/bin",
  "/home/u/.gitconfig",
  "/home/u/git",
  "/home/u/.config",
  "/home/u/.ssh",
  "/home/u/.pyenv",
  "/home/u/.cache/pypoetry",
  "/opt/google/chrome",
  "/etc/alternatives",
  "/etc/java-21-openjdk",
  "/etc/maven",
  "/etc/passwd",
  "/run/user/1000/gnupg",
  "/run/user/1000/bus",
  "/home/u/.local/bin",
  "/home/u/.pi",
  // C. pio-state pair
  "/home/u/.pio",
  "/home/u/.pio/projects/u-dev-myrepo",
  // D. cwd LAST
  "/home/u/dev/myrepo",
];

function s01AnchorInput(): RenderInput {
  const existing = new Set(ANCHOR_EXISTING);
  const globs: Record<string, string[]> = {
    "/home/u/.vscode/extensions/pi0.pi-vscode*": [
      "/home/u/.vscode/extensions/pi0.pi-vscode-1.2.3",
    ],
  };
  const view: FsView = {
    exists: (p) => existing.has(p),
    glob: (pattern) => globs[pattern] ?? [],
  };
  return {
    cwd: "/home/u/dev/myrepo",
    home: "/home/u",
    projectKey: "u-dev-myrepo",
    engagementDir: "/home/u/.pio/projects/u-dev-myrepo/engagements/e1",
    stateRoot: "/home/u/.pio",
    projectSlot: "/home/u/.pio/projects/u-dev-myrepo",
    capabilityName: "probe",
    fsView: view,
    identity: { uid: 1000, gid: 1000 },
    runtimeDir: "/usr/local",
  };
}

/** Swaps two adjacent mount entries; everything else untouched. */
function withSwappedAdjacentMounts(
  profile: SandboxProfile,
  i: number,
  j: number,
): SandboxProfile {
  const mounts = [...profile.mounts];
  [mounts[i], mounts[j]] = [mounts[j], mounts[i]];
  return { ...profile, mounts };
}

/** Positional span comparator: all positions outside [from..to] must be equal.
 * Used by the order-sensitivity row — it pins that a swap differs EXACTLY at
 * the swapped span and nowhere else. */
function expectEqualOutside(
  a: readonly string[],
  b: readonly string[],
  from: number,
  toInclusive: number,
): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    if (i >= from && i <= toInclusive) continue;
    expect(a[i]).toBe(b[i]);
  }
}

describe("buildArgv edge rows", () => {
  it("a swap of two adjacent mounts yields a vector differing exactly at that span", () => {
    const a = buildArgv(anchor);
    const b = buildArgv(withSwappedAdjacentMounts(anchor, 0, 1));
    // Mount triplets occupy indices 14..19 (head + 13 base flags before them).
    expectEqualOutside(a.argv, b.argv, 14, 19);
    expect(b.argv.slice(14, 17)).toEqual([
      "--bind",
      "/data/proj",
      "/data/proj",
    ]);
    expect(b.argv.slice(17, 20)).toEqual(["--ro-bind", "/etc/ssl", "/etc/ssl"]);
    expect(a.argv.slice(14, 17)).toEqual(["--ro-bind", "/etc/ssl", "/etc/ssl"]);
    expect(a.argv.slice(17, 20)).toEqual([
      "--bind",
      "/data/proj",
      "/data/proj",
    ]);
  });

  it("same-path bind forms: ro → --ro-bind p p, rw → --bind p p, path byte-identical in both slots", () => {
    const cmd = buildArgv({
      baseFlags: [],
      mounts: [
        { sourcePath: "/a/b c", mode: "ro" }, // space
        { sourcePath: "/ünïcode/路", mode: "rw" }, // non-ASCII
        { sourcePath: "-leading-dash", mode: "ro" }, // dash prefix
        { sourcePath: "/a:b:c", mode: "rw" }, // colons
      ],
      env: [],
      chdir: "/",
      target: { executable: "/bin/t", args: [] },
    });
    expect(cmd.argv).toEqual([
      "bwrap",
      "--ro-bind",
      "/a/b c",
      "/a/b c",
      "--bind",
      "/ünïcode/路",
      "/ünïcode/路",
      "--ro-bind",
      "-leading-dash",
      "-leading-dash",
      "--bind",
      "/a:b:c",
      "/a:b:c",
      "--chdir",
      "/",
      "--",
      "/bin/t",
    ]);
  });

  it("duplicate paths keep BOTH triplets in declaration order (no dedup, no filtering)", () => {
    const cmd = buildArgv({
      baseFlags: [],
      mounts: [
        { sourcePath: "/x", mode: "ro" },
        { sourcePath: "/y", mode: "rw" },
        { sourcePath: "/x", mode: "ro" },
        { sourcePath: "/y", mode: "rw" },
      ],
      env: [],
      chdir: "/",
      target: { executable: "/bin/t", args: [] },
    });
    expect(cmd.argv).toEqual([
      "bwrap",
      "--ro-bind",
      "/x",
      "/x",
      "--bind",
      "/y",
      "/y",
      "--ro-bind",
      "/x",
      "/x",
      "--bind",
      "/y",
      "/y",
      "--chdir",
      "/",
      "--",
      "/bin/t",
    ]);
  });

  it("empty mounts: head → base flags → --chdir → setenv trio → -- → target (nothing dropped, nothing extra)", () => {
    const cmd = buildArgv({
      baseFlags: ["--unshare-all", "--die-with-parent"],
      mounts: [],
      env: [
        { key: "HOME", value: "/home/u" },
        { key: "PATH", value: "/bin" },
        { key: "PI_SANDBOX", value: "1" },
      ],
      chdir: "/work",
      target: { executable: "/bin/run", args: ["one"] },
    });
    expect(cmd.argv).toEqual([
      "bwrap",
      "--unshare-all",
      "--die-with-parent",
      "--chdir",
      "/work",
      "--setenv",
      "HOME",
      "/home/u",
      "--setenv",
      "PATH",
      "/bin",
      "--setenv",
      "PI_SANDBOX",
      "1",
      "--",
      "/bin/run",
      "one",
    ]);
    expect(cmd.envSet).toEqual([
      ["HOME", "/home/u"],
      ["PATH", "/bin"],
      ["PI_SANDBOX", "1"],
    ]);
  });

  it("--setenv pairs iterate profile.env in stored order — no hardcoded key names, envSet mirrors faithfully", () => {
    const cmd = buildArgv({
      baseFlags: [],
      mounts: [],
      env: [
        { key: "Z_LAST", value: "z" },
        { key: "A_FIRST", value: "a" },
        { key: "M_MID", value: "m m" },
      ],
      chdir: "/",
      target: { executable: "/bin/t", args: [] },
    });
    expect(cmd.argv).toEqual([
      "bwrap",
      "--chdir",
      "/",
      "--setenv",
      "Z_LAST",
      "z",
      "--setenv",
      "A_FIRST",
      "a",
      "--setenv",
      "M_MID",
      "m m",
      "--",
      "/bin/t",
    ]);
    expect(cmd.envSet).toEqual([
      ["Z_LAST", "z"],
      ["A_FIRST", "a"],
      ["M_MID", "m m"],
    ]);
  });

  it("PATH passes through UNMODIFIED: embedded/leading/trailing colons and exotic segments survive byte-intact (no re-splitting)", () => {
    const exotic = "/::///weird:seg::with:colons:/";
    const cmd = buildArgv({
      baseFlags: [],
      mounts: [],
      env: [{ key: "PATH", value: exotic }],
      chdir: "/",
      target: { executable: "/bin/t", args: [] },
    });
    expect(cmd.argv).toEqual([
      "bwrap",
      "--chdir",
      "/",
      "--setenv",
      "PATH",
      exotic,
      "--",
      "/bin/t",
    ]);
  });

  it("--chdir sits immediately after the LAST mount triplet (index-exact)", () => {
    const cmd = buildArgv(anchor);
    const chdirIndex = 1 + anchor.baseFlags.length + anchor.mounts.length * 3;
    expect(cmd.argv[chdirIndex]).toBe("--chdir");
    expect(cmd.argv[chdirIndex + 1]).toBe(anchor.chdir);
  });

  it("exactly ONE '--' at index len − 1 − (1 + target.args.length)", () => {
    const cmd = buildArgv(anchor);
    const expected = cmd.argv.length - 1 - (1 + anchor.target.args.length);
    expect(cmd.argv.indexOf("--")).toBe(expected);
    expect(cmd.argv.lastIndexOf("--")).toBe(expected);
  });

  it("target passthrough with exotic-arg integrity: control chars arrive byte-intact post-'--', order preserved; cmd.target mirror deep-equals", () => {
    const tab = "\t";
    const newline = "\n";
    const bell = "\u0007";
    const target = {
      executable: "/bin/top",
      args: [`a${tab}b`, `c${newline}d`, `e${bell}f`, "plain"],
    };
    const cmd = buildArgv({
      baseFlags: ["--unshare-all"],
      mounts: [{ sourcePath: "/m", mode: "ro" }],
      env: [{ key: "HOME", value: "/h" }],
      chdir: "/w",
      target,
    });
    const after = cmd.argv.slice(cmd.argv.lastIndexOf("--") + 1);
    expect(after).toEqual([
      "/bin/top",
      `a${tab}b`,
      `c${newline}d`,
      `e${bell}f`,
      "plain",
    ]);
    expect(cmd.target).toEqual(target);
  });

  it("total/deterministic: degenerate-but-shape-valid profiles never throw, and two calls are deep-equal (argv, envSet, target)", () => {
    const degenerate: SandboxProfile[] = [
      {
        baseFlags: [],
        mounts: [],
        env: [],
        chdir: "/",
        target: { executable: "x", args: [] },
      },
      {
        baseFlags: ["q"],
        mounts: [],
        env: [],
        chdir: ".",
        target: { executable: "?", args: ["#"] },
      },
      {
        baseFlags: [],
        mounts: [{ sourcePath: "p", mode: "rw" }],
        env: [{ key: "K", value: "V" }],
        chdir: "-",
        target: { executable: "t", args: ["*", "\n"] },
      },
    ];
    for (const profile of degenerate) {
      const a = buildArgv(profile); // must not throw
      const b = buildArgv(profile);
      expect(a.argv).toEqual(b.argv);
      expect(a.envSet).toEqual(b.envSet);
      expect(a.target).toEqual(b.target);
    }
    const minimal = buildArgv(degenerate[0]);
    expect(minimal.argv).toEqual(["bwrap", "--chdir", "/", "--", "x"]);
    expect(minimal.envSet).toEqual([]);
  });

  it("a data-side '--' token arrives byte-intact post-separator while the builder-emitted separator slot stays formula-exact", () => {
    const cmd = buildArgv({
      baseFlags: [],
      mounts: [],
      env: [],
      chdir: "/",
      target: { executable: "/bin/t", args: ["--", "x"] },
    });
    // Formula-computed slot of the BUILDER-EMITTED separator — it must not
    // move just because the data mimics the separator.
    const separatorIndex = cmd.argv.length - 1 - (1 + cmd.target.args.length);
    expect(cmd.argv[separatorIndex]).toBe("--");
    // The data-side copy passes through byte-intact after the real separator.
    expect(cmd.argv.slice(separatorIndex + 1)).toEqual(["/bin/t", "--", "x"]);
  });
});

describe("serializeProfile", () => {
  it("canonical form: pinned member order, 2-space indent, begins with '{\\n  \"baseFlags\": [', ends with exactly one trailing newline, no tabs/CRs", () => {
    const text = serializeProfile(anchor);
    expect(text.startsWith('{\n  "baseFlags": [')).toBe(true);
    // Full top-level member order asserted FROM THE SERIALIZED TEXT.
    const keys = ["baseFlags", "mounts", "env", "chdir", "target"];
    let lastIndex = -1;
    for (const key of keys) {
      const index = text.indexOf(`\n  "${key}": `);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
    // 2-space indentation discipline: every indented line opens with an even
    // number of spaces (JSON.stringify's 2-space form), never a tab.
    for (const line of text.split("\n")) {
      const indentLength = line.match(/^ */)?.[0].length ?? 0;
      expect(indentLength % 2).toBe(0);
    }
    expect(text.includes("\t")).toBe(false);
    expect(text.includes("\r")).toBe(false);
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });

  it("round-trip pin: plain JSON.parse deep-equals the structured profile, and re-serialization is BYTE-STABLE", () => {
    const text = serializeProfile(anchor);
    const parsed: SandboxProfile = globalThis.JSON.parse(text);
    expect(parsed).toEqual(anchor);
    // Byte-stability across the round-trip relies on construction-order
    // discipline in the serializer, not on how `anchor` was built.
    expect(serializeProfile(parsed)).toBe(text);
  });

  it("round-trip stability holds for degenerate profiles too (empty sections serialize to empty members)", () => {
    const minimal: SandboxProfile = {
      baseFlags: [],
      mounts: [],
      env: [],
      chdir: "/",
      target: { executable: "x", args: [] },
    };
    const text = serializeProfile(minimal);
    const parsed: SandboxProfile = globalThis.JSON.parse(text);
    expect(parsed).toEqual(minimal);
    expect(serializeProfile(parsed)).toBe(text);
    expect(JSON.parse(text).baseFlags).toEqual([]);
  });

  it("escape-bearing content: JSON.parse deep-equals the original profile and re-serialization is byte-identical", () => {
    const escaped: SandboxProfile = {
      baseFlags: ['"q"', "\\s"],
      mounts: [{ sourcePath: "/mnt/\txy", mode: "ro" }],
      env: [{ key: "K", value: "line1\n\u{1F600}" }],
      chdir: "/",
      target: { executable: "/bin/t", args: ["bs\\nl\ntail"] },
    };
    const text = serializeProfile(escaped);
    const parsed: SandboxProfile = globalThis.JSON.parse(text);
    expect(parsed).toEqual(escaped);
    expect(serializeProfile(parsed)).toBe(text);
  });
});

describe("S01 cross-step continuity row", () => {
  it("maps the S01 anchor profile through buildArgv to the full pinned token vector", () => {
    const cmd = buildArgv(renderProfile(s01AnchorInput()));
    expect(cmd.argv).toEqual([
      "bwrap",
      "--unshare-all",
      "--uid",
      "1000",
      "--gid",
      "1000",
      "--share-net",
      "--die-with-parent",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--tmpfs",
      "/tmp",
      "--ro-bind",
      "/etc/ssl",
      "/etc/ssl",
      "--ro-bind",
      "/etc/resolv.conf",
      "/etc/resolv.conf",
      "--ro-bind",
      "/usr/local",
      "/usr/local",
      "--ro-bind",
      "/usr",
      "/usr",
      "--ro-bind",
      "/lib",
      "/lib",
      "--ro-bind",
      "/lib64",
      "/lib64",
      "--ro-bind",
      "/bin",
      "/bin",
      "--ro-bind",
      "/home/u/.gitconfig",
      "/home/u/.gitconfig",
      "--ro-bind",
      "/home/u/.vscode/extensions/pi0.pi-vscode-1.2.3",
      "/home/u/.vscode/extensions/pi0.pi-vscode-1.2.3",
      "--ro-bind",
      "/home/u/git",
      "/home/u/git",
      "--ro-bind",
      "/home/u/.config",
      "/home/u/.config",
      "--ro-bind",
      "/home/u/.ssh",
      "/home/u/.ssh",
      "--ro-bind",
      "/home/u/.pyenv",
      "/home/u/.pyenv",
      "--ro-bind",
      "/home/u/.cache/pypoetry",
      "/home/u/.cache/pypoetry",
      "--ro-bind",
      "/opt/google/chrome",
      "/opt/google/chrome",
      "--ro-bind",
      "/etc/alternatives",
      "/etc/alternatives",
      "--ro-bind",
      "/etc/java-21-openjdk",
      "/etc/java-21-openjdk",
      "--ro-bind",
      "/etc/maven",
      "/etc/maven",
      "--ro-bind",
      "/etc/passwd",
      "/etc/passwd",
      "--ro-bind",
      "/run/user/1000/gnupg",
      "/run/user/1000/gnupg",
      "--ro-bind",
      "/run/user/1000/bus",
      "/run/user/1000/bus",
      "--ro-bind",
      "/home/u/.local/bin",
      "/home/u/.local/bin",
      "--ro-bind",
      "/home/u/.pi",
      "/home/u/.pi",
      "--ro-bind",
      "/home/u/.pio",
      "/home/u/.pio",
      "--bind",
      "/home/u/.pio/projects/u-dev-myrepo",
      "/home/u/.pio/projects/u-dev-myrepo",
      "--bind",
      "/home/u/dev/myrepo",
      "/home/u/dev/myrepo",
      "--chdir",
      "/home/u/dev/myrepo",
      "--setenv",
      "HOME",
      "/home/u",
      "--setenv",
      "PATH",
      "/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "--setenv",
      "PI_SANDBOX",
      "1",
      "--",
      PKG_BIN,
      "session-run",
      "probe",
      "--sessions-root",
      "/home/u/.pio/projects/u-dev-myrepo/engagements/e1/.sessions",
    ]);
    expect(cmd.envSet).toEqual([
      ["HOME", "/home/u"],
      [
        "PATH",
        "/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      ],
      ["PI_SANDBOX", "1"],
    ]);
  });
});

describe("PROFILE_FILE_NAME + writeProfileFile", () => {
  it("constant pin: PROFILE_FILE_NAME === 'profile.json'", () => {
    expect(PROFILE_FILE_NAME).toBe("profile.json");
  });

  it("byte-equal profile file: writes serializeProfile(anchor) verbatim into <engagementDir>/profile.json — one anchor const feeds both calls, file sits DIRECTLY in the engagement dir", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pio-s03-profile-file-"));
    await writeProfileFile(dir, anchor);
    expect(await readdir(dir)).toEqual([PROFILE_FILE_NAME]);
    const text = await readFile(path.join(dir, PROFILE_FILE_NAME), "utf8");
    expect(text).toBe(serializeProfile(anchor));
  });

  it("no deletion API ships: module source carries zero removal identifiers (comments included) and no remove/delete-family export names", async () => {
    const source = await readFile(
      path.join(HERE, "profile-serializer.ts"),
      "utf8",
    );
    for (const identifier of ["unlink", "rmdir", "rmSync", ".rm("]) {
      expect(source.includes(identifier)).toBe(false);
    }
    const exportedNames: string[] = [];
    for (const match of source.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      exportedNames.push(match[1]);
    }
    expect(exportedNames.length).toBeGreaterThan(0);
    for (const name of exportedNames) {
      expect(name.toLowerCase()).not.toMatch(/remove|delete/);
    }
  });
});

describe("formatProfileLines", () => {
  it("worked-anchor snapshot: the exact pinned line array (deep-equal data literal)", () => {
    expect(formatProfileLines(anchor)).toEqual([
      "sandbox profile:",
      '  baseFlags: "--unshare-all" "--uid" "777" "--gid" "888" "--share-net" "--die-with-parent" "--dev" "/dev" "--proc" "/proc" "--tmpfs" "/tmp"',
      "  mounts:",
      '    [ro] "/etc/ssl"',
      '    [rw] "/data/proj"',
      "  env:",
      '    "HOME"="/home/u"',
      '    "PATH"="/rt/bin:/x"',
      '    "PI_SANDBOX"="1"',
      '  chdir: "/home/u/dev"',
      '  target: "/abs/pkg/bin/pio" "session-run" "probe" "--sessions-root" "/st/projects/k/engagements/e1/.sessions"',
    ]);
  });

  it("degenerate snapshot: empty sections render inline '(none)' — the exact pinned 6-line array", () => {
    expect(
      formatProfileLines({
        baseFlags: [],
        mounts: [],
        env: [],
        chdir: "/",
        target: { executable: "x", args: [] },
      }),
    ).toEqual([
      "sandbox profile:",
      "  baseFlags: (none)",
      "  mounts: (none)",
      "  env: (none)",
      '  chdir: "/"',
      '  target: "x"',
    ]);
  });

  it("header is exactly 'sandbox profile:' and the target line is ALWAYS the last element (across shapes)", () => {
    const shapes: SandboxProfile[] = [
      anchor,
      {
        baseFlags: [],
        mounts: [],
        env: [],
        chdir: "/",
        target: { executable: "x", args: [] },
      },
      {
        baseFlags: ["--one", "--two"],
        mounts: [{ sourcePath: "/only", mode: "rw" }],
        env: [{ key: "K", value: "V" }],
        chdir: "/w",
        target: { executable: "/bin/t", args: ["a b", "--", "x"] },
      },
    ];
    for (const profile of shapes) {
      const lines = formatProfileLines(profile);
      expect(lines[0]).toBe("sandbox profile:");
      expect(lines.at(-1)?.startsWith("  target: ")).toBe(true);
    }
  });

  it("mount sub-lines follow profile.mounts EMISSION order with markers taken straight from mounts[].mode (mode swap swaps markers, paths unchanged; reorder follows)", () => {
    const shell: Omit<SandboxProfile, "mounts"> = {
      baseFlags: [],
      env: [],
      chdir: "/",
      target: { executable: "x", args: [] },
    };
    const a: SandboxProfile = {
      ...shell,
      mounts: [
        { sourcePath: "/m1", mode: "rw" },
        { sourcePath: "/m2", mode: "ro" },
      ],
    };
    const modesSwapped: SandboxProfile = {
      ...shell,
      mounts: [
        { sourcePath: "/m1", mode: "ro" },
        { sourcePath: "/m2", mode: "rw" },
      ],
    };
    const reordered: SandboxProfile = {
      ...shell,
      mounts: [a.mounts[1], a.mounts[0]],
    };
    expect(formatProfileLines(a)).toEqual([
      "sandbox profile:",
      "  baseFlags: (none)",
      "  mounts:",
      '    [rw] "/m1"',
      '    [ro] "/m2"',
      "  env: (none)",
      '  chdir: "/"',
      '  target: "x"',
    ]);
    // Mode swap: markers swap, paths UNCHANGED.
    expect(formatProfileLines(modesSwapped)).toEqual([
      "sandbox profile:",
      "  baseFlags: (none)",
      "  mounts:",
      '    [ro] "/m1"',
      '    [rw] "/m2"',
      "  env: (none)",
      '  chdir: "/"',
      '  target: "x"',
    ]);
    // Reorder: sub-line order follows the stored mounts array.
    expect(formatProfileLines(reordered)).toEqual([
      "sandbox profile:",
      "  baseFlags: (none)",
      "  mounts:",
      '    [ro] "/m2"',
      '    [rw] "/m1"',
      "  env: (none)",
      '  chdir: "/"',
      '  target: "x"',
    ]);
  });

  it("env sub-lines keep STORED order (non-alphabetical keys unsorted)", () => {
    const lines = formatProfileLines({
      baseFlags: [],
      mounts: [],
      env: [
        { key: "Z_LAST", value: "z" },
        { key: "A_FIRST", value: "a" },
        { key: "M_MID", value: "m m" },
      ],
      chdir: "/",
      target: { executable: "x", args: [] },
    });
    expect(lines.slice(4, 7)).toEqual([
      '    "Z_LAST"="z"',
      '    "A_FIRST"="a"',
      '    "M_MID"="m m"',
    ]);
  });

  it("exotic-byte integrity: tab+newline mount path renders as ONE physical line with JSON escapes (line count unchanged); two calls deep-equal", () => {
    const profile: SandboxProfile = {
      baseFlags: [],
      mounts: [{ sourcePath: `/mnt/a\tb\nc`, mode: "ro" }],
      env: [],
      chdir: "/",
      target: { executable: "x", args: [] },
    };
    const lines = formatProfileLines(profile);
    expect(lines).toEqual([
      "sandbox profile:",
      "  baseFlags: (none)",
      "  mounts:",
      '    [ro] "/mnt/a\\tb\\nc"',
      "  env: (none)",
      '  chdir: "/"',
      '  target: "x"',
    ]);
    expect(formatProfileLines(profile)).toEqual(lines);
  });

  it("displayed = retained = executed: printed target line is LAST while the retained document's final field block is the SAME structured target value", () => {
    const lines = formatProfileLines(anchor);
    expect(lines.at(-1)?.startsWith("  target: ")).toBe(true);
    const retained: SandboxProfile = globalThis.JSON.parse(
      serializeProfile(anchor),
    );
    expect(retained.target).toEqual(anchor.target);
  });
});
