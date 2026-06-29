import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { beforeEach, vi } from "vitest";
import { CapState } from "../capability-state";
import type { CapabilityContract } from "../types";
import {
  __testSetFileProtectionState,
  setupValidation,
  validateFrontmatter,
  validateInputs,
  validateOutputs,
} from "./validation";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Construct a CapState for the given contract, dir, and optional params.
 * After normalization, workspacePrefix is stripped from params (undefined).
 */
function makeCapState(
  contract: CapabilityContract,
  dir: string,
  params?: Record<string, unknown>,
): CapState {
  return new CapState(contract, dir, params);
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
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "summary", file: "SUMMARY.md" },
      ],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("output file missing → success: false with file name in message", () => {
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "summary", file: "SUMMARY.md" },
      ],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("SUMMARY.md");
  });

  it("empty outputs array → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("requiredWhen predicate returns false → file skipped", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        {
          name: "decisions",
          file: "DECISIONS.md",
          requiredWhen: (params) =>
            typeof params?.stepNumber === "number" && params.stepNumber > 1,
        },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");

    // stepNumber = 1 → DECISIONS.md not required
    const capState = makeCapState(contract, tempDir, { stepNumber: 1 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("requiredWhen predicate returns true → file required", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        {
          name: "decisions",
          file: "DECISIONS.md",
          requiredWhen: (params) =>
            typeof params?.stepNumber === "number" && params.stepNumber > 1,
        },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // DECISIONS.md is missing but requiredWhen returns true for stepNumber = 2

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("DECISIONS.md");
  });

  it("requiredWhen predicate returns true and file exists → passes", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        {
          name: "decisions",
          file: "DECISIONS.md",
          requiredWhen: (params) =>
            typeof params?.stepNumber === "number" && params.stepNumber > 1,
        },
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "DECISIONS.md"), "content", "utf-8");

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("OneOfGroup entries treated as no-ops (deferred)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        {
          files: [
            { name: "approved", file: "APPROVED" },
            { name: "rejected", file: "REJECTED" },
          ],
        }, // OneOfGroup
      ],
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    // Neither APPROVED nor REJECTED exists — should still pass (OneOfGroup is no-op)

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("COMPLETION_SUMMARY.md is not required when not declared in contract", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "summary", file: "SUMMARY.md" },
      ],
    };

    // COMPLETION_SUMMARY.md exists but is NOT declared in the contract
    // Validation should proceed normally — checking only declared outputs
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );
    // PLAN.md and SUMMARY.md are missing — validation should fail

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("SUMMARY.md");
  });

  it("placeholder resolution in output file paths", () => {
    fs.mkdirSync(path.join(tempDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "S03", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const capState = makeCapState(contract, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution — file missing with resolved path", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const capState = makeCapState(contract, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
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

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      "# Plan\n\nNo frontmatter.",
      "utf-8",
    );

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
    expect(result.message).toContain("SUMMARY.md");
  });

  it("placeholder resolution works with output frontmatter validation", () => {
    const schema = Type.Object({ decision: Type.String() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema },
      ],
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

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateFrontmatter(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateFrontmatter(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });

  it("outputs without schema — skipped (no frontmatter validation)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }], // no schema
    };

    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "just plain text", "utf-8");

    const capState = makeCapState(contract, tempDir);
    const result = validateFrontmatter(capState);
    expect(result).toEqual({ success: true });
  });

  it("empty outputs → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateFrontmatter(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateFrontmatter(capState);
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
      inputs: [
        { name: "goal", file: "GOAL.md" },
        { name: "plan", file: "PLAN.md" },
      ],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("required input missing → failure with file name", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [
        { name: "goal", file: "GOAL.md" },
        { name: "plan", file: "PLAN.md" },
      ],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("placeholder resolution — missing resolved file → failure", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "Required file missing: S{stepNumber:02d}/TASK.md",
    );
  });

  it("placeholder resolution in excluded files with params", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.mkdirSync(path.join(tempDir, "S01"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S01", "REVISE_PLAN_NEEDED"),
      "",
      "utf-8",
    );

    const contract: CapabilityContract = {
      inputs: [{ name: "goal", file: "GOAL.md" }],
      excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir, { stepNumber: 1 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "File must not exist: S{stepNumber:02d}/REVISE_PLAN_NEEDED",
    );
  });

  it("empty inputs → success: true", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("unresolved placeholder in input path → failure with descriptive message", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const capState = makeCapState(contract, tempDir, {});
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir, {});
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
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

    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      "# Plan\n\nNo frontmatter here.",
      "utf-8",
    );

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir);
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateInputs(capState);
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

    const capState = makeCapState(contract, tempDir, { stepNumber: 3 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("S{stepNumber:02d}/TASK.md");
    expect(result.message).toContain("skills");
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

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all inputs present (empty inputs) → success", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });
});

describe("CONTRACT integration — create-plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    // GOAL.md is missing
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });

  it("excluded PLAN.md exists → failure", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT integration — evolve-plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
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
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });

  it("invalid PLAN.md frontmatter → failure", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      "# Plan\n\nNo frontmatter.",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateInputs(capState);
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
    fs.writeFileSync(
      path.join(tempDir, "S03", "REVISE_PLAN_NEEDED"),
      "",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("REVISE_PLAN_NEEDED");
  });
});

