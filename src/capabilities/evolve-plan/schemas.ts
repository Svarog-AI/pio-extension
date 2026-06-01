import { Type } from "typebox";
import type { Static } from "typebox";

// ---------------------------------------------------------------------------
// Plan frontmatter schema and types (needed by callbacks.ts for PLAN.md parsing)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Task frontmatter schema and types
// ---------------------------------------------------------------------------

/**
 * TypeBox schema defining the expected frontmatter fields for TASK.md.
 * Single source of truth — change the schema, the type follows automatically.
 *
 * Leaf module — imports only from external packages (typebox).
 * Never imports from the rest of the codebase to avoid circular dependencies.
 */

/** Recommended skill entry: name plus a condition describing when to load. */
export const TASK_RECOMMENDED_SKILL_SCHEMA = Type.Object({
  name: Type.String({ minLength: 1 }),
  condition: Type.String({ minLength: 1 }),
});

/** Derived type — no manual interface definition. */
export type TaskRecommendedSkill = Static<typeof TASK_RECOMMENDED_SKILL_SCHEMA>;

/** Skills block inside TASK.md frontmatter, mirroring `CapabilitySkills` from `types.ts`. */
export const TASK_SKILLS_SCHEMA = Type.Object({
  mandatory: Type.Optional(Type.Array(Type.String())),
  recommended: Type.Optional(Type.Array(TASK_RECOMMENDED_SKILL_SCHEMA)),
});

/** Derived type — no manual interface definition. */
export type TaskSkills = Static<typeof TASK_SKILLS_SCHEMA>;

export const TASK_FRONTMATTER_SCHEMA = Type.Object({
  skills: Type.Optional(TASK_SKILLS_SCHEMA),
});

/** Derived type from the schema — no manual interface definition. */
export type TaskFrontmatter = Static<typeof TASK_FRONTMATTER_SCHEMA>;
