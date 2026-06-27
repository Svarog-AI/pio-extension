import type {
  ExtensionAPI,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getSessionConfig } from "../capability-utils";

// ---------------------------------------------------------------------------
// Module-level state (per-extension-instance, populated by resources_discover)
// ---------------------------------------------------------------------------

/** True when running inside a capability sub-session (detected via pio-config). */
let isActivePioSession = false;

/** Current workflow step number (1-based). 0 means nudging is inactive. */
let currentWorkflowStep = 0;

/** Total number of workflow steps. 0 means nudging is inactive. */
let totalWorkflowSteps = 0;

/** Ordered list of workflow step descriptors for title lookups. */
let stepsList: { id: string; title: string }[] = [];

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

/**
 * Test-only accessor for the internal `isActivePioSession` flag.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate session state without mocking the full ExtensionAPI.
 */
export function __testSetActiveSession(value?: boolean): boolean {
  if (value !== undefined) {
    isActivePioSession = value;
  }
  return isActivePioSession;
}

/**
 * Test-only accessor for the internal `currentWorkflowStep` variable.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate workflow step state without mocking the full ExtensionAPI.
 */
export function __testSetCurrentWorkflowStep(value?: number): number {
  if (value !== undefined) {
    currentWorkflowStep = value;
  }
  return currentWorkflowStep;
}

/**
 * Test-only accessor for the internal `totalWorkflowSteps` variable.
 *
 * @internal — Do not use in production code. Exists solely to allow unit tests
 * to read and manipulate workflow step state without mocking the full ExtensionAPI.
 */
export function __testSetTotalWorkflowSteps(value?: number): number {
  if (value !== undefined) {
    totalWorkflowSteps = value;
  }
  return totalWorkflowSteps;
}

/**
 * Test-only accessor for the internal `stepsList` array.
 *
 * @internal — Do not use in production code.
 */
export function __testSetStepsList(
  value?: { id: string; title: string }[],
): { id: string; title: string }[] {
  if (value !== undefined) {
    stepsList = value;
  }
  return stepsList;
}

// ---------------------------------------------------------------------------
// Nudge message generation — pure function
// ---------------------------------------------------------------------------

/**
 * Generate a nudge message indicating the current workflow step.
 *
 * @param current - Current workflow step number (1-based)
 * @param total - Total number of workflow steps
 * @param steps - Optional list of step descriptors for title lookups
 * @returns Formatted nudge message string
 */
export function generateNudgeMessage(
  current: number,
  total: number,
  steps?: { id: string; title: string }[],
): string {
  const isLastStep = current >= total;
  const stepTitle =
    steps && steps.length > 0 ? steps[current - 1]?.title : undefined;

  if (isLastStep) {
    if (stepTitle) {
      return `--- WORKFLOW STEP CONTROL ---\nYou are on the final step '${stepTitle}' (${total} of ${total}). If you need clarification, call \`ask_user\`. Otherwise, when you have completed all work, call \`pio_mark_complete\` to validate your outputs and finish the session.`;
    }
    return `--- WORKFLOW STEP CONTROL ---\nYou are on the final workflow step (${total} of ${total}). If you need clarification, call \`ask_user\`. Otherwise, when you have completed all work, call \`pio_mark_complete\` to validate your outputs and finish the session.`;
  }

  if (stepTitle) {
    return `--- WORKFLOW STEP CONTROL ---\nYou are currently on '${stepTitle}' (workflow step ${current} of ${total}). When you have completed this step, call the \`workflow-step-finish\` tool to move to the next workflow step. If not ready yet, keep working — no action needed to stay on this step. Or call \`ask_user\` if you need clarification before finishing.`;
  }

  return `--- WORKFLOW STEP CONTROL ---\nYou are currently on workflow step ${current} of ${total}. When you have completed this step, call the \`workflow-step-finish\` tool to move to the next workflow step. If not ready yet, keep working — no action needed to stay on this step. Or call \`ask_user\` if you need clarification before finishing.`;
}

// ---------------------------------------------------------------------------
// Tool: workflow-step-finish
// ---------------------------------------------------------------------------

