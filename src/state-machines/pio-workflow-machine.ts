import * as fs from "node:fs";
import * as path from "node:path";
import type { StateMachine, ResolverResult } from "../state-machines";
import { registerMachine } from "../state-machines";
import type { GoalState } from "../goal-state";
import { resolveGoalDir, stepFolderName } from "../fs-utils";
import { CapState } from "../capability-state";
import { deriveQueueKey, readPendingTask } from "../queues";
import { isGoalComplete, findCurrentStepNumber, createSimpleStepStatus, type SimpleStepStatus } from "./utils";
import { CONTRACT as createPlanContract } from "../capabilities/create-plan/config";
import { CONTRACT as evolvePlanContract } from "../capabilities/evolve-plan/config";
import { CONTRACT as reviewTaskContract } from "../capabilities/review-task/config";
import type { PlanFrontmatter, StepMetadata } from "../capabilities/create-plan/schemas";
import type { TaskFrontmatter, TaskSkills } from "../capabilities/evolve-plan/schemas";
import type { ReviewOutputs } from "../capabilities/review-task/schemas";

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
): ResolverResult {
  return { capability: "create-plan", params };
}

/** create-plan → evolve-plan: always fires, preserve params as-is. */
function resolveCreatePlanToEvolvePlan(
  _state: GoalState,
  params?: Record<string, unknown>,
): ResolverResult {
  return { capability: "evolve-plan", params };
}

/** evolve-plan → revise-plan: fires when current step signals revision is needed. */
function resolveEvolvePlanToRevisePlan(
  state: GoalState,
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    const steps = state.steps();
    const currentStep = steps.find((s) => s.stepNumber === explicitStepNumber);
    if (currentStep && currentStep.revisionNeeded()) {
      return {
        capability: "revise-plan",
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
): ResolverResult | undefined {
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
): ResolverResult | undefined {
  const goalName = extractGoalName(params);

  if (state.goalCompleted()) {
    const cwd = process.cwd();
    const goalDir = resolveGoalDir(cwd, goalName!);
    return {
      capability: "finalize-goal",
      params: { goalName, goalDir, workingDir: cwd },
    };
  }

  return undefined;
}

/** evolve-plan → execute-task: fallback — fires only when no higher-priority edge matched (no revision, no subgoal, goal not complete). */
function resolveEvolvePlanToExecuteTask(
  state: GoalState,
  params?: Record<string, unknown>,
): ResolverResult | undefined {
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
      params: { goalName, stepNumber: explicitStepNumber },
    };
  }

  const stepNumber = state.currentStepNumber();
  return {
    capability: "execute-task",
    params: { goalName, stepNumber },
  };
}

/** execute-task → review-task: always fires, propagate goalName and stepNumber. */
function resolveExecuteTaskToReviewTask(
  state: GoalState,
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

  const stepNumber = state.currentStepNumber();
  return {
    capability: "review-task",
    params: { goalName, stepNumber },
  };
}

/** review-task → evolve-plan: fires when step status is "approved". */
function resolveReviewTaskToEvolvePlan(
  state: GoalState,
  params?: Record<string, unknown>,
): ResolverResult | undefined {
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
      params: { goalName, stepNumber: stepNumber + 1 },
    };
  }

  return undefined;
}

/** review-task → execute-task: fires when step is rejected (re-execute same step). */
function resolveReviewTaskToExecuteTask(
  state: GoalState,
  params?: Record<string, unknown>,
): ResolverResult | undefined {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null) {
    return { capability: "execute-task", params };
  }

  const steps = state.steps();
  const step = steps.find((s) => s.stepNumber === stepNumber);

  // Fire only when the step is rejected — re-execute the same step.
  // When approved, the evolve-plan edge fires instead (checked first in edges array).
  if (step && step.status() === "rejected") {
    return {
      capability: "execute-task",
      params: { goalName, stepNumber },
    };
  }

  return undefined;
}

/** revise-plan → evolve-plan: always fires, preserve goalName and revisionTriggerStep. */
function resolveRevisePlanToEvolvePlan(
  _state: GoalState,
  params?: Record<string, unknown>,
): ResolverResult {
  const goalName = extractGoalName(params);
  const revisionTriggerStep =
    typeof params?.revisionTriggerStep === "number" ? params.revisionTriggerStep : undefined;

  return {
    capability: "evolve-plan",
    params: { goalName, ...(revisionTriggerStep != null && { revisionTriggerStep }) },
  };
}

