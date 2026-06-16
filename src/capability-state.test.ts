import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCapState, type FileState } from "./capability-state";
import type { CapabilityContract, MarkdownFileSpec } from "./types";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-capstate-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

/** Minimal contract for testing (no schemas). */
const minimalContract: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }],
  outputs: [{ name: "plan", file: "PLAN.md" }],
};

/** Contract with a schema (uses create-plan schemas). */
const contractWithSchema: CapabilityContract = {
  inputs: [{ name: "goal", file: "GOAL.md" }],
  outputs: [
    {
      name: "plan",
      file: "PLAN.md",
      schema: Type.Object({
        totalSteps: Type.Integer({ minimum: 1 }),
      }),
    },
  ],
};

/** Contract with placeholder paths (no schema — used for existence checks). */
const contractWithPlaceholders: CapabilityContract = {
  inputs: [{ name: "plan", file: "PLAN.md" }],
  outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
};

/** Contract with placeholder paths AND a schema on the placeholder entry. */
const contractWithPlaceholderSchema: CapabilityContract = {
  inputs: [{ name: "plan", file: "PLAN.md" }],
  outputs: [
    {
      name: "task",
      file: "S{stepNumber:02d}/TASK.md",
      schema: Type.Object({
        stepName: Type.String(),
      }),
    },
  ],
};

/** Write a file with YAML frontmatter. */
function writeWithFrontmatter(dir: string, relPath: string, frontmatter: Record<string, unknown>, body: string = ""): void {
  const yaml = require("js-yaml").dump(frontmatter);
  const content = `---\n${yaml}---\n${body}`;
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Tracer bullet — createCapState + exists()
// ---------------------------------------------------------------------------

describe("createCapState — tracer bullet", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns a CapState instance with input() and output() methods", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(typeof capState.input).toBe("function");
    expect(typeof capState.output).toBe("function");
  });

  it("exists() returns true for existing files", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "# Goal", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.input("goal").exists()).toBe(true);
  });

  it("exists() returns false for missing files", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.input("goal").exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FileState.read() — without schema
// ---------------------------------------------------------------------------

describe("FileState.read() — without schema", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns null for non-existent files", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.input("goal").read()).toBe(null);
  });

  it("returns raw frontmatter for files without schema", () => {
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Test Goal", version: 1 });
    const capState = createCapState(minimalContract, tempDir);
    const data = capState.input<{ title: string; version: number }>("goal").read();
    expect(data).toEqual({ title: "Test Goal", version: 1 });
  });

  it("returns null for files with no YAML frontmatter", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "# Just a heading, no frontmatter", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.input("goal").read()).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// FileState.read() — with schema validation
// ---------------------------------------------------------------------------

describe("FileState.read() — with schema validation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns validated/coerced data when frontmatter is valid", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 3 });
    const capState = createCapState(contractWithSchema, tempDir);
    const data = capState.output<{ totalSteps: number }>("plan").read();
    expect(data).toEqual({ totalSteps: 3 });
  });

  it("returns null when frontmatter is missing required fields", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { otherField: "value" });
    const capState = createCapState(contractWithSchema, tempDir);
    expect(capState.output("plan").read()).toBe(null);
  });

  it("returns null when frontmatter fails type constraints", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: "not a number" });
    const capState = createCapState(contractWithSchema, tempDir);
    expect(capState.output("plan").read()).toBe(null);
  });

  it("returns null when frontmatter fails minimum constraint", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 0 });
    const capState = createCapState(contractWithSchema, tempDir);
    expect(capState.output("plan").read()).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// exists() — no caching (lazy disk reads)
// ---------------------------------------------------------------------------

