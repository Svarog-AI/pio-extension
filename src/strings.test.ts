import { joinWithSeparator } from "./strings";

describe("joinWithSeparator", () => {
  it("joins two strings with the separator", () => {
    expect(joinWithSeparator("hello", "world", "-")).toBe("hello-world");
  });

  it("handles empty first string", () => {
    expect(joinWithSeparator("", "world", "-")).toBe("-world");
  });

  it("handles empty second string", () => {
    expect(joinWithSeparator("hello", "", "-")).toBe("hello-");
  });

  it("handles both strings empty", () => {
    expect(joinWithSeparator("", "", "-")).toBe("-");
  });

  it("handles multi-character separator", () => {
    expect(joinWithSeparator("hello", "world", " --- ")).toBe("hello --- world");
  });
});
