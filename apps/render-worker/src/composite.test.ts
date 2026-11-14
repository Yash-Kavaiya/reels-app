import { describe, expect, it } from "vitest";
import { type CompositeOptions, compositeArgs, overlayListText } from "./composite";

const base: CompositeOptions = {
  input: "proxy.mp4",
  overlayList: "overlays.txt",
  output: "reel.mp4",
  clip: { sourceStartUs: 2_000_000, sourceEndUs: 12_000_000, fit: "blur-fit", gain: 0.8 },
  canvas: { width: 1080, height: 1920 },
  fps: { num: 30, den: 1 },
  durationFrames: 300,
  look: { blurPx: 48, brightness: 0.55, scale: 1.15 },
  surface: "#0b1220",
  hasAudio: true,
};

const graphOf = (args: string[]) => args[args.indexOf("-filter_complex") + 1]!;

describe("compositeArgs", () => {
  it("trims the clip, builds a blurred background and burns in the overlays", () => {
    const args = compositeArgs(base);
    const graph = graphOf(args);
    expect(graph).toContain("trim=start=2.000000:end=12.000000");
    expect(graph).toContain("gblur=sigma=13.80");
    expect(graph).toContain("crop=270:480");
    expect(graph).toContain("[base][text]overlay=0:0:eof_action=repeat,format=yuv420p[v]");
    expect(graph).toContain("atrim=start=2.000000:end=12.000000,asetpts=PTS-STARTPTS,volume=0.8,apad[a]");
    expect(args[args.indexOf("-t") + 1]).toBe("10.000000");
    expect(args).toContain("[a]");
    expect(args).not.toContain("lavfi");
    expect(args.at(-1)).toBe("reel.mp4");
  });

  it("adds generated silence when the clip has no audio", () => {
    const args = compositeArgs({ ...base, hasAudio: false });
    expect(args.join(" ")).toContain("-f lavfi -i anullsrc=r=48000:cl=stereo");
    expect(args).toContain("2:a");
    expect(graphOf(args)).not.toContain("atrim");
  });

  it("supports cover and contain fits without a blur", () => {
    const cover = graphOf(compositeArgs({ ...base, clip: { ...base.clip, fit: "cover" } }));
    expect(cover).toContain("force_original_aspect_ratio=increase,crop=1080:1920[base]");
    expect(cover).not.toContain("gblur");
    const contain = graphOf(compositeArgs({ ...base, clip: { ...base.clip, fit: "contain" } }));
    expect(contain).toContain("pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x0b1220[base]");
  });
});

describe("overlayListText", () => {
  it("lists each image with its duration and repeats the last one", () => {
    const text = overlayListText(
      [
        { path: "C:\\out\\a.png", frames: 30 },
        { path: "/tmp/it's.png", frames: 45 },
      ],
      { num: 30, den: 1 },
    );
    expect(text).toBe(
      "file 'C:/out/a.png'\nduration 1.000000\nfile '/tmp/it'\\''s.png'\nduration 1.500000\nfile '/tmp/it'\\''s.png'\n",
    );
  });
});
