import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CapabilityConfig, CapabilitySkills } from "./types";

/**
 * Read the `pio-config` custom entry from the current session.
 * Returns the capability config data or null when not inside a capability sub-session.
 *
 * Shared utility — replaces the repeated inline pattern of
 * `getEntries() → find pio-config → cast to CapabilityConfig`.
 *
 * Accepts `ExtensionContext` (base type) so it works in both event handlers
 * and command handlers.
 */
export function getSessionConfig(ctx: ExtensionContext): CapabilityConfig | null {
  const entries = ctx.sessionManager.getEntries();
  const entry = entries.find((e) => e.type === "custom" && e.customType === "pio-config");
  if (!entry || entry.type !== "custom") return null;
  return entry.data as CapabilityConfig;
}

/**
 * Merge base capability skills with additional skills.
 * Pure utility — operates on typed objects, never accesses the filesystem.
 *
 * Mandatory skills: concatenated with Set-based deduplication (preserves order, first-seen wins).
 * Recommended skills: concatenated with Map-based first-seen-wins dedup by `name`.
 * Returns a new object — never mutates inputs.
 */
/**
 * Parse a command argument string into parts.
 * Returns [name, stepNumber] or [name, undefined] if step number is missing.
 */
export function parseCommandArgs(args: string | undefined): { name: string; stepNumber: number | undefined } | null {
  if (!args || !args.trim()) return null;
  const parts = args.trim().split(/\s+/);
  const name = parts[0];
  const raw = parts[1];
  const stepNumber = raw ? parseInt(raw, 10) : undefined;
  return { name, stepNumber: (stepNumber !== undefined && !isNaN(stepNumber) && stepNumber >= 1) ? stepNumber : undefined };
}

export function mergeCapabilitySkills(
  base: CapabilitySkills | undefined,
  additional: CapabilitySkills | null | undefined,
): CapabilitySkills {
  const mandatory = new Set<string>();
  const recommended = new Map<string, { name: string; condition: string }>();

  if (base?.mandatory) {
    for (const name of base.mandatory) mandatory.add(name);
  }
  if (base?.recommended) {
    for (const entry of base.recommended) recommended.set(entry.name, entry);
  }

  if (additional?.mandatory) {
    for (const name of additional.mandatory) mandatory.add(name);
  }
  if (additional?.recommended) {
    for (const entry of additional.recommended) {
      if (!recommended.has(entry.name)) {
        recommended.set(entry.name, entry);
      }
    }
  }

  const result: CapabilitySkills = {};
  if (mandatory.size > 0) result.mandatory = [...mandatory];
  if (recommended.size > 0) result.recommended = [...recommended.values()];
  return result;
}
