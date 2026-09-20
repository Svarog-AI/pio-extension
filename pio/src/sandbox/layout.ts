import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/** Typed layout refusal — loud failure over quiet mis-layout. */
export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

/** Global state root: `$PIO_STATE_DIR` non-empty after trim wins (the trimmed
 * value is used); otherwise `<home>/.pio`. No further normalization —
 * relative override values pass through unresolved; callers supply absolutes. */
export function resolveStateRoot(
  env: Record<string, string | undefined>,
  home: string,
): string {
  const override = env.PIO_STATE_DIR;
  const trimmed = override === undefined ? "" : override.trim();
  return trimmed.length > 0 ? trimmed : path.join(home, ".pio");
}

/** Collapse a directory path to a slug: split on "/", drop empty segments,
 * join with "-". Nothing else — no case folding, no escaping; spaces and
 * non-ASCII characters survive verbatim inside segments. */
export function slugify(p: string): string {
  return p
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("-");
}

/** Project key = slugified launch cwd (repositories play no part; no git
 * involved). Throws when the slug comes out empty — an all-slash cwd would
 * silently collapse the `projects/<key>` nesting. */
export function deriveProjectKey(cwd: string): string {
  const key = slugify(cwd);
  if (key.length === 0) {
    throw new LayoutError(
      `empty project key: cwd "${cwd}" yields no slug segments ` +
        "(all-slash cwd would collapse the projects/<key> nesting)",
    );
  }
  return key;
}

/** Test seams: clock and entropy are the ONLY nondeterministic inputs to
 * id minting — tests inject fakes to pin exact ids without real time or
 * randomness; production calls omit both and the defaults apply.
 * Defaults: Date.now() + crypto.randomBytes(4). */
export interface IdSeams {
  readonly now?: () => number;
  /** 8 lowercase hex chars (default: crypto.randomBytes(4).toString("hex")). */
  readonly entropy?: () => string;
}

/** Engagement id: compact UTC millisecond timestamp + "-" + 8 lowercase hex
 * chars (`YYYYMMDDTHHMMSSsssZ-xxxxxxxx`). Fixed width ⇒ lexicographic sort
 * equals chronological order; collisions are tolerated downstream by the
 * EEXIST-tolerant ensure (no remint loop). */
export function mintEngagementId(seams?: IdSeams): string {
  const now = seams?.now ?? Date.now;
  const entropy = seams?.entropy ?? (() => randomBytes(4).toString("hex"));
  const stamp = new Date(now()).toISOString().replace(/[-:.]/g, "");
  return `${stamp}-${entropy()}`;
}

export interface EnsureLayoutInput {
  readonly stateRoot: string;
  readonly projectKey: string;
  readonly engagementId: string;
}

/** Producer-side values for the RenderInput trio + the .sessions handles. */
export interface EngagementPaths {
  /** Echo of the input state root (what renderProfile binds ro). */
  readonly stateRoot: string;
  /** `<stateRoot>/projects/<projectKey>` — the rw overlay slot
   * (RenderInput.projectSlot). */
  readonly projectSlot: string;
  /** `<projectSlot>/engagements/<id>` — hosts profile.json
   * (RenderInput.engagementDir). */
  readonly engagementDir: string;
  /** `<engagementDir>/.sessions` — the --sessions-root value; structurally
   * identical to the renderer-computed target arg (same path.join
   * expression, so the two derivations cannot drift). */
  readonly sessionsDir: string;
  /** `<sessionsDir>/top` — fixed name "top"; child session dirs nest here. */
  readonly topSessionDir: string;
}

/** Creates the engagement tree end-to-end with ONE recursive mkdir
 * (mkdir -p semantics): the state root itself is created on first
 * engagement. Existing trees resolve cleanly — a pre-existing engagement is
 * never clobbered (pre-existing content survives byte-identical). Genuine
 * filesystem failures propagate. No index/marker/bootstrap files are ever
 * written. */
export async function ensureEngagementLayout(
  input: EnsureLayoutInput,
): Promise<EngagementPaths> {
  const projectSlot = path.join(input.stateRoot, "projects", input.projectKey);
  const engagementDir = path.join(
    projectSlot,
    "engagements",
    input.engagementId,
  );
  const sessionsDir = path.join(engagementDir, ".sessions");
  const topSessionDir = path.join(sessionsDir, "top");
  await mkdir(topSessionDir, { recursive: true });
  return {
    stateRoot: input.stateRoot,
    projectSlot,
    engagementDir,
    sessionsDir,
    topSessionDir,
  };
}
