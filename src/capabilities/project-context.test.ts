import { describe, it, expect, vi } from "vitest";
import { CAPABILITY_CONFIG, setupProjectContext } from "./project-context";

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
// CAPABILITY_CONFIG.defaultInitialMessage
// ---------------------------------------------------------------------------

describe("CAPABILITY_CONFIG.defaultInitialMessage", () => {
  it("returns a non-empty string", () => {
    const result = CAPABILITY_CONFIG.defaultInitialMessage("/tmp/test");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("references multi-file structure (not single PROJECT.md)", () => {
    const result = CAPABILITY_CONFIG.defaultInitialMessage("/tmp/test");
    // Should NOT reference the old single-file path
    expect(result).not.toMatch(/\.pio\/PROJECT\.md\b/);
    // Should reference the new directory or multiple files
    expect(result).toMatch(/\.pio\/PROJECT\//);
  });

  it("incorporates workingDir into the message", () => {
    const workingDir = "/home/user/my-project";
    const result = CAPABILITY_CONFIG.defaultInitialMessage(workingDir);
    expect(result).toContain(workingDir);
  });
});

// ---------------------------------------------------------------------------
// setupProjectContext
// ---------------------------------------------------------------------------

describe("setupProjectContext", () => {
  it("registers a command named pio-project-context", () => {
    const registeredCommands: Array<{ name: string; options: { description: string } }> = [];

    const mockPi = {
      registerCommand: vi.fn((name: string, options: { description: string; handler: Function }) => {
        registeredCommands.push({ name, options });
      }),
    };

    setupProjectContext(mockPi as any);

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

    setupProjectContext(mockPi as any);

    const command = registeredCommands.find((c) => c.name === "pio-project-context");
    expect(command).toBeDefined();
    expect(command!.options.description).not.toMatch(/\.pio\/PROJECT\.md\b/);
    expect(command!.options.description).toMatch(/\.pio\/PROJECT\//);
  });
});
