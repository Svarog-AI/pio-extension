import { stepFolderName } from "../src/utils";

describe("smoke", () => {
  it("adds numbers correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves ESM imports", () => {
    // Import a function from src/ to prove Vitest resolves TypeScript + ESM correctly
    expect(stepFolderName(1)).toBe("S01");
    expect(stepFolderName(9)).toBe("S09");
    expect(stepFolderName(10)).toBe("S10");
  });
});
