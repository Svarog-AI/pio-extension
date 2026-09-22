import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import type { BwrapCommand } from "./profile-serializer.ts";

/** Minimum bwrap release accepted as the pre-flight floor: 0.12.0 fixed
 * unsafe symlink resolution during sandbox setup; older releases are a
 * known-vulnerable setup path. */
export const MIN_BWRAP_VERSION: readonly [number, number] = [0, 12];

/** Raw observations about the host's bwrap installation. Absence of an
 * observation is a distinct datum from a negative one (an unreadable
 * version line is NOT the same as a parsed one). */
export interface BwrapReading {
  /** Resolved in env.PATH via follow-link existence; undefined = unresolved. */
  readonly binaryPath?: string;
  /** Trimmed first line of `bwrap --version`; undefined = could not run it. */
  readonly versionLine?: string;
  /** Stat mode & 0o4000 on the resolved path; undefined = could not read. */
  readonly setuidBit?: boolean;
}

/** Classified usability verdict. STATIC checks only — real namespace
 * construction is proven by the actual spawn, never probed here. */
export type BwrapCheck =
  | { readonly ok: true; readonly path: string }
  | {
      readonly ok: false;
      readonly reason: "absent" | "version-below-minimum" | "setuid-binary";
      readonly detail?: string;
    };

const SETUID_UNVERIFIABLE_DETAIL = "could not verify the setuid bit";
const VERSION_PAIR = /(\d+)\.(\d+)/;

function meetsMinimum(versionLine: string): boolean {
  const match = VERSION_PAIR.exec(versionLine.trim());
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const [minMajor, minMinor] = MIN_BWRAP_VERSION;
  return major > minMajor || (major === minMajor && minor >= minMinor);
}

/** Pure, total classifier over the three observations — never throws.
 * Check order is fixed: absence → version floor → setuid bit. An
 * unparseable version refuses under the below-minimum reason (raw output
 * embedded; the (unreadable) placeholder when the probe itself failed),
 * and an unverifiable setuid bit refuses CONSERVATIVELY under the setuid
 * reason, naming the verification failure. */
export function classifyBwrap(reading: BwrapReading): BwrapCheck {
  if (reading.binaryPath === undefined) {
    return { ok: false, reason: "absent" };
  }
  if (reading.versionLine === undefined || !meetsMinimum(reading.versionLine)) {
    return {
      ok: false,
      reason: "version-below-minimum",
      detail:
        reading.versionLine === undefined
          ? "(unreadable)"
          : reading.versionLine.trim(),
    };
  }
  if (reading.setuidBit === true) {
    return { ok: false, reason: "setuid-binary" };
  }
  if (reading.setuidBit === undefined) {
    return {
      ok: false,
      reason: "setuid-binary",
      detail: SETUID_UNVERIFIABLE_DETAIL,
    };
  }
  return { ok: true, path: reading.binaryPath };
}

/** Injectable observation producers. The defaults perform the real work:
 * a follow-link PATH walk, a captured `bwrap --version`, and a setuid
 * stat. Tests fabricate readings directly or drive the defaults against
 * tmpdir fixture scripts — never the system binary. */
export interface CheckSeams {
  readonly exists?: (p: string) => boolean;
  readonly execVersion?: (binaryPath: string) => Promise<string | undefined>;
  readonly statSetuid?: (p: string) => boolean | undefined;
}

function defaultExists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function defaultExecVersion(binaryPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(binaryPath, ["--version"], (err, stdout) => {
      if (err !== null) {
        resolve(undefined);
        return;
      }
      const firstLine = stdout.split("\n")[0]?.trim();
      resolve(
        firstLine === undefined || firstLine.length === 0
          ? undefined
          : firstLine,
      );
    });
  });
}

function defaultStatSetuid(p: string): boolean | undefined {
  try {
    return (statSync(p).mode & 0o4000) !== 0;
  } catch {
    return undefined;
  }
}

/** First PATH element (colon-separated; empty segments skipped; relative
 * elements joined as-is) that holds a bwrap resolving by follow-link
 * stat. Undefined = unresolved against this env object. */
