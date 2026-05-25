import * as fs from "node:fs";
import * as path from "node:path";

// Resolve prompt file paths relative to this file's directory
const PROMPTS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "prompts");
// Note: this file lives in src/, so prompts dir is src/prompts/

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), "utf-8");
}

// ---------------------------------------------------------------------------
// create-plan.md — no inline "use the grill-me skill" phrasing
// ---------------------------------------------------------------------------

describe("create-plan.md — no inline grill-me HOW references", () => {
  let content: string;

  beforeAll(() => {
    content = readPrompt("create-plan.md");
  });

  it('does not contain "use the grill-me skill" phrasing', () => {
    expect(content.toLowerCase()).not.toContain("use the grill-me skill");
  });

  it("Step 2 ends with a WHAT-level instruction about engaging the user", () => {
    // Extract Step 2 section
    const step2Match = content.match(/### Step 2:.*?(?=### Step 3:|$)/s);
    expect(step2Match).toBeDefined();
    const step2 = step2Match![0];

    // Should NOT contain "use the grill-me skill"
    expect(step2.toLowerCase()).not.toContain("use the grill-me skill");

    // Should contain a WHAT-level instruction about engaging the user for feasibility doubts
    expect(step2).toMatch(/engage the user|resolve.*doubt|feasibility|ambiguous/i);
  });

  it("Step 3 does not end with 'Use the grill-me skill to make sure you clarify'", () => {
    const step3Match = content.match(/### Step 3:.*?(?=### Step 4:|$)/s);
    expect(step3Match).toBeDefined();
    const step3 = step3Match![0];

    expect(step3).not.toContain("Use the grill-me skill to make sure you clarify");
    expect(step3.toLowerCase()).not.toContain("use the grill-me skill");
  });
});

// ---------------------------------------------------------------------------
// create-plan.md — Skill References includes grill-me
// ---------------------------------------------------------------------------

describe("create-plan.md — Skill References section", () => {
  let content: string;
  let skillRefs: string;

  beforeAll(() => {
    content = readPrompt("create-plan.md");
    const match = content.match(/## Skill References\s*([\s\S]*)$/);
    skillRefs = match ? match[1] : "";
  });

  it("has a Skill References section", () => {
    expect(content).toContain("## Skill References");
  });

  it("references pio-planning", () => {
    expect(skillRefs).toContain("pio-planning");
  });

  it("references grill-me", () => {
    expect(skillRefs).toContain("grill-me");
  });

  it("describes what grill-me covers (resolving research gaps or validating assumptions)", () => {
    expect(skillRefs.toLowerCase()).toMatch(/research|validat|assum|gap|probing|resolv/i);
  });
});

// ---------------------------------------------------------------------------
// revise-plan.md — no inline "use the grill-me skill" phrasing
// ---------------------------------------------------------------------------

describe("revise-plan.md — no inline grill-me HOW references", () => {
  let content: string;

  beforeAll(() => {
    content = readPrompt("revise-plan.md");
  });

  it('does not contain "use the grill-me skill" phrasing', () => {
    expect(content.toLowerCase()).not.toContain("use the grill-me skill");
  });
});

// ---------------------------------------------------------------------------
// revise-plan.md — step numbering and new Step 5
// ---------------------------------------------------------------------------

describe("revise-plan.md — step numbering and new user validation step", () => {
  let content: string;

  beforeAll(() => {
    content = readPrompt("revise-plan.md");
  });

  it("has 8 sequential steps", () => {
    // Count step headings outside of code blocks (the PLAN.md template contains example headings)
    const lines = content.split("\n");
    let inCodeBlock = false;
    const stepHeadings: string[] = [];
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
      }
      if (!inCodeBlock) {
        const match = line.match(/^### Step (\d+):/);
        if (match) stepHeadings.push(match[0]);
      }
    }

    expect(stepHeadings.length).toBe(8);

    // Verify sequential numbering: 1, 2, 3, 4, 5, 6, 7, 8
    for (let i = 1; i <= 8; i++) {
      expect(stepHeadings).toContain(`### Step ${i}:`);
    }
  });

  it("Step 5 is about user validation", () => {
    const step5Match = content.match(/### Step 5:.*?(?=### Step 6:|$)/s);
    expect(step5Match).toBeDefined();
    const step5 = step5Match![0];

    // Heading should mention validation or user
    expect(step5).toMatch(/validate|user|revision direction/i);

    // Body should declare WHAT outcomes
    expect(step5).toMatch(/present.*change|summarize.*trigger|revision.*trigger/i);
    expect(step5).toMatch(/validat.*assumption|confirm.*direction|align.*intent/i);
    expect(step5).toMatch(/negotiat.*scope|scope.*change|fundamental/i);
    expect(step5).toMatch(/summarize|confirm|recap/i);
  });

  it("Step 5 does not prescribe tool usage (no 'use the grill-me skill')", () => {
    const step5Match = content.match(/### Step 5:.*?(?=### Step 6:|$)/s);
    expect(step5Match).toBeDefined();
    expect(step5Match![0].toLowerCase()).not.toContain("use the grill-me skill");
  });

  it("Step 6 is 'Design new steps'", () => {
    const step6Match = content.match(/### Step 6:.*?(?=### Step 7:|$)/s);
    expect(step6Match).toBeDefined();
    expect(step6Match![0]).toMatch(/design.*step/i);
  });

  it("Step 7 is 'Write PLAN.md'", () => {
    const step7Match = content.match(/### Step 7:.*?(?=### Step 8:|$)/s);
    expect(step7Match).toBeDefined();
    expect(step7Match![0]).toMatch(/write.*plan\.md|plan\.md/i);
  });

  it("Step 8 is 'Signal completion'", () => {
    const step8Match = content.match(/### Step 8:.*?(?:\n\n##|\n\n#|$)/s);
    expect(step8Match).toBeDefined();
    expect(step8Match![0]).toMatch(/signal|completion|complete|pio_mark_complete/i);
  });
});

// ---------------------------------------------------------------------------
// revise-plan.md — Skill References includes grill-me with updated step numbers
// ---------------------------------------------------------------------------

describe("revise-plan.md — Skill References section", () => {
  let content: string;
  let skillRefs: string;

  beforeAll(() => {
    content = readPrompt("revise-plan.md");
    const match = content.match(/## Skill References\s*([\s\S]*)$/);
    skillRefs = match ? match[1] : "";
  });

  it("has a Skill References section", () => {
    expect(content).toContain("## Skill References");
  });

  it("references pio-planning", () => {
    expect(skillRefs).toContain("pio-planning");
  });

  it("references grill-me", () => {
    expect(skillRefs).toContain("grill-me");
  });

  it("step number references match new numbering (steps 6 and 7, not 5 and 6)", () => {
    // The Skill References section previously said "steps 5 and 6" for Design/Write steps
    // After renumbering, pio-planning should reference "steps 6 and 7"
    // Step 5 (new user validation step) is fine to reference for grill-me
    const pioPlanningRef = skillRefs.match(/pio-planning[\s\S]*?(?=grill-me|$)/i);
    if (pioPlanningRef) {
      const pioSection = pioPlanningRef[0];
      // The pio-planning section should reference steps 6 and 7, not 5 and 6
      if (pioSection.match(/step\s*\d+/i)) {
        expect(pioSection.toLowerCase()).toMatch(/step\s*6/);
        expect(pioSection.toLowerCase()).toMatch(/step\s*7/);
        // Should NOT reference the old numbering (steps 5 and 6 together)
        expect(pioSection).not.toMatch(/steps?\s*5[^.]\s+and\s+steps?\s*6/i);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// create-goal.md — Skill References section exists
// ---------------------------------------------------------------------------

describe("create-goal.md — Skill References section", () => {
  let content: string;
  let skillRefs: string;

  beforeAll(() => {
    content = readPrompt("create-goal.md");
    const match = content.match(/## Skill References\s*([\s\S]*)$/);
    skillRefs = match ? match[1] : "";
  });

  it("has a Skill References section", () => {
    expect(content).toContain("## Skill References");
  });

  it("references pio-planning", () => {
    expect(skillRefs).toContain("pio-planning");
  });

  it("references grill-me", () => {
    expect(skillRefs).toContain("grill-me");
  });
});

// ---------------------------------------------------------------------------
// Cross-file: no inline "use the grill-me skill" in any prompt
// ---------------------------------------------------------------------------

describe("cross-file: no inline grill-me HOW references", () => {
  it('create-plan.md does not contain "use the grill-me skill"', () => {
    expect(readPrompt("create-plan.md").toLowerCase()).not.toContain("use the grill-me skill");
  });

  it('revise-plan.md does not contain "use the grill-me skill"', () => {
    expect(readPrompt("revise-plan.md").toLowerCase()).not.toContain("use the grill-me skill");
  });

  it('create-goal.md does not contain "use the grill-me skill"', () => {
    expect(readPrompt("create-goal.md").toLowerCase()).not.toContain("use the grill-me skill");
  });
});
