import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-mark-complete-guard-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockResolveCapabilityConfigMC = vi.hoisted(() => vi.fn());

vi.mock("../capability-config", () => ({
  resolveCapabilityConfig: mockResolveCapabilityConfigMC,
  resolveContractPath: vi
    .fn()
    .mockImplementation(
      (
        contractPath: string,
        baseDir: string,
        _workspacePrefix?: string,
        _params?: Record<string, unknown>,
        projectRelative?: boolean,
      ) => {
        if (projectRelative) {
          return path.join(baseDir, contractPath);
        }
        return path.join(baseDir, contractPath);
      },
    ),
}));

// ---------------------------------------------------------------------------
// Note: frontmatter schema validation is now part of validateOutputs()
// and is tested in validation.test.ts. mark-complete.ts no longer calls
// validateFrontmatter() separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// cleanupMarkers — framework auto-cleanup at session start
// ---------------------------------------------------------------------------

describe("cleanupMarkers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("deletes all declared marker filenames from all values mappings", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    // Create marker files
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "BLOCKED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "APPROVED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "REJECTED"), "", "utf-8");

    const contract: import("../types").CapabilityContract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
        {
          outputFile: "review",
          field: "decision",
          values: { APPROVED: "APPROVED", REJECTED: "REJECTED" },
        },
      ],
    };

    cleanupMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "REJECTED"))).toBe(false);
  });

  it("handles missing files gracefully (no errors thrown)", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    // No files created — all markers are missing
    const contract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
  });

  it("handles undefined markers as no-op", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      // markers is undefined
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
  });

  it("handles empty markers array as no-op", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      markers: [],
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
  });

  it("deduplicates filenames across multiple declarations", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    // Create the shared marker file
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");

    // Two declarations both produce "COMPLETED"
    const contract: import("../types").CapabilityContract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED" },
        },
        {
          outputFile: "other",
          field: "result",
          values: { done: "COMPLETED" },
        },
      ],
    };

    expect(() => cleanupMarkers(tempDir, contract)).not.toThrow();
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
  });

  it("only deletes declared markers, leaves other files untouched", async () => {
    const { cleanupMarkers } = await import("./mark-complete");

    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(path.join(tempDir, "SUMMARY.md"), "content", "utf-8");
    fs.writeFileSync(path.join(tempDir, "TASK.md"), "content", "utf-8");

    const contract = {
      inputs: [],
      outputs: [],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    cleanupMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    // These should still exist
    expect(fs.existsSync(path.join(tempDir, "SUMMARY.md"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "TASK.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cleanupMarkers integration — runs before prepareSession in resources_discover
// ---------------------------------------------------------------------------

describe("cleanupMarkers integration (session startup)", () => {
  let tempDir: string;
  let goalDir: string;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = createTempDir();
    goalDir = path.join(tempDir, ".pio", "goals", "test-goal");
    fs.mkdirSync(goalDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("cleanupMarkers runs before prepareSession during resources_discover", async () => {
    // Create a marker file that should be cleaned up
    fs.writeFileSync(path.join(goalDir, "APPROVED"), "", "utf-8");

    const callOrder: string[] = [];

    // prepareSession checks if APPROVED was already deleted
    const prepareSessionMock = vi.fn().mockImplementation((wd: string) => {
      callOrder.push("prepareSession");
      callOrder.push(
        fs.existsSync(path.join(wd, "APPROVED"))
          ? "APPROVED still exists"
          : "APPROVED already deleted",
      );
    });

    mockResolveCapabilityConfigMC.mockReturnValue({
      capability: "review-task",
      workspaceDir: goalDir,
      contract: {
        inputs: [],
        outputs: [{ name: "review", file: "REVIEW.md", schema: undefined }],
        markers: [
          {
            outputFile: "review",
            field: "decision",
            values: { APPROVED: "APPROVED", REJECTED: "REJECTED" },
          },
        ],
      },
      sessionParams: {
        goalName: "test-goal",
        stepNumber: 1,
        queueKey: "test-goal",
      },
      prepareSession: prepareSessionMock,
    });

    // Import capability-session which wires up resources_discover
    const mod = await import("../capability-session");

    const mockPi = {
      registerTool: vi.fn(),
      on: vi.fn().mockImplementation((event, handler) => {
        if (event === "resources_discover") {
          // Simulate resources_discover event
          const mockCtx = {
            sessionManager: {
              getEntries: () => [
                {
                  type: "custom",
                  customType: "pio-config",
                  data: {
                    capability: "review-task",
                    workspaceDir: goalDir,
                    sessionParams: {
                      goalName: "test-goal",
                      stepNumber: 1,
                      queueKey: "test-goal",
                    },
                  },
                },
              ],
            },
          };
          // Call the handler synchronously (it's async but we'll await)
          Promise.resolve(handler(null, mockCtx)).catch(() => {});
        }
      }),
      setSessionName: vi.fn(),
      registerCommand: vi.fn(),
    };

    mod.setupSessionInfrastructure(mockPi as any);

    // Wait for async handler to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // APPROVED should have been deleted before prepareSession ran
    expect(callOrder).toContain("prepareSession");
    expect(callOrder).toContain("APPROVED already deleted");
    expect(fs.existsSync(path.join(goalDir, "APPROVED"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyMarkers — framework marker engine
// ---------------------------------------------------------------------------

describe("applyMarkers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("creates correct marker based on frontmatter field value", async () => {
    const { applyMarkers } = await import("./mark-complete");

    // Create SUMMARY.md with frontmatter
    const summaryPath = path.join(tempDir, "SUMMARY.md");
    fs.writeFileSync(
      summaryPath,
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    applyMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("deletes stale markers from same declaration (idempotency)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    // First run: create BLOCKED
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: blocked\n---\n# Summary\nBlocked.",
      "utf-8",
    );
    applyMarkers(tempDir, contract);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);

    // Second run: switch to completed — should delete BLOCKED, create COMPLETED
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );
    applyMarkers(tempDir, contract);
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
  });

  it("handles multiple marker declarations in one contract", async () => {
    const { applyMarkers } = await import("./mark-complete");

    // Create both output files
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: completed\n---\n# Summary\nDone.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tempDir, "REVIEW.md"),
      "---\ndecision: APPROVED\n---\n# Review\nApproved.",
      "utf-8",
    );

    const contract: import("../types").CapabilityContract = {
      inputs: [],
      outputs: [
        { name: "summary", file: "SUMMARY.md", schema: undefined },
        { name: "review", file: "REVIEW.md", schema: undefined },
      ],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" } as Record<
            string,
            string
          >,
        },
        {
          outputFile: "review",
          field: "decision",
          values: { APPROVED: "APPROVED", REJECTED: "REJECTED" } as Record<
            string,
            string
          >,
        },
      ],
    };

    applyMarkers(tempDir, contract);

    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "APPROVED"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "REJECTED"))).toBe(false);
  });

  it("handles missing output file (warns, no crash)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED" },
        },
      ],
    };

    // SUMMARY.md does not exist
    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("could not read frontmatter"),
    );
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);

    warnSpy.mockRestore();
  });

  it("handles unknown field value (warns, deletes stale, creates none)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    // Create a stale COMPLETED marker
    fs.writeFileSync(path.join(tempDir, "COMPLETED"), "", "utf-8");
    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nstatus: cancelled\n---\n# Summary\nCancelled.",
      "utf-8",
    );

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED", blocked: "BLOCKED" },
        },
      ],
    };

    applyMarkers(tempDir, contract);

    // Should warn about unknown value
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown value 'cancelled'"),
    );
    // Stale markers should be deleted
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "BLOCKED"))).toBe(false);
    // No new marker created

    warnSpy.mockRestore();
  });

  it("handles missing field key in frontmatter (warns, no crash)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    fs.writeFileSync(
      path.join(tempDir, "SUMMARY.md"),
      "---\nother: field\n---\n# Summary\nNo status.",
      "utf-8",
    );

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "summary",
          field: "status",
          values: { completed: "COMPLETED" },
        },
      ],
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("field 'status' not found"),
    );
    expect(fs.existsSync(path.join(tempDir, "COMPLETED"))).toBe(false);

    warnSpy.mockRestore();
  });

  it("handles output file name not found in contract (warns, no crash)", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const warnSpy = vi.spyOn(console, "warn");
    warnSpy.mockImplementation(() => {});

    const contract = {
      inputs: [],
      outputs: [{ name: "summary", file: "SUMMARY.md", schema: undefined }],
      markers: [
        {
          outputFile: "nonexistent",
          field: "status",
          values: { completed: "COMPLETED" },
        },
      ],
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("output 'nonexistent' not found"),
    );

    warnSpy.mockRestore();
  });

  it("handles undefined markers array as no-op", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      // markers is undefined
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
  });

  it("handles empty markers array as no-op", async () => {
    const { applyMarkers } = await import("./mark-complete");

    const contract = {
      inputs: [],
      outputs: [],
      markers: [],
    };

    expect(() => applyMarkers(tempDir, contract)).not.toThrow();
  });
});
