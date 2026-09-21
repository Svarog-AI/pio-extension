import { mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TtyStream } from "../probe.ts";
import { TTY_REFUSAL_LINE } from "../probe.ts";
import { nodeFsView } from "./fsview.ts";
import type { BwrapCheck, SpawnFn } from "./launcher.ts";
import { bwrapRefusalLine, NESTING_REFUSAL_LINE } from "./launcher.ts";
import { deriveProjectKey, mintEngagementId } from "./layout.ts";
import {
  buildArgv,
  formatProfileLines,
  PROFILE_FILE_NAME,
  serializeProfile,
} from "./profile-serializer.ts";
import { renderProfile } from "./render.ts";
import type { RunIO, RunSeams } from "./run.ts";
import { runCapability } from "./run.ts";

/** Fixed engagement-id seams — exact id pinning without real clock/entropy. */
const FIXED_NOW = Date.UTC(2026, 8, 20, 19, 32, 32, 123);
const FIXED_ENTROPY = "deadbeef";
const FIXED_ID = "20260920T193232123Z-deadbeef";
const OK_CHECK: BwrapCheck = { ok: true, path: "/opt/tools/bin/bwrap" };

type Entry =
  | { readonly kind: "print"; readonly line: string }
  | {
      readonly kind: "spawn";
      readonly file: string;
      readonly args: string[];
      readonly opts: Record<string, unknown>;
    };

/** Structurally minimal mock child — settles only when told to. */
function makeChild() {
  const exitCbs: Array<(c: number | null, s: NodeJS.Signals | null) => void> =
    [];
  return {
    child: {
      pid: 777,
      on: (event: "exit" | "error", cb: unknown) => {
        if (event === "exit") {
          exitCbs.push(
            cb as (c: number | null, s: NodeJS.Signals | null) => void,
          );
        }
      },
      kill: () => true,
    } as unknown as import("./launcher.ts").LaunchChild,
    fireExit: (code: number | null, signal: NodeJS.Signals | null) => {
      for (const cb of exitCbs) cb(code, signal);
    },
  };
}

interface WorldOpts {
  /** Direct children to create inside the fake $HOME. */
  readonly homeEntries?: readonly string[];
  /** Replace the fake launch cwd. */
  readonly cwdOverride?: string;
  /** Point the launch cwd at a NONEXISTENT directory (render-fault rows). */
  readonly cwdMissing?: boolean;
  readonly piSandbox?: string;
  readonly ttyInput?: TtyStream;
  readonly ttyOutput?: TtyStream;
  /** Preflight verdict injected through the check seam. */
  readonly checkResult?: BwrapCheck;
  /** Fault the check seam with (a typed catch must NOT apply here). */
  readonly checkThrows?: Error | string;
  /** Child exit the fake spawner settles with. */
  readonly childExit?: readonly [number | null, NodeJS.Signals | null];
}

interface World {
  readonly base: string;
  readonly stateRoot: string;
  readonly home: string;
  readonly cwd: string;
  readonly key: string;
  readonly id: string;
  readonly projectSlot: string;
  readonly engagementDir: string;
  readonly sessionsDir: string;
  /** Every line the sink received, in order. */
  readonly lines: string[];
  /** Ordered side-effect capture log (prints + spawn). */
  readonly log: Entry[];
  /** One entry per pre-flight invocation through the seam (live array —
   * a primitive counter captured by value at return would freeze at 0). */
  readonly checks: unknown[];
  readonly seams: RunSeams;
  readonly io: RunIO;
}

