import { Type } from "typebox";
import type {
  CapabilityConfig,
  CapabilityContract,
  CapabilitySkills,
  MarkdownFileSpec,
  OutputEntry,
} from "./types";
import {
  isArrayOutput,
  isMarkdownFileSpec,
  isOneOfGroup,
  OneOfGroup,
} from "./types";

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
    const entry: OutputEntry = new OneOfGroup([
      { name: "approved", file: "APPROVED" },
      { name: "rejected", file: "REJECTED" },
    ]);
    expect(isMarkdownFileSpec(entry)).toBe(false);
  });

  it("narrows type to MarkdownFileSpec (type guard behavior)", () => {
    const entries: OutputEntry[] = [
      { name: "plan", file: "PLAN.md" },
      new OneOfGroup([{ name: "approved", file: "APPROVED" }]),
    ];

    const fileSpecs = entries.filter(isMarkdownFileSpec);
    // TypeScript narrows to MarkdownFileSpec[] — name and file are accessible
    expect(fileSpecs.map((e) => e.name)).toEqual(["plan"]);
    expect(fileSpecs.map((e) => e.file)).toEqual(["PLAN.md"]);
  });

  it("returns false for bare array entries (OutputEntry[])", () => {
    const entry: OutputEntry = [
      { name: "a", file: "A.md" },
      { name: "b", file: "B.md" },
    ];
    expect(isMarkdownFileSpec(entry)).toBe(false);
  });

  it("correctly distinguishes all three variants in a mixed array", () => {
    const entries: OutputEntry[] = [
      { name: "plan", file: "PLAN.md" },
      new OneOfGroup([{ name: "approved", file: "APPROVED" }]),
      [{ name: "a", file: "A.md" }],
    ];

    expect(entries.filter(isMarkdownFileSpec)).toHaveLength(1);
    expect(
      entries.filter((e) => !isMarkdownFileSpec(e) && !Array.isArray(e)),
    ).toHaveLength(1);
    expect(entries.filter(Array.isArray)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isArrayOutput — type guard for bare arrays in OutputEntry
// ---------------------------------------------------------------------------

describe("isArrayOutput", () => {
  it("returns true for bare array entries", () => {
    const entry: OutputEntry = [
      { name: "a", file: "A.md" },
      { name: "b", file: "B.md" },
    ];
    expect(isArrayOutput(entry)).toBe(true);
  });

  it("returns false for MarkdownFileSpec entries", () => {
    const entry: OutputEntry = { name: "plan", file: "PLAN.md" };
    expect(isArrayOutput(entry)).toBe(false);
  });

  it("returns false for OneOfGroup entries", () => {
    const entry: OutputEntry = new OneOfGroup([
      { name: "approved", file: "APPROVED" },
    ]);
    expect(isArrayOutput(entry)).toBe(false);
  });

  it("narrows type to OutputEntry[] (type guard behavior)", () => {
    const entries: OutputEntry[] = [
      { name: "plan", file: "PLAN.md" },
      new OneOfGroup([{ name: "approved", file: "APPROVED" }]),
      [{ name: "a", file: "A.md" }],
    ];

    const arrays = entries.filter(isArrayOutput);
    // TypeScript narrows to OutputEntry[][] — can iterate sub-entries
    expect(arrays).toHaveLength(1);
    expect(arrays[0]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isOneOfGroup — type guard for OneOfGroup class instances
// ---------------------------------------------------------------------------

describe("isOneOfGroup", () => {
  it("returns true for instances created via new OneOfGroup", () => {
    const entry: OutputEntry = new OneOfGroup([{ name: "a", file: "A.md" }]);
    expect(isOneOfGroup(entry)).toBe(true);
  });

  it("returns false for MarkdownFileSpec objects", () => {
    const entry: OutputEntry = { name: "plan", file: "PLAN.md" };
    expect(isOneOfGroup(entry)).toBe(false);
  });

  it("returns false for bare arrays (OutputEntry[])", () => {
    const entry: OutputEntry = [
      { name: "a", file: "A.md" },
      { name: "b", file: "B.md" },
    ];
    expect(isOneOfGroup(entry)).toBe(false);
  });

  it("narrows type to OneOfGroup (type guard behavior)", () => {
    const entries: OutputEntry[] = [
      { name: "plan", file: "PLAN.md" },
      new OneOfGroup([{ name: "approved", file: "APPROVED" }]),
      [{ name: "a", file: "A.md" }],
    ];

    const groups = entries.filter(isOneOfGroup);
    // TypeScript narrows to OneOfGroup[] — .files is accessible
    expect(groups).toHaveLength(1);
    expect(groups[0].files).toHaveLength(1);
    expect(groups[0].kind).toBe("one-of");
  });

  it('kind property is literal "one-of"', () => {
    const group = new OneOfGroup([{ name: "x", file: "X.md" }]);
    expect(group.kind).toBe("one-of");
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
        new OneOfGroup([
          { name: "approved", file: "APPROVED" },
          { name: "rejected", file: "REJECTED" },
        ]),
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

  it("supports recursive nesting — OneOfGroup containing OneOfGroup and bare arrays", () => {
    // Arrange: OneOfGroup with nested group and bare array (AND inside OR)
    const contract: CapabilityContract = {
      inputs: [],
      outputs: [
        new OneOfGroup(
          [
            // Option A: single file
            { name: "solo", file: "SOLO.md" },
            // Option B: nested OneOfGroup (either X or Y)
            new OneOfGroup([
              { name: "x", file: "X.md" },
              { name: "y", file: "Y.md" },
            ]),
            // Option C: bare array (both C1 and C2 — implicit AND)
            [
              { name: "c1", file: "C1.md" },
              { name: "c2", file: "C2.md" },
            ],
          ],
          () => true,
        ),
      ],
    };

    // Assert: TypeScript accepts the recursive nesting
    const group = contract.outputs[0] as OneOfGroup;
    expect(group.files).toHaveLength(3);
    expect(group.kind).toBe("one-of");
    expect(group.requiredWhen?.()).toBe(true);

    // Assert: nested OneOfGroup is at index 1
    const nestedGroup = group.files[1] as OneOfGroup;
    expect(nestedGroup.kind).toBe("one-of");
    expect(nestedGroup.files).toHaveLength(2);

    // Assert: bare array is at index 2
    const bareArray = group.files[2] as OutputEntry[];
    expect(Array.isArray(bareArray)).toBe(true);
    expect(bareArray).toHaveLength(2);
  });

  it("OneOfGroup requiredWhen predicate receives params and capState", () => {
    // Arrange
    const group = new OneOfGroup(
      [
        { name: "completion-summary", file: "COMPLETION_SUMMARY.md" },
        { name: "revise-plan", file: "REVISE_PLAN_NEEDED.md" },
      ],
      (params) => {
        const stepNum = params?.stepNumber as number | undefined;
        const total = params?.totalSteps as number | undefined;
        return (
          typeof stepNum === "number" &&
          typeof total === "number" &&
          stepNum > total
        );
      },
    );

    // Assert: requiredWhen fires only when stepNumber > totalSteps
    expect(group.requiredWhen?.({ stepNumber: 4, totalSteps: 3 })).toBe(true);
    expect(group.requiredWhen?.({ stepNumber: 2, totalSteps: 3 })).toBe(false);
    expect(group.requiredWhen?.({ stepNumber: 3, totalSteps: 3 })).toBe(false);
    expect(group.requiredWhen?.()).toBe(false);
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
