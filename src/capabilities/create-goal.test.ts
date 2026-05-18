import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITY_CONFIG, prepareGoal } from "./create-goal";
import { goalExists, resolveGoalDir } from "../fs-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// CAPABILITY_CONFIG.defaultInitialMessage
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG.defaultInitialMessage", () => {
  it("given { goalName: 'my-feature' }, message contains the goal name", () => {
    // Act
    const result = CAPABILITY_CONFIG.defaultInitialMessage(
      "/some/path",
      { goalName: "my-feature" },
    );

    // Assert
    expect(result).toContain("my-feature");
  });

  it("given { goalName: 'refactor-auth' }, message contains the goal name", () => {
    // Act
    const result = CAPABILITY_CONFIG.defaultInitialMessage(
      "/another/path",
      { goalName: "refactor-auth" },
    );

    // Assert
    expect(result).toContain("refactor-auth");
  });

  it("given no params, message does not crash (fallback to directory path)", () => {
    // Act
    const result = CAPABILITY_CONFIG.defaultInitialMessage(
      "/some/.pio/goals/test",
    );

    // Assert
    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("/some/.pio/goals/test");
  });

  it("given params without goalName, message does not crash (fallback)", () => {
    // Act
    const result = CAPABILITY_CONFIG.defaultInitialMessage("/some/path", {
      otherKey: "value",
    });

    // Assert
    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("/some/path");
  });

  it("message frames goal name as a known fact", () => {
    // Act
    const result = CAPABILITY_CONFIG.defaultInitialMessage(
      "/some/path",
      { goalName: "test-goal" },
    );

    // Assert: no question marks or confirmation phrasing
    expect(result).not.toContain("?");
    expect(result.toLowerCase()).not.toMatch(/confirm/);
    expect(result.toLowerCase()).not.toMatch(/ask/);
    expect(result.toLowerCase()).not.toMatch(/what should we call/);
  });
});

// ---------------------------------------------------------------------------
// prepareGoal
// ---------------------------------------------------------------------------

describe("prepareGoal", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-create-goal-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns ready: false when directory exists", async () => {
    // Arrange: create goal directory
    const goalDir = path.join(tempDir, ".pio", "goals", "existing-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    // Act
    const result = await prepareGoal("existing-goal", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.goalDir).toBe(goalDir);
  });

  it("creates directory and returns ready: true when it doesn't exist", async () => {
    // Arrange: goal directory does not exist
    const expectedGoalDir = path.join(tempDir, ".pio", "goals", "new-goal");

    // Act
    const result = await prepareGoal("new-goal", tempDir);

    // Assert
    expect(result.ready).toBe(true);
    expect(result.goalDir).toBe(expectedGoalDir);
    expect(fs.statSync(result.goalDir).isDirectory()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helper functions: goalExists
// ---------------------------------------------------------------------------

describe("goalExists", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-goal-exists-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true for an existing directory", () => {
    // Arrange
    const dir = path.join(tempDir, "existing-dir");
    fs.mkdirSync(dir, { recursive: true });

    // Act & Assert
    expect(goalExists(dir)).toBe(true);
  });

  it("returns false for a non-existing path", () => {
    // Arrange
    const dir = path.join(tempDir, "non-existing-dir");

    // Act & Assert
    expect(goalExists(dir)).toBe(false);
  });

  it("returns true for a file path (existsSync check)", () => {
    // Arrange: create a file, not a directory
    const filePath = path.join(tempDir, "not-a-dir.txt");
    fs.writeFileSync(filePath, "test");

    // Act & Assert — goalExists uses existsSync, so files also return true
    expect(goalExists(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Helper functions: resolveGoalDir
// ---------------------------------------------------------------------------

describe("resolveGoalDir", () => {
  it("correctly joins cwd/.pio/goals/<name>", () => {
    // Act
    const result = resolveGoalDir("/home/user/project", "my-goal");

    // Assert
    expect(result).toBe(path.join("/home/user/project", ".pio", "goals", "my-goal"));
  });

  it("handles nested-like goal names", () => {
    // Act
    const result = resolveGoalDir("/project", "feature/sub-task");

    // Assert
    expect(result).toBe(path.join("/project", ".pio", "goals", "feature", "sub-task"));
  });
});

// ---------------------------------------------------------------------------
// prompts/create-goal.md — prompt content verification
// ---------------------------------------------------------------------------

describe("prompts/create-goal.md", () => {
  const promptPath = path.join(__dirname, "..", "prompts", "create-goal.md");
  const promptContent = fs.readFileSync(promptPath, "utf-8");

  // Helper: extract the Setup section (between ## Setup and the next ## heading)
  function extractSetupSection(): string {
    const startIdx = promptContent.indexOf("## Setup");
    if (startIdx === -1) return "";
    const rest = promptContent.slice(startIdx);
    const endMatch = rest.slice(1).match(/^## /m);
    if (endMatch && endMatch.index !== undefined) return rest.slice(0, endMatch.index);
    return rest;
  }

  // Helper: extract Step 1 section (between ### Step 1: and the next ### Step)
  function extractStep1Section(): string {
    const startIdx = promptContent.indexOf("### Step 1:");
    if (startIdx === -1) return "";
    const rest = promptContent.slice(startIdx);
    const endMatch = rest.slice(1).match(/^### Step \d/m);
    if (endMatch && endMatch.index !== undefined) return rest.slice(0, endMatch.index);
    return rest;
  }

  it("does not instruct to always confirm the goal name", () => {
    // Assert: the forbidden phrase should not appear
    expect(promptContent).not.toMatch(/always\s*confirm/i);
  });

  it("does not instruct to ask about workspace name", () => {
    // Assert: specific affirmative instructions to ask/confirm workspace name should not appear
    // These target the original problematic phrasing, not negative instructions ("do not ask")
    const lines = promptContent.split("\n").map(l => l.trim());
    const affirmativeLines = lines.filter(
      line => (line.includes("ask") || line.includes("confirm")) && !line.match(/\bdo\s+not\b|\bdon't\b/i),
    );
    const affirmativeText = affirmativeLines.join(" ");
    expect(affirmativeText).not.toMatch(/ask.*workspace.*name/i);
    expect(affirmativeText).not.toMatch(/confirm.*workspace/i);
    expect(affirmativeText).not.toMatch(/confirm.*goal.*name/i);
    expect(affirmativeText).not.toMatch(/confirm\s+with\s+the\s+user/i);
  });

  it("Setup section states goal name is provided", () => {
    // Arrange
    const setupSection = extractSetupSection();

    // Assert: Setup should mention the goal name is provided by the session
    expect(setupSection).toMatch(/goal.?name.*provided/i);
  });

  it("Setup section instructs not to ask for goal name", () => {
    // Arrange
    const setupSection = extractSetupSection();

    // Assert: Setup should contain a negative instruction about asking for the goal/workspace name
    expect(setupSection).toMatch(/do\s+not.*ask.*goal|do\s+not.*ask.*workspace/i);
  });

  it("Step 1 still asks about purpose, scope, requirements", () => {
    // Arrange
    const step1Section = extractStep1Section();

    // Assert: Step 1 should still reference understanding the goal's purpose or problem domain
    expect(step1Section).toMatch(/problem|opportunity|purpose|requirement/i);
  });
});
