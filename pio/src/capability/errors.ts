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
 * Typed interruption raised when the settling run of an executed phase ends
 * on a user abort (its final assistant message carries stopReason
 * "aborted"): the phase settles AS CANCELLED instead of resuming into
 * further iterations. Sole throw site: the between-turns consult in
 * execute_phase, preemptive over floor/hook/budget and both gate faces.
 *
 * NO cause member on purpose: the closed five-member vocabulary is
 * undisturbed and no member semantically fits (operator-caused, not
 * budget/kill/spawn/contract/author-halt) — ES Error.cause stays unset, so
 * captureError's adoption step finds nothing to adopt and instances reduce
 * via the generic branch to bare identity {type, message}: the exact shape
 * the adhoc coordinator detects by. Single concern by design — one pinned
 * form, NO violations member.
 */
export class PhaseInterruptionError extends Error {
  constructor() {
    super(
      "Phase interruption: the settling run ended on a user abort \u2014 the phase settles as cancelled",
    );
    this.name = "PhaseInterruptionError";
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
