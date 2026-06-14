import * as fs from "node:fs";
import * as path from "node:path";
import type { TSchema } from "typebox";
import type { CapabilityContract, MarkdownFileSpec, OutputEntry } from "./types";
import { extractFrontmatter, validateAndCoerce } from "./frontmatter";
import { resolvePaths } from "./capability-config";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Lazy file accessor backed by a contract entry (or raw file access for undeclared files).
 *
 * - `exists()` checks the filesystem on every call — no caching.
 * - `read()` extracts frontmatter and validates against a schema if declared.
 */
export interface FileState<T = unknown> {
  /** Returns true if the resolved file path exists on disk. */
  exists(): boolean;
  /**
   * Extracts frontmatter and validates against schema if declared.
   * Returns typed data on success, null if file missing, frontmatter invalid, or schema validation fails.
   */
  read(): T | null;
}

// ---------------------------------------------------------------------------
// Internal FileState implementation
// ---------------------------------------------------------------------------

class FileStateImpl<T> implements FileState<T> {
  constructor(
    private fullPath: string,
    private schema?: TSchema,
  ) {}

  exists(): boolean {
    return fs.existsSync(this.fullPath);
  }

  read(): T | null {
    if (!this.exists()) return null;

    const raw = extractFrontmatter(this.fullPath);
    if (raw === null) return null;

    if (this.schema) {
      const result = validateAndCoerce<Record<string, unknown>>(raw, this.schema);
      if (result.error) return null;
      return result.data as T;
    }

    return raw as T;
  }
}

// ---------------------------------------------------------------------------
// CapState
// ---------------------------------------------------------------------------

/**
 * Wraps a `CapabilityContract` with a base directory to resolve file paths.
 *
 * The contract declares which files exist and their schemas.
 * CapState provides lazy I/O via `FileState` wrappers — reads from disk on each call.
 *
 * Import constraints: does NOT import from capabilities schemas, fs-utils, or goal-state.
 */
export class CapState {
  private fileSpecs: Map<string, { schema?: TSchema }>;

  constructor(
    private contract: CapabilityContract,
    private baseDir: string,
    private params?: Record<string, unknown>,
  ) {
    this.fileSpecs = this.buildLookupMap();
  }

  /**
   * Return a `FileState<T>` for the given file name.
   *
   * If the name matches a contract-declared file (after resolving placeholders),
   * the returned FileState includes the schema from that entry.
   * If not matched (e.g. marker files like "APPROVED"), returns a FileState without schema.
   */
  file<T>(name: string): FileState<T> {
    const resolvedName = this.params
      ? resolvePaths([name], this.params)[0]
      : name;
    const spec = this.fileSpecs.get(resolvedName);

    if (spec) {
      return new FileStateImpl<T>(path.join(this.baseDir, resolvedName), spec.schema);
    }

    // Undeclared file — no schema validation
    return new FileStateImpl<T>(path.join(this.baseDir, resolvedName));
  }

  /**
   * Build a lookup map: resolvedFileName -> { schema? }
   * Scans both contract.inputs and contract.outputs.
   */
  private buildLookupMap(): Map<string, { schema?: TSchema }> {
    const map = new Map<string, { schema?: TSchema }>();

    const allEntries: MarkdownFileSpec[] = [];

    // Collect from inputs
    for (const entry of this.contract.inputs) {
      if (this.isMarkdownFileSpec(entry)) {
        allEntries.push(entry);
      }
    }

    // Collect from outputs (handle OneOfGroup)
    for (const entry of this.contract.outputs) {
      if (this.isMarkdownFileSpec(entry)) {
        allEntries.push(entry);
      } else if ("files" in entry && Array.isArray(entry.files)) {
        // OneOfGroup — add all files in the group
        for (const fileEntry of entry.files) {
          if (this.isMarkdownFileSpec(fileEntry)) {
            allEntries.push(fileEntry);
          }
        }
      }
    }

    // Resolve paths and populate map
    for (const entry of allEntries) {
      const resolvedPath = this.params
        ? resolvePaths([entry.file], this.params)[0]
        : entry.file;
      map.set(resolvedPath, { schema: entry.schema });
    }

    return map;
  }

  /** Type guard: MarkdownFileSpec vs OneOfGroup. */
  private isMarkdownFileSpec(entry: OutputEntry | MarkdownFileSpec): entry is MarkdownFileSpec {
    return "file" in entry && !("files" in entry);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new CapState instance.
 *
 * Factory alternative to `new CapState()` — useful when the contract
 * is determined at runtime (e.g. resolve functions using `getCapState()`).
 */
export function createCapState(
  contract: CapabilityContract,
  baseDir: string,
  params?: Record<string, unknown>,
): CapState {
  return new CapState(contract, baseDir, params);
}
