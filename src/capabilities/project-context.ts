import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { launchCapability } from "./session-capability";
import { enqueueTask } from "../utils";

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
    enqueueTask(ctx.cwd, {
      capability: "project-context",
      systemPromptName: "project-context.md",
      workingDir: ctx.cwd,
      writeOnlyFiles: [".pio/PROJECT.md"],
      initialMessage: `Please explore this project and produce .pio/PROJECT.md.`,
    });

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
  await launchCapability(ctx, {
    systemPromptName: "project-context.md",
    workingDir: ctx.cwd,
    writeOnlyFiles: [".pio/PROJECT.md"],
    initialMessage: `Please explore this project and produce .pio/PROJECT.md.`,
  });
}

// ---------------------------------------------------------------------------
// Setup (registers tool, command)
// ---------------------------------------------------------------------------

export function setupProjectContext(pi: ExtensionAPI) {
  pi.registerTool(createProjectContextTool);
  pi.registerCommand("pio-project-context", {
    description: "Analyze project files and generate .pio/PROJECT.md for session context injection",
    handler: handleProjectContext,
  });
}
