/**
 * Marker engine — declarative marker files driven by contract frontmatter.
 *
 * `applyMarkers` runs during the capability exit lifecycle (step 4a, via
 * `runExitLifecycle`); `cleanupMarkers` runs at session startup via the
 * `resources_discover` handler. All exit logic lives in
 * `src/runtime/exit-lifecycle.ts`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CapState } from "../capability-state";
import { extractFrontmatter } from "../frontmatter";
import type { CapabilityContract } from "../types";

// ---------------------------------------------------------------------------
// Marker engine — reads frontmatter from output files and creates marker files
// ---------------------------------------------------------------------------

/**
 * Iterate over `contract.markers` and create/clean up marker files based on
 * frontmatter field values.
 *
 * For each marker declaration:
 * 1. Look up the output file by name in contract outputs
 * 2. Read frontmatter from that file
 * 3. Extract the field value and look up the marker filename
 * 4. Delete all stale markers from the values mapping
 * 5. Create the matched marker file (if value found)
 *
 * All errors are non-fatal — warnings are logged via console.warn.
 *
 * @param workspaceDir - Absolute path to the workspace directory
 * @param contract - Capability contract with markers declarations
 * @param params - Optional session params for placeholder resolution
 */
export function applyMarkers(
  workspaceDir: string,
  contract: CapabilityContract,
  params?: Record<string, unknown>,
): void {
  if (!contract.markers || contract.markers.length === 0) {
    return;
  }

  const capState = new CapState(contract, workspaceDir, params);

  for (const markerDeclaration of contract.markers) {
    try {
      // 1. Look up output file by name (O(1) via CapState internal map)
      const resolved = capState.tryResolveOutput(markerDeclaration.outputFile);
      if (!resolved) {
        console.warn(
          `pio: applyMarkers — output '${markerDeclaration.outputFile}' not found in contract`,
        );
        continue;
      }

      const { path: resolvedPath } = resolved;

      // 2. Read frontmatter (CapState typed read + raw fallback)
      let frontmatter: Record<string, unknown> | null = null;

      try {
        const fileState = capState.output<Record<string, unknown>>(
          markerDeclaration.outputFile,
        );
        if (fileState.exists()) {
          frontmatter = fileState.read();
        }
      } catch {
        // CapState.output throws if name not found — already handled above
      }

      // Fallback: raw extraction if CapState returned null
      if (frontmatter === null) {
        frontmatter = extractFrontmatter(resolvedPath);
      }

      if (frontmatter === null) {
        console.warn(
          `pio: applyMarkers — could not read frontmatter from '${resolvedPath}'`,
        );
        continue;
      }

      // 3. Extract field value
      const fieldValue = frontmatter[markerDeclaration.field];
      if (fieldValue === undefined) {
        console.warn(
          `pio: applyMarkers — field '${markerDeclaration.field}' not found in frontmatter of '${markerDeclaration.outputFile}'`,
        );
        continue;
      }

      const fieldValueStr = String(fieldValue);
      const markerFileName = markerDeclaration.values[fieldValueStr];

      // 4. Always delete stale markers (all values in the mapping)
      for (const staleMarker of Object.values(markerDeclaration.values)) {
        try {
          fs.rmSync(path.join(workspaceDir, staleMarker), { force: true });
        } catch {
          // ignore delete errors
        }
      }

      // 5. Create matched marker or warn if unknown value
      if (markerFileName) {
        fs.writeFileSync(path.join(workspaceDir, markerFileName), "", "utf-8");
      } else {
        console.warn(
          `pio: applyMarkers — unknown value '${fieldValueStr}' for field '${markerDeclaration.field}' in marker declaration`,
        );
      }
    } catch (err) {
      console.warn(
        `pio: applyMarkers — error processing marker declaration '${markerDeclaration.outputFile}': ${err}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Marker cleanup — deletes all declared marker files at session startup
// ---------------------------------------------------------------------------

/**
 * Delete all marker filenames declared in contract.markers at session startup.
 * Collects every filename from all values mappings across all declarations.
 * Uses force:true so missing files are silently ignored.
 *
 * @param workspaceDir - Absolute path to the workspace directory
 * @param contract - Capability contract with markers declarations
 */
export function cleanupMarkers(
  workspaceDir: string,
  contract: CapabilityContract,
): void {
  if (!contract.markers || contract.markers.length === 0) {
    return;
  }

  // Collect all unique marker filenames from all declarations
  const markerFiles = new Set<string>();
  for (const declaration of contract.markers) {
    for (const fileName of Object.values(declaration.values)) {
      markerFiles.add(fileName);
    }
  }

  // Delete each unique marker file
  for (const fileName of markerFiles) {
    try {
      fs.rmSync(path.join(workspaceDir, fileName), { force: true });
    } catch {
      // ignore delete errors — force:true should handle most cases
    }
  }
}
