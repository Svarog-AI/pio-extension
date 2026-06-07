import * as fs from "node:fs";
import * as path from "node:path";
import type { StateMachine, TransitionResult } from "../state-machines";
import { registerMachine } from "../state-machines";
import type { GoalState } from "../goal-state";
import { resolveGoalDir, stepFolderName } from "../fs-utils";

const MACHINE_ID = "goal-driven-development";

// ---------------------------------------------------------------------------
// Utility helpers (ported from state-machine.ts)
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
  _state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult {
  return { capability: "create-plan", stateMachineId: MACHINE_ID, params };
}

/** create-plan → evolve-plan: always fires, preserve params as-is. */
function resolveCreatePlanToEvolvePlan(
  _state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult {
  return { capability: "evolve-plan", stateMachineId: MACHINE_ID, params };
}

/** evolve-plan → revise-plan: fires when current step signals revision is needed. */
function resolveEvolvePlanToRevisePlan(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    const steps = state.steps();
    const currentStep = steps.find((s) => s.stepNumber === explicitStepNumber);
    if (currentStep && currentStep.revisionNeeded()) {
      return {
        capability: "revise-plan",
        stateMachineId: MACHINE_ID,
        params: { goalName, revisionTriggerStep: explicitStepNumber },
      };
    }
  }

  return undefined;
}

/** evolve-plan → create-goal (subgoal): fires when current step has complexity: "subgoal" (and revision is NOT needed). */
function resolveEvolvePlanToCreateGoal(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null && goalName) {
    const steps = state.steps();
    const currentStep = steps.find((s) => s.stepNumber === explicitStepNumber);
    if (currentStep) {
      // Guard: revision takes priority over subgoal spawning
      if (currentStep.revisionNeeded()) {
        return undefined;
      }
    } else {
      return undefined;
    }

    const stepMetadata = currentStep.getMetadata();

    if (stepMetadata && stepMetadata.complexity === "subgoal") {
      const cwd = process.cwd();
      const goalDir = resolveGoalDir(cwd, goalName);
      const parentStepDir = path.join(goalDir, stepFolderName(explicitStepNumber));
      const subgoalWorkingDir = resolveGoalDir(cwd, stepMetadata.name, parentStepDir);

      const relativeTaskPath = path.relative(subgoalWorkingDir, path.join(parentStepDir, "TASK.md"));
      const initialMessage = `This is a subgoal step. Read ${relativeTaskPath} from the parent goal for decomposition scope context.`;

      return {
        capability: "create-goal",
        stateMachineId: MACHINE_ID,
        params: {
          goalName: stepMetadata.name,
          parentGoalName: goalName,
          parentStepNumber: explicitStepNumber,
          subgoalType: true,
          workingDir: subgoalWorkingDir,
          initialMessage,
        },
      };
    }
  }

  return undefined;
}

/** evolve-plan → finalize-goal: fires when all plan steps are complete. */
function resolveEvolvePlanToFinalizeGoal(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const goalName = extractGoalName(params);

  if (state.goalCompleted()) {
    const cwd = process.cwd();
    const goalDir = resolveGoalDir(cwd, goalName!);
    return {
      capability: "finalize-goal",
      stateMachineId: MACHINE_ID,
      params: { goalName, goalDir, workingDir: cwd },
    };
  }

  return undefined;
}

/** evolve-plan → execute-task: fallback — fires only when no higher-priority edge matched (no revision, no subgoal, goal not complete). */
function resolveEvolvePlanToExecuteTask(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  // Guard: if all plan steps are complete, finalize-goal edge should have fired.
  // Don't also fire execute-task.
  if (state.goalCompleted()) {
    return undefined;
  }

  // Guard: if the current step signals revision or is a subgoal,
  // those edges should have fired instead. Don't also fire execute-task.
  if (explicitStepNumber != null) {
    const steps = state.steps();
    const currentStep = steps.find((s) => s.stepNumber === explicitStepNumber);
    if (currentStep) {
      if (currentStep.revisionNeeded()) {
        return undefined;
      }
      const stepMetadata = currentStep.getMetadata();
      if (stepMetadata && stepMetadata.complexity === "subgoal") {
        return undefined;
      }
    }
  }

  if (explicitStepNumber != null) {
    return {
      capability: "execute-task",
      stateMachineId: MACHINE_ID,
      params: { goalName, stepNumber: explicitStepNumber },
    };
  }

  const stepNumber = state.currentStepNumber();
  return {
    capability: "execute-task",
    stateMachineId: MACHINE_ID,
    params: { goalName, stepNumber },
  };
}

