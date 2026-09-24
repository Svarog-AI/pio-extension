// Hermetic unit suite for the built-in capability loader. The module's
// static import graph is SDK-free, so every row drives the REAL resolution
// pipeline over INLINE fixture tables — no vi.mock anywhere. Fixture
// classes are white-box test doubles: they extend the real bundled base
// (or simulate foreign chains with deliberately-fake identities) and never
// register anything or ship anywhere. Factory thunks flip hoisted
// evaluation flags so lazy discipline is observable per row. Unproven
// runtime values cross a parse boundary or an assign-widening instead of an
// annotation (the checkers assert shapes at runtime; the annotation
// documents shape, not protection). Mechanical source guards pin the import
// surface and the shipped-empty table literal.

import { readFileSync } from "node:fs";
import type { CapabilityParams } from "./base.ts";
import { PioCapability } from "./base.ts";
import type { Contract } from "./contract.ts";
import type {
  CapabilityConstructor,
  CapabilityResolution,
  CapabilityTable,
  ResolvedCapability,
} from "./loader.ts";
import {
  CAPABILITY_TABLE,
  capabilityRefusalLine,
  resolveCapability,
} from "./loader.ts";

/** Narrow a successful resolution (row-invariant guard; no cast seam). */
function asOk(result: CapabilityResolution): ResolvedCapability {
  if (!result.ok) throw new Error(`unexpected refusal: ${result.refusal}`);
  return result.capability;
}

/** Narrow a refused resolution (row-invariant guard; no cast seam). */
function asRefusal(result: CapabilityResolution): string {
  if (result.ok) throw new Error("unexpected ok resolution");
  return result.refusal;
}

/** One well-formed contract carrying the given identity name. */
function wellFormed(name: string): Contract {
  return { name, version: "1.0.0", inputs: [], outputs: [], writes: [] };
}

const harness = vi.hoisted(() => {
  const flags = { alpha: false, beta: false, gamma: false };
  const reset = () => {
    flags.alpha = false;
    flags.beta = false;
    flags.gamma = false;
  };
  return { flags, reset };
});

beforeEach(() => {
  harness.reset();
});

// Deliberately-fake identities: test doubles that extend the real bundled
// base but register nothing and ship nowhere.
const ALPHA_CONTRACT: Contract = wellFormed("alpha");
const FIXTURE_ALPHA = class extends PioCapability {
  readonly contract: Contract = ALPHA_CONTRACT;
  async call(): Promise<Record<string, unknown>> {
    return {};
  }
};
const FIXTURE_BETA = class extends PioCapability {
  readonly contract: Contract = wellFormed("beta");
  async call(): Promise<Record<string, unknown>> {
    return {};
  }
};
const FIXTURE_GAMMA = class extends PioCapability {
  readonly contract: Contract = wellFormed("gamma");
  async call(): Promise<Record<string, unknown>> {
    return {};
  }
};

