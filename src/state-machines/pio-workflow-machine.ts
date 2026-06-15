import type { StateMachine, ResolverResult } from "../state-machines";
import { registerMachine } from "../state-machines";
import { resolveGoalDir, discoverNextStep, stepFolderName } from "../fs-utils";
import { getCapState } from "./utils";
import type { ReviewOutputs } from "../capabilities/review-task/schemas";

const MACHINE_ID = "goal-driven-development";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Extract stepNumber from params if it's a valid number. */
function extractStepNumber(params?: Record<string, unknown>): number | undefined {
  return typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
}

/** Extract goalName from params if it's a string. */
function extractGoalName(params?: Record<string, unknown>): string | undefined {
  return typeof params?.goalName === "string" ? params.goalName : undefined;
}

// ---------------------------------------------------------------------------
// Edge resolve functions
// ---------------------------------------------------------------------------

/** create-goal → create-plan: always fires, preserve params as-is. */
function resolveCreateGoalToCreatePlan(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  return { capability: "create-plan", params };
}

/** create-plan → evolve-plan: always fires, set stepNumber to 1 (first step). */
function resolveCreatePlanToEvolvePlan(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = extractGoalName(params);
  return { capability: "evolve-plan", params: { ...params, goalName, stepNumber: 1 } };
}

/** evolve-plan → revise-plan: fires when current step signals revision is needed. */
function resolveEvolvePlanToRevisePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    const evolveState = getCapState("evolve-plan", ctx.baseDir, { stepNumber: explicitStepNumber });
    const revisePlanPath = stepFolderName(explicitStepNumber) + "/REVISE_PLAN_NEEDED";
    if (evolveState.undeclared(revisePlanPath).exists()) {
      return {
        capability: "revise-plan",
        params: { goalName, revisionTriggerStep: explicitStepNumber },
      };
    }
  }

  return undefined;
}

/** evolve-plan → create-goal (subgoal): deprecated — always returns undefined. */
function resolveEvolvePlanToCreateGoal(
  _ctx: { baseDir: string },
  _params?: Record<string, unknown>,
): ResolverResult | undefined {
  // Subgoal support is deprecated. Keep the function for backward compatibility
  // but it never fires.
  return undefined;
}

/** evolve-plan → finalize-goal: fires when all plan steps are complete. */
function resolveEvolvePlanToFinalizeGoal(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = extractGoalName(params);

  const evolveState = getCapState("evolve-plan", ctx.baseDir);
  if (evolveState.output("completion-summary").exists()) {
    const cwd = process.cwd();
    const goalDir = resolveGoalDir(cwd, goalName!);
    return {
      capability: "finalize-goal",
      params: { goalName, goalDir },
    };
  }

  return undefined;
}

/** evolve-plan → execute-task: fallback — fires only when no higher-priority edge matched. */
function resolveEvolvePlanToExecuteTask(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  // Guard: if all plan steps are complete, finalize-goal edge should have fired.
  const evolveState = getCapState("evolve-plan", ctx.baseDir);
  if (evolveState.output("completion-summary").exists()) {
    return undefined;
  }

  // Guard: if the current step signals revision, that edge should have fired instead.
  if (explicitStepNumber != null) {
    const evolveWithStep = getCapState("evolve-plan", ctx.baseDir, { stepNumber: explicitStepNumber });
    const revisePlanPath = stepFolderName(explicitStepNumber) + "/REVISE_PLAN_NEEDED";
    if (evolveWithStep.undeclared(revisePlanPath).exists()) {
      return undefined;
    }
  }

  if (explicitStepNumber != null) {
    return {
      capability: "execute-task",
      params: { goalName, stepNumber: explicitStepNumber },
    };
  }

  // No explicit stepNumber — wiring bug upstream, don't mask it.
  return {
    capability: "execute-task",
    params: { goalName, stepNumber: undefined },
  };
}

