import { beforeEach, describe, expect, it } from "vitest";
import {
  __testResetStore,
  getStore,
  SessionVariableStore,
  setStore,
} from "./session-store";

describe("SessionVariableStore", () => {
  let store: SessionVariableStore;

  beforeEach(() => {
    store = new SessionVariableStore({});
    __testResetStore();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates a store with empty params", () => {
      const s = new SessionVariableStore({});
      expect(s.getAll()).toEqual({});
    });

    it("stores params in read-only layer; get returns param value", () => {
      const s = new SessionVariableStore({ key: "val" });
      expect(s.get("key")).toBe("val");
    });

    it("set on a param name throws with error indicating param name", () => {
      const s = new SessionVariableStore({ key: "val" });
      expect(() => s.set("key", "string", "other")).toThrow(
        "Cannot set variable 'key': it is a read-only session parameter",
      );
    });
  });

  // -----------------------------------------------------------------------
  // declare()
  // -----------------------------------------------------------------------

  describe("declare()", () => {
    it("registers type, allows subsequent matching set, and isDefined is false until set", () => {
      store.declare("foo", "number");
      expect(store.isDefined("foo")).toBe(false);
      store.set("foo", "number", 42);
      expect(store.isDefined("foo")).toBe(true);
      expect(store.get("foo")).toBe(42);
    });

    it("get returns undefined for declared but not set", () => {
      store.declare("foo", "number");
      expect(store.get("foo")).toBe(undefined);
    });

    it("calling declare() twice with same name and type is a no-op (idempotent)", () => {
      store.declare("foo", "number");
      expect(() => store.declare("foo", "number")).not.toThrow();
    });

    it("calling declare() with a different type for the same name throws", () => {
      store.declare("foo", "number");
      expect(() => store.declare("foo", "string")).toThrow(
        /Type mismatch for variable 'foo'/,
      );
    });

    it("declare on a param name throws with error indicating param name", () => {
      const s = new SessionVariableStore({ readOnlyKey: "val" });
      expect(() => s.declare("readOnlyKey", "string")).toThrow(
        "Cannot declare variable 'readOnlyKey': it is a read-only session parameter",
      );
    });
  });

  // -----------------------------------------------------------------------
  // set() — type enforcement
  // -----------------------------------------------------------------------

  describe("set() — type enforcement", () => {
    it("stores value with declared type on first set", () => {
      store.set("x", "string", "hello");
      expect(store.get("x")).toBe("hello");
      expect(store.isDefined("x")).toBe(true);
    });

    it("subsequent set with matching type succeeds and overwrites value", () => {
      store.set("x", "string", "hello");
      store.set("x", "string", "world");
      expect(store.get("x")).toBe("world");
    });

    it("set with mismatched type after prior set throws", () => {
      store.set("x", "string", "hello");
      expect(() => store.set("x", "number", 42)).toThrow(
        /Type mismatch for variable 'x': expected 'string', got 'number'/,
      );
    });

    it("after declare(), set with mismatched type throws", () => {
      store.declare("foo", "number");
      expect(() => store.set("foo", "string", "bad")).toThrow(
        /Type mismatch for variable 'foo': expected 'number', got 'string'/,
      );
    });

    it("after declare(), set with matching type succeeds", () => {
      store.declare("foo", "number");
      store.set("foo", "number", 42);
      expect(store.get("foo")).toBe(42);
    });

    it("set on a param name throws with error indicating param name", () => {
      const s = new SessionVariableStore({ readOnlyKey: "val" });
      expect(() => s.set("readOnlyKey", "string", "other")).toThrow(
        "Cannot set variable 'readOnlyKey': it is a read-only session parameter",
      );
    });

    it("stores and retrieves falsy values (0, false, null) correctly", () => {
      store.set("zero", "number", 0);
      store.set("flag", "boolean", false);
      store.set("nothing", "string", null);
      expect(store.get("zero")).toBe(0);
      expect(store.get("flag")).toBe(false);
      expect(store.get("nothing")).toBe(null);
      expect(store.isDefined("zero")).toBe(true);
      expect(store.isDefined("flag")).toBe(true);
      expect(store.isDefined("nothing")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // set() — interpolation
  // -----------------------------------------------------------------------

  describe("set() — interpolation", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: test description mentions interpolation syntax
    it("resolves ${...} placeholders from writable vars", () => {
      store.set("name", "string", "World");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      store.set("greeting", "string", "Hello, ${name}!");
      expect(store.get("greeting")).toBe("Hello, World!");
    });

    it("interpolation resolves from writable layer (writable takes precedence over params)", () => {
      const s = new SessionVariableStore({ p: "B" });
      s.set("x", "string", "A");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      s.set("msg", "string", "${x} and ${p}");
      expect(s.get("msg")).toBe("A and B");
    });

    it("unresolved placeholders pass through unchanged", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      store.set("msg", "string", "Hi ${unknown}");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.get("msg")).toBe("Hi ${unknown}");
    });

    it("non-string values bypass interpolation", () => {
      store.set("count", "number", 42);
      expect(store.get("count")).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe("get()", () => {
    it("returns writable value when set", () => {
      store.set("x", "string", "A");
      expect(store.get("x")).toBe("A");
    });

    it("falls back to params when not in writable layer", () => {
      const s = new SessionVariableStore({ y: "B" });
      expect(s.get("y")).toBe("B");
    });

    it("returns undefined for declared-but-unset vars", () => {
      store.declare("foo", "number");
      expect(store.get("foo")).toBe(undefined);
    });

    it("returns undefined for unknown names", () => {
      expect(store.get("nonexistent")).toBe(undefined);
    });
  });

  // -----------------------------------------------------------------------
  // getAll()
  // -----------------------------------------------------------------------

  describe("getAll()", () => {
    it("returns merged snapshot with writable values and params", () => {
      const s = new SessionVariableStore({ p: "param" });
      s.set("w", "string", "writable");
      expect(s.getAll()).toEqual({ p: "param", w: "writable" });
    });

    it("does not include declared-but-unset vars in result", () => {
      store.declare("foo", "number");
      expect(store.getAll()).not.toHaveProperty("foo");
    });

    it("returned object is a shallow copy (mutations don't affect store)", () => {
      store.set("a", "string", "val");
      const snapshot = store.getAll();
      snapshot.a = "mutated";
      expect(store.get("a")).toBe("val");
    });

    it("includes all read-only params when no writable vars exist", () => {
      const s = new SessionVariableStore({ a: 1, b: "two" });
      expect(s.getAll()).toEqual({ a: 1, b: "two" });
    });
  });

  // -----------------------------------------------------------------------
  // isDefined()
  // -----------------------------------------------------------------------

  describe("isDefined()", () => {
    it("returns true after set()", () => {
      store.set("x", "string", "val");
      expect(store.isDefined("x")).toBe(true);
    });

    it("returns false for declared-but-unset vars", () => {
      store.declare("x", "number");
      expect(store.isDefined("x")).toBe(false);
    });

    it("returns false for read-only params", () => {
      const s = new SessionVariableStore({ param: "val" });
      expect(s.isDefined("param")).toBe(false);
    });

    it("returns false for unknown names", () => {
      expect(store.isDefined("unknown")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // interpolate()
  // -----------------------------------------------------------------------

  describe("interpolate()", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: test description mentions interpolation syntax
    it("resolves ${name} placeholders using merged vars", () => {
      store.set("name", "string", "World");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.interpolate("Hello, ${name}!")).toBe("Hello, World!");
    });

    it("resolves multiple placeholders in one string", () => {
      store.set("a", "string", "one");
      store.set("b", "string", "two");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.interpolate("${a} and ${b}")).toBe("one and two");
    });

    it("unresolved placeholders pass through unchanged", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(store.interpolate("Hi ${nonExistent}")).toBe("Hi ${nonExistent}");
    });

    it("empty template returns empty string", () => {
      expect(store.interpolate("")).toBe("");
    });

    it("resolves from params layer", () => {
      const s = new SessionVariableStore({ p: "fromParam" });
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(s.interpolate("val=${p}")).toBe("val=fromParam");
    });

    it("writable layer takes precedence over params in interpolation", () => {
      const s = new SessionVariableStore({ p: "param" });
      s.set("x", "string", "writable");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test of interpolation
      expect(s.interpolate("${x} and ${p}")).toBe("writable and param");
    });
  });

  // -----------------------------------------------------------------------
  // Module-level singleton
  // -----------------------------------------------------------------------

  describe("module-level singleton", () => {
    it("getStore() returns null initially", () => {
      expect(getStore()).toBe(null);
    });

    it("after setStore(), getStore() returns the same instance", () => {
      const s = new SessionVariableStore({});
      setStore(s);
      expect(getStore()).toBe(s);
    });

    it("__testResetStore() resets _store to null", () => {
      const s = new SessionVariableStore({});
      setStore(s);
      __testResetStore();
      expect(getStore()).toBe(null);
    });
  });
});
