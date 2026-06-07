import { slugify, titleCase, truncate } from "./utils";

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("converts a simple string to a slug", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("collapses consecutive special characters into a single hyphen", () => {
    expect(slugify("  foo---bar  ")).toBe("foo-bar");
  });

  it("leaves an already-good slug unchanged", () => {
    expect(slugify("already-good")).toBe("already-good");
  });

  it("trims leading special characters", () => {
    expect(slugify("___leading")).toBe("leading");
  });

  it("trims trailing special characters", () => {
    expect(slugify("trailing___")).toBe("trailing");
  });

  it("returns empty string for all-special-char input", () => {
    expect(slugify("---")).toBe("");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// titleCase
// ---------------------------------------------------------------------------

describe("titleCase", () => {
  it("capitalizes the first letter of each word", () => {
    expect(titleCase("hello world")).toBe("Hello World");
  });

  it("lowercases remaining characters in each word", () => {
    expect(titleCase("HELLO WORLD")).toBe("Hello World");
  });

  it("handles multiple words", () => {
    expect(titleCase("foo bar baz")).toBe("Foo Bar Baz");
  });

  it("normalizes multiple spaces to single spaces", () => {
    expect(titleCase("hello   world")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(titleCase("")).toBe("");
  });

  it("handles a single word", () => {
    expect(titleCase("hello")).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("truncates a string that exceeds maxLength", () => {
    // per spec: text.slice(0, maxLength) + "..."
    expect(truncate("hello world", 8)).toBe("hello wo...");
  });

  it("returns string unchanged when within maxLength", () => {
    expect(truncate("hi", 10)).toBe("hi");
  });

  it("returns string unchanged when equal to maxLength", () => {
    expect(truncate("exact", 5)).toBe("exact");
  });

  it("truncates with short maxLength", () => {
    expect(truncate("abcdefghij", 3)).toBe("abc...");
  });

  it("returns '...' for maxLength 0 with non-empty string", () => {
    expect(truncate("hello", 0)).toBe("...");
  });

  it("returns empty string for empty input", () => {
    expect(truncate("", 5)).toBe("");
  });
});
