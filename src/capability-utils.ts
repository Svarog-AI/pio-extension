import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapabilityConfig, CapabilitySkills } from "./types";
import { resolveCapabilityConfig } from "./capability-config";

/**
 * Read the `pio-config` custom entry from the current session and reconstruct
 * the full capability config via dynamic import.
 *
 * The custom entry stores only `{ capability, sessionParams }` — JavaScript
 * functions (`requiredWhen`, `postValidate`, `postExecute`, `prepareSession`)
 * are stripped by `JSON.stringify` during serialization. This function
 * re-imports the capability module to restore live function references.
 *
 * Returns the reconstructed config or null when not inside a capability sub-session.
 *
 * Shared utility — replaces the repeated inline pattern of
 * `getEntries() → find pio-config → cast to CapabilityConfig`.
 *
 * Accepts `ExtensionContext` (base type) so it works in both event handlers
 * and command handlers.
 */
export async function getSessionConfig(ctx: ExtensionContext): Promise<CapabilityConfig | null> {
  const entries = ctx.sessionManager.getEntries();
  const entry = entries.find((e) => e.type === "custom" && e.customType === "pio-config");
  if (!entry || entry.type !== "custom") return null;

  const data = entry.data as { capability?: string; workspaceDir?: string; sessionParams?: Record<string, unknown> };
  if (!data.capability) return null;

  // Pass stored workspaceDir (resolved directory from normalization) so reconstruction
  // produces the same resolved workspaceDir even when workspacePrefix was stripped from sessionParams.
  const resolved = await resolveCapabilityConfig(ctx.cwd, {
    capability: data.capability,
    baseDir: data.workspaceDir,
    ...data.sessionParams,
  });
  return resolved ?? null;
}

/**
 * Base parameter set shared by all capability tools.
 * Capabilities declare paths relative to a workspace prefix — the prefix tells
 * path resolution where within `.pio/` to resolve contract files.
 */
export const BASE_TOOL_PARAMS = {
  workspacePrefix: Type.String({ description: "Workspace prefix for path resolution, e.g. 'goals/my-feature/S03'" }),
  sessionName: Type.Optional(Type.String({ description: "Human-readable session name" })),
  initialMessage: Type.String({ description: "Custom kickoff message for the session" }),
};

/**
 * Derive a queue key from the last path segment of a workspace prefix.
 * "goals/my-feature" → "my-feature", "goals/my-feature/S03" → "S03".
 */
export function deriveQueueKey(workspacePrefix: string): string {
  return workspacePrefix.split("/").pop() ?? "";
}

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
