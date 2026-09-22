import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { SandboxProfile, TargetCommand } from "./profile.ts";

/** Spawn-time launch value (not the persisted artifact) — derived in memory
 * at launch from the rendered profile; its executable form is re-derived
 * deterministically, by the same path, at replay. */
export interface BwrapCommand {
  /** Full spawn vector INCLUDING the bare "bwrap" head as element 0: a
   * spawner passes `argv[0]` as the executable and `argv.slice(1)` as the
   * arguments (Node `spawn(file, args)` semantics), never prepending a
   * second "bwrap". */
  readonly argv: readonly string[];
  /** Ordered structured mirror of the --setenv pairs (key, value tuples). */
  readonly envSet: readonly [string, string][];
  /** Mirror of the post-"--" target vector — consumers never re-parse tokens. */
  readonly target: TargetCommand;
}

/** Pure, total token builder: strictly determined by its argument. Order:
 * head → base flags (verbatim) → one same-path bind triplet per mount in
 * declaration order → --chdir → --setenv pairs in stored order → single "--"
 * → target vector verbatim. */
export function buildArgv(profile: SandboxProfile): BwrapCommand {
  const argv: string[] = ["bwrap"];
  for (const flag of profile.baseFlags) {
    argv.push(flag);
  }
  for (const mount of profile.mounts) {
    // v1 entries are same-path binds: one path serves source AND destination.
    argv.push(
      mount.mode === "ro" ? "--ro-bind" : "--bind",
      mount.sourcePath,
      mount.sourcePath,
    );
  }
  argv.push("--chdir", profile.chdir);
  const envSet: [string, string][] = [];
  for (const assignment of profile.env) {
    argv.push("--setenv", assignment.key, assignment.value);
    envSet.push([assignment.key, assignment.value]);
  }
  argv.push("--");
  argv.push(profile.target.executable);
  for (const arg of profile.target.args) {
    argv.push(arg);
  }
  return { argv, envSet, target: profile.target };
}

/** Canonical persistence encoding of the structured profile — the
 * `profile.json` content. Built as an explicit object literal with pinned
 * member insertion order (baseFlags → mounts → env → chdir → target), so the
 * output is stable for ANY profile value, then rendered 2-space indented
 * with a trailing newline (byte-stable under a JSON.parse round-trip). */
export function serializeProfile(profile: SandboxProfile): string {
  const canonical = {
    baseFlags: [...profile.baseFlags],
    mounts: profile.mounts.map((mount) => ({
      sourcePath: mount.sourcePath,
      mode: mount.mode,
    })),
    env: profile.env.map((assignment) => ({
      key: assignment.key,
      value: assignment.value,
    })),
    chdir: profile.chdir,
    target: {
      executable: profile.target.executable,
      args: [...profile.target.args],
    },
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/** On-disk artifact name for the retained profile document — next to
 * `serializeProfile`, whose output it stores. */
export const PROFILE_FILE_NAME = "profile.json";

/** Retains the profile document post-finish — consulting evidence (what
 * mounts this engagement saw) and replayable seed (load → `buildArgv` →
 * exec, the same deterministic path as the live launch). Overwrite-safe by
 * construction: deterministic bytes for the same profile value. The sole
 * file write of this module. */
export async function writeProfileFile(
  engagementDir: string,
  profile: SandboxProfile,
): Promise<void> {
  await writeFile(
    path.join(engagementDir, PROFILE_FILE_NAME),
    serializeProfile(profile),
    "utf8",
  );
}

/** Launch-time transparency print: the rendered profile as reviewable lines
 * — header + sections in serialized member order (baseFlags → mounts → env
 * → chdir → target), every variable token JSON-quoted, empty collections
 * inline `(none)`, target ALWAYS last. Reviewer-facing completeness proof;
 * the structured profile stays the only consumable form. */
export function formatProfileLines(profile: SandboxProfile): readonly string[] {
  const lines: string[] = [];
  lines.push("sandbox profile:");
  if (profile.baseFlags.length === 0) {
    lines.push("  baseFlags: (none)");
  } else {
    lines.push(
      `  baseFlags: ${profile.baseFlags.map((flag) => JSON.stringify(flag)).join(" ")}`,
    );
  }
  if (profile.mounts.length === 0) {
    lines.push("  mounts: (none)");
  } else {
    lines.push("  mounts:");
    for (const mount of profile.mounts) {
      lines.push(`    [${mount.mode}] ${JSON.stringify(mount.sourcePath)}`);
    }
  }
  if (profile.env.length === 0) {
    lines.push("  env: (none)");
  } else {
    lines.push("  env:");
    for (const assignment of profile.env) {
      lines.push(
        `    ${JSON.stringify(assignment.key)}=${JSON.stringify(assignment.value)}`,
      );
    }
  }
  lines.push(`  chdir: ${JSON.stringify(profile.chdir)}`);
  lines.push(
    `  target: ${JSON.stringify(profile.target.executable)}${
      profile.target.args.length === 0
        ? ""
        : ` ${profile.target.args.map((arg) => JSON.stringify(arg)).join(" ")}`
    }`,
  );
  return lines;
}
