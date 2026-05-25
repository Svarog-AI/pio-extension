import type { ExtensionAPI, ExtensionCommandContext, Skill } from "@earendil-works/pi-coding-agent";
import { defineTool, stripFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityConfig } from "../types";
import { discoverNextStep } from "../fs-utils";
import { resolveModelForCapability } from "../model-config";
import { validateOutputs } from "../guards/validation";
import { resolveTransition, recordTransition } from "../state-machine";
import { createGoalState } from "../goal-state";
import { enqueueTask, writeLastTask } from "../queues";

// Re-export for backward compatibility
export type { CapabilityConfig };

// ESM-compatible __dirname for resolving prompts bundled with this extension
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");


// Module-level cache per runtime instance
let systemPrompt: string | undefined;
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
// pio_mark_complete tool — orchestrates the full capability exit lifecycle
// ---------------------------------------------------------------------------

const markCompleteTool = defineTool({
  name: "pio_mark_complete",
  label: "Pio Mark Complete",
  description: "Signal that your work is done. Validates that all expected output files have been produced and auto-enqueues the next workflow task.",
  promptSnippet: "Signal that your work is done. Validates expected output files.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries.find(
      (e) => e.type === "custom" && e.customType === "pio-config",
    );

    // No config — not a capability session, always pass
    if (!entry || entry.type !== "custom") {
      return { content: [{ type: "text", text: "No validation rules configured for this session." }], details: {}, terminate: true };
    }

    const config = entry.data as CapabilityConfig;
    const dir = config.workingDir;

    // No workingDir — can't do anything meaningful, pass and terminate
    if (!dir) {
      return { content: [{ type: "text", text: "No directory is defined for this session. Something went wrong." }], details: {}, terminate: true };
    }

    // 1. File-existence validation (generic, optional)
    if (config.validation) {
      const result = validateOutputs(config.validation, dir);

      if (!result.passed) {
        return { content: [{ type: "text", text: `Validation failed. Missing files:\n- ${result.missing.join("\n- ")}\n\nProduce these files and call pio_mark_complete again.` }], details: {} };
      }
    }

    // 2. PostValidate hook — can fail to keep agent in session
    if (config.postValidate) {
      try {
        const postValidateResult = config.postValidate(dir, config.sessionParams);
        if (!postValidateResult.success) {
          return { content: [{ type: "text", text: postValidateResult.message || "Post-validation failed." }], details: {} };
        }
      } catch (err) {
        return { content: [{ type: "text", text: `Post-validation error: ${err}` }], details: {} };
      }
    }

    let notification = "";

    // 3. Transition routing + task enqueuing
    const capability = config.capability;

    // Use the completing session's params directly — they are authoritative.
    const sessionParams = config.sessionParams || {};

    // GoalState is the single source of truth for goalName and stepNumber
    const state = createGoalState(dir);
    const goalName = state.goalName;

    // Use explicit stepNumber from session params first (authoritative for the completing step).
    // Fall back to state.currentStepNumber() only if not explicitly provided.
    // This is critical: postValidate may create APPROVED/REJECTED markers that change
    // currentStepNumber() before we read it (e.g., APPROVED for step 1 makes it return 2).
    const explicitStepNumber = typeof sessionParams.stepNumber === "number"
      ? sessionParams.stepNumber
      : undefined;
    const stepNumber = explicitStepNumber ?? state.currentStepNumber();

    const nextTask = capability
      ? resolveTransition(capability, state, { goalName, stepNumber, _sessionContext: sessionParams })
      : undefined;
    if (nextTask && capability) {
      try {
        // Use adjusted params from the transition (may contain incremented stepNumber)
        const adjustedParams = nextTask.params || {};

        // After spreading adjusted params and _sessionContext, explicitly set stepNumber last
        // to guarantee it appears at top level (cannot be shadowed by nested _sessionContext).
        const finalStepNumber = typeof adjustedParams.stepNumber === "number"
          ? adjustedParams.stepNumber
          : stepNumber;

        // For subgoals completing via finalize-goal, transitionFinalizeGoal sets
        // goalName to parentGoalName in returned params. Use this as the queue key
        // to restore the parent workflow slot. For flat goals, this equals state.goalName.
        const queueGoalName = typeof adjustedParams.goalName === "string"
          ? adjustedParams.goalName
          : goalName;

        enqueueTask(process.cwd(), queueGoalName, {
          capability: nextTask.capability,
          params: {
            goalName,
            ...adjustedParams,
            _sessionContext: sessionParams,
            ...(finalStepNumber != null ? { stepNumber: finalStepNumber } : {}),
          },
        });

        // Record transition audit entry
        recordTransition(dir, capability, nextTask);

        // Record the completed task in the goal directory
        // dir IS the goal directory (config.workingDir) — no need to resolve it again
        writeLastTask(dir, {
          capability,
          params: { goalName, ...(stepNumber != null ? { stepNumber } : {}), _sessionContext: sessionParams },
        });

        notification = `\n\nNext task enqueued: ${nextTask.capability}. Use \`/pio-next-task\` to start the sub-session.`;
      } catch (err) {
        console.warn(`pio: failed to enqueue next task: ${err}`);
      }
    }

    // 4. PostExecute hook — runs after transitions, errors are non-fatal
    if (config.postExecute) {
      try {
        const postExecuteResult = config.postExecute(dir, config.sessionParams);
        if (postExecuteResult instanceof Promise) {
          await postExecuteResult;
        }
      } catch (err) {
        console.warn(`pio: postExecute failed for capability "${config.capability}": ${err}`);
      }
    }

    // 5. Cleanup files declared in config.fileCleanup
    if (Array.isArray(config.fileCleanup)) {
      for (const filePath of config.fileCleanup) {
        try {
          fs.rmSync(filePath, { force: true });
          console.log(`pio: cleaned up file after validation: ${filePath}`);
        } catch (err) {
          console.warn(`pio: failed to clean up file ${filePath}: ${err}`);
        }
      }
    }

    return { content: [{ type: "text", text: `Validation passed. All expected outputs have been produced.${notification}` }], details: {}, terminate: true };
  },
});

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
// Setup — registers capability-specific event handlers
// ---------------------------------------------------------------------------

