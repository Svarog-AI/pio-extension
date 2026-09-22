import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FsView } from "./fsview.ts";
import { conservativeDefaultSources, STANDARD_PATH_BASE } from "./profile.ts";
import {
  type RenderInput,
  renderProfile,
  SandboxRenderError,
} from "./render.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..", "..");
const PKG_BIN = path.join(PKG_ROOT, "bin", "pio-run-session");

/** In-memory FsView with call capture. */
function makeFake(
  opts: { existing?: Iterable<string>; globs?: Record<string, string[]> } = {},
) {
  const existing = new Set(opts.existing ?? []);
  const globs = opts.globs ?? {};
  const calls: { method: "exists" | "glob"; arg: string }[] = [];
  const view: FsView = {
    exists: (p) => {
      calls.push({ method: "exists", arg: p });
      return existing.has(p);
    },
    glob: (pattern) => {
      calls.push({ method: "glob", arg: pattern });
      return globs[pattern] ?? [];
    },
  };
  return { view, calls, existing };
}

/** Canonical production input (worked-descriptor anchor), overridable per row. */
function baseInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    cwd: "/home/u/dev/myrepo",
    home: "/home/u",
    projectKey: "u-dev-myrepo",
    engagementDir: "/home/u/.pio/projects/u-dev-myrepo/engagements/e1",
    stateRoot: "/home/u/.pio",
    projectSlot: "/home/u/.pio/projects/u-dev-myrepo",
    capabilityName: "probe",
    fsView: makeFake().view,
    identity: { uid: 1000, gid: 1000 },
    runtimeDir: "/usr/local",
    ...overrides,
  };
}

/** Small explicit sources for focused edge rows. */
function sources(
  readOnly: string[],
  readWrite: string[] = [],
  extraMounts: { path: string; readOnly?: boolean }[] = [],
) {
  return { readOnly, readWrite, extraMounts };
}

/** Shared anchor fixture wiring (fake view over ANCHOR_EXISTING + glob map). */
function anchorFake() {
  return makeFake({
    existing: ANCHOR_EXISTING,
    globs: {
      "/home/u/.vscode/extensions/pi0.pi-vscode*": [
        "/home/u/.vscode/extensions/pi0.pi-vscode-1.2.3",
      ],
    },
  });
}

/** Every literal candidate that must EXIST for the worked anchor to compose. */
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
  // C. pio-state trio (explicit inputs)
  "/home/u/.pio",
  "/home/u/.pio/projects/u-dev-myrepo",
  "/home/u/.pio/.pi",
  // D. cwd LAST
  "/home/u/dev/myrepo",
];

