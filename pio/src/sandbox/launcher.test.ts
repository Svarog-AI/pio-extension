import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BwrapCheck, LaunchChild, SpawnFn } from "./launcher.ts";
import {
  bwrapRefusalLine,
  checkBwrap,
  classifyBwrap,
  isNestedLaunch,
  MIN_BWRAP_VERSION,
  mapChildExit,
  NESTING_REFUSAL_LINE,
  superviseSpawn,
} from "./launcher.ts";
import type { BwrapCommand } from "./profile-serializer.ts";

/** Fixed spawn vector — the bare "bwrap" head plus two flags and a target. */
const CMD: BwrapCommand = {
  argv: ["bwrap", "--unshare-all", "--die-with-parent", "--", "/bin/tool"],
  envSet: [
    ["HOME", "/home/u"],
    ["PI_SANDBOX", "1"],
  ],
  target: { executable: "/bin/tool", args: [] },
};

interface Sink {
  readonly lines: string[];
  stderr(line: string): void;
}

function makeSink(): Sink {
  const lines: string[] = [];
  return { lines, stderr: (line: string) => lines.push(line) };
}

/** Structural mock child — records registered callbacks and kill calls so
 * supervision rows can drive the lifecycle deterministically. */
interface MockChild {
  readonly child: LaunchChild;
  readonly killSignals: string[];
  fireExit(code: number | null, signal: NodeJS.Signals | null): void;
  fireError(err: Error): void;
}

function makeChild(): MockChild {
  const exitCbs: Array<(c: number | null, s: NodeJS.Signals | null) => void> =
    [];
  const errorCbs: Array<(e: Error) => void> = [];
  const killSignals: string[] = [];
  return {
    child: {
      pid: 4242,
      on: (event, cb) => {
        if (event === "exit") {
          exitCbs.push(
            cb as (c: number | null, s: NodeJS.Signals | null) => void,
          );
        } else if (event === "error") {
          errorCbs.push(cb as (e: Error) => void);
        }
      },
      kill: (signal?: NodeJS.Signals) => {
        killSignals.push(String(signal));
        return true;
      },
    },
    killSignals,
    fireExit: (code, signal) => {
      for (const cb of exitCbs) cb(code, signal);
    },
    fireError: (err) => {
      for (const cb of errorCbs) cb(err);
    },
  };
}

const yieldToEvents = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe("classifyBwrap (pure, total — fabricated readings)", () => {
  it("pins the minimum-version constant at [0, 12]", () => {
    expect(MIN_BWRAP_VERSION).toEqual([0, 12]);
  });

  it("ok verdicts echo the resolved path: exact minimum 0.12.0 AND a high version (1.0) both pass with the bit clear", () => {
    const cases: [string, string, BwrapCheck][] = [
      [
        "/opt/tools/bin/bwrap",
        "bubblewrap 0.12.0",
        { ok: true, path: "/opt/tools/bin/bwrap" },
      ],
      [
        "/opt/bin/bwrap",
        "bubblewrap 1.0",
        { ok: true, path: "/opt/bin/bwrap" },
      ],
    ];
    for (const [binaryPath, versionLine, expected] of cases) {
      expect(
        classifyBwrap({ binaryPath, versionLine, setuidBit: false }),
      ).toEqual(expected);
    }
  });

  it("absent: binaryPath undefined ⇒ the absent refusal reason (nothing else observable)", () => {
    expect(classifyBwrap({})).toEqual({ ok: false, reason: "absent" });
    expect(classifyBwrap({ setuidBit: false })).toEqual({
      ok: false,
      reason: "absent",
    });
  });

  it("below minimum: 0.9.0 and 0.11.9 refuse with the RAW version line as detail", () => {
    expect(
      classifyBwrap({
        binaryPath: "/opt/tools/bin/bwrap",
        versionLine: "bubblewrap 0.9.0",
        setuidBit: false,
      }),
    ).toEqual({
      ok: false,
      reason: "version-below-minimum",
      detail: "bubblewrap 0.9.0",
    });
    expect(
      classifyBwrap({
        binaryPath: "/opt/tools/bin/bwrap",
        versionLine: "bubblewrap 0.11.9",
        setuidBit: false,
      }),
    ).toEqual({
      ok: false,
      reason: "version-below-minimum",
      detail: "bubblewrap 0.11.9",
    });
  });

  it("unparseable version output refuses under the SAME reason carrying the raw garbage as detail (total classifier — no parse exception escapes)", () => {
    expect(
      classifyBwrap({
        binaryPath: "/opt/tools/bin/bwrap",
        versionLine: "definitely not a version !!!",
        setuidBit: false,
      }),
    ).toEqual({
      ok: false,
      reason: "version-below-minimum",
      detail: "definitely not a version !!!",
    });
  });

  it("a failed version probe (versionLine undefined) surfaces as the (unreadable) placeholder detail", () => {
    expect(
      classifyBwrap({ binaryPath: "/opt/tools/bin/bwrap", setuidBit: false }),
    ).toEqual({
      ok: false,
      reason: "version-below-minimum",
      detail: "(unreadable)",
    });
  });

  it("setuid bit TRUE with a good version refuses setuid-binary — the bit check beats the ok verdict (fixed order: absent → version → setuid)", () => {
    expect(
      classifyBwrap({
        binaryPath: "/opt/tools/bin/bwrap",
        versionLine: "bubblewrap 0.13.0",
        setuidBit: true,
      }),
    ).toEqual({ ok: false, reason: "setuid-binary" });
  });

  it("setuid bit UNVERIFIABLE (undefined) with a good version refuses CONSERVATIVELY under the same reason, naming the verification failure", () => {
    expect(
      classifyBwrap({
        binaryPath: "/opt/tools/bin/bwrap",
        versionLine: "bubblewrap 0.12.0",
        setuidBit: undefined,
      }),
    ).toEqual({
      ok: false,
      reason: "setuid-binary",
      detail: "could not verify the setuid bit",
    });
  });
});

