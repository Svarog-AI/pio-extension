import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock child_process at top level (required by vitest)
// ---------------------------------------------------------------------------

const mockSpawn = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// ---------------------------------------------------------------------------
// Shared temp-dir helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-jira-to-issue-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Module exports verification
// ---------------------------------------------------------------------------

describe("module exports", () => {
  it("exports createIssue from create-issue.ts", async () => {
    const mod = await import("./create-issue");
    expect(typeof mod.createIssue).toBe("function");
  });

  it("exports setupJiraToIssue from jira-to-issue.ts", async () => {
    const mod = await import("./jira-to-issue");
    expect(typeof mod.setupJiraToIssue).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// fetchJiraIssue — core business logic
// ---------------------------------------------------------------------------

describe("fetchJiraIssue", () => {
  let tempDir: string;
  let fetchJiraIssue: (cwd: string, key: string) => Promise<string>;

  beforeEach(() => {
    tempDir = createTempDir();
    mockSpawn.mockClear();
  });

  afterEach(() => cleanup(tempDir));

  beforeEach(async () => {
    const mod = await import("./jira-to-issue");
    fetchJiraIssue = mod.fetchJiraIssue;
  });

  // Helper to create a mock child process emitter.
  function createMockChild(
    stdoutChunks: string[] = [],
    stderrChunks: string[] = [],
    exitCode: number = 0,
  ): unknown {
    const emitter = {
      stdout: {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === "data") {
            for (const chunk of stdoutChunks) {
              handler(Buffer.from(chunk));
            }
          }
          return emitter.stdout;
        },
      },
      stderr: {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === "data") {
            for (const chunk of stderrChunks) {
              handler(Buffer.from(chunk));
            }
          }
          return emitter.stderr;
        },
      },
      on: (event: string, handler: (...args: unknown[]) => void) => {
        if (event === "close") {
          handler(exitCode);
        }
        return emitter;
      },
    };
    return emitter;
  }

  it("calls runAcli with correct args [jira, workitem, view, key, --json]", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ summary: "Test", description: "Body" })], [], 0),
    );

    await fetchJiraIssue(tempDir, "PROJ-123");

    expect(mockSpawn).toHaveBeenCalledWith("acli", [
      "jira",
      "workitem",
      "view",
      "PROJ-123",
      "--json",
    ], expect.objectContaining({ cwd: tempDir }));
  });

  it("creates .pio/issues/jira-proj-123.md with correct content", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ summary: "Fix login bug", description: "Users cannot log in" })], [], 0),
    );

    const result = await fetchJiraIssue(tempDir, "PROJ-123");

    expect(result).toContain("Issue created at");
    const filePath = path.join(tempDir, ".pio", "issues", "jira-proj-123.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("# Fix login bug");
    expect(content).toContain("Users cannot log in");
  });

  it("file content follows the format '# {summary}\\n\\n{description}'", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ summary: "Title", description: "Body text" })], [], 0),
    );

    await fetchJiraIssue(tempDir, "PROJ-123");

    const filePath = path.join(tempDir, ".pio", "issues", "jira-proj-123.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toMatch(/^# Title\n\nBody text\n?$/);
  });

  it("falls back to key as title when summary field is missing", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ description: "Only description" })], [], 0),
    );

    await fetchJiraIssue(tempDir, "PROJ-456");

    const filePath = path.join(tempDir, ".pio", "issues", "jira-proj-456.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("# PROJ-456");
  });

  it("uses empty string for description when description field is missing", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ summary: "Only summary" })], [], 0),
    );

    await fetchJiraIssue(tempDir, "PROJ-789");

    const filePath = path.join(tempDir, ".pio", "issues", "jira-proj-789.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("# Only summary");
    // After the title and blank line, there should be nothing substantial
    const lines = content.trim().split("\n");
    expect(lines[0]).toBe("# Only summary");
    // Description is empty, so no ## Category or body content from description
    expect(lines.filter((l) => l.trim() !== "").length).toBeLessThanOrEqual(1);
  });

  it("returns a warning when the issue file already exists without calling runAcli", async () => {
    // Pre-create the issue file
    const issuesPath = path.join(tempDir, ".pio", "issues");
    fs.mkdirSync(issuesPath, { recursive: true });
    fs.writeFileSync(path.join(issuesPath, "jira-proj-123.md"), "# existing", "utf-8");

    const result = await fetchJiraIssue(tempDir, "PROJ-123");

    expect(result).toContain("already exists");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("returns the error message when runAcli returns AcliError", async () => {
    mockSpawn.mockReturnValue(
      createMockChild(
        [JSON.stringify({ error: "not found" })],
        ["issue not found"],
        1,
      ),
    );

    const result = await fetchJiraIssue(tempDir, "PROJ-999");

    expect(result).toContain("acli exited with code 1");
  });

  it("returns the authentication error when runAcli detects unauthorized", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([], ["unauthorized: use 'acli jira auth login'"], 1),
    );

    const result = await fetchJiraIssue(tempDir, "PROJ-123");

    expect(result).toContain("acli jira auth login");
  });

  it("handles complex key MY-PROJ-456 and produces slug jira-my-proj-456", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ summary: "Test", description: "Body" })], [], 0),
    );

    await fetchJiraIssue(tempDir, "MY-PROJ-456");

    const filePath = path.join(tempDir, ".pio", "issues", "jira-my-proj-456.md");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("preserves newlines in multi-line descriptions", async () => {
    const description = "Line one\nLine two\nLine three";
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ summary: "Multi-line", description })], [], 0),
    );

    await fetchJiraIssue(tempDir, "PROJ-100");

    const filePath = path.join(tempDir, ".pio", "issues", "jira-proj-100.md");
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("Line one");
    expect(content).toContain("Line two");
    expect(content).toContain("Line three");
  });
});

