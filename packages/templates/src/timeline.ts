import type { CaptionSegment, Project } from "@reelcraft/project";

/** Seconds the call to action stays on screen at the end of the reel. */
export const CTA_SECONDS = 3;

/** The caption visible on a frame; ranges are start inclusive, end exclusive. */
export function activeSegment(segments: CaptionSegment[], frame: number): CaptionSegment | null {
  return segments.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? null;
}

export function compositionMetadata(project: Project) {
  return {
    width: project.canvas.width,
    height: project.canvas.height,
    fps: project.fps.num / project.fps.den,
    durationInFrames: project.durationFrames,
  };
}

/** First frame on which the call to action is visible. */
export function ctaStartFrame(project: Project): number {
  const fps = project.fps.num / project.fps.den;
  return Math.max(0, project.durationFrames - Math.round(CTA_SECONDS * fps));
}

export type OverlayInterval = { startFrame: number; endFrame: number };

/**
 * Splits the reel into the spans during which the text overlay does not change.
 * The templates' text is static between caption and call-to-action boundaries,
 * so one rendered image per span reproduces the overlay exactly.
 */
export function overlayIntervals(project: Project): OverlayInterval[] {
  const cuts = new Set<number>([0, project.durationFrames]);
  for (const segment of project.captionTracks[0]?.segments ?? []) {
    cuts.add(segment.startFrame);
    cuts.add(segment.endFrame);
  }
  if (project.template.slots.callToAction) cuts.add(ctaStartFrame(project));
  const frames = [...cuts].filter((f) => f >= 0 && f <= project.durationFrames).sort((a, b) => a - b);
  return frames.slice(1).map((endFrame, i) => ({ startFrame: frames[i]!, endFrame }));
}
