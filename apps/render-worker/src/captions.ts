import { type CaptionSegment, type Rational, usToFrame } from "@reelcraft/project";

export type Word = { text: string; start: number; end: number; probability: number };

/** A caption longer than this is hard to read in two lines at the template's font size. */
const MAX_CHARS = 42;
/** Longest time one caption stays on screen, in seconds. */
const MAX_SECONDS = 3.5;
/** A silence this long starts a new caption, in seconds. */
const PAUSE_SECONDS = 0.6;
/** Shortest time a caption is shown, in seconds, so it can be read. */
const MIN_SECONDS = 0.5;
/** Phrases whose average word confidence is below this are flagged for review. */
const REVIEW_BELOW = 0.5;

// Includes the Devanagari danda, which ends sentences in Hindi.
const SENTENCE_END = /[.!?।]$/;

const SCRIPTS: Record<string, string> = { hi: "Deva", mr: "Deva", gu: "Gujr" };

/** ISO 15924 script for a detected language; Latin for anything not listed. */
export function scriptFor(language: string): string {
  return SCRIPTS[language] ?? "Latn";
}

function phrases(words: Word[]): Word[][] {
  const groups: Word[][] = [];
  let current: Word[] = [];
  for (const word of words) {
    const first = current[0];
    const previous = current.at(-1);
    if (first && previous) {
      const text = current.map((w) => w.text).join(" ");
      const tooLong = text.length + 1 + word.text.length > MAX_CHARS;
      const tooSlow = word.end - first.start > MAX_SECONDS;
      const paused = word.start - previous.end > PAUSE_SECONDS;
      if (tooLong || tooSlow || paused || SENTENCE_END.test(previous.text)) {
        groups.push(current);
        current = [];
      }
    }
    current.push(word);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Turns recognised words into caption segments: short phrases that follow the
 * speech, never overlap, and stay inside the reel.
 */
export function wordsToSegments(
  words: Word[],
  fps: Rational,
  durationFrames: number,
  nextId: () => string,
): CaptionSegment[] {
  const toFrame = (seconds: number) => usToFrame(Math.max(0, Math.round(seconds * 1_000_000)), fps);
  const minFrames = toFrame(MIN_SECONDS);
  const segments: CaptionSegment[] = [];

  for (const group of phrases(words)) {
    const previousEnd = segments.at(-1)?.endFrame ?? 0;
    const startFrame = Math.max(toFrame(group[0]!.start), previousEnd);
    if (startFrame >= durationFrames) break;
    const spokenEnd = toFrame(group.at(-1)!.end);
    const endFrame = Math.min(Math.max(spokenEnd, startFrame + minFrames), durationFrames);
    const confidence = group.reduce((sum, w) => sum + w.probability, 0) / group.length;
    segments.push({
      id: nextId(),
      text: group.map((w) => w.text).join(" "),
      startFrame,
      endFrame,
      reviewStatus: confidence < REVIEW_BELOW ? "needs-review" : "accepted",
    });
  }
  return segments;
}
