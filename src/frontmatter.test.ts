import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import { extractFrontmatter, validateAndCoerce } from "./frontmatter";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-frontmatter-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function writeFrontmatterFile(tempDir: string, fileName: string, content: string): string {
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
    expect(result!.decision).toBe("APPROVED");
    expect(result!.criticalIssues).toBe(0);
    expect(result!.highIssues).toBe(1);
    expect(result!.mediumIssues).toBe(2);
    expect(result!.lowIssues).toBe(3);
  });

  it("returns parsed object for minimal valid frontmatter", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "minimal.md",
      [
        "---",
        "key: value",
        "---",
        "body",
      ].join("\n"),
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
    expect(result!.count).toBe(42);
    expect(typeof result!.count).toBe("number");
  });

  it("preserves boolean values from YAML", () => {
    const filePath = writeFrontmatterFile(
      tempDir,
      "booleans.md",
        "---\nenabled: true\n---\nbody",
    );

    const result = extractFrontmatter(filePath);

    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(true);
    expect(typeof result!.enabled).toBe("boolean");
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
    expect(result.data!.decision).toBe("APPROVED");
    expect(result.data!.criticalIssues).toBe(0);
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
    const schema = Type.Object({ status: Type.Union([Type.Literal("A"), Type.Literal("B")]) });
    const raw = { status: "B" };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.status).toBe("B");
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
    expect(result.data!.count).toBe(0);
  });

  it("ignores extra fields not declared in schema", () => {
    const schema = Type.Object({ name: Type.String() });
    const raw = { name: "test", extra: "ignored", another: 42 };

    const result = validateAndCoerce(raw, schema);

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.name).toBe("test");
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
    expect(result.data!.name).toBe("test");
    // Optional field present in raw should be preserved (not dropped)
    expect(result.data!.alias).toBe("t");
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
    expect(result.data!.name).toBe("test");
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
