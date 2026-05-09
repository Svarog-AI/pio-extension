import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability, type CapabilityConfig } from "./session-capability";
import { enqueueTask, CAPABILITY_SESSIONS } from "../utils";

// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------

export function buildProjectContextConfig(cwd: string, _params?: Record<string, unknown>): CapabilityConfig {
  return {
    capability: "project-context",
    workingDir: cwd,
    writeOnlyFiles: [".pio/PROJECT.md"],
    initialMessage: `Please explore this project and produce .pio/PROJECT.md.`,
  };
}

// ---------------------------------------------------------------------------
// Tool: pio_create_project_context
// ---------------------------------------------------------------------------

const createProjectContextTool = defineTool({
  name: "pio_create_project_context",
  label: "Pio Create Project Context",
  description:
    "Analyze project documentation, configuration, and infrastructure files to produce a PROJECT.md knowledge file in .pio/. This file is automatically injected into every agent session.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    enqueueTask(ctx.cwd, { capability: "project-context" });

    return {
      content: [{ type: "text", text: "Task queued — run /pio-next-task to start the project-context session." }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command: /pio-project-context
// ---------------------------------------------------------------------------

async function handleProjectContext(_args: string | undefined, ctx: ExtensionCommandContext) {
  await launchCapability(ctx, buildProjectContextConfig(ctx.cwd));
}

// ---------------------------------------------------------------------------
// Setup (registers tool, command)
// ---------------------------------------------------------------------------

export function setupProjectContext(pi: ExtensionAPI) {
  CAPABILITY_SESSIONS["project-context"] = buildProjectContextConfig;

  pi.registerTool(createProjectContextTool);
  pi.registerCommand("pio-project-context", {
    description: "Analyze project files and generate .pio/PROJECT.md for session context injection",
    handler: handleProjectContext,
  });
}
