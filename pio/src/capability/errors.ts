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
 * Failure raised when an iteration budget is exceeded. A plain Error, so
 * caller code can catch it narrowly around phase execution.
 */
export class PhaseBudgetError extends Error {
  /** Iteration count reached when the budget was exceeded. */
  readonly iterations: number;

  constructor(iterations: number, message?: string) {
    super(
      message ?? `Iteration budget exceeded after ${iterations} iterations`,
    );
    this.name = "PhaseBudgetError";
    this.iterations = iterations;
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
