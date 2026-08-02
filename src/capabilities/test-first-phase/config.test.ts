import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config, { CONTRACT, register } from "./config";
import workflow from "./workflow";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("test-first-phase capability", () => {
  describe("config.ts", () => {
    it("default-exports a valid CapabilityPackageConfig", () => {
      expect(config.capability).toBe("test-first-phase");
      expect(config.contract).toBe(CONTRACT);
      expect(config.writeAllowlist).toContain("FIRST_PHASE_RESULT.md");
    });

    it("contract has empty inputs", () => {
      expect(config.contract.inputs).toEqual([]);
    });

    it("contract outputs contain first-phase-result", () => {
      expect(config.contract.outputs).toEqual([
        { name: "first-phase-result", file: "FIRST_PHASE_RESULT.md" },
      ]);
    });

    it("exports a register function", () => {
      expect(typeof register).toBe("function");
    });
  });

  describe("workflow.ts", () => {
    it("exports exactly one phase", () => {
      expect(workflow).toHaveLength(1);
    });

    it("phase has required properties", () => {
      const phase = workflow[0];
      expect(phase.id).toBe("first-phase-diagnostic");
      expect(phase.title).toBe("First Phase Diagnostic");
      expect(typeof phase.instructions).toBe("string");
      expect(phase.instructions.length).toBeGreaterThan(0);
      expect(phase.write).toEqual(["first-phase-result"]);
    });

    it("phase does NOT have loop fields", () => {
      const phase = workflow[0] as Record<string, unknown>;
      expect("minIterations" in phase).toBe(false);
      expect("maxIterations" in phase).toBe(false);
      expect("terminateWhen" in phase).toBe(false);
      expect("loopWhile" in phase).toBe(false);
      expect("loopMessage" in phase).toBe(false);
      expect("variables" in phase).toBe(false);
      expect("kind" in phase).toBe(false);
    });
  });

  describe("supporting files", () => {
    it("role.md exists and mentions diagnostic purpose", () => {
      const content = fs.readFileSync(path.join(__dirname, "role.md"), "utf-8");
      expect(content.length).toBeGreaterThan(0);
      expect(content.toLowerCase()).toContain("diagnostic");
    });

    it("guidelines.md exists and directs agent to write FIRST_PHASE_RESULT.md", () => {
      const content = fs.readFileSync(
        path.join(__dirname, "guidelines.md"),
        "utf-8",
      );
      expect(content).toContain("FIRST_PHASE_RESULT.md");
      expect(content).toContain("pio_mark_complete");
    });
  });
});
