/** One authored extra mount: explicit path + explicit read-only flag. */
export interface ExtraMount {
  path: string;
  readOnly?: boolean;
}

/** Seeded mount-section origins (production table or parsed fixture). */
export interface MountSources {
  readonly readOnly: readonly string[];
  readonly readWrite: readonly string[];
  readonly extraMounts: readonly ExtraMount[];
}

/** Authored sandbox config document (the user-side inventory schema), pre-render.
 * Different shape and stage than `SandboxProfile`: this is what a human or
 * loader authors; the renderer turns it into one per-engagement recipe. */
export interface SandboxConfig {
  readonly readOnly?: readonly string[];
  readonly readWrite?: readonly string[];
  readonly extraMounts?: readonly ExtraMount[];
  readonly path?: readonly string[];
  readonly env?: Record<string, string>;
}

/** One fully-expanded mount, in bind order (later entries overlay earlier). */
export interface MountEntry {
  readonly sourcePath: string;
  readonly mode: "ro" | "rw";
}

/** One env assignment, in emission order. */
export interface EnvAssignment {
  readonly key: string;
  readonly value: string;
}

/** Target command — the top process started inside the namespace. */
export interface TargetCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

/** Fully-expanded, existence-checked, order-fixed namespace recipe produced by
 * `renderProfile` from the authored config `SandboxConfig` + production defaults.
 * The post-render stage of the same pipeline: consumed by downstream serialization,
 * never authored directly. */
export interface SandboxProfile {
  readonly baseFlags: readonly string[];
  readonly mounts: readonly MountEntry[];
  readonly env: readonly EnvAssignment[];
  readonly chdir: string;
  readonly target: TargetCommand;
}

/** Standard PATH base list — v1 default (no config rides). */
export const STANDARD_PATH_BASE: readonly string[] = [
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
];

/** Conservative-default mount sources (current production seed). Config
 * material — moves into a sandbox config file when the loader lands. */
export function conservativeDefaultSources(uid: number): MountSources {
  return {
    readOnly: [
      "/usr", // inventory readOnly[0]
      "/lib", // inventory readOnly[1]
      "/lib64", // inventory readOnly[2]
      "/bin", // inventory readOnly[3]
      "~/.gitconfig", // inventory readOnly[4]
      // inventory readOnly[5] — authored glob; resolved through the FsView seam
      "~/.vscode/extensions/pi0.pi-vscode*",
      "~/git", // inventory readOnly[6]
      "~/.config", // inventory readOnly[7]
      "~/.ssh", // inventory readOnly[8]
      "~/.pyenv", // inventory readOnly[9]
      "~/.cache/pypoetry", // inventory readOnly[10]
      "/opt/google/chrome", // inventory readOnly[11]
      "/etc/alternatives", // inventory readOnly[12]
      "/etc/java-21-openjdk", // inventory readOnly[13]
      "/etc/maven", // inventory readOnly[14]
      "/etc/passwd", // inventory readOnly[15]
      // inventory readOnly[16] — uid computed from the argument, not hardcoded
      `/run/user/${uid}/gnupg`,
      // inventory readOnly[17] — uid computed from the argument, not hardcoded
      `/run/user/${uid}/bus`,
      "~/.local/bin", // inventory readOnly[18]
    ],
    readWrite: [], // deliberate: no personal rw writers seeded — the named-consumer writable surface composes normatively in the renderer's pio-state section, not as seeded material
    extraMounts: [],
  };
}
