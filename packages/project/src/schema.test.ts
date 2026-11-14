import { describe, expect, it } from "vitest";
import { createProject, parseProject, safeParseProject, type Project } from "./schema";

function sample(): Project {
  const p = createProject({ id: "p1", name: "Demo", durationFrames: 900 });
  p.assets.push({
    id: "a1",
    kind: "video",
    fileName: "clip.mp4",
    storageKey: null,
    proxyKey: null,
    durationUs: 30_000_000,
    width: 1920,
    height: 1080,
    rotation: 0,
    provenance: "user-upload",
  });
  p.clips.push({
    id: "c1",
    assetId: "a1",
    sourceStartUs: 0,
    sourceEndUs: 30_000_000,
    outputStartFrame: 0,
    outputEndFrame: 900,
    fit: "blur-fit",
    gain: 1,
    z: 0,
  });
  p.captionTracks.push({
    id: "t1",
    language: "hi",
    script: "Deva",
    segments: [
      { id: "s1", text: "नमस्ते", startFrame: 0, endFrame: 60, reviewStatus: "accepted" },
      { id: "s2", text: "Shorts बेहतर बनाएं", startFrame: 60, endFrame: 150, reviewStatus: "accepted" },
    ],
  });
  return p;
}

describe("createProject", () => {
  it("defaults to a 1080x1920, 30 fps, schema version 1 project", () => {
    const p = createProject({ id: "p1", name: "Demo", durationFrames: 900 });
    expect(p.schemaVersion).toBe(1);
    expect(p.canvas).toEqual({ width: 1080, height: 1920 });
    expect(p.fps).toEqual({ num: 30, den: 1 });
    expect(p.template.templateId).toBe("clean-education");
    expect(() => parseProject(p)).not.toThrow();
  });
});

describe("parseProject", () => {
  it("accepts a valid project and round-trips through JSON", () => {
    const p = sample();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it("rejects an unknown schema version", () => {
    expect(safeParseProject({ ...sample(), schemaVersion: 2 }).success).toBe(false);
  });

  it("rejects a clip that references an unknown asset", () => {
    const p = sample();
    p.clips[0]!.assetId = "missing";
    expect(safeParseProject(p).success).toBe(false);
  });

  it("rejects empty or inverted ranges", () => {
    const a = sample();
    a.clips[0]!.sourceEndUs = 0;
    expect(safeParseProject(a).success).toBe(false);
    const b = sample();
    b.captionTracks[0]!.segments[0]!.endFrame = 0;
    expect(safeParseProject(b).success).toBe(false);
  });

  it("rejects a clip source range longer than its asset", () => {
    const p = sample();
    p.clips[0]!.sourceEndUs = 30_000_001;
    expect(safeParseProject(p).success).toBe(false);
  });

  it("rejects clips and captions that run past the project duration", () => {
    const a = sample();
    a.clips[0]!.outputEndFrame = 901;
    expect(safeParseProject(a).success).toBe(false);
    const b = sample();
    b.captionTracks[0]!.segments[1]!.endFrame = 901;
    expect(safeParseProject(b).success).toBe(false);
  });

  it("rejects overlapping caption segments", () => {
    const p = sample();
    p.captionTracks[0]!.segments[1]!.startFrame = 59;
    expect(safeParseProject(p).success).toBe(false);
  });

  it("rejects duplicate ids", () => {
    const p = sample();
    p.assets.push({ ...p.assets[0]! });
    expect(safeParseProject(p).success).toBe(false);
  });

  it("strips nothing silently: unknown top-level keys are rejected", () => {
    expect(safeParseProject({ ...sample(), shell: "rm -rf" }).success).toBe(false);
  });
});