/** execute-task → review-task: always fires, propagate goalName and stepNumber. */
function resolveExecuteTaskToReviewTask(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    return {
      capability: "review-task",
      params: { goalName, stepNumber: explicitStepNumber },
    };
  }

  // No explicit stepNumber — wiring bug upstream, don't mask it.
  return {
    capability: "review-task",
    params: { goalName, stepNumber: undefined },
  };
}

/** review-task → evolve-plan: fires when step is approved (REVIEW.md decision === "APPROVED"). */
function resolveReviewTaskToEvolvePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null) {
    return undefined;
  }

  const reviewState = getCapState("review-task", ctx.baseDir, { stepNumber });
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  if (reviewData?.decision === "APPROVED") {
    return {
      capability: "evolve-plan",
      params: { goalName, stepNumber: stepNumber + 1 },
    };
  }

  return undefined;
}

/** review-task → execute-task: fires when step is rejected (re-execute same step). */
function resolveReviewTaskToExecuteTask(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null) {
    return { capability: "execute-task", params };
  }

  const reviewState = getCapState("review-task", ctx.baseDir, { stepNumber });
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  // Fire only when the step is rejected — re-execute the same step.
  // When approved, the evolve-plan edge fires instead (checked first in edges array).
  if (reviewData?.decision === "REJECTED") {
    return {
      capability: "execute-task",
      params: { goalName, stepNumber },
    };
  }

  return undefined;
}

/** revise-plan → evolve-plan: always fires, discover next step number. */
function resolveRevisePlanToEvolvePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = extractGoalName(params);
  const revisionTriggerStep =
    typeof params?.revisionTriggerStep === "number" ? params.revisionTriggerStep : undefined;

  // After plan revision: find the next incomplete step.
  // revise-plan's postExecute deletes non-APPROVED step folders.
  // discoverNextStep() returns N+1 where N is highest complete step (TASK.md + TEST.md), or 1 if none.
  const nextStep = discoverNextStep(ctx.baseDir);

  return {
    capability: "evolve-plan",
    params: { ...params, goalName, stepNumber: nextStep, ...(revisionTriggerStep != null && { revisionTriggerStep }) },
  };
}

/** finalize-goal → evolve-plan: fires only when parentGoalName exists (subgoal completion). */
function resolveFinalizeGoalToEvolvePlan(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const parentGoalName = typeof params?.parentGoalName === "string" ? params.parentGoalName : undefined;
  const parentStepNumber = typeof params?.parentStepNumber === "number" ? params.parentStepNumber : undefined;

  if (parentGoalName) {
    return {
      capability: "evolve-plan",
      params: {
        goalName: parentGoalName,
        stepNumber: (parentStepNumber ?? 0) + 1,
      },
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// State machine configuration
// ---------------------------------------------------------------------------

export const goalDrivenDevelopment: StateMachine<{ baseDir: string }> = {
  id: MACHINE_ID,
  name: "Goal-Driven Development",
  description: "Default pio workflow state machine for goal-driven development",
  edges: [
    { from: "create-goal",   to: "create-plan",   resolve: resolveCreateGoalToCreatePlan },
    { from: "create-plan",   to: "evolve-plan",    resolve: resolveCreatePlanToEvolvePlan },
    { from: "evolve-plan",   to: "revise-plan",    resolve: resolveEvolvePlanToRevisePlan },
    { from: "evolve-plan",   to: "create-goal",    resolve: resolveEvolvePlanToCreateGoal },
    { from: "evolve-plan",   to: "finalize-goal",  resolve: resolveEvolvePlanToFinalizeGoal },
    { from: "evolve-plan",   to: "execute-task",   resolve: resolveEvolvePlanToExecuteTask },
    { from: "execute-task",  to: "review-task",    resolve: resolveExecuteTaskToReviewTask },
    { from: "review-task",   to: "evolve-plan",    resolve: resolveReviewTaskToEvolvePlan },
    { from: "review-task",   to: "execute-task",   resolve: resolveReviewTaskToExecuteTask },
    { from: "revise-plan",   to: "evolve-plan",    resolve: resolveRevisePlanToEvolvePlan },
    { from: "finalize-goal", to: "evolve-plan",    resolve: resolveFinalizeGoalToEvolvePlan },
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
