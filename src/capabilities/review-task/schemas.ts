import type { Static } from "typebox";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Review output schema and types
// ---------------------------------------------------------------------------

/**
 * Typebox schema defining the expected frontmatter fields for REVIEW.md.
 * Single source of truth — change the schema, the type follows automatically.
 *
 * Leaf module — imports only from external packages (typebox).
 * Never imports from the rest of the codebase to avoid circular dependencies.
 */
export const REVIEW_OUTPUT_SCHEMA = Type.Object({
  decision: Type.Union([
    Type.Literal("APPROVED"),
    Type.Literal("REJECTED"),
    Type.Literal("BLOCKED"),
  ]),
  criticalIssues: Type.Integer({ minimum: 0 }),
  highIssues: Type.Integer({ minimum: 0 }),
  mediumIssues: Type.Integer({ minimum: 0 }),
  lowIssues: Type.Integer({ minimum: 0 }),
});

/** Derived type from the schema — no manual interface definition. */
export type ReviewOutputs = Static<typeof REVIEW_OUTPUT_SCHEMA>;
