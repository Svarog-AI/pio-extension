import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CapabilityConfig } from "./types";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pio-session-inputs-test-"));
}

function cleanup(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// Import the function under test — uses the real resolveContractPath
// (not the mock in capability-session.test.ts)
import { buildSessionInputsSection } from "./capability-session";

describe("buildSessionInputsSection", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  function makeConfig(overrides?: Partial<CapabilityConfig>): CapabilityConfig {
    return {
      capability: "test-cap",
      workspaceDir: tempDir,
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
      ...overrides,
    };
  }

  it("given a config with paramKey input and matching param when buildSessionInputsSection is called then it resolves the full filesystem path", () => {
    const config = makeConfig({
      contract: {
        inputs: [{ name: "goal", paramKey: "goalFile" }],
        outputs: [],
      },
    });
    const params = { goalFile: "GOAL.md" };

    const result = buildSessionInputsSection(config, tempDir, params);

    expect(result).toContain("--- SESSION INPUTS ---");
    expect(result).toContain(`Workspace directory: ${tempDir}`);
    expect(result).toContain("- goal: `");
    expect(result).toContain(path.join(tempDir, "GOAL.md"));
  });

  it("given a config with static file input when buildSessionInputsSection is called then it resolves the path from the file field", () => {
    const config = makeConfig({
      contract: {
        inputs: [{ name: "plan", file: "PLAN.md" }],
        outputs: [],
      },
    });

    const result = buildSessionInputsSection(config, tempDir, {});

    expect(result).toContain("- plan: `");
    expect(result).toContain(path.join(tempDir, "PLAN.md"));
  });

  it("given a config with both paramKey and static file inputs when buildSessionInputsSection is called then both are listed", () => {
    const config = makeConfig({
      contract: {
        inputs: [
          { name: "goal", paramKey: "goalFile" },
          { name: "plan", file: "PLAN.md" },
        ],
        outputs: [],
      },
    });
    const params = { goalFile: "GOAL.md" };

    const result = buildSessionInputsSection(config, tempDir, params);

    expect(result).toContain("- goal: `");
    expect(result).toContain(path.join(tempDir, "GOAL.md"));
    expect(result).toContain("- plan: `");
    expect(result).toContain(path.join(tempDir, "PLAN.md"));
  });

  it("given a config with no contract inputs when buildSessionInputsSection is called then it returns the section with workspace directory only", () => {
    const config = makeConfig({
      contract: { inputs: [], outputs: [] },
    });

    const result = buildSessionInputsSection(config, tempDir, {});

    expect(result).toContain("--- SESSION INPUTS ---");
    expect(result).toContain(`Workspace directory: ${tempDir}`);
    expect(result).not.toContain("Your capability was invoked");
  });

  it("given a config with missing contract when buildSessionInputsSection is called then it returns the section with workspace directory only", () => {
    // @ts-expect-error — testing missing contract gracefully
    const config: CapabilityConfig = {
      capability: "test-cap",
      workspaceDir: tempDir,
      allowProjectWrites: false,
    };

    const result = buildSessionInputsSection(config, tempDir, {});

    expect(result).toContain("--- SESSION INPUTS ---");
    expect(result).toContain(`Workspace directory: ${tempDir}`);
    expect(result).not.toContain("Your capability was invoked");
  });

  it("given a paramKey input with missing param value when buildSessionInputsSection is called then it skips the unresolvable input gracefully", () => {
    const config = makeConfig({
      contract: {
        inputs: [
          { name: "goal", paramKey: "goalFile" },
          { name: "plan", file: "PLAN.md" },
        ],
        outputs: [],
      },
    });
    // goalFile is missing — should be skipped; plan should still appear

    const result = buildSessionInputsSection(config, tempDir, {});

    // goal should NOT appear (unresolvable)
    expect(result).not.toContain("- goal:");
    // plan should still appear (static file)
    expect(result).toContain("- plan: `");
    expect(result).toContain(path.join(tempDir, "PLAN.md"));
  });

  it("given a paramKey input with a non-string param value when buildSessionInputsSection is called then it skips the input gracefully but still returns workspace directory", () => {
    const config = makeConfig({
      contract: {
        inputs: [{ name: "goal", paramKey: "goalFile" }],
        outputs: [],
      },
    });
    const params = { goalFile: 123 }; // not a string

    const result = buildSessionInputsSection(config, tempDir, params);

    // goal should NOT appear (non-string param)
    expect(result).not.toContain("- goal:");
    // But workspace dir section should still be present
    expect(result).toContain("--- SESSION INPUTS ---");
    expect(result).toContain(`Workspace directory: ${tempDir}`);
  });

  it("given a paramKey input with an empty string param value when buildSessionInputsSection is called then it skips the input gracefully but still returns workspace directory", () => {
    const config = makeConfig({
      contract: {
        inputs: [{ name: "goal", paramKey: "goalFile" }],
        outputs: [],
      },
    });
    const params = { goalFile: "" }; // empty string

    const result = buildSessionInputsSection(config, tempDir, params);

    // goal should NOT appear (empty string treated as missing)
    expect(result).not.toContain("- goal:");
    // But workspace dir section should still be present
    expect(result).toContain("--- SESSION INPUTS ---");
    expect(result).toContain(`Workspace directory: ${tempDir}`);
  });

  it("given a config with no params at all when buildSessionInputsSection is called then it resolves static file inputs and skips paramKey inputs", () => {
    const config = makeConfig({
      contract: {
        inputs: [
          { name: "plan", file: "PLAN.md" },
          { name: "goal", paramKey: "goalFile" },
        ],
        outputs: [],
      },
    });

    const result = buildSessionInputsSection(config, tempDir);

    // plan should appear (static file)
    expect(result).toContain("- plan: `");
    expect(result).toContain(path.join(tempDir, "PLAN.md"));
    // goal should NOT appear (paramKey without params)
    expect(result).not.toContain("- goal:");
  });

  it("given a config with projectRelative input when buildSessionInputsSection is called then it resolves from pio root", () => {
    const config = makeConfig({
      contract: {
        inputs: [
          {
            name: "overview",
            file: "PROJECT/OVERVIEW.md",
            projectRelative: true,
          },
        ],
        outputs: [],
      },
    });

    const result = buildSessionInputsSection(config, tempDir, {});

    expect(result).toContain("- overview: `");
    // Should resolve from .pio/ root, not workspace dir
    expect(result).toContain(".pio/PROJECT/OVERVIEW.md");
  });

  it("given resolved inputs when the output format is checked then it contains workspace directory first followed by input list with backtick-wrapped paths", () => {
    const config = makeConfig({
      contract: {
        inputs: [
          { name: "goal", paramKey: "goalFile" },
          { name: "plan", file: "PLAN.md" },
        ],
        outputs: [],
      },
    });
    const params = { goalFile: "GOAL.md" };

    const result = buildSessionInputsSection(config, tempDir, params);

    // Verify format: header, workspace dir, then input list
    expect(result).toMatch(/^--- SESSION INPUTS ---\n\n/);
    expect(result).toContain(`Workspace directory: ${tempDir}`);
    expect(result).toContain("Your capability was invoked with these inputs:");
    expect(result).toContain("- goal: `");
    expect(result).toContain("`");
    // Workspace dir must appear before the inputs list
    const wsIdx = result.indexOf("Workspace directory:");
    const inputsIdx = result.indexOf("Your capability was invoked");
    expect(wsIdx).toBeLessThan(inputsIdx);
  });
});