function resolveBinaryInPath(
  env: Record<string, string | undefined>,
  exists: (p: string) => boolean,
): string | undefined {
  const pathValue = env.PATH;
  if (pathValue === undefined) return undefined;
  for (const element of pathValue.split(":")) {
    if (element.length === 0) continue;
    const candidate = path.join(element, "bwrap");
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** The pre-flight itself: resolve the binary against the SAME env object
 * the caller launches with, capture the version line, read the setuid
 * bit, and classify. No namespace is ever constructed by this module —
 * static checks only. */
export async function checkBwrap(
  env: Record<string, string | undefined>,
  seams?: CheckSeams,
): Promise<BwrapCheck> {
  const exists = seams?.exists ?? defaultExists;
  const execVersion = seams?.execVersion ?? defaultExecVersion;
  const statSetuid = seams?.statSetuid ?? defaultStatSetuid;
  const binaryPath = resolveBinaryInPath(env, exists);
  if (binaryPath === undefined) {
    return { ok: false, reason: "absent" };
  }
  const versionLine = await execVersion(binaryPath);
  return classifyBwrap({
    binaryPath,
    versionLine,
    setuidBit: statSetuid(binaryPath),
  });
}

/** Collapse an embedded diagnostic to ONE physical line: product lines are
 * exactly one line each (the sink appends the newline), so whitespace
 * inside details folds to single spaces — no truncation machinery. */
export function oneLineDetail(detail: string): string {
  const collapsed = detail.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : "(no message)";
}

/** Exact single-line refusal per failing check (byte-pinned product
 * strings; the empty-detail setuid form carries no parenthetical). */
export function bwrapRefusalLine(
  check: Extract<BwrapCheck, { ok: false }>,
): string {
  switch (check.reason) {
    case "absent":
      return "pio: sandbox unavailable: bwrap binary not found in PATH — install bubblewrap (>= 0.12.0, non-setuid build)";
    case "version-below-minimum":
      return `pio: sandbox unavailable: bwrap ${oneLineDetail(check.detail ?? "(unreadable)")} is below the required minimum 0.12.0 — upgrade bubblewrap (0.12.0 fixes unsafe symlink resolution; install non-setuid builds only)`;
    case "setuid-binary":
      return `pio: sandbox unavailable: the bwrap binary carries the setuid bit${check.detail !== undefined ? ` (${oneLineDetail(check.detail)})` : ""} — install/build bubblewrap WITHOUT setuid (setuid-mode vulnerability classes apply)`;
  }
}

/** Anti-nesting refusal — one physical line, exit 1, nothing spawned. */
export const NESTING_REFUSAL_LINE =
  "pio: nested sandbox refused: PI_SANDBOX=1 is set — wrapped launches are host-side only; compose plain children inside the namespace instead";

/** Exact-value predicate: only PI_SANDBOX === "1" marks a process that is
 * already inside a wrapper — "0", "", and unset do not trip. */
export function isNestedLaunch(
  env: Record<string, string | undefined>,
): boolean {
  return env.PI_SANDBOX === "1";
}

/** Structural child handle — node:child_process's ChildProcess satisfies
 * this shape, so production pays nothing; the seam lets the suite drive
 * the REAL lifecycle deterministically (captured argv/options, kill
 * receipt, one-line error settlement, listener deregistration) with zero
 * real-bwrap execution — tests substitute deterministic mocks. */
export interface LaunchChild {
  readonly pid?: number;
  on(
    event: "exit",
    cb: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): void;
  on(event: "error", cb: (err: Error) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

/** Spawner contract: argv[0] IS the bare "bwrap" head — pass it as the
 * executable with argv.slice(1) as the arguments; never prepend a second
 * head. The bare head relies on PATH resolution at spawn time against the
 * same env the pre-flight checked. */
export type SpawnFn = (
  file: string,
  args: readonly string[],
  opts: { stdio: "inherit" },
) => LaunchChild;

/** Pure exit map: clean quit → 0, Ctrl-C quit → 130, any other nonzero
 * code → 1, and a signal-killed child (null code) → 1. Signal deaths add
 * NO extra stderr line — the mapped code is the typing. */
export function mapChildExit(
  code: number | null,
  _signal: NodeJS.Signals | null,
): number {
  return code === 0 ? 0 : code === 130 ? 130 : 1;
}

/** Spawn supervision: hands the terminal over to the child and waits for
 * its settle. Never rejects: settlement paths resolve the mapped code,
 * and spawn faults degrade to one readable line + 1. */
export async function superviseSpawn(
  cmd: BwrapCommand,
  spawn: SpawnFn,
  sink: { stderr(line: string): void },
): Promise<number> {
  try {
    // Terminal handover: the SAME fds go to the child — fd inheritance IS
    // the transport; the host supervises signals and exit code, never
    // proxies I/O. Environment inherited (no env option): HOME/PATH/
    // PI_SANDBOX ride inside the argv --setenv tokens.
    const child = spawn(cmd.argv[0], cmd.argv.slice(1), { stdio: "inherit" });
    // Signal policy, whole, for this window: a host SIGTERM is forwarded
    // to the child, then natural drain resolves the mapped code. SIGINT
    // has NO handler on purpose — the in-session TUI runs the terminal in
    // raw mode (ISIG off), so Ctrl-C reaches the child as bytes and the
    // native double-Quit (turn-abort ×2 → 130) needs no host plumbing;
    // --die-with-parent (in the base flags) backstops kills the forwarder
    // cannot reach, and the listeners leave when the window closes.
    const forwardSigterm = (): void => {
      try {
        child.kill("SIGTERM");
      } catch {
        // The child already settled — the settle path owns the outcome.
      }
    };
    process.on("SIGTERM", forwardSigterm);
    try {
      // Wait-for-child adapter: idempotent first-settle-wins over the
      // events, resolves the MAPPED code; finally drops the forwarder.
      return await new Promise<number>((resolve) => {
        let settled = false;
        const settle = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ): void => {
          if (settled) return;
          settled = true;
          resolve(mapChildExit(code, signal));
        };
        child.on("exit", (code, signal) => {
          settle(code, signal);
        });
        child.on("error", (err: Error) => {
          if (settled) return;
          settled = true;
          sink.stderr(
            `pio: sandbox launch failed: ${oneLineDetail(err.message)}`,
          );
          resolve(1);
        });
      });
    } finally {
      process.removeListener("SIGTERM", forwardSigterm);
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    sink.stderr(`pio: sandbox launch failed: ${oneLineDetail(detail)}`);
    return 1;
  }
}