describe("FileState.exists() — no caching", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("reflects file creation between calls", () => {
    const capState = createCapState(minimalContract, tempDir);
    const fileState = capState.input("goal");

    expect(fileState.exists()).toBe(false);

    // Create the file
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "# Goal", "utf-8");

    expect(fileState.exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Undeclared files (marker files)
// ---------------------------------------------------------------------------

describe("Undeclared files (marker files)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("exists() works for undeclared files", () => {
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.undeclared("APPROVED").exists()).toBe(true);
  });

  it("read() returns null for marker files with no frontmatter", () => {
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.undeclared("APPROVED").read()).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Placeholder resolution
// ---------------------------------------------------------------------------

describe("Placeholder resolution", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("resolves placeholder paths in constructor params", () => {
    const capState = createCapState(contractWithPlaceholders, tempDir, { stepNumber: 3 });
    // S{stepNumber:02d}/TASK.md should resolve to S03/TASK.md
    const taskPath = path.join(tempDir, "S03", "TASK.md");
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    fs.writeFileSync(taskPath, "# Task", "utf-8");

    expect(capState.output("task").exists()).toBe(true);
  });

  it("matches resolved contract entries with placeholder query", () => {
    const capState = createCapState(contractWithPlaceholders, tempDir, { stepNumber: 5 });
    const taskPath = path.join(tempDir, "S05", "TASK.md");
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    writeWithFrontmatter(tempDir, "S05/TASK.md", { title: "Task 5" });

    expect(capState.output("task").exists()).toBe(true);
  });

  it("validates against schema on placeholder entry — proving resolution + schema matching", () => {
    // This contract has a schema on S{stepNumber:02d}/TASK.md.
    // If resolution is broken, the file won't match any contract entry,
    // and read() will return raw data (not validated). We verify schema
    // validation is applied — proving the contract entry was matched.
    const capState = createCapState(contractWithPlaceholderSchema, tempDir, { stepNumber: 3 });

    // Valid frontmatter — should pass schema validation
    writeWithFrontmatter(tempDir, "S03/TASK.md", { stepName: "Build feature" });
    const validData = capState.output<{ stepName: string }>("task").read();
    expect(validData).toEqual({ stepName: "Build feature" });

    // Missing required field — should fail schema validation and return null
    writeWithFrontmatter(tempDir, "S03/TASK.md", { otherField: "value" });
    const invalidData = capState.output("task").read();
    expect(invalidData).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Contract inputs and outputs both indexed
// ---------------------------------------------------------------------------

describe("Contract inputs and outputs both indexed", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("input() matches against contract.inputs entries", () => {
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Goal" });
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.input("goal").exists()).toBe(true);
  });

  it("output() matches against contract.outputs entries", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 2 });
    const capState = createCapState(contractWithSchema, tempDir);
    const data = capState.output<{ totalSteps: number }>("plan").read();
    expect(data).toEqual({ totalSteps: 2 });
  });
});

// ---------------------------------------------------------------------------
// createCapState factory
// ---------------------------------------------------------------------------

describe("createCapState factory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns a CapState instance identical to new CapState()", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(typeof capState.input).toBe("function");
    expect(typeof capState.output).toBe("function");
    expect(capState.input("goal").exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// input(name) — lookup by name in contract.inputs
// ---------------------------------------------------------------------------

describe("input(name) — lookup by name in contract.inputs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("tracer bullet — returns FileState for named input", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "goal", file: "GOAL.md" }],
      outputs: [],
    };
    const capState = createCapState(contract, tempDir);
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Test Goal" });
    expect(capState.input("goal").exists()).toBe(true);
  });

  it("resolves placeholders in the file path using session params", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
      outputs: [],
    };
    const capState = createCapState(contract, tempDir, { stepNumber: 3 });
    const taskPath = path.join(tempDir, "S03", "TASK.md");
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    fs.writeFileSync(taskPath, "# Task", "utf-8");
    expect(capState.input("task").exists()).toBe(true);
  });

  it("validates frontmatter against the schema from the named entry", () => {
    const contract: CapabilityContract = {
      inputs: [
        {
          name: "plan",
          file: "PLAN.md",
          schema: Type.Object({
            totalSteps: Type.Integer({ minimum: 1 }),
          }),
        },
      ],
      outputs: [],
    };
    const capState = createCapState(contract, tempDir);

    // Valid frontmatter
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 3 });
    const validData = capState.input<{ totalSteps: number }>("plan").read();
    expect(validData).toEqual({ totalSteps: 3 });

    // Invalid frontmatter — missing required field
    writeWithFrontmatter(tempDir, "PLAN.md", { otherField: "value" });
    expect(capState.input("plan").read()).toBe(null);
  });

  it("throws when the given name is not found in inputs", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(() => capState.input("nonexistent")).toThrow("Input 'nonexistent' not found in contract");
  });

});

// ---------------------------------------------------------------------------
// output(name) — lookup by name in contract.outputs
// ---------------------------------------------------------------------------

