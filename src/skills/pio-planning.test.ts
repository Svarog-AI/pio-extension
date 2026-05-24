import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("pio-planning SKILL.md", () => {
  let skillContent: string;

  beforeEach(() => {
    skillContent = readFileSync(
      join(__dirname, "pio-planning", "SKILL.md"),
      "utf-8"
    );
  });

  describe("Overview section", () => {
    it("contains exactly 8 numbered items in the Overview list", () => {
      const overviewMatch = skillContent.match(
        /## Overview[\s\S]*?(?=## \w)/
      );
      expect(overviewMatch).toBeDefined();

      const overviewSection = overviewMatch![0];
      const numberedItems = overviewSection.match(/^\d+\.\s\*\*[^*]+\*\*/gm);
      expect(numberedItems).toBeDefined();
      expect(numberedItems!.length).toBe(8);
    });

    it("includes Priority Hierarchy for Plan Revision in the Overview list", () => {
      const overviewMatch = skillContent.match(
        /## Overview[\s\S]*?(?=## \w)/
      );
      expect(overviewMatch).toBeDefined();

      const overviewSection = overviewMatch![0];
      expect(overviewSection).toContain("Priority Hierarchy for Plan Revision");
    });

    it("places Priority Hierarchy between Scope Discipline and Subgoal Decomposition in the Overview list", () => {
      const overviewMatch = skillContent.match(
        /## Overview[\s\S]*?(?=## \w)/
      );
      expect(overviewMatch).toBeDefined();

      const overviewSection = overviewMatch![0];
      const numberedItems = overviewSection.match(/^\d+\.\s\*\*[^*]+\*\*/gm);
      expect(numberedItems).toBeDefined();

      const itemTexts = numberedItems!.map((item) =>
        item.replace(/^\d+\.\s\*\*/, "").replace(/\*\*.*$/, "")
      );

      const scopeIndex = itemTexts.indexOf("Scope Discipline");
      const priorityIndex = itemTexts.indexOf("Priority Hierarchy for Plan Revision");
      const subgoalIndex = itemTexts.indexOf("Subgoal Decomposition");

      expect(scopeIndex).toBeGreaterThan(-1);
      expect(priorityIndex).toBeGreaterThan(-1);
      expect(subgoalIndex).toBeGreaterThan(-1);

      expect(priorityIndex).toBe(scopeIndex + 1);
      expect(subgoalIndex).toBe(priorityIndex + 1);
    });

    it("numbers Overview items sequentially from 1 to 8", () => {
      const overviewMatch = skillContent.match(
        /## Overview[\s\S]*?(?=## \w)/
      );
      expect(overviewMatch).toBeDefined();

      const overviewSection = overviewMatch![0];
      const numberedItems = overviewSection.match(/^\d+\.\s/gm);
      expect(numberedItems).toBeDefined();

      const numbers = numberedItems!.map((m) => parseInt(m.trim().replace(".", ""), 10));
      expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe("section headings", () => {
    it("has a top-level Priority Hierarchy for Plan Revision section heading", () => {
      const headingMatch = skillContent.match(
        /^## Priority Hierarchy for Plan Revision$/gm
      );
      expect(headingMatch).toBeDefined();
      expect(headingMatch!.length).toBe(1);
    });

    it("Priority Hierarchy section is a sibling of Scope Discipline (same heading level)", () => {
      const scopeHeading = skillContent.match(/^## Scope Discipline$/m);
      const priorityHeading = skillContent.match(
        /^## Priority Hierarchy for Plan Revision$/m
      );
      expect(scopeHeading).toBeDefined();
      expect(priorityHeading).toBeDefined();

      // Both should be ## (not ### or deeper)
      expect(scopeHeading![0]).toBe("## Scope Discipline");
      expect(priorityHeading![0]).toBe("## Priority Hierarchy for Plan Revision");
    });
  });
});
