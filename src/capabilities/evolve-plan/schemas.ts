import type { Static } from "typebox";
import { Type } from "typebox";

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

// ---------------------------------------------------------------------------
// Completion summary frontmatter schema and types
// ---------------------------------------------------------------------------

/**
 * TypeBox schema defining the expected frontmatter fields for COMPLETION_SUMMARY.md.
 * Written by evolve-plan when all plan steps have been specified.
 */

export const COMPLETION_SUMMARY_SCHEMA = Type.Object({
  status: Type.Literal("complete"),
  completedAt: Type.Optional(Type.String()),
});

/** Derived type. */
export type CompletionSummaryFrontmatter = Static<
  typeof COMPLETION_SUMMARY_SCHEMA
>;
