import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Rational } from "@reelcraft/project";

const run = promisify(execFile);

export type ProbeResult = {
  video: { codec: string; width: number; height: number; fps: number; rotation: number } | null;
  audio: { codec: string; sampleRate: number } | null;
  durationSeconds: number;
};

type RawStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  sample_rate?: string;
  side_data_list?: { rotation?: number }[];
  tags?: { rotate?: string };
};
type RawProbe = { streams?: RawStream[]; format?: { duration?: string } };

function ratio(value: string | undefined): number {
  const [num, den] = (value ?? "0/1").split("/").map(Number);
  return num && den ? num / den : 0;
}

export function parseProbe(raw: RawProbe): ProbeResult {
  const video = raw.streams?.find((s) => s.codec_type === "video");
  const audio = raw.streams?.find((s) => s.codec_type === "audio");
  const rotation = Number(
    video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0,
  );
  return {
    video: video
      ? {
          codec: video.codec_name ?? "unknown",
          width: video.width ?? 0,
          height: video.height ?? 0,
          fps: ratio(video.avg_frame_rate),
          rotation: ((rotation % 360) + 360) % 360,
        }
      : null,
    audio: audio
      ? { codec: audio.codec_name ?? "unknown", sampleRate: Number(audio.sample_rate ?? 0) }
      : null,
    durationSeconds: Number(raw.format?.duration ?? 0),
  };
}

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    file,
  ]);
  return parseProbe(JSON.parse(stdout) as RawProbe);
}

export type ExpectedOutput = { width: number; height: number; fps: number; durationSeconds: number };

/** Longest allowed gap between the planned and the encoded duration. */
const DURATION_TOLERANCE_SECONDS = 0.2;

/** Returns the reasons an export is not acceptable; an empty list means it passed. */
export function validateOutput(result: ProbeResult, expected: ExpectedOutput): string[] {
  const { video, audio } = result;
  if (!video) return ["No video stream in the output"];
  const problems: string[] = [];
  if (video.codec !== "h264") problems.push(`Video codec is ${video.codec}, expected h264`);
  if (video.width !== expected.width || video.height !== expected.height) {
    problems.push(
      `Frame size is ${video.width}x${video.height}, expected ${expected.width}x${expected.height}`,
    );
  }
  if (Math.abs(video.fps - expected.fps) > 0.01) {
    problems.push(`Frame rate is ${video.fps.toFixed(3)} fps, expected ${expected.fps}`);
  }
  if (audio?.codec !== "aac") problems.push(`Missing AAC audio stream (found ${audio?.codec ?? "none"})`);
  if (Math.abs(result.durationSeconds - expected.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
    problems.push(
      `Duration is ${result.durationSeconds.toFixed(2)} s, expected ${expected.durationSeconds.toFixed(2)} s`,
    );
  }
  return problems;
}

/** Decodes the whole file and returns anything FFmpeg reported as an error. */
export async function decodeErrors(file: string): Promise<string> {
  const { stderr } = await run("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return stderr.trim();
}

/**
 * FFmpeg arguments that turn any upload into a constant frame rate H.264 + AAC
 * proxy. FFmpeg applies rotation metadata itself, so the proxy is upright.
 */
export function normalizeArgs(
  input: string,
  output: string,
  fps: Rational,
  maxSeconds?: number,
): string[] {
  return [
    "-y",
    "-i", input,
    ...(maxSeconds ? ["-t", String(maxSeconds)] : []),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", `fps=${fps.num}/${fps.den},scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-ar", "48000",
    "-b:a", "160k",
    "-movflags", "+faststart",
    output,
  ];
}

const even = (value: number) => Math.ceil(value / 2) * 2;

/** The pre-blurred background is encoded at this fraction of the canvas size. */
const BACKGROUND_DOWNSCALE = 4;

/**
 * FFmpeg arguments for the blur-fit background: cover the canvas, zoom, blur
 * and darken to match the CSS preview. Blur hides the low resolution.
 */
export function blurBackgroundArgs(
  input: string,
  output: string,
  canvas: { width: number; height: number },
  look: { blurPx: number; brightness: number; scale: number },
): string[] {
  const width = even(canvas.width / BACKGROUND_DOWNSCALE);
  const height = even(canvas.height / BACKGROUND_DOWNSCALE);
  // CSS blurs before it scales, so the visible blur grows with the zoom.
  const sigma = ((look.blurPx * look.scale) / BACKGROUND_DOWNSCALE).toFixed(2);
  const b = look.brightness;
  const filter = [
    `scale=${even(width * look.scale)}:${even(height * look.scale)}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `gblur=sigma=${sigma}`,
    `colorchannelmixer=rr=${b}:gg=${b}:bb=${b}`,
    "format=yuv420p",
  ].join(",");
  return [
    "-y",
    "-i", input,
    "-an",
    "-vf", filter,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-movflags", "+faststart",
    output,
  ];
}

export async function blurBackground(
  ...args: Parameters<typeof blurBackgroundArgs>
): Promise<void> {
  await run("ffmpeg", blurBackgroundArgs(...args), { maxBuffer: 16 * 1024 * 1024 });
}

export async function normalize(
  input: string,
  output: string,
  fps: Rational,
  options: { maxSeconds?: number; signal?: AbortSignal } = {},
): Promise<void> {
  await run("ffmpeg", normalizeArgs(input, output, fps, options.maxSeconds), {
    maxBuffer: 16 * 1024 * 1024,
    signal: options.signal,
  });
}
