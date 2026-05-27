/**
 * Prompt compiler for capability packages.
 *
 * Reads component files from capability package directories and assembles
 * `CompiledPromptSections`. Replaces the old freeform `.md` file loading
 * in `session-capability.ts`.
 *
 * This module is a strict leaf: it imports only from `src/capability-package.ts`
 * and Node.js stdlib (`fs`, `path`). It must NOT import from `session-capability`,
 * `capability-discovery`, or any other capability module.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CapabilityPackageComponents,
  CapabilitySkills,
  CompiledPromptSections,
  WorkflowStep,
} from "./capability-package";
import {
  CAPABILITY_GUIDELINES_FILE,
  CAPABILITY_ROLE_FILE,
  CAPABILITY_WORKFLOW_FILE,
} from "./capability-package";

// ---------------------------------------------------------------------------
// readWorkflowSteps — loads workflow.ts from a capability package directory
// ---------------------------------------------------------------------------

/**
 * Read workflow steps from `workflow.ts` inside a capability package directory.
 *
 * Expects a default export of type `WorkflowStep[]`. Validates each step has
 * at least `id`, `title`, and `instructions` fields.
 *
 * @param dirPath - Absolute path to the capability package directory
 * @returns Array of workflow steps
 * @throws When workflow.ts is missing, has no default export, or import fails
 */
