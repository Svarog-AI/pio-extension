import * as fs from "node:fs";
import * as path from "node:path";
import type { GoalState } from "./goal-state";
import { resolveGoalDir, stepFolderName } from "./fs-utils";

// ---------------------------------------------------------------------------
// Re-exported types for backward compatibility
// ---------------------------------------------------------------------------

/** Context passed to transition resolver callbacks. */
export interface TransitionContext {
  /** Current capability name (e.g. "review-task") */
  capability: string;
  /** Working directory (goal workspace directory) */
  workingDir: string;
  /** Session params from the completing session (goalName, stepNumber, …) */
  params?: Record<string, unknown>;
}

/** Result of resolving a transition: capability name plus optionally adjusted params. */
export interface TransitionResult {
  /** Next capability name (e.g. "evolve-plan") */
  capability: string;
  /** Adjusted params to propagate (e.g. incremented stepNumber). If omitted, use ctx.params as-is. */
  params?: Record<string, unknown>;
}

/** Re-export stepFolderName for backward compatibility. */
export { stepFolderName, resolveGoalDir } from "./fs-utils";

// ---------------------------------------------------------------------------
// Pure transition functions — no filesystem I/O
// ---------------------------------------------------------------------------

/** Extract stepNumber from params if it's a valid number. */
function extractStepNumber(params?: Record<string, unknown>): number | undefined {
  return typeof params?.stepNumber === "number" ? params.stepNumber : undefined;
}

/** Extract goalName from params if it's a string. */
function extractGoalName(params?: Record<string, unknown>): string | undefined {
  return typeof params?.goalName === "string" ? params.goalName : undefined;
}

/** create-goal → create-plan: always, preserve params as-is. */
function transitionCreateGoal(_state: GoalState, params?: Record<string, unknown>): TransitionResult {
  return { capability: "create-plan", params };
}

/** create-plan → evolve-plan: always, preserve params as-is. */
function transitionCreatePlan(_state: GoalState, params?: Record<string, unknown>): TransitionResult {
  return { capability: "evolve-plan", params };
}

/** evolve-plan → execute-task: propagate goalName and stepNumber from params or state. Routes to finalize-goal when goal is complete. Routes to revise-plan when current step signals revision is needed. Routes to create-goal when current step is a subgoal. */
function transitionEvolvePlan(state: GoalState, params?: Record<string, unknown>): TransitionResult | undefined {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  // Check if the current evolving step signals that plan revision is needed.
  // Only check when we have an explicit stepNumber — without it, we can't target a specific step.
  if (explicitStepNumber != null) {
    const steps = state.steps();
    const currentStep = steps.find((s) => s.stepNumber === explicitStepNumber);
    if (currentStep && currentStep.revisionNeeded()) {
      return {
        capability: "revise-plan",
        params: { goalName, revisionTriggerStep: explicitStepNumber },
      };
    }

    // Subgoal spawning: if the current step has complexity: "subgoal" in frontmatter,
    // route to create-goal with parent context instead of execute-task.
    // Subgoal detection happens BEFORE the goal-completed check so that a subgoal step
    // spawns even if other steps are already complete.
    if (currentStep) {
      const stepMetadata = currentStep.getMetadata();

      if (stepMetadata && stepMetadata.complexity === "subgoal" && goalName) {
        const cwd = process.cwd();
        const goalDir = resolveGoalDir(cwd, goalName);
        // Compute the nested subgoal workspace path
        const parentStepDir = path.join(goalDir, stepFolderName(explicitStepNumber));
        const subgoalWorkingDir = resolveGoalDir(cwd, stepMetadata.name, parentStepDir);

        return {
          capability: "create-goal",
          params: {
            goalName: stepMetadata.name,
            parentGoalName: goalName,
            parentStepNumber: explicitStepNumber,
            subgoalType: true,
            workingDir: subgoalWorkingDir,
          },
        };
      }
    }
  }

  // Guard: if all plan steps are evolved, route to finalize-goal
  if (state.goalCompleted()) {
    // goalName is guaranteed to exist: goalCompleted() is true only when a goal workspace exists
    const cwd = process.cwd();
    const goalDir = resolveGoalDir(cwd, goalName!);
    return { capability: "finalize-goal", params: { goalName, goalDir, workingDir: cwd } };
  }

  if (explicitStepNumber != null) {
    return { capability: "execute-task", params: { goalName, stepNumber: explicitStepNumber } };
  }
  // Fallback: derive stepNumber from the current filesystem state
  const stepNumber = state.currentStepNumber();
  return { capability: "execute-task", params: { goalName, stepNumber } };
}

