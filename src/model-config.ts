import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { load } from "js-yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single model configuration entry (provider + model identifier). */
export interface PioModelEntry {
  provider: string;
  modelId: string;
}

/** Guard-related settings from ~/.pi/pio-config.yaml. */
export interface PioGuardsConfig {
  turnThreshold?: number;
}

/** Loop-related settings from ~/.pi/pio-config.yaml. */
export interface PioLoopConfig {
  /** Global default max iterations for all loop engine phases. Overridden by per-phase maxIterations in WorkflowPhase. */
  maxIterations?: number;
  /** When true, CustomMessage phase instructions are visible in the conversation UI (display: true). Default: false. */
  debugDisplay?: boolean;
}

/** Full config shape parsed from ~/.pi/pio-config.yaml. */
export interface PioConfig {
  default?: PioModelEntry;
  capabilities?: Record<string, PioModelEntry>;
  guards?: PioGuardsConfig;
  loop?: PioLoopConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default turn threshold before the refinement-loop nudge fires. */
export const DEFAULT_TURN_THRESHOLD = 15;

/** Default max iterations for the loop engine when no config or per-step override is specified. */
export const DEFAULT_MAX_ITERATIONS = 15;

// ---------------------------------------------------------------------------
// Config path resolution
// ---------------------------------------------------------------------------

/** Resolves the absolute path to `~/.pi/pio-config.yaml`. */
function getConfigPath(): string {
  return path.join(getHomeDir(), ".pi", "pio-config.yaml");
}

/**
 * Returns the home directory, with a test-time override via env var.
 * Tests can set `PIO_CONFIG_TEST_HOME` to point at a temp directory
 * without needing to mock native module exports.
 */
function getHomeDir(): string {
  return process.env.PIO_CONFIG_TEST_HOME ?? os.homedir();
}

// ---------------------------------------------------------------------------
// Config reading and caching
// ---------------------------------------------------------------------------

let _cachedConfig: PioConfig | undefined | null = null; // null = not yet loaded

/**
 * Validates that a parsed object looks like a proper PioModelEntry.
 * Both `provider` and `modelId` must be non-empty strings.
 */
function isValidEntry(entry: unknown): entry is PioModelEntry {
  if (entry == null || typeof entry !== "object") return false;
  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.provider === "string" &&
    obj.provider.length > 0 &&
    typeof obj.modelId === "string" &&
    obj.modelId.length > 0
  );
}

/**
 * Reads and parses ~/.pi/pio-config.yaml.
 * Returns the parsed config, or undefined if the file is missing, empty, or malformed.
 * Result is cached for the module/session lifetime.
 */