describe("CONTRACT integration — execute-task", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // CONTRACT uses plain file names — files resolve directly in workspaceDir
    fs.writeFileSync(
      path.join(tempDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 2 });
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing TASK.md → failure naming TASK.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // TASK.md is missing
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 2 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
  });
});

describe("CONTRACT integration — review-task", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // CONTRACT uses plain file names — files resolve directly in workspaceDir
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 1 });
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing COMPLETED → failure naming COMPLETED", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );
    // COMPLETED is missing
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 1 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("COMPLETED");
  });

  it("missing SUMMARY.md → failure naming SUMMARY.md", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "TASK.md"),
      "---\nskills:\n  mandatory:\n    - tdd\n---\n# Task",
      "utf-8",
    );
    // SUMMARY.md is missing
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 1 });
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("SUMMARY.md");
  });
});

describe("CONTRACT integration — revise-plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT integration — finalize-goal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all inputs present → success", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateInputs(capState);
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

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "content", "utf-8");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing GOAL.md → failure naming GOAL.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-goal/config");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("GOAL.md");
  });
});

describe("CONTRACT outputs integration — create-plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
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
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/create-plan/config");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT outputs integration — evolve-plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all outputs present (step 1, no DECISIONS.md required) → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // Create PLAN.md with totalSteps: 3
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
  - name: step-3
    complexity: task
---
# Plan
`,
      "utf-8",
    );
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
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 1 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("all outputs present (step 3, DECISIONS.md required) → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // Create PLAN.md with totalSteps: 3
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
  - name: step-3
    complexity: task
---
# Plan
`,
      "utf-8",
    );
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
    fs.writeFileSync(
      path.join(tempDir, "S03", "DECISIONS.md"),
      "content",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing TASK.md → failure naming S02/TASK.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // Create PLAN.md with totalSteps: 3
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
  - name: step-3
    complexity: task
---
# Plan
`,
      "utf-8",
    );
    // S02/TASK.md is missing
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 2 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("TASK.md");
  });

  it("missing DECISIONS.md (step > 1) → failure naming S03/DECISIONS.md", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // Create PLAN.md with totalSteps: 3
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---
totalSteps: 3
steps:
  - name: step-1
    complexity: task
  - name: step-2
    complexity: task
  - name: step-3
    complexity: task
---
# Plan
`,
      "utf-8",
    );
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
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("DECISIONS.md");
  });
});

describe("CONTRACT outputs integration — execute-task", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    // CONTRACT uses plain file names — files resolve directly in workspaceDir
    fs.writeFileSync(path.join(tempDir, "TEST.md"), "content", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\ncontent",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 4 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing SUMMARY.md → failure naming SUMMARY.md", async () => {
    const { CONTRACT } = await import("../capabilities/execute-task/config");
    fs.writeFileSync(path.join(tempDir, "TEST.md"), "content", "utf-8");
    // SUMMARY.md is missing
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 4 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("SUMMARY.md");
  });
});

describe("CONTRACT outputs integration — review-task", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("all outputs present → success: true (plain file names)", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // CONTRACT uses plain file names — files resolve directly in workspaceDir
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
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 5 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing REVIEW.md → failure naming S05/REVIEW.md", async () => {
    const { CONTRACT } = await import("../capabilities/review-task/config");
    // S05/REVIEW.md is missing
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 5 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("REVIEW.md");
  });
});

