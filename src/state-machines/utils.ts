import { CapState } from "../capability-state";
import type { CapabilityContract } from "../types";

// ---------------------------------------------------------------------------
// Contract cache — populated at startup from auto-discovered capabilities
// ---------------------------------------------------------------------------

let _discoveredContracts: Record<string, CapabilityContract> | null = null;

/**
 * Populate the contract cache from auto-discovered capabilities.
 * Called once from index.ts after discoverCapabilities() returns.
 */
export function setDiscoveredContracts(
  contracts: Record<string, CapabilityContract>,
): void {
  _discoveredContracts = contracts;
}

/**
 * Build a CapState for the given capability name.
 * Looks up the cached contract and returns a CapState instance.
 * Throws if the capability is not found in the cache.
 */
export function getCapState(
  capability: string,
  baseDir: string,
  params?: Record<string, unknown>,
  workspacePrefix?: string,
): CapState {
  const contract = _discoveredContracts?.[capability];
  if (!contract) throw new Error(`No contract found for "${capability}"`);
  return new CapState(contract, baseDir, params, workspacePrefix);
}