// ---------------------------------------------------------------------------
// jiraToIssueTool — tool definition
// ---------------------------------------------------------------------------

describe("jiraToIssueTool", () => {
  let jiraToIssueTool: { name: string; parameters: unknown; execute: Function };

  beforeEach(async () => {
    const mod = await import("./jira-to-issue");
    // Access the tool definition — defineTool returns an object with name, parameters, execute
    jiraToIssueTool = (mod as any).jiraToIssueTool;
  });

  it("has name pio_jira_to_issue", () => {
    expect(jiraToIssueTool.name).toBe("pio_jira_to_issue");
  });

  it("execute calls fetchJiraIssue with ctx.cwd and params.key", async () => {
    const tempDir = createTempDir();
    try {
      mockSpawn.mockReturnValue(
        {
          stdout: {
            on: (_event: string, _handler: Function) => ({ on: () => {} }),
          },
          stderr: {
            on: (_event: string, _handler: Function) => ({ on: () => {} }),
          },
          on: (event: string, handler: Function) => {
            if (event === "close") handler(0);
            return {};
          },
        },
      );

      // Re-import to get fresh module with mock active
      const mod = await import("./jira-to-issue");
      const tool = (mod as any).jiraToIssueTool;

      const ctx = { cwd: tempDir };
      const params = { key: "PROJ-123" };

      // Mock stdout to return valid JSON
      mockSpawn.mockReturnValueOnce(
        {
          stdout: {
            on: (event: string, handler: Function) => {
              if (event === "data") {
                handler(Buffer.from(JSON.stringify({ summary: "Test", description: "Body" })));
              }
              return { on: () => {} };
            },
          },
          stderr: { on: () => ({ on: () => {} }) },
          on: (event: string, handler: Function) => {
            if (event === "close") handler(0);
            return {};
          },
        },
      );

      const result = await tool.execute("test-call", params, null, () => {}, ctx);

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Issue created at");
    } finally {
      cleanup(tempDir);
    }
  });
});

// ---------------------------------------------------------------------------
// handleJiraToIssue — command handler
// ---------------------------------------------------------------------------

describe("handleJiraToIssue", () => {
  let handleJiraToIssue: (args: string | undefined, ctx: any) => Promise<void>;

  beforeEach(async () => {
    const mod = await import("./jira-to-issue");
    handleJiraToIssue = (mod as any).handleJiraToIssue;
  });

  it("shows usage notification when no args provided", async () => {
    const notify = vi.fn();
    const ctx = { ui: { notify } };

    await handleJiraToIssue(undefined, ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
      "warning",
    );
  });

  it("shows usage notification when empty args provided", async () => {
    const notify = vi.fn();
    const ctx = { ui: { notify } };

    await handleJiraToIssue("   ", ctx);

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage"),
      "warning",
    );
  });

  it("calls fetchJiraIssue with the key and notifies result", async () => {
    const tempDir = createTempDir();
    try {
      mockSpawn.mockReturnValue(
        {
          stdout: {
            on: (event: string, handler: Function) => {
              if (event === "data") {
                handler(Buffer.from(JSON.stringify({ summary: "Test", description: "Body" })));
              }
              return { on: () => {} };
            },
          },
          stderr: { on: () => ({ on: () => {} }) },
          on: (event: string, handler: Function) => {
            if (event === "close") handler(0);
            return {};
          },
        },
      );

      const notify = vi.fn();
      const ctx = { cwd: tempDir, ui: { notify } };

      await handleJiraToIssue("PROJ-123", ctx);

      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining("Issue created at"),
        "info",
      );
    } finally {
      cleanup(tempDir);
    }
  });
});

// ---------------------------------------------------------------------------
// setupJiraToIssue — registration
// ---------------------------------------------------------------------------

describe("setupJiraToIssue", () => {
  it("registers both a tool and a command", async () => {
    const registerTool = vi.fn();
    const registerCommand = vi.fn();
    const mockPi = { registerTool, registerCommand };

    const { setupJiraToIssue } = await import("./jira-to-issue");
    setupJiraToIssue(mockPi as any);

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerCommand).toHaveBeenCalledTimes(1);
    expect(registerCommand).toHaveBeenCalledWith(
      "pio-jira-to-issue",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });
});