describe("refusal lines (byte-pinned product strings)", () => {
  it("each of the three failing reasons renders EXACTLY the pinned line (data literals, deep-equal)", () => {
    expect(bwrapRefusalLine({ ok: false, reason: "absent" })).toBe(
      "pio: sandbox unavailable: bwrap binary not found in PATH — install bubblewrap (>= 0.12.0, non-setuid build)",
    );
    expect(
      bwrapRefusalLine({
        ok: false,
        reason: "version-below-minimum",
        detail: "bubblewrap 0.9.0",
      }),
    ).toBe(
      "pio: sandbox unavailable: bwrap bubblewrap 0.9.0 is below the required minimum 0.12.0 — upgrade bubblewrap (0.12.0 fixes unsafe symlink resolution; install non-setuid builds only)",
    );
    expect(
      bwrapRefusalLine({
        ok: false,
        reason: "setuid-binary",
        detail: "could not verify the setuid bit",
      }),
    ).toBe(
      "pio: sandbox unavailable: the bwrap binary carries the setuid bit (could not verify the setuid bit) — install/build bubblewrap WITHOUT setuid (setuid-mode vulnerability classes apply)",
    );
  });

  it("detail substitution: the (unreadable) placeholder flows through verbatim, and the EMPTY-DETAIL setuid form renders WITHOUT the parenthetical", () => {
    expect(
      bwrapRefusalLine({
        ok: false,
        reason: "version-below-minimum",
        detail: "(unreadable)",
      }),
    ).toBe(
      "pio: sandbox unavailable: bwrap (unreadable) is below the required minimum 0.12.0 — upgrade bubblewrap (0.12.0 fixes unsafe symlink resolution; install non-setuid builds only)",
    );
    expect(bwrapRefusalLine({ ok: false, reason: "setuid-binary" })).toBe(
      "pio: sandbox unavailable: the bwrap binary carries the setuid bit — install/build bubblewrap WITHOUT setuid (setuid-mode vulnerability classes apply)",
    );
  });

  it("every rendered refusal is ONE physical line (no embedded newline)", () => {
    const refusals = [
      bwrapRefusalLine({ ok: false, reason: "absent" }),
      bwrapRefusalLine({
        ok: false,
        reason: "version-below-minimum",
        detail: "bubblewrap 0.9.0",
      }),
      bwrapRefusalLine({
        ok: false,
        reason: "setuid-binary",
        detail: "could not verify the setuid bit",
      }),
      NESTING_REFUSAL_LINE,
    ];
    for (const line of refusals) {
      expect(line.includes("\n")).toBe(false);
    }
  });

  it("the anti-nesting refusal deep-equals its pinned literal", () => {
    expect(NESTING_REFUSAL_LINE).toBe(
      "pio: nested sandbox refused: PI_SANDBOX=1 is set — wrapped launches are host-side only; compose plain children inside the namespace instead",
    );
  });
});

describe("isNestedLaunch (exact-value predicate)", () => {
  it('matrix: unset / "" / "0" / "2" / " 1" do NOT trip; the exact value "1" trips', () => {
    const rows: [Record<string, string | undefined>, boolean][] = [
      [{}, false],
      [{ PI_SANDBOX: "" }, false],
      [{ PI_SANDBOX: "0" }, false],
      [{ PI_SANDBOX: "2" }, false],
      [{ PI_SANDBOX: " 1" }, false],
      [{ PI_SANDBOX: "1" }, true],
    ];
    for (const [env, expected] of rows) {
      expect(isNestedLaunch(env)).toBe(expected);
    }
  });
});