async function makeWorld(opts: WorldOpts = {}): Promise<World> {
  const base = await mkdtemp(path.join(os.tmpdir(), "pio-run-"));
  const stateRoot = path.join(base, "state");
  await mkdir(stateRoot, { recursive: true });
  const home = path.join(base, "home");
  await mkdir(home, { recursive: true });
  for (const entry of opts.homeEntries ?? []) {
    await mkdir(path.join(home, entry), { recursive: true });
  }
  const cwd =
    opts.cwdOverride ??
    (opts.cwdMissing
      ? path.join(base, "absent-cwd")
      : path.join(base, "workdir"));
  if (!opts.cwdMissing && opts.cwdOverride === undefined) {
    await mkdir(cwd, { recursive: true });
  }
  let key = "";
  try {
    key = deriveProjectKey(cwd);
  } catch {
    // All-slash cwd rows: derivation throws by design; the path handles
    // below stay inert for those rows (only the refusal is asserted).
  }
  const id = mintEngagementId({
    now: () => FIXED_NOW,
    entropy: () => FIXED_ENTROPY,
  });
  expect(id).toBe(FIXED_ID);
  const projectSlot = path.join(stateRoot, "projects", key);
  const engagementDir = path.join(projectSlot, "engagements", id);
  const sessionsDir = path.join(engagementDir, ".sessions");

  const lines: string[] = [];
  const log: Entry[] = [];
  const checks: unknown[] = [];
  const [exitCode, exitSignal] = opts.childExit ?? [0, null];
  const spawn: SpawnFn = (file, args, optsSpawn) => {
    log.push({
      kind: "spawn",
      file,
      args: [...args],
      opts: { ...optsSpawn },
    });
    const mock = makeChild();
    queueMicrotask(() => mock.fireExit(exitCode, exitSignal));
    return mock.child;
  };
  const check = async (): Promise<BwrapCheck> => {
    checks.push(undefined);
    if (opts.checkThrows !== undefined) throw opts.checkThrows;
    return opts.checkResult ?? OK_CHECK;
  };
  const env: Record<string, string | undefined> = { PIO_STATE_DIR: stateRoot };
  if (opts.piSandbox !== undefined) env.PI_SANDBOX = opts.piSandbox;
  const seams: RunSeams = {
    env,
    home,
    cwd,
    tty: {
      input: opts.ttyInput ?? { isTTY: true },
      output: opts.ttyOutput ?? { isTTY: true },
    },
    fsView: nodeFsView,
    check,
    spawn,
    now: () => FIXED_NOW,
    entropy: () => FIXED_ENTROPY,
  };
  const io: RunIO = {
    stderr: (line: string) => {
      lines.push(line);
      log.push({ kind: "print", line });
    },
  };
  return {
    base,
    stateRoot,
    home,
    cwd,
    key,
    id,
    projectSlot,
    engagementDir,
    sessionsDir,
    lines,
    log,
    checks,
    seams,
    io,
  };
}

/** Recursively collect entries under a root as paths RELATIVE to it. */
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

/** Whether a spawn was attempted (side-effect capture proof). */
function spawned(world: World): boolean {
  return world.log.some((entry) => entry.kind === "spawn");
}

describe("fast-fail gates (pre-construction refusals)", () => {
  it("stream-descriptor table: EVERY non-TTY combination emits R1's exact TTY line byte-verbatim, resolves 1, and constructs nothing (check un-called, spawn un-called, fake state root walked EMPTY)", async () => {
    const rows: [TtyStream, TtyStream][] = [
      [{ isTTY: false }, { isTTY: false }],
      [{ isTTY: false }, { isTTY: true }],
      [{ isTTY: true }, { isTTY: false }],
      [{}, { isTTY: true }],
      [{ isTTY: true }, {}],
      [{}, {}],
      [{ isTTY: false }, {}],
      [{}, { isTTY: false }],
    ];
    for (const [input, output] of rows) {
      const world = await makeWorld({ ttyInput: input, ttyOutput: output });
      const code = await runCapability("probe", world.io, world.seams);
      expect(code).toBe(1);
      expect(world.lines).toEqual([TTY_REFUSAL_LINE]);
      expect(world.checks).toHaveLength(0);
      expect(spawned(world)).toBe(false);
      expect(await readdir(world.stateRoot)).toEqual([]);
    }
  });

  it("the catalog line is byte-identical to the CLI's emitted form (hand-built literal, not the module constant)", async () => {
    const world = await makeWorld();
    const code = await runCapability("bogus", world.io, world.seams);
    expect(code).toBe(1);
    expect(world.lines).toEqual([
      "pio: capability 'bogus' is not implemented yet",
    ]);
    expect(world.checks).toHaveLength(0);
    expect(spawned(world)).toBe(false);
    expect(await readdir(world.stateRoot)).toEqual([]);
  });

  it("the capability gate fires BEFORE the TTY check: piped streams + unknown name yield the catalog line, not the terminal line", async () => {
    const world = await makeWorld({ ttyInput: {}, ttyOutput: {} });
    const code = await runCapability("bogus", world.io, world.seams);
    expect(code).toBe(1);
    expect(world.lines).toEqual([
      "pio: capability 'bogus' is not implemented yet",
    ]);
  });
});

