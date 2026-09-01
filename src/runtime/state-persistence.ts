import * as fs from "node:fs";
import * as path from "node:path";

import { readPioWorkspaceDir } from "../model-config";
import type { PioSessionState } from "./session-state";

// ---------------------------------------------------------------------------
// Directory management
// ---------------------------------------------------------------------------

/**
 * Ensures `<workspaceDir>/state/` exists on disk.
 *
 * Delegates to `readPioWorkspaceDir()` which already creates both the
 * workspace root and the `state/` subdirectory. Since that function
 * never throws, this is a safe wrapper that always succeeds.
 */
export function ensureStateDir(): string {
  return readPioWorkspaceDir();
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Reads loop engine state from `<workspaceDir>/state/<sessionId>.json`.
 *
 * Returns `null` when the file is missing, corrupt, or has invalid fields.
 * All errors are caught and logged — this function never throws.
 */
export function loadLoopEngineState(sessionId: string): {
  currentIteration: number;
  isAdHocInput: boolean;
  currentPhaseId: string;
  vars?: { [name: string]: { value: unknown; type: string } };
} | null {
  try {
    const workspaceDir = ensureStateDir();

    const filePath = path.join(workspaceDir, "state", `${sessionId}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!isValidPersistedState(parsed)) {
      console.warn(
        `pio: state file ${filePath} contains invalid data, starting fresh`,
      );
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn(
      `pio: failed to read state file for session ${sessionId}: ${err}`,
    );
    return null;
  }
}

/** Validates that a parsed object has the correct persisted state shape. */
function isValidPersistedState(obj: unknown): obj is {
  currentIteration: number;
  isAdHocInput: boolean;
  currentPhaseId: string;
  vars?: { [name: string]: { value: unknown; type: string } };
} {
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }

  const record = obj as Record<string, unknown>;

  const coreOk =
    typeof record.currentIteration === "number" &&
    Number.isInteger(record.currentIteration) &&
    record.currentIteration > 0 &&
    typeof record.isAdHocInput === "boolean" &&
    typeof record.currentPhaseId === "string";

  if (!coreOk) {
    return false;
  }

  // Optional vars validation
  if ("vars" in record) {
    const vars = record.vars;
    if (vars == null || typeof vars !== "object" || Array.isArray(vars)) {
      return false;
    }
    for (const entry of Object.values(vars)) {
      if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
        return false;
      }
      const e = entry as Record<string, unknown>;
      if (typeof e.type !== "string") {
        return false;
      }
      if (!("value" in e)) {
        return false;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Writes loop engine state to `<workspaceDir>/state/<sessionId>.json`.
 *
 * Uses an atomic write pattern: write to `.tmp` then `renameSync`.
 * On Unix, rename is atomic for files on the same filesystem.
 *
 * All errors are caught and logged — this function never throws.
 */
export function saveLoopEngineState(
  sessionId: string,
  state: {
    currentIteration: number;
    isAdHocInput: boolean;
    currentPhaseId: string;
    vars?: { [name: string]: { value: unknown; type: string } };
  },
): void {
  try {
    const workspaceDir = ensureStateDir();

    const filePath = path.join(workspaceDir, "state", `${sessionId}.json`);
    const tempPath = `${filePath}.tmp`;

    const json = JSON.stringify(state, null, 2);
    fs.writeFileSync(tempPath, json, "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.warn(`pio: failed to save state for session ${sessionId}: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Projects only the persisted fields from the full {@link PioSessionState}.
 *
 * This is the bridge between `getState()` and `saveLoopEngineState()`.
 * Per-iteration tracking (`filesWritten`, `askUserCalled`) and phase
 * metadata (`phasesList`, `capState`, `allContractOutputs`, `phaseManager`) are
 * intentionally excluded — they reset safely from in-memory state each iteration.
 */
export function extractPersistedState(state: PioSessionState): {
  currentIteration: number;
  isAdHocInput: boolean;
  currentPhaseId: string;
  vars?: { [name: string]: { value: unknown; type: string } };
} {
  const base = {
    currentIteration: state.currentIteration,
    isAdHocInput: state.isAdHocInput,
    currentPhaseId: state.currentPhaseId,
  };

  // `store` is always present (the initial state holds an empty store), so
  // vars are always included.
  return { ...base, vars: state.store.toSerializableVars() };
}
