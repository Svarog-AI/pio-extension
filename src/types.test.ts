import { Type } from "typebox";
import type { CapabilitySkills, CapabilityConfig, MarkdownFileSpec, OneOfGroup, OutputEntry, CapabilityContract } from "./types";

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

// ---------------------------------------------------------------------------
// Unified contract types — integration test
// ---------------------------------------------------------------------------
// All four new types (MarkdownFileSpec, OneOfGroup, OutputEntry, CapabilityContract)
// are exercised together in a single integration test. Structural correctness
// is verified by the TypeScript compiler (npx tsc --noEmit).

describe("unified contract types", () => {
  it("all four types compose together with requiredWhen predicates and coexist with old config fields", () => {
    // Arrange: build a realistic contract using all four types
    const planSchema = Type.Object({ totalSteps: Type.Integer() });

    const contract: CapabilityContract = {
      inputs: [{ file: "PLAN.md" }],
      excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
      outputs: [
        { file: "S{stepNumber:02d}/TASK.md", schema: planSchema },
        {
          file: "S{stepNumber:02d}/DECISIONS.md",
          requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1,
        },
        {
          files: [{ file: "APPROVED" }, { file: "REJECTED" }],
        } satisfies OneOfGroup,
      ],
    };

    // Wire contract into CapabilityConfig alongside old fields (migration coexistence)
    const config: CapabilityConfig = {
      capability: "evolve-plan",
      validation: { files: ["S{stepNumber:02d}/TASK.md"] },
      contract,
    };

    // Assert: requiredWhen predicate behavior (the only runtime behavior in these types)
    const decisions = contract.outputs[1] as MarkdownFileSpec;
    expect(decisions.requiredWhen!({ stepNumber: 3 })).toBe(true);
    expect(decisions.requiredWhen!({ stepNumber: 1 })).toBe(false);
    expect(decisions.requiredWhen!()).toBe(false);

    // Assert: OneOfGroup is accepted as OutputEntry
    const oneOf = contract.outputs[2] as OneOfGroup;
    expect(oneOf.files).toHaveLength(2);

    // Assert: contract coexists with old fields on CapabilityConfig
    expect(config.contract).toBe(contract);
    expect(config.validation).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CapabilityConfig — contract field (optional, backward-compatible)
// ---------------------------------------------------------------------------

describe("CapabilityConfig — contract field", () => {
  it("contract field is optional — config without contract is valid", () => {
    // TODO(contracts-frontmatter Step 3): DELETE this test — contract becomes mandatory, old fields are removed
    const config: CapabilityConfig = {
      capability: "create-goal",
    };
    expect(config.contract).toBeUndefined();
  });
});
