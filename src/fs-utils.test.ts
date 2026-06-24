import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  initializePioRootDir,
  getPioRootDir,
  resolveGoalDir,
  goalExists,
  prepareGoal,
  issuesDir,
  findIssuePath,
  readIssue,
  deriveSessionName,
  stepFolderName,
  discoverNextStep,
} from "./fs-utils";
import { mergeCapabilitySkills } from "./capability-utils";
import type { CapabilitySkills } from "./types";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Create a goal directory tree with specified step folders.
// Each entry in `steps` can specify which files to create inside the step folder.
function createGoalTree(tempDir: string, goalName: string, steps?: { number: number; files: string[] }[]): string {
  const goalDir = path.join(tempDir, ".pio", "goals", goalName);
  fs.mkdirSync(goalDir, { recursive: true });

  for (const step of steps ?? []) {
    const folderName = stepFolderName(step.number);
    const stepDir = path.join(goalDir, folderName);
    fs.mkdirSync(stepDir, { recursive: true });
    for (const file of step.files) {
      fs.writeFileSync(path.join(stepDir, file), `content of ${file}`, "utf-8");
    }
  }

  return goalDir;
}

// Create an issues directory and write issue files
function createIssueFiles(tempDir: string, issues: { slug: string; content: string }[]): void {
  const issuesDirPath = path.join(tempDir, ".pio", "issues");
  fs.mkdirSync(issuesDirPath, { recursive: true });

  for (const issue of issues) {
    fs.writeFileSync(path.join(issuesDirPath, `${issue.slug}.md`), issue.content, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// resolveGoalDir
// ---------------------------------------------------------------------------

describe("resolveGoalDir(cwd, name)", () => {
  it("builds correct path for normal names", () => {
    const result = resolveGoalDir("/tmp/proj", "my-feature");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "my-feature"));
  });

  it("handles names with hyphens and underscores", () => {
    const result = resolveGoalDir("/tmp/proj", "my_feature-v2");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "my_feature-v2"));
  });

  it("handles names with dots", () => {
    const result = resolveGoalDir("/tmp/proj", "feat.login");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "feat.login"));
  });

  it("uses path.join (platform-independent separators)", () => {
    const result = resolveGoalDir("/tmp/proj", "test-goal");
    // On all platforms, path.join uses the correct separator
    expect(result.split(path.sep)).toContain(".pio");
    expect(result.split(path.sep)).toContain("goals");
  });
});

// ---------------------------------------------------------------------------
// goalExists
// ---------------------------------------------------------------------------

