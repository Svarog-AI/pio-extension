import { Type } from "typebox";
import type { Static } from "typebox";

// ---------------------------------------------------------------------------
// Plan frontmatter schema and types
// ---------------------------------------------------------------------------

/**
 * TypeBox schema defining the expected frontmatter fields for PLAN.md.
 * Single source of truth — change the schema, the type follows automatically.
 *
 * Leaf module — imports only from external packages (typebox).
 * Never imports from the rest of the codebase to avoid circular dependencies.
 */

/** Step metadata entry in the `steps` array of PLAN.md frontmatter. */
export const STEP_ENTRY_SCHEMA = Type.Object({
  name: Type.String({ minLength: 1 }),
  complexity: Type.Optional(Type.Union([Type.Literal("task"), Type.Literal("subgoal")])),
});

/** Derived type — no manual interface definition. */
export type StepMetadata = Static<typeof STEP_ENTRY_SCHEMA>;

export const PLAN_FRONTMATTER_SCHEMA = Type.Object({
  totalSteps: Type.Integer({ minimum: 1 }),
  steps: Type.Array(STEP_ENTRY_SCHEMA),
});

/** Derived type from the schema — no manual interface definition. */
export type PlanFrontmatter = Static<typeof PLAN_FRONTMATTER_SCHEMA>;