describe("anti-nesting guard (exact-value predicate)", () => {
  it('PI_SANDBOX="1" + TTY ⇒ the nested-refusal line + 1, and the injected pre-flight is NOT invoked (the guard precedes it)', async () => {
    const world = await makeWorld({ piSandbox: "1" });
    const code = await runCapability("probe", world.io, world.seams);
    expect(code).toBe(1);
    expect(world.lines).toEqual([NESTING_REFUSAL_LINE]);
    expect(world.checks).toHaveLength(0);
    expect(spawned(world)).toBe(false);
    expect(await readdir(world.stateRoot)).toEqual([]);
  });

  it("other PI_SANDBOX values do NOT trip: the run proceeds to the pre-flight (which reports absent here) — proof the guard passed", async () => {
    const rows: (string | undefined)[] = [undefined, "", "0", "2"];
    for (const value of rows) {
      const world = await makeWorld({
        piSandbox: value,
        checkResult: { ok: false, reason: "absent" },
      });
      const code = await runCapability("probe", world.io, world.seams);
      expect(code).toBe(1);
      expect(world.checks).toHaveLength(1);
      expect(world.lines).toEqual([
        bwrapRefusalLine({ ok: false, reason: "absent" }),
      ]);
      expect(await readdir(world.stateRoot)).toEqual([]);
    }
  });
});

describe("bwrap pre-flight refusals (PRE-side-effects: no dirs, no artifact, no print, no spawn)", () => {
  const battery: Extract<BwrapCheck, { ok: false }>[] = [
    { ok: false, reason: "absent" },
    { ok: false, reason: "version-below-minimum", detail: "bubblewrap 0.9.0" },
    {
      ok: false,
      reason: "setuid-binary",
      detail: "could not verify the setuid bit",
    },
  ];

  it("battery: each failing verdict ⇒ the EXACT refusal line + 1, and the fake root stays EMPTY with zero captured side effects", async () => {
    for (const verdict of battery) {
      const world = await makeWorld({ checkResult: verdict });
      const code = await runCapability("probe", world.io, world.seams);
      expect(code).toBe(1);
      expect(world.lines).toEqual([bwrapRefusalLine(verdict)]);
      expect(await readdir(world.stateRoot)).toEqual([]);
      expect(spawned(world)).toBe(false);
    }
  });

  it("the absent-line rendering is anchored against the HAND-BUILT literal (template pin, independent of the launcher function)", async () => {
    const world = await makeWorld({
      checkResult: { ok: false, reason: "absent" },
    });
    await runCapability("probe", world.io, world.seams);
    expect(world.lines).toEqual([
      "pio: sandbox unavailable: bwrap binary not found in PATH — install bubblewrap (>= 0.12.0, non-setuid build)",
    ]);
  });
});

