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
