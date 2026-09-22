// Capability contract: the IO vocabulary a capability declares, plus the two
// checkers that consume it.
//
// A contract names the inputs and outputs a capability exchanges with its
// caller. Each entry is either a markdown file on disk or a plain string
// value passed through the caller's value object. Two layers guard the
// shape: a load-time checker that refuses malformed authoring before
// registration, and a pre-spawn input validator that refuses unusable
// call-time values. Resolution stays path-only here; existence checks
// belong to the validators, which own base-dir joining.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ContractViolationError } from "./errors.ts";

/** Named IO slot carrying a plain runtime value (a non-empty string read from the inputs object by `name`). */
export interface ValueSpec {
  /** Slot name — also the key looked up in the caller's value object. */
  name: string;
}

/** Named IO slot backed by a markdown file on disk. */
export interface MarkdownFileSpec {
  name: string;
  /** Relative file path; optional when `paramKey` can supply the path. */
  file?: string;
  /** When its value in the caller's value object is a non-empty string, that value supplies the PATH (not a bare value). */
  paramKey?: string;
}

/** One entry of `Contract.inputs` / `Contract.outputs`. */
export type ContractSpec = ValueSpec | MarkdownFileSpec;

/** The capability contract: identity plus declared IO and write scope. */
export interface Contract {
  name: string;
  /** Mandatory — identity for spawn + trust checks. */
  version: string;
  inputs: ContractSpec[];
  outputs: ContractSpec[];
  /** Allowlist patterns (carry-over semantics; unenforced). */
  writes: string[];
  /** Declared without enforcement. */
  allowProjectWrites?: boolean;
}

/**
 * Classify one contract entry against a caller-supplied value object.
 *
 * Mode is structural, decided by field presence: an entry carrying a `file`
 * or `paramKey` key is file-mode; a name-only entry is a value slot.
 * File-mode resolution gives precedence to a non-empty string
 * `values[paramKey]` over the static `file` (an empty-string `file` counts
 * as absent); otherwise the static `file` wins. Returns RAW relative paths
 * — callers own any base-dir joining, and resolved values are treated as
 * workspace-relative (no absolute-path special-casing).
 *
 * Pure: no filesystem access, no throwing, no side effects. This is the
 * single shared mode-branching seam — consumers match on the four-mode
 * result rather than narrowing the union themselves.
 */
export function classifySpec(
  spec: ContractSpec,
  values: Record<string, unknown>,
):
  | { mode: "value"; value: string }
  | { mode: "file"; path: string }
  | { mode: "missing-value" }
  | { mode: "unresolvable" } {
  if ("file" in spec || "paramKey" in spec) {
    if (spec.paramKey !== undefined) {
      const candidate = values[spec.paramKey];
      if (typeof candidate === "string" && candidate.length > 0) {
        return { mode: "file", path: candidate };
      }
    }
    if (typeof spec.file === "string" && spec.file.length > 0) {
      return { mode: "file", path: spec.file };
    }
    return { mode: "unresolvable" };
  }
  const candidate = values[spec.name];
  return typeof candidate === "string" && candidate.length > 0
    ? { mode: "value", value: candidate }
    : { mode: "missing-value" };
}

/**
 * Validate a caller's value object against a contract's declared inputs
 * before a capability runs.
 *
 * Collect-all across `contract.inputs` in declaration order: value slots
 * pass silently and never touch the filesystem; file slots are checked for
 * existence against `baseDir` (default `process.cwd()`), showing the actual
 * joined path in the violation so failures are directly actionable. On any
 * failure, throws ONE {@link ContractViolationError} carrying every
 * violation in declaration order. The existence check is mechanical: a
 * resolvable directory passes exactly like a regular file.
 */
export function validateInputs(
  contract: Contract,
  values: Record<string, unknown>,
  baseDir?: string,
): void {
  const violations: string[] = [];
  for (const spec of contract.inputs) {
    const resolved = classifySpec(spec, values);
    if (resolved.mode === "missing-value") {
      violations.push(`input '${spec.name}' expects a non-empty string value`);
    } else if (resolved.mode === "unresolvable") {
      violations.push(
        `input '${spec.name}' cannot be resolved (missing 'file' and no usable 'paramKey' value)`,
      );
    } else if (resolved.mode === "file") {
      const checkedPath = join(baseDir ?? process.cwd(), resolved.path);
      if (!existsSync(checkedPath)) {
        violations.push(`input '${spec.name}' file not found: ${checkedPath}`);
      }
    }
    // "value" passes silently: value slots never touch the filesystem.
  }
  if (violations.length > 0) {
    throw new ContractViolationError(violations);
  }
}

/**
 * Load-time check of an authored contract.
 *
 * Non-throwing: the caller turns `problems` into its refusal output. Every
 * field is asserted at RUNTIME regardless of the declared type — the
 * annotation documents shape but is not the protection; a loaded value may
 * be stale or corrupted in ways types cannot express. Collects ALL
 * applicable problems (never bails after the first; a non-object input
 * yields a single problem and stops). Unknown extra keys are tolerated,
 * and duplicate spec names within inputs/outputs are deliberately NOT
 * rejected (callers keep last-wins lookup semantics).
 */
export function checkContract(
  contract: Contract,
): { ok: true } | { ok: false; problems: string[] } {
  if (
    typeof contract !== "object" ||
    contract === null ||
    Array.isArray(contract)
  ) {
    return { ok: false, problems: ["contract must be a plain object"] };
  }
  const problems: string[] = [];
  if (typeof contract.name !== "string" || contract.name.length === 0) {
    problems.push("contract.name must be a non-empty string");
  }
  if (typeof contract.version !== "string" || contract.version.length === 0) {
    problems.push("contract.version must be a non-empty string");
  }
  checkSpecList(contract.inputs, "inputs", problems);
  checkSpecList(contract.outputs, "outputs", problems);
  if (!Array.isArray(contract.writes)) {
    problems.push("contract.writes must be an array");
  } else {
    contract.writes.forEach((pattern, i) => {
      if (typeof pattern !== "string") {
        problems.push(`contract.writes[${i}] must be a string`);
      }
    });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}

/** Per-element rules for one `inputs`/`outputs` list, keyed on field presence. */
function checkSpecList(
  list: ContractSpec[],
  label: string,
  problems: string[],
): void {
  if (!Array.isArray(list)) {
    problems.push(`contract.${label} must be an array`);
    return;
  }
  list.forEach((el, i) => {
    if (typeof el !== "object" || el === null || Array.isArray(el)) {
      problems.push(`${label}[${i}] must be a plain object`);
      return;
    }
    if (typeof el.name !== "string" || el.name.length === 0) {
      problems.push(`${label}[${i}].name must be a non-empty string`);
    }
    if ("file" in el) {
      if (typeof el.file !== "string" || el.file.length === 0) {
        problems.push(`${label}[${i}].file must be a non-empty string`);
      }
    }
    if ("paramKey" in el) {
      if (typeof el.paramKey !== "string" || el.paramKey.length === 0) {
        problems.push(`${label}[${i}].paramKey must be a non-empty string`);
      }
    }
  });
}