describe("worked anchor (canonical production run)", () => {
  it("renders the pinned deep-equal profile (mounts, baseFlags, env, chdir, target)", () => {
    const fake = anchorFake();
    expect(renderProfile(baseInput({ fsView: fake.view }))).toEqual({
      baseFlags: [
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
      ],
      mounts: [
        { sourcePath: "/etc/ssl", mode: "ro" },
        { sourcePath: "/etc/resolv.conf", mode: "ro" },
        { sourcePath: "/usr/local", mode: "ro" },
        { sourcePath: "/usr", mode: "ro" },
        { sourcePath: "/lib", mode: "ro" },
        { sourcePath: "/lib64", mode: "ro" },
        { sourcePath: "/bin", mode: "ro" },
        { sourcePath: "/home/u/.gitconfig", mode: "ro" },
        {
          sourcePath: "/home/u/.vscode/extensions/pi0.pi-vscode-1.2.3",
          mode: "ro",
        },
        { sourcePath: "/home/u/git", mode: "ro" },
        { sourcePath: "/home/u/.config", mode: "ro" },
        { sourcePath: "/home/u/.ssh", mode: "ro" },
        { sourcePath: "/home/u/.pyenv", mode: "ro" },
        { sourcePath: "/home/u/.cache/pypoetry", mode: "ro" },
        { sourcePath: "/opt/google/chrome", mode: "ro" },
        { sourcePath: "/etc/alternatives", mode: "ro" },
        { sourcePath: "/etc/java-21-openjdk", mode: "ro" },
        { sourcePath: "/etc/maven", mode: "ro" },
        { sourcePath: "/etc/passwd", mode: "ro" },
        { sourcePath: "/run/user/1000/gnupg", mode: "ro" },
        { sourcePath: "/run/user/1000/bus", mode: "ro" },
        { sourcePath: "/home/u/.local/bin", mode: "ro" },
        { sourcePath: "/home/u/.pio", mode: "ro" },
        { sourcePath: "/home/u/.pio/projects/u-dev-myrepo", mode: "rw" },
        { sourcePath: "/home/u/.pio/.pi", mode: "rw" },
        { sourcePath: "/home/u/dev/myrepo", mode: "rw" },
      ],
      env: [
        { key: "HOME", value: "/home/u" },
        {
          key: "PATH",
          value:
            "/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        },
        { key: "PI_SANDBOX", value: "1" },
        { key: "PI_CODING_AGENT_DIR", value: "/home/u/.pio/.pi/agent" },
      ],
      chdir: "/home/u/dev/myrepo",
      target: {
        executable: PKG_BIN,
        args: [
          "probe",
          "--sessions-root",
          "/home/u/.pio/projects/u-dev-myrepo/engagements/e1/.sessions",
        ],
      },
    });
  });

  it("is deterministic: equal inputs + equal FsView ⇒ deep-equal outputs", () => {
    const a = renderProfile(baseInput({ fsView: anchorFake().view }));
    const b = renderProfile(baseInput({ fsView: anchorFake().view }));
    expect(a).toEqual(b);
  });

  it("default PATH carries <runtimeDir>/bin TWICE (no dedup anywhere — parity)", () => {
    const profile = renderProfile(baseInput({ fsView: anchorFake().view }));
    const segments = profile.env[1].value.split(":");
    expect(segments.filter((s) => s === "/usr/local/bin")).toHaveLength(2);
  });
});

describe("composition order", () => {
  it("always-ro system set occupies the first positions (fixed literal order)", () => {
    const fake = makeFake({
      existing: [
        "/etc/ssl",
        "/etc/resolv.conf",
        "/usr/local",
        "/home/u/dev/myrepo",
      ],
    });
    const profile = renderProfile(
      baseInput({ fsView: fake.view, includePioState: false }),
    );
    expect(profile.mounts.slice(0, 3)).toEqual([
      { sourcePath: "/etc/ssl", mode: "ro" },
      { sourcePath: "/etc/resolv.conf", mode: "ro" },
      { sourcePath: "/usr/local", mode: "ro" },
    ]);
  });

  it("cwd LAST overlays a seeded ro entry when cwd sits under ~/git", () => {
    const fake = makeFake({
      existing: [
        "/etc/ssl",
        "/etc/resolv.conf",
        "/usr/local",
        "/home/u/git",
        "/home/u/git/subproj",
      ],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        cwd: "/home/u/git/subproj",
        mountSources: sources(["~/git"]),
        includePioState: false,
      }),
    );
    const gitIdx = profile.mounts.findIndex(
      (m) => m.sourcePath === "/home/u/git" && m.mode === "ro",
    );
    const cwdIdx = profile.mounts.findIndex(
      (m) => m.sourcePath === "/home/u/git/subproj" && m.mode === "rw",
    );
    expect(gitIdx).toBeGreaterThanOrEqual(0);
    expect(cwdIdx).toBeGreaterThan(gitIdx);
    // cwd is the FINAL entry (later bind overlays earlier — ordering is security)
    expect(profile.mounts.at(-1)).toEqual({
      sourcePath: "/home/u/git/subproj",
      mode: "rw",
    });
  });

  it("slot-rw sits immediately after stateRoot-ro (explicit inputs, overlay order)", () => {
    const fake = anchorFake();
    const profile = renderProfile(baseInput({ fsView: fake.view }));
    const rootIdx = profile.mounts.findIndex(
      (m) => m.sourcePath === "/home/u/.pio" && m.mode === "ro",
    );
    const slotIdx = profile.mounts.findIndex(
      (m) =>
        m.sourcePath === "/home/u/.pio/projects/u-dev-myrepo" &&
        m.mode === "rw",
    );
    expect(rootIdx).toBeGreaterThanOrEqual(0);
    expect(slotIdx).toBe(rootIdx + 1); // AFTER the ro root — overlay semantics
  });

  it("pio-state trio index chain over the anchor render: root-ro < slot-rw < .pi-rw, .pi immediately after the slot, cwd LAST still the final mount", () => {
    const fake = anchorFake();
    const profile = renderProfile(baseInput({ fsView: fake.view }));
    const rootIdx = profile.mounts.findIndex(
      (m) => m.sourcePath === "/home/u/.pio" && m.mode === "ro",
    );
    const slotIdx = profile.mounts.findIndex(
      (m) =>
        m.sourcePath === "/home/u/.pio/projects/u-dev-myrepo" &&
        m.mode === "rw",
    );
    const piIdx = profile.mounts.findIndex(
      (m) => m.sourcePath === "/home/u/.pio/.pi" && m.mode === "rw",
    );
    expect(rootIdx).toBeGreaterThanOrEqual(0);
    expect(slotIdx).toBe(rootIdx + 1); // AFTER the ro root — overlay semantics
    expect(piIdx).toBe(slotIdx + 1); // declared AFTER the slot, BEFORE cwd
    // The final mount is still the cwd-last rw entry (ordering is security)
    expect(profile.mounts.at(-1)).toEqual({
      sourcePath: "/home/u/dev/myrepo",
      mode: "rw",
    });
  });

  it("pio-state-off fixture mode omits the state-trio entirely (A+B+D only; env quartet still emits)", () => {
    const fake = anchorFake();
    const profile = renderProfile(
      baseInput({ fsView: fake.view, includePioState: false }),
    );
    expect(
      profile.mounts.some((m) => m.sourcePath.startsWith("/home/u/.pio")),
    ).toBe(false);
    // A(3) + B(19) + D(1) = 23 (the seeded table lost one row)
    expect(profile.mounts).toHaveLength(23);
    // The env quartet is UNCONDITIONAL — section C gone, quartet intact
    expect(profile.env.map((e) => e.key)).toEqual([
      "HOME",
      "PATH",
      "PI_SANDBOX",
      "PI_CODING_AGENT_DIR",
    ]);
    expect(profile.mounts.at(-1)).toEqual({
      sourcePath: "/home/u/dev/myrepo",
      mode: "rw",
    });
  });

  it("keeps duplicate paths in declaration order (no dedup, ever)", () => {
    const fake = makeFake({
      existing: ["/dup/a", "/dup/b", "/home/u/dev/myrepo"],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["/dup/a", "/dup/a", "/dup/b"]),
        includePioState: false,
      }),
    );
    const ordered = profile.mounts.map((m) => m.sourcePath);
    const idxA = ordered.indexOf("/dup/a");
    const idxASecond = ordered.indexOf("/dup/a", idxA + 1);
    const idxB = ordered.indexOf("/dup/b");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxASecond).toBe(idxA + 1); // second copy directly after the first
    expect(idxB).toBe(idxASecond + 1); // declaration order preserved
  });

  it("composes B sections in order readOnly → readWrite → extraMounts, modes per flag", () => {
    const fake = makeFake({
      existing: ["/home/u/dev/myrepo", "/s/ro", "/s/rw", "/s/em1", "/s/em2"],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(
          ["/s/ro"],
          ["/s/rw"],
          [{ path: "/s/em1" }, { path: "/s/em2", readOnly: true }],
        ),
        includePioState: false,
      }),
    );
    const tail = profile.mounts
      .slice(-5)
      .map((m) => `${m.sourcePath}:${m.mode}`);
    expect(tail).toEqual([
      "/s/ro:ro",
      "/s/rw:rw",
      "/s/em1:rw",
      "/s/em2:ro",
      "/home/u/dev/myrepo:rw",
    ]);
  });
});