describe("CONTRACT outputs integration — revise-plan", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
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
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("missing PLAN.md → failure naming PLAN.md", async () => {
    const { CONTRACT } = await import("../capabilities/revise-plan/config");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("PLAN.md");
  });
});

describe("CONTRACT outputs integration — finalize-goal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("empty outputs → success: true", async () => {
    const { CONTRACT } = await import("../capabilities/finalize-goal/config");
    const capState = makeCapState(CONTRACT, tempDir);
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});

describe("CONTRACT outputs integration — COMPLETION_SUMMARY.md via contract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("COMPLETION_SUMMARY.md is required when stepNumber > totalSteps (evolve-plan)", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");
    // Create PLAN.md with totalSteps: 2
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(tempDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );
    // stepNumber: 3 > totalSteps: 2 → only COMPLETION_SUMMARY.md required
    fs.writeFileSync(
      path.join(tempDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );
    const capState = makeCapState(CONTRACT, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateOutputs — graceful error handling for unresolved placeholders
// ---------------------------------------------------------------------------

describe("validateOutputs — unresolved placeholder handling", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("returns failed result when placeholder key is missing from params (no crash)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    // stepNumber is missing — resolvePaths would throw without try/catch
    const capState = makeCapState(contract, tempDir, { goalName: "test" });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unresolved placeholder");
  });

  it("returns failed result when placeholder key is missing (no params at all)", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateOutputs(capState);
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

    const capState = makeCapState(contract, tempDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateFrontmatter — graceful error handling for unresolved placeholders
// ---------------------------------------------------------------------------

describe("validateFrontmatter — unresolved placeholder handling", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("returns failed result when placeholder key is missing from params (no crash)", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema },
      ],
    };

    // stepNumber is missing — resolvePaths would throw without try/catch
    const capState = makeCapState(contract, tempDir, { goalName: "test" });
    const result = validateFrontmatter(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unresolved placeholder");
  });

  it("returns failed result when placeholder key is missing (no params at all)", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema },
      ],
    };

    const capState = makeCapState(contract, tempDir);
    const result = validateFrontmatter(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("stepNumber");
  });

  it("passes normally when all placeholders resolved and frontmatter is valid", () => {
    const schema = Type.Object({ decision: Type.String() });
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "review", file: "S{stepNumber:02d}/REVIEW.md", schema },
      ],
    };

    fs.mkdirSync(path.join(tempDir, "S02"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "S02", "REVIEW.md"),
      `---\ndecision: APPROVED\n---\n# Review`,
      "utf-8",
    );

    const capState = makeCapState(contract, tempDir, { stepNumber: 2 });
    const result = validateFrontmatter(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// COMPLETION_SUMMARY.md validation with workspacePrefix
// ---------------------------------------------------------------------------

describe("validateOutputs — COMPLETION_SUMMARY.md with workspacePrefix", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("COMPLETION_SUMMARY.md validation works with workspacePrefix set (evolve-plan)", async () => {
    const { CONTRACT } = await import("../capabilities/evolve-plan/config");

    // When workspacePrefix is set, COMPLETION_SUMMARY.md resolves through the prefix
    // (baseDir + workspacePrefix + "/COMPLETION_SUMMARY.md")
    const goalDir = path.join(tempDir, "goals", "test-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    // Create PLAN.md with totalSteps: 2
    const stepsYaml = `  - name: step-1\n    complexity: task\n  - name: step-2\n    complexity: task`;
    fs.writeFileSync(
      path.join(goalDir, "PLAN.md"),
      `---\ntotalSteps: 2\nsteps:\n${stepsYaml}\n---\n# Plan\n`,
      "utf-8",
    );

    // stepNumber: 3 > totalSteps: 2 → only COMPLETION_SUMMARY.md required
    fs.writeFileSync(
      path.join(goalDir, "COMPLETION_SUMMARY.md"),
      "---\nstatus: complete\n---\n# Complete\n",
      "utf-8",
    );

    // workspacePrefix is set — contract validation should work
    const capState = new CapState(
      CONTRACT,
      tempDir,
      { stepNumber: 3 },
      "goals/test-goal",
    );
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// Auto-derivation of writeAllowlist from contract outputs (setupValidation)
// ---------------------------------------------------------------------------

describe("setupValidation — auto-derived writeAllowlist from contract outputs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("contract output paths are resolved through CapState with workspacePrefix", async () => {
    // This tests the resources_discover handler logic indirectly via validateOutputs
    // which uses the same CapState.resolvePath() mechanism
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
    fs.writeFileSync(
      path.join(goalDir, "S01", "SUMMARY.md"),
      "content",
      "utf-8",
    );

    // With workspacePrefix, paths resolve under goals/my-goal/
    const capState = new CapState(
      contract,
      tempDir,
      { stepNumber: 1 },
      "goals/my-goal",
    );
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateOutputs — stripped workspacePrefix (no duplication)
// After normalization, workspacePrefix is stripped from sessionParams.
// validateOutputs falls back to joining workspaceDir + contractPath — correct
// because workspaceDir is already the resolved directory.
// ---------------------------------------------------------------------------

describe("validateOutputs — stripped workspacePrefix (no duplication)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("resolves step-specific paths with goal-level workspaceDir when workspacePrefix is absent", () => {
    // Simulate the post-normalization scenario: workspaceDir is already the resolved
    // goal directory, and workspacePrefix is stripped from params.
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S03"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S03", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };

    // workspacePrefix is absent (stripped) — resolveContractPath falls back to workspaceDir + contractPath
    const capState = makeCapState(contract, goalDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
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
    const capState = makeCapState(contract, goalDir, { stepNumber: 3 });
    const result = validateOutputs(capState);
    expect(result.success).toBe(false);
    expect(result.message).toContain("S{stepNumber:02d}/TASK.md");
  });

  it("resolves multiple outputs with goal-level workspaceDir when workspacePrefix is absent", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S01"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S01", "TASK.md"), "content", "utf-8");
    fs.writeFileSync(
      path.join(goalDir, "S01", "SUMMARY.md"),
      "content",
      "utf-8",
    );

    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "task", file: "S{stepNumber:02d}/TASK.md" },
        { name: "summary", file: "S{stepNumber:02d}/SUMMARY.md" },
      ],
    };

    const capState = makeCapState(contract, goalDir, { stepNumber: 1 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("no path duplication: workspaceDir already includes prefix, no double-join", () => {
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

    const capState = makeCapState(contract, goalDir, { stepNumber: 1 });
    const result = validateOutputs(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// validateInputs — stripped workspacePrefix (no duplication)
// ---------------------------------------------------------------------------

describe("validateInputs — stripped workspacePrefix (no duplication)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });
  afterEach(() => cleanup(tempDir));

  it("resolves input paths with goal-level workspaceDir when workspacePrefix is absent", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(goalDir, { recursive: true });
    fs.writeFileSync(path.join(goalDir, "GOAL.md"), "content", "utf-8");
    fs.writeFileSync(path.join(goalDir, "PLAN.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [
        { name: "goal", file: "GOAL.md" },
        { name: "plan", file: "PLAN.md" },
      ],
      outputs: [],
    };

    const capState = makeCapState(contract, goalDir);
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });

  it("resolves placeholder input paths with goal-level workspaceDir when workspacePrefix is absent", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "my-feature");
    fs.mkdirSync(path.join(goalDir, "S02"), { recursive: true });
    fs.writeFileSync(path.join(goalDir, "S02", "TASK.md"), "content", "utf-8");

    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };

    const capState = makeCapState(contract, goalDir, { stepNumber: 2 });
    const result = validateInputs(capState);
    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// tool_call handler — allowProjectWrites boundary check
// ---------------------------------------------------------------------------

// Mock resolveCapabilityConfig so getSessionConfig() returns a full config
// vi.mock replaces ALL exports — we must also re-export resolveContractPath
const mockResolveCapabilityConfig2 = vi.hoisted(() => vi.fn());

vi.mock("../capability-config", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../capability-config")>();
  return {
    ...original,
    resolveCapabilityConfig: mockResolveCapabilityConfig2,
  };
});

beforeEach(() => {
  mockResolveCapabilityConfig2.mockClear();
});

describe("tool_call handler — allowProjectWrites boundary", () => {
  const projectRoot = "/home/user/my-project";

  beforeEach(() => {
    // Reset state before each test
    __testSetFileProtectionState({
      isActivePioSession: false,
      allowProjectWrites: false,
      projectRoot: undefined,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });
  });

  function getHandler(): (...args: unknown[]) => unknown {
    const { pi, handlers } = createMockPiForToolCall();
    setupValidation(pi);
    const toolCallHandlers = handlers.get("tool_call");
    expect(toolCallHandlers).toBeDefined();
    return toolCallHandlers![0];
  }

  it("allows writes within project root when allowProjectWrites is true", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/index.ts" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeUndefined();
  });

  it("blocks writes outside project root even when allowProjectWrites is true", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/home/user/data.txt" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeDefined();
    expect((result as any).block).toBe(true);
  });

  it("blocks writes to /etc/ even when allowProjectWrites is true", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/etc/passwd" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeDefined();
    expect((result as any).block).toBe(true);
  });

  it("blocks all project writes when allowProjectWrites is false", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: false,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/index.ts" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeDefined();
    expect((result as any).block).toBe(true);
  });

  it("blocks writes to .pio/ paths even when allowProjectWrites is true", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/.pio/goals/test/GOAL.md" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeDefined();
    expect((result as any).block).toBe(true);
  });

  it("allows writes to contract output files on allowlist", async () => {
    const contractPath = "/home/user/my-project/.pio/goals/test/S01/TASK.md";
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [contractPath],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: contractPath },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeUndefined();
  });

  it("allows /tmp/ writes regardless of allowProjectWrites", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: false,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/tmp/scratch.txt" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeUndefined();
  });

  it("blocks writes to sibling project when allowProjectWrites is true", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/home/user/other-project/src/index.ts" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeDefined();
    expect((result as any).block).toBe(true);
  });

  it("allows writes at project root subdirectory boundary", async () => {
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: true,
      projectRoot,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });

    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/package.json" },
    };

    const handler = getHandler();
    const result = await handler(event);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resources_discover handler — state reset on null config
