import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { load } from "js-yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Successful result from an acli invocation. */
export interface AcliResult {
  stdout: Record<string, unknown>;
  stderr?: string;
  exitCode: number;
}

/** Error result from an acli invocation (discriminated by `error` field). */
export interface AcliError {
  error: string;
  stdout?: Record<string, unknown>;
  stderr?: string;
  exitCode: number;
}

/** Parsed Jira config from `.pio/jira-config.yaml`. */
export interface JiraConfig {
  projectKey?: string;
  defaultType?: string;
}

// ---------------------------------------------------------------------------
// runAcli — spawn acli, parse JSON, detect errors
// ---------------------------------------------------------------------------

/**
 * Spawn `acli` as a child process with the given arguments.
 *
 * Returns a discriminated union: `AcliResult` on success, `AcliError` on failure.
 * Presence of the `error` field distinguishes the two.
 *
 * Error cases:
 * - `acli` not found on PATH (ENOENT) → helpful installation message
 * - "unauthorized" in stdout or stderr → directs to `acli jira auth login`
 * - Non-JSON output → includes raw stderr in error message
 */
export async function runAcli(
  cwd: string,
  args: string[],
): Promise<AcliResult | AcliError> {
  return new Promise((resolve) => {
    const child = spawn("acli", args, { cwd });

    let stdoutData = "";
    let stderrData = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    child.on("error", (err: Error) => {
      // ENOENT — acli not found on PATH
      if (err.message.includes("ENOENT")) {
        resolve({
          error: `acli is not installed or not on PATH. Install it with: npm install -g @atlassianlabs/atlassian-cli`,
          exitCode: -1,
        });
        return;
      }

      // Check for unauthorized in error message
      if (/unauthorized/i.test(err.message)) {
        resolve({
          error: `Authentication required. Run 'acli jira auth login' to authenticate.`,
          exitCode: -1,
          stderr: err.message,
        });
        return;
      }

      resolve({
        error: err.message,
        exitCode: -1,
      });
    });

    child.on("close", (exitCode) => {
      // Check for unauthorized in stdout or stderr (case-insensitive)
      if (/unauthorized/i.test(stdoutData) || /unauthorized/i.test(stderrData)) {
        resolve({
          error: `Authentication required. Run 'acli jira auth login' to authenticate.`,
          stderr: stderrData || undefined,
          exitCode: exitCode ?? 1,
        });
        return;
      }

      // Try to parse stdout as JSON
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdoutData);
      } catch {
        resolve({
          error: `Failed to parse acli output as JSON. Raw output: ${stderrData || stdoutData}`,
          stderr: stderrData || undefined,
          exitCode: exitCode ?? 1,
        });
        return;
      }

      resolve({
        stdout: parsed,
        stderr: stderrData || undefined,
        exitCode: exitCode ?? 0,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// readJiraConfig — read and validate .pio/jira-config.yaml
// ---------------------------------------------------------------------------

/**
 * Reads `.pio/jira-config.yaml` from the given working directory.
 *
 * Returns `undefined` when the file doesn't exist, is empty, or is malformed YAML.
 * Validates that `projectKey` and `defaultType` are strings if present.
 */
export function readJiraConfig(cwd: string): JiraConfig | undefined {
  const configPath = path.join(cwd, ".pio", "jira-config.yaml");

  try {
    // File doesn't exist — no config
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    const raw = fs.readFileSync(configPath, "utf-8");

    // Empty or whitespace-only file
    if (!raw.trim()) {
      return undefined;
    }

    const parsed = load(raw);

    // Not a plain object — malformed
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const obj = parsed as Record<string, unknown>;

    // Validate fields are strings if present
    const projectKey = obj.projectKey;
    const defaultType = obj.defaultType;

    if (projectKey != null && typeof projectKey !== "string") {
      return undefined;
    }

    if (defaultType != null && typeof defaultType !== "string") {
      return undefined;
    }

    // If no recognized fields, treat as no config
    if (projectKey == null && defaultType == null) {
      return undefined;
    }

    const config: JiraConfig = {};
    if (typeof projectKey === "string") config.projectKey = projectKey;
    if (typeof defaultType === "string") config.defaultType = defaultType;

    return config;
  } catch {
    // YAML parse error or any other I/O error — treat as no config
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// jiraKeyToSlug — derive local issue slug from Jira ticket key
// ---------------------------------------------------------------------------

/**
 * Derives a local issue slug from a Jira ticket key.
 *
 * Converts the key to lowercase and prefixes with `jira-`.
 * Example: `PROJ-123` → `jira-proj-123`
 */
export function jiraKeyToSlug(key: string): string {
  return `jira-${key.toLowerCase()}`;
}
