import path from "node:path";
import { PIO_PACKAGE_ROOT } from "../constants.ts";
import type { FsView } from "./fsview.ts";
import { hasWildcard } from "./fsview.ts";
import { OWNED_EXTENSION_PACKAGES } from "./owned-extensions.ts";
import type {
  EnvAssignment,
  MountEntry,
  MountSources,
  SandboxProfile,
  TargetCommand,
} from "./profile.ts";
import { conservativeDefaultSources, STANDARD_PATH_BASE } from "./profile.ts";

/** Process identity pair substituted into the base flags + derived mounts. */
export interface RenderIdentity {
  readonly uid: number;
  readonly gid: number;
}

/** Pinned input contract of `renderProfile` (defaults computed lazily). */
export interface RenderInput {
  /** Absolute. Chdir target AND rw-bound LAST (blast-radius lever). */
  cwd: string;
  /** `$HOME` equivalent — tilde-expansion base and HOME env value (unmodified). */
  home: string;
  /** Carried for interface stability/provenance (derived upstream). */
  projectKey: string;
  /** Engagement dir; source of the `--sessions-root` target arg. */
  engagementDir: string;
  /** Global state root — bound ro for all sessions (section C, first). */
  stateRoot: string;
  /** Own project slot (`<stateRoot>/projects/<key>`) — rw overlay AFTER the ro root. */
  projectSlot: string;
  /** Passed as the first target arg to the top-session entry. */
  capabilityName: string;
  /** Injected existence/glob seam (hermeticity). */
  fsView: FsView;
  /** Default: process.getuid()/process.getgid() (computed — never hardcoded). */
  identity?: RenderIdentity;
  /** Default: dirname(dirname(process.execPath)) — own-runtime grounding. */
  runtimeDir?: string;
  /** Default: `<PIO_PACKAGE_ROOT>/bin/pio-run-session` (src/constants.ts). */
  targetExecutable?: string;
  /** Default: STANDARD_PATH_BASE (the standard six). */
  envBasePath?: string[];
  /** Default: conservativeDefaultSources(identity.uid). */
  mountSources?: MountSources;
  /** The vendored extension trees bound ro into the bubble (section C,
   * after the pio-state trio) — pi's loader resolves the registered
   * local-source settings entries against these identity paths in place.
   * Only when `includePioState !== false` (bypassing the pio-state section
   * bypasses vehicle provisioning too); a missing path is a NORMATIVE
   * refusal (the existence guard right before render already guarantees
   * presence in the production flow — a hit means pathological drift).
   * Injected paths REPLACE the default wholesale. */
  readonly vendoredExtensions?: readonly string[];
  /** Default: true. Binds the pio-state trio — state root ro, own slot rw,
   * then the isolated pi config dir rw (section C). */
  includePioState?: boolean;
}

/** Typed render refusal. `reason` is a stable machine-readable code
 * (e.g. "invalid-tilde-entry", "cwd-missing", "normative-path-missing");
 * `message` always names the offending entry/path. */
export class SandboxRenderError extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "SandboxRenderError";
    this.reason = reason;
  }
}

interface Candidate {
  path: string;
  mode: "ro" | "rw";
  /** Human context used when naming the offending entry in errors. */
  context: string;
  /** When set, a missing/absent result is a typed refusal (not a silent skip). */
  missingReason?: "cwd-missing" | "normative-path-missing";
}

/** Leading-tilde expansion; only a LEADING tilde counts (`~` → home,
 * `~/x` → `<home>/x`). Any other leading-`~` form is a typed refusal. */
function expandTilde(entry: string, home: string, context: string): string {
  if (!entry.startsWith("~")) return entry;
  if (entry === "~") return home;
  if (entry.startsWith("~/")) return home + entry.slice(1); // keep the slash
  throw new SandboxRenderError(
    "invalid-tilde-entry",
    `unsupported tilde form in ${context}: "${entry}" ` +
      `(only "~" and "~/…" are supported)`,
  );
}

