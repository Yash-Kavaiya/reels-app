import { z } from "zod";

export const SCHEMA_VERSION = 1;

const id = z.string().min(1).max(64);
const frame = z.number().int().nonnegative();
const microseconds = z.number().int().nonnegative();

export const rationalSchema = z.strictObject({
  num: z.number().int().positive(),
  den: z.number().int().positive(),
});

export const assetSchema = z.strictObject({
  id,
  kind: z.enum(["video", "image", "audio"]),
  fileName: z.string().min(1).max(255),
  /** Object storage key; null while the project is a guest draft in the browser. */
  storageKey: z.string().min(1).nullable(),
  proxyKey: z.string().min(1).nullable(),
  hash: z.string().optional(),
  codec: z.string().optional(),
  durationUs: microseconds,
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  provenance: z.enum(["user-upload", "stock", "generated"]),
});

export const clipSchema = z.strictObject({
  id,
  assetId: id,
  sourceStartUs: microseconds,
  sourceEndUs: microseconds,
  outputStartFrame: frame,
  outputEndFrame: frame,
  fit: z.enum(["blur-fit", "cover", "contain"]),
  gain: z.number().min(0).max(4),
  z: z.number().int(),
});

export const captionSegmentSchema = z.strictObject({
  id,
  text: z.string().max(500),
  startFrame: frame,
  endFrame: frame,
  reviewStatus: z.enum(["accepted", "needs-review"]),
});

export const captionTrackSchema = z.strictObject({
  id,
  /** BCP 47 language tag, e.g. en, hi, gu. */
  language: z.string().min(2).max(35),
  /** ISO 15924 script code, e.g. Latn, Deva, Gujr. */
  script: z.string().length(4),
  segments: z.array(captionSegmentSchema).max(2000),
});

export const templateRefSchema = z.strictObject({
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  slots: z.record(z.string(), z.string().max(500)),
  styleTokens: z.record(z.string(), z.string().max(100)),
});

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((value) => (seen.has(value) ? true : (seen.add(value), false)));
}

export const projectSchema = z
  .strictObject({
    id,
    schemaVersion: z.literal(SCHEMA_VERSION),
    name: z.string().min(1).max(120),
    canvas: z.strictObject({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    fps: rationalSchema,
    durationFrames: frame.positive(),
    timelineVersion: z.number().int().nonnegative(),
    languages: z.array(z.string()),
    assets: z.array(assetSchema).max(200),
    clips: z.array(clipSchema).max(500),
    captionTracks: z.array(captionTrackSchema).max(20),
    template: templateRefSchema,
  })
  .superRefine((project, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });

    const allIds = [
      ...project.assets.map((a) => a.id),
      ...project.clips.map((c) => c.id),
      ...project.captionTracks.flatMap((t) => [t.id, ...t.segments.map((s) => s.id)]),
    ];
    for (const dup of duplicates(allIds)) issue(`Duplicate id "${dup}"`, []);

    const assets = new Map(project.assets.map((a) => [a.id, a]));
    project.clips.forEach((clip, i) => {
      const asset = assets.get(clip.assetId);
      if (!asset) issue(`Unknown asset "${clip.assetId}"`, ["clips", i, "assetId"]);
      if (clip.sourceEndUs <= clip.sourceStartUs) {
        issue("Source range is empty", ["clips", i, "sourceEndUs"]);
      }
      if (asset && asset.kind !== "image" && clip.sourceEndUs > asset.durationUs) {
        issue("Source range runs past the end of the asset", ["clips", i, "sourceEndUs"]);
      }
      if (clip.outputEndFrame <= clip.outputStartFrame) {
        issue("Output range is empty", ["clips", i, "outputEndFrame"]);
      }
      if (clip.outputEndFrame > project.durationFrames) {
        issue("Clip runs past the end of the project", ["clips", i, "outputEndFrame"]);
      }
    });

    project.captionTracks.forEach((track, t) => {
      let previousEnd = 0;
      track.segments.forEach((segment, s) => {
        const path = ["captionTracks", t, "segments", s];
        if (segment.endFrame <= segment.startFrame) {
          issue("Caption range is empty", [...path, "endFrame"]);
        }
        if (segment.startFrame < previousEnd) {
          issue("Caption overlaps the previous one", [...path, "startFrame"]);
        }
        if (segment.endFrame > project.durationFrames) {
          issue("Caption runs past the end of the project", [...path, "endFrame"]);
        }
        previousEnd = segment.endFrame;
      });
    });
  });

export type Project = z.infer<typeof projectSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type CaptionTrack = z.infer<typeof captionTrackSchema>;
export type CaptionSegment = z.infer<typeof captionSegmentSchema>;
export type TemplateRef = z.infer<typeof templateRefSchema>;

export function parseProject(input: unknown): Project {
  return projectSchema.parse(input);
}

export function safeParseProject(input: unknown) {
  return projectSchema.safeParse(input);
}

export function createProject(init: { id: string; name: string; durationFrames: number }): Project {
  return {
    id: init.id,
    schemaVersion: SCHEMA_VERSION,
    name: init.name,
    canvas: { width: 1080, height: 1920 },
    fps: { num: 30, den: 1 },
    durationFrames: init.durationFrames,
    timelineVersion: 0,
    languages: [],
    assets: [],
    clips: [],
    captionTracks: [],
    template: {
      templateId: "clean-education",
      templateVersion: 1,
      slots: {},
      styleTokens: {},
    },
  };
}