/** execute-task → review-task: propagate goalName and stepNumber from params or state. */
function transitionExecuteTask(state: GoalState, params?: Record<string, unknown>): TransitionResult {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    return { capability: "review-task", params: { goalName, stepNumber: explicitStepNumber } };
  }
  // Fallback: derive stepNumber from the current filesystem state
  const stepNumber = state.currentStepNumber();
  return { capability: "review-task", params: { goalName, stepNumber } };
}

/**
 * review-task → evolve-plan (approved) | execute-task (rejected / unknown).
 * Uses GoalState to check step status — no direct filesystem I/O.
 */
function transitionReviewTask(state: GoalState, params?: Record<string, unknown>): TransitionResult {
  const stepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (stepNumber == null) {
    // No stepNumber — fallback to execute-task with original params
    return { capability: "execute-task", params };
  }

  // Find the matching step in GoalState
  const steps = state.steps();
  const step = steps.find((s) => s.stepNumber === stepNumber);

  if (step) {
    const status = step.status();

    if (status === "approved") {
      // Approved — evolve-plan targets the NEXT step
      return { capability: "evolve-plan", params: { goalName, stepNumber: stepNumber + 1 } };
    }

    if (status === "rejected") {
      // Rejected — re-execute the same step
      return { capability: "execute-task", params: { goalName, stepNumber } };
    }
  }

  // No matching step found, or status is not recognized (implemented, blocked, pending, defined)
  // Safe default: re-execute the same step
  return { capability: "execute-task", params: { goalName, stepNumber } };
}

/** revise-plan → evolve-plan: after plan revision, route back to evolve-plan so the next incomplete step gets specified. */
function transitionRevisePlan(_state: GoalState, params?: Record<string, unknown>): TransitionResult {
  const goalName = extractGoalName(params);

  // Build result — do NOT pass explicit stepNumber; let evolve-plan discover the next step.
  // Preserve revisionTriggerStep if present (for downstream provenance).
  const revisionTriggerStep =
    typeof params?.revisionTriggerStep === "number" ? params.revisionTriggerStep : undefined;

  return {
    capability: "evolve-plan",
    params: { goalName, ...(revisionTriggerStep != null && { revisionTriggerStep }) },
  };
}

/**
 * finalize-goal → evolve-plan (subgoal) | undefined (top-level goal).
 *
 * For subgoals (has parentGoalName param), returns evolve-plan for the parent
 * with stepNumber: parentStepNumber + 1. Does NOT forward parentGoalName,
 * parentStepNumber, or subgoalType to prevent param pollution.
 *
 * For top-level goals (no parentGoalName), returns undefined (terminal).
 */
function transitionFinalizeGoal(
  _state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  const parentGoalName = typeof params?.parentGoalName === "string" ? params.parentGoalName : undefined;
  const parentStepNumber = typeof params?.parentStepNumber === "number" ? params.parentStepNumber : undefined;

  if (parentGoalName) {
    // Subgoal completion — route back to parent's evolve-plan with next step
    return {
      capability: "evolve-plan",
      params: {
        goalName: parentGoalName,
        stepNumber: (parentStepNumber ?? 0) + 1,
      },
    };
  }

  // Top-level goal — terminal, no outgoing transition
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the next capability given a current capability and a GoalState.
 *
 * Pure function — no filesystem I/O. All state queries go through `state.*()` methods.
 * Returns undefined for unknown capabilities (matching existing behavior).
 *
 * @param capability - Current capability name (e.g. "review-task")
 * @param state - Lazy-evaluated GoalState view over the goal workspace
 * @param params - Optional session params to propagate (goalName, stepNumber, …)
 */
export function resolveTransition(
  capability: string,
  state: GoalState,
  params?: Record<string, unknown>,
): TransitionResult | undefined {
  switch (capability) {
    case "create-goal":
      return transitionCreateGoal(state, params);
    case "create-plan":
      return transitionCreatePlan(state, params);
    case "evolve-plan":
      return transitionEvolvePlan(state, params);
    case "execute-task":
      return transitionExecuteTask(state, params);
    case "review-task":
      return transitionReviewTask(state, params);
    case "revise-plan":
      return transitionRevisePlan(state, params);
    case "finalize-goal":
      return transitionFinalizeGoal(state, params);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Audit log — recordTransition
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