describe("goalExists(goalDir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns true for existing directory", () => {
    const goalDir = path.join(tempDir, "existing-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    expect(goalExists(goalDir)).toBe(true);
  });

  it("returns false for non-existent path", () => {
    const goalDir = path.join(tempDir, "non-existent-goal");
    expect(goalExists(goalDir)).toBe(false);
  });

  it("returns true for a file (not directory) — documents fs.existsSync behavior", () => {
    const filePath = path.join(tempDir, "not-a-dir");
    fs.writeFileSync(filePath, "hello", "utf-8");
    // fs.existsSync returns true for files too — goalExists uses fs.existsSync directly
    expect(goalExists(filePath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prepareGoal
// ---------------------------------------------------------------------------

describe("prepareGoal(name, cwd)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns ready: false when directory exists", () => {
    // Arrange: create goal directory
    const goalDir = path.join(tempDir, ".pio", "goals", "existing-goal");
    fs.mkdirSync(goalDir, { recursive: true });

    // Act
    const result = prepareGoal("existing-goal", tempDir);

    // Assert
    expect(result.ready).toBe(false);
    expect(result.goalDir).toBe(goalDir);
  });

  it("creates directory and returns ready: true when it doesn't exist", () => {
    // Arrange: goal directory does not exist
    const expectedGoalDir = path.join(tempDir, ".pio", "goals", "new-goal");

    // Act
    const result = prepareGoal("new-goal", tempDir);

    // Assert
    expect(result.ready).toBe(true);
    expect(result.goalDir).toBe(expectedGoalDir);
    expect(fs.statSync(result.goalDir).isDirectory()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// issuesDir
// ---------------------------------------------------------------------------

describe("issuesDir(cwd)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns correct path", () => {
    const result = issuesDir(tempDir);
    expect(result).toBe(path.join(tempDir, ".pio", "issues"));
  });

  it("creates directory if missing", () => {
    const issuesPath = path.join(tempDir, ".pio", "issues");
    expect(fs.existsSync(issuesPath)).toBe(false);
    const result = issuesDir(tempDir);
    expect(result).toBe(issuesPath);
    expect(fs.existsSync(issuesPath)).toBe(true);
  });

  it("is idempotent — no error on repeated calls", () => {
    const firstCall = issuesDir(tempDir);
    const secondCall = issuesDir(tempDir);
    expect(firstCall).toBe(secondCall);
  });
});

// ---------------------------------------------------------------------------
// findIssuePath
// ---------------------------------------------------------------------------

describe("findIssuePath(cwd, identifier)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("resolves absolute path when file exists", () => {
    const absFile = path.join(tempDir, "absolute-issue.md");
    fs.writeFileSync(absFile, "content", "utf-8");
    expect(findIssuePath(tempDir, absFile)).toBe(absFile);
  });

  it("returns undefined for non-existent absolute path", () => {
    const fakePath = path.join(tempDir, "does-not-exist.md");
    expect(findIssuePath(tempDir, fakePath)).toBeUndefined();
  });

  it("resolves exact filename (my-issue.md)", () => {
    createIssueFiles(tempDir, [{ slug: "my-issue", content: "test" }]);
    const result = findIssuePath(tempDir, "my-issue.md");
    expect(result).toBe(path.join(tempDir, ".pio", "issues", "my-issue.md"));
  });

  it("appends .md for bare slug (my-issue)", () => {
    createIssueFiles(tempDir, [{ slug: "my-issue", content: "test" }]);
    const result = findIssuePath(tempDir, "my-issue");
    expect(result).toBe(path.join(tempDir, ".pio", "issues", "my-issue.md"));
  });

  it("returns undefined for non-existent slug", () => {
    createIssueFiles(tempDir, []);
    expect(findIssuePath(tempDir, "non-existent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readIssue
// ---------------------------------------------------------------------------

describe("readIssue(cwd, identifier)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("returns file contents for existing issue", () => {
    createIssueFiles(tempDir, [{ slug: "test-issue", content: "test content" }]);
    expect(readIssue(tempDir, "test-issue")).toBe("test content");
  });

  it("returns undefined for missing issue", () => {
    createIssueFiles(tempDir, []);
    expect(readIssue(tempDir, "missing-issue")).toBeUndefined();
  });

  it("reads multiline content correctly", () => {
    const multiLine = `# Title

Some description.

- item 1
- item 2`;
    createIssueFiles(tempDir, [{ slug: "multi-line", content: multiLine }]);
    const result = readIssue(tempDir, "multi-line");
    expect(result).toBe(multiLine);
    expect(result).toContain("\n");
  });
});

// ---------------------------------------------------------------------------
// deriveSessionName
// ---------------------------------------------------------------------------

describe("deriveSessionName(goalName, capability, stepNumber?)", () => {
  it("empty goalName returns capability only", () => {
    expect(deriveSessionName("", "create-goal")).toBe("create-goal");
  });

  it("undefined goalName returns capability only", () => {
    // @ts-expect-error — testing undefined input behavior
    expect(deriveSessionName(undefined, "create-goal")).toBe("create-goal");
  });

  it("goal + capability (no step) returns combined name", () => {
    expect(deriveSessionName("my-feature", "create-plan")).toBe("my-feature create-plan");
  });

  it("all three params include step number", () => {
    expect(deriveSessionName("my-feature", "execute-task", 3)).toBe("my-feature execute-task s3");
  });

  it("step number zero includes s0", () => {
    expect(deriveSessionName("my-feature", "execute-task", 0)).toBe("my-feature execute-task s0");
  });
});

// ---------------------------------------------------------------------------
// stepFolderName
// ---------------------------------------------------------------------------

describe("stepFolderName(stepNumber)", () => {
  it("zero-pads single digits (1-9)", () => {
    expect(stepFolderName(1)).toBe("S01");
    expect(stepFolderName(5)).toBe("S05");
    expect(stepFolderName(9)).toBe("S09");
  });

  it("no extra padding for two-digit numbers", () => {
    expect(stepFolderName(10)).toBe("S10");
    expect(stepFolderName(25)).toBe("S25");
    expect(stepFolderName(100)).toBe("S100");
  });

  it("edge case — zero", () => {
    expect(stepFolderName(0)).toBe("S00");
  });
});

// ---------------------------------------------------------------------------
// discoverNextStep
// ---------------------------------------------------------------------------

describe("discoverNextStep(goalDir)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("empty directory returns 1", () => {
    const goalDir = path.join(tempDir, ".pio", "goals", "empty-goal");
    fs.mkdirSync(goalDir, { recursive: true });
    expect(discoverNextStep(goalDir)).toBe(1);
  });

  it("single complete step returns 2", () => {
    const goalDir = createGoalTree(tempDir, "one-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
    ]);
    expect(discoverNextStep(goalDir)).toBe(2);
  });

  it("multiple sequential complete steps return N+1", () => {
    const goalDir = createGoalTree(tempDir, "multi-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
      { number: 2, files: ["TASK.md", "TEST.md"] },
    ]);
    expect(discoverNextStep(goalDir)).toBe(3);
  });

  it("incomplete step (missing TEST.md) is not counted as complete", () => {
    const goalDir = createGoalTree(tempDir, "incomplete-step", [
      { number: 1, files: ["TASK.md"] }, // missing TEST.md
    ]);
    expect(discoverNextStep(goalDir)).toBe(1);
  });

  it("scans stops at first missing folder", () => {
    // S01 exists with specs, S02 doesn't exist, S03 has specs — should stop at S02
    const goalDir = createGoalTree(tempDir, "gap-step", [
      { number: 1, files: ["TASK.md", "TEST.md"] },
      { number: 3, files: ["TASK.md", "TEST.md"] }, // S03 exists but S02 doesn't
    ]);
    // After S01 is complete, loop checks S02 — doesn't exist → breaks. Returns 2 (S01 was complete).
    expect(discoverNextStep(goalDir)).toBe(2);
  });

  it("step with COMPLETED marker still counts if it has both spec files", () => {
    const goalDir = createGoalTree(tempDir, "completed-step", [
      { number: 1, files: ["TASK.md", "TEST.md", "COMPLETED"] },
    ]);
    // discoverNextStep checks for TASK.md + TEST.md, not COMPLETED marker
    expect(discoverNextStep(goalDir)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resolveGoalDir with parentStepDir (nested subgoals)
// ---------------------------------------------------------------------------

describe("resolveGoalDir with parentStepDir", () => {
  it("flat goal is backward compatible when parentStepDir is omitted", () => {
    const result = resolveGoalDir("/tmp/proj", "my-feature");
    expect(result).toBe(path.join("/tmp/proj", ".pio", "goals", "my-feature"));
  });

  it("nested subgoal resolves relative to parentStepDir", () => {
    const parentStepDir = path.join("/tmp/proj", ".pio", "goals", "parent", "S03");
    const result = resolveGoalDir("/tmp/proj", "nested-task", parentStepDir);
    expect(result).toBe(
      path.join("/tmp/proj", ".pio", "goals", "parent", "S03", "subgoals", "nested-task")
    );
  });

  it("nested subgoal path contains subgoals segment", () => {
    const parentStepDir = path.join("/tmp/proj", ".pio", "goals", "parent", "S03");
    const result = resolveGoalDir("/tmp/proj", "nested-task", parentStepDir);
    expect(result.split(path.sep)).toContain("subgoals");
  });

  it("empty parentStepDir delegates to path.join behavior", () => {
    const result = resolveGoalDir("/tmp/proj", "nested", "");
    // When parentStepDir is "", path.join("", "subgoals", "nested") normalizes to "subgoals/nested"
    expect(result).toBe(path.join("", "subgoals", "nested"));
  });
});

// ---------------------------------------------------------------------------
// deriveSessionName with hierarchical goal names
// ---------------------------------------------------------------------------

describe("deriveSessionName with hierarchical goal names", () => {
  it("flat goal name is unchanged", () => {
    expect(deriveSessionName("my-feature", "create-plan")).toBe("my-feature create-plan");
  });

  it("hierarchical goal name replaces __ with / for display", () => {
    expect(deriveSessionName("parent__S03__nested", "execute-task", 1)).toBe(
      "parent/S03/nested execute-task s1"
    );
  });

  it("single delimiter is replaced", () => {
    expect(deriveSessionName("a__b", "review-task")).toBe("a/b review-task");
  });

  it("no delimiters preserves existing behavior", () => {
    expect(deriveSessionName("my-goal", "create-goal")).toBe("my-goal create-goal");
  });

  it("empty goal name short-circuits before replacement", () => {
    expect(deriveSessionName("", "some-cap")).toBe("some-cap");
  });
});

// ---------------------------------------------------------------------------
// smoke — ESM import resolution verification
// ---------------------------------------------------------------------------

describe("smoke", () => {
  it("adds numbers correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves ESM imports", () => {
    // Import a function from src/ to prove Vitest resolves TypeScript + ESM correctly
    expect(stepFolderName(1)).toBe("S01");
    expect(stepFolderName(9)).toBe("S09");
    expect(stepFolderName(10)).toBe("S10");
  });
});

// ---------------------------------------------------------------------------
// mergeCapabilitySkills
// ---------------------------------------------------------------------------

describe("mergeCapabilitySkills", () => {
  it("concatenates and deduplicates mandatory skills from base and task", () => {
    // Arrange
    const base: CapabilitySkills = { mandatory: ["pio", "ask-user", "tdd"] };
    const task: CapabilitySkills = { mandatory: ["pio-git", "ask-user"] }; // ask-user is duplicate

    // Act
    const result = mergeCapabilitySkills(base, task);

    // Assert
    expect(result.mandatory).toEqual(["pio", "ask-user", "tdd", "pio-git"]);
    expect(result.recommended).toBeUndefined();
  });

  it("concatenates recommended skills with first-seen-wins dedup by name", () => {
    // Arrange
    const base: CapabilitySkills = {
      recommended: [{ name: "source-research", condition: "for lib internals" }],
    };
    const task: CapabilitySkills = {
      recommended: [
        { name: "source-research", condition: "different condition" }, // duplicate name
        { name: "web-browser", condition: "for browser testing" },
      ],
    };

    // Act
    const result = mergeCapabilitySkills(base, task);

    // Assert: base's source-research wins (first-seen)
    expect(result.recommended).toEqual([
      { name: "source-research", condition: "for lib internals" },
      { name: "web-browser", condition: "for browser testing" },
    ]);
    expect(result.mandatory).toBeUndefined();
  });

  it("returns base skills unchanged when task skills is null", () => {
    // Arrange
    const base: CapabilitySkills = { mandatory: ["pio", "ask-user"] };

    // Act
    const result = mergeCapabilitySkills(base, null);

    // Assert
    expect(result.mandatory).toEqual(["pio", "ask-user"]);
    expect(result.recommended).toBeUndefined();
  });

  it("returns task skills when base is undefined", () => {
    // Arrange
    const task: CapabilitySkills = { mandatory: ["pio-git"] };

    // Act
    const result = mergeCapabilitySkills(undefined, task);

    // Assert
    expect(result.mandatory).toEqual(["pio-git"]);
    expect(result.recommended).toBeUndefined();
  });

  it("returns empty object when both base and task are empty", () => {
    // Arrange
    const base: CapabilitySkills = {};
    const task: CapabilitySkills = {};

    // Act
    const result = mergeCapabilitySkills(base, task);

    // Assert
    expect(result).toEqual({});
  });

  it("merges mandatory and recommended from both sources", () => {
    // Arrange
    const base: CapabilitySkills = {
      mandatory: ["pio"],
      recommended: [{ name: "source-research", condition: "always" }],
    };
    const task: CapabilitySkills = {
      mandatory: ["pio-git"],
      recommended: [{ name: "web-browser", condition: "when needed" }],
    };

    // Act
    const result = mergeCapabilitySkills(base, task);

    // Assert
    expect(result.mandatory).toEqual(["pio", "pio-git"]);
    expect(result.recommended).toEqual([
      { name: "source-research", condition: "always" },
      { name: "web-browser", condition: "when needed" },
    ]);
  });

  it("does not mutate input objects", () => {
    // Arrange
    const base: CapabilitySkills = { mandatory: ["pio"] };
    const task: CapabilitySkills = { mandatory: ["pio-git"] };
    const baseCopy = { ...base, mandatory: [...(base.mandatory ?? [])] };
    const taskCopy = { ...task, mandatory: [...(task.mandatory ?? [])] };

    // Act
    mergeCapabilitySkills(base, task);

    // Assert: inputs unchanged
    expect(base).toEqual(baseCopy);
    expect(task).toEqual(taskCopy);
  });

  it("preserves order of base skills before task skills", () => {
    // Arrange
    const base: CapabilitySkills = { mandatory: ["a", "b", "c"] };
    const task: CapabilitySkills = { mandatory: ["d", "e"] };

    // Act
    const result = mergeCapabilitySkills(base, task);

    // Assert
    expect(result.mandatory).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("handles task with recommended missing name field gracefully (schema would catch this)", () => {
    // Arrange: CapabilitySkills type enforces name presence, but test edge case
    const base: CapabilitySkills = { mandatory: ["pio"] };
    // @ts-expect-error — testing malformed input
    const task: CapabilitySkills = { recommended: [{ condition: "no name" }] };

    // Act
    const result = mergeCapabilitySkills(base, task);

    // Assert: should not crash
    expect(result.mandatory).toEqual(["pio"]);
  });
});

// ---------------------------------------------------------------------------
// pioRootDir — global constant for .pio/ root
// ---------------------------------------------------------------------------

describe("pioRootDir", () => {
  it("initializePioRootDir sets pioRootDir to cwd/.pio", () => {
    initializePioRootDir("/test-project");
    expect(getPioRootDir()).toBe("/test-project/.pio");
  });

  it("getPioRootDir returns the initialized value", () => {
    // Already initialized by previous test (module-level state)
    expect(getPioRootDir()).toBe("/test-project/.pio");
  });

  it("initializePioRootDir throws if called more than once", () => {
    expect(() => initializePioRootDir("/other")).toThrow("pioRootDir already initialized");
  });
});
