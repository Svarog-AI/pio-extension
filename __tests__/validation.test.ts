import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateOutputs, extractGoalName } from "../src/capabilities/validation";

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
// extractGoalName — path-parsing logic
// ---------------------------------------------------------------------------

describe("extractGoalName", () => {
  // Pure string manipulation — no filesystem needed.

  it("standard path extracts goal name", () => {
    expect(extractGoalName("/repo/.pio/goals/my-feature/")).toBe("my-feature");
  });

  it("path without trailing slash extracts goal name", () => {
    expect(extractGoalName("/repo/.pio/goals/my-feature")).toBe("my-feature");
  });

  it("deeply nested path stops at goal name", () => {
    // After /goals/my-feature/, there are subdirectories — should stop at first separator
    expect(extractGoalName("/repo/.pio/goals/my-feature/S01/extra/path")).toBe("my-feature");
  });

  it("no /goals/ segment returns empty string", () => {
    expect(extractGoalName("/repo/.pio/session-queue/task.json")).toBe("");
  });

  it("root-level goals path extracts goal name", () => {
    expect(extractGoalName("/.pio/goals/root-goal/")).toBe("root-goal");
  });

  it("empty string input returns empty string", () => {
    expect(extractGoalName("")).toBe("");
  });

  it("goal name with hyphens and underscores is preserved", () => {
    expect(extractGoalName("/repo/.pio/goals/my_feature-v2/")).toBe("my_feature-v2");
  });
});