describe("tilde expansion (fixed matrix, not inherited)", () => {
  it("bare `~` expands to home", () => {
    const fake = makeFake({ existing: ["/home/u", "/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["~"]),
        includePioState: false,
      }),
    );
    expect(profile.mounts).toContainEqual({
      sourcePath: "/home/u",
      mode: "ro",
    });
  });

  it("`~/x` expands against home", () => {
    const fake = makeFake({ existing: ["/home/u/x", "/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["~/x"]),
        includePioState: false,
      }),
    );
    expect(profile.mounts).toContainEqual({
      sourcePath: "/home/u/x",
      mode: "ro",
    });
  });

  it("~user/x is refused with a typed error naming the entry", () => {
    const err = (() => {
      try {
        renderProfile(
          baseInput({
            mountSources: sources(["~user/x"]),
            includePioState: false,
          }),
        );
        return undefined;
      } catch (e) {
        return e as SandboxRenderError;
      }
    })();
    expect(err).toBeInstanceOf(SandboxRenderError);
    expect(err?.reason).toBe("invalid-tilde-entry");
    expect(err?.message).toContain("~user/x");
  });

  it("double tilde ~~x is refused (same error class, entry named)", () => {
    expect(() =>
      renderProfile(
        baseInput({
          mountSources: sources(["~~x"]),
          includePioState: false,
        }),
      ),
    ).toThrowError(SandboxRenderError);
    try {
      renderProfile(
        baseInput({
          mountSources: sources(["~~x"]),
          includePioState: false,
        }),
      );
    } catch (e) {
      expect((e as SandboxRenderError).reason).toBe("invalid-tilde-entry");
      expect((e as SandboxRenderError).message).toContain("~~x");
    }
  });

  it("mid-path `~` is literal (only a LEADING tilde counts)", () => {
    const fake = makeFake({ existing: ["/a/~b", "/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["/a/~b"]),
        includePioState: false,
      }),
    );
    expect(profile.mounts).toContainEqual({
      sourcePath: "/a/~b",
      mode: "ro",
    });
  });

  it("expands envBasePath elements per-element", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
        envBasePath: ["~/.pyenv/bin", "/custom"],
      }),
    );
    expect(profile.env[1]).toEqual({
      key: "PATH",
      value: "/rt/bin:/home/u/.pyenv/bin:/custom",
    });
  });

  it("~user element in envBasePath is refused with a typed error naming the element", () => {
    const err = (() => {
      try {
        renderProfile(
          baseInput({
            fsView: makeFake({ existing: ["/home/u/dev/myrepo"] }).view,
            mountSources: sources([]),
            includePioState: false,
            runtimeDir: "/rt",
            envBasePath: ["~svc/bin"],
          }),
        );
        return undefined;
      } catch (e) {
        return e as SandboxRenderError;
      }
    })();
    expect(err).toBeInstanceOf(SandboxRenderError);
    expect(err?.reason).toBe("invalid-tilde-entry");
    expect(err?.message).toContain("~svc/bin");
  });
});

