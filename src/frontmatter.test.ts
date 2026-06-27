import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import {
  extractFrontmatter,
  formatSchemaDescription,
  validateAndCoerce,
} from "./frontmatter";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-frontmatter-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function writeFrontmatterFile(
  tempDir: string,
  fileName: string,
  content: string,
): string {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// extractFrontmatter
// ---------------------------------------------------------------------------

describe("extractFrontmatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns parsed object for valid frontmatter with multiple fields", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "test.md",
      [
        "---",
        "decision: APPROVED",
        "criticalIssues: 0",
        "highIssues: 1",
        "mediumIssues: 2",
        "lowIssues: 3",
        "---",
        "# Body text",
      ].join("\n"),
    );

    const result = extractFrontmatter(filePath);

    expect(result).not.toBeNull();
    expect(result?.decision).toBe("APPROVED");
    expect(result?.criticalIssues).toBe(0);
    expect(result?.highIssues).toBe(1);
    expect(result?.mediumIssues).toBe(2);
    expect(result?.lowIssues).toBe(3);
  });

  it("returns parsed object for minimal valid frontmatter", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "minimal.md",
      ["---", "key: value", "---", "body"].join("\n"),
    );

    const result = extractFrontmatter(filePath);

    expect(result).toEqual({ key: "value" });
  });

  it("returns null for missing file", () => {
    const result = extractFrontmatter(path.join(tempDir, "does-not-exist.md"));
    expect(result).toBeNull();
  });

  it("returns null when file does not start with ---", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "no-frontmatter.md",
      "# Title\n\nSome content.",
    );

    const result = extractFrontmatter(filePath);
    expect(result).toBeNull();
  });

  it("returns null when file starts with --- but no closing delimiter", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "no-closing.md",
      "---\nkey: value",
    );

    const result = extractFrontmatter(filePath);
    expect(result).toBeNull();
  });

  it("returns null for malformed YAML between delimiters", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "malformed.md",
      "---\nkey: [unclosed\n---\nbody",
    );

    const result = extractFrontmatter(filePath);
    expect(result).toBeNull();
  });

  it("returns null when YAML parses to null", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "empty-yaml.md",
      "---\n---\nbody",
    );

    const result = extractFrontmatter(filePath);
    expect(result).toBeNull();
  });

  it("returns null for leading whitespace before ---", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "leading-whitespace.md",
      "\n---\nkey: value\n---\nbody",
    );

    const result = extractFrontmatter(filePath);
    expect(result).toBeNull();
  });

  it("parses integer values correctly from YAML", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "integers.md",
      "---\ncount: 42\n---\nbody",
    );

    const result = extractFrontmatter(filePath);

    expect(result).not.toBeNull();
    expect(result?.count).toBe(42);
    expect(typeof result?.count).toBe("number");
  });

  it("preserves boolean values from YAML", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "booleans.md",
      "---\nenabled: true\n---\nbody",
    );

    const result = extractFrontmatter(filePath);

    expect(result).not.toBeNull();
    expect(result?.enabled).toBe(true);
    expect(typeof result?.enabled).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// validateAndCoerce (typebox-based)
// ---------------------------------------------------------------------------

