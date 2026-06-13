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
// MarkdownFileSpec — compile-time type verification
// ---------------------------------------------------------------------------

describe("MarkdownFileSpec", () => {
  it("is importable and accepts a file path only", () => {
    const spec: MarkdownFileSpec = { file: "PLAN.md" };
    expect(spec.file).toBe("PLAN.md");
    expect(spec.schema).toBeUndefined();
    expect(spec.requiredWhen).toBeUndefined();
  });

  it("accepts a file path with a TypeBox schema", () => {
    const schema = Type.Object({ title: Type.String() });
    const spec: MarkdownFileSpec = { file: "PLAN.md", schema };
    expect(spec.file).toBe("PLAN.md");
    expect(spec.schema).toBe(schema);
  });

  it("accepts a requiredWhen predicate", () => {
    const spec: MarkdownFileSpec = {
      file: "S{stepNumber:02d}/DECISIONS.md",
      requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1,
    };
    expect(spec.requiredWhen!({ stepNumber: 2 })).toBe(true);
    expect(spec.requiredWhen!({ stepNumber: 1 })).toBe(false);
    expect(spec.requiredWhen!()).toBe(false);
  });

  it("accepts placeholder tokens in file paths", () => {
    const spec: MarkdownFileSpec = { file: "S{stepNumber:02d}/TASK.md" };
    expect(spec.file).toBe("S{stepNumber:02d}/TASK.md");
  });
});

// ---------------------------------------------------------------------------
// OneOfGroup — compile-time type verification
// ---------------------------------------------------------------------------

describe("OneOfGroup", () => {
  it("is importable and accepts an array of MarkdownFileSpec", () => {
    const group: OneOfGroup = {
      files: [
        { file: "APPROVED" },
        { file: "REJECTED" },
      ],
    };
    expect(group.files).toHaveLength(2);
    expect(group.files[0].file).toBe("APPROVED");
  });
});

// ---------------------------------------------------------------------------
// OutputEntry — union type verification
// ---------------------------------------------------------------------------

describe("OutputEntry", () => {
  it("accepts a plain MarkdownFileSpec", () => {
    const entry: OutputEntry = { file: "PLAN.md" };
    expect(entry).toEqual({ file: "PLAN.md" });
  });

  it("accepts a OneOfGroup", () => {
    const entry: OutputEntry = {
      files: [{ file: "APPROVED" }, { file: "REJECTED" }],
    };
    expect((entry as OneOfGroup).files).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// CapabilityContract — compile-time type verification
// ---------------------------------------------------------------------------

describe("CapabilityContract", () => {
  it("is importable and accepts minimal inputs and outputs", () => {
    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }],
      outputs: [{ file: "PLAN.md" }],
    };
    expect(contract.inputs).toHaveLength(1);
    expect(contract.outputs).toHaveLength(1);
    expect(contract.excludedFiles).toBeUndefined();
  });

  it("accepts excludedFiles", () => {
    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }],
      excludedFiles: ["PLAN.md"],
      outputs: [{ file: "PLAN.md" }],
    };
    expect(contract.excludedFiles).toEqual(["PLAN.md"]);
  });

  it("accepts schemas on inputs and outputs", () => {
    const schema = Type.Object({ totalSteps: Type.Integer() });
    const contract: CapabilityContract = {
      inputs: [{ file: "GOAL.md" }],
      outputs: [{ file: "PLAN.md", schema }],
    };
    expect((contract.outputs[0] as MarkdownFileSpec).schema).toBe(schema);
  });

  it("accepts requiredWhen predicates on outputs", () => {
    const contract: CapabilityContract = {
      inputs: [{ file: "PLAN.md" }],
      outputs: [
        { file: "S{stepNumber:02d}/TASK.md" },
        {
          file: "S{stepNumber:02d}/DECISIONS.md",
          requiredWhen: (params) => typeof params?.stepNumber === "number" && params.stepNumber > 1,
        },
      ],
    };
    expect(contract.outputs).toHaveLength(2);
    const decisions = contract.outputs[1] as MarkdownFileSpec;
    expect(decisions.requiredWhen!({ stepNumber: 3 })).toBe(true);
    expect(decisions.requiredWhen!({ stepNumber: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CapabilityConfig — contract field (optional, backward-compatible)
// ---------------------------------------------------------------------------

describe("CapabilityConfig — contract field", () => {
  it("accepts a config with the contract field", () => {
    const config: CapabilityConfig = {
      capability: "create-plan",
      contract: {
        inputs: [{ file: "GOAL.md" }],
        excludedFiles: ["PLAN.md"],
        outputs: [{ file: "PLAN.md" }],
      },
    };
    expect(config.contract).toBeDefined();
    expect(config.contract!.inputs).toHaveLength(1);
    expect(config.contract!.excludedFiles).toEqual(["PLAN.md"]);
  });

  it("contract field is optional — config without contract is valid", () => {
    // TODO(contracts-frontmatter Step 3): DELETE this test — contract becomes mandatory, old fields are removed
    const config: CapabilityConfig = {
      capability: "create-goal",
    };
    expect(config.contract).toBeUndefined();
  });

  it("contract coexists with old fields (backward compatibility)", () => {
    // TODO(contracts-frontmatter Step 3): DELETE this test — old fields (validation, etc.) are removed in Step 3
    const config: CapabilityConfig = {
      capability: "create-plan",
      validation: { files: ["PLAN.md"] },
      contract: {
        inputs: [{ file: "GOAL.md" }],
        outputs: [{ file: "PLAN.md" }],
      },
    };
    expect(config.validation).toBeDefined();
    expect(config.contract).toBeDefined();
  });
});
