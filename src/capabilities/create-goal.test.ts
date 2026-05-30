import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { prepareGoal } from "./create-goal/config";
import { goalExists, resolveGoalDir } from "../fs-utils";

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