describe("output(name) — lookup by name in contract.outputs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns FileState for named output", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }],
    };
    const capState = createCapState(contract, tempDir);
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 2 });
    expect(capState.output("plan").exists()).toBe(true);
  });

  it("resolves placeholders in the file path using session params", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "task", file: "S{stepNumber:02d}/TASK.md" }],
    };
    const capState = createCapState(contract, tempDir, { stepNumber: 5 });
    const taskPath = path.join(tempDir, "S05", "TASK.md");
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    fs.writeFileSync(taskPath, "# Task", "utf-8");
    expect(capState.output("task").exists()).toBe(true);
  });

  it("validates frontmatter against the schema from the named entry", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        {
          name: "plan",
          file: "PLAN.md",
          schema: Type.Object({
            totalSteps: Type.Integer({ minimum: 1 }),
          }),
        },
      ],
    };
    const capState = createCapState(contract, tempDir);

    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 4 });
    const validData = capState.output<{ totalSteps: number }>("plan").read();
    expect(validData).toEqual({ totalSteps: 4 });

    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 0 });
    expect(capState.output("plan").read()).toBe(null);
  });

  it("finds named files inside OneOfGroup entries", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        {
          files: [
            { name: "approved", file: "APPROVED" },
            { name: "rejected", file: "REJECTED" },
          ],
        },
      ],
    };
    const capState = createCapState(contract, tempDir);
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    expect(capState.output("approved").exists()).toBe(true);
    expect(capState.output("rejected").exists()).toBe(false);
  });

  it("throws when the given name is not found in outputs", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [{ name: "plan", file: "PLAN.md" }],
    };
    const capState = createCapState(contract, tempDir);
    expect(() => capState.output("nonexistent")).toThrow("Output 'nonexistent' not found in contract");
  });

});

// ---------------------------------------------------------------------------
// undeclared(path) — marker files not in any contract
// ---------------------------------------------------------------------------