describe("PATH join value", () => {
  it("STANDARD_PATH_BASE is exactly the standard six", () => {
    expect(STANDARD_PATH_BASE).toEqual([
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin",
    ]);
  });

  it("drops empty elements (joined around them)", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
        envBasePath: ["/a", "", "/b"],
      }),
    );
    expect(profile.env[1]).toEqual({ key: "PATH", value: "/rt/bin:/a:/b" });
  });

  it("empty-after-drop yields the runtime bin with NO trailing colon", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
        envBasePath: ["", ""],
      }),
    );
    expect(profile.env[1]).toEqual({ key: "PATH", value: "/rt/bin" });
  });
});

describe("glob handling (uniform pipeline)", () => {
  it("no-match contributes NOTHING (nullglob parity), pattern post-expansion", () => {
    const fake = makeFake({
      existing: ["/home/u/dev/myrepo", "/g/other"],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["~/g/nothing*"]),
        includePioState: false,
      }),
    );
    expect(profile.mounts.some((m) => m.sourcePath.startsWith("/g/"))).toBe(
      false,
    );
    // the EXPANDED pattern reached the view (tilde applied before wildcard detect)
    expect(
      fake.calls.filter(
        (c) => c.method === "glob" && c.arg === "/home/u/g/nothing*",
      ),
    ).toHaveLength(1);
  });

  it("multi-match keeps the EXACT sorted order as returned by the view (as-is)", () => {
    const fake = makeFake({
      existing: ["/home/u/dev/myrepo"],
      globs: { "/home/u/m/*.txt": ["/home/u/m/b.txt", "/home/u/m/a.txt"] },
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["~/m/*.txt"]),
        includePioState: false,
      }),
    );
    const matched = profile.mounts.filter((m) =>
      m.sourcePath.startsWith("/home/u/m/"),
    );
    // taken AS-IS from the view (the view owns sorting; no re-sort/re-order here)
    expect(matched.map((m) => m.sourcePath)).toEqual([
      "/home/u/m/b.txt",
      "/home/u/m/a.txt",
    ]);
  });

  it("whitespace-containing pattern is handled ATOMICALLY (arrives unsplit/unmangled)", () => {
    const fake = makeFake({
      existing: ["/home/u/dev/myrepo"],
      globs: {
        "/home/u/pro js/asset pack*": ["/home/u/pro js/asset pack1.txt"],
      },
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["~/pro js/asset pack*"]),
        includePioState: false,
      }),
    );
    const globCalls = fake.calls.filter((c) => c.method === "glob");
    expect(globCalls).toHaveLength(1); // one atomic pattern, never split into words
    expect(globCalls[0].arg).toBe("/home/u/pro js/asset pack*");
    expect(profile.mounts).toContainEqual({
      sourcePath: "/home/u/pro js/asset pack1.txt",
      mode: "ro",
    });
  });

  it("wildcard detection runs on the EXPANDED text (only * ? [ trigger glob)", () => {
    const fake = makeFake({
      existing: ["/home/u/literal name", "/home/u/dev/myrepo"],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["~/literal name"]),
        includePioState: false,
      }),
    );
    // space alone is NOT a wildcard: literal exists-check path, not glob
    expect(fake.calls.filter((c) => c.method === "glob")).toHaveLength(0);
    expect(profile.mounts).toContainEqual({
      sourcePath: "/home/u/literal name",
      mode: "ro",
    });
  });
});

