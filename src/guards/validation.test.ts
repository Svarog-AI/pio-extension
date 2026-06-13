import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Type } from "typebox";
import type { CapabilityContract } from "../types";
import { validateOutputs, setupValidation, validateFrontmatter, createFrontmatterValidator, validateInputs } from "./validation";

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

  // --- Extra fields (TypeBox allows additional properties by default) ---

  it("extra frontmatter fields not in schema → passes (TypeBox allows additional properties)", () => {
    const schema = Type.Object({
      totalSteps: Type.Integer({ minimum: 1 }),
    });
    const declarations = [{ outputFile: "PLAN.md", schema }];

    // Frontmatter has totalSteps (declared) plus an unknown field
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
extraField: "some value"
anotherExtra: 42
---
# Plan content
`,
      "utf-8",
    );

    const result = validateFrontmatter(declarations, tempDir);

    expect(result.success).toBe(true);
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

// ---------------------------------------------------------------------------
// validateInputs — file-existence input validation
// ---------------------------------------------------------------------------

describe("validateInputs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  // --- Success path ---

  it("all required files exist, no excluded files → success: true", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const result = validateInputs(tempDir, ["GOAL.md", "PLAN.md"]);

    expect(result).toEqual({ success: true });
  });

  it("empty required files, no excluded files → success: true", () => {
    const result = validateInputs(tempDir, []);

    expect(result).toEqual({ success: true });
  });

  it("required files exist and excluded files don't → success: true", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");

    const result = validateInputs(tempDir, ["GOAL.md"], ["PLAN.md"]);

    expect(result).toEqual({ success: true });
  });

  // --- Missing required file ---

  it("first required file missing → failure with file name", () => {
    const result = validateInputs(tempDir, ["GOAL.md", "PLAN.md"]);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Required file missing: GOAL.md");
  });

  it("second required file missing → failure (first exists)", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");

    const result = validateInputs(tempDir, ["GOAL.md", "PLAN.md"]);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Required file missing: PLAN.md");
  });

  // --- Excluded file exists ---

  it("excluded file exists → failure with file name", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const result = validateInputs(tempDir, ["GOAL.md"], ["PLAN.md"]);

    expect(result.success).toBe(false);
    expect(result.message).toBe("File must not exist: PLAN.md");
  });

  it("first excluded file checked (fail-fast on excluded)", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "content", "utf-8");

    const result = validateInputs(tempDir, ["GOAL.md"], ["PLAN.md", "TASK.md"]);

    expect(result.success).toBe(false);
    expect(result.message).toBe("File must not exist: PLAN.md");
  });

  // --- Subdirectory paths ---

  it("required file in subdirectory → success when exists", () => {
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "TASK.md"), "content", "utf-8");

    const result = validateInputs(tempDir, ["S01/TASK.md"]);

    expect(result).toEqual({ success: true });
  });

  it("required file in subdirectory → failure when missing", () => {
    const result = validateInputs(tempDir, ["S01/TASK.md"]);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Required file missing: S01/TASK.md");
  });
});

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

// ---------------------------------------------------------------------------
// validateOutputs — contract-based (CapabilityContract)
// ---------------------------------------------------------------------------

describe("validateOutputs with CapabilityContract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("all output files present → passed: true", () => {
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "PLAN.md" }, { file: "SUMMARY.md" }],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("output file missing → passed: false with missing list", () => {
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "PLAN.md" }, { file: "SUMMARY.md" }],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("SUMMARY.md");
    expect(result.missing.length).toBe(1);
  });

  it("empty outputs array → passed: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("requiredWhen predicate returns false → file skipped", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { file: "PLAN.md" },
        { file: "DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    // stepNumber = 1 → DECISIONS.md not required
    const result = validateOutputs(contract, tempDir, { stepNumber: 1 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("requiredWhen predicate returns true → file required", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { file: "PLAN.md" },
        { file: "DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // DECISIONS.md is missing but requiredWhen returns true for stepNumber = 2

    const result = validateOutputs(contract, tempDir, { stepNumber: 2 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("DECISIONS.md");
  });

  it("requiredWhen predicate returns true and file exists → passes", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { file: "PLAN.md" },
        { file: "DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "DECISIONS.md"), "content", "utf-8");

    const result = validateOutputs(contract, tempDir, { stepNumber: 2 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("OneOfGroup entries treated as no-ops (deferred)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { file: "PLAN.md" },
        { files: [{ file: "APPROVED" }, { file: "REJECTED" }] }, // OneOfGroup
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // Neither APPROVED nor REJECTED exists — should still pass (OneOfGroup is no-op)

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("COMPLETED marker bypass still works with contract", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "PLAN.md" }, { file: "SUMMARY.md" }],
    };

    // COMPLETED exists, but PLAN.md and SUMMARY.md are missing
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("placeholder resolution in output file paths", () => {
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, tempDir, { stepNumber: 3 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("placeholder resolution — file missing with resolved path", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, tempDir, { stepNumber: 3 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S03/TASK.md");
  });
});

// ---------------------------------------------------------------------------
// validateFrontmatter — contract-based (CapabilityContract)
// ---------------------------------------------------------------------------

describe("validateFrontmatter with CapabilityContract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("outputs with schema — valid frontmatter → success", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "PLAN.md", schema }],
    };

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
---
# Plan
`,
      "utf-8",
    );

    const result = validateFrontmatter(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("outputs with schema — missing required field → failure", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "PLAN.md", schema }],
    };

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
---
# Plan
`,
      "utf-8",
    );

    const result = validateFrontmatter(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });

  it("outputs without schema — skipped (no frontmatter validation)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "PLAN.md" }], // no schema
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "just plain text", "utf-8");

    const result = validateFrontmatter(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("empty outputs → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const result = validateFrontmatter(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("mixed outputs — validates only entries with schema", () => {
    const schema = Type.Object({ name: Type.String() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { file: "PLAN.md", schema },
        { file: "SUMMARY.md" }, // no schema — skip
      ],
    };

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
name: test
---
content
`,
      "utf-8",
    );
    // SUMMARY.md doesn't exist — but it has no schema so frontmatter validation skips it

    const result = validateFrontmatter(contract, tempDir);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateInputs — contract-based (CapabilityContract)