describe("undeclared(path) — marker files not in any contract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns FileState with no schema for marker files", () => {
    const capState = createCapState(minimalContract, tempDir);
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    expect(capState.undeclared("APPROVED").exists()).toBe(true);
  });

  it("works with subdirectory paths", () => {
    const capState = createCapState(minimalContract, tempDir);
    const markerPath = path.join(tempDir, "S03", "REVISE_PLAN_NEEDED");
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, "", "utf-8");
    expect(capState.undeclared("S03/REVISE_PLAN_NEEDED").exists()).toBe(true);
  });

  it("returns false for non-existent marker files", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.undeclared("BLOCKED").exists()).toBe(false);
  });

  it("read() returns null for marker files with no frontmatter", () => {
    const capState = createCapState(minimalContract, tempDir);
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    expect(capState.undeclared("COMPLETED").read()).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Duplicate name detection
// ---------------------------------------------------------------------------

describe("Duplicate name detection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("throws when the same name appears in both inputs and outputs", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "plan", file: "GOAL.md" }],
      outputs: [{ name: "plan", file: "PLAN.md" }],
    };
    expect(() => createCapState(contract, tempDir)).toThrow(
      "Duplicate file name 'plan' in contract. Names must be unique across inputs and outputs.",
    );
  });

  it("throws when the same name appears twice in inputs", () => {
    const contract: CapabilityContract = {
      inputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "plan", file: "PLAN2.md" },
      ],
      outputs: [],
    };
    expect(() => createCapState(contract, tempDir)).toThrow(
      "Duplicate file name 'plan' in contract. Names must be unique across inputs and outputs.",
    );
  });

  it("throws when the same name appears twice in outputs", () => {
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "plan", file: "PLAN.md" },
        { name: "plan", file: "PLAN2.md" },
      ],
    };
    expect(() => createCapState(contract, tempDir)).toThrow(
      "Duplicate file name 'plan' in contract. Names must be unique across inputs and outputs.",
    );
  });

  it("throws when the same name appears in a OneOfGroup and inputs", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "approved", file: "APPROVED" }],
      outputs: [
        {
          files: [{ name: "approved", file: "REJECTED" }],
        },
      ],
    };
    expect(() => createCapState(contract, tempDir)).toThrow(
      "Duplicate file name 'approved' in contract. Names must be unique across inputs and outputs.",
    );
  });

  it("does not throw when names are unique across inputs and outputs", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "goal", file: "GOAL.md" }],
      outputs: [{ name: "plan", file: "PLAN.md" }],
    };
    expect(() => createCapState(contract, tempDir)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// name field enforcement
// ---------------------------------------------------------------------------

describe("name field enforcement", () => {
  it("all contract entries must have name fields (verified by TypeScript)", () => {
    // This compiles only because MarkdownFileSpec.name is required.
    // If any entry omitted name, npx tsc --noEmit would fail.
    const spec: MarkdownFileSpec = { name: "test", file: "TEST.md" };
    expect(spec.name).toBe("test");
    expect(spec.file).toBe("TEST.md");
  });
});

// ---------------------------------------------------------------------------
// Workspace prefix integration
// ---------------------------------------------------------------------------

describe("CapState — workspace prefix integration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  // --- Constructor and factory ---

  it("createCapState accepts 4th workspacePrefix parameter", () => {
    const capState = createCapState(minimalContract, tempDir, undefined, "goals/my-feature");
    expect(typeof capState.input).toBe("function");
    expect(typeof capState.output).toBe("function");
  });

  it("backward compatible — 3 arguments (no prefix) works", () => {
    const capState = createCapState(minimalContract, tempDir);
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Goal" });
    expect(capState.input("goal").exists()).toBe(true);
  });

  // --- Prefixed input() resolution ---

  it("input() with prefix resolves through baseDir + prefix + contractPath", () => {
    // Create file at goals/my-feature/GOAL.md
    writeWithFrontmatter(tempDir, "goals/my-feature/GOAL.md", { title: "Goal" });
    const capState = createCapState(minimalContract, tempDir, undefined, "goals/my-feature");
    expect(capState.input("goal").exists()).toBe(true);
  });

  it("input() with prefix resolves to correct path (not baseDir + file)", () => {
    // File exists at baseDir/GOAL.md but should NOT be found with prefix
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Wrong" });
    const capState = createCapState(minimalContract, tempDir, undefined, "goals/my-feature");
    expect(capState.input("goal").exists()).toBe(false);
  });

  // --- Prefixed output() resolution ---

  it("output() with prefix resolves through baseDir + prefix + contractPath", () => {
    writeWithFrontmatter(tempDir, "goals/my-feature/PLAN.md", { totalSteps: 2 });
    const capState = createCapState(minimalContract, tempDir, undefined, "goals/my-feature");
    expect(capState.output("plan").exists()).toBe(true);
  });

  // --- Root-level paths (leading /) bypass prefix ---

  it("root-level path (leading /) bypasses workspace prefix", () => {
    const contract: CapabilityContract = {
      inputs: [{ name: "overview", file: "/PROJECT/OVERVIEW.md" }],
      outputs: [],
    };
    // File at baseDir/PROJECT/OVERVIEW.md (not under prefix)
    writeWithFrontmatter(tempDir, "PROJECT/OVERVIEW.md", { title: "Project" });
    const capState = createCapState(contract, tempDir, undefined, "goals/my-feature");
    expect(capState.input("overview").exists()).toBe(true);
  });

  // --- Placeholder resolution with prefix ---

  it("placeholder resolution works with prefix", () => {
    // S{stepNumber:02d}/TASK.md with stepNumber=3 and prefix "goals/g"
    // should resolve to goals/g/S03/TASK.md
    writeWithFrontmatter(tempDir, "goals/g/S03/TASK.md", { stepName: "Build" });
    const capState = createCapState(
      contractWithPlaceholderSchema,
      tempDir,
      { stepNumber: 3 },
      "goals/g",
    );
    expect(capState.output("task").exists()).toBe(true);
  });

  // --- Undeclared with prefix ---

  it("undeclared() with prefix resolves through baseDir + prefix + path", () => {
    const markerPath = path.join(tempDir, "goals/my-feature", "S01", "COMPLETED");
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    fs.writeFileSync(markerPath, "", "utf-8");
    const capState = createCapState(minimalContract, tempDir, undefined, "goals/my-feature");
    expect(capState.undeclared("S01/COMPLETED").exists()).toBe(true);
  });

  it("undeclared() without prefix resolves as baseDir + path (backward compatible)", () => {
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.undeclared("APPROVED").exists()).toBe(true);
  });

  // --- Empty string prefix equals no prefix ---

  it("empty string prefix behaves like no prefix", () => {
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Goal" });
    const capState = createCapState(minimalContract, tempDir, undefined, "");
    expect(capState.input("goal").exists()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Concrete test — real create-plan CONTRACT
// ---------------------------------------------------------------------------

describe("Concrete test — real create-plan CONTRACT", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("works with real create-plan CONTRACT", async () => {
    const { CONTRACT } = await import("./capabilities/create-plan/config");
    const capState = createCapState(CONTRACT, tempDir);

    // GOAL.md is an input without schema
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Test Goal" });
    expect(capState.input("goal").exists()).toBe(true);

    // PLAN.md is an output with PLAN_FRONTMATTER_SCHEMA
    const stepsYaml = "  - name: step-one\n    complexity: task";
    const planContent = `---\ntotalSteps: 1\nsteps:\n${stepsYaml}\n---\n# Plan\n\n### Step 1: Step description`;
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), planContent, "utf-8");

    const data = capState.output("plan").read();
    expect(data).not.toBe(null);
    expect((data as any).totalSteps).toBe(1);
    expect((data as any).steps).toEqual([{ name: "step-one", complexity: "task" }]);
  });
});
