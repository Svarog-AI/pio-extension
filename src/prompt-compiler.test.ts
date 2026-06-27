import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilitySkills, WorkflowStep } from "./capability-package";

// ---------------------------------------------------------------------------
// renderWorkflowSection (pure function — no filesystem)
// ---------------------------------------------------------------------------

describe("renderWorkflowSection", () => {
  // Lazy import to avoid circular deps during test setup
  let renderWorkflowSection: (steps: WorkflowStep[]) => string;

  beforeEach(async () => {
    const mod = await import("./prompt-compiler");
    renderWorkflowSection = mod.renderWorkflowSection;
  });

  it("returns empty string for empty array", () => {
    expect(renderWorkflowSection([])).toBe("");
  });

  it("renders a single step without skills", () => {
    const steps: WorkflowStep[] = [
      {
        id: "step-1",
        title: "Understand the goal",
        instructions: "Read GOAL.md and internalize the current state.",
      },
    ];

    const result = renderWorkflowSection(steps);

    expect(result).toContain("### Step 1: Understand the goal");
    expect(result).toContain("Read GOAL.md and internalize the current state.");
    expect(result).not.toContain("Skills:");
  });

  it("renders a step with mandatory skills", () => {
    const steps: WorkflowStep[] = [
      {
        id: "step-1",
        title: "Implement feature",
        instructions: "Write the code.",
        skills: { mandatory: ["tdd", "pio-git"] },
      },
    ];

    const result = renderWorkflowSection(steps);

    expect(result).toContain("### Step 1: Implement feature");
    expect(result).toContain("Skills: [tdd], [pio-git]");
    expect(result).toContain("Write the code.");
  });

  it("renders multiple steps with mixed skill declarations", () => {
    const steps: WorkflowStep[] = [
      {
        id: "step-1",
        title: "Research",
        instructions: "Look at the codebase.",
        skills: { mandatory: ["source-research"] },
      },
      {
        id: "step-2",
        title: "Implement",
        instructions: "Write tests first.",
      },
      {
        id: "step-3",
        title: "Commit",
        instructions: "Commit changes.",
        skills: { mandatory: ["pio-git"] },
      },
    ];

    const result = renderWorkflowSection(steps);

    expect(result).toContain("### Step 1: Research");
    expect(result).toContain("Skills: [source-research]");
    expect(result).toContain("### Step 2: Implement");
    // Step 2 has no skills — no Skills line
    const step2Section = result
      .split("### Step 2: Implement")[1]
      ?.split("### Step 3")[0]!;
    expect(step2Section).not.toContain("Skills:");
    expect(result).toContain("### Step 3: Commit");
    expect(result).toContain("Skills: [pio-git]");
  });

  it("renders step with both mandatory and recommended skills (only mandatory shown)", () => {
    const steps: WorkflowStep[] = [
      {
        id: "step-1",
        title: "Build",
        instructions: "Do it.",
        skills: {
          mandatory: ["tdd"],
          recommended: [{ name: "pio-git", condition: "when committing" }],
        },
      },
    ];

    const result = renderWorkflowSection(steps);

    expect(result).toContain("Skills: [tdd]");
    expect(result).not.toContain("pio-git"); // recommended not shown in Skills line
  });

  it("renders step with empty mandatory skills array (no Skills line)", () => {
    const steps: WorkflowStep[] = [
      {
        id: "step-1",
        title: "Simple step",
        instructions: "Just do it.",
        skills: { mandatory: [] },
      },
    ];

    const result = renderWorkflowSection(steps);

    expect(result).not.toContain("Skills:");
  });

  it("renders steps with multiline instructions", () => {
    const steps: WorkflowStep[] = [
      {
        id: "step-1",
        title: "Complex step",
        instructions:
          "First, read the file.\n\nThen, write tests.\n\nFinally, implement.",
      },
    ];

    const result = renderWorkflowSection(steps);

    expect(result).toContain("First, read the file.");
    expect(result).toContain("Then, write tests.");
    expect(result).toContain("Finally, implement.");
  });
});

// ---------------------------------------------------------------------------
// mergeWorkflowStepSkills (pure function)
// ---------------------------------------------------------------------------