/** The ONE uniform pipeline every candidate flows through: tilde-expand →
 * wildcard-detect on the EXPANDED text → glob (take existing matches as-is)
 * OR exists-check (skip nonexistent literals) → append with its mode.
 * Duplicates are KEPT in declaration order; empty entries are skipped. */
function composeCandidates(
  candidates: readonly Candidate[],
  home: string,
  fsView: FsView,
): MountEntry[] {
  const mounts: MountEntry[] = [];
  for (const candidate of candidates) {
    const expanded = expandTilde(candidate.path, home, candidate.context);
    if (expanded.length === 0) continue; // empty entries skipped
    if (hasWildcard(expanded)) {
      for (const match of fsView.glob(expanded)) {
        mounts.push({ sourcePath: match, mode: candidate.mode });
      }
      continue;
    }
    if (!fsView.exists(expanded)) {
      if (candidate.missingReason !== undefined) {
        throw new SandboxRenderError(
          candidate.missingReason,
          `required path is missing: "${expanded}" (${candidate.context})`,
        );
      }
      continue; // availability-optional entry: silent skip
    }
    mounts.push({ sourcePath: expanded, mode: candidate.mode });
  }
  return mounts;
}

function defaultIdentity(): RenderIdentity {
  // POSIX-only host required — fail loud rather than guess an identity.
  const uidOf = process.getuid;
  const gidOf = process.getgid;
  if (typeof uidOf !== "function" || typeof gidOf !== "function") {
    throw new Error(
      "process identity APIs unavailable (getuid/getgid) — POSIX host required",
    );
  }
  const uid = uidOf();
  const gid = gidOf();
  if (uid === undefined || gid === undefined) {
    throw new Error(
      "process identity unresolved (getuid/getgid returned undefined) — POSIX host required",
    );
  }
  return { uid, gid };
}

function defaultRuntimeDir(): string {
  return path.dirname(path.dirname(process.execPath));
}

/** Package-relative target executable, resolved against the single-source
 * pio package root (src/constants.ts). */
function defaultTargetExecutable(): string {
  return path.join(PIO_PACKAGE_ROOT, "bin", "pio-run-session");
}

/** The vendored extension trees — OWNED_EXTENSION_PACKAGES mapped to
 * `<PIO_PACKAGE_ROOT>/node_modules/<n>` in roster order (lazy helper, à la
 * defaultTargetExecutable). The SAME roster constant drives both the
 * settings entries (owned-extensions.ts) and these mount members. */
function defaultVendoredExtensions(): readonly string[] {
  return [...OWNED_EXTENSION_PACKAGES].map((name) =>
    path.join(PIO_PACKAGE_ROOT, "node_modules", name),
  );
}

function buildBaseFlags(identity: RenderIdentity): string[] {
  // Order fixed; network SHARED deliberately (threat model: file mutation).
  return [
    "--unshare-all",
    "--uid",
    String(identity.uid),
    "--gid",
    String(identity.gid),
    "--share-net",
    "--die-with-parent",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
  ];
}

/** EXACTLY four pairs, HOME → PATH → PI_SANDBOX → PI_CODING_AGENT_DIR.
 * No `--clearenv`: host env passes through structurally (the serializer
 * emits these tokens). The agent-dir value follows the state-root input
 * verbatim (not tilde-expanded) and is UNCONDITIONAL — it names where the
 * vehicle's own pi instance lives, flag or no flag. */
function buildEnv(
  home: string,
  runtimeDir: string,
  basePath: readonly string[],
  stateRoot: string,
): EnvAssignment[] {
  const elements: string[] = [];
  for (const element of basePath) {
    const expanded = expandTilde(element, home, "PATH base element");
    if (expanded.length === 0) continue; // empties dropped
    elements.push(expanded);
  }
  const runtimeBin = path.join(runtimeDir, "bin");
  // pinned edge: empty-after-drop → runtime bin with NO trailing colon
  const value =
    elements.length > 0 ? `${runtimeBin}:${elements.join(":")}` : runtimeBin;
  return [
    { key: "HOME", value: home },
    { key: "PATH", value: value },
    { key: "PI_SANDBOX", value: "1" },
    { key: "PI_CODING_AGENT_DIR", value: path.join(stateRoot, ".pi", "agent") },
  ];
}