/** finalize-goal → evolve-plan: fires only when parentGoalName exists (subgoal completion). */
function resolveFinalizeGoalToEvolvePlan(
  _state: GoalState,
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

// ---------------------------------------------------------------------------
// PioWorkflowContext — GoalState replacement backed by CapState
// ---------------------------------------------------------------------------

/**
 * PioWorkflowContext mirrors GoalState exactly — same method names and signatures.
 * Backed by CapState for schema-aware file access instead of hardcoded schema imports.
 *
 * Construction imports CONTRACT from capability configs and builds CapState inline.
 * Filesystem methods delegate to state-machines/utils.ts standalone functions.
 */
export interface PioWorkflowContext {
  /** Constant — derived from the goal directory basename at construction. */
  goalName: string;
  /** Returns true when GOAL.md exists in the goal directory. */
  hasGoal(): boolean;
  /** Returns true when PLAN.md exists in the goal directory. */
  hasPlan(): boolean;
  /**
   * Returns the total number of plan steps from PLAN.md frontmatter.
   * Reads `totalSteps` from the YAML frontmatter block.
   * Returns undefined if PLAN.md doesn't exist or has invalid frontmatter.
   */
  totalPlanSteps(): number | undefined;
  /**
   * Returns a SimpleStepStatus for each step defined in PLAN.md frontmatter `steps` array.
   * Derives step list from frontmatter, not from disk scanning.
   * Each step still checks disk for file existence (hasTask, status, etc.).
   * Returns empty array when frontmatter is absent or has no `steps` field.
   */
  steps(): SimpleStepStatus[];
  /**
   * Returns the next step to work on.
   * Sequential scan starting at 1: returns the first step without an APPROVED marker,
   * or the first missing folder (gap halts scanning). Only APPROVED advances past a step.
   * Always returns at least 1 — never undefined.
   */
  currentStepNumber(): number;
  /**
   * Reads the pending task from `.pio/session-queue/task-{goalName}.json`.
   * Returns parsed `{ capability, params }` or undefined if the file doesn't exist.
   */
  pendingTask(): { capability: string; params: Record<string, unknown> } | undefined;
  /**
   * Reads the last completed task from `<goalDir>/LAST_TASK.json`.
   * Returns the parsed object or undefined if the file doesn't exist.
   */
  lastCompleted(): { capability: string; params: Record<string, unknown>; timestamp?: string } | undefined;
  /**
   * Reads REVIEW.md frontmatter for a given step and returns typed review outputs.
   *
   * Without options: returns `ReviewOutputs | null` (backward compatible).
   * With `{ errors: true }`: returns `{ data?: ReviewOutputs; error?: string }`
   * with detailed error information instead of `null`. Suppresses `console.warn`.
   * Lazy-evaluated — reads fresh from disk on every call.
   */
  getReviewOutputs(
    stepNumber: number,
    options?: { errors?: boolean },
  ): ReviewOutputs | null | { data?: ReviewOutputs; error?: string };
  /**
   * Reads PLAN.md frontmatter and returns typed plan metadata.
   *
   * Without options: returns `PlanFrontmatter | null`.
   * With `{ errors: true }`: returns `{ data?: PlanFrontmatter; error?: string }`
   * with detailed error information instead of `null`. Suppresses `console.warn`.
   * Lazy-evaluated — reads fresh from disk on every call.
   */
  planMetadata(options?: { errors?: boolean }):
    | PlanFrontmatter
    | null
    | { data?: PlanFrontmatter; error?: string };
  /**
   * Returns true when the COMPLETED marker file exists at `<goalDir>/COMPLETED`.
   * Lazy-evaluated — reads fresh on every call.
   */
  goalCompleted(): boolean;
  /**
   * Reads TASK.md frontmatter for a given step and returns the skills field.
   * Lazy-evaluated — reads fresh from disk on every call.
   * Returns `TaskSkills | null`: parsed skills when present, or `null` when
   * the file is missing, has no frontmatter, has no `skills` key, or fails validation.
   */
  getTaskSkills(stepNumber: number): TaskSkills | null;
}

/**
 * Build a PioWorkflowContext backed by CapState instead of hardcoded schema imports.
 *
 * The factory imports CONTRACT from the three capability configs (create-plan,
 * evolve-plan, review-task) and builds CapState instances for schema-aware file access.
 * Filesystem methods delegate to standalone functions from state-machines/utils.ts.
 *
 * @param baseDir - Absolute path to a goal workspace (e.g. `/repo/.pio/goals/my-feature`)
 */
export function buildPioWorkflowContext(
  baseDir: string,
): PioWorkflowContext {
  const goalName = path.basename(baseDir);

  // Derive cwd from baseDir (same logic as GoalState).
  const goalsIdx = baseDir.indexOf("/goals/");
  let cwd: string;
  if (goalsIdx !== -1) {
    const beforeGoals = baseDir.slice(0, goalsIdx);
    cwd = path.dirname(beforeGoals);
  } else {
    const pioIdx = baseDir.indexOf("/.pio/");
    if (pioIdx !== -1) {
      cwd = baseDir.slice(0, pioIdx);
    } else {
      cwd = path.dirname(path.dirname(baseDir));
    }
  }

  // Cached CapState for PLAN.md reads (no placeholders needed).
  let cachedPlanCapState: CapState | null = null;

  const planMetadata = (options?: { errors?: boolean }):
    | PlanFrontmatter
    | null
    | { data?: PlanFrontmatter; error?: string } => {
    if (!cachedPlanCapState) {
      cachedPlanCapState = new CapState(createPlanContract, baseDir);
    }
    const planFile = cachedPlanCapState.file<PlanFrontmatter>("PLAN.md");

    if (!planFile.exists()) {
      if (options?.errors) {
        return { error: "PLAN.md not found" };
      }
      return null;
    }

    const data = planFile.read();
    if (data === null) {
      if (options?.errors) {
        return { error: "could not parse or validate PLAN.md frontmatter" };
      }
      return null;
    }

    if (options?.errors) {
      return { data };
    }
    return data;
  };

  return {
    goalName,

    hasGoal: () => fs.existsSync(path.join(baseDir, "GOAL.md")),
    hasPlan: () => fs.existsSync(path.join(baseDir, "PLAN.md")),

    planMetadata,

    totalPlanSteps: () => {
      const result = planMetadata() as PlanFrontmatter | null | { data?: PlanFrontmatter; error?: string };
      if (!result) return undefined;
      if ("data" in result) return result.data?.totalSteps;
      return (result as PlanFrontmatter).totalSteps;
    },

    steps: () => {
      const result = planMetadata() as PlanFrontmatter | null | { data?: PlanFrontmatter; error?: string };
      let data: PlanFrontmatter | null = null;
      if (!result) return [];
      if ("data" in result) {
        data = result.data ?? null;
      } else {
        data = result as PlanFrontmatter;
      }

      if (!data || !data.steps || data.steps.length === 0) return [];

      const stepStatuses: SimpleStepStatus[] = [];

      for (let i = 0; i < data.steps.length; i++) {
        const stepNumber = i + 1;
        const folderName = stepFolderName(stepNumber);
        const stepDir = path.join(baseDir, folderName);
        const entry = data.steps[i];
        const stepMetadata: StepMetadata = {
          name: entry.name,
          complexity: entry.complexity ?? "task",
        };

        stepStatuses.push(
          createSimpleStepStatus(
            stepDir,
            stepNumber,
            folderName,
            stepMetadata,
          ),
        );
      }

      return stepStatuses;
    },

    currentStepNumber: () => findCurrentStepNumber(baseDir),

    pendingTask: () => {
      const queueKey = deriveQueueKey(baseDir, cwd);
      const task = readPendingTask(cwd, goalName, queueKey);
      if (!task) return undefined;
      return {
        capability: task.capability,
        params: (task.params ?? {}) as Record<string, unknown>,
      };
    },

    lastCompleted: () => {
      const lastTaskPath = path.join(baseDir, "LAST_TASK.json");
      if (!fs.existsSync(lastTaskPath)) return undefined;
      try {
        const raw = fs.readFileSync(lastTaskPath, "utf-8");
        return JSON.parse(raw) as { capability: string; params: Record<string, unknown>; timestamp?: string };
      } catch {
        return undefined;
      }
    },

    getReviewOutputs: (stepNumber: number, options?: { errors?: boolean }) => {
      const capState = new CapState(reviewTaskContract, baseDir, { stepNumber });
      const reviewFile = capState.file<ReviewOutputs>("S{stepNumber:02d}/REVIEW.md");

      if (!reviewFile.exists()) {
        if (options?.errors) {
          return { error: "REVIEW.md not found" };
        }
        return null;
      }

      const data = reviewFile.read();
      if (data === null) {
        if (options?.errors) {
          return { error: "could not parse or validate REVIEW.md frontmatter" };
        }
        return null;
      }

      if (options?.errors) {
        return { data };
      }
      return data;
    },

    goalCompleted: () => isGoalComplete(baseDir),

    getTaskSkills: (stepNumber: number) => {
      const capState = new CapState(evolvePlanContract, baseDir, { stepNumber });
      const data = capState.file<TaskFrontmatter>("S{stepNumber:02d}/TASK.md").read();
      return data?.skills ?? null;
    },
  };
}


