import { describe, expect, it } from "vitest";
import { createProject } from "@reelcraft/project";
import { activeSegment, compositionMetadata, overlayIntervals } from "./timeline";

const segments = [
  { id: "s1", text: "one", startFrame: 0, endFrame: 30, reviewStatus: "accepted" as const },
  { id: "s2", text: "two", startFrame: 45, endFrame: 60, reviewStatus: "accepted" as const },
];

describe("activeSegment", () => {
  it("returns the segment covering the frame, start inclusive and end exclusive", () => {
    expect(activeSegment(segments, 0)?.id).toBe("s1");
    expect(activeSegment(segments, 29)?.id).toBe("s1");
    expect(activeSegment(segments, 30)).toBeNull();
    expect(activeSegment(segments, 45)?.id).toBe("s2");
    expect(activeSegment(segments, 60)).toBeNull();
  });

  it("returns null for an empty track", () => {
    expect(activeSegment([], 10)).toBeNull();
  });
});

describe("overlayIntervals", () => {
  it("cuts at caption boundaries and the call-to-action start", () => {
    const project = createProject({ id: "p", name: "n", durationFrames: 300 });
    project.template.slots = { headline: "h", callToAction: "go" };
    project.captionTracks.push({ id: "t", language: "en", script: "Latn", segments });
    expect(overlayIntervals(project)).toEqual([
      { startFrame: 0, endFrame: 30 },
      { startFrame: 30, endFrame: 45 },
      { startFrame: 45, endFrame: 60 },
      { startFrame: 60, endFrame: 210 },
      { startFrame: 210, endFrame: 300 },
    ]);
  });

  it("is a single span when nothing changes", () => {
    const project = createProject({ id: "p", name: "n", durationFrames: 300 });
    expect(overlayIntervals(project)).toEqual([{ startFrame: 0, endFrame: 300 }]);
  });
});

describe("compositionMetadata", () => {
  it("derives size, duration and fps from the project", () => {
    const project = createProject({ id: "p", name: "n", durationFrames: 900 });
    expect(compositionMetadata(project)).toEqual({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
    });
  });

  it("converts a rational frame rate to a number", () => {
    const project = createProject({ id: "p", name: "n", durationFrames: 900 });
    project.fps = { num: 30000, den: 1001 };
    expect(compositionMetadata(project).fps).toBeCloseTo(29.97, 2);
  });
});
