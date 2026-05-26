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
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-jira-utils-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// jiraKeyToSlug — pure function, no I/O
// ---------------------------------------------------------------------------

describe("jiraKeyToSlug", () => {
  let jiraKeyToSlug: (key: string) => string;

  beforeEach(async () => {
    const mod = await import("./jira-utils");
    jiraKeyToSlug = mod.jiraKeyToSlug;
  });

  it("converts PROJ-123 to jira-proj-123", () => {
    expect(jiraKeyToSlug("PROJ-123")).toBe("jira-proj-123");
  });

  it("converts mixed-case My-Project-456 to jira-my-project-456", () => {
    expect(jiraKeyToSlug("My-Project-456")).toBe("jira-my-project-456");
  });

  it("converts single-word key ABC-1 to jira-abc-1", () => {
    expect(jiraKeyToSlug("ABC-1")).toBe("jira-abc-1");
  });
});

// ---------------------------------------------------------------------------
// readJiraConfig — file I/O with temp directories
// ---------------------------------------------------------------------------

describe("readJiraConfig", () => {
  let tempDir: string;
  let readJiraConfig: (cwd: string) => { projectKey?: string; defaultType?: string } | undefined;

  beforeEach(async () => {
    tempDir = createTempDir();
    const mod = await import("./jira-utils");
    readJiraConfig = mod.readJiraConfig;
  });

  afterEach(() => cleanup(tempDir));

  it("returns undefined when config file does not exist", () => {
    expect(readJiraConfig(tempDir)).toBeUndefined();
  });

  it("returns undefined when config file is empty", () => {
    const configPath = path.join(tempDir, ".pio", "jira-config.yaml");
    fs.mkdirSync(path.join(tempDir, ".pio"), { recursive: true });
    fs.writeFileSync(configPath, "", "utf-8");

    expect(readJiraConfig(tempDir)).toBeUndefined();
  });

  it("returns typed JiraConfig with projectKey and defaultType from valid YAML", () => {
    const configPath = path.join(tempDir, ".pio", "jira-config.yaml");
    fs.mkdirSync(path.join(tempDir, ".pio"), { recursive: true });
    fs.writeFileSync(configPath, "projectKey: PROJ\ndefaultType: Task\n", "utf-8");

    const result = readJiraConfig(tempDir);

    expect(result).toBeDefined();
    expect(result!.projectKey).toBe("PROJ");
    expect(result!.defaultType).toBe("Task");
  });

  it("returns JiraConfig with defaultType undefined when only projectKey present", () => {
    const configPath = path.join(tempDir, ".pio", "jira-config.yaml");
    fs.mkdirSync(path.join(tempDir, ".pio"), { recursive: true });
    fs.writeFileSync(configPath, "projectKey: PROJ\n", "utf-8");

    const result = readJiraConfig(tempDir);

    expect(result).toBeDefined();
    expect(result!.projectKey).toBe("PROJ");
    expect(result!.defaultType).toBeUndefined();
  });

  it("returns undefined for malformed YAML", () => {
    const configPath = path.join(tempDir, ".pio", "jira-config.yaml");
    fs.mkdirSync(path.join(tempDir, ".pio"), { recursive: true });
    fs.writeFileSync(configPath, ": : :\n  - bad: [yaml: content", "utf-8");

    expect(readJiraConfig(tempDir)).toBeUndefined();
  });

  it("returns undefined when projectKey is not a string", () => {
    const configPath = path.join(tempDir, ".pio", "jira-config.yaml");
    fs.mkdirSync(path.join(tempDir, ".pio"), { recursive: true });
    fs.writeFileSync(configPath, "projectKey: 123\ndefaultType: Task\n", "utf-8");

    expect(readJiraConfig(tempDir)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// runAcli — child process spawning (mocked)
// ---------------------------------------------------------------------------

describe("runAcli", () => {
  let tempDir: string;
  let runAcli: (cwd: string, args: string[]) => Promise<unknown>;

  beforeEach(() => {
    tempDir = createTempDir();
    mockSpawn.mockClear();
  });

  afterEach(() => {
    cleanup(tempDir);
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    const mod = await import("./jira-utils");
    runAcli = mod.runAcli;
  });

  // Helper to create a mock child process emitter.
  // Models real child_process semantics: when errorEvent is set, only the
  // `error` event fires (no process was spawned → no `close`). When no
  // errorEvent, only `close` fires after data events.
  function createMockChild(
    stdoutChunks: string[] = [],
    stderrChunks: string[] = [],
    exitCode: number = 0,
    errorEvent?: Error,
  ): unknown {
    const emitter = {
      _listeners: {} as Record<string, ((...args: unknown[]) => void)[]>,
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
        emitter._listeners[event] = emitter._listeners[event] || [];
        emitter._listeners[event].push(handler);

        if (errorEvent) {
          // Error event path: process never spawned → only fire `error`, never `close`
          if (event === "error") {
            handler(errorEvent);
          }
        } else {
          // Normal path: process ran → fire `close` with exit code
          if (event === "close") {
            handler(exitCode);
          }
        }

        return emitter;
      },
    };
    return emitter;
  }

  it("returns AcliError when acli is not found on PATH (ENOENT)", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([], [], 0, new Error("spawn acli ENOENT")),
    );

    const result = await runAcli(tempDir, ["jira", "workitem", "view", "PROJ-123"]);

    expect((result as { error?: string }).error).toBeDefined();
    expect((result as { error?: string }).error).toContain("acli");
  });

  it("returns AcliError when acli output contains unauthorized in stderr", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([], ["unauthorized: use 'acli jira auth login' to authenticate"], 1),
    );

    const result = await runAcli(tempDir, ["jira", "workitem", "view", "PROJ-123"]);

    expect((result as { error?: string }).error).toBeDefined();
    expect((result as { error?: string }).error).toContain("acli jira auth login");
  });

  it("returns AcliError when stdout contains Unauthorized (case-insensitive)", async () => {
    mockSpawn.mockReturnValue(
      createMockChild(["Unauthorized access"], [], 0),
    );

    const result = await runAcli(tempDir, ["jira", "workitem", "view", "PROJ-123"]);

    expect((result as { error?: string }).error).toBeDefined();
    expect((result as { error?: string }).error).toContain("acli jira auth login");
  });

  it("returns AcliResult with parsed stdout when acli returns valid JSON", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ key: "PROJ-123", summary: "Test ticket" })], [], 0),
    );

    const result = await runAcli(tempDir, ["jira", "workitem", "view", "PROJ-123"]);

    expect((result as { error?: string }).error).toBeUndefined();
    expect((result as { stdout?: Record<string, unknown> }).stdout).toEqual({
      key: "PROJ-123",
      summary: "Test ticket",
    });
  });

  it("returns AcliError when acli returns non-JSON text", async () => {
    mockSpawn.mockReturnValue(
      createMockChild(["This is not JSON"], ["some error output"], 0),
    );

    const result = await runAcli(tempDir, ["jira", "workitem", "view", "PROJ-123"]);

    expect((result as { error?: string }).error).toBeDefined();
  });

  it("returns AcliError when acli exits non-zero even with valid JSON", async () => {
    mockSpawn.mockReturnValue(
      createMockChild([JSON.stringify({ key: "PROJ-123" })], ["operation failed"], 1),
    );

    const result = await runAcli(tempDir, ["jira", "workitem", "view", "PROJ-123"]);

    expect((result as { error?: string }).error).toBeDefined();
    expect((result as { error?: string }).error).toContain("1");
  });
});

// ---------------------------------------------------------------------------
// Module exports verification
// ---------------------------------------------------------------------------

describe("module exports", () => {
  it("exports runAcli, readJiraConfig, and jiraKeyToSlug", async () => {
    const mod = await import("./jira-utils");

    expect(typeof mod.runAcli).toBe("function");
    expect(typeof mod.readJiraConfig).toBe("function");
    expect(typeof mod.jiraKeyToSlug).toBe("function");
  });
});
