import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: create a minimal mock Pi API that captures event registrations
function makeMockPi() {
  const registeredHandlers: Record<string, Function[]> = {};

  const mockPi = {
    on: vi.fn((event: string, handler: Function) => {
      if (!registeredHandlers[event]) registeredHandlers[event] = [];
      registeredHandlers[event].push(handler);
      return () => {}; // return unsubscribe fn
    }),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    setModel: vi.fn(),
    sessionManager: {
      getSessionFile: vi.fn(),
      getEntries: vi.fn(() => []),
    },
  };

  return { mockPi, registeredHandlers };
}

// ---------------------------------------------------------------------------
// Skill registration — resources_discover returns correct skillPaths
// ---------------------------------------------------------------------------

describe("skill registration", () => {
  it("includes pio-project-knowledge in skillPaths", async () => {
    // Arrange: import the extension module fresh
    const mod = await import("./index");
    const extensionFactory = mod.default;

    const { mockPi, registeredHandlers } = makeMockPi();

    // Act: register the extension
    extensionFactory(mockPi as any);

    // Find the resources_discover handler
    const discoverHandler = registeredHandlers["resources_discover"]?.[0];
    expect(discoverHandler).toBeDefined();

    // Invoke it and check the returned skillPaths
    const result = await discoverHandler();

    expect(result.skillPaths).toBeDefined();
    expect(Array.isArray(result.skillPaths)).toBe(true);

    // Assert: pio-project-knowledge path is present
    const pioProjectKnowledgePath = result.skillPaths.find((p: string) =>
      p.includes("pio-project-knowledge")
    );
    expect(pioProjectKnowledgePath).toBeDefined();
  });

  it("includes pio-planning in skillPaths", async () => {
    // Arrange
    const mod = await import("./index");
    const extensionFactory = mod.default;

    const { mockPi, registeredHandlers } = makeMockPi();

    // Act: register the extension
    extensionFactory(mockPi as any);

    const discoverHandler = registeredHandlers["resources_discover"]?.[0];
    expect(discoverHandler).toBeDefined();

    const result = await discoverHandler();

    // Assert: pio-planning path is present
    const pioPlanningPath = result.skillPaths.find((p: string) =>
      p.includes("pio-planning")
    );
    expect(pioPlanningPath).toBeDefined();
  });

  it("skillPaths contain absolute paths under the skills directory", async () => {
    const mod = await import("./index");
    const extensionFactory = mod.default;

    const { mockPi, registeredHandlers } = makeMockPi();

    extensionFactory(mockPi as any);

    const discoverHandler = registeredHandlers["resources_discover"]?.[0];
    const result = await discoverHandler();

    const skillsDir = path.join(__dirname, "skills");

    for (const skillPath of result.skillPaths) {
      expect(path.isAbsolute(skillPath)).toBe(true);
      expect(skillPath).toContain("skills");
    }

    // Should include pio, test-driven-development, pio-project-knowledge, and pio-planning
    const skillNames = result.skillPaths.map((p: string) => path.basename(p));
    expect(skillNames).toContain("pio");
    expect(skillNames).toContain("test-driven-development");
    expect(skillNames).toContain("pio-project-knowledge");
    expect(skillNames).toContain("pio-planning");
  });
});

// ---------------------------------------------------------------------------
// Capability registration — all capabilities register tools and commands
// ---------------------------------------------------------------------------

describe("capability registration", () => {
  it("setupRevisePlan registers pio_revise_plan tool", async () => {
    // Arrange
    const mod = await import("./index");
    const extensionFactory = mod.default;

    const { mockPi } = makeMockPi();

    // Act: register the extension (calls all setup* functions)
    extensionFactory(mockPi as any);

    // Assert: pio_revise_plan tool was registered (registerTool receives tool definition object)
    const toolCalls = mockPi.registerTool.mock.calls;
    const revisePlanToolCall = toolCalls.find(
      (call: any[]) => call[0]?.name === "pio_revise_plan"
    );
    expect(revisePlanToolCall).toBeDefined();
  });

  it("setupRevisePlan registers pio-revise-plan command", async () => {
    // Arrange
    const mod = await import("./index");
    const extensionFactory = mod.default;

    const { mockPi } = makeMockPi();

    // Act: register the extension
    extensionFactory(mockPi as any);

    // Assert: pio-revise-plan command was registered (command names don't include leading /)
    const commandCalls = mockPi.registerCommand.mock.calls;
    const revisePlanCommandCall = commandCalls.find(
      (call: any[]) => call[0] === "pio-revise-plan"
    );
    expect(revisePlanCommandCall).toBeDefined();
  });
});