/** execute-task → review-task: always fires, propagate goalName and stepNumber. */
function resolveExecuteTaskToReviewTask(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    return {
      capability: "review-task",
      stateMachineId: MACHINE_ID,
      params: { goalName, stepNumber: explicitStepNumber },
    };
  }

  const stepNumber = state.currentStepNumber();
  return {
    capability: "review-task",
    stateMachineId: MACHINE_ID,
    params: { goalName, stepNumber },
  };
}

/** review-task → evolve-plan: fires when step status is "approved". */
function resolveReviewTaskToEvolvePlan(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null) {
    return undefined;
  }

  const steps = state.steps();
  const step = steps.find((s) => s.stepNumber === stepNumber);

  if (step && step.status() === "approved") {
    return {
      capability: "evolve-plan",
      stateMachineId: MACHINE_ID,
      params: { goalName, stepNumber: stepNumber + 1 },
    };
  }

  return undefined;
}

/** review-task → execute-task: fires when step is rejected (re-execute same step). */
function resolveReviewTaskToExecuteTask(
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null) {
    return { capability: "execute-task", stateMachineId: MACHINE_ID, params };
  }

  const steps = state.steps();
  const step = steps.find((s) => s.stepNumber === stepNumber);

  // Fire only when the step is rejected — re-execute the same step.
  // When approved, the evolve-plan edge fires instead (checked first in edges array).
  if (step && step.status() === "rejected") {
    return {
      capability: "execute-task",
      stateMachineId: MACHINE_ID,
      params: { goalName, stepNumber },
    };
  }

  return undefined;
}

/** revise-plan → evolve-plan: always fires, preserve goalName and revisionTriggerStep. */
function resolveRevisePlanToEvolvePlan(
  _state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult {
  const goalName = extractGoalName(params);
  const revisionTriggerStep =
    typeof params?.revisionTriggerStep === "number" ? params.revisionTriggerStep : undefined;

  return {
    capability: "evolve-plan",
    stateMachineId: MACHINE_ID,
    params: { goalName, ...(revisionTriggerStep != null && { revisionTriggerStep }) },
  };
}

/** finalize-goal → evolve-plan: fires only when parentGoalName exists (subgoal completion). */
function resolveFinalizeGoalToEvolvePlan(
  _state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const parentGoalName = typeof params?.parentGoalName === "string" ? params.parentGoalName : undefined;
  const parentStepNumber = typeof params?.parentStepNumber === "number" ? params.parentStepNumber : undefined;

  if (parentGoalName) {
    return {
      capability: "evolve-plan",
      stateMachineId: MACHINE_ID,
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

export const goalDrivenDevelopment: StateMachine<GoalState> = {
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

// Register so dispatch(undefined, ...) can discover this machine
registerMachine(goalDrivenDevelopment);

// ---------------------------------------------------------------------------
// Audit log — recordTransition (ported from state-machine.ts)
// ---------------------------------------------------------------------------

interface TransitionAuditEntry {
  timestamp: string;
  from: string;
  to: string;
  params?: Record<string, unknown>;
}

/**
 * Record a transition as an audit entry in `<goalDir>/transitions.json`.
 * Append-only JSON array. Non-fatal — failures are logged but never thrown.
 *
 * @param goalDir - Goal workspace directory (e.g. `/repo/.pio/goals/my-feature`)
 * @param fromCapability - Capability that just completed
 * @param toResult - Resolved transition result (next capability + params)
 */
export function recordTransition(
  goalDir: string,
  fromCapability: string,
  toResult: TransitionResult,
): void {
  try {
    const filePath = path.join(goalDir, "transitions.json");
    let entries: TransitionAuditEntry[] = [];

    // Try to read existing file
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          entries = parsed;
        }
        // If not an array, start fresh (malformed file recovery)
      } catch {
        // Malformed JSON — start fresh
        entries = [];
      }
    }

    const entry: TransitionAuditEntry = {
      timestamp: new Date().toISOString(),
      from: fromCapability,
      to: toResult.capability,
      params: toResult.params,
    };

    entries.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    console.warn(`pio: failed to record transition: ${err}`);
  }
}
