import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

/**
 * Initialize a new pio project in the current working directory.
 */
async function init(): Promise<string> {
  const cwd = process.cwd();
  const pioDir = path.join(cwd, ".pio");

  if (fs.existsSync(pioDir)) {
    return `Directory .pio already exists at ${pioDir}`;
  }

  fs.mkdirSync(pioDir, { recursive: true });
  fs.mkdirSync(path.join(pioDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(pioDir, "work-memory"), { recursive: true });

  return `Initialized pio project at ${pioDir}`;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const initTool = defineTool({
  name: "pio_init",
  label: "Pio Init",
  description: "Initialize a new pio project in the current working directory. Use this tool directly — all filesystem operations are handled internally.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
    const result = await init();
    return {
      content: [{ type: "text", text: result }],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleInit(_args: string | undefined, ctx: ExtensionCommandContext) {
  const result = await init();
  ctx.ui.notify(result, "info");
}

// ---------------------------------------------------------------------------
// Setup (registers tool, command, and event handlers)
// ---------------------------------------------------------------------------

export function setupInit(pi: ExtensionAPI) {
  pi.registerTool(initTool);
  pi.registerCommand("pio-init", {
    description: "Initialize a new pio project in the current directory",
    handler: handleInit,
  });
}
