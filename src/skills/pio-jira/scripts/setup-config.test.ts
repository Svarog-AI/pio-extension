import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, "setup-config.sh");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-jira-test-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runScript(cwd: string, args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = cp.spawnSync("bash", [SCRIPT_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

function readConfig(cwd: string): string {
  return fs.readFileSync(path.join(cwd, ".pio", "jira-config.yaml"), "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("setup-config.sh", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("creates .pio/jira-config.yaml with correct projectKey and defaultType Task", () => {
    runScript(tempDir, ["PROJ"]);
    const content = readConfig(tempDir);
    expect(content).toBe('projectKey: "PROJ"\ndefaultType: "Task"\n');
  });

  it("sets custom defaultType when second argument is provided", () => {
    runScript(tempDir, ["PROJ", "Story"]);
    const content = readConfig(tempDir);
    expect(content).toBe('projectKey: "PROJ"\ndefaultType: "Story"\n');
  });

  it("exits non-zero and prints usage to stderr when no arguments given", () => {
    const { status, stderr } = runScript(tempDir, []);
    expect(status).not.toBe(0);
    expect(stderr).toContain("Usage");
  });

  it("exits non-zero when project key is an empty string", () => {
    const { status, stderr } = runScript(tempDir, [""]);
    expect(status).not.toBe(0);
    expect(stderr).toContain("Usage");
  });

  it("is idempotent — running twice produces identical output", () => {
    runScript(tempDir, ["PROJ"]);
    const first = readConfig(tempDir);
    runScript(tempDir, ["PROJ"]);
    const second = readConfig(tempDir);
    expect(first).toBe(second);
  });

  it("handles project keys with hyphens", () => {
    runScript(tempDir, ["MY-PROJ"]);
    const content = readConfig(tempDir);
    expect(content).toBe('projectKey: "MY-PROJ"\ndefaultType: "Task"\n');
  });

  it("creates .pio directory when it does not exist", () => {
    // tempDir has no .pio/ yet
    expect(fs.existsSync(path.join(tempDir, ".pio"))).toBe(false);
    runScript(tempDir, ["PROJ"]);
    expect(fs.existsSync(path.join(tempDir, ".pio"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, ".pio", "jira-config.yaml"))).toBe(true);
  });

  it("prints a confirmation message to stdout on success", () => {
    const { stdout } = runScript(tempDir, ["PROJ"]);
    expect(stdout).toContain("jira-config.yaml");
    expect(stdout).toContain("PROJ");
  });

  it("has a POSIX shebang (#!/bin/sh) as the first line", () => {
    const firstLine = fs.readFileSync(SCRIPT_PATH, "utf-8").split("\n")[0];
    expect(firstLine).toBe("#!/bin/sh");
  });

  it("has the executable bit set", () => {
    const stats = fs.statSync(SCRIPT_PATH);
    expect(stats.mode & 0o111).toBeTruthy();
  });
});
