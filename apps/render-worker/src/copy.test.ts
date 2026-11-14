import { describe, expect, it } from "vitest";
import { heuristicCopy } from "./copy";

describe("heuristicCopy", () => {
  it("uses the first sentence as the headline, without end punctuation", () => {
    const copy = heuristicCopy("Three ways to improve a Short. First, show the result.", "en", "clip");
    expect(copy).toEqual({ headline: "Three ways to improve a Short", callToAction: "Follow for more" });
  });

  it("shortens a long opening at a word boundary", () => {
    const copy = heuristicCopy(
      "Today I want to walk you through every single setting in the export dialog one by one",
      "en",
      "clip",
    );
    expect(copy.headline.length).toBeLessThanOrEqual(40);
    expect(copy.headline).toBe("Today I want to walk you through every…");
  });

  it("handles Hindi sentences ending in a danda and localises the call to action", () => {
    const copy = heuristicCopy("सबसे ज़रूरी हिस्सा पहले दिखाएं। फिर कैप्शन छोटे रखें।", "hi", "clip");
    expect(copy.headline).toBe("सबसे ज़रूरी हिस्सा पहले दिखाएं");
    expect(copy.callToAction).toBe("और के लिए फ़ॉलो करें");
  });

  it("falls back to the file name when there is no speech", () => {
    expect(heuristicCopy("  ", "gu", "my_product-demo").headline).toBe("my product demo");
  });
});
