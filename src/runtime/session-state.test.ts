import { beforeEach, describe, expect, it } from "vitest";
import {
  __testGetState,
  __testSetState,
  getState,
  resetState,
  setState,
} from "./session-state";

describe("session-state", () => {
  beforeEach(() => {
    resetState();
  });

  describe("getState", () => {
    it("returns default initial state", () => {
      const state = getState();

      expect(state.isActive).toBe(false);
      expect(state.markCompleteCalled).toBe(false);
      expect(state.turnCount).toBe(0);
      expect(state.currentPhase).toBe(0);
      expect(state.currentIteration).toBe(0);
      expect(state.totalPhases).toBe(0);
      expect(state.phasesList).toEqual([]);
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);
      expect(state.isAdHocInput).toBe(false);
    });
  });

  describe("setState", () => {
    it("merges partial updates without overwriting other fields", () => {
      setState({ isActive: true, totalPhases: 5 });

      const state = getState();

      expect(state.isActive).toBe(true);
      expect(state.totalPhases).toBe(5);
      // Other fields should retain defaults
      expect(state.markCompleteCalled).toBe(false);
      expect(state.turnCount).toBe(0);
      expect(state.currentPhase).toBe(0);
      expect(state.currentIteration).toBe(0);
      expect(state.phasesList).toEqual([]);
    });

    it("can update a single field", () => {
      setState({ turnCount: 3 });

      expect(getState().turnCount).toBe(3);
    });

    it("can update stepsList", () => {
      const steps = [
        { id: "step-1", title: "Step One", instructions: "Do something" },
      ];
      setState({ phasesList: steps, totalPhases: 1 });

      const state = getState();
      expect(state.phasesList).toEqual(steps);
      expect(state.totalPhases).toBe(1);
    });
  });

  describe("resetState", () => {
    it("resets all fields to defaults", () => {
      setState({
        isActive: true,
        markCompleteCalled: true,
        turnCount: 5,
        currentPhase: 3,
        currentIteration: 2,
        totalPhases: 5,
        phasesList: [{ id: "s1", title: "A", instructions: "I" }],
        filesWritten: ["/some/file"],
        askUserCalled: true,
        isAdHocInput: true,
      });

      resetState();

      const state = getState();
      expect(state.isActive).toBe(false);
      expect(state.markCompleteCalled).toBe(false);
      expect(state.turnCount).toBe(0);
      expect(state.currentPhase).toBe(0);
      expect(state.currentIteration).toBe(0);
      expect(state.totalPhases).toBe(0);
      expect(state.phasesList).toEqual([]);
      expect(state.filesWritten).toEqual([]);
      expect(state.askUserCalled).toBe(false);
      expect(state.isAdHocInput).toBe(false);
    });
  });

  describe("test accessors", () => {
    describe("__testGetState", () => {
      it("returns the current state", () => {
        setState({ turnCount: 7 });

        expect(__testGetState().turnCount).toBe(7);
      });
    });

    describe("__testSetState", () => {
      it("replaces the entire state when called with an argument", () => {
        const newState = {
          isActive: true,
          markCompleteCalled: false,
          turnCount: 10,
          currentPhase: 4,
          currentIteration: 3,
          totalPhases: 6,
          phasesList: [],
          filesWritten: ["/test/file"],
          askUserCalled: true,
          isAdHocInput: false,
          phaseWriteAllowlist: new Map(),
        };

        __testSetState(newState);

        const state = getState();
        expect(state.isActive).toBe(true);
        expect(state.turnCount).toBe(10);
        expect(state.currentPhase).toBe(4);
        expect(state.currentIteration).toBe(3);
        expect(state.totalPhases).toBe(6);
        expect(state.filesWritten).toEqual(["/test/file"]);
        expect(state.askUserCalled).toBe(true);
        expect(state.isAdHocInput).toBe(false);
      });

      it("returns the current state when called without arguments", () => {
        setState({ turnCount: 42 });

        const result = __testSetState();

        expect(result.turnCount).toBe(42);
      });
    });
  });
});