describe("miss path (shipped empty table)", () => {
  it("the registration table ships empty (zero entries)", () => {
    expect(Object.keys(CAPABILITY_TABLE)).toEqual([]);
  });

  for (const name of ["whatever", "probe", "PROBE", ""]) {
    it(`resolving ${JSON.stringify(name)} resolves the miss refusal equal to BOTH the owner line AND the carried catalog bytes`, async () => {
      const result = await resolveCapability(name);
      expect(result.ok).toBe(false);
      const line = asRefusal(result);
      expect(line).toBe(capabilityRefusalLine(name));
      expect(line).toBe(`pio: capability '${name}' is not implemented yet`);
    });
  }

  it("a miss fires ZERO factories: all evaluation flags stay unset and the result carries no capability payload", async () => {
    const table: CapabilityTable = {
      alpha: async () => {
        harness.flags.alpha = true;
        return { default: FIXTURE_ALPHA };
      },
      beta: async () => {
        harness.flags.beta = true;
        return { default: FIXTURE_BETA };
      },
      gamma: async () => {
        harness.flags.gamma = true;
        return { default: FIXTURE_GAMMA };
      },
    };
    const result = await resolveCapability("ghost", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'ghost' is not implemented yet`,
    );
    expect(harness.flags).toEqual({ alpha: false, beta: false, gamma: false });
    expect("capability" in result).toBe(false);
  });

  it("lookup is EXACT and case-sensitive: 'Alpha' misses member 'alpha' with zero flags set", async () => {
    const table: CapabilityTable = {
      alpha: async () => {
        harness.flags.alpha = true;
        return { default: FIXTURE_ALPHA };
      },
    };
    const result = await resolveCapability("Alpha", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'Alpha' is not implemented yet`,
    );
    expect(harness.flags).toEqual({ alpha: false, beta: false, gamma: false });
  });

  it("'__proto__' is a clean MISS against the shipped table (inherited-key safety), never a hit or a load fault", async () => {
    const result = await resolveCapability("__proto__");
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability '__proto__' is not implemented yet`,
    );
  });
});

// The identity refusal line, byte-pinned independently of the loader's own
// owner so both must agree.
const IDENTITY_LINE = (name: string): string =>
  `pio: capability '${name}' refused: not a subclass of the bundled capability base`;

/**
 * Sever one fixture's prototype link. At the type level the fixture stays a
 * bona fide bundled subclass (fixture tables remain strictly typed without
 * an assertion), while the chain the walker observes starts at the given
 * foreign parent instead of the bundled base — exactly the second-runtime-
 * copy scenario under test.
 */
function severChain(
  fixture: CapabilityConstructor,
  foreignParent: object,
): void {
  Object.setPrototypeOf(fixture.prototype, foreignParent);
}

// Shape-identical impostor base: the same surface names as the bundled base
// but a different prototype chain — simulates a second runtime copy of the
// authoring surface. Deliberately-fake identities; ships nowhere.
class FakeBase {
  readonly contract: Contract;
  constructor(contract: Contract) {
    this.contract = contract;
  }
  async run(): Promise<unknown> {
    return { ok: true, outputs: {} };
  }
  async call(): Promise<Record<string, unknown>> {
    return {};
  }
  async execute_phase(): Promise<unknown> {
    throw new Error("sessionless");
  }
}

// Corrupt-chain links mirroring the real chain's depth: every link a
// distinct object identity from the bundled chain (two-runtime-copy
// simulation).
class CorruptAncestor {
  readonly contract: Contract;
  constructor(contract: Contract) {
    this.contract = contract;
  }
}
class CorruptBase extends CorruptAncestor {
  async run(): Promise<unknown> {
    return { ok: true, outputs: {} };
  }
  async call(): Promise<Record<string, unknown>> {
    return {};
  }
  async execute_phase(): Promise<unknown> {
    throw new Error("sessionless");
  }
}
const CORRUPT_CAP = class extends PioCapability {
  readonly contract: Contract = wellFormed("corrupt");
  async call(): Promise<Record<string, unknown>> {
    return {};
  }
};
severChain(CORRUPT_CAP, CorruptBase.prototype);

describe("identity check (fixture tables)", () => {
  it("a registered bundled subclass resolves: ctor by REFERENCE identity, contract by deep equality, only its own flag set", async () => {
    const table: CapabilityTable = {
      alpha: async () => {
        harness.flags.alpha = true;
        return { default: FIXTURE_ALPHA };
      },
      beta: async () => {
        harness.flags.beta = true;
        return { default: FIXTURE_BETA };
      },
    };
    const result = await resolveCapability("alpha", table);
    expect(result.ok).toBe(true);
    const cap = asOk(result);
    expect(cap.ctor).toBe(FIXTURE_ALPHA);
    expect(cap.contract).toEqual(ALPHA_CONTRACT);
    expect(harness.flags).toEqual({ alpha: true, beta: false, gamma: false });
  });

  it("a FOREIGN-BASE impostor with an identical shape is refused (shape match is NOT a pass criterion)", async () => {
    const ImpostorCap = class extends PioCapability {
      readonly contract: Contract = wellFormed("impostor");
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    };
    severChain(ImpostorCap, FakeBase.prototype);
    const table: CapabilityTable = {
      impostor: async () => ({ default: ImpostorCap }),
    };
    const result = await resolveCapability("impostor", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(IDENTITY_LINE("impostor"));
  });

  it("a TWO-RUNTIME-COPY chain (distinct objects at mirrored depth, valid-looking contract) is refused: reference-based, not name/shape-based", async () => {
    const table: CapabilityTable = {
      corrupt: async () => ({ default: CORRUPT_CAP }),
    };
    const result = await resolveCapability("corrupt", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(IDENTITY_LINE("corrupt"));
  });

  it("depth tolerance: the anchor found at GRANDPARENT depth resolves (intermediate class without a contract)", async () => {
    class Mid extends PioCapability {
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    }
    const GRAND_CONTRACT: Contract = wellFormed("grand");
    const Grand = class extends Mid {
      readonly contract: Contract = GRAND_CONTRACT;
    };
    const table: CapabilityTable = { grand: async () => ({ default: Grand }) };
    const result = await resolveCapability("grand", table);
    expect(result.ok).toBe(true);
    const cap = asOk(result);
    expect(cap.ctor).toBe(Grand);
    expect(cap.contract).toEqual(GRAND_CONTRACT);
  });

  it("ORDERING: an impostor WITH a malformed contract gets the IDENTITY line (identity precedes contract; the contract line is never composed)", async () => {
    const MalformedImpostor = class extends PioCapability {
      readonly contract: Contract = Object.assign(wellFormed("impostor"), {
        version: "",
      });
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    };
    severChain(MalformedImpostor, FakeBase.prototype);
    const table: CapabilityTable = {
      impostor: async () => ({ default: MalformedImpostor }),
    };
    const result = await resolveCapability("impostor", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(IDENTITY_LINE("impostor"));
  });

  it("the STRICT-DESCENT boundary refuses: a chain starting exactly at Function.prototype (the base-itself walk) is not a capability", async () => {
    const ShallowCap = class extends PioCapability {
      readonly contract: Contract = wellFormed("shallow");
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    };
    severChain(ShallowCap, Function.prototype);
    const table: CapabilityTable = {
      shallow: async () => ({ default: ShallowCap }),
    };
    const result = await resolveCapability("shallow", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(IDENTITY_LINE("shallow"));
  });
});

/** One bundled-subclass constructor carrying the given authored contract.
 * Unproven shapes cross Object.assign — the checker asserts every field at
 * runtime; the annotation documents shape, not protection. */
function withContract(contract: Contract): CapabilityConstructor {
  const Carrying = class extends PioCapability {
    readonly contract: Contract = contract;
    async call(): Promise<Record<string, unknown>> {
      return {};
    }
  };
  return Carrying;
}

describe("load-time contract check and fault containment", () => {
  const wellFormedVariants: ReadonlyArray<{
    label: string;
    contract: Contract;
  }> = [
    {
      label: "an all-empty-array contract (allowProjectWrites absent)",
      contract: wellFormed("wf"),
    },
    {
      label: "allowProjectWrites present (true)",
      contract: { ...wellFormed("wf"), allowProjectWrites: true },
    },
    {
      label: "allowProjectWrites present (false)",
      contract: { ...wellFormed("wf"), allowProjectWrites: false },
    },
    {
      label: "file-slot input specs",
      contract: {
        ...wellFormed("wf"),
        inputs: [{ name: "doc", file: "doc.md" }],
      },
    },
    {
      label: "paramKey-slot output specs",
      contract: {
        ...wellFormed("wf"),
        outputs: [{ name: "ref", paramKey: "outPath" }],
      },
    },
  ];
  for (const variant of wellFormedVariants) {
    it(`well-formed ${variant.label} resolves with a contract passthrough by deep equality`, async () => {
      const ctor = withContract(variant.contract);
      const table: CapabilityTable = { wf: async () => ({ default: ctor }) };
      const result = await resolveCapability("wf", table);
      expect(result.ok).toBe(true);
      const cap = asOk(result);
      expect(cap.ctor).toBe(ctor);
      expect(cap.contract).toEqual(variant.contract);
    });
  }

  it("a missing version embeds the VERBATIM problem template in the composed line (full bytes pinned)", async () => {
    const broken: Contract = Object.assign(wellFormed("bad-version"), {
      version: "",
    });
    const table: CapabilityTable = {
      "bad-version": async () => ({ default: withContract(broken) }),
    };
    const result = await resolveCapability("bad-version", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'bad-version' refused: contract.version must be a non-empty string`,
    );
  });

  it("a non-array inputs list embeds its verbatim problem template (full bytes pinned)", async () => {
    const broken: Contract = Object.assign(wellFormed("bad-inputs"), {
      inputs: { not: "an array" },
    });
    const table: CapabilityTable = {
      "bad-inputs": async () => ({ default: withContract(broken) }),
    };
    const result = await resolveCapability("bad-inputs", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'bad-inputs' refused: contract.inputs must be an array`,
    );
  });

  it("collect-all: bad version AND non-string writes[1] surface BOTH problems joined '; ' in declaration order (full bytes pinned)", async () => {
    const compounded: Contract = Object.assign(wellFormed("compounded"), {
      version: "",
      writes: ["ok", 42],
    });
    const table: CapabilityTable = {
      compounded: async () => ({ default: withContract(compounded) }),
    };
    const result = await resolveCapability("compounded", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'compounded' refused: contract.version must be a non-empty string; contract.writes[1] must be a string`,
    );
  });

  it("a FORGOTTEN contract (subclass assigns none) rides the non-object tolerance path (full bytes pinned)", async () => {
    class ForgottenCap extends PioCapability {
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    }
    const table: CapabilityTable = {
      forgotten: async () => ({ default: ForgottenCap }),
    };
    const result = await resolveCapability("forgotten", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'forgotten' refused: contract must be a plain object`,
    );
  });

  it("tolerances honored: duplicate spec names in inputs + unknown extra contract keys resolve ok:true (non-refusal pin)", async () => {
    const tolerated: Contract = Object.assign(
      {
        ...wellFormed("tolerated"),
        inputs: [{ name: "dup" }, { name: "dup" }],
      },
      { extra: "unknown keys are tolerated" },
    );
    const table: CapabilityTable = {
      tolerated: async () => ({ default: withContract(tolerated) }),
    };
    const result = await resolveCapability("tolerated", table);
    expect(result.ok).toBe(true);
    expect(asOk(result).contract).toEqual(tolerated);
  });

  it("a rejecting factory RESOLVES (never-rejects pin) the load-fault line carrying the error message", async () => {
    const table: CapabilityTable = {
      boom: async () => {
        throw new Error("boom");
      },
    };
    const result = await resolveCapability("boom", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'boom' failed to load: boom`,
    );
  });

  it("a factory resolving a NON-OBJECT yields the fixed non-object phrase (never rejects)", async () => {
    // An unproven runtime value crossing the parse boundary: the thunk's
    // declared module shape is documentation, not protection.
    const table: CapabilityTable = {
      scalar: async () => JSON.parse("42"),
    };
    const result = await resolveCapability("scalar", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'scalar' failed to load: module resolved to a non-object`,
    );
  });

  it("a module WITHOUT a default export yields the fixed no-default phrase (never rejects)", async () => {
    const table: CapabilityTable = {
      empty: async () => JSON.parse("{}"),
    };
    const result = await resolveCapability("empty", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'empty' failed to load: module has no class default export`,
    );
  });

  it("a default whose prototype chain starts at a bare object (non-constructor-function form) is uniformly refused at identity — no special casing", async () => {
    const BareFnLike = class extends PioCapability {
      readonly contract: Contract = wellFormed("bare");
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    };
    severChain(BareFnLike, {});
    const table: CapabilityTable = {
      bare: async () => ({ default: BareFnLike }),
    };
    const result = await resolveCapability("bare", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(IDENTITY_LINE("bare"));
  });

  it("a throwaway CONSTRUCTION throw yields the load-fault line carrying its message (never rejects)", async () => {
    class ExplodingCap extends PioCapability {
      readonly contract: Contract = wellFormed("exploding");
      constructor(params: CapabilityParams) {
        super(params);
        throw new Error("ctor exploded");
      }
      async call(): Promise<Record<string, unknown>> {
        return {};
      }
    }
    const table: CapabilityTable = {
      exploding: async () => ({ default: ExplodingCap }),
    };
    const result = await resolveCapability("exploding", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'exploding' failed to load: ctor exploded`,
    );
  });

  it("a MULTI-LINE fault detail folds to a SINGLE physical line via the private fold (bytes pinned)", async () => {
    const table: CapabilityTable = {
      loud: async () => {
        throw new Error("line\none\ttwo   three");
      },
    };
    const result = await resolveCapability("loud", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'loud' failed to load: line one two three`,
    );
  });

  it("an EMPTY fault detail degrades to the fixed placeholder (bytes pinned)", async () => {
    const table: CapabilityTable = {
      silent: async () => {
        throw new Error("");
      },
    };
    const result = await resolveCapability("silent", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'silent' failed to load: (no detail)`,
    );
  });

  it("a NON-ERROR thrown value renders through its string form (bytes pinned)", async () => {
    const table: CapabilityTable = {
      kaput: async () => {
        throw "kaput";
      },
    };
    const result = await resolveCapability("kaput", table);
    expect(result.ok).toBe(false);
    expect(asRefusal(result)).toBe(
      `pio: capability 'kaput' failed to load: kaput`,
    );
  });
});

describe("lazy discipline and structural guards", () => {
  const src = readFileSync(new URL("./loader.ts", import.meta.url), "utf8");

  it("a hit flips EXACTLY its own evaluation flag (no collateral factory evaluation)", async () => {
    const table: CapabilityTable = {
      alpha: async () => {
        harness.flags.alpha = true;
        return { default: FIXTURE_ALPHA };
      },
      beta: async () => {
        harness.flags.beta = true;
        return { default: FIXTURE_BETA };
      },
      gamma: async () => {
        harness.flags.gamma = true;
        return { default: FIXTURE_GAMMA };
      },
    };
    const result = await resolveCapability("beta", table);
    expect(result.ok).toBe(true);
    expect(asOk(result).ctor).toBe(FIXTURE_BETA);
    expect(harness.flags).toEqual({ alpha: false, beta: true, gamma: false });
  });

  it("static import specifier set is EXACTLY the bundled base plus the contract checker (sorted)", () => {
    const specifiers = [
      ...src.matchAll(
        /^\s*import\s+(?:type\s+)?[^\n;]*?from\s+["']([^"']+)["']/gm,
      ),
    ].map((match) => match[1]);
    // Multi-line static imports would slip past this single-clause pattern;
    // the SDK-absence row below catches an SDK-typed one regardless.
    expect([...specifiers].sort()).toEqual(["./base.ts", "./contract.ts"]);
  });

  it("zero occurrences of the SDK specifier in loader.ts source", () => {
    expect(src.includes("@earendil-works/pi-coding-agent")).toBe(false);
  });

  it("the probe builtin is UNREACHABLE from loader.ts: zero quoted './probe.ts' / '../probe.ts' specifiers (a table entry could never fire it)", () => {
    for (const quote of ['"', "'"]) {
      for (const specifier of ["./probe.ts", "../probe.ts"]) {
        expect(src.includes(`${quote}${specifier}${quote}`)).toBe(false);
      }
    }
  });

  it("dynamic-import literal specifier set is EXACTLY empty while the table ships AND total import( count equals the literal-set length (no interpolation)", () => {
    const literalSet = [
      ...src.matchAll(/import\(\s*["']([^"']*)["']\s*\)/g),
    ].map((match) => match[1]);
    const totalImportCalls = (src.match(/import\(/g) ?? []).length;
    expect(literalSet).toEqual([]);
    expect(totalImportCalls).toBe(literalSet.length);
  });

  it("zero standalone 'pty' words (house style, standing convention)", () => {
    expect(/\bpty\b/.test(src)).toBe(false);
  });

  it("runtime export surface is EXACTLY the three value exports (types and interfaces erase under erasable syntax)", async () => {
    const mod = await import("./loader.ts");
    expect(Object.keys(mod).sort()).toEqual([
      "CAPABILITY_TABLE",
      "capabilityRefusalLine",
      "resolveCapability",
    ]);
  });
});