function buildTarget(input: RenderInput): TargetCommand {
  return {
    executable: input.targetExecutable ?? defaultTargetExecutable(),
    args: [
      input.capabilityName,
      "--sessions-root",
      path.join(input.engagementDir, ".sessions"),
    ],
  };
}

/** Pure renderer: equal inputs + equal FsView ⇒ deep-equal outputs.
 * Sections A→B→C→D; no merging — the profile IS the entire configuration. */
export function renderProfile(input: RenderInput): SandboxProfile {
  const identity = input.identity ?? defaultIdentity();
  const runtimeDir = input.runtimeDir ?? defaultRuntimeDir();
  const mountSources =
    input.mountSources ?? conservativeDefaultSources(identity.uid);
  const includePioState = input.includePioState !== false;
  const home = input.home;
  const fsView = input.fsView;

  const candidates: Candidate[] = [];
  // A. always-ro system set (fixed literal order) + own-runtime grounding
  candidates.push(
    { path: "/etc/ssl", mode: "ro", context: "always-ro system set entry" },
    {
      path: "/etc/resolv.conf",
      mode: "ro",
      context: "always-ro system set entry",
    },
    { path: runtimeDir, mode: "ro", context: "always-ro system set entry" },
  );
  // B. seeded conservative defaults: readOnly → readWrite → extraMounts
  for (const p of mountSources.readOnly) {
    candidates.push({
      path: p,
      mode: "ro",
      context: "seeded readOnly entry",
    });
  }
  for (const p of mountSources.readWrite) {
    candidates.push({
      path: p,
      mode: "rw",
      context: "seeded readWrite entry",
    });
  }
  for (const extra of mountSources.extraMounts) {
    candidates.push({
      path: extra.path,
      mode: extra.readOnly === true ? "ro" : "rw",
      context: "seeded extraMounts entry",
    });
  }
  // C. pio-state trio (iff includePioState — bypassed entirely when false);
  //    missing roots fail loud (a quiet security-model change otherwise).
  //    The .pi member is the sole writable addition over the ro root — the
  //    vehicle's own pi instance lives there — followed by the vendored
  //    extension trees as read-only identity binds (nothing in-bubble ever
  //    writes them: loaders READ, locals are excluded from update
  //    reconciliation, and a bubble must not mutate its own launch-surface
  //    tooling). Declaration order = roster order (byte-stable).
  if (includePioState) {
    candidates.push(
      {
        path: input.stateRoot,
        mode: "ro",
        context: "pio-state overlay: state root ro",
        missingReason: "normative-path-missing",
      },
      {
        path: input.projectSlot,
        mode: "rw",
        context: "pio-state overlay: own project slot rw",
        missingReason: "normative-path-missing",
      },
      {
        path: path.join(input.stateRoot, ".pi"),
        mode: "rw",
        context: "pio-state overlay: isolated pi config dir rw",
        missingReason: "normative-path-missing",
      },
    );
    for (const p of input.vendoredExtensions ?? defaultVendoredExtensions()) {
      candidates.push({
        path: p,
        mode: "ro",
        context: "vendored extension entry",
        missingReason: "normative-path-missing",
      });
    }
  }
  // D. cwd rw — LAST (later bind overlays earlier — ordering is security)
  candidates.push({
    path: input.cwd,
    mode: "rw",
    context: "cwd",
    missingReason: "cwd-missing",
  });

  return {
    baseFlags: buildBaseFlags(identity),
    mounts: composeCandidates(candidates, home, fsView),
    env: buildEnv(
      home,
      runtimeDir,
      input.envBasePath ?? STANDARD_PATH_BASE,
      input.stateRoot,
    ),
    chdir: input.cwd,
    target: buildTarget(input),
  };
}