describe("fail-loud vs parity-skip matrix", () => {
  const C_ROOT = "/home/u/.pio";
  const C_SLOT = "/home/u/.pio/projects/u-dev-myrepo";
  const C_PI = "/home/u/.pio/.pi";

  it("missing cwd is a TYPED REFUSAL (chdir cannot degrade silently)", () => {
    const fake = anchorFake(); // A/B/C exist; D does not
    try {
      renderProfile(baseInput({ fsView: fake.view, cwd: "/absent/cwd" }));
      throw new Error("expected SandboxRenderError");
    } catch (e) {
      expect(e).toBeInstanceOf(SandboxRenderError);
      expect((e as SandboxRenderError).reason).toBe("cwd-missing");
      expect((e as SandboxRenderError).message).toContain("/absent/cwd");
    }
  });

  it("missing stateRoot with pio-state ON refuses, naming the missing root", () => {
    const fake = anchorFake();
    fake.existing.delete(C_ROOT);
    fake.existing.delete(C_SLOT);
    try {
      renderProfile(baseInput({ fsView: fake.view }));
      throw new Error("expected SandboxRenderError");
    } catch (e) {
      expect(e).toBeInstanceOf(SandboxRenderError);
      expect((e as SandboxRenderError).reason).toBe("normative-path-missing");
      expect((e as SandboxRenderError).message).toContain(C_ROOT);
    }
  });

  it("missing slot (stateRoot present) refuses, naming the slot", () => {
    const fake = anchorFake();
    fake.existing.delete(C_SLOT);
    try {
      renderProfile(baseInput({ fsView: fake.view }));
      throw new Error("expected SandboxRenderError");
    } catch (e) {
      expect(e).toBeInstanceOf(SandboxRenderError);
      expect((e as SandboxRenderError).reason).toBe("normative-path-missing");
      expect((e as SandboxRenderError).message).toContain(C_SLOT);
    }
  });

  it("missing .pi (root + slot present) is a TYPED REFUSAL naming the path (normative — NOT a silent skip)", () => {
    const fake = anchorFake();
    fake.existing.delete(C_PI);
    try {
      renderProfile(baseInput({ fsView: fake.view }));
      throw new Error("expected SandboxRenderError");
    } catch (e) {
      expect(e).toBeInstanceOf(SandboxRenderError);
      expect((e as SandboxRenderError).reason).toBe("normative-path-missing");
      expect((e as SandboxRenderError).message).toContain(C_PI);
    }
  });

  it("both gaps BYPASSED with pio-state OFF (availability parity returns)", () => {
    const fake = anchorFake();
    fake.existing.delete(C_ROOT);
    fake.existing.delete(C_SLOT);
    const profile = renderProfile(
      baseInput({ fsView: fake.view, includePioState: false }),
    );
    expect(
      profile.mounts.some((m) => [C_ROOT, C_SLOT].includes(m.sourcePath)),
    ).toBe(false);
    expect(profile.mounts.at(-1)).toEqual({
      sourcePath: "/home/u/dev/myrepo",
      mode: "rw",
    });
  });
});

