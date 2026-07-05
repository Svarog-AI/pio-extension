import * as fs from "node:fs";

import type { ExecutionSummaryOutputs } from "../capabilities/execute-task/schemas";
import type { QualityGateOutputs } from "../capabilities/quality-gate/schemas";
import type { ReviewOutputs } from "../capabilities/review-task/schemas";
import { stepFolderName } from "../fs-utils";
import type { ResolverResult, StateMachine } from "../state-machines";
import { registerMachine } from "../state-machines";
import { getCapState } from "./utils";

const MACHINE_ID = "goal-driven-development";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Extract stepNumber from params if it's a valid number. */
function extractStepNumber(
  params?: Record<string, unknown>,
): number | undefined {
  return typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
}

/** Require goalName from params — derive from queueKey (pio-workflow convention).
 * Throw if missing (wiring error). */
function requireGoalName(
  resolver: string,
  params?: Record<string, unknown>,
): string {
  const goalName =
    typeof params?.queueKey === "string" ? params.queueKey : undefined;
  if (!goalName) {
    throw new Error(
      `${resolver}: queueKey missing from session params — wiring error upstream`,
    );
  }
  return goalName;
}

/** Require stepNumber from params — throw if missing (wiring error). */
function requireStepNumber(
  resolver: string,
  params?: Record<string, unknown>,
): number {
  const stepNumber = extractStepNumber(params);
  if (stepNumber == null) {
    throw new Error(
      `${resolver}: stepNumber missing from session params — wiring error upstream`,
    );
  }
  return stepNumber;
}

/** Construct the workspace prefix for a goal. */
function workspacePrefix(goalName: string): string {
  return `goals/${goalName}`;
}

/** Construct the workspace prefix for a step within a goal (includes step folder). */
function stepWorkspacePrefix(goalName: string, stepNumber: number): string {
  return `${workspacePrefix(goalName)}/${stepFolderName(stepNumber)}`;
}

/** Derive a human-readable session name from goal name, capability, and optional step number. */
function sessionName(
  goalName: string,
  capability: string,
  stepNumber?: number,
): string {
  const base = `${goalName} ${capability}`;
  return stepNumber != null ? `${base} s${stepNumber}` : base;
}

// ---------------------------------------------------------------------------
// Edge resolve functions
// ---------------------------------------------------------------------------

/** create-goal → create-plan: always fires, preserve params as-is. */
function resolveCreateGoalToCreatePlan(
  _ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = requireGoalName("resolveCreateGoalToCreatePlan", params);

  const parentGoalName =
    typeof params?.parentGoalName === "string"
      ? params.parentGoalName
      : undefined;
  const parentStepNumber =
    typeof params?.parentStepNumber === "number"
      ? params.parentStepNumber
      : undefined;

  return {
    capability: "create-plan",
    initialMessage: `Create an implementation plan for goal "${goalName}". Read GOAL.md to understand current state and target, then produce PLAN.md.`,
    sessionName: sessionName(goalName, "create-plan"),
    params: {
      workspacePrefix: workspacePrefix(goalName),
      queueKey: goalName,
      ...(parentGoalName != null && { parentGoalName }),
      ...(parentStepNumber != null && { parentStepNumber }),
    },
  };
}

/** create-plan → evolve-plan: always fires, set stepNumber to 1 (first step). */
function resolveCreatePlanToEvolvePlan(
  _ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = requireGoalName("resolveCreatePlanToEvolvePlan", params);

  return {
    capability: "evolve-plan",
    initialMessage: `Generate the specification for Step 1. Read PLAN.md — locate \`### Step 1:\`, review its description and acceptance criteria, then write TASK.md in S01/.`,
    sessionName: sessionName(goalName, "evolve-plan", 1),
    params: {
      stepNumber: 1,
      workspacePrefix: workspacePrefix(goalName),
      queueKey: goalName,
    },
  };
}

