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

  it("all output files present → success: true", () => {
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }, { name: "summary", file: "SUMMARY.md" }],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("output file missing → success: false with file name in message", () => {
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }, { name: "summary", file: "SUMMARY.md" }],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("SUMMARY.md");
  });

  it("empty outputs array → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("requiredWhen predicate returns false → file skipped", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "decisions", file: "DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    // stepNumber = 1 → DECISIONS.md not required
    const result = validateOutputs(contract, tempDir, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });

  it("requiredWhen predicate returns true → file required", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "decisions", file: "DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // DECISIONS.md is missing but requiredWhen returns true for stepNumber = 2

    const result = validateOutputs(contract, tempDir, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("DECISIONS.md");
  });

  it("requiredWhen predicate returns true and file exists → passes", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "decisions", file: "DECISIONS.md", requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1 },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "DECISIONS.md"), "content", "utf-8");

    const result = validateOutputs(contract, tempDir, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });

  it("OneOfGroup entries treated as no-ops (deferred)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { files: [{ name: "approved", file: "APPROVED" }, { name: "rejected", file: "REJECTED" }] }, // OneOfGroup
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // Neither APPROVED nor REJECTED exists — should still pass (OneOfGroup is no-op)

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("COMPLETION_SUMMARY.md bypass still works with contract", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }, { name: "summary", file: "SUMMARY.md" }],
    };

    // COMPLETION_SUMMARY.md exists, but PLAN.md and SUMMARY.md are missing
    fs.writeFileSync(path.join(tempDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution in output file paths", () => {
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, tempDir, { stepNumber: 3 });
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution — file missing with resolved path", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, tempDir, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S{stepNumber:02d}/TASK.md");
  });

  // -----------------------------------------------------------------------
  // Output frontmatter validation (Part A — new in Step 6)
  // -----------------------------------------------------------------------

  it("valid output frontmatter → success", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md", schema }],
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

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("invalid output frontmatter (schema mismatch) → failure with field errors", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md", schema }],
    };

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: -5
---
# Plan
`,
      "utf-8",
    );

    const result = validateOutputs(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("totalSteps");
  });

  it("missing frontmatter on output with schema → failure", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md", schema }],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "# Plan\n\nNo frontmatter.", "utf-8");

    const result = validateOutputs(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("no valid YAML frontmatter");
  });

  it("output entry without schema → skip frontmatter validation (existence only)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }], // no schema
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "just plain text", "utf-8");

    const result = validateOutputs(contract, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("collects multiple issues (missing file + frontmatter error) into single message", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md", schema },
        { name: "summary", file: "SUMMARY.md" },
      ],
    };

    // PLAN.md exists but has invalid frontmatter; SUMMARY.md is missing
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: -5
---
# Plan
`,
      "utf-8",
    );
    // SUMMARY.md doesn't exist

    const result = validateOutputs(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("SUMMARY.md");
  });

  it("placeholder resolution works with output frontmatter validation", () => {
    const schema = Type.Object({ decision: Type.String() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema }],
    };

    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S02", "REVIEW.md"),
      `---
decision: APPROVED
---
# Review
`,
      "utf-8",
    );

    const result = validateOutputs(contract, tempDir, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
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
      outputs: [{ name: "plan", file: "PLAN.md", schema }],
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
      outputs: [{ name: "plan", file: "PLAN.md", schema }],
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
      outputs: [{ name: "plan", file: "PLAN.md" }], // no schema
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
        { name: "plan", file: "PLAN.md", schema },
        { name: "summary", file: "SUMMARY.md" }, // no schema — skip
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
      inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract);
    expect(result).toEqual({ success: true });
  });

  it("required input missing → failure with file name", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }],
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
      inputs: [{ name: "goal", file: "GOAL.md" }],
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
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution — missing resolved file → failure", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Required file missing: S{stepNumber:02d}/TASK.md");
  });

  it("placeholder resolution in excluded files with params", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S01", "REVISE_PLAN_NEEDED"), "", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ name: "goal", file: "GOAL.md" }],
      excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
      outputs: [],
    };

    const result = validateInputs(tempDir, contract, { stepNumber: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toBe("File must not exist: S{stepNumber:02d}/REVISE_PLAN_NEEDED");
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
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
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

  // -----------------------------------------------------------------------
  // Input frontmatter validation (Part A — new in Step 6)
  // -----------------------------------------------------------------------

  it("valid input frontmatter → success", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [{ name: "plan", file: "PLAN.md", schema }],
      outputs: [],
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

    const result = validateInputs(tempDir, contract);
    expect(result).toEqual({ success: true });
  });

  it("invalid input frontmatter (schema mismatch) → failure with field errors", () => {
    const schema = Type.Object({ totalSteps: Type.Integer({ minimum: 1 }) });
    const contract: CapabilityContract = {
      inputs: [{ name: "plan", file: "PLAN.md", schema }],
      outputs: [],
    };

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: -5
---
# Plan
`,
      "utf-8",
    );

    const result = validateInputs(tempDir, contract);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("totalSteps");
  });

  it("missing frontmatter (no YAML delimiters) on input with schema → failure", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [{ name: "plan", file: "PLAN.md", schema }],
      outputs: [],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "# Plan\n\nNo frontmatter here.", "utf-8");

    const result = validateInputs(tempDir, contract);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("no valid YAML frontmatter");
  });

  it("input entry without schema → skip frontmatter validation (existence only)", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "plan", file: "PLAN.md" }], // no schema
      outputs: [],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "just plain text", "utf-8");

    const result = validateInputs(tempDir, contract);
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution works with frontmatter validation", () => {
    const schema = Type.Object({ skills: Type.Array(Type.String()) });
    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md", schema }],
      outputs: [],
    };

    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S02", "TASK.md"),
      `---
skills:
  - tdd
---
# Task
`,
      "utf-8",
    );

    const result = validateInputs(tempDir, contract, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution — invalid frontmatter in resolved path → failure", () => {
    const schema = Type.Object({ skills: Type.Array(Type.String()) });
    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md", schema }],
      outputs: [],
    };

    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S03", "TASK.md"),
      `---
skills: not-an-array
---
# Task
`,
      "utf-8",
    );

    const result = validateInputs(tempDir, contract, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S{stepNumber:02d}/TASK.md");
    expect(result.message).toContain("skills");
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
      outputs: [{ name: "output", file: "output.md", schema }],
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
      outputs: [{ name: "missing", file: "missing.md", schema }],
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
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 2
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
---
# Plan
`,
      "utf-8",
    );
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });

  it("invalid PLAN.md frontmatter → failure", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "# Plan\n\nNo frontmatter.", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });

  it("excluded REVISE_PLAN_NEEDED exists → failure", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 2
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
---
# Plan
`,
      "utf-8",
    );
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "REVISE_PLAN_NEEDED"), "", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("REVISE_PLAN_NEEDED");
  });
});

describe("CONTRACT integration — execute-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // CONTRACT uses plain file names — files resolve directly in baseDir
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });

  it("missing TASK.md → failure naming TASK.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // TASK.md is missing
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
  });
});

describe("CONTRACT integration — review-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // CONTRACT uses plain file names — files resolve directly in baseDir
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task", "utf-8");
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });

  it("missing COMPLETED → failure naming COMPLETED", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task", "utf-8");
    // COMPLETED is missing
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("COMPLETED");
  });

  it("missing SUMMARY.md → failure naming SUMMARY.md", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task", "utf-8");
    // SUMMARY.md is missing
    const result = validateInputs(tempDir, CONTRACT, { stepNumber: 1 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("SUMMARY.md");
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

describe("CONTRACT integration — finalize-goal", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete", "utf-8");
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

  it("all outputs present → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });
});

describe("CONTRACT outputs integration — create-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 2
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
---
# Plan
`,
      "utf-8",
    );
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT outputs integration — evolve-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present (step 1, no DECISIONS.md required) → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S01", "TASK.md"),
      `---
skills:
  mandatory:
    - tdd
---
# Task
`,
      "utf-8",
    );
    // stepNumber = 1 → DECISIONS.md not required (requiredWhen returns false)
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });

  it("all outputs present (step 3, DECISIONS.md required) → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S03", "TASK.md"),
      `---
skills:
  mandatory:
    - tdd
---
# Task
`,
      "utf-8",
    );
    fs.writeFileSync(path.join(tempDir, "S03", "DECISIONS.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 3 });
    expect(result).toEqual({ success: true });
  });

  it("missing TASK.md → failure naming S02/TASK.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // S02/TASK.md is missing
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 2 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
  });

  it("missing DECISIONS.md (step > 1) → failure naming S03/DECISIONS.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S03", "TASK.md"),
      `---
skills:
  mandatory:
    - tdd
---
# Task
`,
      "utf-8",
    );
    // S03/DECISIONS.md is missing but required (stepNumber > 1)
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("DECISIONS.md");
  });
});

