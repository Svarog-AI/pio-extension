import { randomBytes } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { PIO_PACKAGE_ROOT } from "../constants.ts";
import { LayoutError } from "./layout.ts";

/**
 * Owned-extension provisioning (D1/SR3) — idempotent materialization of the
 * OWED pi-extension packages into the isolated agent dir, so EVERY sandboxed
 * session gains their tools through pi's ordinary disk-backed extension
 * loading. Parameterized over the package name — every mechanic derives from
 * the name + these pinned-dist rules (measured against the exact-pinned
 * @earendil-works/pi-coding-agent 0.85.1 dist under pio/node_modules/…,
 * 2026-09-25 — measurement over citation):
 * - getManagedNpmInstallPath: a user-scope `npm:` source resolves to EXACTLY
 *   join(agentDir, "npm", "node_modules", source.name) ⇒ targetDirOf.
 * - resolvePackageSources / installedNpmMatchesConfiguredVersion: an UNPINNED
 *   `"npm:<name>"` entry matches whenever the installed package.json carries
 *   ANY version (no registry metadata while the path exists; a missing
 *   source is skipped SILENTLY offline) ⇒ provisioning owns existence AND
 *   version match.
 * - getSettingsPath() = join(getAgentDir(), "settings.json"); getAgentDir()
 *   honors $PI_CODING_AGENT_DIR read at CALL time — the renderer sets it
 *   UNCONDITIONALLY to <stateRoot>/.pi/agent ⇒ the settings upserted here is
 *   the bubble sessions' GLOBAL settings.
 *
 * Steady state is a TOTAL NO-OP (probes only, ZERO writes). All failures
 * throw the layout-error family (run.ts's existing handler). Corrupted
 * INSTALLED trees self-heal (wipe + re-copy — pure pio materialization);
 * a corrupted SETTINGS file refuses loud and untouched (it is an
 * accumulator, not a pure function of pio's inputs).
 */

/** Explicit owned-extension roster — the ONLY packages ever materialized
 * into bubbles. Deliberately NOT derived from pio's manifest (the pi SDK
 * itself is a dependency and must never be copied into the bubble). Adding
 * a package later = exact-pinned owned dep line + roster entry + suite rows
 * (each carrying its own constraint-5 approval). */
export const OWNED_EXTENSION_PACKAGES: readonly string[] = ["pi-native-search"];

/** Link-kind classification shared by lstatKind/listEntries: symlinks
 * report "symlink" (never resolved), absence reports "absent". */
export type FsEntryKind = "absent" | "directory" | "symlink" | "file" | "other";

/** Minimal op surface the materialization drives over (injectable, à la
 * fsView): existence / listing-with-types / read / write / mkdir / copy /
 * remove / link-kind detection. Production default: the node-backed
 * implementation below; unit rows drive it over fabricated temp roots. */
export interface OwnedExtensionFs {
  /** Read a file as UTF-8 text (rejects on absence/fault). */
  readonly readFile: (file: string) => Promise<string>;
  /** Write text to a file (parent must already exist). */
  readonly writeFile: (file: string, data: string) => Promise<void>;
  /** Recursive mkdir (mkdir -p semantics). */
  readonly mkdir: (dir: string) => Promise<void>;
  /** Recursively remove a tree (tolerates absence). */
  readonly rmTree: (dir: string) => Promise<void>;
  /** Remove a single file (caller tolerates absence). */
  readonly unlink: (file: string) => Promise<void>;
  /** Recursively copy a tree: regular files byte-exact; symlinks recreated
   * AS links, never dereferenced (escaping content stays behind). */
  readonly copyTree: (source: string, target: string) => Promise<void>;
  /** Same-directory rename (the atomic settings-write guarantee). */
  readonly rename: (from: string, to: string) => Promise<void>;
  /** Link-kind inspection of ONE path (existence included). */
  readonly lstatKind: (target: string) => Promise<FsEntryKind>;
  /** Directory listing WITH entry kinds (symlinks reported, not followed). */
  readonly listEntries: (
    dir: string,
  ) => Promise<
    ReadonlyArray<{ readonly name: string; readonly kind: FsEntryKind }>
  >;
}

