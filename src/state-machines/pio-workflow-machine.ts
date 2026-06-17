import * as path from "node:path";
import type { StateMachine, ResolverResult } from "../state-machines";
import { registerMachine } from "../state-machines";
import { discoverNextStep, stepFolderName } from "../fs-utils";
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

/** Construct the workspace prefix for a goal. */
function workspacePrefix(goalName: string): string {
  return "goals/" + goalName;
}

/** Resolve the goal directory from baseDir + workspace prefix. */
function goalDirFromPrefix(baseDir: string, prefix: string): string {
  return path.join(baseDir, prefix);
}

/** Derive a human-readable session name from goal name, capability, and optional step number. */
function sessionName(goalName: string, capability: string, stepNumber?: number): string {
  const base = `${goalName} ${capability}`;
  return stepNumber != null ? `${base} s${stepNumber}` : base;
}

// ---------------------------------------------------------------------------
// Edge resolve functions
// ---------------------------------------------------------------------------

/** create-goal → create-plan: always fires, preserve params as-is. */
function resolveCreateGoalToCreatePlan(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = extractGoalName(params);
  return {
    capability: "create-plan",
    initialMessage: goalName
      ? `Create an implementation plan for goal "${goalName}" based on GOAL.md.`
      : "Create an implementation plan based on GOAL.md.",
    sessionName: goalName ? sessionName(goalName, "create-plan") : "create-plan",
    params: params
      ? { ...params, ...(goalName && { workspacePrefix: workspacePrefix(goalName) }) }
      : undefined,
  };
}

/** create-plan → evolve-plan: always fires, set stepNumber to 1 (first step). */
function resolveCreatePlanToEvolvePlan(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = extractGoalName(params);
  return {
    capability: "evolve-plan",
    initialMessage: goalName
      ? `Generate the specification for Step 1 of goal "${goalName}".`
      : "Generate the specification for Step 1.",
    sessionName: goalName ? sessionName(goalName, "evolve-plan", 1) : "evolve-plan s1",
    params: {
      ...params,
      ...(goalName && { goalName }),
      stepNumber: 1,
      ...(goalName && { workspacePrefix: workspacePrefix(goalName) }),
    },
  };
}