describe("mapChildExit (pure exit map)", () => {
  it("table: 0→0 · 130→130 · 1→1 · 42→1 · (null, SIGTERM)→1 · (null, SIGKILL)→1", () => {
    const rows: [number | null, NodeJS.Signals | null, number][] = [
      [0, null, 0],
      [130, null, 130],
      [1, null, 1],
      [42, "SIGTERM", 1],
      [null, "SIGTERM", 1],
      [null, "SIGKILL", 1],
    ];
    for (const [code, signal, expected] of rows) {
      expect(mapChildExit(code, signal)).toBe(expected);
    }
  });
});

describe("superviseSpawn (mock spawner + structural child seam)", () => {
  it('spawns cmd.argv[0] with argv.slice(1) and { stdio: "inherit" } ONLY — no env key anywhere in the options', async () => {
    const seen: {
      file?: string;
      args?: readonly string[];
      opts?: Record<string, unknown>;
    } = {};
    const mock = makeChild();
    const spawn: SpawnFn = (file, args, opts) => {
      seen.file = file;
      seen.args = [...args];
      seen.opts = { ...opts };
      queueMicrotask(() => mock.fireExit(0, null));
      return mock.child;
    };
    const code = await superviseSpawn(CMD, spawn, makeSink());
    expect(code).toBe(0);
    expect(seen.file).toBe("bwrap");
    expect(seen.args).toEqual(CMD.argv.slice(1));
    expect(seen.opts).toEqual({ stdio: "inherit" });
    expect("env" in (seen.opts ?? {})).toBe(false);
  });

  it("exit codes flow through the map (0/130/7/null-SIGKILL → 0/130/1/1) and NO extra stderr line is emitted on any settlement, signal deaths included", async () => {
    const rows: [number | null, NodeJS.Signals | null, number][] = [
      [0, null, 0],
      [130, null, 130],
      [7, null, 1],
      [null, "SIGKILL", 1],
    ];
    for (const [code, signal, mapped] of rows) {
      const mock = makeChild();
      const spawn: SpawnFn = () => {
        queueMicrotask(() => mock.fireExit(code, signal));
        return mock.child;
      };
      const sink = makeSink();
      expect(await superviseSpawn(CMD, spawn, sink)).toBe(mapped);
      expect(sink.lines).toEqual([]);
    }
  });

  it("the spawn ERROR event yields exactly ONE `pio: sandbox launch failed: …` line and resolves 1; a late exit after settlement adds nothing", async () => {
    const mock = makeChild();
    const spawn: SpawnFn = () => mock.child;
    const sink = makeSink();
    const pending = superviseSpawn(CMD, spawn, sink);
    await yieldToEvents();
    mock.fireError(new Error("ENOEXEC: bad magic"));
    await expect(pending).resolves.toBe(1);
    expect(sink.lines).toEqual([
      "pio: sandbox launch failed: ENOEXEC: bad magic",
    ]);
    // Late exit after the error settled: guarded — still exactly one line.
    mock.fireExit(0, null);
    expect(sink.lines).toHaveLength(1);
  });

  it("a spawner that THROWS (child could not even start) degrades to one readable line + 1 — it NEVER rejects", async () => {
    const spawn: SpawnFn = () => {
      throw new Error("ENOSYS: cannot start child");
    };
    const sink = makeSink();
    await expect(superviseSpawn(CMD, spawn, sink)).resolves.toBe(1);
    expect(sink.lines).toEqual([
      "pio: sandbox launch failed: ENOSYS: cannot start child",
    ]);
  });

  it('host SIGTERM during the spawn window forwards kill("SIGTERM") to the child; the child\'s signal death resolves the mapped 1', async () => {
    const before = process.listeners("SIGTERM");
    const mock = makeChild();
    const spawn: SpawnFn = () => mock.child;
    const pending = superviseSpawn(CMD, spawn, makeSink());
    await yieldToEvents();
    const during = process.listeners("SIGTERM");
    expect(during.length).toBe(before.length + 1);
    (during[during.length - 1] as () => void)();
    expect(mock.killSignals).toEqual(["SIGTERM"]);
    mock.fireExit(null, "SIGTERM");
    await expect(pending).resolves.toBe(1);
  });

  it("listener lifetime: the SIGTERM handler is DEREGISTERED when the child settles — the process-level routing returns to its pre-spawn baseline, so a later SIGTERM cannot reach this call's child again", async () => {
    const before = process.listeners("SIGTERM");
    const mock = makeChild();
    const spawn: SpawnFn = () => {
      queueMicrotask(() => mock.fireExit(0, null));
      return mock.child;
    };
    const code = await superviseSpawn(CMD, spawn, makeSink());
    expect(code).toBe(0);
    expect(process.listeners("SIGTERM")).toEqual(before);
    // The process no longer routes SIGTERM to the supervision handler —
    // dispatching a real signal would invoke whatever predates us, so the
    // baseline identity above IS the leak proof: zero added listeners remain.
    expect(mock.killSignals).toEqual([]);
  });
});

