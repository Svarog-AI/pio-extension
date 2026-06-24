import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// PIO root directory (global, initialized at extension startup)
// ---------------------------------------------------------------------------

let _pioRootDir: string | undefined;

/**
 * Initialize the global pioRootDir to `<cwd>/.pio/`.
 * Must be called once during extension startup (src/index.ts).
 * Throws if called more than once.
 */
export function initializePioRootDir(cwd: string): void {
  if (_pioRootDir !== undefined) {
    throw new Error("pioRootDir already initialized");
  }
  _pioRootDir = path.join(cwd, ".pio");
}

/**
 * Return the global pioRootDir (`<cwd>/.pio/`).
 * Throws if called before `initializePioRootDir()`.
 */
export function getPioRootDir(): string {
  if (_pioRootDir === undefined) {
    throw new Error("pioRootDir not initialized. Call initializePioRootDir(cwd) at extension startup.");
  }
  return _pioRootDir;
}

/**
 * Reset pioRootDir for testing. Allows re-initialization.
 * @internal — Do not use in production code.
 */
export function __testResetPioRootDir(): void {
  _pioRootDir = undefined;
}

/**
 * Reset the global pioRootDir to undefined.
 * Intended for tests only — allows re-initialization between test suites.
 */
export function __resetPioRootDir(): void {
  _pioRootDir = undefined;
}

// ---------------------------------------------------------------------------
// Goal directory helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a goal workspace path.
 *
 * When `parentStepDir` is omitted, returns the flat path `<cwd>/.pio/goals/<name>`.
 * When `parentStepDir` is provided, returns `<parentStepDir>/subgoals/<name>`
 * for nested subgoal workspaces.
 */
export function resolveGoalDir(cwd: string, name: string, parentStepDir?: string): string {
  if (parentStepDir !== undefined) {
    return path.join(parentStepDir, "subgoals", name);
  }
  return path.join(cwd, ".pio", "goals", name);
}

/** Check if a goal workspace exists. */
export function goalExists(goalDir: string): boolean {
  return fs.existsSync(goalDir);
}

/**
 * Prepare the goal workspace (mkdir).
 * Returns { goalDir, ready } — ready is false if directory already exists.
 */
export function prepareGoal(name: string, cwd: string): { goalDir: string; ready: boolean } {
  const goalDir = resolveGoalDir(cwd, name);

  if (goalExists(goalDir)) {
    return { goalDir, ready: false };
  }

  fs.mkdirSync(goalDir, { recursive: true });
  return { goalDir, ready: true };
}

// ---------------------------------------------------------------------------
// Issue utilities
// ---------------------------------------------------------------------------

/** Returns the path to `.pio/issues/`, creating it if needed. */
export function issuesDir(cwd: string): string {
  const dir = path.join(cwd, ".pio", "issues");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Resolve an issue identifier to a full filesystem path.
 * Accepts a slug (`my-issue`), filename (`my-issue.md`), or relative/absolute path.
 * Returns `undefined` if not found.
 */
export function findIssuePath(cwd: string, identifier: string): string | undefined {
  // Absolute path — check directly
  if (path.isAbsolute(identifier) && fs.existsSync(identifier)) {
    return identifier;
  }

  const dir = path.join(cwd, ".pio", "issues");
  const basename = path.basename(identifier);

  // Exact filename match (e.g. `my-issue.md`)
  const exact = path.join(dir, basename);
  if (fs.existsSync(exact)) return exact;

  // Bare slug — append .md (e.g. `my-issue` → `my-issue.md`)
  if (!basename.endsWith(".md")) {
    const withExt = path.join(dir, basename + ".md");
    if (fs.existsSync(withExt)) return withExt;
  }

  return undefined;
}

/**
 * Read an issue file by identifier. Returns the file contents or `undefined` if not found.
 */
export function readIssue(cwd: string, identifier: string): string | undefined {
  const filePath = findIssuePath(cwd, identifier);
  if (!filePath) {
    return undefined;
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// Session name derivation
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable session name from goal name, capability, and optional step number.
 *
 * Format:
 * - `<goal-name> <capability> s{N}` when all three are present
 * - `<goal-name> <capability>` when only goal name is present
 * - `<capability>` for non-goal sessions (empty or missing goalName)
 */
export function deriveSessionName(goalName: string, capability: string, stepNumber?: number): string {
  if (!goalName) return capability;

  // Replace __ delimiters with / for display (hierarchical queue keys from subgoals)
  const displayName = goalName.replace(/__/g, "/");

  let name = `${displayName} ${capability}`;
  if (typeof stepNumber === "number") {
    name += ` s${stepNumber}`;
  }
  return name;
}

// ---------------------------------------------------------------------------
// Step folder helpers
// ---------------------------------------------------------------------------

/** Format a step number as a zero-padded folder name (S01, S02, ...). */
export function stepFolderName(stepNumber: number): string {
  return `S${String(stepNumber).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Step discovery
// ---------------------------------------------------------------------------

/**
 * Auto-discover the next step number by scanning for completed step folders.
 * A step folder is considered complete when it contains both TASK.md and TEST.md.
 * Returns N+1 where N is the highest complete step (or 1 if none found).
 */
export function discoverNextStep(goalDir: string): number {
  const TASK_FILE = "TASK.md";
  const TEST_FILE = "TEST.md";

  let highestDefined = 0;
  for (let i = 1; ; i++) {
    const folder = stepFolderName(i);
    const stepDir = path.join(goalDir, folder);
    if (!fs.existsSync(stepDir)) {
      // No more step folders — stop scanning.
      break;
    }
    if (
      fs.existsSync(path.join(stepDir, TASK_FILE)) &&
      fs.existsSync(path.join(stepDir, TEST_FILE))
    ) {
      highestDefined = i;
    }
  }

  return highestDefined + 1;
}