/** evolve-plan → revise-plan: fires when workspace-root REVISE_PLAN_NEEDED.md exists. */
function resolveEvolvePlanToRevisePlan(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveEvolvePlanToRevisePlan", params);
  const prefix = workspacePrefix(goalName);

  // ctx.workspaceDir is the resolved goal directory — no additional prefix needed
  const evolveState = getCapState("evolve-plan", ctx.workspaceDir, {});

  // Check workspace-root REVISE_PLAN_NEEDED.md via contract output name.
  // Use tryResolveOutput (non-throwing) — "revise-plan" is added to the contract by Step 5.
  // Before Step 5: returns undefined → no transition. After Step 5: resolves path → checks existence.
  const revisePlan = evolveState.tryResolveOutput("revise-plan");

  // Grab stepNumber from params for downstream threading to revise-plan → evolve-plan.
  // Every other edge to a step-aware capability already passes stepNumber in params —
  // this just makes revise-plan consistent. At completion-triggered revision (step n+1),
  // stepNumber may be absent — handled by the guard: without stepNumber,
  // resolveRevisePlanToEvolvePlan will throw (dispatch catches it as wiring error).
  const stepNumber = extractStepNumber(params);

  if (revisePlan && fs.existsSync(revisePlan.path)) {
    return {
      capability: "revise-plan",
      initialMessage: `Revise the plan for goal "${goalName}". Read REVISE_PLAN_NEEDED.md at the workspace root for the reason, check PLAN_ARCHIVE/ for previous plans, and read GOAL.md for scope boundaries. Write a fresh PLAN.md.`,
      sessionName: sessionName(goalName, "revise-plan"),
      params: {
        workspacePrefix: prefix,
        queueKey: goalName,
        revisionContextFile: "REVISE_PLAN_NEEDED.md",
        ...(stepNumber != null && { stepNumber }),
      },
    };
  }

  return undefined;
}

/** evolve-plan → create-goal (subgoal): deprecated — always returns undefined. */
function resolveEvolvePlanToCreateGoal(
  _ctx: { workspaceDir: string },
  _params?: Record<string, unknown>,
): ResolverResult | undefined {
  // Subgoal support is deprecated. Keep the function for backward compatibility
  // but it never fires.
  return undefined;
}

/** evolve-plan → quality-gate: fires when all plan steps are complete. */
function resolveEvolvePlanToQualityGate(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveEvolvePlanToQualityGate", params);

  const prefix = workspacePrefix(goalName);
  // ctx.workspaceDir is already the resolved directory — no additional prefix needed
  const evolveState = getCapState("evolve-plan", ctx.workspaceDir, {});

  // Guard: if REVISE_PLAN_NEEDED.md exists, revision takes priority over completion.
  // Both files are mutually exclusive by convention — this is defense-in-depth.
  const revisePlan = evolveState.tryResolveOutput("revise-plan");
  if (revisePlan && fs.existsSync(revisePlan.path)) {
    return undefined;
  }

  if (evolveState.output("completion-summary").exists()) {
    const stepNumber = extractStepNumber(params);
    return {
      capability: "quality-gate",
      initialMessage: `All plan steps for goal "${goalName}" are complete. Perform quality gate: push commits, open PR, run E2E testing gate, run code review gate, then write QUALITY_GATE.md.`,
      sessionName: sessionName(goalName, "quality-gate"),
      params: {
        workspacePrefix: prefix,
        queueKey: goalName,
        requirementsFile: "COMPLETION_SUMMARY.md",
        ...(stepNumber != null && { stepNumber }),
      },
    };
  }

  return undefined;
}

/** quality-gate → finalize-goal: fires when QUALITY_GATE.md status is "approved". */
function resolveQualityGateToFinalizeGoal(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveQualityGateToFinalizeGoal", params);

  const prefix = workspacePrefix(goalName);
  // ctx.workspaceDir is already the resolved directory — no additional prefix needed
  const gateState = getCapState("quality-gate", ctx.workspaceDir, {});
  const gateData = gateState
    .output<QualityGateOutputs>("quality-gate-report")
    .read();

  if (gateData?.status !== "approved") {
    return undefined;
  }

  return {
    capability: "finalize-goal",
    initialMessage: `Quality gate approved for goal "${goalName}". Update .pio/PROJECT/ documentation with accumulated decisions.`,
    sessionName: sessionName(goalName, "finalize-goal"),
    params: { workspacePrefix: prefix, queueKey: goalName },
    cleanup: ["requirements"],
  };
}