describe("mergeWorkflowStepSkills", () => {
  let mergeWorkflowStepSkills: (
    steps: WorkflowStep[],
    base?: CapabilitySkills,
  ) => CapabilitySkills;

  beforeEach(async () => {
    const mod = await import("./prompt-compiler");
    mergeWorkflowStepSkills = mod.mergeWorkflowStepSkills;
  });

  it("returns base skills when steps have no skills", () => {
    const base: CapabilitySkills = {
      mandatory: ["pio"],
      recommended: [{ name: "tdd", condition: "always" }],
    };
    const steps: WorkflowStep[] = [
      { id: "s1", title: "Step 1", instructions: "Do it." },
    ];

    const result = mergeWorkflowStepSkills(steps, base);

    expect(result.mandatory).toEqual(["pio"]);
    expect(result.recommended).toEqual([{ name: "tdd", condition: "always" }]);
  });

  it("returns step skills when base is undefined", () => {
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Step 1",
        instructions: "Do it.",
        skills: { mandatory: ["tdd"] },
      },
    ];

    const result = mergeWorkflowStepSkills(steps);

    expect(result.mandatory).toEqual(["tdd"]);
  });

  it("returns empty object when both base and steps are empty", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", title: "Step 1", instructions: "Do it." },
    ];

    const result = mergeWorkflowStepSkills(steps);

    expect(result).toEqual({});
  });

  it("deduplicates mandatory skills with Set (first-seen wins, preserves order)", () => {
    const base: CapabilitySkills = { mandatory: ["pio", "ask-user"] };
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Step 1",
        instructions: "A.",
        skills: { mandatory: ["ask-user", "tdd"] },
      },
      {
        id: "s2",
        title: "Step 2",
        instructions: "B.",
        skills: { mandatory: ["tdd", "pio-git"] },
      },
    ];

    const result = mergeWorkflowStepSkills(steps, base);

    // Order: pio, ask-user (from base), tdd (first seen in s1), pio-git (from s2)
    // ask-user and tdd appear again but are deduplicated
    expect(result.mandatory).toEqual(["pio", "ask-user", "tdd", "pio-git"]);
  });

  it("deduplicates recommended skills with Map by name (first-seen wins)", () => {
    const base: CapabilitySkills = {
      recommended: [{ name: "tdd", condition: "always" }],
    };
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Step 1",
        instructions: "A.",
        skills: {
          recommended: [
            { name: "tdd", condition: "when testing" },
            { name: "pio-git", condition: "when committing" },
          ],
        },
      },
    ];

    const result = mergeWorkflowStepSkills(steps, base);

    // tdd from base is kept (first-seen), pio-git is added
    expect(result.recommended).toEqual([
      { name: "tdd", condition: "always" },
      { name: "pio-git", condition: "when committing" },
    ]);
  });

  it("does not mutate input objects", () => {
    const base: CapabilitySkills = { mandatory: ["pio"] };
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Step 1",
        instructions: "A.",
        skills: { mandatory: ["tdd"] },
      },
    ];

    const baseBefore = JSON.stringify(base);
    const stepsBefore = JSON.stringify(steps);

    mergeWorkflowStepSkills(steps, base);

    expect(JSON.stringify(base)).toBe(baseBefore);
    expect(JSON.stringify(steps)).toBe(stepsBefore);
  });

  it("merges mandatory and recommended from both sources", () => {
    const base: CapabilitySkills = {
      mandatory: ["pio"],
      recommended: [{ name: "ask-user", condition: "always" }],
    };
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        title: "Step 1",
        instructions: "A.",
        skills: {
          mandatory: ["tdd"],
          recommended: [{ name: "pio-git", condition: "committing" }],
        },
      },
    ];

    const result = mergeWorkflowStepSkills(steps, base);

    expect(result.mandatory).toEqual(["pio", "tdd"]);
    expect(result.recommended).toEqual([
      { name: "ask-user", condition: "always" },
      { name: "pio-git", condition: "committing" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// readWorkflowSteps (filesystem — uses temp directories)
// ---------------------------------------------------------------------------

describe("readWorkflowSteps", () => {
  let readWorkflowSteps: (dirPath: string) => Promise<WorkflowStep[]>;
  let tempDir: string;

  beforeEach(async () => {
    const mod = await import("./prompt-compiler");
    readWorkflowSteps = mod.readWorkflowSteps;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-prompt-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads workflow steps from workflow.ts default export", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [
  { id: "step-1", title: "First", instructions: "Do first." },
  { id: "step-2", title: "Second", instructions: "Do second." },
];`,
    );

    const steps = await readWorkflowSteps(capDir);

    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("step-1");
    expect(steps[0].title).toBe("First");
    expect(steps[1].id).toBe("step-2");
  });

  it("reads workflow steps with skill declarations", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [
  {
    id: "step-1",
    title: "Implement",
    instructions: "Write code.",
    skills: { mandatory: ["tdd"], recommended: [{ name: "pio-git", condition: "when committing" }] },
  },
];`,
    );

    const steps = await readWorkflowSteps(capDir);

    expect(steps).toHaveLength(1);
    expect(steps[0].skills?.mandatory).toEqual(["tdd"]);
    expect(steps[0].skills?.recommended).toEqual([
      { name: "pio-git", condition: "when committing" },
    ]);
  });

  it("throws when workflow.ts is missing", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(readWorkflowSteps(capDir)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("throws when workflow.ts has no default export", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export const steps = [{ id: "s1", title: "X", instructions: "Y" }];`,
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(readWorkflowSteps(capDir)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns for malformed steps but still includes them", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [
  { id: "step-1", title: "Good", instructions: "OK" },
  { title: "Missing ID" },
];`,
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const steps = await readWorkflowSteps(capDir);

    expect(steps).toHaveLength(2);
    expect(steps[0].id).toBe("step-1");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// readPackageComponents (filesystem — uses temp directories)
// ---------------------------------------------------------------------------

describe("readPackageComponents", () => {
  let readPackageComponents: (dirPath: string) => Promise<any>;
  let tempDir: string;

  beforeEach(async () => {
    const mod = await import("./prompt-compiler");
    readPackageComponents = mod.readPackageComponents;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-prompt-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reads all component files (role, workflow, guidelines)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(path.join(capDir, "role.md"), "# My Role\n\nI do things.");
    fs.writeFileSync(
      path.join(capDir, "guidelines.md"),
      "- Be careful\n- Test everything",
    );
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Step 1", instructions: "Do it." }];`,
    );

    const components = await readPackageComponents(capDir);

    expect(components.role).toBe("# My Role\n\nI do things.");
    expect(components.steps).toHaveLength(1);
    expect(components.steps[0].title).toBe("Step 1");
    expect(components.guidelines?.content).toBe(
      "- Be careful\n- Test everything",
    );
  });

  it("handles missing role.md gracefully (role is undefined)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Step 1", instructions: "Do it." }];`,
    );

    const components = await readPackageComponents(capDir);

    expect(components.role).toBeUndefined();
    expect(components.steps).toHaveLength(1);
  });

  it("handles missing guidelines.md gracefully (guidelines is undefined)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Step 1", instructions: "Do it." }];`,
    );

    const components = await readPackageComponents(capDir);

    expect(components.guidelines).toBeUndefined();
  });

  it("throws when workflow.ts is missing (required file)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(path.join(capDir, "role.md"), "# Role");

    await expect(readPackageComponents(capDir)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// compilePrompt (integration — uses temp directories)
// ---------------------------------------------------------------------------

describe("compilePrompt", () => {
  let compilePrompt: (dir: string, options: any) => Promise<any>;
  let tempDir: string;

  beforeEach(async () => {
    const mod = await import("./prompt-compiler");
    compilePrompt = mod.compilePrompt;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-prompt-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns CompiledPromptSections with role, workflow, and guidelines", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "role.md"),
      "I am the Goal Definition Assistant.",
    );
    fs.writeFileSync(
      path.join(capDir, "guidelines.md"),
      "- Be thorough\n- Ask clarifying questions",
    );
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Understand", instructions: "Read the goal." }];`,
    );

    const result = await compilePrompt(capDir, {});

    expect(result.role).toContain("## Role");
    expect(result.role).toContain("I am the Goal Definition Assistant.");
    expect(result.workflow).toContain("## Workflow");
    expect(result.workflow).toContain("### Step 1: Understand");
    expect(result.guidelines).toContain("## Guidelines");
    expect(result.guidelines).toContain("- Be thorough");
  });

  it("handles missing role.md (role is undefined)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Step 1", instructions: "Do it." }];`,
    );

    const result = await compilePrompt(capDir, {});

    expect(result.role).toBeUndefined();
    expect(result.workflow).toBeDefined();
  });

  it("handles missing guidelines.md (guidelines is undefined)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Step 1", instructions: "Do it." }];`,
    );

    const result = await compilePrompt(capDir, {});

    expect(result.guidelines).toBeUndefined();
    expect(result.workflow).toBeDefined();
  });

  it("populates mergedSkills from workflow step skills and base skills", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{
  id: "s1",
  title: "Step 1",
  instructions: "Do it.",
  skills: { mandatory: ["tdd"] },
}];`,
    );

    const result = await compilePrompt(capDir, {
      baseSkills: { mandatory: ["pio"] },
    });

    expect(result.mergedSkills).toBeDefined();
    expect(result.mergedSkills?.mandatory).toEqual(["pio", "tdd"]);
  });

  it("workflow section is always present (required)", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [{ id: "s1", title: "Step 1", instructions: "Do it." }];`,
    );

    const result = await compilePrompt(capDir, {});

    expect(result.workflow).toBeDefined();
    expect(result.workflow).toContain("## Workflow");
  });

  it("throws when workflow.ts is missing", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });

    await expect(compilePrompt(capDir, {})).rejects.toThrow();
  });

  it("renders skills line for steps with mandatory skills in compiled output", async () => {
    const capDir = path.join(tempDir, "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "workflow.ts"),
      `export default [
  { id: "s1", title: "Step A", instructions: "First.", skills: { mandatory: ["tdd"] } },
  { id: "s2", title: "Step B", instructions: "Second." },
];`,
    );

    const result = await compilePrompt(capDir, {});

    expect(result.workflow).toContain("Skills: [tdd]");
    // Step B has no skills — verify no Skills line in its section
    const stepBSection = result.workflow?.split("### Step 2: Step B")[1]!;
    expect(stepBSection).not.toContain("Skills:");
  });
});
