/**
 * Prompt compiler for capability packages.
 *
 * Reads component files from capability package directories and assembles
 * `CompiledPromptSections`. Replaces the old freeform `.md` file loading
 * in `capability-session.ts`.
 *
 * This module is a strict leaf: it imports from `src/capability-package.ts`
 * (layout constants + package structure types), `src/runtime/workflow-types.ts`
 * (workflow execution types), and Node.js stdlib (`fs`, `path`). It must NOT
 * import from `capability-session`, `capability-discovery`, or any other
 * capability module.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CapabilityPackageComponents,
  CapabilitySkills,
} from "./capability-package";
import {
  CAPABILITY_GUIDELINES_FILE,
  CAPABILITY_ROLE_FILE,
  CAPABILITY_WORKFLOW_FILE,
} from "./capability-package";
import type {
  CompiledPromptSections,
  WorkflowPhase,
} from "./runtime/workflow-types";

// ---------------------------------------------------------------------------
// readWorkflowPhases — loads workflow.ts from a capability package directory
// ---------------------------------------------------------------------------

/**
 * Read workflow phases from `workflow.ts` inside a capability package directory.
 *
 * Expects a default export of type `WorkflowPhase[]`. Validates each phase has
 * at least `id`, `title`, and `instructions` fields. Only standard (or
 * kind-omitted) phases require `instructions` — programmatic kinds
 * (`branch:*`, `code`, `loop`, `variable-definition`) never render authored
 * instructions, so they are exempt from the check.
 *
 * @param dirPath - Absolute path to the capability package directory
 * @returns Array of workflow phases
 * @throws When workflow.ts is missing, has no default export, or import fails
 */
export async function readWorkflowPhases(
  dirPath: string,
): Promise<WorkflowPhase[]> {
  const workflowPath = path.join(dirPath, CAPABILITY_WORKFLOW_FILE);

  if (!fs.existsSync(workflowPath)) {
    console.warn(
      `[pio] Prompt compiler: ${CAPABILITY_WORKFLOW_FILE} not found at "${workflowPath}"`,
    );
    throw new Error(
      `Required file ${CAPABILITY_WORKFLOW_FILE} not found in "${dirPath}"`,
    );
  }

  let mod: unknown;
  try {
    mod = await import(workflowPath);
  } catch (err) {
    console.warn(
      `[pio] Prompt compiler: failed to import ${CAPABILITY_WORKFLOW_FILE} from "${dirPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }

  const steps = (mod as { default: unknown }).default;

  if (!Array.isArray(steps)) {
    console.warn(
      `[pio] Prompt compiler: ${CAPABILITY_WORKFLOW_FILE} in "${dirPath}" does not default-export an array — expected WorkflowPhase[]`,
    );
    throw new Error(
      `${CAPABILITY_WORKFLOW_FILE} must default-export a WorkflowPhase[] array`,
    );
  }

  // Validate each phase has required fields
  // Only standard (or kind-omitted) phases receive an agent turn and render
  // authored .instructions. Programmatic kinds are exempt: branch:* route via
  // callbacks, code/loop execute inline without turns, and
  // variable-definition phases have engine-generated instructions.
  for (const phase of steps) {
    const requiresInstructions =
      phase.kind === undefined || phase.kind === "standard";
    const missingInstructions = requiresInstructions && !phase.instructions;
    if (!phase.id || !phase.title || missingInstructions) {
      console.warn(
        `[pio] Prompt compiler: malformed workflow phase in "${dirPath}" — missing id, title, or instructions: ${JSON.stringify(phase)}`,
      );
    }
  }

  return steps as WorkflowPhase[];
}

// ---------------------------------------------------------------------------
// mergeWorkflowPhaseSkills — pure function: merge phase skills into base skills
// ---------------------------------------------------------------------------

/**
 * Merge workflow phase skills into base capability skills.
 *
 * Mandatory skills: concatenated with Set-based deduplication (preserves order, first-seen wins).
 * Recommended skills: concatenated with Map-based dedup by `name` key (first-seen wins).
 * Returns a new `CapabilitySkills` object — never mutates inputs.
 *
 * @param steps - Array of workflow phases with per-phase skill declarations
 * @param base - Base capability skills (from config.ts), optional
 * @returns Merged capability skills
 */
export function mergeWorkflowPhaseSkills(
  steps: WorkflowPhase[],
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

  // Merge phase-level skills
  for (const phase of steps) {
    if (phase.skills?.mandatory) {
      for (const name of phase.skills.mandatory) {
        mandatory.add(name);
      }
    }
    if (phase.skills?.recommended) {
      for (const entry of phase.skills.recommended) {
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
 * - workflow.ts (required): Loaded via dynamic import, must default-export WorkflowPhase[]
 * - guidelines.md (optional): Read as raw text
 *
 * @param dirPath - Absolute path to the capability package directory
 * @returns Resolved components with role, phases, and guidelines
 * @throws When workflow.ts is missing or malformed
 */
export async function readPackageComponents(
  dirPath: string,
): Promise<CapabilityPackageComponents> {
  // Read role.md (optional) — raw text
  const rolePath = path.join(dirPath, CAPABILITY_ROLE_FILE);
  const role = fs.existsSync(rolePath)
    ? fs.readFileSync(rolePath, "utf-8")
    : undefined;

  // Read workflow.ts (required)
  const steps = await readWorkflowPhases(dirPath);

  // Read guidelines.md (optional) — wraps in CapabilityGuidelines shape
  const guidelinesPath = path.join(dirPath, CAPABILITY_GUIDELINES_FILE);
  const guidelines = fs.existsSync(guidelinesPath)
    ? { content: fs.readFileSync(guidelinesPath, "utf-8") }
    : undefined;

  return { role, phases: steps, guidelines };
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
 * phase skills into base capability skills, and renders sections in the format
 * expected by `capability-session.ts`.
 *
 * Produces: role, guidelines sections and mergedSkills.
 * Does NOT produce projectContext or skillLoading — those are handled by capability-session.
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

  // 2. Merge workflow phase skills into base capability skills
  const mergedSkills = mergeWorkflowPhaseSkills(
    components.phases,
    options.baseSkills,
  );

  // 3. Render sections
  const sections: CompiledPromptSections = {};

  // Role section (optional) — role is raw string from role.md
  if (components.role) {
    sections.role = `## Role\n\n${components.role}`;
  }

  // Guidelines section (optional)
  if (components.guidelines) {
    sections.guidelines = `## Guidelines\n\n${components.guidelines.content}`;
  }

  // 4. Attach merged skills
  sections.mergedSkills = mergedSkills;

  // 5. Attach raw phases for loop engine (accessed via getCompiledWorkflowPhases)
  sections._steps = components.phases;

  return sections;
}
