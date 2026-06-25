import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability } from "../../capability-session";
import { enqueueTask } from "../../queues";
import { resolveCapabilityConfig } from "../../capability-config";
import { BASE_TOOL_PARAMS } from "../../capability-utils";
import type { CapabilityPackageConfig } from "../../capability-package";

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "project-context",
  contract: {
    inputs: [],
    outputs: [],
  },
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
  defaultInitialMessage: () => "Ready.",
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
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    enqueueTask(ctx.cwd, "project-context", {
      capability: "project-context",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? "project-context",
        queueKey: "project-context",
        initialMessage: params.initialMessage,
      },
    });

    return { content: [{ type: "text", text: `Task queued for project-context. Use \'/pio-next-task\' to start the sub-session.` }], details: {} };
  },
});

// ---------------------------------------------------------------------------
// Command: /pio-project-context
// ---------------------------------------------------------------------------

async function handleProjectContext(_args: string | undefined, ctx: ExtensionCommandContext) {
  const config = await resolveCapabilityConfig(ctx.cwd, {
    capability: "project-context",
    sessionName: "project-context",
    queueKey: "project-context",
    initialMessage: "Analyze the project and generate .pio/PROJECT/ context files.",
  });
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


