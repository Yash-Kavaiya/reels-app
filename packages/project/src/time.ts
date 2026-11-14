/** Frame rate as a rational so 30000/1001 style rates stay exact. */
export type Rational = { num: number; den: number };

export const FPS_30: Rational = { num: 30, den: 1 };

const US_PER_SECOND = 1_000_000;

function assertNonNegativeInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${value}`);
  }
}

/**
 * The single rounding rule for the whole product: nearest frame, half up.
 * Applying the same rule to both ends of a range keeps adjacent ranges adjacent.
 */
export function usToFrame(us: number, fps: Rational): number {
  assertNonNegativeInt(us, "us");
  return Math.floor((us * fps.num) / (fps.den * US_PER_SECOND) + 0.5);
}

export function frameToUs(frame: number, fps: Rational): number {
  assertNonNegativeInt(frame, "frame");
  return Math.floor((frame * fps.den * US_PER_SECOND) / fps.num + 0.5);
}

export type ClipRange = {
  sourceStartUs: number;
  sourceEndUs: number;
  outputStartFrame: number;
  outputEndFrame: number;
};

/**
 * Maps a source timestamp to an output frame. Ranges are start inclusive, end
 * exclusive; returns null when the timestamp is outside the clip.
 */
export function mapSourceUsToOutputFrame(
  clip: ClipRange,
  sourceUs: number,
  fps: Rational,
): number | null {
  if (sourceUs < clip.sourceStartUs || sourceUs >= clip.sourceEndUs) return null;
  const frame = clip.outputStartFrame + usToFrame(sourceUs - clip.sourceStartUs, fps);
  return Math.min(frame, clip.outputEndFrame - 1);
}
