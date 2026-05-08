import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

import { launchCapability } from "./session-capability";
import { enqueueTask } from "../utils";

// ---------------------------------------------------------------------------
// FILE_PATTERNS — patterns for discovering project context files
// ---------------------------------------------------------------------------

export const FILE_PATTERNS: string[] = [
  // Documentation
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/*.md",
  // AI instructions
  "AGENTS.md",
  "CLAUDE.md",
  "CURSOR.md",
  ".github/copilot-instructions.md",
  // Build/automation
  "Makefile",
  "makefile",
  "justfile",
  "Justfile",
  "Taskfile.yml",
  "Taskfile.yaml",
  "build.gradle",
  "build.gradle.kts",
  // CI/CD & infra
  ".github/workflows/*.yml",
  ".github/workflows/*.yaml",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker-compose.*.yml",
  "docker-compose.*.yaml",
  "deployment.yaml",
  "kustomization.yaml",
  "kustomization.yml",
  // Dependencies
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.sbt",
];

// ---------------------------------------------------------------------------
// Discovery function
// ---------------------------------------------------------------------------

/**
 * Scans the given `cwd` and returns relative paths of all files matching FILE_PATTERNS.
 * Uses native fs with manual pattern matching for glob patterns containing *.
 */
export function discoverProjectFiles(cwd: string): string[] {
  const found = new Set<string>();

  for (const pattern of FILE_PATTERNS) {
    if (pattern.includes("*")) {
      // Glob pattern — extract directory and suffix
      // e.g. "docs/*.md" → dir="docs", suffix=".md"
      // e.g. ".github/workflows/*.yml" → dir=".github/workflows", suffix=".yml"
      const lastSlash = pattern.lastIndexOf("/");
      const dirPart = pattern.substring(0, lastSlash);
      const starIndex = pattern.indexOf("*");
      const prefix = pattern.substring(lastSlash + 1, starIndex);
      const suffix = pattern.substring(starIndex + 1);

      const dirPath = path.join(cwd, dirPart);
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        continue;
      }

      try {
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
          if (entry.startsWith(prefix) && entry.endsWith(suffix)) {
            found.add(path.join(dirPart, entry));
          }
        }
      } catch {
        // directory may not be readable — skip silently
      }
    } else {
      // Exact file path
      const filePath = path.join(cwd, pattern);
      if (fs.existsSync(filePath)) {
        found.add(pattern);
      }
    }
  }

  return Array.from(found).sort();
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
    const files = discoverProjectFiles(ctx.cwd);

    if (files.length === 0) {
      return {
        content: [{ type: "text", text: "No project context files found in the workspace. Ensure documentation or configuration files exist before running this command." }],
        details: {},
      };
    }

    const fileList = files.map((f) => `- ${f}`).join("\n");

    enqueueTask(ctx.cwd, {
      capability: "project-context",
      systemPromptName: "project-context.md",
      workingDir: ctx.cwd,
      writeOnlyFiles: [".pio/PROJECT.md"],
      initialMessage: `Discovered the following project files for context analysis:\n\n${fileList}\n\nPlease analyze these files to produce .pio/PROJECT.md`,
    });

    return {
      content: [{ type: "text", text: `Discovered ${files.length} project file(s):\n\n${fileList}\n\nTask queued — run /pio-next-task to start the project-context session.` }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command: /pio-project-context
// ---------------------------------------------------------------------------

async function handleProjectContext(_args: string | undefined, ctx: ExtensionCommandContext) {
  const files = discoverProjectFiles(ctx.cwd);

  if (files.length === 0) {
    ctx.ui.notify("No project context files found in the workspace.", "warning");
    return;
  }

  const fileList = files.map((f) => `- ${f}`).join("\n");

  // launchCapability calls ctx.newSession() — after this, ctx is stale.
  await launchCapability(ctx, {
    systemPromptName: "project-context.md",
    workingDir: ctx.cwd,
    writeOnlyFiles: [".pio/PROJECT.md"],
    initialMessage: `Discovered the following project files for context analysis:\n\n${fileList}\n\nPlease analyze these files to produce .pio/PROJECT.md`,
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
