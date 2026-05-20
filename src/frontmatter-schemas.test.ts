import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PLAN_FRONTMATTER_SCHEMA, type PlanFrontmatter } from "./frontmatter-schemas";
import { validateAndCoerce } from "./frontmatter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Schema Validation Tests
// ---------------------------------------------------------------------------

describe("PLAN_FRONTMATTER_SCHEMA", () => {
  it("accepts valid totalSteps as positive integer", () => {
    const result = validateAndCoerce({ totalSteps: 5 }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(5);
  });

  it("accepts totalSteps at minimum boundary (1)", () => {
    const result = validateAndCoerce({ totalSteps: 1 }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(1);
  });

  it("rejects missing totalSteps", () => {
    const result = validateAndCoerce({}, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("totalSteps");
  });

  it("rejects zero totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: 0 }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("totalSteps");
  });

  it("rejects negative totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: -1 }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects float totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: 3.5 }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects string totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: "5" }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("rejects boolean totalSteps", () => {
    const result = validateAndCoerce({ totalSteps: true }, PLAN_FRONTMATTER_SCHEMA);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it("ignores extra fields not in schema", () => {
    const result = validateAndCoerce(
      { totalSteps: 3, extraField: "value" },
      PLAN_FRONTMATTER_SCHEMA,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.totalSteps).toBe(3);
    expect((result.data! as Record<string, unknown>).extraField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Type Export Test
// ---------------------------------------------------------------------------

describe("PlanFrontmatter type", () => {
  it("exports PlanFrontmatter type usable by TypeScript", () => {
    const value: PlanFrontmatter = { totalSteps: 1 };
    expect(value.totalSteps).toBe(1);
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
