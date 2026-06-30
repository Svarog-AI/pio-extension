import { Type } from "typebox";
import type {
  CapabilityConfig,
  CapabilityContract,
  CapabilitySkills,
  MarkdownFileSpec,
  OneOfGroup,
  OutputEntry,
} from "./types";
import { isMarkdownFileSpec } from "./types";

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
        {
          name: "source-research",
          condition: "when researching external libraries",
        },
      ],
    };

    // Assert
    expect(skills.recommended).toHaveLength(1);
    expect(skills.recommended?.[0].name).toBe("source-research");
    expect(typeof skills.recommended?.[0].condition).toBe("string");
    expect(skills.mandatory).toBeUndefined();
  });

  it("accepts an object with both mandatory and recommended skills", () => {
    // Arrange + Act
    const skills: CapabilitySkills = {
      mandatory: ["tdd"],
      recommended: [{ name: "pio-git", condition: "during completion" }],
    };

    // Assert
    expect(skills.mandatory).toEqual(["tdd"]);
    expect(skills.recommended).toHaveLength(1);
    expect(skills.recommended?.[0].name).toBe("pio-git");
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
    expect(typeof skills.mandatory?.[0]).toBe("string");
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
// isMarkdownFileSpec — type guard for OutputEntry
// ---------------------------------------------------------------------------

describe("isMarkdownFileSpec", () => {
  it("returns true for MarkdownFileSpec entries", () => {
    const entry: OutputEntry = { name: "plan", file: "PLAN.md" };
    expect(isMarkdownFileSpec(entry)).toBe(true);
  });

  it("returns false for OneOfGroup entries", () => {
    const entry: OutputEntry = {
      files: [
        { name: "approved", file: "APPROVED" },
        { name: "rejected", file: "REJECTED" },
      ],
    };
    expect(isMarkdownFileSpec(entry)).toBe(false);
  });

  it("narrows type to MarkdownFileSpec (type guard behavior)", () => {
    const entries: OutputEntry[] = [
      { name: "plan", file: "PLAN.md" },
      { files: [{ name: "approved", file: "APPROVED" }] },
    ];

    const fileSpecs = entries.filter(isMarkdownFileSpec);
    // TypeScript narrows to MarkdownFileSpec[] — name and file are accessible
    expect(fileSpecs.map((e) => e.name)).toEqual(["plan"]);
    expect(fileSpecs.map((e) => e.file)).toEqual(["PLAN.md"]);
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
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
      skills: {
        mandatory: ["pio-planning", "grill-me"],
        recommended: [
          {
            name: "source-research",
            condition: "when researching architecture",
          },
        ],
      },
    };

    // Assert
    expect(config.skills).toBeDefined();
    expect(config.skills?.mandatory).toEqual(["pio-planning", "grill-me"]);
    expect(config.skills?.recommended).toHaveLength(1);
  });

  it("accepts a config without the skills field (backward compatibility)", () => {
    // Arrange + Act
    const config: CapabilityConfig = {
      capability: "create-goal",
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
    };

    // Assert
    expect(config.skills).toBeUndefined();
  });

  it("skills field is optional — config with only recommended skills is valid", () => {
    // Arrange + Act
    const config: CapabilityConfig = {
      capability: "create-goal",
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
      skills: {
        recommended: [
          {
            name: "source-research",
            condition: "when researching external libraries",
          },
        ],
      },
    };

    // Assert
    expect(config.skills?.mandatory).toBeUndefined();
    expect(config.skills?.recommended).toHaveLength(1);
    expect(config.skills?.recommended?.[0].name).toBe("source-research");
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
      inputs: [{ name: "plan", file: "PLAN.md" }],
      excludedFiles: ["S{stepNumber:02d}/REVISE_PLAN_NEEDED"],
      outputs: [
        { name: "task", file: "S{stepNumber:02d}/TASK.md", schema: planSchema },
        {
          name: "decisions",
          file: "S{stepNumber:02d}/DECISIONS.md",
          requiredWhen: (params) =>
            typeof params?.stepNumber === "number" && params.stepNumber > 1,
        },
        {
          files: [
            { name: "approved", file: "APPROVED" },
            { name: "rejected", file: "REJECTED" },
          ],
        } satisfies OneOfGroup,
      ],
    };

    // Wire contract into CapabilityConfig
    const config: CapabilityConfig = {
      capability: "evolve-plan",
      contract,
      allowProjectWrites: false,
    };

    // Assert: requiredWhen predicate behavior (the only runtime behavior in these types)
    const decisions = contract.outputs[1] as MarkdownFileSpec;
    expect(decisions.requiredWhen?.({ stepNumber: 3 })).toBe(true);
    expect(decisions.requiredWhen?.({ stepNumber: 1 })).toBe(false);
    expect(decisions.requiredWhen?.()).toBe(false);

    // Assert: OneOfGroup is accepted as OutputEntry
    const oneOf = contract.outputs[2] as OneOfGroup;
    expect(oneOf.files).toHaveLength(2);

    // Assert: contract is set on CapabilityConfig
    expect(config.contract).toBe(contract);
  });
});

// ---------------------------------------------------------------------------
// CapabilityConfig — contract field (mandatory)
// ---------------------------------------------------------------------------

describe("CapabilityConfig — contract field", () => {
  it("contract field is mandatory — config must have contract", () => {
    // contract is now required — this compiles only because contract is present
    const config: CapabilityConfig = {
      capability: "create-goal",
      contract: { inputs: [], outputs: [] },
      allowProjectWrites: false,
    };
    expect(config.contract).toBeDefined();
  });
});
