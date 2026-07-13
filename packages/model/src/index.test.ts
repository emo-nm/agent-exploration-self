import { describe, expect, it } from "vitest";
import { MAX_CACHE_BREAKPOINTS, selectBreakpointIndices } from "./index.js";

const msg = (role: string) => ({ role });

describe("selectBreakpointIndices", () => {
  it("returns nothing for an empty prompt", () => {
    expect(selectBreakpointIndices([])).toEqual([]);
  });

  it("marks the system message plus trailing messages", () => {
    const prompt = [msg("system"), msg("user"), msg("assistant"), msg("user")];
    // system (0) + last three (1,2,3) = all four, within the cap.
    expect(selectBreakpointIndices(prompt)).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds Anthropic's 4-breakpoint limit", () => {
    const prompt = [msg("system"), ...Array.from({ length: 20 }, () => msg("user"))];
    const indices = selectBreakpointIndices(prompt);
    expect(indices.length).toBeLessThanOrEqual(MAX_CACHE_BREAKPOINTS);
    // Always includes the system prefix and the final (newest) message.
    expect(indices).toContain(0);
    expect(indices).toContain(prompt.length - 1);
  });

  it("works with no system message", () => {
    const prompt = [msg("user"), msg("assistant"), msg("user")];
    expect(selectBreakpointIndices(prompt)).toEqual([0, 1, 2]);
  });
});