describe("CONTRACT outputs integration — execute-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // CONTRACT uses plain file names — files resolve directly in baseDir
    fs.writeFileSync(path.join(tempDir, "TEST.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 4 });
    expect(result).toEqual({ success: true });
  });

  it("missing SUMMARY.md → failure naming SUMMARY.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    fs.writeFileSync(path.join(tempDir, "TEST.md"), "content", "utf-8");
    // SUMMARY.md is missing
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 4 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("SUMMARY.md");
  });
});

describe("CONTRACT outputs integration — review-task", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // CONTRACT uses plain file names — files resolve directly in baseDir
    fs.writeFileSync(
      path.join(tempDir, "REVIEW.md"),
      `---
decision: APPROVED
criticalIssues: 0
highIssues: 0
mediumIssues: 0
lowIssues: 0
---
# Review
`,
      "utf-8",
    );
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 5 });
    expect(result).toEqual({ success: true });
  });

  it("missing REVIEW.md → failure naming S05/REVIEW.md", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // S05/REVIEW.md is missing
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 5 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("REVIEW.md");
  });
});

describe("CONTRACT outputs integration — revise-plan", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 2
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
---
# Plan
`,
      "utf-8",
    );
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT outputs integration — finalize-goal", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("empty outputs → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    const result = validateOutputs(CONTRACT, tempDir);
    expect(result).toEqual({ success: true });
  });
});

describe("CONTRACT outputs integration — COMPLETION_SUMMARY.md marker bypass", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("COMPLETION_SUMMARY.md bypasses all output checks (evolve-plan with all outputs missing)", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // COMPLETION_SUMMARY.md exists, but S01/TASK.md is missing
    fs.writeFileSync(path.join(tempDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");
    const result = validateOutputs(CONTRACT, tempDir, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateOutputs — graceful error handling for unresolved placeholders
// ---------------------------------------------------------------------------

describe("validateOutputs — unresolved placeholder handling", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("returns failed result when placeholder key is missing from params (no crash)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    // stepNumber is missing — resolvePaths would throw without try/catch
    const result = validateOutputs(contract, tempDir, { goalName: "test" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unresolved placeholder");
  });

  it("returns failed result when placeholder key is missing (no params at all)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("stepNumber");
  });

  it("passes normally when all placeholders resolved", () => {
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, tempDir, { stepNumber: 3 });
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateFrontmatter — graceful error handling for unresolved placeholders
// ---------------------------------------------------------------------------

describe("validateFrontmatter — unresolved placeholder handling", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("returns failed result when placeholder key is missing from params (no crash)", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema }],
    };

    // stepNumber is missing — resolvePaths would throw without try/catch
    const result = validateFrontmatter(contract, tempDir, { goalName: "test" });
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unresolved placeholder");
  });

  it("returns failed result when placeholder key is missing (no params at all)", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema }],
    };

    const result = validateFrontmatter(contract, tempDir);
    expect(result.success).toBe(false);
    expect(result.message).toContain("stepNumber");
  });

  it("passes normally when all placeholders resolved and frontmatter is valid", () => {
    const schema = Type.Object({ decision: Type.String() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema }],
    };

    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S02", "REVIEW.md"),
      `---\ndecision: APPROVED\n---\n# Review`,
      "utf-8",
    );

    const result = validateFrontmatter(contract, tempDir, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// COMPLETION_SUMMARY.md bypass with workspacePrefix
// ---------------------------------------------------------------------------

describe("validateOutputs — COMPLETION_SUMMARY.md bypass with workspacePrefix", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("COMPLETION_SUMMARY.md bypass works with workspacePrefix set", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    // When workspacePrefix is set, COMPLETION_SUMMARY.md resolves through the prefix
    // (baseDir + workspacePrefix + "/COMPLETION_SUMMARY.md")
    const goalDir = path.join(tempDir, "goals", "test-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "COMPLETION_SUMMARY.md"), "---\nstatus: complete\n---\n# Complete\n", "utf-8");

    // workspacePrefix is set — bypass should still work
    const result = validateOutputs(contract, tempDir, { stepNumber: 1, workspacePrefix: "goals/test-goal" });
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// Auto-derivation of writeAllowlist from contract outputs (setupValidation)
// ---------------------------------------------------------------------------

describe("setupValidation — auto-derived writeAllowlist from contract outputs", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("contract output paths are resolved through resolveContractPath with workspacePrefix", async () => {
    // This tests the resources_discover handler logic indirectly via validateOutputs
    // which uses the same resolveContractPath() mechanism
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "task", file: "S{stepNumber:02d}/TASK.md" },
        { name: "summary", file: "S{stepNumber:02d}/SUMMARY.md" },
      ],
    };

    // Create files in prefixed location
    const goalDir = path.join(tempDir, "goals", "my-goal");
    fs.mkdirSync(path.join(goalDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S01", "TASK.md"), "content", "utf-8");
    fs.writeFileSync(path.join(goalDir, "S01", "SUMMARY.md"), "content", "utf-8");

    // With workspacePrefix, paths resolve under goals/my-goal/
    const result = validateOutputs(contract, tempDir, { stepNumber: 1, workspacePrefix: "goals/my-goal" });
    expect(result).toEqual({ success: true });
  });

  it("root-level contract paths resolve directly from workingDir (bypass prefix)", async () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "overview", file: "/PROJECT/OVERVIEW.md", requiredWhen: () => false },
        { name: "task", file: "TASK.md" },
      ],
    };

    // /PROJECT/OVERVIEW.md resolves directly from baseDir (no prefix)
    fs.mkdirSync(path.join(tempDir, "PROJECT"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "PROJECT", "OVERVIEW.md"), "content", "utf-8");
    // TASK.md resolves through prefix
    const goalDir = path.join(tempDir, "goals", "my-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "TASK.md"), "content", "utf-8");

    const result = validateOutputs(contract, tempDir, { workspacePrefix: "goals/my-goal" });
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateOutputs — stripped workspacePrefix (no duplication)
// After normalization, workspacePrefix is stripped from sessionParams.
// validateOutputs falls back to joining baseDir + contractPath — correct
// because baseDir is already the resolved directory.
// ---------------------------------------------------------------------------

describe("validateOutputs — stripped workspacePrefix (no duplication)", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("resolves step-specific paths with goal-level baseDir when workspacePrefix is absent", () => {
    // Simulate the post-normalization scenario: baseDir is already the resolved
    // goal directory, and workspacePrefix is stripped from params.
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S03", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    // workspacePrefix is absent (stripped) — resolveContractPath falls back to baseDir + contractPath
    const result = validateOutputs(contract, goalDir, { stepNumber: 3 });
    expect(result).toEqual({ success: true });
  });

  it("fails with correct path when workspacePrefix is absent and file is missing", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(goalDir, { recursive: true });

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    // workspacePrefix absent — resolves to goalDir + S03/TASK.md (which doesn't exist)
    const result = validateOutputs(contract, goalDir, { stepNumber: 3 });
    expect(result.success).toBe(false);
    expect(result.message).toContain("S{stepNumber:02d}/TASK.md");
  });

  it("resolves multiple outputs with goal-level baseDir when workspacePrefix is absent", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S01", "TASK.md"), "content", "utf-8");
    fs.writeFileSync(path.join(goalDir, "S01", "SUMMARY.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "task", file: "S{stepNumber:02d}/TASK.md" },
        { name: "summary", file: "S{stepNumber:02d}/SUMMARY.md" },
      ],
    };

    const result = validateOutputs(contract, goalDir, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });

  it("no path duplication: baseDir already includes prefix, no double-join", () => {
    // If path duplication occurred, the resolved path would be:
    // .pio/goals/my-feature/goals/my-feature/S01/TASK.md (WRONG)
    // Instead it should be:
    // .pio/goals/my-feature/S01/TASK.md (CORRECT)
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S01", "TASK.md"), "content", "utf-8");

    // Intentionally do NOT create the double-joined path
    // (if duplication occurred, this test would fail)
    const noDupDir = path.join(goalDir, "goals", "my-feature", "S01");
    expect(fs.existsSync(noDupDir)).toBe(false);

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const result = validateOutputs(contract, goalDir, { stepNumber: 1 });
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateInputs — stripped workspacePrefix (no duplication)
// ---------------------------------------------------------------------------

describe("validateInputs — stripped workspacePrefix (no duplication)", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => cleanup(tempDir));

  it("resolves input paths with goal-level baseDir when workspacePrefix is absent", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ name: "goal", file: "GOAL.md" }, { name: "plan", file: "PLAN.md" }],
      outputs: [],
    };

    const result = validateInputs(goalDir, contract);
    expect(result).toEqual({ success: true });
  });

  it("resolves placeholder input paths with goal-level baseDir when workspacePrefix is absent", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S02"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S02", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const result = validateInputs(goalDir, contract, { stepNumber: 2 });
    expect(result).toEqual({ success: true });
  });
});
