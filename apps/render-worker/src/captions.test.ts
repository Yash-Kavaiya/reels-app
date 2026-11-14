import { FPS_30 } from "@reelcraft/project";
import { describe, expect, it } from "vitest";
import { type Word, scriptFor, wordsToSegments } from "./captions";

let n = 0;
const nextId = () => `s${++n}`;
const word = (text: string, start: number, end: number, probability = 0.9): Word => ({
  text,
  start,
  end,
  probability,
});
const build = (words: Word[], durationFrames = 900) => wordsToSegments(words, FPS_30, durationFrames, nextId);

describe("wordsToSegments", () => {
  it("groups words into short phrases and converts to frames", () => {
    const segments = build([
      word("Show", 0, 0.3),
      word("the", 0.3, 0.4),
      word("useful", 0.4, 0.8),
      word("part", 0.8, 1.0),
      word("first.", 1.0, 1.4),
      word("Keep", 1.5, 1.8),
      word("captions", 1.8, 2.3),
      word("short.", 2.3, 2.8),
    ]);
    expect(segments.map((s) => [s.text, s.startFrame, s.endFrame])).toEqual([
      ["Show the useful part first.", 0, 42],
      ["Keep captions short.", 45, 84],
    ]);
  });

  it("breaks on a long pause", () => {
    const segments = build([word("Hello", 0, 0.4), word("there", 0.5, 0.9), word("again", 3, 3.4)]);
    expect(segments.map((s) => s.text)).toEqual(["Hello there", "again"]);
  });

  it("breaks when a phrase gets too long to read", () => {
    const words = "one two three four five six seven eight nine ten eleven twelve"
      .split(" ")
      .map((text, i) => word(text, i * 0.3, i * 0.3 + 0.25));
    const segments = build(words);
    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) expect(segment.text.length).toBeLessThanOrEqual(42);
  });

  it("never overlaps, never runs past the reel and keeps captions readable", () => {
    const segments = build([word("a", 0, 0.01), word("b.", 0.01, 0.02), word("late", 29.9, 31)], 900);
    for (const [i, segment] of segments.entries()) {
      expect(segment.endFrame).toBeGreaterThan(segment.startFrame);
      expect(segment.endFrame).toBeLessThanOrEqual(900);
      if (i > 0) expect(segment.startFrame).toBeGreaterThanOrEqual(segments[i - 1]!.endFrame);
    }
    // A flash of a caption is stretched so it can be read.
    expect(segments[0]!.endFrame - segments[0]!.startFrame).toBeGreaterThanOrEqual(15);
  });

  it("drops words that start after the reel ends", () => {
    expect(build([word("gone", 40, 41)], 900)).toEqual([]);
  });

  it("flags uncertain phrases for review", () => {
    const segments = build([word("clear", 0, 0.5, 0.95), word("words.", 0.5, 1, 0.9), word("mumble", 2, 2.5, 0.2)]);
    expect(segments.map((s) => s.reviewStatus)).toEqual(["accepted", "needs-review"]);
  });

  it("returns nothing when there is no speech", () => {
    expect(build([])).toEqual([]);
  });
});

describe("scriptFor", () => {
  it("maps supported languages to their script and defaults to Latin", () => {
    expect(scriptFor("hi")).toBe("Deva");
    expect(scriptFor("gu")).toBe("Gujr");
    expect(scriptFor("en")).toBe("Latn");
    expect(scriptFor("fr")).toBe("Latn");
  });
});