export const workflowStepFinishTool = defineTool({
  name: "workflow-step-finish",
  label: "Workflow Step Finish",
  description:
    "Signal that the current workflow step is complete and advance to the next step.",
  promptSnippet: "Advance to the next workflow step.",
  parameters: Type.Object({}),

  async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
    // Gated: not active outside capability sessions
    if (!isActivePioSession) {
      return {
        content: [
          { type: "text", text: "Step nudging is not active in this session." },
        ],
        details: {},
      };
    }

    // Increment step counter
    currentWorkflowStep++;

    // Clamp to total
    if (currentWorkflowStep > totalWorkflowSteps) {
      currentWorkflowStep = totalWorkflowSteps;
    }

    // Generate response
    const isLastStep = currentWorkflowStep >= totalWorkflowSteps;
    const stepTitle =
      stepsList.length > 0
        ? stepsList[currentWorkflowStep - 1]?.title
        : undefined;

    if (isLastStep) {
      return {
        content: [
          {
            type: "text",
            text: `All workflow steps completed. You are on the final workflow step (${totalWorkflowSteps} of ${totalWorkflowSteps}). If you need clarification, call \`ask_user\`. Otherwise, consider your work done and call pio_mark_complete if all outputs are ready.`,
          },
        ],
        details: {},
      };
    }

    if (stepTitle) {
      return {
        content: [
          {
            type: "text",
            text: `Workflow step finished. Moving to '${stepTitle}' (workflow step ${currentWorkflowStep} of ${totalWorkflowSteps}). If you need clarification before starting, call \`ask_user\`. Otherwise, continue with this step.`,
          },
        ],
        details: {},
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Workflow step finished. Moving to workflow step ${currentWorkflowStep} of ${totalWorkflowSteps}. If you need clarification before starting, call \`ask_user\`. Otherwise, continue with this step.`,
        },
      ],
      details: {},
    };
  },
});

// ---------------------------------------------------------------------------
// Setup — registers tool + event handlers on the pi Extension API
// ---------------------------------------------------------------------------

/**
 * Register step nudging tool and event handlers.
 *
 * When called, registers:
 * 1. `workflow-step-finish` tool — agents call to advance workflow step counter
 * 2. `resources_discover` handler — detects capability sub-sessions, initializes state
 * 3. `turn_end` handler — injects hidden nudge message via steer delivery
 * 4. `before_agent_start` handler — resets step counter at start of each agent run
 */
export function setupStepNudging(pi: ExtensionAPI) {
  // 1. Register the workflow-step-finish tool (globally, gated by isActive)
  pi.registerTool(workflowStepFinishTool);

  // 2. Detect capability sub-sessions and initialize state
  pi.on("resources_discover", async (_event, ctx) => {
    const config = await getSessionConfig(ctx);

    if (config) {
      isActivePioSession = true;

      const sessionParams = config.sessionParams || {};

      // Read totalWorkflowSteps from sessionParams
      if (typeof sessionParams.totalWorkflowSteps === "number") {
        totalWorkflowSteps = sessionParams.totalWorkflowSteps;
      } else {
        totalWorkflowSteps = 0;
      }

      // Read workflowSteps array from sessionParams (for title lookups)
      if (Array.isArray(sessionParams.workflowSteps)) {
        stepsList = sessionParams.workflowSteps as {
          id: string;
          title: string;
        }[];
      } else {
        stepsList = [];
      }

      // Set currentWorkflowStep to 1 if there are steps, otherwise 0
      currentWorkflowStep = totalWorkflowSteps > 0 ? 1 : 0;
    } else {
      isActivePioSession = false;
      currentWorkflowStep = 0;
      totalWorkflowSteps = 0;
      stepsList = [];
    }
  });

  // 3. Inject nudge message at the end of each turn
  pi.on("turn_end", async (event: TurnEndEvent, _ctx) => {
    // Guard: only active for capability sub-sessions with workflow steps defined
    if (!isActivePioSession) return;
    if (totalWorkflowSteps <= 0) return;
    if ((event.message as { stopReason?: string }).stopReason === "aborted")
      return;

    const message = generateNudgeMessage(
      currentWorkflowStep,
      totalWorkflowSteps,
      stepsList,
    );

    pi.sendMessage(
      {
        customType: "step-nudge",
        content: message,
        display: false,
      },
      { deliverAs: "steer" },
    );
  });

  // 4. Reset step counter at the start of each agent run
  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!isActivePioSession) return;
    currentWorkflowStep = 1;
  });
}
