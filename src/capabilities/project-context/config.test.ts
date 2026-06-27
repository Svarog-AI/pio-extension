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

  it("registers a command named pio-project-context", () => {
    const registeredCommands: Array<{
      name: string;
      options: { description: string };
    }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(
        (name: string, options: { description: string; handler: Function }) => {
          registeredCommands.push({ name, options });
        },
      ),
    };

    register(mockPi as any);

    const command = registeredCommands.find(
      (c) => c.name === "pio-project-context",
    );
    expect(command).toBeDefined();
  });

  it("command description references multi-file output", () => {
    const registeredCommands: Array<{
      name: string;
      options: { description: string };
    }> = [];

    const mockPi = {
      registerTool: vi.fn(),
      registerCommand: vi.fn(
        (name: string, options: { description: string; handler: Function }) => {
          registeredCommands.push({ name, options });
        },
      ),
    };

    register(mockPi as any);

    const command = registeredCommands.find(
      (c) => c.name === "pio-project-context",
    );
    expect(command).toBeDefined();
    expect(command?.options.description).not.toMatch(/\.pio\/PROJECT\.md\b/);
    expect(command?.options.description).toMatch(/\.pio\/PROJECT\//);
  });
});
