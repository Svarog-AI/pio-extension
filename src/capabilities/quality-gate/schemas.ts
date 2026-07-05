import type { Static } from "typebox";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Quality Gate output schema and types
// ---------------------------------------------------------------------------

/**
 * TypeBox schema defining the expected frontmatter fields for QUALITY_GATE.md.
 * Single source of truth — change the schema, the type follows automatically.
 *
 * Leaf module — imports only from external packages (typebox).
 * Never imports from the rest of the codebase to avoid circular dependencies.
 */
export const QUALITY_GATE_SCHEMA = Type.Object({
  status: Type.Union([Type.Literal("approved"), Type.Literal("rejected")]),
});

/** Derived type from the schema — no manual interface definition. */
export type QualityGateOutputs = Static<typeof QUALITY_GATE_SCHEMA>;
