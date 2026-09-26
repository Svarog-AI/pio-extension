import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { PIO_PACKAGE_ROOT } from "../constants.ts";
import { LayoutError } from "./layout.ts";

/**
 * Owned-extension provisioning (D1/SR3) — verify the owned roster's sources
 * EXIST and register EVERY roster package into the isolated agent dir's
 * GLOBAL settings as a user-scope LOCAL SOURCE (the vendored tree's
 * ABSOLUTE PATH, verbatim). Pi's loader then loads each vendored tree IN
 * PLACE through its ordinary disk-backed extension loading — no copy, no
 * symlink, no registry, no network at launch (measured against the
 * exact-pinned @earendil-works/pi-coding-agent 0.85.1 dist under
 * pio/node_modules/…, 2026-09-26 — measurement over citation):
 * - parseSource: any string that is neither `npm:` nor a git URL falls
 *   through to `{ type: "local", path: source }` — RAW ABSOLUTE paths are
 *   admitted verbatim (a direct settings write bypasses any interactive
 *   normalization pi applies to its own persistence).
 * - install() local branch: the ENTIRE behavior is an existence check —
 *   NO copy/symlink/materialization; this upsert is the minimal embodiment
 *   of the one settings recording that installAndPersist adds on top.
 * - resolveLocalExtensionSource: resolved path ABSENT ⇒ SILENT SKIP
 *   (offline-safe by construction; Step 4's loud preflight is the gap
 *   detector); a DIRECTORY runs collectPackageResources against its
 *   `pi.*` manifest — resource-collection semantics identical to any
 *   managed layout.
 * - update reconciliation short-circuits `type === "local" || pinned` —
 *   NO drift attempts ever against our entries (the exact pin rides the
 *   artifact lockfile — pin-policy consistent).
 * - the extension LOADER carries the `@mariozechner/*` → renamed-host
 *   import alias bridge uniformly for ALL source kinds (the headless proof
 *   observes it end-to-end).
 * - getSettingsPath() = join(getAgentDir(), "settings.json"); getAgentDir()
 *   honors $PI_CODING_AGENT_DIR read at CALL time — the renderer sets that
 *   var UNCONDITIONALLY to <stateRoot>/.pi/agent ⇒ the settings file
 *   upserted here IS the bubble sessions' global settings.
 *
 * Steady state is a TOTAL NO-OP (per-package stat + ONE settings read;
 * ZERO writes). Existence-only guard (USER RULING 2026-09-26): the module
 * never reads ANY manifest — version/pin fidelity is owned by the artifact
 * layer (exact dependency + committed lockfile + CI gates on clean
 * installs), deliberately NOT re-mechanized per launch. All faults throw
 * the layout-error family (run.ts's existing handler). A corrupted
 * SETTINGS file refuses loud and BYTE-UNTOUCHED (it is a read-modify-write
 * accumulator, not a pure function of pio's inputs).
 */

/** Explicit owned-extension roster — the ONLY packages ever registered into
 * bubbles. Deliberately NOT derived from pio's manifest (the pi SDK itself
 * is a dependency and must never be registered). The SAME constant drives
 * the renderer's vendored-extension bind members (render.ts default).
 * Adding a package later = exact-pinned owned dep line + roster entry +
 * suite rows (each carries its own constraint-5 approval). */
export const OWNED_EXTENSION_PACKAGES: readonly string[] = ["pi-native-search"];

/** Kind of an fs entry observed by the guard (the symlink distinction is
 * load-bearing: pnpm-style symlinked node_modules would dangle inside the
 * bubble under identity binds). */
export type FsEntryKind = "absent" | "directory" | "symlink" | "file" | "other";

/** Shrunken injectable fs surface — FIVE ops (was nine in the blocked
 * design): existence classification + the settings read-modify-write. The
 * ONLY file this module ever reads is the settings file itself. */
export interface OwnedExtensionFs {
  /** Link-kind inspection of ONE path (existence included — symlinks
   * reported AS links, never resolved). */
  stat(path: string): Promise<FsEntryKind>;
  /** Settings-file content (read-modify-write); no manifest reads anywhere. */
  readFile(path: string): Promise<string>;
  /** Recursive, idempotent — parents of the settings temp write. */
  mkdir(dirPath: string): Promise<void>;
  /** Write text to a file (parent must already exist). */
  writeFile(path: string, data: string): Promise<void>;
  /** Same-directory rename (the atomic settings-write guarantee). */
  rename(fromPath: string, toPath: string): Promise<void>;
}

