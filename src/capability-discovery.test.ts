import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { discoverCapabilities, registerCapability } from "./capability-discovery";

// ---------------------------------------------------------------------------
// discoverCapabilities
// ---------------------------------------------------------------------------

describe("discoverCapabilities", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pio-discovery-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty array when capabilities directory does not exist", async () => {
    // baseDir has no capabilities/ subdirectory
    const result = await discoverCapabilities(tempDir);
    expect(result).toEqual([]);
  });

  it("returns empty array when capabilities directory is empty", async () => {
    // Arrange: create empty capabilities directory
    fs.mkdirSync(path.join(tempDir, "capabilities"), { recursive: true });

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toEqual([]);
  });

  it("ignores non-directory entries (single .ts files)", async () => {
    // Arrange: create a .ts file directly in capabilities/ (old-style capability)
    fs.mkdirSync(path.join(tempDir, "capabilities"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "capabilities", "old-style-cap.ts"),
      'export const CAPABILITY_CONFIG = { capability: "old" };'
    );

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toEqual([]);
  });

  it("ignores directories without config.ts", async () => {
    // Arrange: create a directory without config.ts
    fs.mkdirSync(path.join(tempDir, "capabilities", "incomplete-cap"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "capabilities", "incomplete-cap", "role.md"),
      "# Role"
    );

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toEqual([]);
  });

  it("discovers a valid capability package with config.ts", async () => {
    // Arrange: create a valid capability package
    const capDir = path.join(tempDir, "capabilities", "test-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "config.ts"),
      `import type { CapabilityPackageConfig } from "../capability-package";
const config: CapabilityPackageConfig = {
  capability: "test-cap",
  defaultInitialMessage: () => "Hello",
};
export default config;`
    );

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("test-cap");
    expect(result[0].dirPath).toBe(capDir);
    expect(result[0].config.capability).toBe("test-cap");
    expect(result[0].config.defaultInitialMessage("/tmp")).toBe("Hello");
  });

  it("discovers multiple capability packages", async () => {
    // Arrange: create two valid packages
    for (const name of ["cap-alpha", "cap-beta"]) {
      const capDir = path.join(tempDir, "capabilities", name);
      fs.mkdirSync(capDir, { recursive: true });
      fs.writeFileSync(
        path.join(capDir, "config.ts"),
        `const config = {
  capability: "${name}",
  defaultInitialMessage: () => "Msg from ${name}",
};
export default config;`
      );
    }

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toHaveLength(2);
    const names = result.map((d) => d.name).sort();
    expect(names).toEqual(["cap-alpha", "cap-beta"]);
  });

  it("logs warning and skips when config import fails (no default export)", async () => {
    // Arrange: config.ts exists but has no default export
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const capDir = path.join(tempDir, "capabilities", "bad-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "config.ts"),
      `export const namedExport = { capability: "bad-cap" };`
    );

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("logs warning and skips when config.ts has syntax error", async () => {
    // Arrange: config.ts with invalid syntax
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const capDir = path.join(tempDir, "capabilities", "syntax-error-cap");
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
      path.join(capDir, "config.ts"),
      `this is not valid typescript {{{`
    );

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // registerCapability
  // ---------------------------------------------------------------------------

  describe("registerCapability", () => {
    it("calls mod.register(pi) when the export exists", async () => {
      // Arrange: create a valid capability package with register()
      const capDir = path.join(tempDir, "capabilities", "reg-cap");
      fs.mkdirSync(capDir, { recursive: true });
      fs.writeFileSync(
        path.join(capDir, "config.ts"),
        `
let registered = false;
export const register = (pi) => { registered = true; };
export const isRegistered = () => registered;
const config = {
  capability: "reg-cap",
  defaultInitialMessage: () => "Hello",
};
export default config;`
      );

      // Import to get the module reference
      const mod = await import(path.join(capDir, "config.ts"));

      const mockPi = { registerTool: vi.fn(), registerCommand: vi.fn() };

      // Act
      await registerCapability(mockPi as any, {
        name: "reg-cap",
        dirPath: capDir,
        config: mod.default,
      });

      // Assert
      expect(mod.isRegistered()).toBe(true);
    });

    it("logs warning and skips when register() is missing", async () => {
      // Arrange: config.ts has default export but no register()
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const capDir = path.join(tempDir, "capabilities", "no-register-cap");
      fs.mkdirSync(capDir, { recursive: true });
      fs.writeFileSync(
        path.join(capDir, "config.ts"),
        `
const config = {
  capability: "no-register-cap",
  defaultInitialMessage: () => "Hello",
};
export default config;`
      );

      const mod = await import(path.join(capDir, "config.ts"));

      const mockPi = { registerTool: vi.fn(), registerCommand: vi.fn() };

      // Act
      await registerCapability(mockPi as any, {
        name: "no-register-cap",
        dirPath: capDir,
        config: mod.default,
      });

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("has no register() export")
      );
      warnSpy.mockRestore();
    });

    it("logs warning and continues when import fails", async () => {
      // Arrange: descriptor points to non-existent directory
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const mockPi = { registerTool: vi.fn(), registerCommand: vi.fn() };

      // Act
      await registerCapability(mockPi as any, {
        name: "missing-cap",
        dirPath: "/nonexistent/path",
        config: {
          capability: "missing-cap",
          defaultInitialMessage: () => "Hello",
        },
      });

      // Assert: no throw, just a warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to register")
      );
      warnSpy.mockRestore();
    });
  });

  it("skips malformed config and still discovers valid packages", async () => {
    // Arrange: one bad package, one good package
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const badDir = path.join(tempDir, "capabilities", "bad-cap");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "config.ts"), `export const x = 1;`);

    const goodDir = path.join(tempDir, "capabilities", "good-cap");
    fs.mkdirSync(goodDir, { recursive: true });
    fs.writeFileSync(
      path.join(goodDir, "config.ts"),
      `const config = {
  capability: "good-cap",
  defaultInitialMessage: () => "OK",
};
export default config;`
    );

    // Act
    const result = await discoverCapabilities(tempDir);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("good-cap");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
