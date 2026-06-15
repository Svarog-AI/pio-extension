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
 * API:
 * - `input(name)` — access a file declared in `contract.inputs` by name
 * - `output(name)` — access a file declared in `contract.outputs` by name
 * - `undeclared(path)` — access marker files not in any contract (e.g. "APPROVED", "BLOCKED")
 *
 * Import constraints: does NOT import from capabilities schemas, fs-utils, or goal-state.
 */
export class CapState {
  private inputNames: Map<string, { file: string; schema?: TSchema }>;
  private outputNames: Map<string, { file: string; schema?: TSchema }>;

  constructor(
    private contract: CapabilityContract,
    private baseDir: string,
    private params?: Record<string, unknown>,
  ) {
    const maps = this.buildAllMaps();
    this.inputNames = maps.inputNames;
    this.outputNames = maps.outputNames;
  }

  /**
   * Look up a file declared in `contract.inputs` by name.
   * Resolves placeholders against session params and returns a FileState with schema validation.
   * Throws if no input has the given name.
   */
  input<T>(name: string): FileState<T> {
    const entry = this.inputNames.get(name);
    if (!entry) {
      throw new Error(`Input '${name}' not found in contract`);
    }
    const resolvedPath = this.params
      ? resolvePaths([entry.file], this.params)[0]
      : entry.file;
    return new FileStateImpl<T>(path.join(this.baseDir, resolvedPath), entry.schema);
  }

  /**
   * Look up a file declared in `contract.outputs` by name.
   * Searches inside OneOfGroup entries as well.
   * Resolves placeholders against session params and returns a FileState with schema validation.
   * Throws if no output has the given name.
   */
  output<T>(name: string): FileState<T> {
    const entry = this.outputNames.get(name);
    if (!entry) {
      throw new Error(`Output '${name}' not found in contract`);
    }
    const resolvedPath = this.params
      ? resolvePaths([entry.file], this.params)[0]
      : entry.file;
    return new FileStateImpl<T>(path.join(this.baseDir, resolvedPath), entry.schema);
  }

  /**
   * Access a file not declared in any contract (marker files like "APPROVED", "BLOCKED").
   * The caller must pass a resolved path — no placeholder resolution is performed.
   * Returns a FileState with no schema validation.
   */
  undeclared(filePath: string): FileState<unknown> {
    return new FileStateImpl<unknown>(path.join(this.baseDir, filePath));
  }

  /**
   * Build lookup maps for named accessors: inputNames (name→{file,schema}),
   * outputNames (name→{file,schema}).
   * Enforces unique names across inputs and outputs — throws on collision.
   */
  private buildAllMaps(): {
    inputNames: Map<string, { file: string; schema?: TSchema }>;
    outputNames: Map<string, { file: string; schema?: TSchema }>;
  } {
    const inputNames = new Map<string, { file: string; schema?: TSchema }>();
    const outputNames = new Map<string, { file: string; schema?: TSchema }>();
    const allNames = new Set<string>();

    // Process inputs
    for (const entry of this.contract.inputs) {
      if (allNames.has(entry.name)) {
        throw new Error(
          `Duplicate file name '${entry.name}' in contract. Names must be unique across inputs and outputs.`,
        );
      }
      allNames.add(entry.name);
      inputNames.set(entry.name, { file: entry.file, schema: entry.schema });
    }

    // Process outputs (handle OneOfGroup)
    for (const entry of this.contract.outputs) {
      if (this.isMarkdownFileSpec(entry)) {
        if (allNames.has(entry.name)) {
          throw new Error(
            `Duplicate file name '${entry.name}' in contract. Names must be unique across inputs and outputs.`,
          );
        }
        allNames.add(entry.name);
        outputNames.set(entry.name, { file: entry.file, schema: entry.schema });
      } else if ("files" in entry && Array.isArray(entry.files)) {
        // OneOfGroup — recurse into files
        for (const fileEntry of entry.files) {
          if (this.isMarkdownFileSpec(fileEntry)) {
            if (allNames.has(fileEntry.name)) {
              throw new Error(
                `Duplicate file name '${fileEntry.name}' in contract. Names must be unique across inputs and outputs.`,
              );
            }
            allNames.add(fileEntry.name);
            outputNames.set(fileEntry.name, { file: fileEntry.file, schema: fileEntry.schema });
          }
        }
      }
    }

    return { inputNames, outputNames };
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
