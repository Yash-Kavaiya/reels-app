import type { Project } from "@reelcraft/project";

/** Input props shared by the browser preview and the server render. */
export type ReelProps = {
  project: Project;
  /** Playable URL for each asset id, resolved by the caller (object URL, presigned URL, ...). */
  assetUrls: Record<string, string>;
  /**
   * Optional pre-blurred, darkened copy of an asset for the blur-fit background.
   * The render worker supplies these because CSS blur is slow without a GPU;
   * the browser preview omits them and blurs with CSS instead.
   */
  backgroundUrls?: Record<string, string>;
  /**
   * Overlay-only mode for the fast export: composition frame i shows just the
   * text layers of project frame overlayFrames[i], on a transparent background.
   * FFmpeg composites the video underneath.
   */
  overlayFrames?: number[];
};
