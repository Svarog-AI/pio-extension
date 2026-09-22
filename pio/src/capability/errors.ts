// Shared error home for the pio capability runtime.
//
// Zero-import module on purpose: the error home pulls in nothing — not even
// node: built-ins or the SDK — so importing it has no side effects.
// Constructors assign explicit readonly fields because erasableSyntaxOnly
// forbids parameter properties.

/** Machine-readable classification of a capability failure. */
export type CapabilityErrorCause =
  | "budget"
  | "kill"
  | "spawn"
  | "contract"
  | "author-halt";

/**
 * Envelope for capability failures. Its plain-data fields (`cause`,
 * `partial`) keep the error identifiable after serialization, where
 * `instanceof` checks do not survive.
 */
export class CapabilityError extends Error {
  /** Partial terminal-status snapshot attached at capture time (shallow pass-through; no cloning). */
  readonly partial?: Partial<SessionStatus>;
  /** Refines the built-in `Error.cause?: unknown` to a JSON-safe literal union. */
  readonly cause?: CapabilityErrorCause;

  constructor(
    message: string,
    options?: {
      partial?: Partial<SessionStatus>;
      cause?: CapabilityErrorCause;
    },
  ) {
    super(message);
    this.name = "CapabilityError";
    if (options) {
      // Assigned here rather than through super() options: the native
      // Error.cause channel is typed unknown and would double-source the
      // narrowed field declared above.
      this.partial = options.partial;
      this.cause = options.cause;
    }
  }
}

/**
 * Failure raised when a capability contract is violated (e.g. missing or
 * invalid inputs/outputs). Collect-all semantics live with the validators;
 * this class just carries every collected violation.
 */
export class ContractViolationError extends CapabilityError {
  /** Every collected violation — the defining datum. */
  readonly violations: string[];

  constructor(violations: string[], message?: string) {
    // A contract violation is cause-"contract" by definition; stamping it
    // unconditionally keeps instances self-describing for downstream reads.
    super(message ?? `Contract violation: ${violations.join("; ")}`, {
      cause: "contract",
    });
    this.name = "ContractViolationError";
    this.violations = violations;
  }
}

/**
 * Failure raised when an iteration budget is exceeded. Deliberately a plain
 * `Error` — no envelope fields — so caller code can catch it narrowly.
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
 * Terminal status record for a capability run. Single source of truth for
 * the serialized status schema; nullish members are omitted when absent.
 */
export interface SessionStatus {
  ok: boolean;
  capability: {
    name: string;
    version: string;
    source: "builtin" | "user" | "explicit";
  };
  /** Value object the capability returned; always present (`{}` on failure). */
  outputs: Record<string, unknown>;
  /** Captured errors; absent when `ok`. */
  errors?: SessionStatusError[];
  /** Transcript path relative to the engagement dir. */
  transcriptRef?: string;
  /** Total tokens consumed across the run. */
  tokens: number;
  /** Wall-clock span from run start to emission. */
  durationMs: number;
}

/**
 * Element of `SessionStatus.errors`: a captured error reduced to plain data
 * so it survives cross-process serialization.
 */
export interface SessionStatusError {
  /** Identity of the captured error (its class name or equivalent). */
  type: string;
  cause?: CapabilityErrorCause;
  message?: string;
  violations?: string[];
}
