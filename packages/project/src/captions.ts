import type { CaptionTrack } from "./schema";
import { frameToUs, type Rational } from "./time";

type Separator = "," | ".";

function timestamp(frame: number, fps: Rational, separator: Separator): string {
  const ms = Math.round(frameToUs(frame, fps) / 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(ms % 1000, 3)}`;
}

function cues(track: CaptionTrack, fps: Rational, separator: Separator, numbered: boolean): string {
  return track.segments
    .map((segment, index) => {
      const start = timestamp(segment.startFrame, fps, separator);
      const end = timestamp(segment.endFrame, fps, separator);
      const number = numbered ? `${index + 1}\n` : "";
      return `${number}${start} --> ${end}\n${segment.text}\n`;
    })
    .join("\n");
}

/** SubRip text. Write the result as UTF-8. */
export function toSrt(track: CaptionTrack, fps: Rational): string {
  return cues(track, fps, ",", true);
}

/** WebVTT text. Write the result as UTF-8. */
export function toVtt(track: CaptionTrack, fps: Rational): string {
  return `WEBVTT\n\n${cues(track, fps, ".", false)}`;
}
