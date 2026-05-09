import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ValidationRule } from "./validation";

// ESM-compatible __dirname for resolving prompts bundled with this extension
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

export interface CapabilityConfig {
  /** Logical capability name (e.g. "create-goal") — determines prompt and transitions */
  capability: string;
  /** Kickoff prompt sent as a user message to trigger the agent */
  initialMessage?: string;
  /** Base directory for resolving validation file paths (the goal workspace dir) */
  workingDir?: string;
  /** Validation rules declared by this capability */
  validation?: ValidationRule;
  /** Files that must not be modified during this session (relative to workingDir) */
  readOnlyFiles?: string[];
  /** Files that MAY be written during this session (allowlist). When present, takes precedence over readOnlyFiles. */
  writeOnlyFiles?: string[];
}

/** Maps capability name → prompt filename. Centralized so prompts don't leak into config. */
export const CAPABILITY_PROMPTS: Record<string, string> = {
  "create-goal": "create-goal.md",
  "create-plan": "create-plan.md",
  "evolve-plan": "evolve-plan.md",
  "execute-plan": "execute-plan.md",
  "project-context": "project-context.md",
};


// Module-level cache per runtime instance
let systemPrompt: string | undefined;
let projectContext: string | undefined;

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
    const promptFilename = CAPABILITY_PROMPTS[config.capability];
    if (!promptFilename) {
      console.warn(`pio: no prompt configured for capability "${config.capability}"`);
      return;
    }
    const promptPath = path.join(PROMPTS_DIR, promptFilename);

    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, "utf-8");
    } else {
      console.warn(`pio: prompt file not found: ${promptPath}`);
    }
  });

  // 2. Apply system prompt for all turns (session identity)
  //    Also injects .pio/PROJECT.md content when available.
  pi.on("before_agent_start", async () => {
    // Discover project context if not yet loaded
    if (projectContext === undefined) {
      const projectContextPath = path.join(process.cwd(), ".pio", "PROJECT.md");
      if (fs.existsSync(projectContextPath)) {
        projectContext = fs.readFileSync(projectContextPath, "utf-8");
      }
    }

    // Merge capability prompt with project context
    const prompts: string[] = [];

    // Project context first (if available)
    if (projectContext) {
      prompts.push(`--- PROJECT OVERVIEW ---\n\n${projectContext}`);
    }

    // Capability-specific prompt (if available)
    if (systemPrompt) {
      prompts.push(`--- YOUR INSTRUCTIONS ---\n\n${systemPrompt}`);
    }

    if (prompts.length === 0) return; // no injection needed
    return { systemPrompt: prompts.join("\n\n") };
  });
}
