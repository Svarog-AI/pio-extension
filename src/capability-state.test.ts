import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCapState, type FileState } from "./capability-state";
import type { CapabilityContract } from "./types";
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
  inputs: [{ file: "GOAL.md" }],
  outputs: [{ file: "PLAN.md" }],
};

/** Contract with a schema (uses create-plan schemas). */
const contractWithSchema: CapabilityContract = {
  inputs: [{ file: "GOAL.md" }],
  outputs: [
    {
      file: "PLAN.md",
      schema: Type.Object({
        totalSteps: Type.Integer({ minimum: 1 }),
      }),
    },
  ],
};

/** Contract with placeholder paths. */
const contractWithPlaceholders: CapabilityContract = {
  inputs: [{ file: "PLAN.md" }],
  outputs: [{ file: "S{stepNumber:02d}/TASK.md" }],
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

  it("returns a CapState instance with file() method", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(typeof capState.file).toBe("function");
  });

  it("exists() returns true for existing files", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "# Goal", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.file("GOAL.md").exists()).toBe(true);
  });

  it("exists() returns false for missing files", () => {
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.file("GOAL.md").exists()).toBe(false);
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
    expect(capState.file("GOAL.md").read()).toBe(null);
  });

  it("returns raw frontmatter for files without schema", () => {
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Test Goal", version: 1 });
    const capState = createCapState(minimalContract, tempDir);
    const data = capState.file<{ title: string; version: number }>("GOAL.md").read();
    expect(data).toEqual({ title: "Test Goal", version: 1 });
  });

  it("returns null for files with no YAML frontmatter", () => {
    fs.writeFileSync(path.join(tempDir, "GOAL.md"), "# Just a heading, no frontmatter", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.file("GOAL.md").read()).toBe(null);
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
    const data = capState.file<{ totalSteps: number }>("PLAN.md").read();
    expect(data).toEqual({ totalSteps: 3 });
  });

  it("returns null when frontmatter is missing required fields", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { otherField: "value" });
    const capState = createCapState(contractWithSchema, tempDir);
    expect(capState.file("PLAN.md").read()).toBe(null);
  });

  it("returns null when frontmatter fails type constraints", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: "not a number" });
    const capState = createCapState(contractWithSchema, tempDir);
    expect(capState.file("PLAN.md").read()).toBe(null);
  });

  it("returns null when frontmatter fails minimum constraint", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 0 });
    const capState = createCapState(contractWithSchema, tempDir);
    expect(capState.file("PLAN.md").read()).toBe(null);
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
    const fileState = capState.file("GOAL.md");

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
    expect(capState.file("APPROVED").exists()).toBe(true);
  });

  it("read() returns null for marker files with no frontmatter", () => {
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.file("APPROVED").read()).toBe(null);
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

    expect(capState.file("S03/TASK.md").exists()).toBe(true);
  });

  it("matches resolved contract entries with placeholder query", () => {
    const capState = createCapState(contractWithPlaceholders, tempDir, { stepNumber: 5 });
    const taskPath = path.join(tempDir, "S05", "TASK.md");
    fs.mkdirSync(path.dirname(taskPath), { recursive: true });
    writeWithFrontmatter(tempDir, "S05/TASK.md", { title: "Task 5" });

    expect(capState.file("S05/TASK.md").exists()).toBe(true);
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

  it("file() matches against contract.inputs entries", () => {
    writeWithFrontmatter(tempDir, "GOAL.md", { title: "Goal" });
    const capState = createCapState(minimalContract, tempDir);
    expect(capState.file("GOAL.md").exists()).toBe(true);
  });

  it("file() matches against contract.outputs entries", () => {
    writeWithFrontmatter(tempDir, "PLAN.md", { totalSteps: 2 });
    const capState = createCapState(contractWithSchema, tempDir);
    const data = capState.file<{ totalSteps: number }>("PLAN.md").read();
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
    expect(typeof capState.file).toBe("function");
    expect(capState.file("GOAL.md").exists()).toBe(false);
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
    expect(capState.file("GOAL.md").exists()).toBe(true);

    // PLAN.md is an output with PLAN_FRONTMATTER_SCHEMA
    const stepsYaml = "  - name: step-one\n    complexity: task";
    const planContent = `---\ntotalSteps: 1\nsteps:\n${stepsYaml}\n---\n# Plan\n\n### Step 1: Step description`;
    fs.writeFileSync(path.join(tempDir, "PLAN.md"), planContent, "utf-8");

    const data = capState.file("PLAN.md").read();
    expect(data).not.toBe(null);
    expect((data as any).totalSteps).toBe(1);
    expect((data as any).steps).toEqual([{ name: "step-one", complexity: "task" }]);
  });
});