describe("exotic-string integrity (no @tsv/line-based stage exists)", () => {
  const EXOTIC = [
    "tab\there",
    "line\nbreak",
    "cr\rhere",
    "c1\u009char",
    "trail ",
    "uni-\u00e9-\ud83d\ude80",
  ];

  it("control chars / unicode survive BYTE-INTACT into the structured output", () => {
    const fake = makeFake({ existing: [...EXOTIC, "/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(EXOTIC),
        includePioState: false,
      }),
    );
    for (const raw of EXOTIC) {
      expect(profile.mounts).toContainEqual({ sourcePath: raw, mode: "ro" });
    }
  });

  it("newline-bearing entries are NEVER split (one entry in = one entry out)", () => {
    const fake = makeFake({
      existing: ["a\nb\nc", "/home/u/dev/myrepo"],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(["a\nb\nc"]),
        includePioState: false,
      }),
    );
    const matching = profile.mounts.filter((m) => m.sourcePath.includes("\n"));
    expect(matching).toHaveLength(1);
    expect(matching[0].sourcePath).toBe("a\nb\nc");
  });

  it("env-relevant values (PATH elements) pass control chars through unsplit", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
        envBasePath: ["/we\nird/bin"],
      }),
    );
    expect(profile.env[1]).toEqual({
      key: "PATH",
      value: "/rt/bin:/we\nird/bin",
    });
  });
});

