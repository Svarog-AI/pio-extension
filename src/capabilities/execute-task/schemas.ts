import { Type } from "typebox";
import type { Static } from "typebox";

// ---------------------------------------------------------------------------
// Execution summary schema and types
// ---------------------------------------------------------------------------

/**
 * TypeBox schema defining the expected frontmatter fields for SUMMARY.md.
 * Single source of truth — change the schema, the type follows automatically.
 *
 * Leaf module — imports only from external packages (typebox).
 * Never imports from the rest of the codebase to avoid circular dependencies.
 */
export const EXECUTION_SUMMARY_SCHEMA = Type.Object({
  status: Type.Union([Type.Literal("completed"), Type.Literal("blocked")]),
});

/** Derived type from the schema — no manual interface definition. */
export type ExecutionSummaryOutputs = Static<typeof EXECUTION_SUMMARY_SCHEMA>;
