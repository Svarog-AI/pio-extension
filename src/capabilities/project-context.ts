import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { launchCapability } from "./session-capability";
import { resolveCapabilityConfig, type StaticCapabilityConfig } from "../capability-config";

// ---------------------------------------------------------------------------
// Capability config — single source of truth for this capability's session shape
// ---------------------------------------------------------------------------

export const CAPABILITY_CONFIG: StaticCapabilityConfig = {
  prompt: "project-context.md",
  skills: {
    mandatory: ["pio-project-knowledge"],
    recommended: [
      { name: "source-research", condition: "when researching project dependencies or external tools" },
    ],
  },
  writeAllowlist: [
    ".pio/PROJECT/OVERVIEW.md",
    ".pio/PROJECT/DEVELOPMENT.md",
    ".pio/PROJECT/CONVENTIONS.md",
    ".pio/PROJECT/GIT.md",
    ".pio/PROJECT/ARCHITECTURE.md",
    ".pio/PROJECT/DEPENDENCIES.md",
    ".pio/PROJECT/GLOSSARY.md",
  ],
  defaultInitialMessage: (workingDir) =>
    `Please explore this project and produce the multi-file project context under ${workingDir}/.pio/PROJECT/ (OVERVIEW.md, DEVELOPMENT.md, CONVENTIONS.md, GIT.md, ARCHITECTURE.md, DEPENDENCIES.md, GLOSSARY.md).`,
};

// ---------------------------------------------------------------------------
// Command: /pio-project-context
// ---------------------------------------------------------------------------

async function handleProjectContext(_args: string | undefined, ctx: ExtensionCommandContext) {
  const config = await resolveCapabilityConfig(ctx.cwd, { capability: "project-context" });
  if (!config) {
    ctx.ui.notify("Failed to resolve project-context config.", "error");
    return;
  }
  await launchCapability(ctx, config);
}

// ---------------------------------------------------------------------------
// Setup (registers command)
// ---------------------------------------------------------------------------

export function setupProjectContext(pi: ExtensionAPI) {
  pi.registerCommand("pio-project-context", {
    description: "Analyze project files and generate .pio/PROJECT/ context files for session context injection",
    handler: handleProjectContext,
  });
}
