import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/** Per-glyph fallback: Latin, then Devanagari, then Gujarati. */
export const FONT_STACK = `"Noto Sans", "Noto Sans Devanagari", "Noto Sans Gujarati", sans-serif`;

const FILES: [family: string, prefix: string][] = [
  ["Noto Sans", "noto-sans-latin"],
  ["Noto Sans Devanagari", "noto-sans-devanagari-devanagari"],
  ["Noto Sans Gujarati", "noto-sans-gujarati-gujarati"],
];

let loading: Promise<void> | null = null;

/** Loads the bundled fonts from /fonts. Safe to call more than once. */
export function loadTemplateFonts(): Promise<void> {
  loading ??= Promise.all(
    FILES.flatMap(([family, prefix]) =>
      ["400", "700"].map((weight) =>
        loadFont({
          family,
          weight,
          url: staticFile(`fonts/${prefix}-${weight}-normal.woff2`),
        }),
      ),
    ),
  ).then(() => undefined);
  return loading;
}
