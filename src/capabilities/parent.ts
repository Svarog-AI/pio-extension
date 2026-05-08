import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the parent session path from the header (set by pi on newSession). */
async function findParentPath(ctx: ExtensionCommandContext): Promise<string | null> {
  const header = ctx.sessionManager.getHeader();
  if (header?.parentSession && fs.existsSync(header.parentSession)) {
    return header.parentSession;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

async function handleParent(_args: string | undefined, ctx: ExtensionCommandContext) {
  const parentPath = await findParentPath(ctx);

  if (!parentPath) {
    ctx.ui.notify("No parent session found", "warning");
    return;
  }

  await ctx.switchSession(parentPath);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupParent(pi: ExtensionAPI) {
  pi.registerCommand("pio-parent", {
    description: "Switch back to the parent session",
    handler: handleParent,
  });
}