describe("typed fault rows (catch boundaries)", () => {
  it("a missing launch cwd surfaces the renderer's typed SandboxRenderError as the render-fault line + 1 — the ensured tree MAY remain (accepted residual) but carries NO profile.json, no print, no spawn", async () => {
    const world = await makeWorld({ cwdMissing: true });
    const code = await runCapability("probe", world.io, world.seams);
    expect(code).toBe(1);
    expect(world.lines).toEqual([
      `pio: sandbox profile could not be rendered: required path is missing: "${world.cwd}" (cwd)`,
    ]);
    expect(spawned(world)).toBe(false);
    // Residual engagement tree is ACCEPTED (ensure precedes render) — but
    // it holds no artifact: exactly the .sessions handle, nothing else.
    expect(await readdir(world.engagementDir)).toEqual([".sessions"]);
    const tree = await walkTree(world.stateRoot);
    expect(tree.files).toEqual([]);
  });

  it("an all-slash cwd surfaces the layout's typed LayoutError as the layout-fault line + 1, PRE-side-effects (root untouched)", async () => {
    const world = await makeWorld({ cwdOverride: "//" });
    const code = await runCapability("probe", world.io, world.seams);
    expect(code).toBe(1);
    expect(world.lines).toEqual([
      'pio: engagement layout failed: empty project key: cwd "//" yields no slug segments (all-slash cwd would collapse the projects/<key> nesting)',
    ]);
    expect(spawned(world)).toBe(false);
    expect(await readdir(world.stateRoot)).toEqual([]);
  });
});

describe("full assembly (happy path — displayed = retained = executed)", () => {
  it("one profile value drives the retained file, the transparency print, AND the spawn vector: captured argv deep-equals the fresh pipeline output", async () => {
    const world = await makeWorld({ homeEntries: [".pi", "git"] });
    const code = await runCapability("probe", world.io, world.seams);
    expect(code).toBe(0);

    // Mirror expectation: renderProfile called with the IDENTICAL production
    // inputs — same omitted defaults (identity via process, runtimeDir via
    // process.execPath, conservative mount table, package-relative target
    // executable). No optional fields supplied on either side.
    const mirror = renderProfile({
      cwd: world.cwd,
      home: world.home,
      projectKey: world.key,
      stateRoot: world.stateRoot,
      projectSlot: world.projectSlot,
      engagementDir: world.engagementDir,
      capabilityName: "probe",
      fsView: nodeFsView,
    });

    // Retained bytes === the canonical encoding of the SAME value.
    expect(
      await readFile(path.join(world.engagementDir, PROFILE_FILE_NAME), "utf8"),
    ).toBe(serializeProfile(mirror));

    // Every print line equals formatProfileLines(mirror) IN ORDER…
    const printIndices: number[] = [];
    for (let i = 0; i < world.log.length; i++) {
      if (world.log[i].kind === "print") printIndices.push(i);
    }
    expect(printIndices.length).toBe(formatProfileLines(mirror).length);
    const printed = printIndices.map(
      (i) =>
        (
          world.log[i] as {
            readonly kind: "print";
            readonly line: string;
          }
        ).line,
    );
    expect(printed).toEqual([...formatProfileLines(mirror)]);
    // …and ALL landed BEFORE the spawn event.
    const spawnIndex = world.log.findIndex((e) => e.kind === "spawn");
    expect(spawnIndex).toBeGreaterThan(-1);
    expect(Math.max(...printIndices)).toBeLessThan(spawnIndex);

    // Captured spawn vector byte-equal: bare head, sliced tail, inherit ONLY.
    const spawnEntry = world.log[spawnIndex];
    if (spawnEntry.kind !== "spawn") throw new Error("spawn entry expected");
    expect(spawnEntry.file).toBe("bwrap");
    expect(spawnEntry.args).toEqual(buildArgv(mirror).argv.slice(1));
    expect(spawnEntry.opts).toEqual({ stdio: "inherit" });
    expect("env" in spawnEntry.opts).toBe(false);

    // --sessions-root target arg deep-equals the layout handle sessionsDir
    // (structural identity: the same path.join derivation).
    const flagIndex = spawnEntry.args.indexOf("--sessions-root");
    expect(flagIndex).toBeGreaterThan(-1);
    expect(spawnEntry.args[flagIndex + 1]).toBe(world.sessionsDir);

    // Ensured tree walked = EXACTLY the pinned 7-dir set (six under the
    // state root + the root itself) and the SINGLE artifact file.
    const tree = await walkTree(world.stateRoot);
    expect([...tree.dirs].sort()).toEqual(
      [
        "projects",
        `projects/${world.key}`,
        `projects/${world.key}/engagements`,
        `projects/${world.key}/engagements/${world.id}`,
        `projects/${world.key}/engagements/${world.id}/.sessions`,
        `projects/${world.key}/engagements/${world.id}/.sessions/top`,
      ].sort(),
    );
    expect(tree.files).toEqual([
      path.relative(
        world.stateRoot,
        path.join(world.engagementDir, PROFILE_FILE_NAME),
      ),
    ]);
  });

  it("resolved stateRoot/key/id flow per the Step 3 functions: PIO_STATE_DIR override wins for the root, the key slugs the launch cwd, the id pins from the injected seams", async () => {
    const world = await makeWorld();
    await runCapability("probe", world.io, world.seams);
    expect(world.seams.env?.PIO_STATE_DIR).toBe(world.stateRoot);
    expect(world.key).toBe(deriveProjectKey(world.cwd));
    expect(world.id).toBe(
      mintEngagementId({
        now: () => FIXED_NOW,
        entropy: () => FIXED_ENTROPY,
      }),
    );
    // The engagement tree sits under the OVERRIDDEN root, not <home>/.pio.
    const tree = await walkTree(world.stateRoot);
    expect(tree.dirs).toContain(
      `projects/${world.key}/engagements/${world.id}/.sessions/top`,
    );
    expect(await readdir(world.home)).toEqual([]);
  });
});

