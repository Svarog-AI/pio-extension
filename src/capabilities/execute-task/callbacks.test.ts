import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyExecutionStatus, postExecuteExecute } from "./callbacks";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-execute-callbacks-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Helper: write a SUMMARY.md with YAML frontmatter
function writeSummaryMd(
  dir: string,
  frontmatter: Record<string, unknown>,
  body?: string,
): void {
  const yamlLines = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const content = `---\n${yamlLines}\n---\n${body ?? "# Summary"}`;
  fs.writeFileSync(path.join(dir, "SUMMARY.md"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// applyExecutionStatus — isolation tests
// ---------------------------------------------------------------------------

describe("applyExecutionStatus", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("creates COMPLETED marker for status completed", () => {
    // Act
    applyExecutionStatus(tempDir, "completed");

    // Assert
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("creates BLOCKED marker for status blocked", () => {
    // Act
    applyExecutionStatus(tempDir, "blocked");

    // Assert
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
  });

  it("creates directory if missing", () => {
    // Arrange: workspaceDir doesn't exist yet
    const workspaceDir = path.join(tempDir, "nonexistent");

    // Act
    applyExecutionStatus(workspaceDir, "completed");

    // Assert
    expect(fs.existsSync(path.join(workspaceDir, "COMPLETED"))).toBe(true);
  });

  it("marker files are empty", () => {
    // Act
    applyExecutionStatus(tempDir, "completed");

    // Assert
    const content = fs.readFileSync(path.join(tempDir, "COMPLETED"), "utf-8");
    expect(content).toBe("");
  });
});

// ---------------------------------------------------------------------------
// applyExecutionStatus — idempotency
// ---------------------------------------------------------------------------

describe("applyExecutionStatus — idempotency", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => cleanup(tempDir));

  it("completed then blocked leaves only BLOCKED", () => {
    // Act
    applyExecutionStatus(tempDir, "completed");
    applyExecutionStatus(tempDir, "blocked");

    // Assert
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
  });

  it("blocked then completed leaves only COMPLETED", () => {
    // Act
    applyExecutionStatus(tempDir, "blocked");
    applyExecutionStatus(tempDir, "completed");

    // Assert
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("multiple calls with the same status are idempotent", () => {
    // Act
    applyExecutionStatus(tempDir, "completed");
    applyExecutionStatus(tempDir, "completed");

    // Assert
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("removes both markers when both coexist", () => {
    // Arrange: simulate stale state with both markers
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "BLOCKED"), "", "utf-8");

    // Act
    applyExecutionStatus(tempDir, "completed");

    // Assert: only COMPLETED exists
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// postExecuteExecute — integration tests
// ---------------------------------------------------------------------------

describe("postExecuteExecute", () => {
  let tempDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = createTempDir();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    cleanup(tempDir);
  });

  it("creates COMPLETED for valid summary with status completed", () => {
    // Arrange
    writeSummaryMd(tempDir, { status: "completed" });

    // Act
    postExecuteExecute(tempDir);

    // Assert
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("creates BLOCKED for valid summary with status blocked", () => {
    // Arrange
    writeSummaryMd(tempDir, { status: "blocked" });

    // Act
    postExecuteExecute(tempDir);

    // Assert
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
  });

  it("logs warning when SUMMARY.md is missing", () => {
    // Arrange: no SUMMARY.md

    // Act
    postExecuteExecute(tempDir);

    // Assert
    expect(warnSpy).toHaveBeenCalled();
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("logs warning when SUMMARY.md has no frontmatter", () => {
    // Arrange: SUMMARY.md without YAML frontmatter
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "# Summary\n\nNo frontmatter.",
      "utf-8",
    );

    // Act
    postExecuteExecute(tempDir);

    // Assert
    expect(warnSpy).toHaveBeenCalled();
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("does not crash when SUMMARY.md has extra fields alongside valid status", () => {
    // Arrange: SUMMARY.md with valid status + extra fields
    writeSummaryMd(tempDir, { status: "completed", extra: "field" });

    // Act
    postExecuteExecute(tempDir);

    // Assert: should handle gracefully, create COMPLETED
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });
});
