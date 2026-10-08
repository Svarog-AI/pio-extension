// Shared error home for the pio capability runtime.
//
// Zero-import module on purpose: the error home pulls in nothing, so
// importing it has no side effects. Constructors assign explicit readonly
// fields because erasableSyntaxOnly forbids parameter properties.

/** Machine-readable classification of a capability failure. */
export type CapabilityErrorCause =
  | "budget"
  | "kill"
  | "spawn"
  | "contract"
  | "author-halt";

/**
 * Failure raised when a capability contract is violated (e.g. missing or
 * invalid inputs/outputs). Collect-all semantics live with the validators;
 * this class just carries every collected violation.
 */
export class ContractViolationError extends Error {
  /** Every collected violation — the defining datum. */
  readonly violations: string[];
  /** Refines built-in Error.cause?: unknown; always "contract". */
  readonly cause: CapabilityErrorCause;

  constructor(violations: string[], message?: string) {
    super(message ?? `Contract violation: ${violations.join("; ")}`);
    this.name = "ContractViolationError";
    this.violations = violations;
    this.cause = "contract";
  }
}

/**
 * The variable rejection family: one dedicated voice for every VARIABLE
 * concern — shape/coercion rejects from either origin (programmatic TS or
 * model tool), the model-side permission reject (the per-phase guard owns
 * those bytes), and typed-read faults (absent / unconvertible stored
 * value). Mirrors the ContractViolationError precedent in every load-
 * bearing detail: collect-all surface (a single-concern event carries
 * exactly ONE rendered line; multi-name failures compose as one instance),
 * optional explicit message preserved verbatim, defining `violations`
 * datum, pinned default-message prefix.
 *
 * NO cause member on purpose: the closed five-member vocabulary is
 * undisturbed and no existing member semantically fits — ES Error.cause
 * stays unset, so captureError's adoption step finds nothing to adopt and
 * instances reduce via the generic branch to bare identity {type, message}.
 * Developer-facing bookkeeping corruption (registry faults) NEVER rides
 * this family — it stays in its separate ASCII voice.
 */
export class VariableRejectionError extends Error {
  /** Every collected violation line — the defining datum. */
  readonly violations: string[];

  constructor(violations: string[], message?: string) {
    super(message ?? `Variable rejection: ${violations.join("; ")}`);
    this.name = "VariableRejectionError";
    this.violations = violations;
  }
}

/**
 * JSON-safe captured failure: a thrown error reduced to plain data so it
 * survives serialization into the terminal status record's errors array.
 */
export interface SessionStatusError {
  /** Identity of the captured error (its class name or equivalent). */
  type: string;
  cause?: CapabilityErrorCause;
  message?: string;
  violations?: string[];
}
