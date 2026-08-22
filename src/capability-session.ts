import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Skill,
} from "@earendil-works/pi-coding-agent";
import { stripFrontmatter } from "@earendil-works/pi-coding-agent";
import { resolveContractPath } from "./capability-config";
import { CapState } from "./capability-state";
import { getSessionConfig } from "./capability-utils";
import { cleanupMarkers } from "./guards/mark-complete";
import { validateInputs } from "./guards/validation";
import { resolveModelForCapability } from "./model-config";
import { compilePrompt } from "./prompt-compiler";
import { setupLoopEngine } from "./runtime/loop-engine";
import type {
  CompiledPromptSections,
  WorkflowPhase,
} from "./runtime/workflow-types";
import type { CapabilityConfig } from "./types";

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
export function setMergedSkills(
  skills: Pick<CapabilityConfig, "skills">["skills"],
): void {
  if (currentConfig) {
    currentConfig.skills = skills;
  }
}

// Global mandatory skills — always injected regardless of capability config
const GLOBAL_MANDATORY_SKILLS = ["ask-user"];

// Workflow execution rules — injected as a top-level section in every pio sub-session.
// Declares CustomMessage as the sole source of task directives.
export const WORKFLOW_INSTRUCTIONS = `# Workflow Execution

You are working through a multi-phase workflow. Your instructions for each phase arrive as messages in the chat via CustomMessage injection from the loop engine.

## Phase Boundaries

You must respect phase boundaries strictly. The following rules apply to every phase:

- **Do not produce artifacts until the phase explicitly asks you to.** Do exactly as the phase instructions say. Phases that say "research," "ask questions," "verify," or similar gathering language are not asking you to write files — they are asking you to learn, explore, or confirm understanding. Do not skip ahead and create outputs even if you know what they should be. The framework will stop you from doing that anyway.
- **Respect negative instructions literally.** If a phase says "do not write," "not writing," "no new files," or similar, honor it as a hard constraint. Do not assume the final output is due because you know what capability this session belongs to. Negative instructions exist for a reason — they prevent premature artifact creation that breaks workflow ordering.
- **Do absolutely nothing outside of the phase instructions.** They exist for a reason, and should be obeyed.
- **Leverage context, but keep focused on the current phase.** Context can fill in your knowledge, but never distract you from not following the phase.
`;

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
export async function launchCapability(
  ctx: ExtensionCommandContext,
  config: CapabilityConfig,
): Promise<void> {
  // Validate inputs against the capability contract BEFORE launching.
  // workspacePrefix is stripped from sessionParams during normalization.
  // workspaceDir already has the prefix baked in, so CapState.workspacePrefix = undefined.
  if (config.contract && config.workspaceDir) {
    const capState = new CapState(
      config.contract,
      config.workspaceDir,
      config.sessionParams,
    );
    const result = validateInputs(capState);

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
      // Initial message is no longer delivered — task directives come from CustomMessage injection only.
      // Kick off first agent run via follow-up (goes through normal prompt() flow → before_agent_start fires)
      _newCtx.sendUserMessage("");
    },
  });
}

// ---------------------------------------------------------------------------
// Skill injection — builds the --- SKILL LOADING INSTRUCTIONS --- section
// ---------------------------------------------------------------------------

/**
 * Build the skill-loading section from capability config and the cached skill registry.
 * Mandatory skills are force-injected with full content. Recommended skills are listed as instructions.
 * Global mandatory skills (ask-user) are always included.
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
      console.warn(
        `pio: mandatory skill "${skillName}" not found in skill registry — skipping`,
      );
      continue;
    }

    const skillPath = skillEntry.filePath;
    if (!fs.existsSync(skillPath)) {
      console.warn(
        `pio: mandatory skill "${skillName}" file not found: ${skillPath} — skipping`,
      );
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
      console.warn(
        `pio: failed to read mandatory skill "${skillName}": ${err} — skipping`,
      );
    }
  }

  // Generate recommended skills listing
  const recommended = config.skills?.recommended;
  if (recommended && recommended.length > 0) {
    const recLines = recommended.map((r) => `- \`${r.name}\` — ${r.condition}`);
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
// Session inputs — builds the --- SESSION INPUTS --- section
// ---------------------------------------------------------------------------

/**
 * Build a markdown section listing the workspace directory and resolved contract inputs.
 * Always returns a non-empty string when `workspaceDir` is provided — the workspace
 * directory line is unconditional. Contract inputs are listed below when present.
 *
 * For each contract input:
 * - Calls resolveContractPath() with workspacePrefix = undefined (same convention as CapState)
 * - On success: includes the full filesystem path in the output
 * - On failure (throws): skips the input gracefully
 */