export async function readWorkflowSteps(dirPath: string): Promise<WorkflowStep[]> {
  const workflowPath = path.join(dirPath, CAPABILITY_WORKFLOW_FILE);

  if (!fs.existsSync(workflowPath)) {
    console.warn(`[pio] Prompt compiler: ${CAPABILITY_WORKFLOW_FILE} not found at "${workflowPath}"`);
    throw new Error(`Required file ${CAPABILITY_WORKFLOW_FILE} not found in "${dirPath}"`);
  }

  let mod: any;
  try {
    mod = await import(workflowPath);
  } catch (err) {
    console.warn(
      `[pio] Prompt compiler: failed to import ${CAPABILITY_WORKFLOW_FILE} from "${dirPath}": ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }

  const steps = mod.default;

  if (!Array.isArray(steps)) {
    console.warn(
      `[pio] Prompt compiler: ${CAPABILITY_WORKFLOW_FILE} in "${dirPath}" does not default-export an array — expected WorkflowStep[]`
    );
    throw new Error(`${CAPABILITY_WORKFLOW_FILE} must default-export a WorkflowStep[] array`);
  }

  // Validate each step has required fields
  for (const step of steps) {
    if (!step.id || !step.title || !step.instructions) {
      console.warn(
        `[pio] Prompt compiler: malformed workflow step in "${dirPath}" — missing id, title, or instructions: ${JSON.stringify(step)}`
      );
    }
  }

  return steps as WorkflowStep[];
}

// ---------------------------------------------------------------------------
// renderWorkflowSection — pure function: WorkflowStep[] → markdown string
// ---------------------------------------------------------------------------

/**
 * Render workflow steps into a markdown section.
 *
 * Format per step:
 *   ### Step N: <title>
 *
 *   Skills: [skill-a], [skill-b]  (only when mandatory skills exist)
 *
 *   <instructions>
 *
 * This is a pure function — no filesystem access, deterministic output.
 *
 * @param steps - Array of workflow steps to render
 * @returns Markdown string representing the workflow section
 */
export function renderWorkflowSection(steps: WorkflowStep[]): string {
  if (steps.length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const lineNumber = i + 1;

    parts.push(`### Step ${lineNumber}: ${step.title}`);

    // Include Skills line only when step has mandatory skills
    const mandatorySkills = step.skills?.mandatory;
    if (mandatorySkills && mandatorySkills.length > 0) {
      const skillsLine = mandatorySkills.map((s) => `[${s}]`).join(", ");
      parts.push("");
      parts.push(`Skills: ${skillsLine}`);
    }

    parts.push("");
    parts.push(step.instructions);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// mergeWorkflowStepSkills — pure function: merge step skills into base skills
// ---------------------------------------------------------------------------

/**
 * Merge workflow step skills into base capability skills.
 *
 * Mandatory skills: concatenated with Set-based deduplication (preserves order, first-seen wins).
 * Recommended skills: concatenated with Map-based dedup by `name` key (first-seen wins).
 * Returns a new `CapabilitySkills` object — never mutates inputs.
 *
 * @param steps - Array of workflow steps with per-step skill declarations
 * @param base - Base capability skills (from config.ts), optional
 * @returns Merged capability skills
 */
export function mergeWorkflowStepSkills(
  steps: WorkflowStep[],
  base?: CapabilitySkills,
): CapabilitySkills {
  const mandatory = new Set<string>();
  const recommended = new Map<string, { name: string; condition: string }>();

  // Start with base skills
  if (base?.mandatory) {
    for (const name of base.mandatory) {
      mandatory.add(name);
    }
  }
  if (base?.recommended) {
    for (const entry of base.recommended) {
      recommended.set(entry.name, entry);
    }
  }

  // Merge step-level skills
  for (const step of steps) {
    if (step.skills?.mandatory) {
      for (const name of step.skills.mandatory) {
        mandatory.add(name);
      }
    }
    if (step.skills?.recommended) {
      for (const entry of step.skills.recommended) {
        if (!recommended.has(entry.name)) {
          recommended.set(entry.name, entry);
        }
      }
    }
  }

  const result: CapabilitySkills = {};
  if (mandatory.size > 0) result.mandatory = [...mandatory];
  if (recommended.size > 0) result.recommended = [...recommended.values()];
  return result;
}

// ---------------------------------------------------------------------------
// readPackageComponents — reads all component files from a package directory
// ---------------------------------------------------------------------------

/**
 * Read all component files from a capability package directory.
 *
 * - role.md (optional): Read as raw text
 * - workflow.ts (required): Loaded via dynamic import, must default-export WorkflowStep[]
 * - guidelines.md (optional): Read as raw text
 *
 * @param dirPath - Absolute path to the capability package directory
 * @returns Resolved components with role, steps, and guidelines
 * @throws When workflow.ts is missing or malformed
 */
export async function readPackageComponents(dirPath: string): Promise<CapabilityPackageComponents> {
  // Read role.md (optional) — raw text
  const rolePath = path.join(dirPath, CAPABILITY_ROLE_FILE);
  const role = fs.existsSync(rolePath)
    ? fs.readFileSync(rolePath, "utf-8")
    : undefined;

  // Read workflow.ts (required)
  const steps = await readWorkflowSteps(dirPath);

  // Read guidelines.md (optional) — wraps in CapabilityGuidelines shape
  const guidelinesPath = path.join(dirPath, CAPABILITY_GUIDELINES_FILE);
  const guidelines = fs.existsSync(guidelinesPath)
    ? { content: fs.readFileSync(guidelinesPath, "utf-8") }
    : undefined;

  return { role, steps, guidelines };
}

// ---------------------------------------------------------------------------
// compilePrompt — main entry point
// ---------------------------------------------------------------------------
/** Options for compiling a prompt from a capability package directory. */
export interface CompilePromptOptions {
  /** Capability-level skills from config.ts (base for skill merging) */
  baseSkills?: CapabilitySkills;
}

/**
 * Compile the full `CompiledPromptSections` from a capability package directory.
 *
 * Reads component files (role.md, workflow.ts, guidelines.md), merges workflow
 * step skills into base capability skills, and renders sections in the format
 * expected by `session-capability.ts`.
 *
 * Produces: role, workflow, guidelines sections and mergedSkills.
 * Does NOT produce projectContext or skillLoading — those are handled by session-capability.
 *
 * @param capabilityDir - Absolute path to the capability package directory
 * @param options - Compile options (baseSkills for merging)
 * @returns Compiled prompt sections with merged skills
 * @throws When workflow.ts is missing or malformed
 */
export async function compilePrompt(
  capabilityDir: string,
  options: CompilePromptOptions = {},
): Promise<CompiledPromptSections> {
  // 1. Read component files
  const components = await readPackageComponents(capabilityDir);

  // 2. Merge workflow step skills into base capability skills
  const mergedSkills = mergeWorkflowStepSkills(components.steps, options.baseSkills);

  // 3. Render sections
  const sections: CompiledPromptSections = {};

  // Role section (optional) — role is raw string from role.md
  if (components.role) {
    sections.role = `## Role\n\n${components.role}`;
  }

  // Workflow section (always present — workflow is required)
  const workflowContent = renderWorkflowSection(components.steps);
  sections.workflow = `## Workflow\n\n${workflowContent}`;

  // Guidelines section (optional)
  if (components.guidelines) {
    sections.guidelines = `## Guidelines\n\n${components.guidelines.content}`;
  }

  // 4. Attach merged skills
  sections.mergedSkills = mergedSkills;

  // 5. Attach raw steps for step nudging (totalWorkflowSteps, workflowSteps)
  sections._steps = components.steps;

  return sections;
}