/** quality-gate → revise-plan: fires when QUALITY_GATE.md status is "rejected". */
function resolveQualityGateToRevisePlan(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveQualityGateToRevisePlan", params);

  const prefix = workspacePrefix(goalName);
  // ctx.workspaceDir is already the resolved directory — no additional prefix needed
  const gateState = getCapState("quality-gate", ctx.workspaceDir, {});
  const gateData = gateState
    .output<QualityGateOutputs>("quality-gate-report")
    .read();

  if (gateData?.status !== "rejected") {
    return undefined;
  }

  const stepNumber = extractStepNumber(params);
  return {
    capability: "revise-plan",
    initialMessage: `Quality gate rejected for goal "${goalName}". Read QUALITY_GATE.md for rejection reasons, check PLAN_ARCHIVE/ for previous plans, and read GOAL.md for scope boundaries. Write a fresh PLAN.md.`,
    sessionName: sessionName(goalName, "revise-plan"),
    params: {
      workspacePrefix: prefix,
      queueKey: goalName,
      revisionContextFile: "QUALITY_GATE.md",
      ...(stepNumber != null && { stepNumber }),
    },
    cleanup: ["requirements"],
  };
}

/** evolve-plan → execute-task: fallback — fires only when no higher-priority edge matched. */
function resolveEvolvePlanToExecuteTask(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = requireStepNumber(
    "resolveEvolvePlanToExecuteTask",
    params,
  );
  const goalName = requireGoalName("resolveEvolvePlanToExecuteTask", params);

  // Guard: if all plan steps are complete, quality-gate edge should have fired.
  // ctx.workspaceDir is already the resolved directory — no additional prefix needed
  const evolveState = getCapState("evolve-plan", ctx.workspaceDir, {});
  if (evolveState.output("completion-summary").exists()) {
    return undefined;
  }

  // Guard: if workspace-root REVISE_PLAN_NEEDED.md exists, that edge should have fired.
  const revisePlan = evolveState.tryResolveOutput("revise-plan");
  if (revisePlan && fs.existsSync(revisePlan.path)) {
    return undefined;
  }

  return {
    capability: "execute-task",
    initialMessage: `Implement Step ${stepNumber}. Your workspace is the step directory (${stepFolderName(stepNumber)}/). Read TASK.md for the specification and acceptance criteria, then implement the changes.`,
    sessionName: sessionName(goalName, "execute-task", stepNumber),
    params: {
      stepNumber,
      workspacePrefix: stepWorkspacePrefix(goalName, stepNumber),
      queueKey: goalName,
    },
  };
}

/** execute-task → review-task: fires only when SUMMARY.md status is "completed". */
function resolveExecuteTaskToReviewTask(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = requireStepNumber(
    "resolveExecuteTaskToReviewTask",
    params,
  );
  const goalName = requireGoalName("resolveExecuteTaskToReviewTask", params);

  // Guard: read SUMMARY.md frontmatter — only transition to review-task if status is "completed".
  // This must read SUMMARY.md directly (not check for BLOCKED marker) because
  // dispatch (step 3 of mark-complete) runs before postExecute (step 4) creates the marker.
  const executeState = getCapState("execute-task", ctx.workspaceDir, {
    stepNumber,
  });
  const summaryData = executeState
    .output<ExecutionSummaryOutputs>("summary")
    .read();

  if (summaryData?.status !== "completed") {
    return undefined;
  }

  return {
    capability: "review-task",
    initialMessage: `Review Step ${stepNumber} for goal "${goalName}". Your workspace is the step directory. Read TASK.md for the specification, SUMMARY.md for what was implemented, and verify against acceptance criteria. Write REVIEW.md.`,
    sessionName: sessionName(goalName, "review-task", stepNumber),
    params: {
      stepNumber,
      workspacePrefix: stepWorkspacePrefix(goalName, stepNumber),
      queueKey: goalName,
    },
  };
}

/** execute-task → evolve-plan: fires when SUMMARY.md status is "blocked".
 * Routes to evolve-plan with the same step number for spec revision. */
