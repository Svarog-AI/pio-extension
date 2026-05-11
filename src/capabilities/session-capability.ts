import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityConfig } from "../types";

// Re-export for backward compatibility
export type { CapabilityConfig };

// ESM-compatible __dirname for resolving prompts bundled with this extension
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");


// Module-level cache per runtime instance
let systemPrompt: string | undefined;
let projectContext: string | undefined;
let skillLoadingInstructions: string | undefined;

// ---------------------------------------------------------------------------
// Launcher — used by command handlers in session-based capabilities
// ---------------------------------------------------------------------------

/** Write config into the new session's custom entry. Survives reload, not visible to LLM. */
export async function launchCapability(ctx: ExtensionCommandContext, config: CapabilityConfig): Promise<void> {
  const parentSession = ctx.sessionManager.getSessionFile();

  await ctx.newSession({
    parentSession,
    setup: async (newSm) => {
      newSm.appendCustomEntry("pio-config", config);
    },
    withSession: async (_newCtx) => {
      // Kick off the agent with the initial task (visible as user message)
      if (config.initialMessage) {
        _newCtx.sendUserMessage(config.initialMessage);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Setup — registers capability-specific event handlers
// ---------------------------------------------------------------------------

/**
 * Call this from your capability's setup function to wire up:
 *   resources_discover → read config from custom entry, load prompt file
 *   before_agent_start → apply systemPrompt (persistent for all turns)
 */
export function setupCapability(pi: ExtensionAPI) {
  // 1. Read config at startup — consume immediately
  pi.on("resources_discover", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries.find(
      (e) => e.type === "custom" && e.customType === "pio-config",
    );
    if (!entry || entry.type !== "custom") return;

    const config = entry.data as CapabilityConfig;

    // Set human-readable session name (if derived)
    if (config.sessionName) {
      pi.setSessionName(config.sessionName);
    }

    if (!config.prompt) {
      console.warn(`pio: no prompt configured for capability "${config.capability}"`);
      return;
    }
    const promptPath = path.join(PROMPTS_DIR, config.prompt);

    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, "utf-8");
    } else {
      console.warn(`pio: prompt file not found: ${promptPath}`);
    }

    // Load skill-loading instructions (shared across all capabilities)
    const skillLoadingPath = path.join(PROMPTS_DIR, "_skill-loading.md");
    if (fs.existsSync(skillLoadingPath)) {
      skillLoadingInstructions = fs.readFileSync(skillLoadingPath, "utf-8");
    } else {
      console.warn(`pio: skill-loading instructions not found: ${skillLoadingPath}`);
    }
  });

  // 2. Inject capability prompt as a custom conversation message for all turns.
  //    This PRESERVES pi's default system prompt (identity, tools, guidelines,
  //    skills, metadata) while layering our role-specific instructions on top
  //    as a steering message in the conversation.
  pi.on("before_agent_start", async () => {
    // Discover project context if not yet loaded
    if (projectContext === undefined) {
      const projectContextPath = path.join(process.cwd(), ".pio", "PROJECT.md");
      if (fs.existsSync(projectContextPath)) {
        projectContext = fs.readFileSync(projectContextPath, "utf-8");
      }
    }

    // Merge capability prompt with project context and skill-loading instructions
    const prompts: string[] = [];

    // Project context first (if available)
    if (projectContext) {
      prompts.push(`--- PROJECT OVERVIEW ---\n\n${projectContext}`);
    }

    // Skill-loading instructions (if available) — injected between project context and capability prompt
    if (skillLoadingInstructions) {
      prompts.push(skillLoadingInstructions);
    }

    // Capability-specific prompt (if available)
    if (systemPrompt) {
      prompts.push(`--- YOUR INSTRUCTIONS ---\n\n${systemPrompt}`);
    }

    if (prompts.length === 0) return; // no injection needed

    // Return as a custom message instead of replacing the system prompt.
    // This preserves pi's full default system prompt while delivering our
    // capability instructions as conversation context.
    return {
      message: {
        customType: "pio-capability-instructions",
        content: [{ type: "text" as const, text: prompts.join("\n\n") }],
        display: false,
        details: {},
      },
    };
  });
}
