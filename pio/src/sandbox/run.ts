import { spawn as nodeSpawn } from "node:child_process";
import os from "node:os";
import type { TtyStream } from "../probe.ts";
import { isInteractiveTty, TTY_REFUSAL_LINE } from "../probe.ts";
import type { FsView } from "./fsview.ts";
import { nodeFsView } from "./fsview.ts";
import type { SpawnFn } from "./launcher.ts";
import {
  bwrapRefusalLine,
  checkBwrap,
  isNestedLaunch,
  NESTING_REFUSAL_LINE,
  oneLineDetail,
  superviseSpawn,
} from "./launcher.ts";
import {
  deriveProjectKey,
  ensureEngagementLayout,
  ensurePiTree,
  LayoutError,
  mintEngagementId,
  resolveStateRoot,
} from "./layout.ts";
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
}

/** The v1 capability-gate refusal — byte-identical to the CLI's emitted
 * form; single owner here until the CLI dedupes against it. */
export const CAPABILITY_NOT_IMPLEMENTED = (name: string): string =>
  `pio: capability '${name}' is not implemented yet`;

const defaultSpawn: SpawnFn = (file, args, opts) => nodeSpawn(file, args, opts);

/** The run path: one straight-line host-side launch of a capability inside
 * the bubble. Strict gate order — capability → TTY → nesting → bwrap
 * pre-flight — and side effects (engagement tree, profile.json, the mount
 * list print, the spawn) are reached ONLY on the proceeding path. Resolves
 * THE mapped exit code; never rejects. */
export async function runCapability(
  capabilityName: string,
  io?: RunIO,
  seams?: RunSeams,
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

    // Gate 1 — capability catalog. Fires BEFORE the TTY check, so a piped
    // `pio run bogus` gets the catalog line, not the terminal line.
    if (capabilityName !== "probe") {
      sink.stderr(CAPABILITY_NOT_IMPLEMENTED(capabilityName));
      return 1;
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
    await ensurePiTree(paths.stateRoot);
    const profile = renderProfile({
      cwd,
      home,
      projectKey,
      stateRoot: paths.stateRoot,
      projectSlot: paths.projectSlot,
      engagementDir: paths.engagementDir,
      capabilityName,
      fsView,
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