/** evolve-plan → revise-plan: fires when current step signals revision is needed. */
function resolveEvolvePlanToRevisePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (!goalName) return undefined;

  const prefix = workspacePrefix(goalName);

  if (explicitStepNumber != null) {
    const evolveState = getCapState("evolve-plan", ctx.baseDir, { stepNumber: explicitStepNumber }, prefix);
    const revisePlanPath = stepFolderName(explicitStepNumber) + "/REVISE_PLAN_NEEDED";
    if (evolveState.undeclared(revisePlanPath).exists()) {
      return {
        capability: "revise-plan",
        initialMessage: `Revise the plan for goal "${goalName}". Revision triggered at Step ${explicitStepNumber}.`,
        sessionName: sessionName(goalName, "revise-plan"),
        params: { goalName, revisionTriggerStep: explicitStepNumber, workspacePrefix: prefix },
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
  if (!goalName) return undefined;

  const prefix = workspacePrefix(goalName);
  const evolveState = getCapState("evolve-plan", ctx.baseDir, {}, prefix);

  if (evolveState.output("completion-summary").exists()) {
    return {
      capability: "finalize-goal",
      initialMessage: `Finalize goal "${goalName}" — all steps are complete. Update .pio/PROJECT/ documentation with accumulated decisions.`,
      sessionName: sessionName(goalName, "finalize-goal"),
      params: { goalName, workspacePrefix: prefix },
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
  if (goalName) {
    const prefix = workspacePrefix(goalName);
    const evolveState = getCapState("evolve-plan", ctx.baseDir, {}, prefix);
    if (evolveState.output("completion-summary").exists()) {
      return undefined;
    }

    // Guard: if the current step signals revision, that edge should have fired instead.
    if (explicitStepNumber != null) {
      const evolveWithStep = getCapState("evolve-plan", ctx.baseDir, { stepNumber: explicitStepNumber }, prefix);
      const revisePlanPath = stepFolderName(explicitStepNumber) + "/REVISE_PLAN_NEEDED";
      if (evolveWithStep.undeclared(revisePlanPath).exists()) {
        return undefined;
      }
    }
  }

  const stepLabel = explicitStepNumber != null ? `Step ${explicitStepNumber}` : "the current step";
  return {
    capability: "execute-task",
    initialMessage: goalName
      ? `Implement ${stepLabel} of goal "${goalName}" using the specification in TASK.md.`
      : `Implement ${stepLabel} using the specification in TASK.md.`,
    sessionName: goalName ? sessionName(goalName, "execute-task", explicitStepNumber) : "execute-task",
    params: {
      ...(goalName && { goalName }),
      ...(explicitStepNumber != null ? { stepNumber: explicitStepNumber } : {}),
      ...(goalName && { workspacePrefix: workspacePrefix(goalName) }),
    },
  };
}

/** execute-task → review-task: always fires, propagate goalName and stepNumber. */
function resolveExecuteTaskToReviewTask(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  const stepLabel = explicitStepNumber != null ? `Step ${explicitStepNumber}` : "the current step";
  return {
    capability: "review-task",
    initialMessage: goalName
      ? `Review the implementation of ${stepLabel} for goal "${goalName}".`
      : `Review the implementation of ${stepLabel}.`,
    sessionName: goalName ? sessionName(goalName, "review-task", explicitStepNumber) : "review-task",
    params: {
      ...(goalName && { goalName }),
      ...(explicitStepNumber != null ? { stepNumber: explicitStepNumber } : {}),
      ...(goalName && { workspacePrefix: workspacePrefix(goalName) }),
    },
  };
}

/** review-task → evolve-plan: fires when step is approved (REVIEW.md decision === "APPROVED"). */
function resolveReviewTaskToEvolvePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null || !goalName) return undefined;

  const prefix = workspacePrefix(goalName);
  const reviewState = getCapState("review-task", ctx.baseDir, { stepNumber }, prefix);
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  if (reviewData?.decision === "APPROVED") {
    const nextStep = stepNumber + 1;
    return {
      capability: "evolve-plan",
      initialMessage: `Step ${stepNumber} approved. Generate the specification for Step ${nextStep} of goal "${goalName}".`,
      sessionName: sessionName(goalName, "evolve-plan", nextStep),
      params: { goalName, stepNumber: nextStep, workspacePrefix: prefix },
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

  if (!goalName) return undefined;

  // When stepNumber is null, still fire — re-execute whatever was run.
  const prefix = workspacePrefix(goalName);

  if (stepNumber != null) {
    const reviewState = getCapState("review-task", ctx.baseDir, { stepNumber }, prefix);
    const reviewData = reviewState.output<ReviewOutputs>("review").read();

    if (reviewData?.decision === "REJECTED") {
      return {
        capability: "execute-task",
        initialMessage: `Step ${stepNumber} rejected. Re-implement using the feedback in REVIEW.md.`,
        sessionName: sessionName(goalName, "execute-task", stepNumber),
        params: { goalName, stepNumber, workspacePrefix: prefix },
      };
    }
  } else {
    // No stepNumber — wiring bug upstream, still fire execute-task with whatever we have.
    return {
      capability: "execute-task",
      initialMessage: `Re-implement the step for goal "${goalName}".`,
      sessionName: sessionName(goalName, "execute-task"),
      params: { goalName, workspacePrefix: prefix },
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
  if (!goalName) {
    // Fallback: still fire but with minimal context.
    return { capability: "evolve-plan", initialMessage: "Generate the next step specification.", sessionName: "evolve-plan", params };
  }

  const prefix = workspacePrefix(goalName);
  const goalDir = goalDirFromPrefix(ctx.baseDir, prefix);
  const revisionTriggerStep = typeof params?.revisionTriggerStep === "number" ? params.revisionTriggerStep : undefined;

  // discoverNextStep still needed — revise-plan deletes non-APPROVED step folders via postExecute,
  // so the next step number can only be determined by scanning the filesystem.
  const nextStep = discoverNextStep(goalDir);

  return {
    capability: "evolve-plan",
    initialMessage: `Generate the specification for Step ${nextStep} of goal "${goalName}" after plan revision.`,
    sessionName: sessionName(goalName, "evolve-plan", nextStep),
    params: { ...params, goalName, stepNumber: nextStep, workspacePrefix: prefix, ...(revisionTriggerStep != null && { revisionTriggerStep }) },
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
    const nextStep = (parentStepNumber ?? 0) + 1;
    const prefix = workspacePrefix(parentGoalName);
    return {
      capability: "evolve-plan",
      initialMessage: `Subgoal completed. Generate the specification for Step ${nextStep} of parent goal "${parentGoalName}".`,
      sessionName: sessionName(parentGoalName, "evolve-plan", nextStep),
      params: {
        goalName: parentGoalName,
        stepNumber: nextStep,
        workspacePrefix: prefix,
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