/**
 * Call this from your capability's setup function to wire up:
 *   resources_discover → read config from custom entry, load prompt file
 *   before_agent_start → apply systemPrompt (persistent for all turns)
 */
export function setupCapability(pi: ExtensionAPI) {
  // Register the pio_mark_complete tool
  pi.registerTool(markCompleteTool);

  // 1. Read config at startup — consume immediately
  pi.on("resources_discover", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const entry = entries.find(
      (e) => e.type === "custom" && e.customType === "pio-config",
    );
    if (!entry || entry.type !== "custom") return;

    const config = entry.data as CapabilityConfig;

    // Capture capability name for model resolution in before_agent_start
    capabilityName = config.capability;

    // Set human-readable session name (if derived)
    if (config.sessionName) {
      pi.setSessionName(config.sessionName);
    }

    // Enrich session params with stepNumber for goal workspaces.
    // Preserve explicit stepNumber if already present; auto-discover only when missing/invalid.
    const rawParams = config.sessionParams || {};
    const existingStepNumber = typeof rawParams.stepNumber === "number" ? rawParams.stepNumber : undefined;

    enrichedSessionParams = { ...rawParams };

    if (existingStepNumber == null && config.workingDir) {
      // Only auto-discover for goal workspaces (path contains /goals/)
      if (config.workingDir.includes("/goals/")) {
        const discovered = discoverNextStep(config.workingDir);
        enrichedSessionParams.stepNumber = discovered;
      }
    }

    // Run prepareSession hook (lifecycle: prepare → work → markComplete → validateState).
    // Hook runs after enrichedSessionParams is populated, so it has access to stepNumber.
    // Errors are caught and logged — they do not crash the session startup.
    if (config.prepareSession && config.workingDir) {
      try {
        await config.prepareSession(config.workingDir!, enrichedSessionParams);
      } catch (err) {
        console.warn(`pio: prepareSession failed for capability "${config.capability}": ${err}`);
      }
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

    // Cache config for skill injection in before_agent_start
    currentConfig = config;
  });

  // 2. Inject capability prompt as a custom conversation message for all turns.
  //    This PRESERVES pi's default system prompt (identity, tools, guidelines,
  //    skills, metadata) while layering our role-specific instructions on top
  //    as a steering message in the conversation.
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

    // Build dynamic skill-loading section from config
    const skillLoadingSection = buildSkillLoadingSection(
      currentConfig ?? {},
      availableSkills ?? [],
    );

    // Merge capability prompt with project context and skill-loading instructions
    const prompts: string[] = [];

    // Project context first (if available)
    if (projectContext) {
      prompts.push(`--- PROJECT OVERVIEW ---\n\n${projectContext}`);
    }

    // Skill-loading instructions (dynamically generated) — injected between project context and capability prompt
    if (skillLoadingSection) {
      prompts.push(skillLoadingSection);
    }

    // Capability-specific prompt (if available)
    if (systemPrompt) {
      prompts.push(`--- YOUR INSTRUCTIONS ---\n\n${systemPrompt}`);
    }

    if (prompts.length === 0) return; // no injection needed

    // Return as a custom message instead of replacing the system prompt.
    // This preserves pi's full default system prompt while delivering our
    // capability instructions as conversation context.
    const result = {
      message: {
        customType: "pio-capability-instructions",
        content: [{ type: "text" as const, text: prompts.join("\n\n") }],
        display: false,
        details: {},
      },
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
 * Return a copy of the enriched session params.
 * Includes auto-discovered stepNumber for goal workspaces.
 */
export function getSessionParams(): Record<string, unknown> | undefined {
  if (enrichedSessionParams === undefined) return undefined;
  return { ...enrichedSessionParams };
}

/**
 * Return the canonical stepNumber from enriched session params.
 * Returns a number when working in a goal workspace, or undefined otherwise.
 */
export function getStepNumber(): number | undefined {
  if (enrichedSessionParams === undefined) return undefined;
  const n = enrichedSessionParams.stepNumber;
  return typeof n === "number" ? n : undefined;
}

/**
 * Return the goalName string from enriched session params.
 * Returns a string when inside a capability sub-session with a known goal, or undefined otherwise.
 */
export function getSessionGoalName(): string | undefined {
  const params = getSessionParams();
  return typeof params?.goalName === "string" ? params.goalName : undefined;
}
