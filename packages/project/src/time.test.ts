import { describe, expect, it } from "vitest";
import { FPS_30, frameToUs, mapSourceUsToOutputFrame, usToFrame } from "./time";

const NTSC = { num: 30000, den: 1001 };

describe("usToFrame", () => {
  it("converts whole seconds at 30 fps", () => {
    expect(usToFrame(0, FPS_30)).toBe(0);
    expect(usToFrame(1_000_000, FPS_30)).toBe(30);
    expect(usToFrame(45_000_000, FPS_30)).toBe(1350);
  });

  it("rounds to the nearest frame, half up", () => {
    // one frame at 30 fps is 33_333.33 us
    expect(usToFrame(16_666, FPS_30)).toBe(0);
    expect(usToFrame(16_667, FPS_30)).toBe(1);
    expect(usToFrame(49_999, FPS_30)).toBe(1);
    expect(usToFrame(50_000, FPS_30)).toBe(2);
  });

  it("handles rational frame rates", () => {
    expect(usToFrame(1_001_000, NTSC)).toBe(30);
  });

  it("rejects negative and non-integer input", () => {
    expect(() => usToFrame(-1, FPS_30)).toThrow();
    expect(() => usToFrame(1.5, FPS_30)).toThrow();
  });
});

describe("frameToUs", () => {
  it("is the inverse of usToFrame on frame boundaries", () => {
    for (const fps of [FPS_30, NTSC]) {
      for (const frame of [0, 1, 29, 30, 1349, 5400]) {
        expect(usToFrame(frameToUs(frame, fps), fps)).toBe(frame);
      }
    }
  });

  it("converts frames at 30 fps", () => {
    expect(frameToUs(30, FPS_30)).toBe(1_000_000);
    expect(frameToUs(1, FPS_30)).toBe(33_333);
  });
});

describe("mapSourceUsToOutputFrame", () => {
  const clip = {
    sourceStartUs: 10_000_000,
    sourceEndUs: 20_000_000,
    outputStartFrame: 60,
    outputEndFrame: 360,
  };

  it("maps a source time inside the clip into output frames", () => {
    expect(mapSourceUsToOutputFrame(clip, 10_000_000, FPS_30)).toBe(60);
    expect(mapSourceUsToOutputFrame(clip, 12_000_000, FPS_30)).toBe(120);
  });

  it("treats the range as start inclusive and end exclusive", () => {
    expect(mapSourceUsToOutputFrame(clip, 9_999_999, FPS_30)).toBeNull();
    expect(mapSourceUsToOutputFrame(clip, 20_000_000, FPS_30)).toBeNull();
    expect(mapSourceUsToOutputFrame(clip, 19_990_000, FPS_30)).toBe(359);
  });
});
