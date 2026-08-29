import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityPackageConfig } from "../../capability-package";
import { BASE_TOOL_PARAMS } from "../../capability-utils";
import { enqueueTask } from "../../queues";

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "project-context",
  contract: {
    inputs: [],
    outputs: [
      {
        name: "overview",
        file: "PROJECT/OVERVIEW.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
      {
        name: "development",
        file: "PROJECT/DEVELOPMENT.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
      {
        name: "conventions",
        file: "PROJECT/CONVENTIONS.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
      {
        name: "git",
        file: "PROJECT/GIT.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
      {
        name: "architecture",
        file: "PROJECT/ARCHITECTURE.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
      {
        name: "dependencies",
        file: "PROJECT/DEPENDENCIES.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
      {
        name: "glossary",
        file: "PROJECT/GLOSSARY.md",
        projectRelative: true,
        requiredWhen: () => false,
      },
    ],
  },
  skills: {
    mandatory: ["pio-project-knowledge"],
    recommended: [
      {
        name: "source-research",
        condition: "when researching project dependencies or external tools",
      },
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
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool: pio_create_project_context
// ---------------------------------------------------------------------------

const projectContextTool = defineTool({
  name: "pio_create_project_context",
  label: "Pio Create Project Context",
  description:
    "Analyze project files and generate .pio/PROJECT/ context files for session context injection. Use this tool directly — no bash commands or manual file creation needed. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Analyze project and generate .pio/PROJECT/ context files.",
  parameters: Type.Object({ ...BASE_TOOL_PARAMS }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    enqueueTask(ctx.cwd, "project-context", {
      capability: "project-context",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName: params.sessionName ?? "project-context",
        queueKey: "project-context",
        additionalContext: params.additionalContext,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for project-context. Use '/pio-next-task' to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Setup (registers tool)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(projectContextTool);
}
