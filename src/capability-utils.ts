import type { CapabilitySkills } from "./types";

/**
 * Merge base capability skills with additional skills.
 * Pure utility — operates on typed objects, never accesses the filesystem.
 *
 * Mandatory skills: concatenated with Set-based deduplication (preserves order, first-seen wins).
 * Recommended skills: concatenated with Map-based first-seen-wins dedup by `name`.
 * Returns a new object — never mutates inputs.
 */
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