/** Structural view over the node stat-like reporters (Stats AND Dirent
 * expose the same three predicates) — symlinks are checked FIRST so a link
 * is never misclassified as the kind it points at. */
interface KindReporter {
  readonly isSymbolicLink: () => boolean;
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
}

function statsKind(stats: KindReporter): FsEntryKind {
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return "other";
}

/** Node-backed implementation over the required fs surface (production
 * default — every row-testable without mocks over temp paths). */
export const nodeOwnedExtensionFs: OwnedExtensionFs = {
  readFile: (file) => readFile(file, "utf8"),
  writeFile: (file, data) => writeFile(file, data),
  // The recursive overload resolves THE first-created dir — dropped here:
  // the seam contract is a plain mkdir -p (no consumer needs the result).
  mkdir: async (dir) => {
    await mkdir(dir, { recursive: true });
  },
  rmTree: (dir) => rm(dir, { recursive: true, force: true }),
  unlink: (file) => unlink(file),
  // cp defaults: dereference=false ⇒ symlinks are recreated as links (the
  // post-copy sweep then rejects any that escaped into the tree).
  copyTree: (source, target) => cp(source, target, { recursive: true }),
  rename: (from, to) => rename(from, to),
  lstatKind: async (target) => {
    try {
      return statsKind(await lstat(target));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return "absent";
      throw cause;
    }
  },
  listEntries: async (dir) =>
    (await readdir(dir, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      kind: statsKind(entry),
    })),
};

/** Injectable seams — each default applies lazily (à la fsView/checkBwrap). */
export interface OwnedExtensionSeams {
  /** Default: OWNED_EXTENSION_PACKAGES (the explicit roster above). */
  readonly packages?: readonly string[];
  /** Default: PIO_PACKAGE_ROOT (single source of truth, src/constants.ts).
   * Owns the manifest read (expected versions) AND the source trees — no
   * registry, no install, no network. */
  readonly pioRoot?: string;
  /** Default: the node-backed op surface above. */
  readonly fs?: OwnedExtensionFs;
}

/** Exactness predicate: an owned pin is EXACT when it is a BARE version
 * (digits.dots with optional -/+ suffixes) — no ^/~/>/</= operators, no
 * dist-tags, no wildcards or OR-clauses. You cannot provision a package pio
 * has not owned EXACTLY. */
const EXACT_PIN_PATTERN = /^\d+(\.\d+)*(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

interface PinnedPackage {
  readonly name: string;
  readonly expectedVersion: string;
  readonly sourceDir: string;
  readonly targetDir: string;
}

const targetDirOf = (piTree: string, name: string): string =>
  path.join(piTree, "agent", "npm", "node_modules", name);
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

async function probeInstalledVersion(
  fs: OwnedExtensionFs,
  targetDir: string,
): Promise<string | null> {
  const manifestPath = path.join(targetDir, "package.json");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath);
  } catch {
    // Absent / unreadable ⇒ treated as STALE (self-healing re-copy below).
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null; // malformed ⇒ stale
  }
}

/** Verify pio's OWN copy BEFORE trusting it (recopy path ONLY — the skip
 * path reads the source NOTHING; documented blind spot: a physically
 * drifted source with a matching installed version serves as-is until the
 * next re-copy trigger). */
