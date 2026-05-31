import { describe, it, expect, vi } from "vitest";
import { CAPABILITY_CONFIG, register } from "./config";

// ---------------------------------------------------------------------------
// CAPABILITY_CONFIG.writeAllowlist
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG.writeAllowlist", () => {
  it("contains exactly 7 file paths", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toHaveLength(7);
  });

  it("includes OVERVIEW.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/OVERVIEW.md");
  });

  it("includes DEVELOPMENT.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/DEVELOPMENT.md");
  });

  it("includes CONVENTIONS.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/CONVENTIONS.md");
  });

  it("includes GIT.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/GIT.md");
  });

  it("includes ARCHITECTURE.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/ARCHITECTURE.md");
  });

  it("includes DEPENDENCIES.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/DEPENDENCIES.md");
  });

  it("includes GLOSSARY.md", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).toContain(".pio/PROJECT/GLOSSARY.md");
  });

  it("does not include the old PROJECT.md path", () => {
    expect(CAPABILITY_CONFIG.writeAllowlist).not.toContain(".pio/PROJECT.md");
  });
});

// ---------------------------------------------------------------------------
// register (previously setupProjectContext)
// ---------------------------------------------------------------------------

describe("register", () => {
  it("registers a command named pio-project-context", () => {
    const registeredCommands: Array<{ name: string; options: { description: string } }> = [];

    const mockPi = {
      registerCommand: vi.fn((name: string, options: { description: string; handler: Function }) => {
        registeredCommands.push({ name, options });
      }),
    };

    register(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-project-context");
    expect(command).toBeDefined();
  });

  it("command description references multi-file output", () => {
    const registeredCommands: Array<{ name: string; options: { description: string } }> = [];

    const mockPi = {
      registerCommand: vi.fn((name: string, options: { description: string; handler: Function }) => {
        registeredCommands.push({ name, options });
      }),
    };

    register(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-project-context");
    expect(command).toBeDefined();
    expect(command!.options.description).not.toMatch(/\.pio\/PROJECT\.md\b/);
    expect(command!.options.description).toMatch(/\.pio\/PROJECT\//);
  });
});
