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

  it("unresolved placeholder in input path → failure with descriptive message", () => {
    const contract: CapabilityContract = {
      inputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unresolved placeholder");
    expect(result.message).toContain("stepNumber");
  });

  it("unresolved placeholder in excluded file path → failure with descriptive message", () => {
    const contract: CapabilityContract = {
      inputs: [],
      excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unresolved placeholder");
    expect(result.message).toContain("stepNumber");
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

// ---------------------------------------------------------------------------
// CONTRACT integration tests — real capability contracts through validateInputs()
// These exercise each real CONTRACT to catch typos in file paths, wrong placeholder
// syntax, or missing entries. Each capability gets one "all present → pass" and
// one "one missing → fail with correct name" test.
// ---------------------------------------------------------------------------

describe("CONTRACT integration — create-goal", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present (empty inputs) → success", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result).toEqual({ success: true });
  });
});

describe("CONTRACT integration — create-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    // GOAL.md is missing
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });

  it("excluded PLAN.md exists → failure", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT integration — evolve-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });

  it("excluded REVISE_PLAN_NEEDED exists → failure", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "REVISE_PLAN_NEEDED"), "", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S03/REVISE_PLAN_NEEDED");
  });
});

describe("CONTRACT integration — execute-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S02", "TASK.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });

  it("missing TASK.md → failure naming S02/TASK.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // S02/TASK.md is missing
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S02/TASK.md");
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // GOAL.md is missing — checked first (fail-fast)
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });
});

describe("CONTRACT integration — review-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "S01", "SUMMARY.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });

  it("missing COMPLETED → failure naming S01/COMPLETED", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "SUMMARY.md"), "content", "utf-8");
    // S01/COMPLETED is missing
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S01/COMPLETED");
  });

  it("missing SUMMARY.md → failure naming S01/SUMMARY.md", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "COMPLETED"), "", "utf-8");
    // S01/SUMMARY.md is missing
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S01/SUMMARY.md");
  });
});

describe("CONTRACT integration — revise-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT integration — execute-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/execute-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT integration — finalize-goal", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const result = validateInputs(tempDir, CONTRACT);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

// ---------------------------------------------------------------------------
// CONTRACT integration tests — real capability contracts through validateOutputs()
// These exercise each real CONTRACT's outputs[] to catch typos in file paths,
// wrong placeholder syntax, or incorrect requiredWhen predicates. Each capability
// with outputs gets one "all present → pass" and one "one missing → fail" test.
// ---------------------------------------------------------------------------

describe("CONTRACT outputs integration — create-goal", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("GOAL.md");
  });
});

describe("CONTRACT outputs integration — create-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("PLAN.md");
  });
});

describe("CONTRACT outputs integration — evolve-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present (step 1, no DECISIONS.md required) → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "TASK.md"), "content", "utf-8");
    // stepNumber = 1 → DECISIONS.md not required (requiredWhen returns false)
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 1 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("all outputs present (step 3, DECISIONS.md required) → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "TASK.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "S03", "DECISIONS.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 3 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("missing TASK.md → failure naming S02/TASK.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // S02/TASK.md is missing
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 2 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S02/TASK.md");
  });

  it("missing DECISIONS.md (step > 1) → failure naming S03/DECISIONS.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "TASK.md"), "content", "utf-8");
    // S03/DECISIONS.md is missing but required (stepNumber > 1)
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 3 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S03/DECISIONS.md");
  });
});

describe("CONTRACT outputs integration — execute-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    fs.mkdirSync(path.join(tempDir, "S04"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S04", "TEST.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "S04", "SUMMARY.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 4 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("missing SUMMARY.md → failure naming S04/SUMMARY.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    fs.mkdirSync(path.join(tempDir, "S04"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S04", "TEST.md"), "content", "utf-8");
    // S04/SUMMARY.md is missing
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 4 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S04/SUMMARY.md");
  });
});

describe("CONTRACT outputs integration — review-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.mkdirSync(path.join(tempDir, "S05"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S05", "REVIEW.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 5 });
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("missing REVIEW.md → failure naming S05/REVIEW.md", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // S05/REVIEW.md is missing
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 5 });
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("S05/REVIEW.md");
  });
});

describe("CONTRACT outputs integration — revise-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result.passed).toBe(false);
    expect(result.missing).toContain("PLAN.md");
  });
});

describe("CONTRACT outputs integration — execute-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("empty outputs → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/execute-plan/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });
});

describe("CONTRACT outputs integration — finalize-goal", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("empty outputs → passed: true", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ passed: true, missing: [] });
  });
});

describe("CONTRACT outputs integration — COMPLETED marker bypass", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("COMPLETED marker bypasses all output checks (evolve-plan with all outputs missing)", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // COMPLETED exists, but S01/TASK.md is missing
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 1 });
    expect(result).toEqual({ passed: true, missing: [] });
  });
});
