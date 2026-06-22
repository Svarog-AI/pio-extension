/**
 * Auto-discovery for capability packages.
 *
 * Scans `src/capabilities/` for directories containing `config.ts` (the
 * package marker). Each discovered directory yields a descriptor with
 * name, path, and resolved config — ready for registration.
 *
 * Follows the same philosophy as skill discovery (`setupSkills` in
 * `index.ts`): discover from filesystem, no hardcoded names.
 *
 * This module is a leaf: it imports only from `src/capability-package.ts`
 * and Node.js stdlib. It must NOT import from `capability-session`,
 * `index.ts`, or any capability module to avoid circular dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type {
  CapabilityPackageConfig,
  CapabilityPackageDescriptor,
} from "./capability-package";
import { CAPABILITY_CONFIG_FILE } from "./capability-package";

// Re-export for downstream consumers (e.g. index.ts registration)
export type { CapabilityPackageDescriptor } from "./capability-package";

/**
 * Scan `<scanBase>/capabilities/` for capability packages and return
 * descriptors for all discovered packages.
 *
 * A capability package is a directory containing `config.ts` that
 * default-exports a `CapabilityPackageConfig`.
 *
 * @param scanBase - Directory containing the `capabilities/` folder
 *                  (e.g. `__dirname` or the project `src/` path)
 * @returns Array of descriptors for all discovered packages
 */
export async function discoverCapabilities(
  scanBase: string
): Promise<CapabilityPackageDescriptor[]> {
  const capabilitiesDir = path.join(scanBase, "capabilities");

  // If capabilities directory doesn't exist, return empty array
  if (!fs.existsSync(capabilitiesDir)) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(capabilitiesDir, { withFileTypes: true });
  } catch {
    // Directory unreadable — return empty array
    return [];
  }

  const descriptors: CapabilityPackageDescriptor[] = [];

  for (const entry of entries) {
    // Only scan directories — ignore .ts files (old-style capabilities)
    if (!entry.isDirectory()) {
      continue;
    }

    const dirPath = path.join(capabilitiesDir, entry.name);

    // Check for the marker file (config.ts)
    const configPath = path.join(dirPath, CAPABILITY_CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
      continue;
    }

    // Try to dynamically import the config module
    try {
      const mod = await import(configPath);
      const config: CapabilityPackageConfig | undefined = mod.default;

      if (!config) {
        console.warn(
          `[pio] Capability "${entry.name}" has config.ts but no default export — skipping`
        );
        continue;
      }

      descriptors.push({
        name: entry.name,
        dirPath,
        config,
      });
    } catch (err) {
      console.warn(
        `[pio] Failed to load config for capability "${entry.name}": ${err instanceof Error ? err.message : String(err)} — skipping`
      );
    }
  }

  return descriptors;
}

/**
 * Register a single capability by calling its `register(pi)` export.
 *
 * Re-imports the same `config.ts` file that `discoverCapabilities()` already
 * loaded — Node.js ESM cache returns the cached module, so the `register`
 * named export is available alongside the default export.
 *
 * @param pi - The pi ExtensionAPI instance
 * @param descriptor - Descriptor from `discoverCapabilities()`
 */
export async function registerCapability(
  pi: ExtensionAPI,
  descriptor: CapabilityPackageDescriptor,
): Promise<void> {
  const configPath = path.join(descriptor.dirPath, CAPABILITY_CONFIG_FILE);
  try {
    // Re-import the same file (ESM cache returns cached module)
    const mod = await import(configPath);
    if (typeof mod.register !== "function") {
      console.warn(
        `[pio] Capability "${descriptor.name}" has no register() export — skipping registration`
      );
      return;
    }
    mod.register(pi);
  } catch (err) {
    console.warn(
      `[pio] Failed to register capability "${descriptor.name}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
