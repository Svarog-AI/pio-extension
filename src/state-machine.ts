import * as fs from "node:fs";
import * as path from "node:path";
import type { GoalState } from "./goal-state";

// ---------------------------------------------------------------------------
// Re-exported types for backward compatibility
// ---------------------------------------------------------------------------

/** Context passed to transition resolver callbacks. */
export interface TransitionContext {
  /** Current capability name (e.g. "review-code") */
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
export { stepFolderName } from "./fs-utils";

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

/** evolve-plan → execute-task: propagate goalName and stepNumber from params or state. */
function transitionEvolvePlan(state: GoalState, params?: Record<string, unknown>): TransitionResult {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    return { capability: "execute-task", params: { goalName, stepNumber: explicitStepNumber } };
  }
  // Fallback: derive stepNumber from the current filesystem state
  const stepNumber = state.currentStepNumber();
  return { capability: "execute-task", params: { goalName, stepNumber } };
}

/** execute-task → review-code: propagate goalName and stepNumber from params or state. */
function transitionExecuteTask(state: GoalState, params?: Record<string, unknown>): TransitionResult {
  const explicitStepNumber = extractStepNumber(params);
  const goalName = extractGoalName(params);

  if (explicitStepNumber != null) {
    return { capability: "review-code", params: { goalName, stepNumber: explicitStepNumber } };
  }
  // Fallback: derive stepNumber from the current filesystem state
  const stepNumber = state.currentStepNumber();
  return { capability: "review-code", params: { goalName, stepNumber } };
}

/**
 * review-code → evolve-plan (approved) | execute-task (rejected / unknown).
 * Uses GoalState to check step status — no direct filesystem I/O.
 */
function transitionReviewCode(state: GoalState, params?: Record<string, unknown>): TransitionResult {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the next capability given a current capability and a GoalState.
 *
 * Pure function — no filesystem I/O. All state queries go through `state.*()` methods.
 * Returns undefined for unknown capabilities (matching existing behavior).
 *
 * @param capability - Current capability name (e.g. "review-code")
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
    case "review-code":
      return transitionReviewCode(state, params);
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
