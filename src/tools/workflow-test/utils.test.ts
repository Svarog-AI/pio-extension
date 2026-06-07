import { deepMerge, formatList, layerConfig, slugify, titleCase, truncate } from "./utils";

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

// ---------------------------------------------------------------------------
// formatList
// ---------------------------------------------------------------------------

describe("formatList", () => {
  it("formats multiple items as a bulleted list", () => {
    expect(formatList(["a", "b"])).toBe("- a\n- b\n");
  });

  it("returns empty string for empty array", () => {
    expect(formatList([])).toBe("");
  });

  it("formats a single item", () => {
    expect(formatList(["single"])).toBe("- single\n");
  });

  it("preserves embedded newlines in items", () => {
    expect(formatList(["line1\nline2"])).toBe("- line1\nline2\n");
  });

  it("preserves special characters in items", () => {
    expect(formatList(["- already has dash", "**bold**", "item: with colon"])).toBe(
      "- - already has dash\n- **bold**\n- item: with colon\n"
    );
  });

  it("handles items with spaces", () => {
    expect(formatList(["hello world", "foo bar"])).toBe("- hello world\n- foo bar\n");
  });

  it("handles items with unicode characters", () => {
    expect(formatList(["café", "naïve"])).toBe("- café\n- naïve\n");
  });
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

describe("deepMerge", () => {
  it("merges two flat objects", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("recursively merges nested plain objects", () => {
    expect(deepMerge({ a: { x: 1 } }, { a: { y: 2 } })).toEqual({ a: { x: 1, y: 2 } });
  });

  it("replaces arrays from source entirely", () => {
    expect(deepMerge({ items: [1, 2] }, { items: [3] })).toEqual({ items: [3] });
  });

  it("leaves target intact with empty source", () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("returns source with empty target", () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
  });

  it("overwrites null in target with source scalar", () => {
    expect(deepMerge({ a: null }, { a: 1 })).toEqual({ a: 1 });
  });

  it("uses null from source as leaf replacement", () => {
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it("uses undefined from source as overwrite", () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: undefined });
  });

  it("does not mutate the original target", () => {
    const target = { a: 1, b: { x: 1 } };
    const targetCopy = JSON.parse(JSON.stringify(target));
    deepMerge(target, { b: { y: 2 }, c: 3 });
    expect(target).toEqual(targetCopy);
  });

  it("handles deeply nested structures (3+ levels)", () => {
    expect(
      deepMerge({ a: { b: { c: 1 } } }, { a: { b: { d: 2 } } }),
    ).toEqual({ a: { b: { c: 1, d: 2 } } });
  });

  it("handles mixed nesting with array replacement and new keys", () => {
    expect(
      deepMerge({ a: { x: [1, 2] } }, { a: { x: [3], y: 4 } }),
    ).toEqual({ a: { x: [3], y: 4 } });
  });
});

// ---------------------------------------------------------------------------
// layerConfig
// ---------------------------------------------------------------------------

describe("layerConfig", () => {
  it("preserves nested defaults not overridden", () => {
    expect(layerConfig({ a: 1, b: { x: 1 } }, { b: { y: 2 } })).toEqual({
      a: 1,
      b: { x: 1, y: 2 },
    });
  });

  it("preserves all defaults with empty overrides", () => {
    expect(layerConfig({ a: 1 }, {})).toEqual({ a: 1 });
  });
});