describe("uid/gid computation (computed — never hardcoded)", () => {
  it("injected {4242,1337} lands in baseFlags AND the /run/user/4242 table rows", () => {
    const fake = makeFake({
      existing: [
        "/run/user/4242/gnupg",
        "/run/user/4242/bus",
        "/home/u/dev/myrepo",
      ],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        identity: { uid: 4242, gid: 1337 },
        includePioState: false,
      }),
    );
    const bf = profile.baseFlags;
    expect(bf[bf.indexOf("--uid") + 1]).toBe("4242");
    expect(bf[bf.indexOf("--gid") + 1]).toBe("1337");
    expect(profile.mounts).toContainEqual({
      sourcePath: "/run/user/4242/gnupg",
      mode: "ro",
    });
    expect(profile.mounts).toContainEqual({
      sourcePath: "/run/user/4242/bus",
      mode: "ro",
    });
    // proof the 1000 is computed, not hardcoded:
    expect(
      profile.mounts.some((m) => m.sourcePath.includes("/run/user/1000")),
    ).toBe(false);
  });

  it("DEFAULT identity equals process.getuid()/getgid() (dynamic, per call)", () => {
    const uidOf = process.getuid;
    const gidOf = process.getgid;
    if (typeof uidOf !== "function" || typeof gidOf !== "function") {
      throw new Error("POSIX host required for this row");
    }
    const uid = uidOf();
    const gid = gidOf();
    if (uid === undefined || gid === undefined) {
      throw new Error("POSIX host required for this row");
    }
    const fake = makeFake({
      existing: [
        `/run/user/${uid}/gnupg`,
        `/run/user/${uid}/bus`,
        "/home/u/dev/myrepo",
      ],
    });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        identity: undefined, // default: process identity, lazily computed
        includePioState: false,
      }),
    );
    const bf = profile.baseFlags;
    expect(bf[bf.indexOf("--uid") + 1]).toBe(String(uid));
    expect(bf[bf.indexOf("--gid") + 1]).toBe(String(gid));
    // the default conservative table derives its /run/user rows from the SAME uid
    expect(profile.mounts).toContainEqual({
      sourcePath: `/run/user/${uid}/gnupg`,
      mode: "ro",
    });
    expect(profile.mounts).toContainEqual({
      sourcePath: `/run/user/${uid}/bus`,
      mode: "ro",
    });
  });
});

describe("no-merge (the profile IS the entire configuration)", () => {
  function renderWith(readOnly: string[], extra: Partial<RenderInput> = {}) {
    const fake = makeFake({
      existing: [...readOnly, "/home/u/dev/myrepo"],
    });
    return renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources(readOnly),
        includePioState: false,
        ...extra,
      }),
    );
  }

  it("foreign SOURCE entries never appear in another input's render", () => {
    const a = renderWith(["/only/a"]);
    const b = renderWith(["/only/b"]);
    expect(a.mounts.some((m) => m.sourcePath === "/only/b")).toBe(false);
    expect(b.mounts.some((m) => m.sourcePath === "/only/a")).toBe(false);
  });

  it("foreign PATH-base values never blend into another render's env", () => {
    const a = renderWith([], { envBasePath: ["/pa"] });
    const b = renderWith([], { envBasePath: ["/pb"] });
    expect(a.env[1].value).toContain("/pa");
    expect(a.env[1].value).not.toContain("/pb");
    expect(b.env[1].value).toContain("/pb");
    expect(b.env[1].value).not.toContain("/pa");
  });

  it("capability names stay scoped to their own target command", () => {
    const fakeA = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const fakeB = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const a = renderProfile(
      baseInput({
        fsView: fakeA.view,
        capabilityName: "alpha",
        mountSources: sources([]),
        includePioState: false,
      }),
    );
    const b = renderProfile(
      baseInput({
        fsView: fakeB.view,
        capabilityName: "beta",
        mountSources: sources([]),
        includePioState: false,
      }),
    );
    expect(a.target.args).toContain("alpha");
    expect(a.target.args).not.toContain("beta");
    expect(b.target.args).toContain("beta");
    expect(b.target.args).not.toContain("alpha");
  });
});

