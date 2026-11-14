import { describe, expect, it } from "vitest";
import { toSrt, toVtt } from "./captions";
import { FPS_30 } from "./time";
import type { CaptionTrack } from "./schema";

const track: CaptionTrack = {
  id: "t1",
  language: "gu",
  script: "Gujr",
  segments: [
    { id: "s1", text: "નમસ્તે", startFrame: 0, endFrame: 45, reviewStatus: "accepted" },
    { id: "s2", text: "line one\nline two", startFrame: 45, endFrame: 109_815, reviewStatus: "accepted" },
  ],
};

describe("toSrt", () => {
  it("writes numbered cues with comma millisecond timestamps", () => {
    expect(toSrt(track, FPS_30)).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nનમસ્તે\n\n2\n00:00:01,500 --> 01:01:00,500\nline one\nline two\n",
    );
  });

  it("returns an empty string for an empty track", () => {
    expect(toSrt({ ...track, segments: [] }, FPS_30)).toBe("");
  });
});

describe("toVtt", () => {
  it("writes a WEBVTT header and dot millisecond timestamps", () => {
    expect(toVtt(track, FPS_30)).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nનમસ્તે\n\n00:00:01.500 --> 01:01:00.500\nline one\nline two\n",
    );
  });
});
