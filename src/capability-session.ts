import type { ExtensionAPI, ExtensionCommandContext, Skill } from "@earendil-works/pi-coding-agent";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityConfig, CapabilitySkills } from "./types";
import { getSessionConfig } from "./capability-utils";
import { validateInputs } from "./guards/validation";
import type { CompiledPromptSections } from "./capability-package";
import { compilePrompt } from "./prompt-compiler";
import { setupStepNudging } from "./guards/step-nudging";

import { resolveModelForCapability } from "./model-config";

// ESM-compatible __dirname for resolving capability package directories
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Module-level cache per runtime instance
let compiledSections: CompiledPromptSections | undefined;
let projectContext: string | undefined;
let availableSkills: Skill[] | undefined;
let currentConfig: CapabilityConfig | undefined;

/**
 * Set merged skills on the current capability config.
 * Called by `prepareSession` hooks after reading TASK.md frontmatter skills.
 * The merged result is applied to `currentConfig` before `before_agent_start` runs.
 */
export function setMergedSkills(skills: Pick<CapabilityConfig, "skills">["skills"]): void {
  if (currentConfig) {
    currentConfig.skills = skills;
  }
}

// Global mandatory skills — always injected regardless of capability config
const GLOBAL_MANDATORY_SKILLS = ["pio", "ask-user"];

/** Resolve the path to the project context overview file.
 * Returns `.pio/PROJECT/OVERVIEW.md` relative to the given working directory.
 * Exported for testing; used internally by the `before_agent_start` handler.
 */
export function resolveProjectContextPath(cwd: string): string {
  return path.join(cwd, ".pio", "PROJECT", "OVERVIEW.md");
}

// Capability name captured during resources_discover for model resolution in before_agent_start
let capabilityName: string | undefined;

// Enriched session params — populated during resources_discover, used downstream
let enrichedSessionParams: Record<string, unknown> | undefined;

// ---------------------------------------------------------------------------
// Launcher — used by command handlers in session-based capabilities
// ---------------------------------------------------------------------------

