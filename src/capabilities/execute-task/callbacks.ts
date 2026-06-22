import { CONTRACT } from "./config";


// ---------------------------------------------------------------------------
// Config callbacks (used by config.ts and resolveCapabilityConfig)
// ---------------------------------------------------------------------------

/**
 * Callback used by the `readOnlyFiles` field in config.
 * Returns array of read-only files for the given step.
 * workspacePrefix already includes the step folder — plain name resolves correctly.
 */
export function resolveExecuteReadOnlyFiles(_workspaceDir: string, _params?: Record<string, unknown>): string[] {
  return ["TASK.md"];
}
