// Shared error home for the capability authoring surface (ARCHITECTURE-SPEC §2,
// D3). Zero-import module by design — stays outside the lazy-evaluation SDK
// graph. Field shapes follow spec §4 sketches, adapted to erasableSyntaxOnly
// (explicit readonly field assignments, no parameter properties).

/** Exact five-member cause union pinned by D3 / spec §4. */
export type CapabilityErrorCause =
  | "budget"
  | "kill"
  | "spawn"
  | "contract"
  | "author-halt";

/**
 * Cross-process error envelope (D3) — in v1 same-placement it surfaces as the
 * typed SessionStatus.errors entry carrying the cause. Direct throwing is a
 * later-step matter.
 */
export class CapabilityError extends Error {
  /** Partial terminal-status snapshot attached at capture time (shallow pass-through; no cloning). */
  readonly partial?: Partial<SessionStatus>;
  /** Refines built-in Error.cause (unknown) so the value stays JSON-safe across processes. */
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
      // Assigned directly, never via super() options — the native Error.cause
      // channel is unknown and would double-source the narrowed field.
      this.partial = options.partial;
      this.cause = options.cause;
    }
  }
}

/**
 * The only v1 throw site of a CapabilityError-derived type (D3): pre-spawn
 * input validation and author-called validateOutputs(). Collect-all semantics
 * live with the throwers; this class just carries the payload.
 */
export class ContractViolationError extends CapabilityError {
  /** Every collected violation — the defining datum. */
  readonly violations: string[];

  constructor(violations: string[], message?: string) {
    // Auto-cause "contract": self-describing instance so Step 7's JSON-safe
    // capture reads cause from the field without per-class mapping.
    super(message ?? `Contract violation: ${violations.join("; ")}`, {
      cause: "contract",
    });
    this.name = "ContractViolationError";
    this.violations = violations;
  }
}

/**
 * Thrown ONLY at execute_phase max breach (D3); author code catches it around
 * individual execute_phase calls. Deliberately NOT a CapabilityError (spec §4
 * shape): plain, no partial/cause/violations — its JSON-safe capture is
 * synthesized by Step 7 from instanceof + field reads.
 */
export class PhaseBudgetError extends Error {
  /** Executed-run count at throw time (= max at the single throw site, Step 5). */
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
 * Terminal status record TYPE (D8): spec §4 Outcome shape minus struck fields,
 * renamed per owner ruling. Single source of truth for the status.json schema
 * from this commit onward — Step 7 serializes against it and never re-declares.
 */
export interface SessionStatus {
  ok: boolean;
  capability: {
    name: string;
    version: string;
    source: "builtin" | "user" | "explicit";
  };
  /** The value object call() returned; ALWAYS present ({} on failure). */
  outputs: Record<string, unknown>;
  /** Absent when ok. */
  errors?: SessionStatusError[];
  /** Path RELATIVE to the engagement dir (computed at emission, Step 7). */
  transcriptRef?: string;
  /** Total — same aggregation as the session counters (Steps 4/7). */
  tokens: number;
  /** Wall-clock span run-start → emission. */
  durationMs: number;
}

/** JSON-safe typed capture — elements of SessionStatus.errors (D8). */
export interface SessionStatusError {
  /** Error identity (how Step 7/8 names the error kind). */
  type: string;
  cause?: CapabilityErrorCause;
  message?: string;
  violations?: string[];
}
