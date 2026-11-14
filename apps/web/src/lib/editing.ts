import type { CaptionSegment, Project } from "@reelcraft/project";

/** Length of a newly added caption, in frames (2 seconds at 30 fps). */
const NEW_SEGMENT_FRAMES = 60;

export const LANGUAGES: Record<string, { label: string; script: string }> = {
  en: { label: "English", script: "Latn" },
  hi: { label: "Hindi", script: "Deva" },
  gu: { label: "Gujarati", script: "Gujr" },
};

type IdFactory = () => string;

function withSegments(project: Project, segments: CaptionSegment[]): Project {
  const [track, ...rest] = project.captionTracks;
  if (!track) return project;
  return {
    ...project,
    timelineVersion: project.timelineVersion + 1,
    captionTracks: [{ ...track, segments }, ...rest],
  };
}

const segmentsOf = (project: Project) => project.captionTracks[0]?.segments ?? [];

/**
 * Applies an edit, keeping the caption between its neighbours and at least one
 * frame long. Editing the text counts as the user's review of that caption.
 */
export function updateSegment(
  project: Project,
  segmentId: string,
  patch: Partial<Pick<CaptionSegment, "text" | "startFrame" | "endFrame">>,
): Project {
  const segments = segmentsOf(project);
  const index = segments.findIndex((s) => s.id === segmentId);
  const current = segments[index];
  if (!current) return project;

  const floor = segments[index - 1]?.endFrame ?? 0;
  const ceiling = segments[index + 1]?.startFrame ?? project.durationFrames;
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(Math.round(value), min), max);
  const startFrame = clamp(patch.startFrame ?? current.startFrame, floor, ceiling - 1);
  const endFrame = clamp(patch.endFrame ?? current.endFrame, startFrame + 1, ceiling);

  const next: CaptionSegment = {
    ...current,
    text: patch.text ?? current.text,
    startFrame,
    endFrame,
    reviewStatus: patch.text === undefined ? current.reviewStatus : "accepted",
  };
  return withSegments(project, segments.map((s, i) => (i === index ? next : s)));
}

/** Marks a caption as checked without changing it. */
export function acceptSegment(project: Project, segmentId: string): Project {
  return withSegments(
    project,
    segmentsOf(project).map((s) => (s.id === segmentId ? { ...s, reviewStatus: "accepted" as const } : s)),
  );
}

/** Appends an empty caption after the last one; a no-op when the reel is full. */
export function addSegment(project: Project, nextId: IdFactory): Project {
  const segments = segmentsOf(project);
  const startFrame = segments.at(-1)?.endFrame ?? 0;
  if (startFrame >= project.durationFrames) return project;
  return withSegments(project, [
    ...segments,
    {
      id: nextId(),
      text: "",
      startFrame,
      endFrame: Math.min(startFrame + NEW_SEGMENT_FRAMES, project.durationFrames),
      reviewStatus: "accepted",
    },
  ]);
}

export function removeSegment(project: Project, segmentId: string): Project {
  return withSegments(project, segmentsOf(project).filter((s) => s.id !== segmentId));
}

/** Relabels the caption track; fonts and subtitle file names follow the language. */
export function setLanguage(project: Project, language: string): Project {
  const [track, ...rest] = project.captionTracks;
  if (!track) return project;
  return {
    ...project,
    languages: [language],
    captionTracks: [{ ...track, language, script: LANGUAGES[language]?.script ?? track.script }, ...rest],
  };
}

export function setSlot(project: Project, slot: string, value: string): Project {
  return {
    ...project,
    template: { ...project.template, slots: { ...project.template.slots, [slot]: value } },
  };
}