// ---------------------------------------------------------------------------

describe("validateInputs with CapabilityContract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("all required inputs exist → success: true", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }, { file: "PLAN.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract);
    expect(result).toEqual({ success: true });
  });

  it("required input missing → failure with file name", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }, { file: "PLAN.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract);
    expect(result.success).toBe(false);
    expect(result.message).toBe("Required file missing: PLAN.md");
  });

  it("excluded file exists → failure with file name", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }],
      excludedFiles: ["PLAN.md"],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract);
    expect(result.success).toBe(false);
    expect(result.message).toBe("File must not exist: PLAN.md");
  });

  it("placeholder resolution in input paths with params", () => {
    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S02", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution — missing resolved file → failure", () => {
    const contract: CapabilityContract = {
      inputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Required file missing: S02/TASK.md");
  });

  it("placeholder resolution in excluded files with params", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "REVISE_PLAN_NEEDED"), "", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }],
      excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, { stepNumber: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toBe("File must not exist: S01/REVISE_PLAN_NEEDED");
  });

  it("empty inputs → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// createFrontmatterValidator — contract-based
// ---------------------------------------------------------------------------

describe("createFrontmatterValidator with CapabilityContract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns a PostValidateCallback function with contract", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };
    const validator = createFrontmatterValidator(contract);
    expect(typeof validator).toBe("function");
  });

  it("callback with valid frontmatter → success: true", () => {
    const schema = Type.Object({ name: Type.String() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "output.md", schema }],
    };
    const validator = createFrontmatterValidator(contract);

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
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ file: "missing.md", schema }],
    };
    const validator = createFrontmatterValidator(contract);

    const result = validator(tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("missing.md");
  });

  it("callback with empty contract outputs → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };
    const validator = createFrontmatterValidator(contract);
    const result = validator(tempDir);
    expect(result).toEqual({ success: true });
  });
});
