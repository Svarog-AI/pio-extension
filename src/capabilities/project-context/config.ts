import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import type { CapabilityPackageConfig } from "../../capability-package";

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "project-context",
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
  defaultInitialMessage: (workingDir: string) =>
    `Please explore this project and produce the multi-file project context under ${workingDir}/.pio/PROJECT/ (OVERVIEW.md, DEVELOPMENT.md, CONVENTIONS.md, GIT.md, ARCHITECTURE.md, DEPENDENCIES.md, GLOSSARY.md).`,
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool: pio_create_project_context
// ---------------------------------------------------------------------------

const projectContextTool = defineTool({
  name: "pio_create_project_context",
  label: "Pio Create Project Context",
  description: "Analyze project files and generate .pio/PROJECT/ context files for session context injection. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Analyze project and generate .pio/PROJECT/ context files.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    enqueueTask(ctx.cwd, "project-context", {
      capability: "project-context",
      params: {},
    });

    return { content: [{ type: "text", text: `Task queued for project-context. Use \'/pio-next-task\' to start the sub-session.` }], details: {} };
  },
});

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

export function register(pi: ExtensionAPI) {
  pi.registerTool(projectContextTool);
  pi.registerCommand("pio-project-context", {
    description: "Analyze project files and generate .pio/PROJECT/ context files for session context injection",
    handler: handleProjectContext,
  });
}


