import { spawn as nodeSpawn } from "node:child_process";
import os from "node:os";
import { classifySpec } from "../capability/contract.ts";
import type { FsView } from "./fsview.ts";
import { nodeFsView } from "./fsview.ts";
import type { SpawnFn, TtyStream } from "./launcher.ts";
import {
  bwrapRefusalLine,
  checkBwrap,
  isInteractiveTty,
  isNestedLaunch,
  NESTING_REFUSAL_LINE,
  oneLineDetail,
  superviseSpawn,
  TTY_REFUSAL_LINE,
} from "./launcher.ts";
import {
  deriveProjectKey,
  ensureEngagementLayout,
  ensurePiTree,
  LayoutError,
  mintEngagementId,
  resolveStateRoot,
} from "./layout.ts";
import { ensureOwnedExtensions } from "./owned-extensions.ts";
import {
  buildArgv,
  formatProfileLines,
  writeProfileFile,
} from "./profile-serializer.ts";
import { renderProfile, SandboxRenderError } from "./render.ts";

/** Injectable stderr sink — lines arrive WITHOUT a trailing newline; the
 * writer appends it. cli.ts's CliIO satisfies this shape (Step 5 passes
 * its `out` straight through). */
export interface RunIO {
  stderr(line: string): void;
}

/** Every external-world touch behind an injectable seam; the production
 * defaults apply lazily inside runCapability so tests can hold the whole
 * host surface (env, home, cwd, tty streams, fs view, pre-flight,
 * spawner, id clock, id entropy) fabricated. */
export interface RunSeams {
  /** Default: process.env. */
  readonly env?: Record<string, string | undefined>;
  /** Default: os.homedir(). */
  readonly home?: string;
  /** Default: process.cwd(). */
  readonly cwd?: string;
  /** Default: process.stdin / process.stdout. */
  readonly tty?: { readonly input: TtyStream; readonly output: TtyStream };
  /** Default: nodeFsView. */
  readonly fsView?: FsView;
  /** Default: the launcher's checkBwrap (drives the pre-flight over the seam env). */
  readonly check?: typeof checkBwrap;
  /** Default: the node:child_process spawn wrapper. */
  readonly spawn?: SpawnFn;
  /** Engagement-id clock (default: Date.now()). */
  readonly now?: () => number;
  /** Engagement-id entropy (default: 8 lowercase hex chars). */
  readonly entropy?: () => string;
  /** Default: ensureOwnedExtensions over the production roster — verifies
   * the vendored trees exist and registers their user-scope local-source
   * settings entries into the isolated agent dir PAST all gates, BEFORE
   * rendering (the sanctioned launch-surface exception). */
  readonly provisionExtensions?: (piTree: string) => Promise<void>;
}

const defaultSpawn: SpawnFn = (file, args, opts) => nodeSpawn(file, args, opts);

/** Host input-gate refusal lines — the SOLE OWNER of these bytes is THIS
 * module (private by design: the runtime export surface is pinned to
 * `['runCapability']`, so exporting helpers would break that guard). Each
 * line CARRIES ITS OWN `pio: ` prefix (à la TTY_REFUSAL_LINE) and stays
 * SINGLE-LINE — a host refusal is one physical line + exit 1. */
const UNDECLARED_INPUT_LINE = (name: string, key: string): string =>
  `pio: capability '${name}' does not declare input '${key}'`;
const MISSING_INPUT_LINE = (name: string, key: string): string =>
  `pio: capability '${name}' is missing required input '${key}'`;

/** The run path: one straight-line host-side launch of a capability inside
 * the bubble. Strict gate order — capability → inputs → TTY → nesting →
 * bwrap pre-flight — and side effects (engagement tree, profile.json, the
 * mount list print, the spawn) are reached ONLY on the proceeding path.
 * Resolves THE mapped exit code; never rejects. */
