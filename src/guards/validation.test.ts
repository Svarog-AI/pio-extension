import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import { validateOutputs, setupValidation, validateFrontmatter, createFrontmatterValidator } from "./validation";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// validateOutputs — file-existence validation engine
// ---------------------------------------------------------------------------

describe("validateOutputs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("all files present → passed: true, missing: []", () => {
    // Arrange: create two files in baseDir
    fs.writeFileSync(path.join(tempDir, "output1.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "output2.md"), "content", "utf-8");

    const rules = { files: ["output1.md", "output2.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("all files missing → passed: false, all in missing array", () => {
    // Arrange: rules reference two files, none exist
    const rules = { files: ["output1.md", "output2.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("output1.md");
    expect(result.missing).toContain("output2.md");
    expect(result.missing.length).toBe(2);
  });

  it("partial files missing → correct subset in missing", () => {
    // Arrange: create only output1.md, rules reference both
    fs.writeFileSync(path.join(tempDir, "output1.md"), "content", "utf-8");

    const rules = { files: ["output1.md", "output2.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result.passed).toBe(false);
    expect(result.missing.length).toBe(1);
    expect(result.missing[0]).toBe("output2.md");
  });

  it("empty rules (files: []) → passed: true, missing: []", () => {
    // Arrange
    const rules = { files: [] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("undefined rules.files → passed: true, missing: []", () => {
    // Arrange: rules object exists but files is undefined
    const rules = {};

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("single file present → passes with empty missing", () => {
    // Arrange: one file exists, rules reference just that one
    fs.writeFileSync(path.join(tempDir, "README.md"), "content", "utf-8");

    const rules = { files: ["README.md"] };

    // Act
    const result = validateOutputs(rules, tempDir);

    // Assert
    expect(result).toEqual({ passed: true, missing: [] });
  });
});

// ---------------------------------------------------------------------------
// setupValidation — verifies no tool registration (only event handlers)
// ---------------------------------------------------------------------------

describe("setupValidation", () => {
  it("no longer calls registerTool (only registers event handlers)", () => {
    let registerToolCalled = false;
    const registeredEvents: string[] = [];

    const mockPi = {
      registerTool: () => { registerToolCalled = true; },
      on: (event: string) => { registeredEvents.push(event); },
    };

    setupValidation(mockPi as any);

    // Assert: registerTool was NOT called
    expect(registerToolCalled).toBe(false);

    // Assert: only event handlers are registered
    expect(registeredEvents).toContain("resources_discover");
    expect(registeredEvents).toContain("turn_start");
    expect(registeredEvents).toContain("tool_call");
  });
});

// ---------------------------------------------------------------------------
// validateFrontmatter — frontmatter schema validation
// ---------------------------------------------------------------------------

describe("validateFrontmatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  // --- Empty / undefined declarations ---

  it("empty declarations array → success: true", () => {
    const result = validateFrontmatter([], tempDir);
    expect(result).toEqual({ success: true });
  });

  it("undefined declarations → success: true", () => {
    const result = validateFrontmatter(undefined as any, tempDir);
    expect(result).toEqual({ success: true });
  });

  // --- Missing file ---

  it("missing output file → failure with descriptive message", () => {
    const schema = Type.Object({ name: Type.String() });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("does not exist");
  });

  // --- No frontmatter (file exists but no YAML delimiters) ---

  it("file with no frontmatter delimiters → failure", () => {
    const schema = Type.Object({ name: Type.String() });
    const declarations = [{ outputFile: "output.md", schema }];

    fs.writeFileSync(path.join(tempDir, "output.md"), "just plain text", "utf-8");

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("output.md");
    expect(result.message).toContain("no valid YAML frontmatter");
  });

  // --- Valid frontmatter that matches schema ---

  it("valid frontmatter matching schema → success: true", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
      steps: Type.Array(Type.Object({ name: Type.String() })),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
steps:
  - name: step-one
  - name: step-two
  - name: step-three
---
# Plan content
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result).toEqual({ success: true });
  });

  // --- Schema mismatch ---

  it("frontmatter missing required field → failure with error details", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
      steps: Type.Array(Type.Object({ name: Type.String() })),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    // Missing 'steps' field
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
---
# Plan content
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("steps");
  });

  it("frontmatter wrong type → failure with error details", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    // totalSteps is a string instead of integer
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: "three"
---
# Plan content
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("totalSteps");
  });

  // --- Multiple declarations (fail-fast) ---

  it("first declaration fails → returns immediately without checking second", () => {
    const schema1 = Type.Object({ totalSteps: Type.Integer() });
    const schema2 = Type.Object({ decision: Type.String() });

    const declarations = [
      { outputFile: "PLAN.md", schema: schema1 },
      { outputFile: "REVIEW.md", schema: schema2 },
    ];

    // PLAN.md doesn't exist — should fail on first declaration
    // REVIEW.md also doesn't exist but should not be checked

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    // Should NOT mention REVIEW.md (fail-fast)
    expect(result.message).not.toContain("REVIEW.md");
  });

  it("first declaration passes, second fails → error from second", () => {
    const schema1 = Type.Object({ name: Type.String() });
    const schema2 = Type.Object({ totalSteps: Type.Integer() });

    const declarations = [
      { outputFile: "output1.md", schema: schema1 },
      { outputFile: "output2.md", schema: schema2 },
    ];

    // First file is valid
    fs.writeFileSync(
      path.join(tempDir, "output1.md"),
      `---
name: test
---
content
`,
      "utf-8",
    );
    // Second file doesn't exist

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("output2.md");
  });

  // --- Empty frontmatter (valid YAML but empty object) ---

  it("empty frontmatter with required fields → failure (extractFrontmatter returns null for empty YAML)", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    // Empty YAML between delimiters — extractFrontmatter returns null
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
---
# Plan content
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    // extractFrontmatter returns null for empty YAML — error is about missing frontmatter
    expect(result.message).toContain("no valid YAML frontmatter");
  });

  it("valid YAML empty object {} with required fields → schema validation failure", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    // Explicit empty object — extractFrontmatter returns {}, schema validation catches missing fields
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
{}
---
# Plan content
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("totalSteps");
  });

  // --- Schema-only validation (no cross-field checks) ---

  it("does not perform cross-field validations (schema-only)", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    // totalSteps says 5 but there are only 2 step headings
    // This should PASS because schema-only validation doesn't check body content
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 5
---
# Plan

### Step 1
First step

### Step 2
Second step
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createFrontmatterValidator — factory for PostValidateCallback
// ---------------------------------------------------------------------------

describe("createFrontmatterValidator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns a PostValidateCallback function", () => {
    const validator = createFrontmatterValidator([]);
    expect(typeof validator).toBe("function");
  });

  it("callback with valid frontmatter → success: true", () => {
    const schema = Type.Object({ name: Type.String() });
    const validator = createFrontmatterValidator([{ outputFile: "output.md", schema }]);

    fs.writeFileSync(
      path.join(tempDir, "output.md"),
      `---
name: test
---
content
`,
      "utf-8",
    );

    const result = validator(tempDir);
    expect(result.success).toBe(true);
  });

  it("callback with missing file → failure", () => {
    const schema = Type.Object({ name: Type.String() });
    const validator = createFrontmatterValidator([{ outputFile: "missing.md", schema }]);

    const result = validator(tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("missing.md");
  });

  it("callback with empty declarations → success: true", () => {
    const validator = createFrontmatterValidator([]);
    const result = validator(tempDir);
    expect(result).toEqual({ success: true });
  });
});