/** Write config into the new session's custom entry. Survives reload, not visible to LLM. */
export async function launchCapability(ctx: ExtensionCommandContext, config: CapabilityConfig): Promise<void> {
  // Validate inputs against the capability contract BEFORE launching.
  if (config.contract && config.workspaceDir) {
    const result = validateInputs(
      config.workspaceDir,
      config.contract,
      config.sessionParams,
    );

    if (!result.success) {
      throw new Error(
        `Input validation failed for "${config.capability}": ${result.message || "missing required files"}`,
      );
    }
  }

  const parentSession = ctx.sessionManager.getSessionFile();

  await ctx.newSession({
    parentSession,
    setup: async (newSm) => {
      // Store lightweight metadata — functions (requiredWhen, postValidate, etc.) are
      // stripped by JSON.stringify. getSessionConfig() reconstructs the full config
      // via dynamic import of the capability module.
      newSm.appendCustomEntry("pio-config", {
        capability: config.capability,
        workspaceDir: config.workspaceDir,
        sessionParams: config.sessionParams,
      });
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
// Skill injection — builds the --- SKILL LOADING INSTRUCTIONS --- section
// ---------------------------------------------------------------------------

/**
 * Build the skill-loading section from capability config and the cached skill registry.
 * Mandatory skills are force-injected with full content. Recommended skills are listed as instructions.
 * Global mandatory skills (pio, ask-user) are always included.
 */
export function buildSkillLoadingSection(
  config: Pick<CapabilityConfig, "skills">,
  skills: Skill[],
): string | undefined {
  const parts: string[] = [];

  // Collect all mandatory skill names: global defaults + capability-specific, deduplicated
  const mandatoryNames = new Set<string>(GLOBAL_MANDATORY_SKILLS);
  if (config.skills?.mandatory) {
    for (const name of config.skills.mandatory) {
      mandatoryNames.add(name);
    }
  }

  // Inject mandatory skill content
  for (const skillName of mandatoryNames) {
    const skillEntry = skills.find((s) => s.name === skillName);
    if (!skillEntry) {
      console.warn(`pio: mandatory skill "${skillName}" not found in skill registry — skipping`);
      continue;
    }

    const skillPath = skillEntry.filePath;
    if (!fs.existsSync(skillPath)) {
      console.warn(`pio: mandatory skill "${skillName}" file not found: ${skillPath} — skipping`);
      continue;
    }

    try {
      const rawContent = fs.readFileSync(skillPath, "utf-8");
      const body = stripFrontmatter(rawContent);
      parts.push(
        `<skill name="${skillName}" location="${skillPath}">\n` +
          `References are relative to ${skillEntry.baseDir}.\n\n` +
          `${body}\n` +
          `</skill>`,
      );
    } catch (err) {
      console.warn(`pio: failed to read mandatory skill "${skillName}": ${err} — skipping`);
    }
  }

  // Generate recommended skills listing
  const recommended = config.skills?.recommended;
  if (recommended && recommended.length > 0) {
    const recLines = recommended.map(
      (r) => `- \`${r.name}\` — ${r.condition}`,
    );
    parts.push(
      `--- RECOMMENDED SKILLS ---\n\n` +
        `Load these skills when the listed condition matches your current task:\n\n` +
        recLines.join("\n"),
    );
  }

  if (parts.length === 0) return undefined;

  return `--- SKILL LOADING INSTRUCTIONS ---\n\n${parts.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Setup — registers session infrastructure event handlers
// ---------------------------------------------------------------------------

/**
 * Call this from your capability's setup function to wire up:
 *   resources_discover → read config from custom entry, load prompt file
 *   before_agent_start → apply systemPrompt (persistent for all turns)
 */
export function setupSessionInfrastructure(pi: ExtensionAPI) {
  // Register step nudging tools and handlers
  setupStepNudging(pi);

  // 1. Read config at startup — consume immediately
  pi.on("resources_discover", async (_event, ctx) => {
    // Reset compiled sections to prevent stale state from previous sessions
    compiledSections = undefined;

    const config = await getSessionConfig(ctx);
    if (!config) return;

    // Capture capability name for model resolution in before_agent_start
    capabilityName = config.capability;

    // Set human-readable session name (if derived)
    if (config.sessionName) {
      pi.setSessionName(config.sessionName);
    }

    enrichedSessionParams = config.sessionParams ? { ...config.sessionParams } : {};

    // Run prepareSession hook (lifecycle: prepare → work → markComplete → validateState).
    // Hook runs after enrichedSessionParams is populated, so it has access to stepNumber.
    // Errors are caught and logged — they do not crash the session startup.
    if (config.prepareSession && config.workspaceDir) {
      try {
        await config.prepareSession(config.workspaceDir!, enrichedSessionParams);
      } catch (err) {
        console.warn(`pio: prepareSession failed for capability "${config.capability}": ${err}`);
      }
    }

    // Compile prompt from capability package directory
    const capabilityDir = path.join(__dirname, "capabilities", config.capability);
    try {
      compiledSections = await compilePrompt(capabilityDir, {
        baseSkills: config.skills,
      });

      // Populate enrichedSessionParams with workflow step info for step nudging
      if (compiledSections && compiledSections._steps) {
        enrichedSessionParams.totalWorkflowSteps = compiledSections._steps.length;
        enrichedSessionParams.workflowSteps = compiledSections._steps.map((s) => ({
          id: s.id,
          title: s.title,
        }));
      }
    } catch (err) {
      console.warn(`pio: compilePrompt failed for capability "${config.capability}": ${err}`);
    }

    // Cache config for skill injection in before_agent_start
    currentConfig = config;
  });

  // 2. Inject capability prompt via systemPrompt for all turns.
  //    This appends project overview, skill loading instructions, and capability
  //    prompt to pi's base system prompt (_event.systemPrompt). The systemPrompt
  //    persists across turns without accumulating in conversation history.
  //    We must explicitly prepend _event.systemPrompt — the framework uses
  //    last-writer-wins (runner.js:728-729: currentSystemPrompt = result.systemPrompt).
  pi.on("before_agent_start", async (_event, ctx) => {
    // Discover project context if not yet loaded
    if (projectContext === undefined) {
      const projectContextPath = resolveProjectContextPath(process.cwd());
      if (fs.existsSync(projectContextPath)) {
        projectContext = fs.readFileSync(projectContextPath, "utf-8");
      }
    }

    // Cache skill registry from systemPromptOptions
    const skillsFromEvent = _event.systemPromptOptions?.skills;
    if (skillsFromEvent) {
      availableSkills = skillsFromEvent;
    }

    // Build dynamic skill-loading section from compiled sections' merged skills
    const skillLoadingSection = buildSkillLoadingSection(
      { skills: compiledSections?.mergedSkills },
      availableSkills ?? [],
    );

    // Assemble prompts from structured sections
    const prompts: string[] = [];

    // Project context first (if available)
    if (projectContext) {
      prompts.push(`--- PROJECT OVERVIEW ---\n\n${projectContext}`);
    }

    // Skill-loading instructions (dynamically generated) — injected between project context and capability prompt
    if (skillLoadingSection) {
      prompts.push(skillLoadingSection);
    }

    // Capability-specific prompt from compiled sections (role → workflow → guidelines)
    if (compiledSections) {
      const capabilitySections: string[] = [];
      if (compiledSections.role) capabilitySections.push(compiledSections.role);
      if (compiledSections.workflow) capabilitySections.push(compiledSections.workflow);
      if (compiledSections.guidelines) capabilitySections.push(compiledSections.guidelines);
      if (capabilitySections.length > 0) {
        prompts.push(`--- YOUR INSTRUCTIONS ---\n\n${capabilitySections.join("\n\n")}`);
      }
    }

    if (prompts.length === 0) return; // no injection needed

    // Return as systemPrompt — persistent across turns without accumulating in history.
    // Prepend _event.systemPrompt to preserve pi's base prompt (last-writer-wins).
    const result = {
      systemPrompt: _event.systemPrompt + "\n\n" + prompts.join("\n\n"),
    };

    // Model resolution: switch to the configured model for this capability.
    // Runs after prompt injection but before the LLM call.
    if (capabilityName && ctx.modelRegistry) {
      const resolved = resolveModelForCapability(capabilityName);
      if (resolved) {
        // Skip if current model already matches
        const currentProvider = ctx.model?.provider;
        const currentId = ctx.model?.id;
        if (currentProvider === resolved.provider && currentId === resolved.modelId) {
          return result;
        }

        // Look up the full Model object from pi's registry
        const model = ctx.modelRegistry.find(resolved.provider, resolved.modelId);
        if (!model) {
          console.warn(
            `pio: model "${resolved.provider}/${resolved.modelId}" not found in registry ` +
              `for capability "${capabilityName}" — skipping model switch`,
          );
          return result;
        }

        await pi.setModel(model);
      }
    }

    return result;
  });
}

// ---------------------------------------------------------------------------
// Public getters — downstream modules read enriched params from here
// ---------------------------------------------------------------------------

/**
 * Return a copy of the session params, programmatically enriched 
 * with derived values.
 */
export function getSessionParams(): Record<string, unknown> | undefined {
  if (enrichedSessionParams === undefined) return undefined;
  return { ...enrichedSessionParams };
}

/** Exported for testing — returns the raw enrichedSessionParams (not a copy). */
export function getEnrichedSessionParamsForTesting(): Record<string, unknown> | undefined {
  return enrichedSessionParams;
}