export async function runCapability(
  capabilityName: string,
  io?: RunIO,
  seams?: RunSeams,
  inputs?: Record<string, string>,
): Promise<number> {
  const sink: RunIO = io ?? {
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
  try {
    const env = seams?.env ?? process.env;
    const home = seams?.home ?? os.homedir();
    const cwd = seams?.cwd ?? process.cwd();
    const tty = seams?.tty ?? { input: process.stdin, output: process.stdout };
    const fsView = seams?.fsView ?? nodeFsView;
    const check = seams?.check ?? checkBwrap;
    const spawn = seams?.spawn ?? defaultSpawn;
    const provisionExtensions =
      seams?.provisionExtensions ??
      ((piTree: string) => ensureOwnedExtensions(piTree));

    // Gate 1 — capability admission. Defers to the loader through a dynamic
    // thunk fired for EVERY name. A miss resolves as the LOADER-OWNED refusal
    // line, printed verbatim BEFORE the TTY check (so a piped `pio run
    // bogus` gets the miss line, not the terminal line) and before ANY side
    // effect. A hit is admission ONLY — the child re-resolves in-namespace
    // and its resolution is authoritative.
    const { resolveCapability } = await import("../capability/loader.ts");
    const resolution = await resolveCapability(capabilityName);
    if (!resolution.ok) {
      sink.stderr(resolution.refusal);
      return 1;
    }
    // Input gates — post-loader-admission, pre-TTY/pre-bwrap (D3): piped
    // misses stay cheap and print BEFORE any side effect; the resolved
    // contract is in hand at this gate. Activation: `inputs === undefined`
    // skips BOTH checks ENTIRELY (legacy caller shape — the whole pre-step
    // behavior survives byte-for-byte); ANY provided record — including the
    // EMPTY one — activates both, so a declared-but-unsupplied input still
    // reports its miss. Undeclared-key check FIRST (the user-typed
    // malformation outranks omission), then the missing-required check via
    // the shared classifySpec seam (value slots trip on missing-value,
    // paramKey-driven file slots on unresolvable; static-file specs never
    // do). First-offender reporting: ONE physical line + exit 1.
    if (inputs !== undefined) {
      const specs = resolution.capability.contract.inputs;
      const declared = new Set<string>();
      for (const spec of specs) {
        // The union of EVERY entry's name PLUS its paramKey (when present)
        // — the exact keys the wire VALUES can legitimately feed (value
        // slots look up `name`; file-mode slots look up `paramKey`).
        declared.add(spec.name);
        const paramKey = "paramKey" in spec ? spec.paramKey : undefined;
        if (paramKey !== undefined) declared.add(paramKey);
      }
      for (const key of Object.keys(inputs)) {
        if (!declared.has(key)) {
          sink.stderr(UNDECLARED_INPUT_LINE(capabilityName, key));
          return 1;
        }
      }
      for (const spec of specs) {
        const resolved = classifySpec(spec, inputs);
        if (
          resolved.mode === "missing-value" ||
          resolved.mode === "unresolvable"
        ) {
          const wireKey =
            "paramKey" in spec ? (spec.paramKey ?? spec.name) : spec.name;
          sink.stderr(MISSING_INPUT_LINE(capabilityName, wireKey));
          return 1;
        }
      }
    }
    // Gate 2 — TTY fast-fail. Nothing is constructed past this line when
    // the terminal is missing: no dirs, no artifact, no print, no spawn.
    if (!isInteractiveTty(tty.input, tty.output)) {
      sink.stderr(TTY_REFUSAL_LINE);
      return 1;
    }
    // Gate 3 — anti-nesting: wrapped launches are host-side only.
    if (isNestedLaunch(env)) {
      sink.stderr(NESTING_REFUSAL_LINE);
      return 1;
    }
    // Gate 4 — bwrap pre-flight (static checks only). Refusals land HERE,
    // before ANY side effect.
    const preflight = await check(env);
    if (!preflight.ok) {
      sink.stderr(bwrapRefusalLine(preflight));
      return 1;
    }

    const stateRoot = resolveStateRoot(env, home);
    const projectKey = deriveProjectKey(cwd);
    const engagementId = mintEngagementId({
      now: seams?.now,
      entropy: seams?.entropy,
    });
    const paths = await ensureEngagementLayout({
      stateRoot,
      projectKey,
      engagementId,
    });
    // First-use pi tree under the state root (the renderer binds it rw and
    // refuses loudly if it were missing — the return value is pinned by the
    // suite; production reaches the path through the renderer's derivation).
    // Owned-extension provisioning then verifies the roster sources exist
    // and registers their enabling settings entries into the isolated agent
    // dir beneath THIS handle (the sanctioned launch-surface exception)
    // — idempotent, PAST all four gates, BEFORE anything renders: a
    // provisioning fault lands in the layout-refusal handler with no
    // profile, no print, no spawn.
    const piTree = await ensurePiTree(paths.stateRoot);
    await provisionExtensions(piTree);
    const profile = renderProfile({
      cwd,
      home,
      projectKey,
      stateRoot: paths.stateRoot,
      projectSlot: paths.projectSlot,
      engagementDir: paths.engagementDir,
      capabilityName,
      fsView,
      inputs,
    });
    const cmd = buildArgv(profile);
    // Retention point: the SAME in-memory profile value feeds the retained
    // document, the transparency print, and the spawn vector — displayed =
    // retained = executed. Written only on the proceeding path: a refusal
    // leaves no partial audit trail.
    await writeProfileFile(paths.engagementDir, profile);
    for (const line of formatProfileLines(profile)) {
      sink.stderr(line);
    }
    return await superviseSpawn(cmd, spawn, sink);
  } catch (cause) {
    if (cause instanceof SandboxRenderError) {
      sink.stderr(
        `pio: sandbox profile could not be rendered: ${oneLineDetail(cause.message)}`,
      );
      return 1;
    }
    if (cause instanceof LayoutError) {
      sink.stderr(
        `pio: engagement layout failed: ${oneLineDetail(cause.message)}`,
      );
      return 1;
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    sink.stderr(`pio: unexpected sandbox error: ${oneLineDetail(detail)}`);
    return 1;
  }
}