describe("env quartet + chdir contract", () => {
  it("emits EXACTLY four pairs in HOME→PATH→PI_SANDBOX→PI_CODING_AGENT_DIR order; chdir === cwd", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
      }),
    );
    expect(profile.env).toHaveLength(4);
    expect(profile.env.map((e) => e.key)).toEqual([
      "HOME",
      "PATH",
      "PI_SANDBOX",
      "PI_CODING_AGENT_DIR",
    ]);
    expect(profile.env[0].value).toBe("/home/u");
    expect(profile.env[2]).toEqual({ key: "PI_SANDBOX", value: "1" });
    expect(profile.env[3]).toEqual({
      key: "PI_CODING_AGENT_DIR",
      value: "/home/u/.pio/.pi/agent",
    });
    expect(profile.chdir).toBe("/home/u/dev/myrepo");
  });

  it("PI_CODING_AGENT_DIR follows the state-root input (override-shaped root ⇒ the derived value follows)", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        stateRoot: "/custom/pio-state",
        projectSlot: "/custom/pio-state/projects/k",
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
      }),
    );
    expect(profile.env[3]).toEqual({
      key: "PI_CODING_AGENT_DIR",
      value: "/custom/pio-state/.pi/agent",
    });
  });

  it("passes HOME through unmodified (byte-intact, even exotic values)", () => {
    const fake = makeFake({ existing: ["/home/u/dev/myrepo"] });
    const profile = renderProfile(
      baseInput({
        fsView: fake.view,
        home: "/Ho me\t🚀",
        mountSources: sources([]),
        includePioState: false,
        runtimeDir: "/rt",
      }),
    );
    expect(profile.env[0].value).toBe("/Ho me\t🚀");
  });
});

describe("profile.ts — conservative default table", () => {
  it("mirrors the inventory read side verbatim (19 readOnly rows, exact order)", () => {
    const t = conservativeDefaultSources(1000);
    expect(t.readOnly).toEqual([
      "/usr",
      "/lib",
      "/lib64",
      "/bin",
      "~/.gitconfig",
      "~/.vscode/extensions/pi0.pi-vscode*",
      "~/git",
      "~/.config",
      "~/.ssh",
      "~/.pyenv",
      "~/.cache/pypoetry",
      "/opt/google/chrome",
      "/etc/alternatives",
      "/etc/java-21-openjdk",
      "/etc/maven",
      "/etc/passwd",
      "/run/user/1000/gnupg",
      "/run/user/1000/bus",
      "~/.local/bin",
    ]);
  });

  it("computes /run/user/<uid>/* from the argument (pure function of uid)", () => {
    const t = conservativeDefaultSources(4242);
    expect(t.readOnly[16]).toBe("/run/user/4242/gnupg");
    expect(t.readOnly[17]).toBe("/run/user/4242/bus");
    expect(t.readOnly.some((row) => row.includes("/run/user/1000"))).toBe(
      false,
    ); // no hardcoded 1000 anywhere
  });

  it("seeds NO personal readWrite/extraMounts entries (deliberate omission)", () => {
    const t = conservativeDefaultSources(1000);
    expect(t.readWrite).toEqual([]);
    expect(t.extraMounts).toEqual([]);
  });

  it("is deterministic: equal uid ⇒ deep-equal tables", () => {
    expect(conservativeDefaultSources(7)).toEqual(
      conservativeDefaultSources(7),
    );
  });
});

describe("target command shape", () => {
  it("honors a custom targetExecutable", () => {
    const profile = renderProfile(
      baseInput({
        fsView: makeFake({ existing: ["/home/u/dev/myrepo"] }).view,
        mountSources: sources([]),
        includePioState: false,
        targetExecutable: "/x/y",
      }),
    );
    expect(profile.target.executable).toBe("/x/y");
    // args grammar unaffected by the executable swap
    expect(profile.target.args).toEqual([
      "probe",
      "--sessions-root",
      "/home/u/.pio/projects/u-dev-myrepo/engagements/e1/.sessions",
    ]);
  });

  it("follows capability + engagementDir into the args (grammar shape)", () => {
    const profile = renderProfile(
      baseInput({
        fsView: makeFake({ existing: ["/home/u/dev/myrepo"] }).view,
        mountSources: sources([]),
        includePioState: false,
        capabilityName: "alpha",
        engagementDir: "/r/.pio/projects/k2/engagements/z9",
      }),
    );
    expect(profile.target.args).toEqual([
      "alpha",
      "--sessions-root",
      "/r/.pio/projects/k2/engagements/z9/.sessions",
    ]);
  });
});
