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

/** Full config shape parsed from ~/.pi/pio-config.yaml. */
export interface PioConfig {
  default?: PioModelEntry;
  capabilities?: Record<string, PioModelEntry>;
  guards?: PioGuardsConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default turn threshold before the refinement-loop nudge fires. */
export const DEFAULT_TURN_THRESHOLD = 15;

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
    typeof obj.provider === "string" && obj.provider.length > 0 &&
    typeof obj.modelId === "string" && obj.modelId.length > 0
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

    if (obj.capabilities != null && typeof obj.capabilities === "object" && !Array.isArray(obj.capabilities)) {
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
    if (obj.guards != null && typeof obj.guards === "object" && !Array.isArray(obj.guards)) {
      const guardsObj = obj.guards as Record<string, unknown>;
      const turnThreshold = guardsObj.turnThreshold;
      if (typeof turnThreshold === "number" && Number.isInteger(turnThreshold) && turnThreshold > 0) {
        config.guards = { turnThreshold };
      }
    }

    // If no recognized entries were found, treat as no config
    if (!config.default && !config.capabilities && !config.guards) {
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
export function resolveModelForCapability(capabilityName: string): PioModelEntry | undefined {
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