async function verifySource(
  fs: OwnedExtensionFs,
  sourceDir: string,
  expectedVersion: string,
): Promise<void> {
  const kind = await fs.lstatKind(sourceDir);
  if (kind !== "directory") {
    throw new LayoutError(
      `owned extension source is missing: ${sourceDir} — reinstall pio's ` +
        "dependencies (run npm install in the pio package root)",
    );
  }
  const manifestPath = path.join(sourceDir, "package.json");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath);
  } catch {
    throw new LayoutError(
      `owned extension source manifest is unreadable: ${manifestPath} — ` +
        "reinstall pio's dependencies",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LayoutError(
      `owned extension source manifest is malformed JSON: ${manifestPath} — ` +
        "reinstall pio's dependencies",
    );
  }
  const version = (parsed as { version?: unknown }).version;
  if (typeof version !== "string" || version !== expectedVersion) {
    throw new LayoutError(
      `owned extension source drifted from the pio manifest: ${manifestPath} ` +
        `carries version ${JSON.stringify(version ?? null)} but ` +
        `pio/package.json declares ${JSON.stringify(expectedVersion)} — ` +
        "reinstall pio's dependencies to resynchronize the owned copy",
    );
  }
}

/** Post-copy DEFENSIVE invariant: any symlink in the materialized tree is
 * refused naming the offending link — targets outside the bubble namespace
 * cannot follow it. The measured 0.1.0 tarball ships none; the sweep trips
 * nowhere in practice. */
async function assertNoSymlinks(
  fs: OwnedExtensionFs,
  targetDir: string,
): Promise<void> {
  const entries = await fs.listEntries(targetDir);
  for (const entry of entries) {
    const full = path.join(targetDir, entry.name);
    if (entry.kind === "symlink") {
      throw new LayoutError(
        `materialized tree contains a symlink (refused — targets outside ` +
          `the bubble namespace cannot follow it): ${full}`,
      );
    }
    if (entry.kind === "directory") await assertNoSymlinks(fs, full);
  }
}

/** Phase 2 — register the WHOLE roster in ONE read-modify-write on the
 * bubble sessions' global settings file. Missing file ⇒ minimal shape;
 * everything else (keys, entry order, foreign values) preserved verbatim;
 * nothing missing ⇒ NO write at all (steady-state zero-write pin).
 * Written atomically: unique temp sibling IN THE SAME DIRECTORY, then
 * rename over the final name. A killed launch may leave the stray sibling
 * behind — harmless (unique names; the loader ignores strays). */