describe("validateAndCoerce", () => {
  const reviewSchema = Type.Object({
    decision: Type.Union([Type.Literal("APPROVED"), Type.Literal("REJECTED")]),
    criticalIssues: Type.Integer({ minimum: 0 }),
    highIssues: Type.Integer({ minimum: 0 }),
    mediumIssues: Type.Integer({ minimum: 0 }),
    lowIssues: Type.Integer({ minimum: 0 }),
  });

  it("returns typed data for valid schema with all field types", () => {
    const raw = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 1,
      mediumIssues: 2,
      lowIssues: 3,
    };

    const result = validateAndCoerce(raw, reviewSchema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.decision).toBe("APPROVED");
    expect(result.data?.criticalIssues).toBe(0);
  });

  it("returns error for missing required field", () => {
    const raw = {
      criticalIssues: 0,
      highIssues: 1,
      mediumIssues: 2,
      lowIssues: 3,
    };

    const result = validateAndCoerce(raw, reviewSchema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("decision");
  });

  it("returns error when string expected but number given", () => {
    const schema = Type.Object({ name: Type.String() });
    const raw = { name: 42 };

    const result = validateAndCoerce(raw, schema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("name");
  });

  it("returns error when integer expected but string given", () => {
    const schema = Type.Object({ count: Type.Integer() });
    const raw = { count: "5" };

    const result = validateAndCoerce(raw, schema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("count");
  });

  it("returns error for float where integer expected", () => {
    const schema = Type.Object({ count: Type.Integer() });
    const raw = { count: 1.5 };

    const result = validateAndCoerce(raw, schema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("count");
  });

  it("returns error for enum value not in allowed list", () => {
    const raw = {
      decision: "PENDING",
      criticalIssues: 0,
      highIssues: 1,
      mediumIssues: 2,
      lowIssues: 3,
    };

    const result = validateAndCoerce(raw, reviewSchema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    // typebox reports the field path and that the constant/union didn't match
    expect(result.error).toContain("decision");
    expect(result.error).toMatch(/constant|anyOf/);
  });

  it("passes when enum value matches one of allowed values", () => {
    const schema = Type.Object({
      status: Type.Union([Type.Literal("A"), Type.Literal("B")]),
    });
    const raw = { status: "B" };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.status).toBe("B");
  });

  it("returns error for integer below min threshold", () => {
    const schema = Type.Object({ count: Type.Integer({ minimum: 0 }) });
    const raw = { count: -1 };

    const result = validateAndCoerce(raw, schema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("count");
  });

  it("passes when integer equals min (boundary)", () => {
    const schema = Type.Object({ count: Type.Integer({ minimum: 0 }) });
    const raw = { count: 0 };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.count).toBe(0);
  });

  it("ignores extra fields not declared in schema", () => {
    const schema = Type.Object({ name: Type.String() });
    const raw = { name: "test", extra: "ignored", another: 42 };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe("test");
    expect((result.data! as Record<string, unknown>).extra).toBeUndefined();
  });

  it("preserves optional fields present in raw data", () => {
    const schema = Type.Object({
      name: Type.String(),
      alias: Type.Optional(Type.String()),
    });
    const raw = { name: "test", alias: "t" };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe("test");
    // Optional field present in raw should be preserved (not dropped)
    expect(result.data?.alias).toBe("t");
  });

  it("omits optional fields not present in raw data", () => {
    const schema = Type.Object({
      name: Type.String(),
      alias: Type.Optional(Type.String()),
    });
    const raw = { name: "test" };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.name).toBe("test");
    expect((result.data! as Record<string, unknown>).alias).toBeUndefined();
  });

  it("succeeds with empty schema (no fields)", () => {
    const schema = Type.Object({});
    const raw = { anything: "goes" };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(Object.keys(result.data!)).toHaveLength(0);
  });

  it("returns error for boolean value where string is expected", () => {
    const schema = Type.Object({ flag: Type.String() });
    const raw = { flag: true };

    const result = validateAndCoerce(raw, schema);

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("flag");
  });
});

// ---------------------------------------------------------------------------
// formatSchemaDescription
// ---------------------------------------------------------------------------

describe("formatSchemaDescription", () => {
  it("describes object with required and optional fields", () => {
    const schema = Type.Object({
      name: Type.String(),
      alias: Type.Optional(Type.String()),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("- name (required): string");
    expect(result).toContain("- alias (optional): string");
  });

  it("describes literal types with = format", () => {
    const schema = Type.Object({
      status: Type.Literal("complete"),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain('status (required): string = "complete"');
  });

  it("describes union of literals with one-of format", () => {
    const schema = Type.Object({
      decision: Type.Union([
        Type.Literal("APPROVED"),
        Type.Literal("REJECTED"),
      ]),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain(
      'decision (required): string (one of: "APPROVED" | "REJECTED")',
    );
  });

  it("describes array types with angle bracket notation", () => {
    const schema = Type.Object({
      tags: Type.Array(Type.String()),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("tags (required): array<string>");
  });

  it("describes nested objects with proper indentation", () => {
    const schema = Type.Object({
      skills: Type.Optional(
        Type.Object({
          mandatory: Type.Array(Type.String()),
          recommended: Type.Optional(
            Type.Array(
              Type.Object({
                name: Type.String(),
                condition: Type.String(),
              }),
            ),
          ),
        }),
      ),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("- skills (optional): object");
    expect(result).toContain("    - mandatory (required): array<string>");
    expect(result).toContain("    - recommended (optional): array<object>");
    // nested object inside array items
    expect(result).toContain("        - name (required): string");
    expect(result).toContain("        - condition (required): string");
  });

  it("describes integer types", () => {
    const schema = Type.Object({
      count: Type.Integer({ minimum: 0 }),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("count (required): number");
  });

  it("describes boolean types", () => {
    const schema = Type.Object({
      enabled: Type.Boolean(),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("enabled (required): boolean");
  });

  it("describes number types with constraints", () => {
    const schema = Type.Object({
      score: Type.Number({ minimum: 0, maximum: 100 }),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("score (required): number");
  });

  it("describes string types with pattern constraint", () => {
    const schema = Type.Object({
      pattern: Type.String({ pattern: "^feat|fix" }),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain(
      'pattern (required): string (pattern: "^feat|fix")',
    );
  });

  it("handles unknown types gracefully", () => {
    const schema = { type: "unknownType" } as any;

    const result = formatSchemaDescription(schema);

    expect(result).toContain("unknown");
  });

  it("handles empty object schema", () => {
    const schema = Type.Object({});

    const result = formatSchemaDescription(schema);

    expect(result).toBe("");
  });

  it("respects depth limit and shows ... for deeply nested schemas", () => {
    // Build a deeply nested schema (5 levels deep)
    const schema = Type.Object({
      level1: Type.Object({
        level2: Type.Object({
          level3: Type.Object({
            level4: Type.Object({
              level5: Type.String(),
            }),
          }),
        }),
      }),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("...");
  });

  it("describes array of objects", () => {
    const schema = Type.Object({
      items: Type.Array(
        Type.Object({
          id: Type.String(),
          value: Type.Integer(),
        }),
      ),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain("items (required): array<object>");
    expect(result).toContain("    - id (required): string");
    expect(result).toContain("    - value (required): number");
  });

  it("describes the COMPLETION_SUMMARY_SCHEMA example", () => {
    const schema = Type.Object({
      status: Type.Literal("complete"),
      completedAt: Type.Optional(Type.String()),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain('status (required): string = "complete"');
    expect(result).toContain("completedAt (optional): string");
  });

  it("error message for empty {} frontmatter includes schema description", () => {
    const schema = Type.Object({
      status: Type.Literal("complete"),
      completedAt: Type.Optional(Type.String()),
    });

    // Empty {} frontmatter fails validation
    const result = validateAndCoerce({}, schema);

    expect(result.error).toBeDefined();
    expect(result.error).toContain("status");

    // Schema description should show expected structure
    const desc = formatSchemaDescription(schema);
    expect(desc).toContain('status (required): string = "complete"');
    expect(desc).toContain("completedAt (optional): string");
  });

  it("describes the REVIEW_OUTPUT_SCHEMA example", () => {
    const schema = Type.Object({
      decision: Type.Union([
        Type.Literal("APPROVED"),
        Type.Literal("REJECTED"),
      ]),
      criticalIssues: Type.Integer({ minimum: 0 }),
      highIssues: Type.Integer({ minimum: 0 }),
      mediumIssues: Type.Integer({ minimum: 0 }),
      lowIssues: Type.Integer({ minimum: 0 }),
    });

    const result = formatSchemaDescription(schema);

    expect(result).toContain(
      'decision (required): string (one of: "APPROVED" | "REJECTED")',
    );
    expect(result).toContain("criticalIssues (required): number");
    expect(result).toContain("highIssues (required): number");
    expect(result).toContain("mediumIssues (required): number");
    expect(result).toContain("lowIssues (required): number");
  });
});
