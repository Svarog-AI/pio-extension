import * as fs from "node:fs";
import * as path from "node:path";
import { stepFolderName } from "./fs-utils";

// ---------------------------------------------------------------------------
// Conditional transition types
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

/** A function that inspects runtime state and returns the next capability name. */
export type CapabilityTransitionResolver = (ctx: TransitionContext) => string | TransitionResult | undefined;

// ---------------------------------------------------------------------------
// Capability transition helpers — deterministic task flow
// ---------------------------------------------------------------------------

/** Maps a capability name to the next capability name in the happy path.
 * Values can be plain strings (deterministic) or resolver callbacks (conditional).
 * Callbacks may return a plain string or a TransitionResult with adjusted params. */
export const CAPABILITY_TRANSITIONS: Record<string, string | CapabilityTransitionResolver> = {
  "create-goal": "create-plan",
  "create-plan": "evolve-plan",
  "evolve-plan": (ctx): string | TransitionResult => {
    const stepNumber = typeof ctx.params?.stepNumber === "number" ? ctx.params.stepNumber : undefined;
    if (stepNumber != null) {
      return { capability: "execute-task", params: { goalName: ctx.params?.goalName, stepNumber } };
    }
    return "execute-task";
  },
  "execute-task": (ctx): string | TransitionResult => {
    const stepNumber = typeof ctx.params?.stepNumber === "number" ? ctx.params.stepNumber : undefined;
    if (stepNumber != null) {
      return { capability: "review-code", params: { goalName: ctx.params?.goalName, stepNumber } };
    }
    return "review-code";
  },
  "review-code": (ctx): string | TransitionResult => {
    const stepNumber = typeof ctx.params?.stepNumber === "number" ? ctx.params.stepNumber : undefined;
    if (stepNumber != null) {
      const folder = stepFolderName(stepNumber);
      // REJECTED takes precedence — re-execute the same step
      const rejectedPath = path.join(ctx.workingDir, folder, "REJECTED");
      if (fs.existsSync(rejectedPath)) {
        return { capability: "execute-task", params: { goalName: ctx.params?.goalName, stepNumber } };
      }
      // APPROVED — evolve-plan targets the NEXT step
      const approvedPath = path.join(ctx.workingDir, folder, "APPROVED");
      if (fs.existsSync(approvedPath)) {
        return { capability: "evolve-plan", params: { goalName: ctx.params?.goalName, stepNumber: stepNumber + 1 } };
      }
    }
    // Neither marker exists or no stepNumber: re-execute the same step
    if (stepNumber != null) {
      return { capability: "execute-task", params: { goalName: ctx.params?.goalName, stepNumber } };
    }
    return "execute-task";
  },
};

/**
 * Resolve the next capability for a given capability.
 * Returns { capability, params? } so callers get both the target and any adjusted params
 * (e.g. incremented stepNumber from review-code → evolve-plan).
 */
export function resolveNextCapability(capability: string, ctx: TransitionContext): TransitionResult | undefined {
  const value = CAPABILITY_TRANSITIONS[capability];
  if (value === undefined) return undefined;

  if (typeof value === "string") {
    // Plain string transition — wrap in consistent shape, preserving params as-is
    return { capability: value, params: ctx.params };
  }

  const result = value(ctx);
  if (!result) return undefined;

  // Callback returned a TransitionResult object
  if (typeof result === "object" && "capability" in result) {
    return result;
  }

  // Callback returned a plain string — wrap in consistent shape
  return { capability: result, params: ctx.params };
}
