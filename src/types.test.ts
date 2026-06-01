import type { CapabilitySkills, CapabilityConfig } from "./types";

// ---------------------------------------------------------------------------
// CapabilitySkills — compile-time type verification
// ---------------------------------------------------------------------------

describe("CapabilitySkills", () => {
  it("is importable from src/types.ts", () => {
    // Arrange + Act: import CapabilitySkills type and use it
    const skills: CapabilitySkills = {};

    // Assert: if this file compiles, the type is exported correctly
    expect(skills).toEqual({});
  });

  it("accepts an object with only mandatory skills", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {
      mandatory: ["pio-planning", "grill-me"],
    };

    // Assert
    expect(skills.mandatory).toEqual(["pio-planning", "grill-me"]);
    expect(skills.recommended).toBeUndefined();
  });

  it("accepts an object with only recommended skills", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {
      recommended: [
        { name: "source-research", condition: "when researching external libraries" },
      ],
    };

    // Assert
    expect(skills.recommended).toHaveLength(1);
    expect(skills.recommended![0].name).toBe("source-research");
    expect(typeof skills.recommended![0].condition).toBe("string");
    expect(skills.mandatory).toBeUndefined();
  });

  it("accepts an object with both mandatory and recommended skills", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {
      mandatory: ["tdd"],
      recommended: [
        { name: "pio-git", condition: "during completion" },
      ],
    };

    // Assert
    expect(skills.mandatory).toEqual(["tdd"]);
    expect(skills.recommended).toHaveLength(1);
    expect(skills.recommended![0].name).toBe("pio-git");
  });

  it("accepts an empty object (both fields optional)", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {};

    // Assert
    expect(skills.mandatory).toBeUndefined();
    expect(skills.recommended).toBeUndefined();
  });

  it("mandatory is an optional string array", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {
      mandatory: ["pio-planning"],
    };

    // Assert
    expect(Array.isArray(skills.mandatory)).toBe(true);
    expect(typeof skills.mandatory![0]).toBe("string");
  });

  it("recommended contains objects with name and condition string fields", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {
      recommended: [
        { name: "ask-user", condition: "when requirements are ambiguous" },
        { name: "source-research", condition: "when researching APIs" },
      ],
    };

    // Assert
    expect(skills.recommended).toHaveLength(2);
    for (const rec of skills.recommended!) {
      expect(typeof rec.name).toBe("string");
      expect(typeof rec.condition).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// CapabilityConfig — skills field (optional, backward-compatible)
// ---------------------------------------------------------------------------

describe("CapabilityConfig — skills field", () => {
  it("accepts a config with the skills field", () => {
    // Arrange + Act
    const config: CapabilityConfig = {
      capability: "create-plan",
      skills: {
        mandatory: ["pio-planning", "grill-me"],
        recommended: [
          { name: "source-research", condition: "when researching architecture" },
        ],
      },
    };

    // Assert
    expect(config.skills).toBeDefined();
    expect(config.skills!.mandatory).toEqual(["pio-planning", "grill-me"]);
    expect(config.skills!.recommended).toHaveLength(1);
  });

  it("accepts a config without the skills field (backward compatibility)", () => {
    // Arrange + Act
    const config: CapabilityConfig = {
      capability: "create-goal",
    };

    // Assert
    expect(config.skills).toBeUndefined();
  });

  it("skills field is optional — config with only recommended skills is valid", () => {
    // Arrange + Act
    const config: CapabilityConfig = {
      capability: "create-goal",
      skills: {
        recommended: [
          { name: "source-research", condition: "when researching external libraries" },
        ],
      },
    };

    // Assert
    expect(config.skills!.mandatory).toBeUndefined();
    expect(config.skills!.recommended).toHaveLength(1);
    expect(config.skills!.recommended![0].name).toBe("source-research");
  });
});