/** Injectable seams — each default applies lazily (à la fsView). */
export interface OwnedExtensionSeams {
  /** Default: OWNED_EXTENSION_PACKAGES. */
  readonly packages?: readonly string[];
  /** Default: PIO_PACKAGE_ROOT (the shared constants leaf — never
   * re-derived). */
  readonly pioRoot?: string;
  /** Default: node-backed implementation (nodeOwnedExtensionFs). */
  readonly fs?: OwnedExtensionFs;
}

/** Structural view over the node stat-like reporter (Stats exposes the
 * three predicates) — symlinks checked FIRST so a link is never
 * misclassified as the kind it points at. */
function statsKind(stats: {
  readonly isSymbolicLink: () => boolean;
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
}): FsEntryKind {
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return "other";
}

/** Node-backed op surface (production default — every row-testable without
 * mocks over temp paths). ENOENT reports "absent"; a genuine fault
 * propagates. Deletion stays OUTSIDE the seam: the five ops above are the
 * whole steady-state surface; best-effort temp cleanup below uses node
 * directly (a crash-window residue is harmless — unique names, the loader
 * ignores strays). */
export const nodeOwnedExtensionFs: OwnedExtensionFs = {
  async stat(target) {
    try {
      return statsKind(await lstat(target));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return "absent";
      throw cause;
    }
  },
  readFile: (file) => readFile(file, "utf8"),
  async mkdir(dirPath) {
    // The recursive overload resolves THE first-created dir — dropped here:
    // the seam contract is a plain mkdir -p (no consumer needs the result).
    await mkdir(dirPath, { recursive: true });
  },
  writeFile: (file, data) => writeFile(file, data),
  rename: (fromPath, toPath) => rename(fromPath, toPath),
};

/** Guard target AND user-scope LOCAL SOURCE settings entry (ONE helper for
 * BOTH roles — identical today; if the settings ENTRY FORM ever diverges
 * from the on-disk location, that decision lands as ONE body change to
 * this helper, never in the phase logic): the vendored tree = pio's OWN
 * installed copy (the artifact ships it; the module reads NOTHING inside it
 * at launch), registered as its ABSOLUTE PATH verbatim — no `npm:` prefix,
 * no normalization (the measured local-source form). */
const sourceDirOf = (pioRoot: string, name: string): string =>
  path.join(pioRoot, "node_modules", name);
const settingsPathOf = (piTree: string): string =>
  path.join(piTree, "agent", "settings.json");

/** Wrap a genuine op-surface fault into the layout-error family with ONE
 * contextualized readable line — so faults land in run.ts's EXISTING
 * layout-refusal handler instead of the last-resort unexpected-error branch. */
function toLayoutError(context: string, cause: unknown): LayoutError {
  const detail = (cause instanceof Error ? cause.message : String(cause))
    .replace(/\s+/g, " ")
    .trim();
  return new LayoutError(
    `${context}: ${detail.length > 0 ? detail : "(no message)"}`,
  );
}

/** Phase G — guard ALL roster sources (roster order, fail-fast): ONE stat
 * per package, ALL guards precede ANY registration. Absent ⇒ reinstall
 * remedy; SYMLINK ⇒ a DISTINCT actionable refusal (an identity bind of a
 * link dangles in-bubble where the link target is unmounted — pnpm-style
 * layouts unsupported); anything else is refused too. A trip writes NOTHING
 * (retryable next launch — idempotent self-heal). */
async function guardSources(
  fs: OwnedExtensionFs,
  pioRoot: string,
  packages: readonly string[],
): Promise<void> {
  for (const name of packages) {
    const sourceDir = sourceDirOf(pioRoot, name);
    const kind = await fs.stat(sourceDir);
    if (kind === "absent") {
      throw new LayoutError(
        `owned extension source is missing: ${sourceDir} — reinstall ` +
          "pio's dependencies (run npm install in the pio package root)",
      );
    }
    if (kind === "symlink") {
      throw new LayoutError(
        `owned extension source is a symlink: ${sourceDir} — symlinked ` +
          "node_modules layouts (pnpm et al.) are unsupported for vendored " +
          "trees (an identity bind of the link would dangle in the bubble); " +
          "install with npm using the committed lockfile",
      );
    }
    if (kind !== "directory") {
      throw new LayoutError(
        `owned extension source is not a directory: ${sourceDir} — ` +
          "reinstall pio's dependencies (run npm install in the pio package root)",
      );
    }
  }
}