describe("checkBwrap default wiring (tmpdir fixture scripts named bwrap — never the real binary)", () => {
  async function writeFixtureScript(
    base: string,
    name: string,
    body: string,
  ): Promise<string> {
    const target = path.join(base, name);
    await writeFile(target, body);
    return target;
  }

  it("resolves a fixture bwrap from a temp PATH, runs it exactly ONCE for the version capture, and classifies ok echoing the fixture path", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "pio-launcher-ok-"));
    const binDir = path.join(base, "bin");
    await mkdir(binDir, { recursive: true });
    await writeFixtureScript(
      binDir,
      "bwrap",
      `#!/bin/sh\necho ran >> ${JSON.stringify(path.join(base, "ran.log"))}\nprintf 'bubblewrap 0.12.1\\n'\n`,
    );
    await chmod(path.join(binDir, "bwrap"), 0o755);
    const check = await checkBwrap({ PATH: binDir });
    expect(check).toEqual({ ok: true, path: path.join(binDir, "bwrap") });
    // Exactly one execution landed in OUR counter file — the system binary
    // could not have written there, so it was provably never executed.
    const log = await readFile(path.join(base, "ran.log"), "utf8");
    expect(log.split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("follows a SYMLINK named bwrap to the fixture script (follow-link resolution)", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "pio-launcher-sym-"));
    const binDir = path.join(base, "bin");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      path.join(base, "real.sh"),
      "#!/bin/sh\nprintf 'bubblewrap 0.12.0\\n'\n",
    );
    await chmod(path.join(base, "real.sh"), 0o755);
    await symlink("../real.sh", path.join(binDir, "bwrap"));
    const check = await checkBwrap({ PATH: binDir });
    expect(check).toEqual({ ok: true, path: path.join(binDir, "bwrap") });
  });

  it("reports absent for an empty PATH, a pointless PATH, and an UNSET PATH", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "pio-launcher-absent-"));
    await mkdir(path.join(base, "nowhere"), { recursive: true });
    expect(await checkBwrap({ PATH: "" })).toEqual({
      ok: false,
      reason: "absent",
    });
    expect(await checkBwrap({ PATH: ":" })).toEqual({
      ok: false,
      reason: "absent",
    });
    expect(await checkBwrap({ PATH: path.join(base, "nowhere") })).toEqual({
      ok: false,
      reason: "absent",
    });
    expect(await checkBwrap({})).toEqual({ ok: false, reason: "absent" });
  });

  it("reports setuid-binary for a fixture script chmod u+s (the setuid bit is read via stat on the resolved path)", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "pio-launcher-setuid-"));
    const binDir = path.join(base, "bin");
    await mkdir(binDir, { recursive: true });
    await writeFixtureScript(
      binDir,
      "bwrap",
      "#!/bin/sh\nprintf 'bubblewrap 0.12.1\\n'\n",
    );
    await chmod(path.join(binDir, "bwrap"), 0o4755);
    const check = await checkBwrap({ PATH: binDir });
    expect(check).toEqual({ ok: false, reason: "setuid-binary" });
  });

  it("reports version-below-minimum for a FAILING fixture ((unreadable) detail) and a GARBAGE-output fixture (raw line detail)", async () => {
    const failBase = await mkdtemp(
      path.join(os.tmpdir(), "pio-launcher-fail-"),
    );
    await writeFixtureScript(failBase, "bwrap", "#!/bin/sh\nexit 3\n");
    await chmod(path.join(failBase, "bwrap"), 0o755);
    expect(await checkBwrap({ PATH: failBase })).toEqual({
      ok: false,
      reason: "version-below-minimum",
      detail: "(unreadable)",
    });
    const garbBase = await mkdtemp(
      path.join(os.tmpdir(), "pio-launcher-garb-"),
    );
    await writeFixtureScript(
      garbBase,
      "bwrap",
      "#!/bin/sh\nprintf 'this is not a version\\n'\n",
    );
    await chmod(path.join(garbBase, "bwrap"), 0o755);
    expect(await checkBwrap({ PATH: garbBase })).toEqual({
      ok: false,
      reason: "version-below-minimum",
      detail: "this is not a version",
    });
  });
});
