import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { type Job, type Reel, type Store, reelDir } from "@reelcraft/db";
import { FPS_30, type Project, createProject, parseProject, usToFrame } from "@reelcraft/project";
import { scriptFor, wordsToSegments } from "./captions";
import { planCopy } from "./copy";
import { normalize, probe } from "./probe";
import { renderReel } from "./render";
import { readTranscript, transcribe } from "./transcribe";

/** Longest reel the first release produces; longer uploads are cut to this. */
export const MAX_CLIP_SECONDS = 180;

/** Asset id of the uploaded clip in an automatically built project. */
const CLIP_ASSET_ID = "clip";

/** File names inside a reel's folder. Each finished stage leaves its file as a checkpoint. */
export const FILES = {
  proxy: "proxy.mp4",
  transcript: "transcript.json",
  exportDir: "export",
} as const;

async function buildProject(reel: Reel, dir: string): Promise<Project> {
  const proxy = await probe(join(dir, FILES.proxy));
  if (!proxy.video) throw new Error("The normalised clip has no video stream.");
  const transcript = await readTranscript(join(dir, FILES.transcript));

  const durationUs = Math.floor(proxy.durationSeconds * 1_000_000);
  const durationFrames = Math.max(1, usToFrame(durationUs, FPS_30));
  const project = createProject({ id: reel.id, name: reel.name, durationFrames });
  project.languages = [transcript.language];
  project.assets.push({
    id: CLIP_ASSET_ID,
    kind: "video",
    fileName: reel.sourceFile,
    storageKey: `reels/${reel.id}/${reel.sourceFile}`,
    proxyKey: `reels/${reel.id}/${FILES.proxy}`,
    codec: proxy.video.codec,
    durationUs,
    width: proxy.video.width,
    height: proxy.video.height,
    rotation: 0,
    provenance: "user-upload",
  });
  project.clips.push({
    id: randomUUID(),
    assetId: CLIP_ASSET_ID,
    sourceStartUs: 0,
    sourceEndUs: durationUs,
    outputStartFrame: 0,
    outputEndFrame: durationFrames,
    fit: "blur-fit",
    gain: 1,
    z: 0,
  });
  project.captionTracks.push({
    id: randomUUID(),
    language: transcript.language,
    script: scriptFor(transcript.language),
    segments: wordsToSegments(transcript.words, FPS_30, durationFrames, randomUUID),
  });

  const text = transcript.words.map((word) => word.text).join(" ");
  const copy = await planCopy(text, transcript.language, reel.name);
  console.log(`  copy written by ${copy.source}`);
  project.template.slots = { headline: copy.headline, callToAction: copy.callToAction };
  return parseProject(project);
}

/**
 * Runs one job to completion. Stages whose output file already exists are
 * skipped, so a job interrupted by a crash resumes where it stopped.
 */
export async function runJob(store: Store, job: Job, signal: AbortSignal): Promise<void> {
  const reel = store.getReel(job.reelId);
  if (!reel) throw new Error(`Reel ${job.reelId} no longer exists.`);
  const dir = reelDir(reel.id);
  const proxy = join(dir, FILES.proxy);
  const transcript = join(dir, FILES.transcript);

  if (job.type === "auto") {
    store.setStage(job.id, "normalize");
    if (!existsSync(proxy)) {
      const source = join(dir, reel.sourceFile);
      const info = await probe(source).catch(() => null);
      if (!info?.video) {
        throw new Error("This file has no readable video. Upload an MP4, MOV or WebM recording.");
      }
      const partial = join(dir, "proxy.partial.mp4");
      await normalize(source, partial, FPS_30, { maxSeconds: MAX_CLIP_SECONDS, signal });
      await rename(partial, proxy);
    }
    signal.throwIfAborted();

    store.setStage(job.id, "transcribe");
    if (!existsSync(transcript)) await transcribe(proxy, transcript, signal);
    signal.throwIfAborted();

    store.setStage(job.id, "plan");
    // A project that already exists holds the user's edits; never rebuild over it.
    if (!reel.project) store.saveProject(reel.id, await buildProject(reel, dir));
    signal.throwIfAborted();
  }

  store.setStage(job.id, "render");
  const saved = store.getReel(reel.id)?.project;
  if (!saved) throw new Error("This reel has no project to export yet.");
  const project = parseProject(saved);
  const result = await renderReel({
    project,
    assetFiles: Object.fromEntries(project.assets.map((asset) => [asset.id, proxy])),
    outDir: join(dir, FILES.exportDir),
    signal,
  });
  console.log(`  rendered (${result.mode}) ${result.video}`);
}