/** Phase U — register the WHOLE roster in ONE read-modify-write on the
 * bubble sessions' GLOBAL settings file (measured getSettingsPath() over
 * $PI_CODING_AGENT_DIR). Missing file ⇒ minimal shape; everything else
 * (keys, entry order, foreign values) preserved verbatim; nothing missing
 * ⇒ NO write at all (steady-state zero-write pin). Written atomically:
 * unique temp sibling IN THE SAME DIRECTORY (parent mkdir -p first —
 * ensurePiTree creates only <piTree>), then rename over the final name.
 * On write/rename fault: best-effort temp cleanup, ORIGINAL error
 * propagated wrapped. A killed launch may leave the stray sibling behind —
 * harmless (unique names; the loader ignores strays). */
async function registerAll(
  fs: OwnedExtensionFs,
  piTree: string,
  entries: readonly string[],
): Promise<void> {
  const settingsPath = settingsPathOf(piTree);
  const kind = await fs.stat(settingsPath);
  let doc: Record<string, unknown>;
  if (kind === "absent") {
    doc = {};
  } else if (kind === "file") {
    let raw: string;
    try {
      raw = await fs.readFile(settingsPath);
    } catch (cause) {
      throw toLayoutError(`reading the settings file (${settingsPath})`, cause);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new LayoutError(
        `settings file is malformed JSON — refusing to clobber it: ` +
          `${settingsPath} (repair the file by hand; it is an accumulated ` +
          "configuration future features may extend)",
      );
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new LayoutError(
        `settings file top level is not an object — refusing to clobber it: ` +
          `${settingsPath} (repair the file by hand)`,
      );
    }
    doc = parsed as Record<string, unknown>;
  } else {
    throw new LayoutError(
      `settings path is not a regular file — refusing to modify it: ${settingsPath}`,
    );
  }

  let existing: unknown[];
  if ("packages" in doc) {
    if (!Array.isArray(doc.packages)) {
      throw new LayoutError(
        `settings "packages" is not an array — refusing to modify it: ` +
          `${settingsPath} (repair the file by hand)`,
      );
    }
    existing = doc.packages as unknown[];
  } else {
    existing = [];
  }

  // Append EXACTLY the missing roster entries, in roster order, deduplicated
  // by strict string identity (a pre-existing identical entry is never
  // doubled; object-form entries never match a string entry and pass
  // through verbatim).
  const missing = entries.filter((entry) => !existing.some((e) => e === entry));
  if (missing.length === 0) return; // NOTHING missing ⇒ NO write at all
  doc.packages = [...existing, ...missing];

  const serialized = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.mkdir(path.dirname(settingsPath));
  // Atomic write: unique temp sibling, then rename (same-directory rename
  // is the atomic guarantee).
  const tempPath = `${settingsPath}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tempPath, serialized);
    await fs.rename(tempPath, settingsPath);
  } catch (cause) {
    // Best-effort cleanup OUTSIDE the five-op seam (see module note); a
    // cleanup fault NEVER masks the original error.
    await unlink(tempPath).catch(() => undefined);
    throw toLayoutError(`writing the settings file (${settingsPath})`, cause);
  }
}

/** Verify the owned roster's sources exist and register EVERY roster
 * package into the isolated agent dir's global settings as a user-scope
 * LOCAL SOURCE entry — pi's loader then loads each vendored tree IN PLACE
 * (no copy, no symlink, no network). TWO PHASES: guard-all (one stat per
 * package, fail-fast), then register-all (ONE settings write, or a
 * zero-write no-op). Resolves void; rejects with LayoutError (the existing
 * family). */
export async function ensureOwnedExtensions(
  piTree: string,
  seams?: OwnedExtensionSeams,
): Promise<void> {
  const packages = seams?.packages ?? OWNED_EXTENSION_PACKAGES;
  const pioRoot = seams?.pioRoot ?? PIO_PACKAGE_ROOT;
  const fs = seams?.fs ?? nodeOwnedExtensionFs;

  await guardSources(fs, pioRoot, packages);
  // Registration entries: the VENDORED ABSOLUTE PATHS in roster order.
  await registerAll(
    fs,
    piTree,
    packages.map((name) => sourceDirOf(pioRoot, name)),
  );
}
