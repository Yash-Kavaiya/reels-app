import { describe, expect, it } from "vitest";
import { blurBackgroundArgs, normalizeArgs, parseProbe, validateOutput } from "./probe";

describe("blurBackgroundArgs", () => {
  it("covers a quarter-size canvas, blurs, darkens and drops audio", () => {
    const args = blurBackgroundArgs(
      "proxy.mp4",
      "bg.mp4",
      { width: 1080, height: 1920 },
      { blurPx: 48, brightness: 0.55, scale: 1.15 },
    );
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "scale=312:552:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=13.80,colorchannelmixer=rr=0.55:gg=0.55:bb=0.55,format=yuv420p",
    );
    expect(args).toContain("-an");
    expect(args.at(-1)).toBe("bg.mp4");
  });
});

const good = {
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, avg_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000" },
  ],
  format: { duration: "30.016000" },
};

const expected = { width: 1080, height: 1920, fps: 30, durationSeconds: 30 };

describe("parseProbe", () => {
  it("extracts video, audio and duration", () => {
    expect(parseProbe(good)).toEqual({
      video: { codec: "h264", width: 1080, height: 1920, fps: 30, rotation: 0 },
      audio: { codec: "aac", sampleRate: 48000 },
      durationSeconds: 30.016,
    });
  });

  it("reads rotation from side data and normalises it to 0-359", () => {
    const rotated = {
      streams: [
        {
          codec_type: "video",
          codec_name: "hevc",
          width: 1920,
          height: 1080,
          avg_frame_rate: "30000/1001",
          side_data_list: [{ rotation: -90 }],
        },
      ],
      format: { duration: "5" },
    };
    const result = parseProbe(rotated);
    expect(result.video?.rotation).toBe(270);
    expect(result.video?.fps).toBeCloseTo(29.97, 2);
    expect(result.audio).toBeNull();
  });

  it("returns null video for an audio-only or unreadable file", () => {
    expect(parseProbe({ streams: [], format: {} })).toEqual({
      video: null,
      audio: null,
      durationSeconds: 0,
    });
  });
});

describe("validateOutput", () => {
  it("accepts a correct export", () => {
    expect(validateOutput(parseProbe(good), expected)).toEqual([]);
  });

  it("reports every mismatch", () => {
    const bad = parseProbe({
      streams: [
        { codec_type: "video", codec_name: "vp9", width: 720, height: 1280, avg_frame_rate: "25/1" },
      ],
      format: { duration: "12" },
    });
    const problems = validateOutput(bad, expected);
    expect(problems).toHaveLength(5);
    expect(problems.join(" ")).toMatch(/h264/);
    expect(problems.join(" ")).toMatch(/1080x1920/);
    expect(problems.join(" ")).toMatch(/fps/);
    expect(problems.join(" ")).toMatch(/audio/);
    expect(problems.join(" ")).toMatch(/duration/i);
  });

  it("reports a missing video stream", () => {
    expect(validateOutput(parseProbe({ streams: [], format: {} }), expected)).toEqual([
      "No video stream in the output",
    ]);
  });
});

describe("normalizeArgs", () => {
  it("builds a constant frame rate H.264 + AAC proxy command", () => {
    const args = normalizeArgs("in.mov", "out.mp4", { num: 30, den: 1 });
    expect(args.slice(0, 3)).toEqual(["-y", "-i", "in.mov"]);
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args.join(" ")).toContain("fps=30/1");
    expect(args.join(" ")).toContain("-ar 48000");
    expect(args.at(-1)).toBe("out.mp4");
    expect(args).not.toContain("-t");
  });

  it("cuts the proxy to the maximum clip length when asked", () => {
    const args = normalizeArgs("in.mov", "out.mp4", { num: 30, den: 1 }, 180);
    expect(args.slice(3, 5)).toEqual(["-t", "180"]);
  });
});
