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
      expect(state.currentStep).toBe(0);
      expect(state.currentIteration).toBe(0);
      expect(state.totalSteps).toBe(0);
      expect(state.stepsList).toEqual([]);
    });
  });

  describe("setState", () => {
    it("merges partial updates without overwriting other fields", () => {
      setState({ isActive: true, totalSteps: 5 });

      const state = getState();

      expect(state.isActive).toBe(true);
      expect(state.totalSteps).toBe(5);
      // Other fields should retain defaults
      expect(state.markCompleteCalled).toBe(false);
      expect(state.turnCount).toBe(0);
      expect(state.currentStep).toBe(0);
      expect(state.currentIteration).toBe(0);
      expect(state.stepsList).toEqual([]);
    });

    it("can update a single field", () => {
      setState({ turnCount: 3 });

      expect(getState().turnCount).toBe(3);
    });

    it("can update stepsList", () => {
      const steps = [
        { id: "step-1", title: "Step One", instructions: "Do something" },
      ];
      setState({ stepsList: steps, totalSteps: 1 });

      const state = getState();
      expect(state.stepsList).toEqual(steps);
      expect(state.totalSteps).toBe(1);
    });
  });

  describe("resetState", () => {
    it("resets all fields to defaults", () => {
      setState({
        isActive: true,
        markCompleteCalled: true,
        turnCount: 5,
        currentStep: 3,
        currentIteration: 2,
        totalSteps: 5,
        stepsList: [{ id: "s1", title: "A", instructions: "I" }],
      });

      resetState();

      const state = getState();
      expect(state.isActive).toBe(false);
      expect(state.markCompleteCalled).toBe(false);
      expect(state.turnCount).toBe(0);
      expect(state.currentStep).toBe(0);
      expect(state.currentIteration).toBe(0);
      expect(state.totalSteps).toBe(0);
      expect(state.stepsList).toEqual([]);
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
          currentStep: 4,
          currentIteration: 3,
          totalSteps: 6,
          stepsList: [],
        };

        __testSetState(newState);

        const state = getState();
        expect(state.isActive).toBe(true);
        expect(state.turnCount).toBe(10);
        expect(state.currentStep).toBe(4);
        expect(state.currentIteration).toBe(3);
        expect(state.totalSteps).toBe(6);
      });

      it("returns the current state when called without arguments", () => {
        setState({ turnCount: 42 });

        const result = __testSetState();

        expect(result.turnCount).toBe(42);
      });
    });
  });
});
