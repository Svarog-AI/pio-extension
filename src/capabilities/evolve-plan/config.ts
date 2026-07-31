import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityPackageConfig } from "../../capability-package";
import type { CapState } from "../../capability-state";
import { BASE_TOOL_PARAMS, deriveQueueKey } from "../../capability-utils";
import { enqueueTask } from "../../queues";
import type { CapabilityContract } from "../../types";
import { OneOfGroup } from "../../types";
import type { PlanFrontmatter } from "../create-plan/schemas";
import { PLAN_FRONTMATTER_SCHEMA } from "../create-plan/schemas";
import { resolveEvolveWriteAllowlist } from "./callbacks";
import { COMPLETION_SUMMARY_SCHEMA, TASK_FRONTMATTER_SCHEMA } from "./schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read totalSteps from PLAN.md via CapState (returns null if unreadable). */
function getTotalSteps(capState?: CapState): number | null {
  if (!capState) return null;
  const plan = capState.input<PlanFrontmatter>("plan").read();
  return plan?.totalSteps ?? null;
}

// ---------------------------------------------------------------------------
// Contract (single source of truth — imported by callbacks)
// ---------------------------------------------------------------------------

export const CONTRACT: CapabilityContract = {
  inputs: [
    { name: "plan", paramKey: "planFile", schema: PLAN_FRONTMATTER_SCHEMA },
  ],
  outputs: [
    // Group 1: during plan execution (steps ≤ n) — normal output OR revision request
    new OneOfGroup(
      [
        // Option A: inner AND-group (bare array) — normal step output
        [
          {
            name: "task",
            file: "S{stepNumber:02d}/TASK.md",
            schema: TASK_FRONTMATTER_SCHEMA,
          },
          {
            name: "decisions",
            file: "S{stepNumber:02d}/DECISIONS.md",
            requiredWhen: (params) => {
              const stepNumber =
                typeof params?.stepNumber === "number"
                  ? params.stepNumber
                  : NaN;
              return stepNumber > 1;
            },
          },
        ],
        // Option B: plan revision request — available at any step ≤ n
        { name: "revise-plan", file: "REVISE_PLAN_NEEDED.md" },
      ],
      (params, capState) => {
        const stepNumber =
          typeof params?.stepNumber === "number" ? params.stepNumber : NaN;
        const totalSteps = getTotalSteps(capState);
        if (totalSteps == null) return false;
        return stepNumber <= totalSteps;
      },
    ),

    // Group 2: beyond plan (step > n) — completion OR revision
    new OneOfGroup(
      [
        {
          name: "completion-summary",
          file: "COMPLETION_SUMMARY.md",
          schema: COMPLETION_SUMMARY_SCHEMA,
        },
        { name: "revise-plan", file: "REVISE_PLAN_NEEDED.md" },
      ],
      (params, capState) => {
        const stepNumber =
          typeof params?.stepNumber === "number" ? params.stepNumber : NaN;
        const totalSteps = getTotalSteps(capState);
        if (totalSteps == null) return false;
        return stepNumber > totalSteps;
      },
    ),
  ],
};

// ---------------------------------------------------------------------------
// CapabilityPackageConfig (single source of truth)
// ---------------------------------------------------------------------------

const capabilityConfig = {
  capability: "evolve-plan",
  contract: CONTRACT,
  writeAllowlist: resolveEvolveWriteAllowlist,
  skills: {
    mandatory: ["pio-planning", "grill-me"],
  },
} satisfies CapabilityPackageConfig;

export default capabilityConfig;

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const evolvePlanTool = defineTool({
  name: "pio_evolve_plan",
  label: "Pio Evolve Plan",
  description:
    "Generate a step-by-step specification (TASK.md) for the next step in an existing PLAN.md. Use this tool directly — no bash commands or manual file creation needed. Queues the task. The user can run `/pio-next-task` to start the sub-session.",
  promptSnippet: "Generate TASK.md for the next plan step.",
  parameters: Type.Object({
    ...BASE_TOOL_PARAMS,
    planFile: Type.Optional(Type.String()),
    stepNumber: Type.Number({ description: "Step number to evolve" }),
  }),

  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const queueKey = deriveQueueKey(params.workspacePrefix);
    enqueueTask(ctx.cwd, queueKey, {
      capability: "evolve-plan",
      params: {
        workspacePrefix: params.workspacePrefix,
        sessionName:
          params.sessionName ?? `${queueKey} evolve-plan s${params.stepNumber}`,
        queueKey,
        stepNumber: params.stepNumber,
        additionalContext: params.additionalContext,
        planFile: params.planFile,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Task queued for Step ${params.stepNumber} of workspace "${params.workspacePrefix}". Use \`/pio-next-task\` to start the sub-session.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Setup (registers tool)
// ---------------------------------------------------------------------------

export function register(pi: ExtensionAPI) {
  pi.registerTool(evolvePlanTool);
}
