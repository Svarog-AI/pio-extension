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

/** Require goalName from params — derive from queueKey (pio-workflow convention).
 * Throw if missing (wiring error). */
function requireGoalName(resolver: string, params?: Record<string, unknown>): string {
  const goalName = typeof params?.queueKey === "string" ? params.queueKey : undefined;
  if (!goalName) {
    throw new Error(`${resolver}: queueKey missing from session params — wiring error upstream`);
  }
  return goalName;
}

/** Require stepNumber from params — throw if missing (wiring error). */
function requireStepNumber(resolver: string, params?: Record<string, unknown>): number {
  const stepNumber = extractStepNumber(params);
  if (stepNumber == null) {
    throw new Error(`${resolver}: stepNumber missing from session params — wiring error upstream`);
  }
  return stepNumber;
}

/** Construct the workspace prefix for a goal. */
function workspacePrefix(goalName: string): string {
  return "goals/" + goalName;
}

/** Construct the workspace prefix for a step within a goal (includes step folder). */
function stepWorkspacePrefix(goalName: string, stepNumber: number): string {
  return `${workspacePrefix(goalName)}/${stepFolderName(stepNumber)}`;
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
  const goalName = requireGoalName("resolveCreateGoalToCreatePlan", params);

  return {
    capability: "create-plan",
    initialMessage: `Create an implementation plan for goal "${goalName}" based on GOAL.md.`,
    sessionName: sessionName(goalName, "create-plan"),
    params: { ...params, workspacePrefix: workspacePrefix(goalName), queueKey: goalName },
  };
}

/** create-plan → evolve-plan: always fires, set stepNumber to 1 (first step). */
function resolveCreatePlanToEvolvePlan(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = requireGoalName("resolveCreatePlanToEvolvePlan", params);

  return {
    capability: "evolve-plan",
    initialMessage: `Generate the specification for Step 1 of goal "${goalName}".`,
    sessionName: sessionName(goalName, "evolve-plan", 1),
    params: {
      ...params,
      stepNumber: 1,
      workspacePrefix: workspacePrefix(goalName),
      queueKey: goalName,
    },
  };
}

