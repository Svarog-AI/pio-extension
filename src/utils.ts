// Re-export transition system from dedicated module (Step 1)
export {
  resolveNextCapability,
  CAPABILITY_TRANSITIONS,
} from "./transitions";
export type { TransitionContext, TransitionResult, CapabilityTransitionResolver } from "./transitions";

// Re-export session queue utilities from dedicated module (Step 2)
export {
  queueDir,
  enqueueTask,
  readPendingTask,
  listPendingGoals,
  writeLastTask,
} from "./queues";
export type { SessionQueueTask } from "./queues";

// Re-export filesystem utilities from dedicated module (Step 3)
export {
  resolveGoalDir,
  goalExists,
  issuesDir,
  findIssuePath,
  readIssue,
  deriveSessionName,
  stepFolderName,
  discoverNextStep,
} from "./fs-utils";

// Re-export capability config from dedicated module (Step 4)
export { resolveCapabilityConfig } from "./capability-config";
export type { StaticCapabilityConfig } from "./capability-config";


