import { execFile } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type Project, parseProject, toSrt, toVtt } from "@reelcraft/project";
import {
  BLUR_BACKGROUND,
  REEL_COMPOSITION_ID,
  type ReelProps,
  TEMPLATES,
  compositionMetadata,
  overlayIntervals,
} from "@reelcraft/templates";
import { bundle } from "@remotion/bundler";
import { renderFrames, renderMedia, selectComposition } from "@remotion/renderer";
import { compositeArgs, overlayListText } from "./composite";
import { blurBackground, decodeErrors, probe, validateOutput } from "./probe";
import { serveFiles } from "./serve";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = join(here, "../../../packages/templates");
const FFMPEG_BUFFER = 16 * 1024 * 1024;

let bundled: Promise<string> | null = null;

/** Bundles the template compositions once per worker process. */
function serveUrl(): Promise<string> {
  bundled ??= bundle({
    entryPoint: join(TEMPLATES_ROOT, "src/entry.ts"),
    publicDir: join(TEMPLATES_ROOT, "public"),
  });
  return bundled;
}

export type RenderResult = {
  video: string;
  cover: string;
  captions: { language: string; srt: string; vtt: string }[];
  /** "fast" composites with FFmpeg; "full" renders every frame in the browser. */
  mode: "fast" | "full";
};

export type RenderOptions = {
  project: Project;
  /** Local path of the normalised media file for each asset id. */
  assetFiles: Record<string, string>;
  outDir: string;
  signal?: AbortSignal;
};

/**
 * The fast path needs one video clip that spans the whole reel. Anything else
 * (several clips, gaps) goes through the full browser render.
 */
function singleClip(project: Project) {
  const [clip, ...rest] = project.clips;
  const spansReel = clip?.outputStartFrame === 0 && clip.outputEndFrame === project.durationFrames;
  return clip && rest.length === 0 && spansReel ? clip : null;
}

async function renderFast(options: RenderOptions, project: Project, video: string): Promise<void> {
  const clip = singleClip(project)!;
  const input = options.assetFiles[clip.assetId]!;
  const overlayDir = join(options.outDir, "overlays");
  await rm(overlayDir, { recursive: true, force: true });
  await mkdir(overlayDir, { recursive: true });

  // One transparent image per span in which the text does not change.
  const intervals = overlayIntervals(project);
  const inputProps: ReelProps = {
    project,
    assetUrls: {},
    overlayFrames: intervals.map((interval) => interval.startFrame),
  };
  const composition = await selectComposition({
    serveUrl: await serveUrl(),
    id: REEL_COMPOSITION_ID,
    inputProps,
  });
  await renderFrames({
    composition,
    serveUrl: await serveUrl(),
    inputProps,
    outputDir: overlayDir,
    imageFormat: "png",
    onStart: () => undefined,
    onFrameUpdate: () => undefined,
  });
  options.signal?.throwIfAborted();

  const images = (await readdir(overlayDir)).filter((name) => name.endsWith(".png")).sort();
  if (images.length !== intervals.length) {
    throw new Error(`Expected ${intervals.length} overlay images, found ${images.length}`);
  }
  const overlayList = join(overlayDir, "overlays.txt");
  await writeFile(
    overlayList,
    overlayListText(
      images.map((name, i) => ({
        path: join(overlayDir, name),
        frames: intervals[i]!.endFrame - intervals[i]!.startFrame,
      })),
      project.fps,
    ),
    "utf8",
  );

  const template = TEMPLATES[project.template.templateId];
  const surface = project.template.styleTokens.surface ?? template?.styleTokens.surface ?? "#000000";
  const source = await probe(input);
  await run(
    "ffmpeg",
    compositeArgs({
      input,
      overlayList,
      output: video,
      clip,
      canvas: project.canvas,
      fps: project.fps,
      durationFrames: project.durationFrames,
      look: BLUR_BACKGROUND,
      surface,
      hasAudio: source.audio !== null,
    }),
    { maxBuffer: FFMPEG_BUFFER, signal: options.signal },
  );
  await rm(overlayDir, { recursive: true, force: true });
}

async function renderFull(options: RenderOptions, project: Project, video: string): Promise<void> {
  const workDir = join(options.outDir, "work");
  await mkdir(workDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const [assetId, path] of Object.entries(options.assetFiles)) {
    files[`${assetId}.mp4`] = path;
    const background = join(workDir, `${assetId}-background.mp4`);
    await blurBackground(path, background, project.canvas, BLUR_BACKGROUND);
    files[`${assetId}-background.mp4`] = background;
  }
  const server = await serveFiles(files);
  try {
    const ids = Object.keys(options.assetFiles);
    const inputProps: ReelProps = {
      project,
      assetUrls: Object.fromEntries(ids.map((id) => [id, server.urlFor(`${id}.mp4`)])),
      backgroundUrls: Object.fromEntries(ids.map((id) => [id, server.urlFor(`${id}-background.mp4`)])),
    };
    const composition = await selectComposition({
      serveUrl: await serveUrl(),
      id: REEL_COMPOSITION_ID,
      inputProps,
    });
    await renderMedia({
      composition,
      serveUrl: await serveUrl(),
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      outputLocation: video,
      inputProps,
    });
  } finally {
    await server.close();
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Renders a project to an MP4, a cover image and caption sidecars, then checks
 * the file. Throws if the output does not match the project.
 */
export async function renderReel(options: RenderOptions): Promise<RenderResult> {
  const project = parseProject(options.project);
  const missing = project.clips.filter((clip) => !options.assetFiles[clip.assetId]);
  if (missing.length > 0) {
    throw new Error(`No media for asset(s): ${missing.map((c) => c.assetId).join(", ")}`);
  }

  await mkdir(options.outDir, { recursive: true });
  const video = join(options.outDir, "reel.mp4");
  const mode = singleClip(project) ? "fast" : "full";
  await (mode === "fast" ? renderFast : renderFull)(options, project, video);
  options.signal?.throwIfAborted();

  const meta = compositionMetadata(project);
  const problems = validateOutput(await probe(video), {
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    durationSeconds: meta.durationInFrames / meta.fps,
  });
  const errors = await decodeErrors(video);
  if (errors) problems.push(`Decode errors: ${errors.slice(0, 500)}`);
  if (problems.length > 0) throw new Error(`Export failed validation: ${problems.join("; ")}`);

  // One second in, so the cover shows footage rather than the very first frame.
  const cover = join(options.outDir, "cover.jpg");
  const coverTime = Math.min(1, (meta.durationInFrames - 1) / meta.fps).toFixed(3);
  await run("ffmpeg", ["-y", "-ss", coverTime, "-i", video, "-frames:v", "1", "-q:v", "3", cover]);

  const captions = [];
  for (const track of project.captionTracks) {
    const srt = join(options.outDir, `captions.${track.language}.srt`);
    const vtt = join(options.outDir, `captions.${track.language}.vtt`);
    await writeFile(srt, toSrt(track, project.fps), "utf8");
    await writeFile(vtt, toVtt(track, project.fps), "utf8");
    captions.push({ language: track.language, srt, vtt });
  }

  return { video, cover, captions, mode };
}
