import { type Project, createProject, parseProject } from "@reelcraft/project";
import { describe, expect, it } from "vitest";
import { acceptSegment, addSegment, removeSegment, setLanguage, setSlot, updateSegment } from "./editing";

let n = 0;
const nextId = () => `id-${++n}`;

function base(): Project {
  const project = createProject({ id: "p", name: "Talk", durationFrames: 375 });
  project.captionTracks.push({
    id: "track",
    language: "en",
    script: "Latn",
    segments: [
      { id: "a", text: "a", startFrame: 0, endFrame: 100, reviewStatus: "accepted" },
      { id: "b", text: "b", startFrame: 100, endFrame: 200, reviewStatus: "needs-review" },
      { id: "c", text: "c", startFrame: 200, endFrame: 300, reviewStatus: "accepted" },
    ],
  });
  return project;
}

const segments = (project: Project) => project.captionTracks[0]!.segments;

describe("updateSegment", () => {
  it("updates text without touching timing and counts as a review", () => {
    const project = base();
    const next = updateSegment(project, "b", { text: "नमस्ते" });
    expect(segments(next)[1]).toEqual({
      id: "b",
      text: "नमस्ते",
      startFrame: 100,
      endFrame: 200,
      reviewStatus: "accepted",
    });
    expect(segments(project)[1]!.text).toBe("b");
    expect(next.timelineVersion).toBe(project.timelineVersion + 1);
  });

  it("keeps the review flag when only timing changes", () => {
    expect(segments(updateSegment(base(), "b", { endFrame: 150 }))[1]!.reviewStatus).toBe("needs-review");
  });

  it("clamps timing to the neighbouring captions and keeps at least one frame", () => {
    const widened = updateSegment(base(), "b", { startFrame: 50, endFrame: 500 });
    expect(segments(widened)[1]).toMatchObject({ startFrame: 100, endFrame: 200 });
    const inverted = updateSegment(base(), "b", { startFrame: 180, endFrame: 120 });
    expect(segments(inverted)[1]).toMatchObject({ startFrame: 180, endFrame: 181 });
    expect(() => parseProject(inverted)).not.toThrow();
  });

  it("lets the last caption run to the end of the reel but no further", () => {
    expect(segments(updateSegment(base(), "c", { endFrame: 9999 }))[2]!.endFrame).toBe(375);
  });

  it("ignores an unknown caption", () => {
    const project = base();
    expect(updateSegment(project, "missing", { text: "x" })).toBe(project);
  });
});

describe("acceptSegment", () => {
  it("clears the review flag", () => {
    expect(segments(acceptSegment(base(), "b"))[1]!.reviewStatus).toBe("accepted");
  });
});

describe("addSegment and removeSegment", () => {
  it("adds a caption in the free time after the last one", () => {
    const next = addSegment(base(), nextId);
    expect(segments(next)).toHaveLength(4);
    expect(segments(next)[3]).toMatchObject({ text: "", startFrame: 300, endFrame: 360 });
    expect(() => parseProject(next)).not.toThrow();
  });

  it("does not add a caption when no time is left", () => {
    const project = updateSegment(base(), "c", { endFrame: 375 });
    expect(addSegment(project, nextId)).toBe(project);
  });

  it("removes a caption", () => {
    expect(segments(removeSegment(base(), "a")).map((s) => s.text)).toEqual(["b", "c"]);
  });
});

describe("setLanguage and setSlot", () => {
  it("sets the caption language and its script", () => {
    const project = setLanguage(base(), "gu");
    expect(project.captionTracks[0]).toMatchObject({ language: "gu", script: "Gujr" });
    expect(project.languages).toEqual(["gu"]);
  });

  it("sets a template slot without touching the others", () => {
    const project = setSlot(setSlot(base(), "headline", "Hook"), "callToAction", "Follow");
    expect(project.template.slots).toEqual({ headline: "Hook", callToAction: "Follow" });
  });
});