function resolveExecuteTaskToEvolvePlan(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = requireStepNumber(
    "resolveExecuteTaskToEvolvePlan",
    params,
  );
  const goalName = requireGoalName("resolveExecuteTaskToEvolvePlan", params);

  // Guard: read SUMMARY.md frontmatter — only transition to evolve-plan if status is "blocked".
  const executeState = getCapState("execute-task", ctx.workspaceDir, {
    stepNumber,
  });
  const summaryData = executeState
    .output<ExecutionSummaryOutputs>("summary")
    .read();

  if (summaryData?.status !== "blocked") {
    return undefined;
  }

  return {
    capability: "evolve-plan",
    initialMessage: `Step ${stepNumber} is blocked (execute-task). Your workspace is the step directory (${stepFolderName(stepNumber)}/). Read SUMMARY.md for blocker details, then evaluate whether the task can be adapted to work around the blocker or if structural plan changes are needed (write REVISE_PLAN_NEEDED.md at workspace root if so).`,
    sessionName: sessionName(goalName, "evolve-plan", stepNumber),
    params: {
      stepNumber,
      workspacePrefix: workspacePrefix(goalName),
      queueKey: goalName,
    },
  };
}

/** review-task → evolve-plan: fires when step is approved (REVIEW.md decision === "APPROVED")
 * or blocked (decision === "BLOCKED"). Both decisions route to evolve-plan —
 * APPROVED advances to next step, BLOCKED stays on the same step for spec revision. */
function resolveReviewTaskToEvolvePlan(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveReviewTaskToEvolvePlan", params);
  const stepNumber = requireStepNumber("resolveReviewTaskToEvolvePlan", params);

  const prefix = workspacePrefix(goalName);
  // ctx.workspaceDir is already the resolved directory — no additional prefix needed
  const reviewState = getCapState("review-task", ctx.workspaceDir, {
    stepNumber,
  });
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  if (reviewData?.decision === "APPROVED") {
    const nextStep = stepNumber + 1;
    return {
      capability: "evolve-plan",
      initialMessage: `Step ${stepNumber} approved. Generate the specification for Step ${nextStep}. Read PLAN.md — locate \`### Step ${nextStep}:\`, review its description, then write TASK.md in ${stepFolderName(nextStep)}/.`,
      sessionName: sessionName(goalName, "evolve-plan", nextStep),
      params: {
        stepNumber: nextStep,
        workspacePrefix: prefix,
        queueKey: goalName,
      },
    };
  }

  if (reviewData?.decision === "BLOCKED") {
    return {
      capability: "evolve-plan",
      initialMessage: `Step ${stepNumber} is blocked (review-task). Your workspace is the step directory (${stepFolderName(stepNumber)}/). Read REVIEW.md for blocker details, then evaluate whether the task can be adapted to work around the blocker or if structural plan changes are needed (write REVISE_PLAN_NEEDED.md at workspace root if so).`,
      sessionName: sessionName(goalName, "evolve-plan", stepNumber),
      params: {
        stepNumber,
        workspacePrefix: prefix,
        queueKey: goalName,
      },
    };
  }

  return undefined;
}

/** review-task → execute-task: fires when step is rejected (re-execute same step). */
function resolveReviewTaskToExecuteTask(
  ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveReviewTaskToExecuteTask", params);
  const stepNumber = requireStepNumber(
    "resolveReviewTaskToExecuteTask",
    params,
  );

  const _prefix = workspacePrefix(goalName);
  // ctx.workspaceDir is already the resolved directory — no additional prefix needed
  const reviewState = getCapState("review-task", ctx.workspaceDir, {
    stepNumber,
  });
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  if (reviewData?.decision === "REJECTED") {
    return {
      capability: "execute-task",
      initialMessage: `Step ${stepNumber} rejected. Your workspace is the step directory (${stepFolderName(stepNumber)}/). Read REVIEW.md for rejection reasons and categorized issues. Re-implement by addressing all critical and high-priority findings.`,
      sessionName: sessionName(goalName, "execute-task", stepNumber),
      params: {
        stepNumber,
        workspacePrefix: stepWorkspacePrefix(goalName, stepNumber),
        queueKey: goalName,
      },
    };
  }

  return undefined;
}