async function registerSettings(
  fs: OwnedExtensionFs,
  piTree: string,
  packages: readonly string[],
): Promise<void> {
  const settingsPath = settingsPathOf(piTree);
  const kind = await fs.lstatKind(settingsPath);
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

  let entries: unknown[];
  if ("packages" in doc) {
    if (!Array.isArray(doc.packages)) {
      throw new LayoutError(
        `settings "packages" is not an array — refusing to modify it: ` +
          `${settingsPath} (repair the file by hand)`,
      );
    }
    entries = doc.packages as unknown[];
  } else {
    entries = [];
  }

  // Append EXACTLY the missing roster entries, in roster order, deduplicated
  // (a pre-existing entry is never doubled; non-string foreign entries pass
  // through verbatim — strict-equality membership only).
  const missing = packages
    .map((name) => `npm:${name}`)
    .filter((entry) => !entries.some((existing) => existing === entry));
  if (missing.length === 0) return; // NOTHING missing ⇒ NO write at all

  doc.packages = [...entries, ...missing];
  // ensurePiTree creates only <piTree> — make the parent ourselves first.
  await fs.mkdir(path.dirname(settingsPath));
  const serialized = `${JSON.stringify(doc, null, 2)}\n`;
  // Atomic write: unique temp sibling, then rename (same-directory rename
  // is the atomic guarantee).
  const tempPath = `${settingsPath}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.writeFile(tempPath, serialized);
    await fs.rename(tempPath, settingsPath);
  } catch (cause) {
    await fs.unlink(tempPath).catch(() => undefined); // best-effort cleanup
    throw toLayoutError(`writing the settings file (${settingsPath})`, cause);
  }
}

/** Idempotent materialization of EVERY roster package into the isolated
 * agent dir rooted at `piTree` (THE handle returned by ensurePiTree) +
 * their enabling settings entries. TWO PHASES: materialize-all (per-package
 * skip/recopy, roster order), then register-all (ONE settings write). A
 * Phase-1 failure registers NOTHING and leaves sibling packages untouched
 * (retryable next launch — idempotent self-heal); a Phase-2 failure leaves
 * all copies intact. Resolves void; rejects with LayoutError. */
export async function ensureOwnedExtensions(
  piTree: string,
  seams?: OwnedExtensionSeams,
): Promise<void> {
  const packages = seams?.packages ?? OWNED_EXTENSION_PACKAGES;
  const pioRoot = seams?.pioRoot ?? PIO_PACKAGE_ROOT;
  const fs = seams?.fs ?? nodeOwnedExtensionFs;

  // Manifest read ONCE PER CALL, shared across the roster — never a
  // hardcoded literal: the pin rides the artifact manifest/lockfile.
  const pioManifestPath = path.join(pioRoot, "package.json");
  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(pioManifestPath);
  } catch (cause) {
    throw toLayoutError(`reading the pio manifest (${pioManifestPath})`, cause);
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    throw new LayoutError(
      `pio manifest is malformed JSON: ${pioManifestPath} — reinstall pio`,
    );
  }
  const dependencies: Record<string, unknown> = (() => {
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      Array.isArray(manifest)
    ) {
      return {};
    }
    const deps = (manifest as { dependencies?: unknown }).dependencies;
    return typeof deps === "object" && deps !== null && !Array.isArray(deps)
      ? (deps as Record<string, unknown>)
      : {};
  })();

  // Exact-owned-dep guard (fail-fast, PRE-materialization): any roster name
  // whose dependencies[name] is ABSENT or not an EXACT bare version (range/
  // dist-tag/non-string) is refused naming the package + remedy — nothing
  // is touched before this gate passes.
  const pinned: PinnedPackage[] = [];
  for (const name of packages) {
    const declared = dependencies[name];
    if (typeof declared !== "string" || !EXACT_PIN_PATTERN.test(declared)) {
      throw new LayoutError(
        `roster package "${name}" is not an EXACT owned dependency of pio ` +
          `(dependencies.${name} is ${JSON.stringify(declared)}) — pin it ` +
          "EXACTLY in pio/package.json first",
      );
    }
    pinned.push({
      name,
      expectedVersion: declared,
      sourceDir: path.join(pioRoot, "node_modules", name),
      targetDir: targetDirOf(piTree, name),
    });
  }

  // Phase 1 — materialize (per name, roster order): the installed version
  // EQUALS the owned pin ⇒ FRESH: no copy, no byte touched (even externally
  // mutated content survives — trust-installed; the skip path touches the
  // source NOTHING). Absent / stale / unprobeable ⇒ wipe + fresh re-copy of
  // the WHOLE package dir (lossless — the installed tree is a pure pio
  // materialization) + the post-copy symlink sweep.
  for (const pkg of pinned) {
    const installed = await probeInstalledVersion(fs, pkg.targetDir);
    if (installed === pkg.expectedVersion) continue;
    try {
      await verifySource(fs, pkg.sourceDir, pkg.expectedVersion);
      await fs.rmTree(pkg.targetDir); // ENOENT tolerated by the op contract
      await fs.copyTree(pkg.sourceDir, pkg.targetDir);
      await assertNoSymlinks(fs, pkg.targetDir);
    } catch (cause) {
      if (cause instanceof LayoutError) throw cause; // typed refusals keep their lines
      throw toLayoutError(
        `materializing "${pkg.name}" from ${pkg.sourceDir} into ${pkg.targetDir}`,
        cause,
      );
    }
  }

  // Phase 2 — register (ONLY after every Phase-1 materialization succeeded).
  try {
    await registerSettings(fs, piTree, packages);
  } catch (cause) {
    if (cause instanceof LayoutError) throw cause;
    throw toLayoutError(
      `registering the roster in ${settingsPathOf(piTree)}`,
      cause,
    );
  }
}