// ---------------------------------------------------------------------------

describe("resources_discover handler — state reset", () => {
  beforeEach(() => {
    mockResolveCapabilityConfig2.mockClear();
    // Reset state to clean defaults before each test
    __testSetFileProtectionState({
      isActivePioSession: false,
      allowProjectWrites: false,
      projectRoot: undefined,
      writeAllowlistPaths: [],
      readOnlyFilePaths: [],
    });
  });

  function createMockCtx(
    entries: Array<{ type: string; customType?: string; data?: unknown }> = [],
  ) {
    return {
      cwd: "/home/user/my-project",
      sessionManager: {
        getEntries: () => entries,
      },
    } as any;
  }

  it("allows writes in a regular session (no pio-config, isActivePioSession=false)", async () => {
    // Arrange: create mock pi and register handlers
    const { pi, handlers } = createMockPiForToolCall();
    setupValidation(pi);

    const resourcesDiscoverHandlers = handlers.get("resources_discover");
    expect(resourcesDiscoverHandlers).toBeDefined();
    const resourcesDiscoverHandler = resourcesDiscoverHandlers![0];

    const toolCallHandlers = handlers.get("tool_call");
    expect(toolCallHandlers).toBeDefined();
    const toolCallHandler = toolCallHandlers![0];

    // Trigger resources_discover with no pio-config entry
    // This sets isActivePioSession = false and resets all state
    const ctx = createMockCtx([]);
    await resourcesDiscoverHandler({} as any, ctx);

    // Assert: a regular session write should NOT be blocked
    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/index.ts" },
    };

    const result = await toolCallHandler(event);
    expect(result).toBeUndefined();
  });

  it("clears stale state and allows writes when getSessionConfig returns null", async () => {
    const { pi, handlers } = createMockPiForToolCall();
    setupValidation(pi);

    const resourcesDiscoverHandlers = handlers.get("resources_discover");
    const resourcesDiscoverHandler = resourcesDiscoverHandlers![0];
    const toolCallHandlers = handlers.get("tool_call");
    const toolCallHandler = toolCallHandlers![0];

    // Inject stale state: simulates a previous sub-session's restrictions still active
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: false,
      projectRoot: "/home/user/my-project",
      writeAllowlistPaths: ["/some/old/contract/file.md"],
      readOnlyFilePaths: ["/some/old/read-only/file.md"],
    });

    // Act: trigger resources_discover with a context that has no pio-config entry
    const ctx = createMockCtx([]);
    await resourcesDiscoverHandler({} as any, ctx);

    // Assert: isActivePioSession is now false — tool_call handler should pass through
    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/index.ts" },
    };

    const result = await toolCallHandler(event);
    expect(result).toBeUndefined();
  });

  it("clears stale read-only blocklist when config is null", async () => {
    const { pi, handlers } = createMockPiForToolCall();
    setupValidation(pi);

    const resourcesDiscoverHandlers = handlers.get("resources_discover");
    const resourcesDiscoverHandler = resourcesDiscoverHandlers![0];
    const toolCallHandlers = handlers.get("tool_call");
    const toolCallHandler = toolCallHandlers![0];

    // Inject stale state with a read-only file
    __testSetFileProtectionState({
      isActivePioSession: true,
      allowProjectWrites: false,
      projectRoot: "/home/user/my-project",
      writeAllowlistPaths: [],
      readOnlyFilePaths: ["/home/user/my-project/src/old-guarded.ts"],
    });

    // Trigger reset
    const ctx = createMockCtx([]);
    await resourcesDiscoverHandler({} as any, ctx);

    // After reset: isActivePioSession is false — tool_call passes through
    const readOnlyEvent = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/old-guarded.ts" },
    };

    const result = await toolCallHandler(readOnlyEvent);
    expect(result).toBeUndefined();
  });

  it("populates state from config when config is present", async () => {
    const { pi, handlers } = createMockPiForToolCall();
    setupValidation(pi);

    const resourcesDiscoverHandlers = handlers.get("resources_discover");
    const resourcesDiscoverHandler = resourcesDiscoverHandlers![0];
    const toolCallHandlers = handlers.get("tool_call");
    const toolCallHandler = toolCallHandlers![0];

    // Mock resolveCapabilityConfig to return a valid config
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "TASK.md" }],
    };

    mockResolveCapabilityConfig2.mockResolvedValue({
      capability: "test-capability",
      workspaceDir: "/home/user/my-project/.pio/goals/test-goal",
      contract,
      sessionParams: {},
      readOnlyFiles: ["GOAL.md"],
      writeAllowlist: [],
      allowProjectWrites: true,
    });

    // Context with pio-config entry containing capability
    const ctx = createMockCtx([
      {
        type: "custom",
        customType: "pio-config",
        data: { capability: "test-capability", sessionParams: {} },
      },
    ]);

    await resourcesDiscoverHandler({} as any, ctx);

    // State should be populated — project writes should be allowed
    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/index.ts" },
    };

    const result = await toolCallHandler(event);
    expect(result).toBeUndefined();
  });

  it("blocks writes outside allowlist when isActivePioSession is true and allowProjectWrites is false", async () => {
    const { pi, handlers } = createMockPiForToolCall();
    setupValidation(pi);

    const resourcesDiscoverHandlers = handlers.get("resources_discover");
    const resourcesDiscoverHandler = resourcesDiscoverHandlers![0];
    const toolCallHandlers = handlers.get("tool_call");
    const toolCallHandler = toolCallHandlers![0];

    // Mock resolveCapabilityConfig to return a config with allowProjectWrites: false
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "TASK.md" }],
    };

    mockResolveCapabilityConfig2.mockResolvedValue({
      capability: "test-capability",
      workspaceDir: "/home/user/my-project/.pio/goals/test-goal",
      contract,
      sessionParams: {},
      readOnlyFiles: [],
      writeAllowlist: [],
      allowProjectWrites: false,
    });

    const ctx = createMockCtx([
      {
        type: "custom",
        customType: "pio-config",
        data: { capability: "test-capability", sessionParams: {} },
      },
    ]);

    await resourcesDiscoverHandler({} as any, ctx);

    // Project writes should be blocked (allowProjectWrites=false, not on allowlist)
    const event = {
      toolName: "write",
      input: { path: "/home/user/my-project/src/index.ts" },
    };

    const result = await toolCallHandler(event);
    expect(result).toBeDefined();
    expect((result as any).block).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helpers for tool_call handler tests
// ---------------------------------------------------------------------------

function createMockPiForToolCall(): {
  pi: any;
  handlers: Map<string, Array<(...args: unknown[]) => unknown>>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();

  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;

  return { pi, handlers };
}