/** revise-plan → evolve-plan: always fires, use stepNumber from params. */
function resolveRevisePlanToEvolvePlan(
  _ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = requireGoalName("resolveRevisePlanToEvolvePlan", params);
  const stepNumber = requireStepNumber("resolveRevisePlanToEvolvePlan", params);

  const prefix = workspacePrefix(goalName);

  return {
    capability: "evolve-plan",
    initialMessage: `Plan revision complete. Generate the specification for Step ${stepNumber}. Read PLAN.md — locate \`### Step ${stepNumber}:\`, review its description, then write TASK.md in ${stepFolderName(stepNumber)}/.`,
    sessionName: sessionName(goalName, "evolve-plan", stepNumber),
    params: {
      stepNumber,
      workspacePrefix: prefix,
      queueKey: goalName,
    },
  };
}

/** finalize-goal → evolve-plan: fires only when parentGoalName exists (subgoal completion). */
function resolveFinalizeGoalToEvolvePlan(
  _ctx: { workspaceDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const parentGoalName =
    typeof params?.parentGoalName === "string"
      ? params.parentGoalName
      : undefined;
  const parentStepNumber =
    typeof params?.parentStepNumber === "number"
      ? params.parentStepNumber
      : undefined;

  if (parentGoalName) {
    const nextStep = (parentStepNumber ?? 0) + 1;
    const prefix = workspacePrefix(parentGoalName);
    return {
      capability: "evolve-plan",
      initialMessage: `Subgoal completed. Generate the specification for Step ${nextStep} of parent goal "${parentGoalName}". Read PLAN.md — locate \`### Step ${nextStep}:\`, then write TASK.md.`,
      sessionName: sessionName(parentGoalName, "evolve-plan", nextStep),
      params: {
        stepNumber: nextStep,
        workspacePrefix: prefix,
        queueKey: parentGoalName,
      },
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// State machine configuration
// ---------------------------------------------------------------------------

export const goalDrivenDevelopment: StateMachine<{ workspaceDir: string }> = {
  id: MACHINE_ID,
  name: "Goal-Driven Development",
  description: "Default pio workflow state machine for goal-driven development",
  edges: [
    {
      from: "create-goal",
      to: "create-plan",
      resolve: resolveCreateGoalToCreatePlan,
    },
    {
      from: "create-plan",
      to: "evolve-plan",
      resolve: resolveCreatePlanToEvolvePlan,
    },
    {
      from: "evolve-plan",
      to: "revise-plan",
      resolve: resolveEvolvePlanToRevisePlan,
    },
    {
      from: "evolve-plan",
      to: "create-goal",
      resolve: resolveEvolvePlanToCreateGoal,
    },
    {
      from: "evolve-plan",
      to: "quality-gate",
      resolve: resolveEvolvePlanToQualityGate,
    },
    {
      from: "evolve-plan",
      to: "execute-task",
      resolve: resolveEvolvePlanToExecuteTask,
    },
    {
      from: "execute-task",
      to: "review-task",
      resolve: resolveExecuteTaskToReviewTask,
    },
    {
      from: "execute-task",
      to: "evolve-plan",
      resolve: resolveExecuteTaskToEvolvePlan,
    },
    {
      from: "review-task",
      to: "evolve-plan",
      resolve: resolveReviewTaskToEvolvePlan,
    },
    {
      from: "review-task",
      to: "execute-task",
      resolve: resolveReviewTaskToExecuteTask,
    },
    {
      from: "revise-plan",
      to: "evolve-plan",
      resolve: resolveRevisePlanToEvolvePlan,
    },
    {
      from: "finalize-goal",
      to: "evolve-plan",
      resolve: resolveFinalizeGoalToEvolvePlan,
    },
    {
      from: "quality-gate",
      to: "finalize-goal",
      resolve: resolveQualityGateToFinalizeGoal,
    },
    {
      from: "quality-gate",
      to: "revise-plan",
      resolve: resolveQualityGateToRevisePlan,
    },
  ],
};

// ---------------------------------------------------------------------------
// Setup — registers the pio workflow machine
// ---------------------------------------------------------------------------

/**
 * Register the goal-driven-development state machine.
 * Called from index.ts during extension initialization.
 */
export function setupPioWorkflowMachine(): void {
  registerMachine(goalDrivenDevelopment);
}
