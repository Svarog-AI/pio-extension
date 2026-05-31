/**
 * pio — Evolving extension for pi
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Direct tools (non-AI tools/commands registered directly)
import { setupDirectTools } from "./direct-tools";

// Non-directory capabilities (single .ts files, not auto-discovered)
import { setupNextTask } from "./capabilities/next-task";

// Shared session infrastructure (explicit imports)
import { setupSessionInfrastructure } from "./capability-session";
import { setupMarkComplete } from "./guards/mark-complete";
import { setupValidation } from "./guards/validation";
import { setupSessionGuard } from "./guards/session-guard";

// Auto-discovery
import { discoverCapabilities, registerCapability } from "./capability-discovery";

// ESM-compatible __dirname for resolving skill directories bundled with this extension
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_DIR = path.join(__dirname, "skills");

/**
 * Discover skills by scanning SKILLS_DIR for subdirectories containing SKILL.md.
 * Registers a resources_discover handler that returns the discovered skill paths.
 * No hardcoded skill names — adding a new skill requires only creating its directory and SKILL.md.
 */
function setupSkills(api: ExtensionAPI): void {
  const skillPaths: string[] = [];

  try {
    const entries = fs.readdirSync(SKILLS_DIR);

    for (const entry of entries) {
      const skillMdPath = path.join(SKILLS_DIR, entry, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        skillPaths.push(path.join(SKILLS_DIR, entry));
      }
    }
  } catch {
    // SKILLS_DIR doesn't exist or is unreadable — skip skill registration
    // rather than crashing at startup
  }

  api.on("resources_discover", async () => {
    return { skillPaths };
  });
}

export default async function (pi: ExtensionAPI) {
  // Register pio capabilities as discoverable skills so they appear in
  // the <available_skills> section of pi's default system prompt.
  setupSkills(pi);

  // Shared session infrastructure (wired once)
  setupSessionInfrastructure(pi);
  setupMarkComplete(pi);
  setupValidation(pi);
  setupSessionGuard(pi);

  // Direct tools (init, delete-goal, list-goals, parent, create-issue, goal-from-issue)
  setupDirectTools(pi);

  // Non-directory capability
  setupNextTask(pi);

  // Auto-discover and register all directory-based capability packages
  const capabilities = await discoverCapabilities(__dirname);
  for (const descriptor of capabilities) {
    // Skip test fixtures — they exist solely for unit tests
    if (descriptor.name.startsWith("test-")) {
      continue;
    }
    await registerCapability(pi, descriptor);
  }
}
