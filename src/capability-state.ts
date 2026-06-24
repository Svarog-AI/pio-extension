import * as fs from "node:fs";
import type { TSchema } from "typebox";
import type { CapabilityContract, MarkdownFileSpec, OutputEntry } from "./types";
import { extractFrontmatter, validateAndCoerce } from "./frontmatter";
import { resolveContractPath } from "./capability-config";

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
 * - `resolvePath(entry)` — resolve a contract entry using stored context and global pioRootDir
 * - `contract` (getter) — access to the underlying capability contract
 *
 * Import constraints: does NOT import from capabilities schemas, fs-utils, or goal-state.
 */
export class CapState {
  private inputNames: Map<string, MarkdownFileSpec>;
  private outputNames: Map<string, MarkdownFileSpec>;
  private _contract: CapabilityContract;

  constructor(
    contract: CapabilityContract,
    private baseDir: string,
    private params?: Record<string, unknown>,
    private workspacePrefix?: string,
  ) {
    this._contract = contract;
    const maps = this.buildAllMaps();
    this.inputNames = maps.inputNames;
    this.outputNames = maps.outputNames;
  }

  /** Access to the underlying capability contract. */
  get contract(): CapabilityContract {
    return this._contract;
  }

  /**
   * Resolve a contract entry's file path using stored context (baseDir, workspacePrefix)
   * and global pioRootDir. Encapsulates all resolution logic in one call.
   *
   * @param entry - Contract entry with file path and optional projectRelative flag
   * @returns Fully resolved filesystem path
   */
  resolvePath(entry: MarkdownFileSpec): string {
    return resolveContractPath(
      entry.file,
      this.baseDir,
      this.workspacePrefix,
      this.params,
      entry.projectRelative,
    );
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
    const fullPath = this.resolvePath(entry);
    return new FileStateImpl<T>(fullPath, entry.schema);
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
    const fullPath = this.resolvePath(entry);
    return new FileStateImpl<T>(fullPath, entry.schema);
  }

  /**
   * Access a file not declared in any contract (marker files like "APPROVED", "BLOCKED").
   * The caller must pass a resolved path — no placeholder resolution is performed.
   * Returns a FileState with no schema validation.
   */
  undeclared(filePath: string): FileState<unknown> {
    const fullPath = resolveContractPath(filePath, this.baseDir, this.workspacePrefix, undefined, false);
    return new FileStateImpl<unknown>(fullPath);
  }

  /**
   * Build lookup maps for named accessors: inputNames (name→MarkdownFileSpec),
   * outputNames (name→MarkdownFileSpec).
   * Enforces unique names across inputs and outputs — throws on collision.
   */
  private buildAllMaps(): {
    inputNames: Map<string, MarkdownFileSpec>;
    outputNames: Map<string, MarkdownFileSpec>;
  } {
    const inputNames = new Map<string, MarkdownFileSpec>();
    const outputNames = new Map<string, MarkdownFileSpec>();
    const allNames = new Set<string>();

    // Process inputs
    for (const entry of this._contract.inputs) {
      if (allNames.has(entry.name)) {
        throw new Error(
          `Duplicate file name '${entry.name}' in contract. Names must be unique across inputs and outputs.`,
        );
      }
      allNames.add(entry.name);
      inputNames.set(entry.name, entry);
    }

    // Process outputs (handle OneOfGroup)
    for (const entry of this._contract.outputs) {
      if (this.isMarkdownFileSpec(entry)) {
        if (allNames.has(entry.name)) {
          throw new Error(
            `Duplicate file name '${entry.name}' in contract. Names must be unique across inputs and outputs.`,
          );
        }
        allNames.add(entry.name);
        outputNames.set(entry.name, entry);
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
            outputNames.set(fileEntry.name, fileEntry);
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
  workspacePrefix?: string,
): CapState {
  return new CapState(contract, baseDir, params, workspacePrefix);
}