describe("exit-code propagation through the run path", () => {
  it("mock child 130 (Ctrl-C quit) resolves 130; the retained artifact still exists (proceeding path taken)", async () => {
    const world = await makeWorld({ childExit: [130, null] });
    const code = await runCapability("probe", world.io, world.seams);
    expect(code).toBe(130);
    const artifact = path.join(world.engagementDir, PROFILE_FILE_NAME);
    expect(await readFile(artifact, "utf8").then((t) => t.length > 0)).toBe(
      true,
    );
  });

  it("mock child 1 resolves 1; same proceeding-path proof", async () => {
    const world = await makeWorld({ childExit: [1, null] });
    const code = await runCapability("probe", world.io, world.seams);
    expect(code).toBe(1);
    const artifact = path.join(world.engagementDir, PROFILE_FILE_NAME);
    expect(await readFile(artifact, "utf8").then((t) => t.length > 0)).toBe(
      true,
    );
  });
});

describe("last-resort boundary (never rejects)", () => {
  it("a seam throwing an UNEXPECTED non-typed Error resolves 1 with the `pio: unexpected sandbox error: …` line and NO side effects", async () => {
    const world = await makeWorld({ checkThrows: new Error("seam exploded") });
    await expect(runCapability("probe", world.io, world.seams)).resolves.toBe(
      1,
    );
    expect(world.lines).toEqual([
      "pio: unexpected sandbox error: seam exploded",
    ]);
    expect(spawned(world)).toBe(false);
    expect(await readdir(world.stateRoot)).toEqual([]);
  });

  it("a seam throwing a NON-ERROR value degrades identically (String() coercion, still one readable line)", async () => {
    const world = await makeWorld({ checkThrows: "seam crashed" });
    await expect(runCapability("probe", world.io, world.seams)).resolves.toBe(
      1,
    );
    expect(world.lines).toEqual([
      "pio: unexpected sandbox error: seam crashed",
    ]);
  });
});