export function readConfig(): PioConfig | undefined {
  // Return cached result (including cached undefined)
  if (_cachedConfig !== null) return _cachedConfig;

  try {
    const configPath = getConfigPath();

    // File doesn't exist — no config
    if (!fs.existsSync(configPath)) {
      _cachedConfig = undefined;
      return undefined;
    }

    const raw = fs.readFileSync(configPath, "utf-8");

    // Empty or whitespace-only file
    if (!raw.trim()) {
      _cachedConfig = undefined;
      return undefined;
    }

    const parsed = load(raw);

    // Not a plain object — malformed
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      _cachedConfig = undefined;
      return undefined;
    }

    const obj = parsed as Record<string, unknown>;

    // Build validated config
    const config: PioConfig = {};

    if (obj.default != null && isValidEntry(obj.default)) {
      config.default = obj.default as PioModelEntry;
    }

    if (
      obj.capabilities != null &&
      typeof obj.capabilities === "object" &&
      !Array.isArray(obj.capabilities)
    ) {
      const caps: Record<string, PioModelEntry> = {};
      for (const [key, value] of Object.entries(obj.capabilities)) {
        if (isValidEntry(value)) {
          caps[key] = value as PioModelEntry;
        }
      }
      if (Object.keys(caps).length > 0) {
        config.capabilities = caps;
      }
    }

    // Parse guards block
    if (
      obj.guards != null &&
      typeof obj.guards === "object" &&
      !Array.isArray(obj.guards)
    ) {
      const guardsObj = obj.guards as Record<string, unknown>;
      const turnThreshold = guardsObj.turnThreshold;
      if (
        typeof turnThreshold === "number" &&
        Number.isInteger(turnThreshold) &&
        turnThreshold > 0
      ) {
        config.guards = { turnThreshold };
      }
    }

    // Parse loop block
    if (
      obj.loop != null &&
      typeof obj.loop === "object" &&
      !Array.isArray(obj.loop)
    ) {
      const loopObj = obj.loop as Record<string, unknown>;
      const loopConfig: PioLoopConfig = {};

      const maxIterations = loopObj.maxIterations;
      if (
        typeof maxIterations === "number" &&
        Number.isInteger(maxIterations) &&
        maxIterations > 0
      ) {
        loopConfig.maxIterations = maxIterations;
      }

      const debugDisplay = loopObj.debugDisplay;
      if (typeof debugDisplay === "boolean") {
        loopConfig.debugDisplay = debugDisplay;
      }

      if (Object.keys(loopConfig).length > 0) {
        config.loop = loopConfig;
      }
    }

    // If no recognized entries were found, treat as no config
    if (
      !config.default &&
      !config.capabilities &&
      !config.guards &&
      !config.loop
    ) {
      _cachedConfig = undefined;
      return undefined;
    }

    _cachedConfig = config;
    return config;
  } catch {
    // YAML parse error or any other I/O error — treat as no config
    _cachedConfig = undefined;
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the model for a given capability name.
 *
 * Resolution order (specific beats general):
 * 1. Per-capability override in config.capabilities[capabilityName]
 * 2. Default model in config.default
 * 3. undefined — no override, inherit parent's model
 */
export function resolveModelForCapability(
  capabilityName: string,
): PioModelEntry | undefined {
  const config = readConfig();
  if (!config) return undefined;

  // 1. Per-capability override
  const capEntry = config.capabilities?.[capabilityName];
  if (capEntry) return capEntry;

  // 2. Default
  if (config.default) return config.default;

  // 3. No match — inherit parent model
  return undefined;
}

// ---------------------------------------------------------------------------
// Turn threshold
// ---------------------------------------------------------------------------

/**
 * Reads the turn threshold from config, falling back to {@link DEFAULT_TURN_THRESHOLD}.
 *
 * Returns the configured value only if it is a positive integer.
 * Missing, zero, negative, non-integer, null, or non-numeric values all fall back to the default.
 */
export function readTurnThreshold(): number {
  const config = readConfig();
  const value = config?.guards?.turnThreshold;

  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return DEFAULT_TURN_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Loop config
// ---------------------------------------------------------------------------

/**
 * Reads the loop config from ~/.pi/pio-config.yaml.
 * Returns the parsed loop block, or undefined if the file is missing, empty, or has no loop section.
 */
export function readLoopConfig(): PioLoopConfig | undefined {
  const config = readConfig();
  return config?.loop;
}

/**
 * Reads debugDisplay from ~/.pi/pio-config.yaml loop block.
 * Returns true only when explicitly set to true in config.
 * Missing, non-boolean, or false values all return false (default).
 */
export function readDebugDisplay(): boolean {
  const config = readConfig();
  return config?.loop?.debugDisplay === true;
}

/**
 * Resolves the effective max iterations for a phase.
 *
 * Resolution order (specific beats general):
 * 1. perStepOverride — from WorkflowPhase.maxIterations
 * 2. Global config — loop.maxIterations in ~/.pi/pio-config.yaml
 * 3. Built-in default — DEFAULT_MAX_ITERATIONS (15)
 */
export function resolveMaxIterations(perStepOverride?: number): number {
  // Priority 1: per-step override
  if (
    typeof perStepOverride === "number" &&
    Number.isInteger(perStepOverride) &&
    perStepOverride > 0
  ) {
    return perStepOverride;
  }

  // Priority 2: global config
  const value = readLoopConfig()?.maxIterations;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  // Priority 3: built-in default
  return DEFAULT_MAX_ITERATIONS;
}
