import { describe, expect, it, vi } from "vitest";
import config, { register } from "./config";

// ---------------------------------------------------------------------------
// config.writeAllowlist
// ---------------------------------------------------------------------------

describe("config.writeAllowlist", () => {
  it("contains exactly 7 file paths", () => {
    expect(config.writeAllowlist).toHaveLength(7);
  });

  it("includes OVERVIEW.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/OVERVIEW.md");
  });

  it("includes DEVELOPMENT.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/DEVELOPMENT.md");
  });

  it("includes CONVENTIONS.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/CONVENTIONS.md");
  });

  it("includes GIT.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/GIT.md");
  });

  it("includes ARCHITECTURE.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/ARCHITECTURE.md");
  });

  it("includes DEPENDENCIES.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/DEPENDENCIES.md");
  });

  it("includes GLOSSARY.md", () => {
    expect(config.writeAllowlist).toContain(".pio/PROJECT/GLOSSARY.md");
  });

  it("does not include the old PROJECT.md path", () => {
    expect(config.writeAllowlist).not.toContain(".pio/PROJECT.md");
  });
});

// ---------------------------------------------------------------------------
// config.contract.outputs
// ---------------------------------------------------------------------------

describe("config.contract.outputs", () => {
  const expected: Array<[string, string]> = [
    ["overview", "PROJECT/OVERVIEW.md"],
    ["development", "PROJECT/DEVELOPMENT.md"],
    ["conventions", "PROJECT/CONVENTIONS.md"],
    ["git", "PROJECT/GIT.md"],
    ["architecture", "PROJECT/ARCHITECTURE.md"],
    ["dependencies", "PROJECT/DEPENDENCIES.md"],
    ["glossary", "PROJECT/GLOSSARY.md"],
  ];

  it("declares exactly 7 contract outputs", () => {
    expect(config.contract.outputs).toHaveLength(7);
  });

  it.each(expected)("declares %s → %s", (name, file) => {
    const entry = (
      config.contract.outputs as Array<{ name: string; file?: string }>
    ).find((o) => o.name === name);
    expect(entry).toBeDefined();
    expect(entry?.file).toBe(file);
  });

  it("marks every output projectRelative and not required", () => {
    for (const output of config.contract.outputs as Array<{
      projectRelative?: boolean;
      requiredWhen?: (params?: Record<string, unknown>) => boolean;
    }>) {
      expect(output.projectRelative).toBe(true);
      expect(output.requiredWhen?.()).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  it("registers a tool named pio_create_project_context", () => {
    const registeredTools: Array<{ name: string }> = [];

    const mockPi = {
      registerTool: vi.fn((tool: { name: string }) => {
        registeredTools.push({ name: tool.name });
      }),
      registerCommand: vi.fn(),
    };

    register(mockPi as any);

    const tool = registeredTools.find(
      (t) => t.name === "pio_create_project_context",
    );
    expect(tool).toBeDefined();
  });
});
