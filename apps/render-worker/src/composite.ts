import type { Clip, Rational } from "@reelcraft/project";

export type CompositeOptions = {
  /** Normalised (constant frame rate) source clip. */
  input: string;
  /** Concat list of overlay images; see overlayListText(). */
  overlayList: string;
  output: string;
  clip: Pick<Clip, "sourceStartUs" | "sourceEndUs" | "fit" | "gain">;
  canvas: { width: number; height: number };
  fps: Rational;
  durationFrames: number;
  look: { blurPx: number; brightness: number; scale: number };
  /** Letterbox colour for the "contain" fit, as #rrggbb. */
  surface: string;
  hasAudio: boolean;
};

const even = (value: number) => Math.ceil(value / 2) * 2;
const seconds = (us: number) => (us / 1_000_000).toFixed(6);

/** The blurred background is processed at this fraction of the canvas size. */
const BACKGROUND_DOWNSCALE = 4;

function videoGraph({ clip, canvas, look, surface, fps }: CompositeOptions): string[] {
  const { width: w, height: h } = canvas;
  const source = `[0:v]trim=start=${seconds(clip.sourceStartUs)}:end=${seconds(clip.sourceEndUs)},setpts=PTS-STARTPTS,fps=${fps.num}/${fps.den}`;

  if (clip.fit === "cover") {
    return [`${source},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[base]`];
  }
  if (clip.fit === "contain") {
    const color = surface.replace("#", "0x");
    return [
      `${source},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${color}[base]`,
    ];
  }
  // blur-fit: a zoomed, blurred, darkened copy fills the canvas behind the clip.
  const bw = even(w / BACKGROUND_DOWNSCALE);
  const bh = even(h / BACKGROUND_DOWNSCALE);
  // CSS blurs before it scales, so the visible blur grows with the zoom.
  const sigma = ((look.blurPx * look.scale) / BACKGROUND_DOWNSCALE).toFixed(2);
  const b = look.brightness;
  return [
    `${source},split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${even(bw * look.scale)}:${even(bh * look.scale)}:force_original_aspect_ratio=increase,crop=${bw}:${bh},gblur=sigma=${sigma},colorchannelmixer=rr=${b}:gg=${b}:bb=${b},scale=${w}:${h}:flags=bilinear[bg]`,
    `[fgsrc]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg]`,
    "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]",
  ];
}

/**
 * FFmpeg arguments for the fast export: FFmpeg lays out the clip and burns in
 * the pre-rendered text overlays. Input 0 is the clip, input 1 the overlays,
 * input 2 (only when the clip is silent) generated silence.
 */
export function compositeArgs(options: CompositeOptions): string[] {
  const { clip, fps, durationFrames, hasAudio } = options;
  const duration = ((durationFrames * fps.den) / fps.num).toFixed(6);
  const graph = [
    ...videoGraph(options),
    `[1:v]fps=${fps.num}/${fps.den},format=rgba[text]`,
    "[base][text]overlay=0:0:eof_action=repeat,format=yuv420p[v]",
  ];
  if (hasAudio) {
    graph.push(
      `[0:a]atrim=start=${seconds(clip.sourceStartUs)}:end=${seconds(clip.sourceEndUs)},asetpts=PTS-STARTPTS,volume=${clip.gain},apad[a]`,
    );
  }
  return [
    "-y",
    "-i", options.input,
    "-f", "concat", "-safe", "0", "-i", options.overlayList,
    ...(hasAudio ? [] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]),
    "-filter_complex", graph.join(";"),
    "-map", "[v]",
    "-map", hasAudio ? "[a]" : "2:a",
    "-t", duration,
    "-r", `${fps.num}/${fps.den}`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-maxrate", "12M",
    "-bufsize", "24M",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "48000",
    "-b:a", "128k",
    "-movflags", "+faststart",
    options.output,
  ];
}

/** Concat-demuxer list that shows each image for its number of frames. */
export function overlayListText(images: { path: string; frames: number }[], fps: Rational): string {
  const quote = (path: string) => `'${path.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
  const lines = images.flatMap(({ path, frames }) => [
    `file ${quote(path)}`,
    `duration ${((frames * fps.den) / fps.num).toFixed(6)}`,
  ]);
  // The demuxer ignores the final duration unless the last file is listed again.
  const last = images.at(-1);
  if (last) lines.push(`file ${quote(last.path)}`);
  return `${lines.join("\n")}\n`;
}
