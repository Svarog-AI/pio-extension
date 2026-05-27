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

    // Should include all six skills (filesystem discovery)
    const skillNames = result.skillPaths.map((p: string) => path.basename(p));
    expect(skillNames).toContain("pio");
    expect(skillNames).toContain("tdd");
    expect(skillNames).toContain("pio-project-knowledge");
    expect(skillNames).toContain("pio-planning");
    expect(skillNames).toContain("write-a-skill");
    expect(skillNames).toContain("pio-git");
  });

  it("discovers skills via filesystem scanning — new skill directories with SKILL.md are auto-registered", async () => {
    // Arrange: create a temporary skill directory
    const skillsDir = path.join(__dirname, "skills");
    const tempSkillDir = path.join(skillsDir, "_test-temp-skill");
    const tempSkillFile = path.join(tempSkillDir, "SKILL.md");

    fs.mkdirSync(tempSkillDir, { recursive: true });
    fs.writeFileSync(tempSkillFile, "---\nname: _test-temp-skill\ndescription: temp\n---\n");

    try {
      // Act: import fresh and register
      const mod = await import("./index");
      const extensionFactory = mod.default;

      const { mockPi, registeredHandlers } = makeMockPi();
      extensionFactory(mockPi as any);

      const discoverHandler = registeredHandlers["resources_discover"]?.[0];
      const result = await discoverHandler();

      // Assert: the new skill is discovered without any code changes
      const skillNames = result.skillPaths.map((p: string) => path.basename(p));
      expect(skillNames).toContain("_test-temp-skill");
    } finally {
      // Cleanup
      fs.unlinkSync(tempSkillFile);
      fs.rmdirSync(tempSkillDir);
    }
  });

  it("skips directories without SKILL.md during filesystem discovery", async () => {
    // Arrange: create a directory without SKILL.md
    const skillsDir = path.join(__dirname, "skills");
    const tempDir = path.join(skillsDir, "_test-no-skill-file");

    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Act
      const mod = await import("./index");
      const extensionFactory = mod.default;

      const { mockPi, registeredHandlers } = makeMockPi();
      extensionFactory(mockPi as any);

      const discoverHandler = registeredHandlers["resources_discover"]?.[0];
      const result = await discoverHandler();

      // Assert: directory without SKILL.md is not registered
      const skillNames = result.skillPaths.map((p: string) => path.basename(p));
      expect(skillNames).not.toContain("_test-no-skill-file");
    } finally {
      // Cleanup
      fs.rmdirSync(tempDir);
    }
  });
});

// ---------------------------------------------------------------------------
// pio-git skill file content
// ---------------------------------------------------------------------------

describe("pio-git skill", () => {
  const skillPath = path.join(__dirname, "skills", "pio-git", "SKILL.md");

  it("src/skills/pio-git/SKILL.md exists", () => {
    expect(fs.existsSync(skillPath)).toBe(true);
  });

  it("YAML frontmatter contains name: pio-git", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toMatch(/^---\s*\n[^-]*name:\s*pio-git/m);
  });

  it("frontmatter description is under 1024 chars and includes a trigger phrase", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/m);
    expect(frontmatterMatch).not.toBeNull();
    const descriptionMatch = frontmatterMatch![1].match(/description:\s*(.+)/);
    expect(descriptionMatch).not.toBeNull();
    const description = descriptionMatch![1].trim();
    expect(description.length).toBeLessThan(1024);
    expect(description.toLowerCase()).toContain("use when");
  });

  it("documents convention lookup rule — read .pio/PROJECT/GIT.md before operations", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain(".pio/PROJECT/GIT.md");
  });

  it("documents unified staged commit protocol — SUMMARY.md extraction and git status --porcelain fallback", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("SUMMARY.md");
    expect(content).toContain("git status --porcelain");
  });

  it("specifies git add <paths> staging method and prohibits git add -A", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toMatch(/git add\s+/);
    expect(content).toMatch(/git add -A/i);
    // Should say NOT to use git add -A
    expect(content).toMatch(/never.*git add -A|do not.*git add -A|not.*git add -A|avoid.*git add -A|must not.*git add -A/i);
  });

  it("specifies commit messages as short descriptive one-liners without Step N substrings", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    // Should reference the "Step N" pattern (with letter N as placeholder or digit)
    expect(content).toMatch(/"Step [N\d]"|'Step [N\d]'|Step [N\d]/);
    // And should say NOT to include it
    expect(content).toMatch(/no.*Step|without.*Step|not.*Step|avoid.*Step|must not.*Step|do not.*Step/i);
  });

  it("documents graceful failure semantics — warn and proceed, never block", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toMatch(/warn.*proceed|proceed.*warn|never block|never.*block|graceful/i);
  });

  it("structures for future git operations — mentions branch checkout and PR creation", () => {
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content.toLowerCase()).toMatch(/branch.*checkout|checkout.*branch/i);
    expect(content.toLowerCase()).toMatch(/pr.*creation|pull.?request|create.*pr/i);
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