export function buildSessionInputsSection(
  config: CapabilityConfig,
  workspaceDir: string,
  params?: Record<string, unknown>,
): string {
  const lines: string[] = [];

  if (config?.contract?.inputs) {
    for (const entry of config.contract.inputs) {
      try {
        const fullPath = resolveContractPath(
          entry.file,
          workspaceDir,
          undefined,
          params,
          entry.projectRelative,
          entry.paramKey,
        );
        lines.push(`- ${entry.name}: \`${fullPath}\``);
      } catch {
        // Skip unresolvable inputs gracefully
      }
    }
  }

  // Always return the section with workspace directory
  const parts: string[] = [
    `--- SESSION INPUTS ---`,
    `Workspace directory: ${workspaceDir}`,
  ];
  if (lines.length > 0) {
    parts.push(
      `Your capability was invoked with these inputs:`,
      lines.join("\n"),
    );
  }

  return parts.join("\n\n");
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

    enrichedSessionParams = config.sessionParams
      ? { ...config.sessionParams }
      : {};

    // Framework-level marker cleanup — deletes all declared marker files before
    // the capability-specific prepareSession hook runs. This is transparent:
    // capabilities declare markers in their contract, the framework handles cleanup.
    if (
      config.contract?.markers &&
      config.contract.markers.length > 0 &&
      config.workspaceDir
    ) {
      try {
        cleanupMarkers(config.workspaceDir, config.contract);
      } catch (err) {
        console.warn(
          `pio: cleanupMarkers failed for capability "${config.capability}": ${err}`,
        );
      }
    }

    // Run prepareSession hook (lifecycle: prepare → work → markComplete → validateState).
    // Hook runs after enrichedSessionParams is populated, so it has access to stepNumber.
    // Errors are caught and logged — they do not crash the session startup.
    if (config.prepareSession && config.workspaceDir) {
      try {
        await config.prepareSession(config.workspaceDir, enrichedSessionParams);
      } catch (err) {
        console.warn(
          `pio: prepareSession failed for capability "${config.capability}": ${err}`,
        );
      }
    }

    // Compile prompt from capability package directory
    const capabilityDir = path.join(
      __dirname,
      "capabilities",
      config.capability,
    );
    try {
      compiledSections = await compilePrompt(capabilityDir, {
        baseSkills: config.skills,
      });
    } catch (err) {
      console.warn(
        `pio: compilePrompt failed for capability "${config.capability}": ${err}`,
      );
    }

    // Cache config for skill injection in before_agent_start
    currentConfig = config;
  });

  // 2. Inject capability prompt via systemPrompt for all turns.
  //    This appends project overview, skill loading instructions, and capability
  //    prompt to pi's base system prompt (_event.systemPrompt). The systemPrompt
  //    persists across turns without accumulating in conversation history.
  //    We must explicitly prepend _event.systemPrompt — pi chains before_agent_start
  //    handlers sequentially, passing accumulated content through _event.systemPrompt.
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

    // Session inputs — injected between skill loading and workflow execution
    if (currentConfig) {
      const inputsSection = buildSessionInputsSection(
        currentConfig,
        currentConfig.workspaceDir ?? ".",
        enrichedSessionParams,
      );
      if (inputsSection) {
        prompts.push(inputsSection);
      }
    }

    // Workflow execution rules — always injected unconditionally.
    // This is the only section telling the agent how to work through phases;
    // all task-specific directives arrive via CustomMessage from the loop engine.
    prompts.push(`--- WORKFLOW EXECUTION ---\n\n${WORKFLOW_INSTRUCTIONS}`);

    // Additional context — injected after workflow execution rules.
    // Only present when additionalContext is a non-empty string.
    if (currentConfig?.additionalContext) {
      prompts.push(
        `--- ADDITIONAL CONTEXT ---\n\n${currentConfig.additionalContext}`,
      );
    }

    if (prompts.length === 0) return; // no injection needed

    // Return as systemPrompt — persistent across turns without accumulating in history.
    // Prepend _event.systemPrompt to preserve pi's base prompt (last-writer-wins).
    const result = {
      systemPrompt: `${_event.systemPrompt}\n\n${prompts.join("\n\n")}`,
    };

    // Model resolution: switch to the configured model for this capability.
    // Runs after prompt injection but before the LLM call.
    if (capabilityName && ctx.modelRegistry) {
      const resolved = resolveModelForCapability(capabilityName);
      if (resolved) {
        // Skip if current model already matches
        const currentProvider = ctx.model?.provider;
        const currentId = ctx.model?.id;
        if (
          currentProvider === resolved.provider &&
          currentId === resolved.modelId
        ) {
          return result;
        }

        // Look up the full Model object from pi's registry
        const model = ctx.modelRegistry.find(
          resolved.provider,
          resolved.modelId,
        );
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

  // Register loop engine AFTER before_agent_start so its handler runs second.
  // Pi chains handlers sequentially via registration order — capability-session
  // injects project overview, skills, and instructions first, then loop-engine
  // receives all that content in _event.systemPrompt and appends phase instructions.
  setupLoopEngine(pi);
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

/**
 * Return the module-cached CapabilityConfig for the current session, or
 * `null` when unset (non-pio session, or before resources_discover ran).
 *
 * Returns the live object reference — callers must treat it as read-only.
 * The loop engine's `__pio-exit` wrapper uses this to reach the config at
 * exit time without its own state.
 */
export function getCurrentCapabilityConfig(): CapabilityConfig | null {
  return currentConfig === undefined ? null : currentConfig;
}

/** Exported for testing — returns the raw enrichedSessionParams (not a copy). */
export function getEnrichedSessionParamsForTesting():
  | Record<string, unknown>
  | undefined {
  return enrichedSessionParams;
}

/**
 * Return the compiled workflow phases from the prompt compiler.
 * Provides direct typed access for the loop engine — no Record<string, unknown> indirection.
 */
export function getCompiledWorkflowPhases(): WorkflowPhase[] | undefined {
  return compiledSections?._steps;
}
