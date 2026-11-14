/**
 * Look of the blur-fit background. Shared by the CSS preview and the FFmpeg
 * pre-blur in the render worker so both produce the same picture.
 */
export const BLUR_BACKGROUND = { blurPx: 48, brightness: 0.55, scale: 1.15 } as const;

export type TextSlot = { kind: "text"; label: string; maxLines: number; minFontSize: number };

export type TemplateDefinition = {
  id: string;
  version: number;
  name: string;
  bestUse: string;
  aspectRatios: ("9:16" | "1:1" | "16:9")[];
  durationSeconds: { min: number; max: number };
  slots: Record<string, TextSlot>;
  styleTokens: Record<string, string>;
};

export const CLEAN_EDUCATION: TemplateDefinition = {
  id: "clean-education",
  version: 1,
  name: "Clean education",
  bestUse: "Tutorials and course clips",
  aspectRatios: ["9:16"],
  durationSeconds: { min: 5, max: 180 },
  slots: {
    headline: { kind: "text", label: "Headline", maxLines: 2, minFontSize: 56 },
    callToAction: { kind: "text", label: "Call to action", maxLines: 1, minFontSize: 44 },
  },
  styleTokens: {
    accent: "#2563eb",
    surface: "#0b1220",
    text: "#ffffff",
    captionBackground: "rgba(11, 18, 32, 0.82)",
  },
};

export const TEMPLATES: Record<string, TemplateDefinition> = {
  [CLEAN_EDUCATION.id]: CLEAN_EDUCATION,
};