/** evolve-plan → revise-plan: fires when current step signals revision is needed. */
function resolveEvolvePlanToRevisePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveEvolvePlanToRevisePlan", params);
  const explicitStepNumber = extractStepNumber(params);

  const prefix = workspacePrefix(goalName);

  if (explicitStepNumber != null) {
    // ctx.baseDir is already the resolved directory — no additional prefix needed
    const evolveState = getCapState("evolve-plan", ctx.baseDir, { stepNumber: explicitStepNumber });
    const revisePlanPath = stepFolderName(explicitStepNumber) + "/REVISE_PLAN_NEEDED";
    if (evolveState.undeclared(revisePlanPath).exists()) {
      return {
        capability: "revise-plan",
        initialMessage: `Revise the plan for goal "${goalName}". Revision triggered at Step ${explicitStepNumber}.`,
        sessionName: sessionName(goalName, "revise-plan"),
        params: { revisionTriggerStep: explicitStepNumber, workspacePrefix: prefix, queueKey: goalName },
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
  const goalName = requireGoalName("resolveEvolvePlanToFinalizeGoal", params);

  const prefix = workspacePrefix(goalName);
  // ctx.baseDir is already the resolved directory — no additional prefix needed
  const evolveState = getCapState("evolve-plan", ctx.baseDir, {});

  if (evolveState.output("completion-summary").exists()) {
    return {
      capability: "finalize-goal",
      initialMessage: `Finalize goal "${goalName}" — all steps are complete. Update .pio/PROJECT/ documentation with accumulated decisions.`,
      sessionName: sessionName(goalName, "finalize-goal"),
      params: { workspacePrefix: prefix, queueKey: goalName },
    };
  }

  return undefined;
}

/** evolve-plan → execute-task: fallback — fires only when no higher-priority edge matched. */
function resolveEvolvePlanToExecuteTask(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = requireStepNumber("resolveEvolvePlanToExecuteTask", params);
  const goalName = requireGoalName("resolveEvolvePlanToExecuteTask", params);

  const prefix = workspacePrefix(goalName);

  // Guard: if all plan steps are complete, finalize-goal edge should have fired.
  // ctx.baseDir is already the resolved directory — no additional prefix needed
  const evolveState = getCapState("evolve-plan", ctx.baseDir, {});
  if (evolveState.output("completion-summary").exists()) {
    return undefined;
  }

  // Guard: if the current step signals revision, that edge should have fired instead.
  const evolveWithStep = getCapState("evolve-plan", ctx.baseDir, { stepNumber });
  const revisePlanPath = stepFolderName(stepNumber) + "/REVISE_PLAN_NEEDED";
  if (evolveWithStep.undeclared(revisePlanPath).exists()) {
    return undefined;
  }

  return {
    capability: "execute-task",
    initialMessage: `Implement Step ${stepNumber} of goal "${goalName}" using the specification in TASK.md.`,
    sessionName: sessionName(goalName, "execute-task", stepNumber),
    params: { stepNumber, workspacePrefix: stepWorkspacePrefix(goalName, stepNumber), queueKey: goalName },
  };
}

/** execute-task → review-task: always fires, propagate stepNumber. */
function resolveExecuteTaskToReviewTask(
  _ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const stepNumber = requireStepNumber("resolveExecuteTaskToReviewTask", params);
  const goalName = requireGoalName("resolveExecuteTaskToReviewTask", params);

  return {
    capability: "review-task",
    initialMessage: `Review the implementation of Step ${stepNumber} for goal "${goalName}".`,
    sessionName: sessionName(goalName, "review-task", stepNumber),
    params: { stepNumber, workspacePrefix: stepWorkspacePrefix(goalName, stepNumber), queueKey: goalName },
  };
}

/** review-task → evolve-plan: fires when step is approved (REVIEW.md decision === "APPROVED"). */
function resolveReviewTaskToEvolvePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveReviewTaskToEvolvePlan", params);
  const stepNumber = requireStepNumber("resolveReviewTaskToEvolvePlan", params);

  const prefix = workspacePrefix(goalName);
  // ctx.baseDir is already the resolved directory — no additional prefix needed
  const reviewState = getCapState("review-task", ctx.baseDir, { stepNumber });
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  if (reviewData?.decision === "APPROVED") {
    const nextStep = stepNumber + 1;
    return {
      capability: "evolve-plan",
      initialMessage: `Step ${stepNumber} approved. Generate the specification for Step ${nextStep} of goal "${goalName}".`,
      sessionName: sessionName(goalName, "evolve-plan", nextStep),
      params: { stepNumber: nextStep, workspacePrefix: prefix, queueKey: goalName },
    };
  }

  return undefined;
}

/** review-task → execute-task: fires when step is rejected (re-execute same step). */
function resolveReviewTaskToExecuteTask(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const goalName = requireGoalName("resolveReviewTaskToExecuteTask", params);
  const stepNumber = requireStepNumber("resolveReviewTaskToExecuteTask", params);

  const prefix = workspacePrefix(goalName);
  // ctx.baseDir is already the resolved directory — no additional prefix needed
  const reviewState = getCapState("review-task", ctx.baseDir, { stepNumber });
  const reviewData = reviewState.output<ReviewOutputs>("review").read();

  if (reviewData?.decision === "REJECTED") {
    return {
      capability: "execute-task",
      initialMessage: `Step ${stepNumber} rejected. Re-implement using the feedback in REVIEW.md.`,
      sessionName: sessionName(goalName, "execute-task", stepNumber),
      params: { stepNumber, workspacePrefix: stepWorkspacePrefix(goalName, stepNumber), queueKey: goalName },
    };
  }

  return undefined;
}

/** revise-plan → evolve-plan: always fires, discover next step number. */
function resolveRevisePlanToEvolvePlan(
  ctx: { baseDir: string },
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = requireGoalName("resolveRevisePlanToEvolvePlan", params);

  const prefix = workspacePrefix(goalName);
  // ctx.baseDir is already the resolved goal directory — no prefix needed
  const revisionTriggerStep = typeof params?.revisionTriggerStep === "number" ? params.revisionTriggerStep : undefined;

  // discoverNextStep still needed — revise-plan deletes non-APPROVED step folders via postExecute,
  // so the next step number can only be determined by scanning the filesystem.
  const nextStep = discoverNextStep(ctx.baseDir);

  return {
    capability: "evolve-plan",
    initialMessage: `Generate the specification for Step ${nextStep} of goal "${goalName}" after plan revision.`,
    sessionName: sessionName(goalName, "evolve-plan", nextStep),
    params: { ...params, stepNumber: nextStep, workspacePrefix: prefix, queueKey: goalName, ...(revisionTriggerStep != null && { revisionTriggerStep }) },
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
