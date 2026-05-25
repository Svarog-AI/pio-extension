import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PLAN_FRONTMATTER_SCHEMA, TASK_FRONTMATTER_SCHEMA, type PlanFrontmatter, type TaskFrontmatter } from "./frontmatter-schemas";
import { validateAndCoerce } from "./frontmatter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema Validation Tests
// ---------------------------------------------------------------------------

describe("PLAN_FRONTMATTER_SCHEMA", () => {
  it("accepts valid totalSteps as positive integer", () => {
    const result = validateAndCoerce(
      { totalSteps: 5, steps: [{ name: "a", complexity: "task" }, { name: "b", complexity: "task" }, { name: "c", complexity: "task" }, { name: "d", complexity: "task" }, { name: "e", complexity: "task" }] },
      PLAN_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(5);
  });

  it("accepts totalSteps at minimum boundary (1)", () => {
    const result = validateAndCoerce(
      { totalSteps: 1, steps: [{ name: "only-step", complexity: "task" }] },
      PLAN_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(1);
  });

  it("rejects missing totalSteps", () => {
    const result = validateAndCoerce({ steps: [{ name: "a", complexity: "task" }] }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("totalSteps");
  });

  it("rejects zero totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: 0, steps: [] }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("totalSteps");
  });

  it("rejects negative totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: -1, steps: [] }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects float totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: 3.5, steps: [] }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects string totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: "5", steps: [] } as Record<string, unknown>, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects boolean totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: true, steps: [] } as Record<string, unknown>, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("ignores extra fields not in schema", () => {
    const result = validateAndCoerce(
      { totalSteps: 3, steps: [{ name: "a", complexity: "task" }, { name: "b", complexity: "task" }, { name: "c", complexity: "task" }], extraField: "value" },
      PLAN_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(3);
    expect(result.data!.steps).toHaveLength(3);
    expect((result.data! as Record<string, unknown>).extraField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Type Export Test
// ---------------------------------------------------------------------------

describe("PlanFrontmatter type", () => {
  it("exports PlanFrontmatter type usable by TypeScript", () => {
    const value: PlanFrontmatter = { totalSteps: 1, steps: [{ name: "a", complexity: "task" }] };
    expect(value.totalSteps).toBe(1);
    expect(value.steps).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Module Boundary Test
// ---------------------------------------------------------------------------

describe("module boundary", () => {
  it("is a leaf module importing only from typebox", () => {
    const filePath = join(__dirname, "frontmatter-schemas.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    // Find all import statements with string literal sources
    const importLines = content
      .split("\n")
      .filter((line) => line.includes('from "') || line.includes("from '"));

    // All imports should reference "typebox" only
    for (const line of importLines) {
      expect(line).toMatch(/from\s+["']typebox["']/);
    }

    // Should have no relative imports
    const relativeImports = importLines.filter(
      (line) => line.includes('./') || line.includes('../'),
    );
    expect(relativeImports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TASK_FRONTMATTER_SCHEMA Validation Tests
// ---------------------------------------------------------------------------

describe("TASK_FRONTMATTER_SCHEMA", () => {
  it("accepts valid skills with both mandatory and recommended fields", () => {
    const result = validateAndCoerce(
      {
        skills: {
          mandatory: ["pio-git", "test-driven-development"],
          recommended: [
            { name: "source-research", condition: "when researching open-source libraries" },
          ],
        },
      },
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    const data = result.data! as TaskFrontmatter;
    expect(data.skills).toBeDefined();
    expect(data.skills!.mandatory).toEqual(["pio-git", "test-driven-development"]);
    expect(data.skills!.recommended).toHaveLength(1);
    expect(data.skills!.recommended![0].name).toBe("source-research");
  });

  it("accepts missing skills field, validating as empty object", () => {
    const result = validateAndCoerce({}, TASK_FRONTMATTER_SCHEMA);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.skills).toBeUndefined();
  });

  it("accepts partial skills with only mandatory", () => {
    const result = validateAndCoerce(
      { skills: { mandatory: ["pio-git"] } },
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    const data = result.data! as TaskFrontmatter;
    expect(data.skills!.mandatory).toEqual(["pio-git"]);
    expect(data.skills!.recommended).toBeUndefined();
  });

  it("accepts partial skills with only recommended", () => {
    const result = validateAndCoerce(
      {
        skills: {
          recommended: [{ name: "source-research", condition: "when needed" }],
        },
      },
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    const data = result.data! as TaskFrontmatter;
    expect(data.skills!.mandatory).toBeUndefined();
    expect(data.skills!.recommended).toHaveLength(1);
  });

  it("rejects mandatory as a non-array type", () => {
    const result = validateAndCoerce(
      { skills: { mandatory: "pio-git" } } as Record<string, unknown>,
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("mandatory");
  });

  it("rejects recommended containing an object missing the name field", () => {
    const result = validateAndCoerce(
      { skills: { recommended: [{ condition: "when needed" }] } },
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects recommended containing an object missing the condition field", () => {
    const result = validateAndCoerce(
      { skills: { recommended: [{ name: "source-research" }] } },
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects recommended as a non-array type", () => {
    const result = validateAndCoerce(
      { skills: { recommended: "source-research" } } as Record<string, unknown>,
      TASK_FRONTMATTER_SCHEMA,
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("recommended");
  });

});

// ---------------------------------------------------------------------------
// TaskFrontmatter Type Test
// ---------------------------------------------------------------------------

describe("TaskFrontmatter type", () => {
  it("exports TaskFrontmatter type usable by TypeScript", () => {
    const value: TaskFrontmatter = {
      skills: {
        mandatory: ["pio-git"],
        recommended: [{ name: "source-research", condition: "when researching" }],
      },
    };
    expect(value.skills).toBeDefined();
    expect(value.skills!.mandatory).toEqual(["pio-git"]);
  });

  it("accepts TaskFrontmatter with undefined skills", () => {
    const value: TaskFrontmatter = {};
    expect(value.skills).toBeUndefined();
  });
});
