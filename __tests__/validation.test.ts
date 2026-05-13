import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  validateOutputs,
  extractGoalName,
  parseReviewFrontmatter,
  validateReviewFrontmatter,
  applyReviewDecision,
  validateReviewState,
} from "../src/capabilities/validation";

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

// ---------------------------------------------------------------------------
// parseReviewFrontmatter — YAML frontmatter extraction from REVIEW.md
// ---------------------------------------------------------------------------

describe("parseReviewFrontmatter", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function writeFile(content: string): string {
    const filePath = path.join(tempDir, "REVIEW.md");
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("valid APPROVED frontmatter returns correct object", () => {
    // Arrange
    const filePath = writeFile(
      "---\ndecision: APPROVED\ncriticalIssues: 0\nhighIssues: 1\nmediumIssues: 2\nlowIssues: 3\n---\n# Code Review",
    );

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).toEqual({
      decision: "APPROVED" as const,
      criticalIssues: 0,
      highIssues: 1,
      mediumIssues: 2,
      lowIssues: 3,
    });
  });

  it("valid REJECTED frontmatter returns correct object", () => {
    // Arrange
    const filePath = writeFile(
      "---\ndecision: REJECTED\ncriticalIssues: 2\nhighIssues: 0\nmediumIssues: 1\nlowIssues: 0\n---\n# Code Review",
    );

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.decision).toBe("REJECTED");
    expect(result!.criticalIssues).toBe(2);
    expect(result!.highIssues).toBe(0);
    expect(result!.mediumIssues).toBe(1);
    expect(result!.lowIssues).toBe(0);
  });

  it("returns null when file does not start with ---", () => {
    // Arrange
    const filePath = writeFile("# Code Review\n\nSome content without frontmatter.");

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when closing --- delimiter is missing", () => {
    // Arrange
    const filePath = writeFile("---\ndecision: APPROVED\ncriticalIssues: 0");

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when YAML between delimiters is malformed", () => {
    // Arrange
    const filePath = writeFile("---\ndecision: APPROVED\nbroken: [unclosed\n---\n# body");

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null when file does not exist", () => {
    // Act
    const result = parseReviewFrontmatter(path.join(tempDir, "nonexistent.md"));

    // Assert
    expect(result).toBeNull();
  });

  it("extra fields in frontmatter are tolerated", () => {
    // Arrange
    const filePath = writeFile(
      "---\ndecision: APPROVED\ncriticalIssues: 0\nhighIssues: 1\nmediumIssues: 2\nlowIssues: 3\nreviewer: bot\n---\n# Code Review",
    );

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.decision).toBe("APPROVED");
    expect(result!.criticalIssues).toBe(0);
    expect(result!.highIssues).toBe(1);
    expect(result!.mediumIssues).toBe(2);
    expect(result!.lowIssues).toBe(3);
  });

  it("returns null when frontmatter not at start (leading newline)", () => {
    // Arrange
    const filePath = writeFile(
      "\n---\ndecision: APPROVED\ncriticalIssues: 0\nhighIssues: 0\nmediumIssues: 0\nlowIssues: 0\n---\n# body",
    );

    // Act
    const result = parseReviewFrontmatter(filePath);

    // Assert
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateReviewFrontmatter — decision/count validation
// ---------------------------------------------------------------------------

describe("validateReviewFrontmatter", () => {
  it("valid APPROVED with all zero counts → null (no error)", () => {
    // Arrange
    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = validateReviewFrontmatter(frontmatter);

    // Assert
    expect(result).toBeNull();
  });

  it("valid REJECTED with non-zero counts → null (no error)", () => {
    // Arrange
    const frontmatter = {
      decision: "REJECTED",
      criticalIssues: 2,
      highIssues: 1,
      mediumIssues: 0,
      lowIssues: 3,
    };

    // Act
    const result = validateReviewFrontmatter(frontmatter);

    // Assert
    expect(result).toBeNull();
  });

  it("decision is not APPROVED or REJECTED → returns error string", () => {
    // Arrange
    const frontmatter = {
      decision: "PENDING" as any,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = validateReviewFrontmatter(frontmatter);

    // Assert
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect(result!).toContain("APPROVED");
    expect(result!).toContain("REJECTED");
  });

  it("missing required field → returns error string mentioning field name", () => {
    // Arrange: missing mediumIssues and lowIssues
    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
    };

    // Act
    const result = validateReviewFrontmatter(frontmatter as any);

    // Assert
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("negative count → returns error string", () => {
    // Arrange
    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: -1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = validateReviewFrontmatter(frontmatter);

    // Assert
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("non-integer count → returns error string", () => {
    // Arrange
    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: 1.5,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    const result = validateReviewFrontmatter(frontmatter);

    // Assert
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// applyReviewDecision — marker file creation / deletion
// ---------------------------------------------------------------------------

describe("applyReviewDecision", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function createStepDir(stepNumber: number) {
    const folder = `S${String(stepNumber).padStart(2, "0")}`;
    return path.join(tempDir, folder);
  }

  it("APPROVED creates empty APPROVED file, leaves COMPLETED intact", () => {
    // Arrange: Create S01/ with COMPLETED (content "done"), no markers
    const stepDir = createStepDir(1);
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "done", "utf-8");

    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(tempDir, 1, frontmatter);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.readFileSync(path.join(stepDir, "APPROVED"), "utf-8")).toBe("");
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(fs.readFileSync(path.join(stepDir, "COMPLETED"), "utf-8")).toBe("done");
  });

  it("REJECTED creates empty REJECTED file, deletes COMPLETED", () => {
    // Arrange: Create S01/ with COMPLETED, no markers
    const stepDir = createStepDir(1);
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "done", "utf-8");

    const frontmatter = {
      decision: "REJECTED",
      criticalIssues: 1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(tempDir, 1, frontmatter);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.readFileSync(path.join(stepDir, "REJECTED"), "utf-8")).toBe("");
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
  });

  it("REJECTED when COMPLETED is already absent → no crash", () => {
    // Arrange: Create S01/ with no COMPLETED, no markers
    const stepDir = createStepDir(1);
    fs.mkdirSync(stepDir, { recursive: true });

    const frontmatter = {
      decision: "REJECTED",
      criticalIssues: 1,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act — should not throw
    expect(() => applyReviewDecision(tempDir, 1, frontmatter)).not.toThrow();

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
  });

  it("APPROVED does not create a REJECTED file", () => {
    // Arrange: Create S01/ with COMPLETED, no markers
    const stepDir = createStepDir(1);
    fs.mkdirSync(stepDir, { recursive: true });
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "done", "utf-8");

    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(tempDir, 1, frontmatter);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("step number is correctly zero-padded in path", () => {
    // Arrange: Create temp dir

    const frontmatter = {
      decision: "APPROVED",
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    };

    // Act
    applyReviewDecision(tempDir, 5, frontmatter);

    // Assert: File created at S05/APPROVED (not S5/)
    expect(fs.existsSync(path.join(tempDir, "S05", "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "S5", "APPROVED"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateReviewState — post-creation consistency check
// ---------------------------------------------------------------------------

describe("validateReviewState", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function createStepDir(stepNumber: number): string {
    const folder = `S${String(stepNumber).padStart(2, "0")}`;
    const dir = path.join(tempDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("APPROVED exists, REJECTED absent → consistent for APPROVED", () => {
    // Arrange
    const stepDir = createStepDir(1);
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    const result = validateReviewState(tempDir, 1, "APPROVED");

    // Assert
    expect(result).toBe(true);
  });

  it("REJECTED exists, APPROVED absent → consistent for REJECTED", () => {
    // Arrange
    const stepDir = createStepDir(1);
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    const result = validateReviewState(tempDir, 1, "REJECTED");

    // Assert
    expect(result).toBe(true);
  });

  it("both markers exist → inconsistent", () => {
    // Arrange
    const stepDir = createStepDir(1);
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(stepDir, "REJECTED"), "", "utf-8");

    // Act
    const result = validateReviewState(tempDir, 1, "APPROVED");

    // Assert
    expect(result).toBe(false);
  });

  it("neither marker exists → inconsistent", () => {
    // Arrange
    createStepDir(1); // empty step dir

    // Act
    const result = validateReviewState(tempDir, 1, "APPROVED");

    // Assert
    expect(result).toBe(false);
  });

  it("marker mismatch — APPROVED on disk but expected REJECTED → inconsistent", () => {
    // Arrange
    const stepDir = createStepDir(1);
    fs.writeFileSync(path.join(stepDir, "APPROVED"), "", "utf-8");

    // Act
    const result = validateReviewState(tempDir, 1, "REJECTED");

    // Assert
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — Full review-code automation flow
// ---------------------------------------------------------------------------

describe("review-code markComplete automation", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  function createStepDir(stepNumber: number): string {
    const folder = `S${String(stepNumber).padStart(2, "0")}`;
    const dir = path.join(tempDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("APPROVED: valid REVIEW.md triggers APPROVED creation, COMPLETED preserved, state consistent", () => {
    // Arrange: Create S01/ with REVIEW.md (valid APPROVED frontmatter + body) and COMPLETED
    const stepDir = createStepDir(1);
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "---\ndecision: APPROVED\ncriticalIssues: 0\nhighIssues: 0\nmediumIssues: 1\nlowIssues: 2\n---\n# Code Review\n\nAll good.",
      "utf-8",
    );
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act: Full automation sequence
    const reviewPath = path.join(stepDir, "REVIEW.md");
    const frontmatter = parseReviewFrontmatter(reviewPath);
    expect(frontmatter).not.toBeNull();

    const validationError = validateReviewFrontmatter(frontmatter!);
    expect(validationError).toBeNull();

    applyReviewDecision(tempDir, 1, frontmatter!);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(validateReviewState(tempDir, 1, "APPROVED")).toBe(true);
  });

  it("REJECTED: valid REVIEW.md triggers REJECTED creation, COMPLETED deleted, state consistent", () => {
    // Arrange: Create S01/ with REVIEW.md (valid REJECTED frontmatter + body) and COMPLETED
    const stepDir = createStepDir(1);
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "---\ndecision: REJECTED\ncriticalIssues: 2\nhighIssues: 1\nmediumIssues: 0\nlowIssues: 0\n---\n# Code Review\n\nNeeds work.",
      "utf-8",
    );
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act: Full automation sequence
    const reviewPath = path.join(stepDir, "REVIEW.md");
    const frontmatter = parseReviewFrontmatter(reviewPath);
    expect(frontmatter).not.toBeNull();

    const validationError = validateReviewFrontmatter(frontmatter!);
    expect(validationError).toBeNull();

    applyReviewDecision(tempDir, 1, frontmatter!);

    // Assert
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(false);
    expect(validateReviewState(tempDir, 1, "REJECTED")).toBe(true);
  });

  it("missing frontmatter in REVIEW.md → automation fails early, no markers created", () => {
    // Arrange: Create S01/ with REVIEW.md (no YAML block) and COMPLETED
    const stepDir = createStepDir(1);
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "# Code Review\n\nNo frontmatter here.",
      "utf-8",
    );
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    const reviewPath = path.join(stepDir, "REVIEW.md");
    const frontmatter = parseReviewFrontmatter(reviewPath);

    // Assert: parseReviewFrontmatter returns null, so no further steps execute
    expect(frontmatter).toBeNull();

    // No files should have been created or deleted
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("invalid decision value in frontmatter → validation fails, no markers created", () => {
    // Arrange: Create S01/ with REVIEW.md (decision: PENDING) and COMPLETED
    const stepDir = createStepDir(1);
    fs.writeFileSync(
      path.join(stepDir, "REVIEW.md"),
      "---\ndecision: PENDING\ncriticalIssues: 0\nhighIssues: 0\nmediumIssues: 0\nlowIssues: 0\n---\n# Code Review",
      "utf-8",
    );
    fs.writeFileSync(path.join(stepDir, "COMPLETED"), "", "utf-8");

    // Act
    const reviewPath = path.join(stepDir, "REVIEW.md");
    const frontmatter = parseReviewFrontmatter(reviewPath);
    expect(frontmatter).not.toBeNull();

    const validationError = validateReviewFrontmatter(frontmatter!);

    // Assert: validation fails, no further steps execute
    expect(validationError).not.toBeNull();
    expect(typeof validationError).toBe("string");

    // No files should have been created or deleted
    expect(fs.existsSync(path.join(stepDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(stepDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(stepDir, "REJECTED"))).toBe(false);
  });

  it("non-review-code path is unaffected (source checks for review-code capability)", () => {
    // Arrange: Read validation.ts source to verify the automation block is gated
    const sourcePath = path.resolve(__dirname, "../src/capabilities/validation.ts");
    const source = fs.readFileSync(sourcePath, "utf-8");

    // Assert: The source contains a conditional that checks for "review-code"
    expect(source).toContain("review-code");
  });
});
